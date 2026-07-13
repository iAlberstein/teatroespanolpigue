import { useState, useEffect, useCallback } from 'react';
import SeatSelection from './SeatSelection.jsx';
import GeneralAdmissionSelection from './GeneralAdmissionSelection.jsx';
import { apiFetch, apiAuthFetch } from '../lib/api';
import { formatDateLong, formatTime } from '../lib/dateFormatter.js';
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
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [selectionsBySession, setSelectionsBySession] = useState({});
  const [reservationsBySession, setReservationsBySession] = useState({});
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [selectedServices, setSelectedServices] = useState({});
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('select');
  const [error, setError] = useState('');

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

  const toggleSession = (sessionId) => {
    setSelectedSessionIds(prev => {
      const next = prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId];
      return next;
    });
    setPreview(null);
    setReservationsBySession({});
  };

  const handleSelectionChange = (sessionId, selection) => {
    setSelectionsBySession(prev => ({ ...prev, [sessionId]: selection }));
    setPreview(null);
    setReservationsBySession({});
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
    const totalSeats = selectedSessionIds.reduce((sum, sid) => {
      const items = buildItems(selectionsBySession[sid]);
      return sum + items.reduce((s, it) => s + (it.quantity || 1), 0);
    }, 0);
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
    const newReservations = {};
    for (const sessionId of selectedSessionIds) {
      const items = buildItems(selectionsBySession[sessionId]);
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
      setStep('preview');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const canProceedToPreview = () => {
    if (selectedSessionIds.length < 2) return false;
    return selectedSessionIds.every(sid => {
      const items = buildItems(selectionsBySession[sid]);
      return items.length > 0;
    });
  };

  const payWithSipago = async () => {
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
    // Pass guest data to parent so Detalle can manage it, then continue
    onGuestCheckoutNeeded?.(data);
  };

  if (!isGuest && !user) {
    return (
      <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd' }}>
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
      <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>Datos para el Pack</h3>
        <GuestCheckoutForm onSubmit={handleGuestFormSubmit} onCancel={onClose} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Pack Multi-Función</h3>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
      </div>

      {step === 'select' && (
        <>
          <p style={{ color: '#4b5563', marginBottom: 16 }}>Seleccioná al menos 2 funciones y tus ubicaciones para cada una.</p>
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 8 }}>Funciones disponibles</h4>
            {sessions.length === 0 && <p>No hay funciones disponibles.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map(session => (
                <label key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', background: selectedSessionIds.includes(session.id) ? '#eff6ff' : '#fff' }}>
                  <input
                    type="checkbox"
                    checked={selectedSessionIds.includes(session.id)}
                    onChange={() => toggleSession(session.id)}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{formatDateLong(session.starts_at)} - {formatTime(session.starts_at)}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{session.sala || venueLabelMap[show?.venue_type] || 'Sala'}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {selectedSessionIds.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ marginBottom: 8 }}>Seleccioná tus ubicaciones</h4>
              {selectedSessionIds.map(sessionId => {
                const session = sessions.find(s => s.id === sessionId);
                return (
                  <div key={sessionId} style={{ marginBottom: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{formatDateLong(session.starts_at)} - {formatTime(session.starts_at)}</div>
                    {isSalaPrincipal ? (
                      <SeatSelection
                        showId={show.id}
                        sessionId={sessionId}
                        userId={user?.id || null}
                        mode="spectator"
                        onSelectionChange={(sel) => handleSelectionChange(sessionId, sel)}
                      />
                    ) : (
                      <GeneralAdmissionSelection
                        showId={show.id}
                        sessionId={sessionId}
                        userId={user?.id || null}
                        mode="spectator"
                        maxCapacity={session.capacity_override || show.general_capacity}
                        ticketPrice={getBasePrice()}
                        onSelectionChange={(sel) => handleSelectionChange(sessionId, sel)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showServices.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ marginBottom: 8 }}>Servicios adicionales</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {showServices.map(svc => (
                  <div key={svc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{svc.name}</div>
                      <div style={{ fontSize: 13, color: '#6b7280' }}>{formatCurrency(svc.price)} c/u</div>
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

          {error && <p style={{ color: '#dc3545', marginBottom: 16 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={fetchPreview}
              disabled={!canProceedToPreview() || loading}
              style={{
                padding: '12px 24px',
                background: canProceedToPreview() ? '#16a34a' : '#9ca3af',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: canProceedToPreview() ? 'pointer' : 'not-allowed',
                fontWeight: 600
              }}
            >
              {loading ? 'Procesando...' : 'Ver desglose del pack'}
            </button>
          </div>
        </>
      )}

      {step === 'preview' && preview && (
        <>
          <h4 style={{ marginBottom: 12 }}>Desglose del Pack</h4>
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

          <div style={{ marginBottom: 16, padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Subtotal entradas</span><span>{formatCurrency(preview.subtotal)}</span></div>
            {preview.servicesSubtotal > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Servicios</span><span>{formatCurrency(preview.servicesSubtotal)}</span></div>}
            {preview.discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Descuento</span><span>-{formatCurrency(preview.discountAmount)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Cargo por servicio ({serviceFeePercent}%)</span><span>{formatCurrency(preview.serviceFeeAmount)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, marginTop: 8, paddingTop: 8, borderTop: '1px solid #bbf7d0' }}>
              <span>TOTAL</span>
              <span>{formatCurrency(preview.total)}</span>
            </div>
          </div>

          {error && <p style={{ color: '#dc3545', marginBottom: 16 }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => setStep('select')} style={{ padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Volver</button>
            <button onClick={payWithSipago} disabled={loading} style={{ padding: '10px 24px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              {loading ? 'Procesando...' : 'Pagar pack'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
