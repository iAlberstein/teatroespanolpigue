import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import SeatSelection from '../components/SeatSelection.jsx';
import BoxOfficeReferences from '../components/BoxOfficeReferences.jsx';
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
  
  // Discount state
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);

  // Responsive check
  const isWideLayout = typeof window !== 'undefined' && window.innerWidth >= 1200;

  const defaultPricing = {
    platea_general: 5000,
    palcos_bajos: 10000,
    palcos_altos: 8000,
    pullman: 3000
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(Number(amount || 0));
  };

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
        }
        
        if (!res.ok) {
          const e = await res.json().catch(()=>({}));
          if (e.error === 'seat_not_available') {
            creatingReservationRef.current = false;
            return;
          }
          console.error('[Reservation] Failed to create:', e);
          creatingReservationRef.current = false;
          return;
        }
        
        const data = await res.json();
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
    
    try {
      // Delete reservation from backend
      await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' });
      
      // Clear reservation state
      setReservation(null);
      setTimeLeft(0);
      
      // Clear selection in SeatSelection component using ref
      if (clearSelectionRef.current) {
        clearSelectionRef.current();
      }
      
    } catch (err) {
      console.error('[Reservation] Error cancelling:', err);
      alert('Error al cancelar la reserva');
    }
  };

  const fmt = (s) => {
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const r = (s%60).toString().padStart(2,'0');
    return `${m}:${r}`;
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    
    setValidatingDiscount(true);
    setDiscountError('');
    
    try {
      const res = await apiFetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: discountCode.trim(),
          show_id: id 
        })
      });
      
      if (res.ok) {
        const discount = await res.json();
        setAppliedDiscount(discount);
        setDiscountError('');
      } else {
        const error = await res.json();
        setDiscountError(error.message || 'Código inválido');
        setAppliedDiscount(null);
      }
    } catch (err) {
      setDiscountError('Error al validar cupón');
      setAppliedDiscount(null);
    } finally {
      setValidatingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError('');
  };

  const payWithMP = async () => {
    if (!reservation) return;
    try {
      const r = await apiFetch('/api/payments/preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reservation_id: reservation.id,
          discount_id: appliedDiscount?.id || null
        })
      });
      
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}));
        console.error('[MP] Error creating preference:', errorData);
        alert('Error al crear la preferencia de pago. Por favor, intentá de nuevo.');
        return;
      }
      
      const data = await r.json();
      
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        alert('No se pudo obtener la URL de pago. Verificá la configuración de Mercado Pago.');
      }
    } catch (e) {
      console.error('[MP] Network error:', e);
      alert('Error de red al crear la preferencia. Por favor, intentá de nuevo.');
    }
  };

  // Track current selection state
  const [currentSelection, setCurrentSelection] = useState({
    selectedSeatIds: new Set(),
    selectedPalcosLabels: new Set(),
    pullmanSelected: 0,
    socketRef: null
  });

  // Store clearSelection function in a ref for stable access
  const clearSelectionRef = useRef(null);

  // Handle selection changes from SeatSelection component
  const handleSeatSelectionChange = (selection) => {
    setCurrentSelection(selection);
    // Update ref with latest clearSelection
    if (selection.clearSelection) {
      clearSelectionRef.current = selection.clearSelection;
    }
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

  // Calculate prices and total
  const calculatePrices = () => {
    const pricing = currentSelection.pricing || defaultPricing;

    const items = [];
    let subtotal = 0;

    // Seats
    Array.from(currentSelection.selectedSeatIds).forEach(sid => {
      const price = Number(pricing.platea_general || 5000);
      items.push({
        type: 'butaca',
        label: formatSeatLocation(sid, 'butaca'),
        price,
        quantity: 1
      });
      subtotal += price;
    });

    // Palcos
    Array.from(currentSelection.selectedPalcosLabels).forEach(label => {
      const isPB = /^PB/i.test(label);
      const price = isPB ? Number(pricing.palcos_bajos || 10000) : Number(pricing.palcos_altos || 8000);
      items.push({
        type: 'palco',
        label: formatSeatLocation(label, 'palco'),
        price,
        quantity: 1
      });
      subtotal += price;
    });

    // Pullman
    if (currentSelection.pullmanSelected > 0) {
      const price = Number(pricing.pullman || 3000);
      items.push({
        type: 'pullman',
        label: 'Pullman',
        price,
        quantity: currentSelection.pullmanSelected
      });
      subtotal += price * currentSelection.pullmanSelected;
    }

    // Apply discount FIRST (before service charge)
    let discountAmount = 0;
    let subtotalAfterDiscount = subtotal;
    
    if (appliedDiscount) {
      if (appliedDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
      } else if (appliedDiscount.type === 'fixed') {
        discountAmount = Math.round(appliedDiscount.value);
      }
      // Ensure discount doesn't exceed subtotal
      discountAmount = Math.min(discountAmount, subtotal);
      subtotalAfterDiscount = subtotal - discountAmount;
    }
    
    // Service charge 10% applied AFTER discount
    const serviceCharge = Math.round(subtotalAfterDiscount * 0.10);
    const total = subtotalAfterDiscount + serviceCharge;

    return { items, subtotal, serviceCharge, discountAmount, total };
  };

  const { items: cartItems, subtotal: cartSubtotal, serviceCharge: cartServiceCharge, discountAmount: cartDiscountAmount, total: cartTotal } = calculatePrices();

  // Sidebar content for spectator mode
  const spectatorSidebar = (
    <div style={{ minWidth: 260 }}>
      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 16 }}>🛒 Carrito</div>
      {reservation && (
        <div style={{ marginBottom: 12, fontSize: 13, padding: 8, background: '#fff3cd', borderRadius: 4 }}>
          ⏱️ Tiempo restante: <strong>{fmt(timeLeft)}</strong>
        </div>
      )}
      
      {cartItems.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14, fontStyle: 'italic' }}>
          Seleccioná tus butacas
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cartItems.map((item, idx) => (
              <li key={idx} style={{ 
                padding: '8px 0', 
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 14
              }}>
                <span>
                  {item.label} {item.type === 'pullman' ? `x${item.quantity}` : (item.quantity > 1 && `x${item.quantity}`)}
                </span>
                <span style={{ fontWeight: 600 }}>
                  ${(item.price * item.quantity).toLocaleString('es-AR')}
                </span>
              </li>
            ))}
          </ul>
          
          {/* Subtotal */}
          <div style={{ 
            marginTop: 12,
            paddingTop: 8,
            borderTop: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14
          }}>
            <span>Subtotal:</span>
            <span>${cartSubtotal.toLocaleString('es-AR')}</span>
          </div>
          
          {/* Discount section */}
          {!appliedDiscount ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#666' }}>
                ¿Tenés un cupón de descuento?
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="CÓDIGO"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    fontSize: 13,
                    textTransform: 'uppercase'
                  }}
                />
                <button
                  onClick={handleApplyDiscount}
                  disabled={!discountCode.trim() || validatingDiscount}
                  style={{
                    padding: '6px 12px',
                    background: discountCode.trim() ? '#28a745' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 13,
                    cursor: discountCode.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: 600
                  }}
                >
                  {validatingDiscount ? '...' : 'Aplicar'}
                </button>
              </div>
              {discountError && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#dc3545' }}>
                  {discountError}
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #eee'
            }}>
              <div style={{ 
                padding: 8,
                background: '#d1fae5',
                border: '1px solid #a7f3d0',
                borderRadius: 4
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                      🎫 {discountCode}
                    </div>
                    <div style={{ fontSize: 11, color: '#059669' }}>
                      {appliedDiscount.type === 'percentage' 
                        ? `${appliedDiscount.value}% descuento` 
                        : `$${appliedDiscount.value} descuento`}
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveDiscount}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#059669',
                      cursor: 'pointer',
                      fontSize: 18,
                      padding: 4
                    }}
                    title="Quitar cupón"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Discount amount */}
          {cartDiscountAmount > 0 && (
            <div style={{ 
              marginTop: 6,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 14,
              color: '#059669',
              fontWeight: 600
            }}>
              <span>Descuento:</span>
              <span>-${cartDiscountAmount.toLocaleString('es-AR')}</span>
            </div>
          )}
          
          {/* Service charge */}
          <div style={{ 
            marginTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            color: '#666'
          }}>
            <span>Cargo por servicio (10%):</span>
            <span>${cartServiceCharge.toLocaleString('es-AR')}</span>
          </div>
          
          {/* Total */}
          <div style={{ 
            marginTop: 12,
            paddingTop: 12,
            borderTop: '2px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 16,
            fontWeight: 700
          }}>
            <span>TOTAL:</span>
            <span>${cartTotal.toLocaleString('es-AR')}</span>
          </div>
        </>
      )}
      
      {reservation && (
        <div style={{ display:'flex', flexDirection: 'column', gap:8, marginTop:16 }}>
          <button 
            onClick={payWithMP} 
            style={{ 
              background:'#009EE3', 
              color:'#fff', 
              border:'none', 
              padding:'12px 16px', 
              borderRadius:6,
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer'
            }}
          >
            💳 Pagar ${cartTotal.toLocaleString('es-AR')}
          </button>
          <button 
            onClick={cancelReservation}
            style={{
              background: '#fff',
              color: '#666',
              border: '1px solid #ddd',
              padding: '8px 12px',
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            ✕ Cancelar reserva
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        padding: !isWideLayout ? '0 0 24px' : '0 5px 24px',
        boxSizing: 'border-box',
        margin: 0,
        overflowX: 'hidden'
      }}
    >
      <h1 style={{ marginBottom: 16 }}>Detalle de espectáculo</h1>
      
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
      <section style={{
        padding: isWideLayout ? 24 : '24px 0',
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)'
      }}>
        {selectedSession && (
          <div
            style={
              isWideLayout
                ? { marginBottom: 16 }
                : { padding: '0 24px', marginBottom: 16 }
            }
          >
            <BoxOfficeReferences
              isWideLayout={isWideLayout}
              pricing={currentSelection.pricing || defaultPricing}
              formatCurrency={formatCurrency}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: isWideLayout ? 'row' : 'column',
            alignItems: isWideLayout ? 'flex-start' : 'stretch',
            gap: 24,
            width: '100%'
          }}
        >
          <div
            style={{
              flex: isWideLayout ? '1 1 0%' : '1 1 auto',
              minWidth: 0,
              width: '100%',
              margin: 0
            }}
          >
            <SeatSelection
              showId={id}
              sessionId={selectedSession}
              userId={user?.id}
              mode="spectator"
              onSelectionChange={handleSeatSelectionChange}
              sidebarContent={null}
            />
          </div>

          <div
            style={{
              flex: isWideLayout ? '0 0 260px' : '1 1 auto',
              maxWidth: isWideLayout ? 280 : '100%',
              width: isWideLayout ? 260 : '100%',
              alignSelf: 'stretch',
              display: 'flex',
              flexDirection: 'column',
              padding: isWideLayout ? 0 : '0 16px'
            }}
          >
            {spectatorSidebar}
          </div>
        </div>
      </section>
    </div>
  );
}
