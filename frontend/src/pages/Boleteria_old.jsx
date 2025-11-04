import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiAuthFetch, API_URL } from '../lib/api';
import { io } from 'socket.io-client';
import SalaPrincipalGrid from '../components/SalaPrincipalGrid';
import { formatSeatLocation } from '../lib/seatFormatter';

export default function BoxOffice() {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  
  // Seat selection state
  const [selectedSeatIds, setSelectedSeatIds] = useState(new Set());
  const [selectedPalcosLabels, setSelectedPalcosLabels] = useState(new Set());
  const [pullmanSelected, setPullmanSelected] = useState(0);
  const [pullmanAvailable, setPullmanAvailable] = useState(92);
  const [soldSeatIds, setSoldSeatIds] = useState(new Set());
  const [soldPalcosLabels, setSoldPalcosLabels] = useState(new Set());
  const [heldByOtherSeatIds, setHeldByOtherSeatIds] = useState(new Set());
  const [heldByOtherPalcosLabels, setHeldByOtherPalcosLabels] = useState(new Set());
  
  // Customer data
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  // Load shows on mount (same as Cartelera)
  useEffect(() => {
    (async () => {
      try {
        console.log('[BOLETERIA] Fetching shows from /api/shows');
        const res = await apiFetch('/api/shows');
        if (res.ok) {
          const data = await res.json();
          console.log('[BOLETERIA] Shows loaded:', data);
          setShows(data);
        } else {
          console.error('[BOLETERIA] Failed to load shows:', res.status);
        }
      } catch (err) {
        console.error('[BOLETERIA] Error loading shows:', err);
      }
    })();
  }, []);

  // Load sessions when show is selected
  useEffect(() => {
    if (!selectedShow) {
      setSessions([]);
      setSelectedSession(null);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`/api/shows/${selectedShow}/sessions`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
          // Auto-select if only one session
          if (data.length === 1) {
            setSelectedSession(data[0].id);
          }
        }
      } catch (err) {
        console.error('Error loading sessions:', err);
      }
    })();
  }, [selectedShow]);

  // Load availability when session is selected
  useEffect(() => {
    if (!selectedSession) return;
    (async () => {
      try {
        console.log('[DEBUG] Loading availability for session:', selectedSession);
        const res = await apiFetch(`/api/sessions/${selectedSession}/availability`);
        if (res.ok) {
          const data = await res.json();
          console.log('[DEBUG] Availability loaded:', data);
          setSoldSeatIds(new Set(data.soldSeats || []));
          setSoldPalcosLabels(new Set(data.soldPalcos || []));
          setPullmanAvailable(data.pullman?.available ?? 92);
          // Show holds from spectators to avoid selling held seats
          setHeldByOtherSeatIds(new Set(data.heldSeats || []));
          setHeldByOtherPalcosLabels(new Set(data.heldPalcos || []));
        } else {
          console.error('[DEBUG] Failed to load availability:', res.status);
        }
      } catch (err) {
        console.error('Error loading availability:', err);
      }
    })();
  }, [selectedSession]);

  // Socket.IO connection for real-time updates
  useEffect(() => {
    if (!selectedSession) return;
    
    // Clear local selections when changing session
    setSelectedSeatIds(new Set());
    setSelectedPalcosLabels(new Set());
    setPullmanSelected(0);
    
    // Connect socket if not already connected
    if (!socketRef.current) {
      socketRef.current = io(API_URL);
    }
    
    const socket = socketRef.current;
    
    // Join session room
    socket.emit('join_session', { sessionId: selectedSession, userId: null });
    
    // Listen for seat holds from spectators
    const onSeatHeld = ({ seatId, by }) => {
      if (by !== socket.id) {
        setHeldByOtherSeatIds(prev => new Set([...prev, seatId]));
      }
    };
    
    const onSeatReleased = ({ seatId }) => {
      setHeldByOtherSeatIds(prev => {
        const updated = new Set(prev);
        updated.delete(seatId);
        return updated;
      });
    };
    
    const onPalcoHeld = ({ palco, by }) => {
      if (by !== socket.id) {
        setHeldByOtherPalcosLabels(prev => new Set([...prev, palco]));
      }
    };
    
    const onPalcoReleased = ({ palco }) => {
      setHeldByOtherPalcosLabels(prev => {
        const updated = new Set(prev);
        updated.delete(palco);
        return updated;
      });
    };
    
    const onSeatSold = ({ seatId }) => {
      setSoldSeatIds(prev => new Set([...prev, seatId]));
      setHeldByOtherSeatIds(prev => {
        const updated = new Set(prev);
        updated.delete(seatId);
        return updated;
      });
    };
    
    const onPalcoSold = ({ palco }) => {
      setSoldPalcosLabels(prev => new Set([...prev, palco]));
      setHeldByOtherPalcosLabels(prev => {
        const updated = new Set(prev);
        updated.delete(palco);
        return updated;
      });
    };
    
    const onPullmanUpdated = ({ available }) => {
      setPullmanAvailable(available);
    };
    
    socket.on('seat_held', onSeatHeld);
    socket.on('seat_released', onSeatReleased);
    socket.on('palco_held', onPalcoHeld);
    socket.on('palco_released', onPalcoReleased);
    socket.on('seat_sold', onSeatSold);
    socket.on('palco_sold', onPalcoSold);
    socket.on('pullman_updated', onPullmanUpdated);
    
    return () => {
      socket.off('seat_held', onSeatHeld);
      socket.off('seat_released', onSeatReleased);
      socket.off('palco_held', onPalcoHeld);
      socket.off('palco_released', onPalcoReleased);
      socket.off('seat_sold', onSeatSold);
      socket.off('palco_sold', onPalcoSold);
      socket.off('pullman_updated', onPullmanUpdated);
    };
  }, [selectedSession]);

  const handleToggleSeat = ({ r, c, val, row }) => {
    const seatId = `${row || ''}${val}`;
    console.log('[DEBUG] Toggle seat:', seatId, 'row:', row, 'val:', val);
    if (soldSeatIds.has(seatId)) return;
    if (!socketRef.current || !selectedSession) return;
    
    // Emit socket event for real-time sync with correct parameters
    console.log('[BOLETERIA] Emitting seat_toggle:', { sessionId: selectedSession, seatId });
    socketRef.current.emit('seat_toggle', {
      sessionId: selectedSession,
      seatId: seatId
    });
    
    setSelectedSeatIds(prev => {
      const updated = new Set(prev);
      if (updated.has(seatId)) {
        updated.delete(seatId);
      } else {
        updated.add(seatId);
      }
      console.log('[DEBUG] Selected seats after toggle:', Array.from(updated));
      return updated;
    });
  };

  const handleTogglePalco = ({ label }) => {
    if (soldPalcosLabels.has(label)) return;
    if (!socketRef.current || !selectedSession) return;
    
    // Emit socket event for real-time sync with correct parameters
    console.log('[BOLETERIA] Emitting palco_toggle:', { sessionId: selectedSession, palco: label });
    socketRef.current.emit('palco_toggle', {
      sessionId: selectedSession,
      palco: label
    });
    
    setSelectedPalcosLabels(prev => {
      const updated = new Set(prev);
      if (updated.has(label)) {
        updated.delete(label);
      } else {
        updated.add(label);
      }
      return updated;
    });
  };

  const handlePullmanChange = (delta) => {
    if (!socketRef.current || !selectedSession) return;
    
    setPullmanSelected(prev => {
      const newVal = prev + delta;
      if (newVal < 0) return 0;
      if (newVal > pullmanAvailable) return pullmanAvailable;
      
      // Emit socket event for real-time sync
      socketRef.current.emit('pullman_select', {
        sessionId: selectedSession,
        selected: newVal
      });
      
      return newVal;
    });
  };

  const calculateTotal = () => {
    // TODO: Get prices from selected session's pricing_json
    const seatPrice = 5000; // Default price
    const palcoPrice = 10000;
    const pullmanPrice = 3000;
    
    const seatsTotal = selectedSeatIds.size * seatPrice;
    const palcosTotal = selectedPalcosLabels.size * palcoPrice;
    const pullmanTotal = pullmanSelected * pullmanPrice;
    
    return seatsTotal + palcosTotal + pullmanTotal;
  };

  const handleClearSelection = () => {
    // Release all holds via socket
    if (socketRef.current && selectedSession) {
      // Release seats
      for (const seatId of selectedSeatIds) {
        console.log('[BOLETERIA] Releasing seat:', seatId);
        socketRef.current.emit('seat_toggle', {
          sessionId: selectedSession,
          seatId: seatId
        });
      }
      
      // Release palcos
      for (const palco of selectedPalcosLabels) {
        console.log('[BOLETERIA] Releasing palco:', palco);
        socketRef.current.emit('palco_toggle', {
          sessionId: selectedSession,
          palco: palco
        });
      }
      
      // Clear pullman
      if (pullmanSelected > 0) {
        socketRef.current.emit('pullman_select', {
          sessionId: selectedSession,
          selected: 0
        });
      }
    }
    
    setSelectedSeatIds(new Set());
    setSelectedPalcosLabels(new Set());
    setPullmanSelected(0);
  };

  const handleConfirmSale = async () => {
    if (!customerName.trim()) {
      setError('El nombre del cliente es obligatorio');
      return;
    }

    if (selectedSeatIds.size === 0 && selectedPalcosLabels.size === 0 && pullmanSelected === 0) {
      setError('Debe seleccionar al menos una entrada');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(null);

    try {
      // TODO: Get prices from selected session
      const seatPrice = 5000;
      const palcoPrice = 10000;
      const pullmanPrice = 3000;

      const items = [];
      
      // Add seats
      for (const seatId of selectedSeatIds) {
        items.push({
          type: 'butaca',
          seat_code: seatId,
          price: seatPrice
        });
      }
      
      // Add palcos
      for (const palco of selectedPalcosLabels) {
        items.push({
          type: 'palco',
          seat_code: palco,
          price: palcoPrice
        });
      }
      
      // Add pullman
      if (pullmanSelected > 0) {
        items.push({
          type: 'pullman',
          quantity: pullmanSelected,
          price: pullmanPrice
        });
      }

      const res = await apiAuthFetch('/api/tickets/box-office-sale', {
        method: 'POST',
        body: JSON.stringify({
          session_id: selectedSession,
          items,
          customer: {
            name: customerName.trim(),
            email: customerEmail.trim() || null,
            phone: customerPhone.trim() || null
          },
          payment_method: paymentMethod
        })
      }, token);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error al procesar la venta');
      }

      const data = await res.json();
      setSuccess(data);
      
      // Update sold state
      setSoldSeatIds(prev => new Set([...prev, ...selectedSeatIds]));
      setSoldPalcosLabels(prev => new Set([...prev, ...selectedPalcosLabels]));
      if (pullmanSelected > 0) {
        setPullmanAvailable(prev => Math.max(0, prev - pullmanSelected));
      }
      
      // Clear selection and customer data
      handleClearSelection();
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      
    } catch (err) {
      setError(err.message || 'Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  const totalItems = selectedSeatIds.size + selectedPalcosLabels.size + pullmanSelected;
  const total = calculateTotal();

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>🎫 Boletería</h1>

      {/* Show selection */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 18 }}>
          Seleccionar Obra:
        </label>
        <select
          value={selectedShow || ''}
          onChange={(e) => {
            setSelectedShow(e.target.value || null);
            setSelectedSession(null);
            handleClearSelection();
          }}
          style={{
            width: '100%',
            maxWidth: 600,
            padding: 12,
            borderRadius: 6,
            border: '1px solid #ccc',
            fontSize: 16
          }}
        >
          <option value="">-- Seleccionar obra --</option>
          {shows.map(show => (
            <option key={show.id} value={show.id}>
              {show.title}
            </option>
          ))}
        </select>
      </div>

      {/* Session selection (only if multiple sessions) */}
      {sessions.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 18 }}>
            Seleccionar Horario:
          </label>
          <select
            value={selectedSession || ''}
            onChange={(e) => {
              setSelectedSession(e.target.value || null);
              handleClearSelection();
            }}
            style={{
              width: '100%',
              maxWidth: 600,
              padding: 12,
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: 16
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

      {/* Seat selection */}
      {selectedSession && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 16 }}>Seleccionar Butacas</h2>
          <SalaPrincipalGrid
            selectedSeatIds={selectedSeatIds}
            selectedPalcosLabels={selectedPalcosLabels}
            soldSeatIds={soldSeatIds}
            soldPalcosLabels={soldPalcosLabels}
            heldByOtherSeatIds={heldByOtherSeatIds}
            heldByOtherPalcosLabels={heldByOtherPalcosLabels}
            pullmanAvailable={Math.max(0, pullmanAvailable - pullmanSelected)}
            pullmanSelected={pullmanSelected}
            onToggleSeat={handleToggleSeat}
            onTogglePalco={handleTogglePalco}
            onPullmanChange={handlePullmanChange}
          />
          
          {totalItems > 0 && (
            <div style={{ 
              marginTop: 16, 
              padding: 16, 
              background: '#f0f9ff', 
              borderRadius: 8,
              border: '2px solid #0ea5e9'
            }}>
              <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>
                Selección actual: {totalItems} entrada{totalItems !== 1 ? 's' : ''}
              </div>
              
              {/* Detail of selected items */}
              <div style={{ marginBottom: 12, fontSize: 14 }}>
                {selectedSeatIds.size > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Butacas:</strong>
                    <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                      {Array.from(selectedSeatIds).map(seatId => (
                        <li key={seatId}>{formatSeatLocation(seatId, 'butaca')}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {selectedPalcosLabels.size > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Palcos:</strong>
                    <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
                      {Array.from(selectedPalcosLabels).map(palco => (
                        <li key={palco}>{formatSeatLocation(palco, 'palco')}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {pullmanSelected > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>Pullman:</strong> {pullmanSelected} {pullmanSelected === 1 ? 'lugar' : 'lugares'} - {formatSeatLocation(null, 'pullman')}
                  </div>
                )}
              </div>
              
              <div style={{ fontSize: 24, fontWeight: 700, color: '#0369a1', marginBottom: 12 }}>
                Total: ${total.toLocaleString('es-AR')}
              </div>
              <button
                onClick={handleClearSelection}
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Limpiar Selección
              </button>
            </div>
          )}
        </div>
      )}

      {/* Customer data form */}
      {totalItems > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 16 }}>Datos del Cliente</h2>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Nombre *
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre completo"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  fontSize: 16
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Email (opcional)
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  fontSize: 16
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Teléfono (opcional)
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+54 9 11 1234-5678"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  fontSize: 16
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Método de Pago
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  fontSize: 16
                }}
              >
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Confirm button */}
      {totalItems > 0 && (
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={handleConfirmSale}
            disabled={loading || !customerName.trim()}
            style={{
              width: '100%',
              padding: 16,
              background: loading || !customerName.trim() ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 700,
              cursor: loading || !customerName.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Procesando...' : `Confirmar Venta - $${total.toLocaleString('es-AR')}`}
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: 16,
          background: '#fee2e2',
          border: '2px solid #ef4444',
          borderRadius: 8,
          color: '#991b1b',
          marginBottom: 16
        }}>
          <strong>❌ Error:</strong> {error}
        </div>
      )}

      {/* Success message */}
      {success && (
        <div style={{
          padding: 20,
          background: '#d1fae5',
          border: '2px solid #10b981',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#065f46', marginBottom: 12 }}>
            ✅ Venta realizada con éxito
          </div>
          
          {/* User association notification */}
          {success.user_association?.found && (
            <div style={{
              padding: 12,
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: 6,
              marginBottom: 12,
              color: '#92400e'
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                👤 Usuario encontrado
              </div>
              <div style={{ fontSize: 14 }}>
                {success.user_association.message}
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Coincidencia por: {success.user_association.matched_by === 'email' ? 'Email' : 'Teléfono'}
              </div>
            </div>
          )}
          
          <div style={{ marginBottom: 8 }}>
            <strong>Cliente:</strong> {success.sale?.customer_name}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Total:</strong> ${Number(success.sale?.total_amount).toLocaleString('es-AR')}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Vendido por:</strong> {success.seller?.name}
          </div>
          
          {/* Detailed ticket list */}
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <strong>Entradas generadas ({success.tickets?.length}):</strong>
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20, fontSize: 14 }}>
              {success.tickets?.map(ticket => (
                <li key={ticket.id}>
                  {ticket.location} - ${Number(ticket.price).toLocaleString('es-AR')}
                </li>
              ))}
            </ul>
          </div>
          
          <div style={{ fontSize: 14, color: '#065f46', marginTop: 12 }}>
            💡 Los QR codes se generaron automáticamente. Próximamente podrás enviarlos por email o WhatsApp.
          </div>
        </div>
      )}
    </div>
  );
}
