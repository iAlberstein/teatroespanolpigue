import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext.jsx';
import SalaPrincipalGrid from '../components/SalaPrincipalGrid.jsx';
import { apiFetch, apiAuthFetch, API_URL } from '../lib/api';
import { formatSeatLocation } from '../lib/seatFormatter';

export default function Detalle(){
  const { id } = useParams();
  const { user, token, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [reservation, setReservation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const socketRef = useRef(null);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [selectedSeatIds, setSelectedSeatIds] = useState(new Set());
  const [heldByOtherSeatIds, setHeldByOtherSeatIds] = useState(new Set());
  const [selectedPalcosLabels, setSelectedPalcosLabels] = useState(new Set());
  const [heldByOtherPalcosLabels, setHeldByOtherPalcosLabels] = useState(new Set());
  const [soldSeatIds, setSoldSeatIds] = useState(new Set());
  const [soldPalcosLabels, setSoldPalcosLabels] = useState(new Set());
  const [pullmanSelected, setPullmanSelected] = useState(0);
  const [pullmanAvailable, setPullmanAvailable] = useState(92);
  const [syncing, setSyncing] = useState(false);
  const expiredHandledRef = useRef(false);
  const creatingReservationRef = useRef(false); // Flag para prevenir creaciones duplicadas

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
      if (socketRef.current && selectedSession) {
        socketRef.current.emit('pullman_clear', { sessionId: selectedSession });
        socketRef.current.emit('seat_clear', { sessionId: selectedSession });
        socketRef.current.emit('palco_clear', { sessionId: selectedSession });
      }
      setSelectedSeatIds(new Set());
      setHeldByOtherSeatIds(new Set());
      setSelectedPalcosLabels(new Set());
      setHeldByOtherPalcosLabels(new Set());
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

  // Establish socket once (mount), register listeners
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(API_URL);
    }
    const s = socketRef.current;

    const onExpired = ({ reservation_id }) => {
      if (reservation && reservation.id === reservation_id) {
        handleExpire();
      }
    };
    const onCreated = () => {};
    const onCanceled = ({ reservation_id }) => {
      if (reservation && reservation.id === reservation_id) {
        setReservation(null);
        setTimeLeft(0);
      }
    };
    s.on('reservation_expired', onExpired);
    s.on('reservation_created', onCreated);
    s.on('reservation_canceled', onCanceled);

    // Pullman realtime sync
    const onPullmanUpdated = ({ available, capacity }) => {
      setPullmanAvailable(available);
    };
    const onPullmanConfirmed = ({ selected, available, capacity }) => {
      setPullmanSelected(selected);
      setPullmanAvailable(available);
    };
    s.on('pullman_updated', onPullmanUpdated);
    s.on('pullman_confirmed', onPullmanConfirmed);

    // Seats realtime locks
    const onSeatHeld = ({ seatId, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedSeatIds(prev => new Set(prev).add(seatId));
      } else {
        setHeldByOtherSeatIds(prev => new Set(prev).add(seatId));
      }
    };
    const onSeatReleased = ({ seatId, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
      } else {
        setHeldByOtherSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
      }
    };
    const onSeatDenied = ({ seatId }) => {
      // optional UI feedback; for ahora, nada
    };
    s.on('seat_held', onSeatHeld);
    s.on('seat_released', onSeatReleased);
    s.on('seat_denied', onSeatDenied);

    // Palcos realtime locks
    const onPalcoHeld = ({ palco, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedPalcosLabels(prev => new Set(prev).add(palco));
      } else {
        setHeldByOtherPalcosLabels(prev => new Set(prev).add(palco));
      }
    };
    const onPalcoReleased = ({ palco, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
      } else {
        setHeldByOtherPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
      }
    };
    const onPalcoDenied = ({ palco }) => {};
    s.on('palco_held', onPalcoHeld);
    s.on('palco_released', onPalcoReleased);
    s.on('palco_denied', onPalcoDenied);

    // SOLD realtime
    const onSeatSold = ({ seatId }) => {
      setSoldSeatIds(prev => new Set(prev).add(seatId));
      setSelectedSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
      setHeldByOtherSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
    };
    const onPalcoSold = ({ palco }) => {
      setSoldPalcosLabels(prev => new Set(prev).add(palco));
      setSelectedPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
      setHeldByOtherPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
    };
    const onPullmanSold = ({ sold }) => {
      // Recompute available from snapshot calculation style: available already pushed by backend via pullman_updated, but keep in sync if only sold arrives
      // No-op; rely on pullman_updated emitted by backend after sold. This handler kept for completeness.
    };
    s.on('seat_sold', onSeatSold);
    s.on('palco_sold', onPalcoSold);
    s.on('pullman_sold', onPullmanSold);

    // Restoration: cuando vuelve el usuario y tiene reserva activa
    const onReservationRestored = (restoredReservation) => {
      console.log('[DEBUG] Reservation restored:', restoredReservation);
      setReservation(restoredReservation);
      // Restaurar selecciones visuales
      const items = Array.isArray(restoredReservation.items) ? restoredReservation.items : [];
      const seatCodes = items.filter(it => it.type === 'butaca' && it.seat_code).map(it => it.seat_code);
      const palcoCodes = items.filter(it => it.type === 'palco' && it.seat_code).map(it => it.seat_code);
      const pullman = items.find(it => it.type === 'pullman');
      
      if (seatCodes.length > 0) {
        setSelectedSeatIds(new Set(seatCodes));
        // Limpiar estas butacas de "held by other" porque ahora son mías
        setHeldByOtherSeatIds(prev => {
          const updated = new Set(prev);
          seatCodes.forEach(code => updated.delete(code));
          return updated;
        });
      }
      if (palcoCodes.length > 0) {
        setSelectedPalcosLabels(new Set(palcoCodes));
        // Limpiar estos palcos de "held by other"
        setHeldByOtherPalcosLabels(prev => {
          const updated = new Set(prev);
          palcoCodes.forEach(code => updated.delete(code));
          return updated;
        });
      }
      if (pullman && pullman.quantity > 0) {
        setPullmanSelected(pullman.quantity);
      }
    };
    s.on('reservation_restored', onReservationRestored);

    return () => {
      s.off('reservation_expired', onExpired);
      s.off('reservation_created', onCreated);
      s.off('reservation_canceled', onCanceled);
      s.off('pullman_updated', onPullmanUpdated);
      s.off('pullman_confirmed', onPullmanConfirmed);
      s.off('seat_held', onSeatHeld);
      s.off('seat_released', onSeatReleased);
      s.off('seat_denied', onSeatDenied);
      s.off('palco_held', onPalcoHeld);
      s.off('palco_released', onPalcoReleased);
      s.off('palco_denied', onPalcoDenied);
      s.off('seat_sold', onSeatSold);
      s.off('palco_sold', onPalcoSold);
      s.off('pullman_sold', onPullmanSold);
      s.off('reservation_restored', onReservationRestored);
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Join session when selectedSession is available
  useEffect(() => {
    if (socketRef.current && selectedSession) {
      socketRef.current.emit('join_session', {
        sessionId: selectedSession,
        userId: user?.id || null
      });
    }
  }, [selectedSession, user]);

  // Load availability snapshot when session changes
  useEffect(() => {
    if (!selectedSession) {
      // Clear all state when no session selected
      setSoldSeatIds(new Set());
      setSoldPalcosLabels(new Set());
      setHeldByOtherSeatIds(new Set());
      setHeldByOtherPalcosLabels(new Set());
      setSelectedSeatIds(new Set());
      setSelectedPalcosLabels(new Set());
      setPullmanSelected(0);
      setPullmanAvailable(92);
      return;
    }
    
    const s = socketRef.current;
    if (!s || !s.id) {
      // Socket not ready yet, wait for next render
      return;
    }
    
    (async () => {
      try {
        console.log('[DETALLE] Loading availability for session:', selectedSession);
        const r = await apiFetch(`/api/sessions/${selectedSession}/availability`);
        if (!r.ok) return;
        const data = await r.json();
        console.log('[DETALLE] Availability loaded:', data);
        const myId = s.id;
        const otherHeldSeats = new Set((data.heldSeats || []).filter(x => x && x.by !== myId).map(x => x.seatId));
        const otherHeldPalcos = new Set((data.heldPalcos || []).filter(x => x && x.by !== myId).map(x => x.palco));
        setHeldByOtherSeatIds(otherHeldSeats);
        setHeldByOtherPalcosLabels(otherHeldPalcos);
        setSoldSeatIds(new Set(data.soldSeats || []));
        setSoldPalcosLabels(new Set(data.soldPalcos || []));
        setPullmanAvailable(data.pullman?.available ?? 92);
      } catch (err) {
        console.error('[DETALLE] Error loading availability:', err);
      }
    })();
  }, [selectedSession, socketRef.current?.id]);

  useEffect(() => {
    if (!reservation?.expires_at) return;
    expiredHandledRef.current = false;
    const end = new Date(reservation.expires_at).getTime();
    // initialize immediately to avoid transient 0 triggering expire
    const initial = Math.max(0, Math.floor((end - Date.now())/1000));
    setTimeLeft(initial);
    const i = setInterval(() => {
      const diff = Math.max(0, Math.floor((end - Date.now())/1000));
      setTimeLeft(diff);
      if (diff === 0) {
        clearInterval(i);
        handleExpire();
      }
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

  // Use selectedSession directly instead of firstSessionId

  const onPullmanChange = (delta) => {
    // Check authentication first
    if (!checkAuth()) return;
    
    if (!socketRef.current || !selectedSession) return;
    socketRef.current.emit('pullman_change', { sessionId: selectedSession, delta });
  };

  const buildItems = () => {
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

  // Auto-reserve: on any selection change, create or update reservation
  const syncSeqRef = useRef(0);
  useEffect(() => {
    const items = buildItems();
    console.log('[DEBUG] Auto-reserve useEffect triggered. items:', items, 'selectedSession:', selectedSession, 'reservation:', reservation);
    if (!selectedSession) return;
    if (items.length === 0) {
      // Auto-cancel cuando la selección queda vacía
      if (reservation && !syncing) {
        (async () => {
          // liberar pullman en tiempo real
          if (socketRef.current && selectedSession) {
            socketRef.current.emit('pullman_clear', { sessionId: selectedSession });
            socketRef.current.emit('seat_clear', { sessionId: selectedSession });
            socketRef.current.emit('palco_clear', { sessionId: selectedSession });
          }
          // limpiar asientos en UI
          setSelectedSeatIds(new Set());
          setHeldByOtherSeatIds(new Set());
          setSelectedPalcosLabels(new Set());
          setHeldByOtherPalcosLabels(new Set());
          await cancelReservation();
        })();
      }
      return;
    }
    if (syncing) return;
    // Si ya estamos creando una reserva, no crear otra
    if (!reservation && creatingReservationRef.current) return;
    
    const mySeq = ++syncSeqRef.current;
    const sync = async () => {
      try {
        setSyncing(true);
        if (!reservation) {
          // Activar flag antes de crear
          creatingReservationRef.current = true;
          
          // Check auth before creating reservation
          if (!checkAuth()) {
            setSyncing(false);
            creatingReservationRef.current = false;
            return;
          }
          
          // Verificar si ya existe una reserva activa antes de crear
          if (user?.id) {
            const checkRes = await apiAuthFetch(`/api/reservations?user_id=${user.id}&session_id=${selectedSession}&status=active`, {}, token);
            if (checkRes.ok) {
              const existingReservations = await checkRes.json();
              if (Array.isArray(existingReservations) && existingReservations.length > 0) {
                const existing = existingReservations[0];
                console.log('[DEBUG] Found existing active reservation:', existing);
                setReservation(existing);
                creatingReservationRef.current = false;
                // Actualizar con los items actuales
                await apiFetch(`/api/reservations/${existing.id}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-socket-id': socketRef.current?.id || ''
                  },
                  body: JSON.stringify({ items })
                }).catch(()=>{});
                return;
              }
            }
          }
          
          // create new reservation and start timer immediately
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
          if (res.status === 409) {
            const body = await res.json().catch(()=>({}));
            if (body?.reservation) {
              setReservation(body.reservation);
              creatingReservationRef.current = false; // Desactivar flag
              // actualizar inmediatamente con los items vigentes
              await apiFetch(`/api/reservations/${body.reservation.id}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'x-socket-id': socketRef.current?.id || ''
                },
                body: JSON.stringify({ items })
              }).catch(()=>{});
              return;
            }
            if (body?.reservation_id) {
              // fallback antiguo
              const r2 = await apiFetch(`/api/reservations/${body.reservation_id}`);
              if (r2.ok) {
                const existing = await r2.json();
                setReservation(existing);
                creatingReservationRef.current = false; // Desactivar flag
                await apiFetch(`/api/reservations/${body.reservation_id}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-socket-id': socketRef.current?.id || ''
                  },
                  body: JSON.stringify({ items })
                }).catch(()=>{});
              }
              return;
            }
            console.error('[DEBUG] POST /api/reservations 409 without reservation info');
            creatingReservationRef.current = false; // Desactivar flag en error
            return;
          }
          if (!res.ok) {
            console.error('[DEBUG] POST /api/reservations failed:', res.status, await res.text());
            creatingReservationRef.current = false; // Desactivar flag en error
            return;
          }
          const data = await res.json();
          console.log('[DEBUG] Reservation created:', data);
          setReservation(data);
          creatingReservationRef.current = false; // Desactivar flag después de crear
        } else {
          const res = await apiFetch(`/api/reservations/${reservation.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-socket-id': socketRef.current?.id || ''
            },
            body: JSON.stringify({ items })
          });
          if (res.status === 409) {
            // backend says reservation not active (likely expired) -> expire locally now
            await handleExpire();
            return;
          }
          if (!res.ok) return;
          const data = await res.json();
          console.log('[DEBUG] Reservation updated:', data);
          if (mySeq === syncSeqRef.current) setReservation(data);
        }
      } finally {
        setSyncing(false);
        // Solo desactivar si la reserva ya existe (fue creada exitosamente)
        if (reservation) {
          creatingReservationRef.current = false;
        }
      }
    };
    sync();
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeatIds, selectedPalcosLabels, pullmanSelected, selectedSession]);

  const startReservation = async () => {
    if (!selectedSession) return;
    if (selectedCells.size === 0 && selectedPalcos.size === 0 && pullmanSelected === 0) {
      alert('Seleccioná al menos una butaca o un palco en la grilla.');
      return;
    }
    const items = [];
    // butacas individuales
    for (const key of Array.from(selectedCells)) {
      const [r, c, rowLetter, seat] = key.split(':');
      items.push({ type: 'butaca', section: 'Platea General', seat_code: `${rowLetter}${seat}` });
    }
    // palcos (packs)
    for (const p of Array.from(selectedPalcos)) {
      // p form: "<label>@r,c" e.g. "PB 12@14,32"
      const label = p.split('@')[0]; // PB 12 | PA 14
      const isPB = /^PB/i.test(label);
      const pack = isPB ? 4 : 2;
      items.push({ type: 'palco', section: label.startsWith('PB') ? 'Palcos Bajos' : 'Palcos Altos', seat_code: label, quantity: pack });
    }
    // pullman (sin numeración)
    if (pullmanSelected > 0) {
      items.push({ type: 'pullman', section: 'Pullman', quantity: pullmanSelected });
    }
    const res = await apiFetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: selectedSession, items })
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({error:'Unknown'}));
      alert('No se pudo crear la reserva: ' + (e.error || res.status));
      return;
    }
    const data = await res.json();
    setReservation(data);
  };

  const cancelReservation = async () => {
    if (!reservation) return;
    await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' });
    setReservation(null);
    setTimeLeft(0);
    // limpiar carrito local
    setSelectedSeatIds(new Set());
    setHeldByOtherSeatIds(new Set());
    setSelectedPalcosLabels(new Set());
    setHeldByOtherPalcosLabels(new Set());
    setPullmanSelected(0);
    // limpiar pullman vía socket para sincronizar disponibles globales
    if (socketRef.current && selectedSession) {
      socketRef.current.emit('pullman_clear', { sessionId: selectedSession });
    }
  };

  const fmt = (s) => {
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const r = (s%60).toString().padStart(2,'0');
    return `${m}:${r}`;
  };

  const payWithMP = async () => {
    if (!reservation) return;
    
    if (!checkAuth()) return;
    
    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-socket-id': socketRef.current?.id || ''
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const res = await apiFetch('/api/payments/preference', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reservation_id: reservation.id })
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Error al crear preferencia: ' + (data?.error || res.status));
        return;
      }
      if (data.warning) {
        alert('Configurar MP_ACCESS_TOKEN en backend .env para habilitar Checkout Pro.');
        return;
      }
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert('No se pudo obtener init_point');
      }
    } catch (e) {
      alert('Error de red creando preferencia');
    }
  };

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
      
      {/* Referencias arriba */}
      {selectedSession && (
        <>
        <div style={{ marginBottom: 12, fontSize: 12 }}>
        <div style={{ marginBottom: 6, fontWeight: 600 }}>Sectores</div>
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <span style={{ background:'#a8d8a8', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Platea General</span>
          <span style={{ background:'#8fbc8f', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Palcos Bajos</span>
          <span style={{ background:'#6b8e6b', padding:'2px 6px', borderRadius:4, marginRight:6, color:'#fff' }}>Palcos Altos</span>
          <span style={{ background:'#c0c0c0', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Pullman</span>
        </div>
        <div style={{ marginBottom: 6, fontWeight: 600 }}>Estado de butaca</div>
        <div>
          <span style={{ background:'#ffd700', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Seleccionada</span>
          <span style={{ background:'#9370db', padding:'2px 6px', borderRadius:4, marginRight:6, color:'#fff' }}>Reservada</span>
          <span style={{ background:'#808080', padding:'2px 6px', borderRadius:4, marginRight:6, color:'#fff' }}>Vendida</span>
        </div>
      </div>
      <div style={{ display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div>
          <SalaPrincipalGrid
            selectedSeatIds={selectedSeatIds}
            heldByOtherSeatIds={heldByOtherSeatIds}
            soldSeatIds={soldSeatIds}
            selectedPalcosLabels={selectedPalcosLabels}
            heldByOtherPalcosLabels={heldByOtherPalcosLabels}
            soldPalcosLabels={soldPalcosLabels}
            pullmanSelected={pullmanSelected}
            pullmanAvailable={pullmanAvailable}
            onPullmanChange={onPullmanChange}
            onToggleSeat={({ r, c, val, row }) => {
              // Check authentication first
              if (!checkAuth()) return;
              
              if (!socketRef.current || !selectedSession) return;
              // Prevent new holds if reservation expired
              const end = reservation?.expires_at ? new Date(reservation.expires_at).getTime() : null;
              if (reservation && end && Date.now() >= end) { handleExpire(); return; }
              const seatId = `${row || ''}${val}`;
              // Optimistic local toggle to ensure auto-reserve kicks in
              setSelectedSeatIds(prev => {
                const n = new Set(prev);
                if (n.has(seatId)) n.delete(seatId); else n.add(seatId);
                return n;
              });
              socketRef.current.emit('seat_toggle', { sessionId: selectedSession, seatId });
            }}
            onTogglePalco={({ label }) => {
              // Check authentication first
              if (!checkAuth()) return;
              
              if (!socketRef.current || !selectedSession) return;
              const end = reservation?.expires_at ? new Date(reservation.expires_at).getTime() : null;
              if (reservation && end && Date.now() >= end) { handleExpire(); return; }
              // Optimistic local toggle for palcos
              setSelectedPalcosLabels(prev => {
                const n = new Set(prev);
                if (n.has(label)) n.delete(label); else n.add(label);
                return n;
              });
              socketRef.current.emit('palco_toggle', { sessionId: selectedSession, palco: label });
            }}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Carrito</div>
          {reservation && (
            <div style={{ marginBottom: 8, fontSize: 13 }}>Tiempo restante: <strong>{fmt(timeLeft)}</strong></div>
          )}
          <ul>
            {Array.from(selectedSeatIds).map(sid => {
              return <li key={sid}>{formatSeatLocation(sid, 'butaca')}</li>;
            })}
            {Array.from(selectedPalcosLabels).map(label => {
              const pack = /^PB/i.test(label) ? 4 : 2;
              return <li key={label}>{formatSeatLocation(label, 'palco')} (pack {pack})</li>;
            })}
            {pullmanSelected > 0 && (
              <li>Pullman: {pullmanSelected} {pullmanSelected === 1 ? 'lugar' : 'lugares'} - {formatSeatLocation(null, 'pullman')}</li>
            )}
          </ul>
          {reservation && (
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button onClick={cancelReservation}>Cancelar reserva</button>
              <button onClick={payWithMP} style={{ background:'#009EE3', color:'#fff', border:'none', padding:'6px 10px', borderRadius:4 }}>Pagar con Mercado Pago</button>
            </div>
          )}
        </div>
      </div>
      </>
      )}
      
      {/* Debug info opcional: quitar en producción si no lo necesitás */}
      {/* <h3>Sesiones</h3>
      <pre>{JSON.stringify(sessions, null, 2)}</pre>
      <h3>Reserva actual</h3>
      <pre>{JSON.stringify(reservation, null, 2)}</pre> */}
    </div>
  );
}
