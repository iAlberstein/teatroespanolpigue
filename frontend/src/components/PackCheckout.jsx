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
  const [step, setStep] = useState('selectSessions');
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
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);

  useEffect(() => {
    window.history.pushState({ pack: true }, '');
    const onPopState = (e) => {
      if (!e.state || !e.state.pack) {
        window.location.href = '/';
      }
    };
    window.addEventListener('popstate', onPopState);

    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('resize', onResize);
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
    setStep('selectSessions');
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

  const cartTotalTickets = () => {
    return selectedSessionIds.reduce((sum, sid) => sum + countTickets(selectionsBySession[sid]), 0) + countTickets(currentSelection);
  };

  const renderSidebar = () => {
    const completedSessions = selectedSessionIds.slice(0, currentSessionIndex);
    return (
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <h4 style={{ margin: 0, fontSize: 16, color: '#1e293b' }}>Tu pack</h4>
        {completedSessions.length === 0 && !currentSession && (
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Aún no seleccionaste funciones.</p>
        )}
        {completedSessions.map((sid, idx) => {
          const session = sessions.find(s => s.id === sid);
          const items = buildItems(selectionsBySession[sid]);
          return (
            <div key={sid} style={{ paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>Función {idx + 1}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{formatDateShort(session?.starts_at)} {formatTime(session?.starts_at)}</div>
              <div style={{ fontSize: 13, color: '#4b5563' }}>{items.reduce((sum, it) => sum + (it.quantity || 1), 0)} entradas</div>
            </div>
          );
        })}
        {currentSession && (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#166534' }}>Función actual</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{formatDateShort(currentSession?.starts_at)} {formatTime(currentSession?.starts_at)}</div>
            <div style={{ fontSize: 13, color: '#4b5563' }}>{countTickets(currentSelection)} entradas seleccionadas</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, paddingTop: 8, borderTop: '2px solid #333', color: '#1e293b' }}>
          <span>Total entradas:</span>
          <span>{cartTotalTickets()}</span>
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
        <button onClick={() => window.location.href = '/'} style={{ marginLeft: 12, padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    );
  }

  if (isGuest && !guestData) {
    return (
      <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd', maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginTop: 0 }}>Datos para el Pack</h3>
        <GuestCheckoutForm onSubmit={handleGuestFormSubmit} onCancel={() => window.location.href = '/'} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: isMobile ? '16px 0' : 24, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: '#1e293b' }}>Pack Multi-Función</h3>
        <button onClick={() => window.location.href = '/'} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
      </div>

      {step === 'selectSessions' && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h4 style={{ marginBottom: 8, color: '#1e293b' }}>¿Para qué funciones querés entradas?</h4>
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
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{formatDateLong(session.starts_at)} - {formatTime(session.starts_at)}</div>
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
        </div>
      )}

      {step === 'selectSeats' && currentSession && (
        <>
          <div style={{
            marginBottom: 16,
            padding: 16,
            background: '#f0fdf4',
            borderRadius: 8,
            border: '1px solid #86efac',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8
          }}>
            <div>
              <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Función {currentSessionIndex + 1} de {selectedSessionIds.length}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>{show.title}</div>
              <div style={{ fontSize: 15, color: '#166534' }}>{formatDateLong(currentSession.starts_at)} - {formatTime(currentSession.starts_at)} hs · {venueLabelMap[show?.venue_type] || currentSession.sala || 'Sala'}</div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: 24,
            alignItems: 'flex-start'
          }}>
            <div style={{ flex: '1 1 0%', minWidth: 0 }}>
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
                  sidebarContent={null}
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

            {!isMobile && (
              <div style={{ flex: '0 0 300px', maxWidth: 320 }}>
                {renderSidebar()}
              </div>
            )}
          </div>

          {isMobile && (
            <div style={{ marginTop: 24 }}>
              {renderSidebar()}
            </div>
          )}
        </>
      )}

      {step === 'summary' && preview && (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h4 style={{ marginBottom: 16, color: '#1e293b' }}>Resumen del Pack</h4>
          <div style={{ marginBottom: 16 }}>
            {preview.slotsBySession && Object.entries(preview.slotsBySession).map(([sessionId, slots]) => {
              const session = sessions.find(s => s.id === sessionId);
              const subtotal = slots.reduce((sum, s) => sum + Number(s.finalPrice || 0), 0);
              return (
                <div key={sessionId} style={{ marginBottom: 12, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{formatDateLong(session?.starts_at)} - {formatTime(session?.starts_at)}</div>
                  <div style={{ fontSize: 14, color: '#4b5563' }}>{slots.length} entradas · {formatCurrency(subtotal)}</div>
                </div>
              );
            })}
          </div>

          {showServices.length > 0 && (
            <div style={{ marginBottom: 24, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#1e293b' }}>Servicios adicionales</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {showServices.map(svc => (
                  <div key={svc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 14, color: '#1e293b' }}>{svc.name}</div>
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
            <label style={{ fontWeight: 600, display: 'block', marginBottom: 6, color: '#1e293b' }}>Código de descuento</label>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#1e293b' }}><span>Subtotal entradas</span><span>{formatCurrency(preview.subtotal)}</span></div>
            {preview.servicesSubtotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#1e293b' }}><span>Servicios</span><span>{formatCurrency(preview.servicesSubtotal)}</span></div>}
            {preview.discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#1e293b' }}><span>Descuento</span><span>-{formatCurrency(preview.discountAmount)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#1e293b' }}><span>Cargo por servicio ({serviceFeePercent}%)</span><span>{formatCurrency(preview.serviceFeeAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 20, marginTop: 8, paddingTop: 8, borderTop: '1px solid #bbf7d0', color: '#1e293b' }}>
              <span>TOTAL</span>
              <span>{formatCurrency(preview.total)}</span>
            </div>
          </div>

          {error && <p style={{ color: '#dc3545', marginBottom: 16 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => window.location.href = '/'} style={{ padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleConfirmAndPay} disabled={loading} style={{ padding: '14px 28px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>
              {loading ? 'Procesando...' : `Pagar ${formatCurrency(preview.total)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
