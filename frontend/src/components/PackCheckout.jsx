import { useState, useEffect, useCallback } from 'react';
import SeatSelection from './SeatSelection.jsx';
import GeneralAdmissionSelection from './GeneralAdmissionSelection.jsx';
import { apiFetch } from '../lib/api';
import { formatDateLong, formatTime, formatDateShort } from '../lib/dateFormatter.js';
import GuestCheckoutForm from './GuestCheckoutForm.jsx';

export default function PackCheckout({
  show,
  sessions,
  user,
  token,
  isGuest,
  guestData,
  onGuestCheckoutNeeded,
  serviceFeePercent,
  showServices,
  onClose
}) {
  const [step, setStep] = useState('intro');
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0);
  const [selectionsBySession, setSelectionsBySession] = useState({});
  const [reservationsBySession, setReservationsBySession] = useState({});
  const [currentSelection, setCurrentSelection] = useState(null);
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [selectedServices, setSelectedServices] = useState({});
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Prevent browser back from returning to previous step; instead go home
    window.history.pushState({ pack: true }, '');
    const onPopState = (e) => {
      if (!e.state || !e.state.pack) {
        window.location.href = '/';
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const venueLabelMap = {
    sala_principal: 'Sala Principal',
    el_tablado: 'El Tablado',
    las_gemelas: 'Nueva sala'
  };

  const isSalaPrincipal = show?.venue_type === 'sala_principal';

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(Number(amount || 0));

  const getBasePrice = () => {
    const pricing = show?.pricing_json || {};
    if (isSalaPrincipal) {
      return pricing.platea_general || 0;
    }
    return pricing.general || 0;
  };

  const buildItems = (selection) => {
    const items = [];
    if (!selection) return items;
    for (const sid of Array.from(selection.selectedSeatIds || new Set())) {
      items.push({ type: 'butaca', section: 'Platea General', seat_code: sid });
    }
    for (const label of Array.from(selection.selectedPalcosLabels || new Set())) {
      const isPB = /^PB/i.test(label);
      const pack = isPB ? 4 : 2;
      items.push({ type: 'palco', section: label.startsWith('PB') ? 'Palcos Bajos' : 'Palcos Altos', seat_code: label, quantity: pack });
    }
    const pullmanCount = selection.pullmanSelected || 0;
    const generalCount = selection.generalAdmissionCount || 0;
    const qty = isSalaPrincipal ? pullmanCount : (generalCount || pullmanCount);
    if (qty > 0) {
      if (isSalaPrincipal) {
        items.push({ type: 'pullman', section: 'Pullman', quantity: qty });
      } else {
        items.push({ type: 'general', section: 'General', quantity: qty });
      }
    }
    return items;
  };

  const countTickets = (selection) => buildItems(selection).reduce((sum, it) => sum + (it.quantity || 1), 0);

  const currentSession = selectedSessionIds[currentSessionIndex]
    ? sessions.find(s => s.id === selectedSessionIds[currentSessionIndex])
    : null;

  const isCurrentSelectionValid = () => {
    const items = buildItems(currentSelection);
    return items.length > 0;
  };

  const handleSessionToggle = (sessionId) => {
    setSelectedSessionIds(prev => {
      const next = prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId];
      return next;
    });
    setSelectionsBySession({});
    setCurrentSelection(null);
  };

  const handleSelectionChange = (selection) => {
    setCurrentSelection(selection);
  };

  const handleServiceChange = (serviceId, quantity) => {
    setSelectedServices(prev => {
      const next = { ...prev };
      if (quantity <= 0) delete next[serviceId];
      else next[serviceId] = quantity;
      return next;
    });
  };

  const cartServiceItems = showServices
    .filter(s => selectedServices[s.id] > 0)
    .map(s => ({ service_id: s.id, name: s.name, price: Number(s.price), quantity: selectedServices[s.id] }));

  const validateDiscount = async () => {
    if (!discountCode.trim()) return;
    const totalSeats = Object.values(selectionsBySession).reduce((sum, sel) => sum + countTickets(sel), 0) + countTickets(currentSelection);
    setDiscountError('');
    try {
      const res = await apiFetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountCode.trim(), show_id: show.id, seat_count: totalSeats })
      });
      if (res.ok) {
        const discount = await res.json();
        setAppliedDiscount(discount);
        setDiscountError('');
      } else {
        const err = await res.json();
        setDiscountError(err.message || 'Código inválido');
        setAppliedDiscount(null);
      }
    } catch {
      setDiscountError('Error al validar cupón');
      setAppliedDiscount(null);
    }
  };

  const createReservations = async () => {
    const allSelections = { ...selectionsBySession };
    if (currentSession && currentSelection) {
      allSelections[currentSession.id] = currentSelection;
    }
    const newReservations = {};
    for (const sessionId of selectedSessionIds) {
      const items = buildItems(allSelections[sessionId]);
      if (items.length === 0) continue;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const body = { session_id: sessionId, items };
      if (user?.id) body.user_id = user.id;
      const res = await apiFetch('/api/reservations', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Error creando reserva para ${sessionId}`);
      }
      const data = await res.json();
      newReservations[sessionId] = data;
    }
    if (Object.keys(newReservations).length !== selectedSessionIds.length) {
      throw new Error('Faltan selecciones para algunas funciones');
    }
    setReservationsBySession(newReservations);
    return newReservations;
  };

  const fetchPreview = async () => {
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const reservations = await createReservations();
      const reservationIds = Object.values(reservations).map(r => r.id);
      const body = {
        reservation_ids: reservationIds,
        discount_id: appliedDiscount?.id || null,
        service_items: cartServiceItems.length > 0 ? cartServiceItems : undefined
      };
      const res = await apiFetch('/api/payments/pack-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al obtener el desglose del pack');
      }
      const data = await res.json();
      setPreview(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNextFunction = () => {
    if (!isCurrentSelectionValid()) return;
    if (!currentSession) return;
    setSelectionsBySession(prev => ({ ...prev, [currentSession.id]: currentSelection }));
    setCurrentSelection(null);
    if (currentSessionIndex < selectedSessionIds.length - 1) {
      setCurrentSessionIndex(prev => prev + 1);
    } else {
      setLoading(true);
      fetchPreview().then(() => setStep('summary'));
    }
  };
  
  const handleConfirmAndPay = async () => {
    if (!isGuest && !user) {
      onGuestCheckoutNeeded?.();
      return;
    }
    if (!preview) return;
    setLoading(true);
    setError('');
    try {
      const reservationIds = Object.values(reservationsBySession).map(r => r.id);
      const payload = {
        reservation_ids: reservationIds,
        discount_id: appliedDiscount?.id || null,
        service_items: cartServiceItems.length > 0 ? cartServiceItems : undefined
      };
      if (guestData) {
        payload.customer_name = guestData.name;
        payload.customer_dni = guestData.dni;
        payload.customer_phone = guestData.phone;
        payload.customer_email = guestData.email;
        payload.customer_provincia = guestData.provincia;
        payload.customer_localidad = guestData.localidad;
      } else if (user) {
        payload.customer_name = user.name || null;
        payload.customer_dni = user.dni || null;
        payload.customer_phone = user.phone || null;
        payload.customer_email = user.email || null;
        payload.customer_provincia = user.provincia || null;
        payload.customer_localidad = user.localidad || null;
      }
      const res = await apiFetch('/api/payments/sipago-pack-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Error al crear la orden de pago');
      }
      const data = await res.json();
      const orderUuid = data?.order?.data?.id || data?.order?.data?.attributes?.uuid || null;
      try {
        sessionStorage.removeItem('sipago_order_uuid');
        sessionStorage.removeItem('sipago_pack_id');
        sessionStorage.removeItem('sipago_discount_id');
        sessionStorage.removeItem('sipago_guest_data');
        if (orderUuid) {
          sessionStorage.setItem('sipago_order_uuid', String(orderUuid));
          sessionStorage.setItem('sipago_pack_id', String(data.pack_id));
          if (appliedDiscount?.id) sessionStorage.setItem('sipago_discount_id', String(appliedDiscount.id));
        }
        if (guestData) sessionStorage.setItem('sipago_guest_data', JSON.stringify(guestData));
        else if (user) sessionStorage.setItem('sipago_guest_data', JSON.stringify({
          name: user.name || '', dni: user.dni || '', phone: user.phone || '', email: user.email || '',
          provincia: user.provincia || '', localidad: user.localidad || ''
        }));
      } catch {}
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No se pudo obtener la URL de pago');
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  const handleGuestFormSubmit = (data) => {
    onGuestCheckoutNeeded?.(data);
  };

  const resetFlow = () => {
    setStep('intro');
    setSelectedSessionIds([]);
    setCurrentSessionIndex(0);
    setSelectionsBySession({});
    setReservationsBySession({});
    setCurrentSelection(null);
    setAppliedDiscount(null);
    setDiscountCode('');
    setSelectedServices({});
    setPreview(null);
    setError('');
  };

  const CartSummary = () => {
    const totalTickets = selectedSessionIds.reduce((sum, sid) => sum + countTickets(selectionsBySession[sid]), 0) + countTickets(currentSelection);
    const completedSessions = selectedSessionIds.slice(0, currentSessionIndex);
    return (
      <div style={{
        position: 'fixed',
        right: 24,
        top: 120,
        width: 280,
        maxHeight: 'calc(100vh - 140px)',
        overflowY: 'auto',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        zIndex: 10001
      }}>
        <h4 style={{ margin: '0 0 12px 0', fontSize: 16 }}>Tu pack</h4>
        {completedSessions.length === 0 && !currentSession && (
          <p style={{ color: '#6b7280', fontSize: 14 }}>Aún no seleccionaste funciones.</p>
        )}
        {completedSessions.map((sid, idx) => {
          const session = sessions.find(s => s.id === sid);
          const items = buildItems(selectionsBySession[sid]);
          return (
            <div key={sid} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Función {idx + 1}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{formatDateShort(session?.starts_at)} {formatTime(session?.starts_at)}</div>
              <div style={{ fontSize: 13 }}>{items.reduce((sum, it) => sum + (it.quantity || 1), 0)} entradas</div>
            </div>
          );
        })}
        {currentSession && (
          <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Función actual</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{formatDateShort(currentSession?.starts_at)} {formatTime(currentSession?.starts_at)}</div>
            <div style={{ fontSize: 13 }}>{countTickets(currentSelection)} entradas seleccionadas</div>
          </div>
        )}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid #333', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total entradas:</span>
          <span>{totalTickets}</span>
        </div>
      </div>
    );
  };

  if (!isGuest && !user) {
    return (
      <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd', maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginTop: 0 }}>Pack Multi-Función</h3>
        <p>Para comprar un pack de funciones, primero tenés que iniciar sesión o continuar como invitado.</p>
        <button onClick={() => onGuestCheckoutNeeded?.()} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Continuar
        </button>
        <button onClick={onClose} style={{ marginLeft: 12, padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    );
  }

  if (isGuest && !guestData) {
    return (
      <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd', maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginTop: 0 }}>Datos para el Pack</h3>
        <GuestCheckoutForm onSubmit={handleGuestFormSubmit} onCancel={onClose} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd', maxWidth: 900, margin: '0 auto', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Pack Multi-Función</h3>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
      </div>

      {step === 'intro' && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎭</div>
          <h2 style={{ marginBottom: 12, color: '#166534' }}>Comprando para más de una función tus entradas tienen descuento</h2>
          <p style={{ color: '#4b5563', marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
            Seleccioná las funciones que querés disfrutar y armá tu pack con precios especiales.
          </p>
          <button
            onClick={() => setStep('selectSessions')}
            style={{ padding: '14px 32px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
          >
            Elegir funciones
          </button>
        </div>
      )}

      {step === 'selectSessions' && (
        <>
          <h4 style={{ marginBottom: 8 }}>¿Para qué funciones querés entradas?</h4>
          <p style={{ color: '#6b7280', marginBottom: 16, fontSize: 14 }}>Seleccioná al menos 2 funciones.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {sessions.map(session => (
              <label key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', background: selectedSessionIds.includes(session.id) ? '#eff6ff' : '#fff' }}>
                <input
                  type="checkbox"
                  checked={selectedSessionIds.includes(session.id)}
                  onChange={() => handleSessionToggle(session.id)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{formatDateLong(session.starts_at)} - {formatTime(session.starts_at)}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{session.sala || venueLabelMap[show?.venue_type] || 'Sala'}</div>
                </div>
              </label>
            ))}
          </div>

          {selectedSessionIds.length < 2 && (
            <p style={{ color: '#dc3545', fontSize: 14, marginBottom: 16 }}>Tenés que elegir al menos 2 funciones para acceder al pack.</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => window.location.href = '/'} style={{ padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
            <button
              onClick={() => { setCurrentSessionIndex(0); setStep('selectSeats'); }}
              disabled={selectedSessionIds.length < 2}
              style={{ padding: '12px 24px', background: selectedSessionIds.length >= 2 ? '#16a34a' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, cursor: selectedSessionIds.length >= 2 ? 'pointer' : 'not-allowed', fontWeight: 600 }}
            >
              Seleccionar mis butacas
            </button>
          </div>
        </>
      )}

      {step === 'selectSeats' && currentSession && (
        <>
          <CartSummary />
          <div style={{ paddingRight: 320 }}>
            <div style={{ marginBottom: 16, padding: 16, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
              <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Función {currentSessionIndex + 1} de {selectedSessionIds.length}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>{formatDateLong(currentSession.starts_at)} - {formatTime(currentSession.starts_at)}</div>
              <div style={{ fontSize: 14, color: '#166534' }}>{venueLabelMap[show?.venue_type] || currentSession.sala || 'Sala'}</div>
            </div>

            {isSalaPrincipal ? (
              <SeatSelection
                showId={show.id}
                sessionId={currentSession.id}
                userId={user?.id || null}
                mode="spectator"
                onSelectionChange={handleSelectionChange}
              />
            ) : (
              <GeneralAdmissionSelection
                showId={show.id}
                sessionId={currentSession.id}
                userId={user?.id || null}
                mode="spectator"
                maxCapacity={currentSession.capacity_override || show.general_capacity}
                ticketPrice={getBasePrice()}
                onSelectionChange={handleSelectionChange}
              />
            )}

            {error && <p style={{ color: '#dc3545', marginTop: 16 }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
              <button
                onClick={() => window.location.href = '/'}
                style={{ padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleNextFunction}
                disabled={!isCurrentSelectionValid() || loading}
                style={{
                  padding: '12px 24px',
                  background: isCurrentSelectionValid() ? '#16a34a' : '#9ca3af',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: isCurrentSelectionValid() ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontSize: 15
                }}
              >
                {loading ? 'Procesando...' : currentSessionIndex < selectedSessionIds.length - 1 ? 'Siguiente función →' : 'Ver resumen y pagar'}
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'summary' && preview && (
        <>
          <CartSummary />
          <div style={{ paddingRight: 320 }}>
            <h4 style={{ marginBottom: 12 }}>Resumen del Pack</h4>
            <div style={{ marginBottom: 16 }}>
              {preview.slotsBySession && Object.entries(preview.slotsBySession).map(([sessionId, slots]) => {
                const session = sessions.find(s => s.id === sessionId);
                const subtotal = slots.reduce((sum, s) => sum + Number(s.finalPrice || 0), 0);
                return (
                  <div key={sessionId} style={{ marginBottom: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600 }}>{formatDateLong(session?.starts_at)} - {formatTime(session?.starts_at)}</div>
                    <div style={{ fontSize: 14, color: '#4b5563' }}>{slots.length} entradas · {formatCurrency(subtotal)}</div>
                  </div>
                );
              })}
            </div>

            {showServices.length > 0 && (
              <div style={{ marginBottom: 24, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Servicios adicionales</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {showServices.map(svc => (
                    <div key={svc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 14 }}>{svc.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{formatCurrency(svc.price)} c/u</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => handleServiceChange(svc.id, (selectedServices[svc.id] || 0) - 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #ccc', cursor: 'pointer' }}>-</button>
                        <span style={{ minWidth: 24, textAlign: 'center' }}>{selectedServices[svc.id] || 0}</span>
                        <button onClick={() => handleServiceChange(svc.id, (selectedServices[svc.id] || 0) + 1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #ccc', cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 24, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Código de descuento</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                  placeholder="Ingresá tu cupón"
                  style={{ flex: 1, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                />
                <button onClick={validateDiscount} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Aplicar</button>
              </div>
              {appliedDiscount && <p style={{ color: '#16a34a', fontSize: 13, marginTop: 4 }}>Descuento aplicado: {appliedDiscount.alias || appliedDiscount.code}</p>}
              {discountError && <p style={{ color: '#dc3545', fontSize: 13, marginTop: 4 }}>{discountError}</p>}
            </div>

            <div style={{ marginBottom: 24, padding: 16, background: '#f0fdf4', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Subtotal entradas</span><span>{formatCurrency(preview.subtotal)}</span></div>
              {preview.servicesSubtotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Servicios</span><span>{formatCurrency(preview.servicesSubtotal)}</span></div>}
              {preview.discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Descuento</span><span>-{formatCurrency(preview.discountAmount)}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Cargo por servicio ({serviceFeePercent}%)</span><span>{formatCurrency(preview.serviceFeeAmount)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20, marginTop: 8, paddingTop: 8, borderTop: '1px solid #bbf7d0' }}>
                <span>TOTAL</span>
                <span>{formatCurrency(preview.total)}</span>
              </div>
            </div>

            {error && <p style={{ color: '#dc3545', marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleConfirmAndPay} disabled={loading} style={{ padding: '14px 28px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>
                {loading ? 'Procesando...' : `Pagar ${formatCurrency(preview.total)}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
