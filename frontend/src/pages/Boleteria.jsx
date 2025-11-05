import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiAuthFetch } from '../lib/api';
import SeatSelection from '../components/SeatSelection';
import { formatSeatLocation } from '../lib/seatFormatter';

export default function BoxOffice() {
  const { token, user } = useAuth();
  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  
  // Customer data
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  // Track current selection
  const [currentSelection, setCurrentSelection] = useState({
    selectedSeatIds: new Set(),
    selectedPalcosLabels: new Set(),
    pullmanSelected: 0,
    clearSelection: null,
    pricing: {
      platea_general: 5000,
      palcos_bajos: 10000,
      palcos_altos: 8000,
      pullman: 3000
    }
  });

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

  const calculateTotal = () => {
    const pricing = currentSelection.pricing || {
      platea_general: 5000,
      palcos_bajos: 10000,
      palcos_altos: 8000,
      pullman: 3000
    };
    
    const seatsTotal = currentSelection.selectedSeatIds.size * Number(pricing.platea_general || 5000);
    
    // Calculate palcos price based on label (PB vs PA)
    let palcosTotal = 0;
    for (const palco of currentSelection.selectedPalcosLabels) {
      const isPB = /^PB/i.test(palco);
      const price = isPB ? Number(pricing.palcos_bajos || 10000) : Number(pricing.palcos_altos || 8000);
      palcosTotal += price;
    }
    
    const pullmanTotal = currentSelection.pullmanSelected * Number(pricing.pullman || 3000);
    
    return seatsTotal + palcosTotal + pullmanTotal;
  };

  const handleConfirmSale = async () => {
    if (!customerName.trim()) {
      setError('El nombre del cliente es obligatorio');
      return;
    }

    if (currentSelection.selectedSeatIds.size === 0 && currentSelection.selectedPalcosLabels.size === 0 && currentSelection.pullmanSelected === 0) {
      setError('Debe seleccionar al menos una entrada');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(null);

    try {
      const pricing = currentSelection.pricing || {
        platea_general: 5000,
        palcos_bajos: 10000,
        palcos_altos: 8000,
        pullman: 3000
      };

      const items = [];
      
      // Add seats
      for (const seatId of currentSelection.selectedSeatIds) {
        items.push({
          type: 'butaca',
          seat_code: seatId,
          price: Number(pricing.platea_general || 5000)
        });
      }
      
      // Add palcos
      for (const palco of currentSelection.selectedPalcosLabels) {
        const isPB = /^PB/i.test(palco);
        const price = isPB ? Number(pricing.palcos_bajos || 10000) : Number(pricing.palcos_altos || 8000);
        items.push({
          type: 'palco',
          seat_code: palco,
          price
        });
      }
      
      // Add pullman
      if (currentSelection.pullmanSelected > 0) {
        items.push({
          type: 'pullman',
          quantity: currentSelection.pullmanSelected,
          price: Number(pricing.pullman || 3000)
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
      console.log('[BOLETERIA] Sale response:', data);
      console.log('[BOLETERIA] Tickets:', data.tickets);
      setSuccess(data);
      
      // Clear selection and customer data
      if (currentSelection.clearSelection) {
        currentSelection.clearSelection();
      }
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      
    } catch (err) {
      setError(err.message || 'Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  const totalItems = currentSelection.selectedSeatIds.size + currentSelection.selectedPalcosLabels.size + currentSelection.pullmanSelected;
  const total = calculateTotal();

  // Sidebar content for box office mode
  const boxOfficeSidebar = (
    <div style={{ minWidth: 300 }}>
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>Datos del Cliente</h3>
      
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
          Nombre *
        </label>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Nombre del cliente"
          style={{
            width: '100%',
            padding: 8,
            borderRadius: 4,
            border: '1px solid #ccc'
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
          Email
        </label>
        <input
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          placeholder="email@ejemplo.com"
          style={{
            width: '100%',
            padding: 8,
            borderRadius: 4,
            border: '1px solid #ccc'
          }}
        />
        <small style={{ fontSize: 11, color: '#666' }}>
          Si el email coincide con un usuario registrado, las entradas aparecerán en su perfil
        </small>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
          Teléfono
        </label>
        <input
          type="tel"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="Teléfono"
          style={{
            width: '100%',
            padding: 8,
            borderRadius: 4,
            border: '1px solid #ccc'
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>
          Método de pago
        </label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          style={{
            width: '100%',
            padding: 8,
            borderRadius: 4,
            border: '1px solid #ccc'
          }}
        >
          <option value="cash">Efectivo</option>
          <option value="card">Tarjeta</option>
          <option value="transfer">Transferencia</option>
        </select>
      </div>

      <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>Resumen:</strong>
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
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
        <div style={{ marginTop: 12, fontWeight: 600, fontSize: 18 }}>
          Total: ${total.toLocaleString('es-AR')}
        </div>
      </div>

      {totalItems > 0 && (
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={handleConfirmSale}
            disabled={loading || !customerName.trim()}
            style={{
              width: '100%',
              padding: 12,
              background: loading ? '#ccc' : '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: loading || !customerName.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Procesando...' : `Confirmar venta ($${total.toLocaleString('es-AR')})`}
          </button>
        </div>
      )}

      {error && (
        <div style={{
          padding: 12,
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: 6,
          marginBottom: 16,
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: 20,
          background: '#d1fae5',
          border: '1px solid #a7f3d0',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#065f46',
            marginBottom: 12
          }}>
            ✅ Venta exitosa
          </div>
          
          {/* User association notification */}
          {success.user_association?.found && (
            <div style={{
              padding: 12,
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: 6,
              marginBottom: 12
            }}>
              <div style={{
                fontWeight: 600,
                marginBottom: 4,
                color: '#78350f'
              }}>
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
                  {ticket.location} - ${Number(ticket.price || 0).toLocaleString('es-AR')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );

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
            onChange={(e) => setSelectedSession(e.target.value || null)}
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

      {/* Use shared SeatSelection component */}
      <SeatSelection
        showId={selectedShow}
        sessionId={selectedSession}
        userId={null}
        mode="boxoffice"
        onSelectionChange={setCurrentSelection}
        sidebarContent={boxOfficeSidebar}
      />
    </div>
  );
}
