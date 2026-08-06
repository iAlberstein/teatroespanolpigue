import { useState, useEffect, useMemo } from 'react';
import SeatSelection from './SeatSelection.jsx';
import GeneralAdmissionSelection from './GeneralAdmissionSelection.jsx';
import { apiFetch } from '../lib/api';
import { formatDateLong, formatTime, formatDateShort } from '../lib/dateFormatter.js';
import { formatSeatLocation } from '../lib/seatFormatter.js';
import { getSeatPriceTier } from '../lib/seatPriceColors.js';
import GuestCheckoutForm from './GuestCheckoutForm.jsx';
import BoxOfficeReferences from './BoxOfficeReferences.jsx';

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
  const [currentSocketRef, setCurrentSocketRef] = useState(null);
  const [selectedServices, setSelectedServices] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [isWideLayout, setIsWideLayout] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1200 : false);

  useEffect(() => {
    window.history.pushState({ pack: true }, '');
    const onPopState = (e) => {
      if (!e.state || !e.state.pack) {
        window.location.href = '/';
      }
    };
    window.addEventListener('popstate', onPopState);
    const onResize = () => {
      setIsMobile(window.innerWidth < 1024);
      setIsWideLayout(window.innerWidth >= 1200);
    };
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

  const parsePricing = (value) => {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof value === 'object' ? value : {};
  };

  const packPricing = parsePricing(show?.pack_pricing_json);
  const packMaxSessions = show?.pack_max_sessions || 3;

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(Number(amount || 0));

  const getPricing = (selection) => {
    const sessionPricing = parsePricing(selection?.pricing);
    const showPricing = parsePricing(show?.pricing_json);
    return {
      platea_general: sessionPricing.platea_general || showPricing.platea_general || 0,
      palcos_bajos: sessionPricing.palcos_bajos || showPricing.palcos_bajos || 0,
      palcos_altos: sessionPricing.palcos_altos || showPricing.palcos_altos || 0,
      pullman: sessionPricing.pullman || showPricing.pullman || 0,
      general: sessionPricing.general || showPricing.general || 0
    };
  };
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
        quantity: 1,
        capacity: isPB ? 4 : 2,
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
      // Pack palcos use their configured section base price; seat tiers are only for platea.
      return Number(isPB ? pricing.palcos_bajos || 0 : pricing.palcos_altos || 0);
    }
    if (item.type === 'pullman') {
      return Number(pricing.pullman || 0);
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
    setCurrentSocketRef(null);
  };

  const handleSelectionChange = (selection) => {
    setCurrentSelection(selection);
    setCurrentSocketRef(selection?.socketRef || null);
  };

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
      items.forEach((item, idx) => {
        const section = getPackSection(item);
        const group = getPackGroup(section);
        if (!slotsByGroupBySectionBySession[group]) slotsByGroupBySectionBySession[group] = {};
        if (!slotsByGroupBySectionBySession[group][section]) slotsByGroupBySectionBySession[group][section] = {};
        if (!slotsByGroupBySectionBySession[group][section][sessionId]) {
          slotsByGroupBySectionBySession[group][section][sessionId] = [];
        }
        slotsByGroupBySectionBySession[group][section][sessionId].push(...expandItemToSlots(item, sessionId, idx));
      });
    }

    let result = [];
    for (const [group, slotsBySectionBySession] of Object.entries(slotsByGroupBySectionBySession)) {
      for (const [section, sessionSlots] of Object.entries(slotsBySectionBySession)) {
        const sessionIds = Object.keys(sessionSlots);
        for (const sessionId of sessionIds) {
          sessionSlots[sessionId].sort((a, b) => b.originalPrice - a.originalPrice);
        }
        const groupSessions = new Set();
        Object.values(slotsBySectionBySession).forEach(bySession => Object.keys(bySession).forEach(sid => groupSessions.add(sid)));
        const groupSessionSlots = {};
        const groupSlotEndPositions = new Map();
        for (const sessionId of groupSessions) {
          groupSessionSlots[sessionId] = [];
          for (const bySession of Object.values(slotsBySectionBySession)) {
            groupSessionSlots[sessionId].push(...(bySession[sessionId] || []));
          }
          groupSessionSlots[sessionId].sort((a, b) => b.originalPrice - a.originalPrice);
          let position = 0;
          for (const slot of groupSessionSlots[sessionId]) {
            position += slot.capacity || 1;
            groupSlotEndPositions.set(slot, position);
          }
        }
        for (const sessionId of sessionIds) {
          for (const slot of sessionSlots[sessionId]) {
            const endPosition = groupSlotEndPositions.get(slot) || 1;
            let depth = 0;
            for (const groupSessionId of groupSessions) {
              const units = groupSessionSlots[groupSessionId].reduce(
                (sum, groupSlot) => sum + (groupSlot.capacity || 1),
                0
              );
              if (units >= endPosition) depth++;
            }
            depth = Math.min(Math.max(1, depth), Math.max(1, Number(packMaxSessions) || 3));

            const priceForDepth = getPackPrice(depth, section);
            slot.finalPrice = Number(priceForDepth || slot.originalPrice || 0);
            result.push(slot);
          }
        }
      }
    }

    // Reorder slots so they follow the original item order within each session
    result = Object.values(
      result.reduce((acc, slot) => {
        if (!acc[slot.session_id]) acc[slot.session_id] = [];
        acc[slot.session_id].push(slot);
        return acc;
      }, {})
    ).flatMap(sessionSlots =>
      sessionSlots.sort((a, b) => {
        if (a.itemIndex !== b.itemIndex) return a.itemIndex - b.itemIndex;
        return (a.slotIndex || 0) - (b.slotIndex || 0);
      })
    );

    const subtotal = result.reduce((sum, slot) => sum + (slot.finalPrice || 0), 0);
    const originalSubtotal = result.reduce((sum, slot) => sum + (slot.originalPrice || 0), 0);
    const discountAmount = Math.max(0, originalSubtotal - subtotal);
    const serviceFeeAmount = Math.round((subtotal + serviceSubtotal) * (serviceFeePercent / 100));
    const total = subtotal + serviceFeeAmount + serviceSubtotal;
    return { slots: result, totals: { subtotal, originalSubtotal, servicesSubtotal: serviceSubtotal, discountAmount, serviceFeeAmount, total } };
  };

  const { slots: packSlots, totals: packTotals } = useMemo(computePackPrices, [
    selectedSessionIds, selectionsBySession, currentSelection, currentSession, packPricing, packMaxSessions, serviceSubtotal, serviceFeePercent
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

  function getPackGroup() {
    return 'pack';
  }

  function getPackPrice(depth, section) {
    const tier = packPricing?.[depth] || packPricing?.[String(depth)] || {};
    if (tier == null) return 0;
    if (tier[section] !== undefined && tier[section] !== '') return Number(tier[section]);
    const spaced = section.replace(/_/g, ' ');
    if (tier[spaced] !== undefined && tier[spaced] !== '') return Number(tier[spaced]);
    const lower = Object.keys(tier).find(k => k.toLowerCase().replace(/ /g, '_') === section);
    if (lower !== undefined && tier[lower] !== '') return Number(tier[lower]);
    return 0;
  }

  const selectedPackPricing = useMemo(() => {
    const regularPricing = getPricing(currentSelection);
    const depth = Math.max(1, Math.min(selectedSessionIds.length, Number(packMaxSessions) || 1));
    const sections = ['platea_general', 'palcos_bajos', 'palcos_altos', 'pullman', 'general'];
    return sections.reduce((pricing, section) => {
      pricing[section] = getPackPrice(depth, section) || regularPricing[section] || 0;
      return pricing;
    }, {});
  }, [currentSelection, selectedSessionIds.length, packMaxSessions, packPricing]);

  function getOriginalPrice(item) {
    if (!item) return 0;
    // Use single-function pack price as original so the discount matches /info display
    const section = getPackSection(item);
    const packPrice1 = getPackPrice(1, section);
    if (packPrice1 > 0) return packPrice1;
    if (item.type === 'butaca' || item.type === 'palco') return Number(item.price || 0);
    return Number(item.unit_price || 0);
  }

  function expandItemToSlots(item, sessionId, itemIndex) {
    const base = {
      session_id: sessionId,
      type: item.type,
      section: getPackSection(item),
      seat_code: item.seat_code || null,
      capacity: item.type === 'palco'
        ? Number(item.capacity || (getPackSection(item) === 'palcos_altos' ? 2 : 4))
        : 1,
      quantity: 1,
      itemIndex,
      originalPrice: getOriginalPrice(item),
      finalPrice: null
    };
    if (item.type === 'pullman' || item.type === 'general') {
      const qty = Math.max(1, Number(item.quantity || 1));
      return Array.from({ length: qty }, (_, idx) => ({ ...base, slotIndex: idx }));
    }
    return [{ ...base, slotIndex: 0 }];
  }

  const createReservations = async (allSelections) => {
    const newReservations = {};
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (currentSocketRef?.current?.id) headers['x-socket-id'] = currentSocketRef.current.id;

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

  const handleNextFunction = async () => {
    if (!isCurrentSelectionValid()) return;
    if (!currentSession) return;
    const updatedSelections = { ...selectionsBySession, [currentSession.id]: currentSelection };
    setSelectionsBySession(updatedSelections);

    if (currentSessionIndex < selectedSessionIds.length - 1) {
      setCurrentSelection(null);
      setCurrentSocketRef(null);
      setCurrentSessionIndex(prev => prev + 1);
    } else {
      await handlePay(updatedSelections);
    }
  };

  const handlePay = async (allSelections) => {
    if (!isGuest && !user) {
      onGuestCheckoutNeeded?.();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const reservations = await createReservations(allSelections);
      const reservationIds = Object.values(reservations).map(r => r.id);
      const payload = {
        reservation_ids: reservationIds,
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
        sessionStorage.removeItem('sipago_guest_data');
        if (orderUuid) {
          sessionStorage.setItem('sipago_order_uuid', String(orderUuid));
          sessionStorage.setItem('sipago_pack_id', String(data.pack_id));
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

  const cartTotalTickets = () => packSlots.reduce((sum, slot) => sum + (slot.capacity || 1), 0);

  const renderSessionItems = (selection, sessionId) => {
    const items = buildReservationItems(selection);
    if (items.length === 0) return <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Sin selección</p>;
    const slots = slotsBySession[sessionId] || [];
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, idx) => {
          const qty = item.quantity || 1;
          const itemSlots = slots.filter(slot => slot.itemIndex === idx);
          const totalPrice = itemSlots.reduce((sum, s) => sum + (s?.finalPrice || 0), 0);
          const originalTotal = itemSlots.reduce((sum, s) => sum + (s?.originalPrice || 0), 0);
          const hasDiscount = totalPrice < originalTotal;
          return (
            <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ color: '#374151' }}>
                {item.type === 'butaca' && formatSeatLocation(item.seat_code, 'butaca')}
                {item.type === 'palco' && `${formatSeatLocation(item.seat_code, 'palco')} (x${item.capacity || (item.seat_code?.startsWith('PB') ? 4 : 2)} localidades)`}
                {(item.type === 'pullman' || item.type === 'general') && (item.type === 'general' ? 'Entrada General' : 'Pullman')}
                {(item.type === 'pullman' || item.type === 'general') && qty > 1 ? ` x${qty} localidades` : ''}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0, fontWeight: 600, color: '#111827' }}>
                {hasDiscount && (
                  <span style={{ fontSize: 11, color: '#dc2626', textDecoration: 'line-through', fontWeight: 400, lineHeight: 1.2 }}>
                    {formatCurrency(originalTotal)}
                  </span>
                )}
                <span style={{ lineHeight: 1.2 }}>{formatCurrency(totalPrice)}</span>
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
          const slots = slotsBySession[sid] || [];
          const subtotal = slots.reduce((sum, s) => sum + (s.finalPrice || 0), 0);
          const originalSubtotal = slots.reduce((sum, s) => sum + (s.originalPrice || 0), 0);
          const hasDiscount = subtotal < originalSubtotal;
          return (
            <div key={sid} style={{ paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b', marginBottom: 2 }}>{session?.function_name || `Función ${idx + 1}`}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{formatDateShort(session?.starts_at)} {formatTime(session?.starts_at)}</div>
              {renderSessionItems(selection, sid)}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginTop: 4, color: '#1e293b' }}>
                <span>Subtotal</span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
                  {hasDiscount && (
                    <span style={{ fontSize: 11, color: '#dc2626', textDecoration: 'line-through', fontWeight: 400, lineHeight: 1.2 }}>
                      {formatCurrency(originalSubtotal)}
                    </span>
                  )}
                  <span style={{ lineHeight: 1.2 }}>{formatCurrency(subtotal)}</span>
                </span>
              </div>
            </div>
          );
        })}

        {currentSession && (
          <div style={{ paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#166534', marginBottom: 2 }}>{currentSession.function_name || 'Función actual'}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{formatDateShort(currentSession?.starts_at)} {formatTime(currentSession?.starts_at)}</div>
            {renderSessionItems(currentSelection, currentSession.id)}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginTop: 4, color: '#166534' }}>
              <span>Subtotal</span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0 }}>
                {(() => {
                  const slots = slotsBySession[currentSession.id] || [];
                  const subtotal = slots.reduce((sum, s) => sum + (s.finalPrice || 0), 0);
                  const originalSubtotal = slots.reduce((sum, s) => sum + (s.originalPrice || 0), 0);
                  if (subtotal < originalSubtotal) {
                    return (
                      <>
                        <span style={{ fontSize: 11, color: '#dc2626', textDecoration: 'line-through', fontWeight: 400, lineHeight: 1.2 }}>
                          {formatCurrency(originalSubtotal)}
                        </span>
                        <span style={{ lineHeight: 1.2 }}>{formatCurrency(subtotal)}</span>
                      </>
                    );
                  }
                  return <span style={{ lineHeight: 1.2 }}>{formatCurrency(subtotal)}</span>;
                })()}
              </span>
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

        <div style={{ paddingTop: 8, borderTop: '2px solid #333', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1e293b' }}>
            <span>Total entradas:</span>
            <span>{cartTotalTickets()}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e293b' }}>
            <span>Subtotal pack:</span>
            <span>{formatCurrency(packTotals.subtotal)}</span>
          </div>
          {packTotals.servicesSubtotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e40af' }}>
              <span>Servicios:</span>
              <span>{formatCurrency(packTotals.servicesSubtotal)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
            <span>Cargo por servicio:</span>
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
              {loading ? 'Procesando...' : currentSessionIndex < selectedSessionIds.length - 1 ? 'Siguiente función →' : `Pagar · ${formatCurrency(packTotals.total)}`}
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
        <p>Para continuar, iniciá sesión o continuá como invitado.</p>
        <button onClick={() => onGuestCheckoutNeeded?.()} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Continuar</button>
        <button onClick={() => onClose?.() || (window.location.href = '/')} style={{ marginLeft: 12, padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
      </div>
    );
  }

  if (isGuest && !guestData) {
    return (
      <div style={{ padding: 24, background: '#fff', borderRadius: 12, border: '1px solid #ddd', maxWidth: 600, margin: '0 auto' }}>
        <h3 style={{ marginTop: 0 }}>Tus datos</h3>
        <GuestCheckoutForm onSubmit={handleGuestFormSubmit} onCancel={() => onClose?.() || (window.location.href = '/')} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: isMobile ? '16px 0' : 24, boxSizing: 'border-box' }}>
      {step === 'selectSessions' && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h4 style={{ marginBottom: 8, color: '#1e293b' }}>¿Para qué funciones querés entradas?</h4>
          <div style={{ marginBottom: 16, padding: 12, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, color: '#166534', fontSize: 14, lineHeight: 1.5 }}>
            Espectáculo dividido en varios días. Comprando entradas para más de una función, tus entradas tienen descuento.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {sessions.map(session => (
              <label key={session.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', background: selectedSessionIds.includes(session.id) ? '#eff6ff' : '#fff' }}>
                <input
                  type="checkbox"
                  checked={selectedSessionIds.includes(session.id)}
                  onChange={() => handleSessionToggle(session.id)}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#1e293b' }}>{session.function_name && <>{session.function_name} · </>}{formatDateLong(session.starts_at)} - {formatTime(session.starts_at)}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{session.sala || venueLabelMap[show?.venue_type] || 'Sala'}</div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => onClose?.() || (window.location.href = '/')} style={{ padding: '10px 20px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
            <button
              onClick={() => { setCurrentSessionIndex(0); setStep('selectSeats'); }}
              disabled={selectedSessionIds.length < 1}
              style={{ padding: '12px 24px', background: selectedSessionIds.length >= 1 ? '#16a34a' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, cursor: selectedSessionIds.length >= 1 ? 'pointer' : 'not-allowed', fontWeight: 600 }}
            >
              {selectedSessionIds.length === 1 ? 'Seleccionar butacas' : 'Seleccionar mis butacas'}
            </button>
          </div>
        </div>
      )}

      {step === 'selectSeats' && currentSession && (
        <>
          {isSalaPrincipal && (
            <div
              style={{
                padding: isMobile ? '0 16px' : 0,
                marginBottom: 16
              }}
            >
              <BoxOfficeReferences
                isWideLayout={isWideLayout}
                pricing={selectedPackPricing}
                formatCurrency={formatCurrency}
              />
            </div>
          )}

          <div style={{ marginBottom: 16, padding: 16, background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
            <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Función {currentSessionIndex + 1} de {selectedSessionIds.length}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>{show.title}</div>
            {currentSession.function_name && <div style={{ fontSize: 16, fontWeight: 600, color: '#166534' }}>{currentSession.function_name}</div>}
            <div style={{ fontSize: 15, color: '#166534' }}>{formatDateLong(currentSession.starts_at)} - {formatTime(currentSession.starts_at)} hs · {venueLabelMap[show?.venue_type] || currentSession.sala || 'Sala'}</div>
          </div>

          {!isWideLayout && isSalaPrincipal && (
            <div style={{ textAlign: 'center', padding: '8px 16px 0', marginBottom: 4 }}>
              <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Elegí tus ubicaciones en el mapa</p>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Más abajo está tu carrito de compras</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: isMobile ? 'stretch' : 'flex-start', width: '100%' }}>
            <div style={{ flex: '1 1 0%', minWidth: 0, width: '100%' }}>
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
                  ticketPrice={Number(selectedPackPricing.general || selectedPackPricing.platea_general || 0)}
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

    </div>
  );
}
