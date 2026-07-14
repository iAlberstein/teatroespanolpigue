import { useState, useEffect, useMemo } from 'react';
import SeatSelection from './SeatSelection.jsx';
import GeneralAdmissionSelection from './GeneralAdmissionSelection.jsx';
import { apiFetch } from '../lib/api';
import { formatDateLong, formatTime, formatDateShort } from '../lib/dateFormatter.js';
import { formatSeatLocation } from '../lib/seatFormatter.js';
import { getSeatPriceTier } from '../lib/seatPriceColors.js';
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
  const packPricing = show?.pack_pricing_json || {};
  const packMaxSessions = show?.pack_max_sessions || 3;

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(Number(amount || 0));

  const getPricing = (selection) => selection?.pricing || show?.pricing_json || {};
  const getPriceTiers = (selection) => selection?.priceTiers || [];

  // Build reservation-style items from a selection
  const buildReservationItems = (selection) => {
    const items = [];
    if (!selection) return items;
    for (const sid of Array.from(selection.selectedSeatIds || new Set())) {
      items.push({ type: 'butaca', section: 'Platea General', seat_code: sid, price: getBasePrice(selection, { type: 'butaca', seat_code: sid }) });
    }
    for (const label of Array.from(selection.selectedPalcosLabels || new Set())) {
      const isPB = /^PB/i.test(label);
      items.push({
        type: 'palco',
        section: isPB ? 'Palcos Bajos' : 'Palcos Altos',
        seat_code: label,
        quantity: isPB ? 4 : 2,
        price: getBasePrice(selection, { type: 'palco', section: isPB ? 'Palcos Bajos' : 'Palcos Altos', seat_code: label })
      });
    }
    const pullmanCount = selection.pullmanSelected || 0;
    const generalCount = selection.generalAdmissionCount || 0;
    const qty = isSalaPrincipal ? pullmanCount : (generalCount || pullmanCount);
    if (qty > 0) {
      const isGeneral = !isSalaPrincipal;
      items.push({
        type: isGeneral ? 'general' : 'pullman',
        section: isGeneral ? 'General' : 'Pullman',
        quantity: qty,
        unit_price: isGeneral ? Number(getPricing(selection).general || 0) : Number(getPricing(selection).pullman || 0)
      });
    }
    return items;
  };

  function getBasePrice(selection, item) {
    const pricing = getPricing(selection);
    const priceTiers = getPriceTiers(selection);
    if (item.type === 'butaca') {
      const tierInfo = priceTiers.length > 0 ? getSeatPriceTier(item.seat_code, priceTiers) : null;
      return tierInfo?.price ? Number(tierInfo.price) : Number(pricing.platea_general || 0);
    }
    if (item.type === 'palco') {
      const isPB = /^PB/i.test(item.seat_code || item.section);
      const tierInfo = priceTiers.length > 0 ? getSeatPriceTier(item.seat_code || item.section, priceTiers) : null;
      return tierInfo?.price ? Number(tierInfo.price) : Number(isPB ? pricing.palcos_bajos || 0 : pricing.palcos_altos || 0);
    }
    return 0;
  }

  const countTickets = (selection) => buildReservationItems(selection).reduce((sum, it) => sum + (it.quantity || 1), 0);

  const currentSession = selectedSessionIds[currentSessionIndex]
    ? sessions.find(s => s.id === selectedSessionIds[currentSessionIndex])
    : null;

  const isCurrentSelectionValid = () => buildReservationItems(currentSelection).length > 0;

  const handleSessionToggle = (sessionId) => {
    setSelectedSessionIds(prev => {
      const next = prev.includes(sessionId) ? prev.filter(id => id !== sessionId) : [...prev, sessionId];
      return next;
    });
    setSelectionsBySession({});
    setCurrentSelection(null);
  };

  const handleSelectionChange = (selection) => setCurrentSelection(selection);

  const handleServiceChange = (serviceId, quantity) => {
    setSelectedServices(prev => {
      const next = { ...prev };
      if (quantity <= 0) delete next[serviceId];
      else next[serviceId] = quantity;
      return next;
    });
  };

  const cartServiceItems = useMemo(() => {
    return showServices
      .filter(s => selectedServices[s.id] > 0)
      .map(s => ({ service_id: s.id, name: s.name, price: Number(s.price), quantity: selectedServices[s.id] }));
  }, [showServices, selectedServices]);

  const serviceSubtotal = cartServiceItems.reduce((sum, s) => sum + s.price * s.quantity, 0);

  // Frontend pack price calculation (mirrors backend packPricing.js with groups)
  const computePackPrices = () => {
    const itemsBySession = {};
    for (const sessionId of selectedSessionIds) {
      const sel = sessionId === currentSession?.id ? currentSelection : selectionsBySession[sessionId];
      const items = buildReservationItems(sel);
      if (items.length > 0) itemsBySession[sessionId] = items;
    }
    if (!packPricing || !Object.keys(packPricing).length) return { slots: [], totals: { subtotal: 0, servicesSubtotal: 0, discountAmount: 0, serviceFeeAmount: 0, total: 0 } };

    const slotsByGroupBySectionBySession = {};
    for (const [sessionId, items] of Object.entries(itemsBySession)) {
      for (const item of items) {
        const section = getPackSection(item);
        const group = getPackGroup(section);
        if (!slotsByGroupBySectionBySession[group]) slotsByGroupBySectionBySession[group] = {};
        if (!slotsByGroupBySectionBySession[group][section]) slotsByGroupBySectionBySession[group][section] = {};
        if (!slotsByGroupBySectionBySession[group][section][sessionId]) {
          slotsByGroupBySectionBySession[group][section][sessionId] = [];
        }
        slotsByGroupBySectionBySession[group][section][sessionId].push(...expandItemToSlots(item, sessionId));
      }
    }

    const result = [];
    for (const [group, slotsBySectionBySession] of Object.entries(slotsByGroupBySectionBySession)) {
      for (const [section, sessionSlots] of Object.entries(slotsBySectionBySession)) {
        const sessionIds = Object.keys(sessionSlots);
        for (const sessionId of sessionIds) {
          sessionSlots[sessionId].sort((a, b) => b.originalPrice - a.originalPrice);
        }
        const groupSessions = new Set();
        Object.values(slotsBySectionBySession).forEach(bySession => Object.keys(bySession).forEach(sid => groupSessions.add(sid)));
        const groupSessionSlots = {};
        for (const sessionId of groupSessions) {
          groupSessionSlots[sessionId] = [];
          for (const [sec, bySession] of Object.entries(slotsBySectionBySession)) {
            groupSessionSlots[sessionId].push(...(bySession[sessionId] || []));
          }
          groupSessionSlots[sessionId].sort((a, b) => b.originalPrice - a.originalPrice);
        }
        const maxCount = Math.max(0, ...Object.values(groupSessionSlots).map(slots => slots.length));
        for (let k = 0; k < maxCount; k++) {
          let depth = 0;
          for (const sessionId of groupSessions) {
            if (groupSessionSlots[sessionId].length > k) depth++;
          }
          depth = Math.min(Math.max(1, depth), Math.max(1, Number(packMaxSessions) || 3));
          const priceForDepth = packPricing?.[depth]?.[section] ?? packPricing?.[String(depth)]?.[section] ?? 0;
          for (const sessionId of sessionIds) {
            if (sessionSlots[sessionId].length > k) {
              const slot = sessionSlots[sessionId][k];
              slot.finalPrice = Number(priceForDepth);
              result.push(slot);
            }
          }
        }
      }
    }

    const subtotal = result.reduce((sum, slot) => sum + (slot.finalPrice || 0), 0);
    let discountAmount = 0;
    if (appliedDiscount) {
      const type = appliedDiscount.type;
      const value = Number(appliedDiscount.value || 0);
      if (type === 'percentage' || type === 'internal') {
        const percent = type === 'internal' ? 100 : value;
        const remaining = appliedDiscount.remaining_uses;
        if (remaining != null) {
          const ticketPrices = result.map(s => s.finalPrice || 0).sort((a, b) => b - a);
          const count = Math.min(ticketPrices.length, Number(remaining));
          discountAmount = Math.round(ticketPrices.slice(0, count).reduce((a, b) => a + b, 0) * (percent / 100));
        } else {
          discountAmount = Math.round(subtotal * (percent / 100));
        }
      } else if (type === 'fixed') {
        discountAmount = Math.round(value);
      }
      discountAmount = Math.min(discountAmount, subtotal);
    }
    const serviceFeeAmount = Math.round((subtotal - discountAmount + serviceSubtotal) * (serviceFeePercent / 100));
    const total = subtotal - discountAmount + serviceFeeAmount + serviceSubtotal;
    return { slots: result, totals: { subtotal, servicesSubtotal: serviceSubtotal, discountAmount, serviceFeeAmount, total } };
  };

  const { slots: packSlots, totals: packTotals } = useMemo(computePackPrices, [
    selectedSessionIds, selectionsBySession, currentSelection, currentSession, packPricing, packMaxSessions, appliedDiscount, serviceSubtotal, serviceFeePercent
  ]);

  const slotsBySession = useMemo(() => {
    const map = {};
    for (const slot of packSlots) {
      if (!map[slot.session_id]) map[slot.session_id] = [];
      map[slot.session_id].push(slot);
    }
    return map;
  }, [packSlots]);

  function getPackSection(item) {
    if (!item || !item.type) return 'unknown';
    const type = String(item.type).toLowerCase();
    if (type === 'butaca') return 'platea_general';
    if (type === 'palco') {
      const sec = String(item.section || '').toLowerCase();
      if (sec.includes('alto') || sec === 'palcos_altos') return 'palcos_altos';
      return 'palcos_bajos';
    }
    if (type === 'pullman') return 'pullman';
    if (type === 'general') return 'general';
    return item.section || 'unknown';
  }

  function getPackGroup(section) {
    if (section === 'platea_general' || section === 'pullman') return 'platea_pullman';
    if (section === 'palcos_bajos' || section === 'palcos_altos') return 'palcos';
    return section;
  }

  function getOriginalPrice(item) {
    if (!item) return 0;
    if (item.type === 'butaca' || item.type === 'palco') return Number(item.price || 0);
    return Number(item.unit_price || 0);
  }

  function expandItemToSlots(item, sessionId) {
    const base = {
      session_id: sessionId,
      type: item.type,
      section: getPackSection(item),
      seat_code: item.seat_code || null,
      capacity: item.type === 'palco' ? Number(item.capacity || 4) : 1,
      quantity: 1,
      originalPrice: getOriginalPrice(item),
      finalPrice: null
    };
    if (item.type === 'pullman' || item.type === 'general') {
      const qty = Math.max(1, Number(item.quantity || 1));
      return Array.from({ length: qty }, () => ({ ...base }));
    }
    return [base];
  }

  const validateDiscount = async () => {
    if (!discountCode.trim()) return;
    const totalSeats = packSlots.length;
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

  const createReservations = async (allSelections) => {
    const newReservations = {};
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    for (const sessionId of selectedSessionIds) {
      const items = buildReservationItems(allSelections[sessionId]);
      if (items.length === 0) throw new Error(`Faltan selecciones para la función ${sessionId}`);

      let existingReservation = null;
      if (user?.id) {
        try {
          const checkRes = await apiFetch(`/api/reservations?user_id=${user.id}&session_id=${sessionId}&status=active`, { headers });
          if (checkRes.ok) {
            const list = await checkRes.json();
            if (Array.isArray(list) && list.length > 0) {
              existingReservation = list[0];
            }
          }
        } catch {}
      }

      const body = { session_id: sessionId, items };
      if (user?.id) body.user_id = user.id;

      let res;
      let data;
      if (existingReservation?.id) {
        res = await apiFetch(`/api/reservations/${existingReservation.id}`, { method: 'PUT', headers, body: JSON.stringify(body) });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 409) {
            throw new Error(`Conflicto al actualizar la reserva para la función ${sessionId}: ${err.error || err.message || 'butacas no disponibles'}`);
          }
          throw new Error(err.message || `Error actualizando reserva para ${sessionId}`);
        }
        data = await res.json();
      } else {
        res = await apiFetch('/api/reservations', { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 409) {
            const reason = err.error || 'items_conflict';
            const message = err.message || 'butacas no disponibles';
            throw new Error(`Conflicto de reserva para la función ${sessionId}: ${reason} - ${message}`);
          }
          throw new Error(err.message || `Error creando reserva para ${sessionId}`);
        }
        data = await res.json();
      }
      newReservations[sessionId] = data;
    }
    setReservationsBySession(newReservations);
    return newReservations;
  };

  const fetchPreview = async (allSelections) => {
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const reservations = await createReservations(allSelections);
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
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleNextFunction = async () => {
    if (!isCurrentSelectionValid()) return;
    if (!currentSession) return;
    const updatedSelections = { ...selectionsBySession, [currentSession.id]: currentSelection };
    setSelectionsBySession(updatedSelections);

    if (currentSessionIndex < selectedSessionIds.length - 1) {
      setCurrentSelection(null);
      setCurrentSessionIndex(prev => prev + 1);
    } else {
      try {
        await fetchPreview(updatedSelections);
        setCurrentSelection(null);
        setStep('summary');
      } catch (e) {
        // Error already set in fetchPreview
      }
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

  const handleGuestFormSubmit = (data) => onGuestCheckoutNeeded?.(data);

  const cartTotalTickets = () => packSlots.length;

  const renderSessionItems = (selection, sessionId) => {
    const items = buildReservationItems(selection);
    if (items.length === 0) return <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Sin selección</p>;
    const slots = slotsBySession[sessionId] || [];
    let slotIdx = 0;
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, idx) => {
          const qty = item.quantity || 1;
          const itemSlots = slots.slice(slotIdx, slotIdx + qty);
          slotIdx += qty;
          const totalPrice = itemSlots.reduce((sum, s) => sum + (s?.finalPrice || 0), 0);
          const originalTotal = itemSlots.reduce((sum, s) => sum + (s?.originalPrice || 0), 0);
          const hasDiscount = totalPrice < originalTotal;
          return (
            <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#374151' }}>
                {item.type === 'butaca' && formatSeatLocation(item.seat_code, 'butaca')}
                {item.type === 'palco' && formatSeatLocation(item.seat_code, 'palco')}
                {(item.type === 'pullman' || item.type === 'general') && (item.type === 'general' ? 'Entrada General' : 'Pullman')}
                {qty > 1 ? ` x${qty}` : ''}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#111827' }}>
                {hasDiscount && (
                  <span style={{ fontSize: 11, color: '#dc2626', textDecoration: 'line-through', fontWeight: 400 }}>
                    {formatCurrency(originalTotal)}
                  </span>
                )}
                <span>{formatCurrency(totalPrice)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    );
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
          const selection = selectionsBySession[sid];
          const subtotal = (slotsBySession[sid] || []).reduce((sum, s) => sum + (s.finalPrice || 0), 0);
          return (
            <div key={sid} style={{ paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>Función {idx + 1}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{formatDateShort(session?.starts_at)} {formatTime(session?.starts_at)}</div>
              {renderSessionItems(selection, sid)}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginTop: 4, color: '#1e293b' }}>
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
            </div>
          );
        })}

        {currentSession && (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#166534', marginBottom: 2 }}>Función actual</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{formatDateShort(currentSession?.starts_at)} {formatTime(currentSession?.starts_at)}</div>
            {renderSessionItems(currentSelection, currentSession.id)}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginTop: 4, color: '#166534' }}>
              <span>Subtotal</span>
              <span>{formatCurrency((slotsBySession[currentSession.id] || []).reduce((sum, s) => sum + (s.finalPrice || 0), 0))}</span>
            </div>
          </div>
        )}

        {showServices.length > 0 && (
          <div style={{ paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>Servicios adicionales</div>
            {showServices.map(svc => {
              const qty = Math.min(selectedServices[svc.id] || 0, packSlots.length);
              return (
                <div key={svc.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>{svc.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{formatCurrency(svc.price)}/u</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" onClick={() => handleServiceChange(svc.id, (selectedServices[svc.id] || 0) - 1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 700 }}>−</button>
                    <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14 }}>{qty}</span>
                    <button type="button" onClick={() => handleServiceChange(svc.id, (selectedServices[svc.id] || 0) + 1)} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 700 }}>+</button>
                    {qty > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{formatCurrency(svc.price * qty)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!appliedDiscount ? (
          <div style={{ paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>¿Tenés un cupón?</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                placeholder="CÓDIGO"
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, textTransform: 'uppercase' }}
              />
              <button
                onClick={validateDiscount}
                disabled={!discountCode.trim() || loading}
                style={{ padding: '6px 12px', background: discountCode.trim() ? '#3b82f6' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, cursor: discountCode.trim() ? 'pointer' : 'not-allowed', fontWeight: 600 }}
              >
                Aplicar
              </button>
            </div>
            {discountError && <div style={{ marginTop: 4, fontSize: 11, color: '#dc3545' }}>{discountError}</div>}
          </div>
        ) : (
          <div style={{ padding: 8, background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>{appliedDiscount?.alias || discountCode}</div>
              <div style={{ fontSize: 11, color: '#059669' }}>Cupón aplicado</div>
            </div>
            <button onClick={() => { setAppliedDiscount(null); setDiscountCode(''); }} style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        )}

        <div style={{ paddingTop: 8, borderTop: '2px solid #333', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
            <span>Total entradas:</span>
            <span>{cartTotalTickets()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e293b' }}>
            <span>Subtotal pack:</span>
            <span>{formatCurrency(packTotals.subtotal)}</span>
          </div>
          {packTotals.discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 600 }}>
              <span>Descuento:</span>
              <span>-{formatCurrency(packTotals.discountAmount)}</span>
            </div>
          )}
          {packTotals.servicesSubtotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e40af' }}>
              <span>Servicios:</span>
              <span>{formatCurrency(packTotals.servicesSubtotal)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
            <span>Cargo por servicio ({serviceFeePercent}%):</span>
            <span>{formatCurrency(packTotals.serviceFeeAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, paddingTop: 6, borderTop: '1px solid #333', color: '#1e293b' }}>
            <span>TOTAL:</span>
            <span>{formatCurrency(packTotals.total)}</span>
          </div>
        </div>

        {currentSession && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <button
              onClick={handleNextFunction}
              disabled={!isCurrentSelectionValid() || loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: isCurrentSelectionValid() ? '#16a34a' : '#9ca3af',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: isCurrentSelectionValid() ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                fontSize: 15
              }}
            >
              {loading ? 'Procesando...' : currentSessionIndex < selectedSessionIds.length - 1 ? 'Siguiente función →' : `Ver resumen y pagar · ${formatCurrency(packTotals.total)}`}
            </button>
            <button
              onClick={() => window.location.href = '/'}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: '#fff',
                color: '#64748b',
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    );
  };

  if (!isGuest && !user) {
    return (
      <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd', maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginTop: 0 }}>Pack Multi-Función</h3>
        <p>Para comprar un pack de funciones, primero tenés que iniciar sesión o continuar como invitado.</p>
        <button onClick={() => onGuestCheckoutNeeded?.()} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Continuar</button>
        <button onClick={() => window.location.href = '/'} style={{ marginLeft: 12, padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
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
          <div style={{ marginBottom: 16, padding: 16, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Función {currentSessionIndex + 1} de {selectedSessionIds.length}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>{show.title}</div>
            <div style={{ fontSize: 15, color: '#166534' }}>{formatDateLong(currentSession.starts_at)} - {formatTime(currentSession.starts_at)} hs · {venueLabelMap[show?.venue_type] || currentSession.sala || 'Sala'}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: 'flex-start' }}>
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
                  ticketPrice={Number(getPricing(currentSelection).general || getPricing(currentSelection).platea_general || 0)}
                  onSelectionChange={handleSelectionChange}
                  sidebarContent={null}
                />
              )}
              {error && <p style={{ color: '#dc3545', marginTop: 16 }}>{error}</p>}
            </div>

            {!isMobile && (
              <div style={{ flex: '0 0 320px', maxWidth: 360 }}>
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

      {step === 'summary' && (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h4 style={{ marginBottom: 16, color: '#1e293b' }}>Resumen del Pack</h4>
          {!preview ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <p>{loading ? 'Cargando desglose...' : (error || 'No se pudo cargar el resumen. Intentá de nuevo.')}</p>
              {!loading && !error && (
                <button onClick={() => setStep('selectSeats')} style={{ marginTop: 16, padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                  Volver a la selección
                </button>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
