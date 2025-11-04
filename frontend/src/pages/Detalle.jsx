import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import SeatSelection from '../components/SeatSelection.jsx';
import { apiFetch, apiAuthFetch } from '../lib/api';
import { formatSeatLocation } from '../lib/seatFormatter';

export default function Detalle(){
  const { id } = useParams();
  const { user, token, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const expiredHandledRef = useRef(false);
  const creatingReservationRef = useRef(false);
  const syncSeqRef = useRef(0);

  // Check authentication before allowing reservations
  const checkAuth = () => {
    if (!isAuthenticated) {
      const goToLogin = window.confirm('🔒 Necesitás iniciar sesión para reservar entradas.\n\n¿Querés ir al login ahora?');
      if (goToLogin) {
        navigate('/login');
      }
      return false;
    }
    return true;
  };

  const handleExpire = async () => {
    if (expiredHandledRef.current) return;
    expiredHandledRef.current = true;
    try {
      alert('Tu reserva expiró');
    } catch {}
    try {
      if (reservation) {
        await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' }).catch(()=>{});
      }
      setReservation(null);
      setTimeLeft(0);
    } finally {
      try { window.location.reload(); } catch {}
    }
  };

  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/shows/${id}/sessions`)
      .then(r=>r.json())
      .then(sessions => {
        setSessions(sessions);
        // Auto-select if only one session
        if (sessions.length === 1) {
          setSelectedSession(sessions[0].id);
        } else if (sessions.length > 0) {
          // Don't auto-select, let user choose
          setSelectedSession(null);
        }
      })
      .catch(err => {
        console.error('Error loading sessions:', err);
        setSessions([]);
      });
  }, [id]);

  // Reservation timer
  useEffect(() => {
    if (!reservation?.expires_at) return;
    expiredHandledRef.current = false;
    const end = new Date(reservation.expires_at).getTime();
    const initial = Math.max(0, Math.floor((end - Date.now())/1000));
    setTimeLeft(initial);
    const i = setInterval(() => {
      const diff = Math.max(0, Math.floor((end - Date.now())/1000));
      setTimeLeft(diff);
    }, 1000);
    return () => clearInterval(i);
  }, [reservation]);

  // Local timer hit zero: enforce expiration cleanup
  useEffect(() => {
    const end = reservation?.expires_at ? new Date(reservation.expires_at).getTime() : null;
    if (reservation && timeLeft === 0 && end && Date.now() >= end) {
      handleExpire();
    }
  }, [timeLeft, reservation]);

  const buildItems = (selectedSeatIds, selectedPalcosLabels, pullmanSelected) => {
    const items = [];
    for (const sid of Array.from(selectedSeatIds)) {
      items.push({ type: 'butaca', section: 'Platea General', seat_code: sid });
    }
    for (const label of Array.from(selectedPalcosLabels)) {
      const isPB = /^PB/i.test(label);
      const pack = isPB ? 4 : 2;
      items.push({ type: 'palco', section: label.startsWith('PB') ? 'Palcos Bajos' : 'Palcos Altos', seat_code: label, quantity: pack });
    }
    if (pullmanSelected > 0) {
      items.push({ type: 'pullman', section: 'Pullman', quantity: pullmanSelected });
    }
    return items;
  };

  // Auto-reserve: on any selection change from SeatSelection, create or update reservation
  const handleSelectionChange = async (selectedSeatIds, selectedPalcosLabels, pullmanSelected, socketRef) => {
    const items = buildItems(selectedSeatIds, selectedPalcosLabels, pullmanSelected);
    console.log('[DEBUG] Auto-reserve triggered. items:', items, 'selectedSession:', selectedSession, 'reservation:', reservation);
    
    if (!selectedSession) return;
    if (items.length === 0) {
      // Auto-cancel cuando la selección queda vacía
      if (reservation && !syncing) {
        (async () => {
          // liberar en tiempo real
          if (socketRef.current && selectedSession) {
            socketRef.current.emit('pullman_clear', { sessionId: selectedSession });
            socketRef.current.emit('seat_clear', { sessionId: selectedSession });
            socketRef.current.emit('palco_clear', { sessionId: selectedSession });
          }
          await cancelReservation();
        })();
      }
      return;
    }
    
    // Create or update reservation
    const sync = async () => {
      const mySeq = ++syncSeqRef.current;
      if (syncing) return;
      setSyncing(true);
      try {
        // Check auth before creating reservation
        if (!checkAuth()) {
          setSyncing(false);
          creatingReservationRef.current = false;
          return;
        }
        
        // If reservation exists, update it
        if (reservation && reservation.id) {
          await apiFetch(`/api/reservations/${reservation.id}`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'x-socket-id': socketRef.current?.id || ''
            },
            body: JSON.stringify({ items })
          });
          return;
        }
        
        // Prevent multiple concurrent creation attempts
        if (creatingReservationRef.current) {
          console.log('[DEBUG] Already creating reservation, skipping duplicate');
          return;
        }
        
        creatingReservationRef.current = true;
        
        // Check if user already has active reservation
        if (user?.id) {
          try {
            const checkRes = await apiFetch(`/api/reservations?user_id=${user.id}&session_id=${selectedSession}&status=active`);
            if (checkRes.ok) {
              const existingReservations = await checkRes.json();
              if (Array.isArray(existingReservations) && existingReservations.length > 0) {
                const existing = existingReservations[0];
                console.log('[DEBUG] Found existing active reservation:', existing);
                setReservation(existing);
                creatingReservationRef.current = false;
                // Update with current items
                await apiFetch(`/api/reservations/${existing.id}`, {
                  method: 'PUT',
                  headers: { 
                    'Content-Type': 'application/json',
                    'x-socket-id': socketRef.current?.id || ''
                  },
                  body: JSON.stringify({ items })
                });
                return;
              }
            }
          } catch (err) {
            // Ignore errors checking for existing reservations
            console.log('[DEBUG] No existing reservation found or error checking:', err.message);
          }
        }
        
        // Create new reservation
        const headers = {
          'Content-Type': 'application/json',
          'x-socket-id': socketRef.current?.id || ''
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const res = await apiFetch('/api/reservations', {
          method: 'POST',
          headers,
          body: JSON.stringify({ session_id: selectedSession, items, user_id: user?.id })
        });
        
        // Handle conflict - reservation already exists
        if (res.status === 409) {
          const body = await res.json().catch(()=>({}));
          if (body?.reservation) {
            console.log('[DEBUG] Using existing reservation:', body.reservation.id);
            setReservation(body.reservation);
            creatingReservationRef.current = false;
            // Update immediately with current items
            await apiFetch(`/api/reservations/${body.reservation.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'x-socket-id': socketRef.current?.id || ''
              },
              body: JSON.stringify({ items })
            });
            return;
          }
          
          // Other 409 errors (seat conflicts, etc)
          if (body.error === 'items_conflict' || body.error === 'items_sold') {
            console.warn('[Reservation] Seat conflict:', body);
            creatingReservationRef.current = false;
            return;
          }
        }
        
        if (!res.ok) {
          const e = await res.json().catch(()=>({}));
          if (e.error === 'seat_not_available') {
            console.warn('[Reservation] Seat not available:', e);
            creatingReservationRef.current = false;
            return;
          }
          console.error('[Reservation] Failed to create:', e);
          creatingReservationRef.current = false;
          return;
        }
        
        const data = await res.json();
        console.log('[DEBUG] Reservation created:', data.id);
        setReservation(data);
        creatingReservationRef.current = false;
      } catch(err) {
        console.error('[Reservation sync] error:', err);
        creatingReservationRef.current = false;
      } finally {
        if (mySeq === syncSeqRef.current) {
          setSyncing(false);
        }
        // Only reset flag if reservation was created successfully
        if (reservation) {
          creatingReservationRef.current = false;
        }
      }
    };
    sync();
  };

  const cancelReservation = async () => {
    if (!reservation) return;
    await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' });
    setReservation(null);
    setTimeLeft(0);
  };

  const fmt = (s) => {
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const r = (s%60).toString().padStart(2,'0');
    return `${m}:${r}`;
  };

  const payWithMP = async () => {
    if (!reservation) return;
    try {
      const r = await apiFetch('/api/payments/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: reservation.id })
      });
      const data = await r.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert('No se pudo obtener init_point');
      }
    } catch (e) {
      alert('Error de red creando preferencia');
    }
  };

  // Track current selection state
  const [currentSelection, setCurrentSelection] = useState({
    selectedSeatIds: new Set(),
    selectedPalcosLabels: new Set(),
    pullmanSelected: 0,
    socketRef: null
  });

  // Handle selection changes from SeatSelection component
  const handleSeatSelectionChange = (selection) => {
    setCurrentSelection(selection);
  };

  // Auto-reserve when selection changes
  useEffect(() => {
    // Don't run if no session selected
    if (!selectedSession) return;
    
    handleSelectionChange(
      currentSelection.selectedSeatIds,
      currentSelection.selectedPalcosLabels,
      currentSelection.pullmanSelected,
      currentSelection.socketRef
    );
  }, [currentSelection, selectedSession]);

  // Sidebar content for spectator mode
  const spectatorSidebar = (
    <div style={{ minWidth: 260 }}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>Carrito</div>
      {reservation && (
        <div style={{ marginBottom: 8, fontSize: 13 }}>Tiempo restante: <strong>{fmt(timeLeft)}</strong></div>
      )}
      <ul>
        {Array.from(currentSelection.selectedSeatIds).map(sid => {
          const loc = formatSeatLocation(sid, 'butaca');
          return <li key={sid}>{loc}</li>;
        })}
        {Array.from(currentSelection.selectedPalcosLabels).map(label => {
          const loc = formatSeatLocation(label, 'palco');
          return <li key={label}>{loc}</li>;
        })}
        {currentSelection.pullmanSelected > 0 && <li>Pullman x {currentSelection.pullmanSelected}</li>}
      </ul>
      {reservation && (
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button onClick={cancelReservation}>Cancelar reserva</button>
          <button onClick={payWithMP} style={{ background:'#009EE3', color:'#fff', border:'none', padding:'6px 10px', borderRadius:4 }}>Pagar con Mercado Pago</button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <h1>Detalle de espectáculo</h1>
      
      {/* Session selector (only if multiple sessions) */}
      {sessions.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 16 }}>
            Seleccionar Horario:
          </label>
          <select
            value={selectedSession || ''}
            onChange={(e) => setSelectedSession(e.target.value || null)}
            style={{
              padding: 12,
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: 16,
              minWidth: 300
            }}
          >
            <option value="">-- Seleccionar horario --</option>
            {sessions.map(session => {
              const date = new Date(session.starts_at);
              const dateStr = date.toLocaleDateString('es-AR', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              });
              const timeStr = date.toLocaleTimeString('es-AR', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false
              });
              
              return (
                <option key={session.id} value={session.id}>
                  {dateStr} a las {timeStr}
                </option>
              );
            })}
          </select>
        </div>
      )}
      
      {/* Use shared SeatSelection component */}
      <SeatSelection
        showId={id}
        sessionId={selectedSession}
        userId={user?.id}
        mode="spectator"
        onSelectionChange={handleSeatSelectionChange}
        sidebarContent={spectatorSidebar}
      />
    </div>
  );
}
