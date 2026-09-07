import { useEffect, useMemo, useState } from 'react';
import SeatSelection from './SeatSelection.jsx';
import GeneralAdmissionSelection from './GeneralAdmissionSelection.jsx';
import { apiFetch, apiAuthFetch } from '../lib/api.js';
import { formatDateLong, formatDateShort, formatTime } from '../lib/dateFormatter.js';
import { formatSeatLocation } from '../lib/seatFormatter.js';
import { getSeatPriceTier } from '../lib/seatPriceColors.js';

const venueLabelMap = {
  sala_principal: 'Sala Principal',
  el_tablado: 'El Tablado',
  las_gemelas: 'Nueva sala'
};

export default function BoxOfficePackCheckout({ show, sessions, token, onClose }) {
  const [step, setStep] = useState('sessions');
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0);
  const [selectionsBySession, setSelectionsBySession] = useState({});
  const [currentSelection, setCurrentSelection] = useState(null);
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', dni: '' });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState({});
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showQuickSaleModal, setShowQuickSaleModal] = useState(false);
  const [quickSalePhone, setQuickSalePhone] = useState('');
  const [preview, setPreview] = useState({ slots_by_session: {}, subtotal: 0, original_subtotal: 0, discount_amount: 0, total: 0 });
  const [previewLoading, setPreviewLoading] = useState(false);

  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const maxSessions = Math.max(1, Number(show.pack_max_sessions) || 3);
  const isSalaPrincipal = show.venue_type === 'sala_principal';
  const currentSession = selectedSessionIds[currentSessionIndex]
    ? sessions.find(session => session.id === selectedSessionIds[currentSessionIndex])
    : null;

  const formatCurrency = amount => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(Number(amount || 0));

  const buildItems = selection => {
    if (!selection) return [];
    const pricing = selection.pricing || {};
    const priceTiers = selection.priceTiers || [];
    const items = [];

    for (const seatCode of Array.from(selection.selectedSeatIds || [])) {
      const tier = priceTiers.length ? getSeatPriceTier(seatCode, priceTiers) : null;
      items.push({ type: 'butaca', seat_code: seatCode, price: Number(tier?.price || pricing.platea_general || 0) });
    }

    for (const seatCode of Array.from(selection.selectedPalcosLabels || [])) {
      const isPB = /^PB/i.test(seatCode);
      const tier = priceTiers.length ? getSeatPriceTier(seatCode, priceTiers) : null;
      items.push({
        type: 'palco',
        seat_code: seatCode,
        capacity: isPB ? 4 : 2,
        price: Number(tier?.price || (isPB ? pricing.palcos_bajos : pricing.palcos_altos) || 0)
      });
    }

    const quantity = isSalaPrincipal
      ? Number(selection.pullmanSelected || 0)
      : Number(selection.generalAdmissionCount || selection.pullmanSelected || 0);
    if (quantity > 0) {
      items.push({
        type: isSalaPrincipal ? 'pullman' : 'general',
        quantity,
        price: Number(isSalaPrincipal ? pricing.pullman || 0 : pricing.general || pricing.platea_general || 0)
      });
    }

    return items;
  };

  const currentSelectionValid = buildItems(currentSelection).length > 0;
  const allSelections = useMemo(() => ({
    ...selectionsBySession,
    ...(currentSession && currentSelection ? { [currentSession.id]: currentSelection } : {})
  }), [selectionsBySession, currentSelection, currentSession]);

  useEffect(() => {
    const selections = selectedSessionIds
      .map(sessionId => ({ session_id: sessionId, items: buildItems(allSelections[sessionId]) }))
      .filter(selection => selection.items.length > 0);
    if (selections.length === 0) {
      setPreview({ slots_by_session: {}, subtotal: 0, original_subtotal: 0, discount_amount: 0, total: 0 });
      return;
    }
    let active = true;
    setPreviewLoading(true);
    apiAuthFetch('/api/tickets/box-office-pack-preview', {
      method: 'POST',
      body: JSON.stringify({ selections, discount_id: appliedDiscount?.id || null })
    }, token)
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (active && data) setPreview(data);
      })
      .catch(() => {
        if (active) setPreview({ slots_by_session: {}, subtotal: 0, original_subtotal: 0, discount_amount: 0, total: 0 });
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => { active = false; };
  }, [allSelections, selectedSessionIds, appliedDiscount, token]);

  const setSessionSelected = sessionId => {
    setSelectedSessionIds(previous => {
      if (previous.includes(sessionId)) return previous.filter(id => id !== sessionId);
      if (previous.length >= maxSessions) return previous;
      return [...previous, sessionId];
    });
    setSelectionsBySession({});
    setCurrentSelection(null);
  };

  const handleSelectionChange = selection => setCurrentSelection(selection);

  const countPackTickets = () => Object.values(allSelections).reduce((sum, selection) => {
    return sum + buildItems(selection).reduce((itemSum, item) => itemSum + (item.type === 'palco' ? item.capacity : Number(item.quantity || 1)), 0);
  }, 0);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    const delaySearch = setTimeout(async () => {
      try {
        const res = await apiAuthFetch(
          `/api/users/search-quick?q=${encodeURIComponent(searchQuery)}`,
          { method: 'GET' },
          token
        );
        const data = await res.json();
        setSearchResults(data.users || []);
        setShowSearchResults(true);
      } catch (err) {
        console.error('Error searching customers:', err);
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(delaySearch);
  }, [searchQuery, token]);

  const selectCustomer = (selected) => {
    setCustomer({
      name: selected.name || '',
      email: selected.email || '',
      phone: selected.phone || '',
      dni: selected.dni || ''
    });
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    const ticketCount = countPackTickets();
    // Agregar items de todas las sesiones seleccionadas para validación de platea baja
    const allItems = Object.values(allSelections).flatMap(selection => buildItems(selection));
    setValidatingDiscount(true);
    setDiscountError('');
    try {
      const res = await apiFetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: discountCode.trim(), show_id: show.id, seat_count: ticketCount, items: allItems })
      });
      if (res.ok) {
        const discount = await res.json();
        if (discount.type === 'fixed' && discount.multiplier_hint && discount.multiplier_hint > 1) {
          discount.value = Number(discount.value) * discount.multiplier_hint;
        }
        setAppliedDiscount(discount);
        setDiscountError('');
      } else {
        const error = await res.json();
        setDiscountError(error.message || 'Código inválido');
        setAppliedDiscount(null);
      }
    } catch {
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

  const handleNext = (saleType = 'customer') => {
    if (!currentSession || !currentSelectionValid) return;
    const nextSelections = { ...selectionsBySession, [currentSession.id]: currentSelection };
    setSelectionsBySession(nextSelections);
    if (currentSessionIndex < selectedSessionIds.length - 1) {
      setCurrentSessionIndex(index => index + 1);
      setCurrentSelection(null);
      return;
    }
    if (saleType === 'quick') {
      setQuickSalePhone('');
      setShowQuickSaleModal(true);
    } else {
      setShowSaleModal(true);
    }
  };

  const packPreview = useMemo(() => {
    const count = Object.values(allSelections).reduce((sum, selection) => {
      return sum + buildItems(selection).reduce((itemSum, item) => itemSum + (item.type === 'palco' ? item.capacity : Number(item.quantity || 1)), 0);
    }, 0);
    return { count };
  }, [allSelections]);

  const renderSidebar = () => (
    <aside style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 16, color: '#1e293b' }}>Detalle de venta</h3>
      {selectedSessionIds.map((sessionId, index) => {
        const session = sessions.find(item => item.id === sessionId);
        const slots = preview.slots_by_session?.[sessionId] || [];
        const subtotal = slots.reduce((sum, slot) => sum + Number(slot.finalPrice || 0), 0);
        return (
          <div key={sessionId} style={{ paddingBottom: 10, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: sessionId === currentSession?.id ? '#166534' : '#1e293b' }}>{session?.function_name || `Función ${index + 1}`}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 5 }}>{formatDateShort(session?.starts_at)} · {formatTime(session?.starts_at)}</div>
            {slots.length === 0 ? <div style={{ fontSize: 13, color: '#94a3b8' }}>Sin ubicaciones seleccionadas</div> : slots.map((slot, slotIndex) => {
              const hasDiscount = Number(slot.finalPrice || 0) < Number(slot.originalPrice || 0);
              return (
                <div key={`${slotIndex}-${slot.seat_code || slot.type}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '3px 0' }}>
                  <span>{slot.type === 'butaca' || slot.type === 'palco' ? formatSeatLocation(slot.seat_code, slot.type) : slot.type === 'general' ? 'Entrada general' : 'Pullman'}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontWeight: 600 }}>
                    {hasDiscount && <span style={{ fontSize: 11, color: '#dc2626', textDecoration: 'line-through', fontWeight: 400 }}>{formatCurrency(slot.originalPrice)}</span>}
                    <span>{formatCurrency(slot.finalPrice)}</span>
                  </span>
                </div>
              );
            })}
            {slots.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontWeight: 700, fontSize: 13 }}><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>}
          </div>
        );
      })}
      <div style={{ paddingTop: 8, borderTop: '2px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}><span>Localidades</span><strong>{packPreview.count}</strong></div>
        {preview.original_subtotal > preview.subtotal && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#15803d', marginBottom: 5 }}><span>Descuento por pack</span><strong>-{formatCurrency(preview.original_subtotal - preview.subtotal)}</strong></div>}
        {Number(preview.discount_amount || 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#15803d', marginBottom: 5 }}><span>Descuento cupón</span><strong>-{formatCurrency(preview.discount_amount)}</strong></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800 }}><span>Total</span><span>{previewLoading ? 'Calculando...' : formatCurrency(preview.total ?? preview.subtotal)}</span></div>
      </div>
      {currentSession && currentSessionIndex < selectedSessionIds.length - 1 && <button onClick={() => handleNext('customer')} disabled={!currentSelectionValid} style={{ padding: 12, background: currentSelectionValid ? '#16a34a' : '#94a3b8', color: '#fff', border: 0, borderRadius: 6, cursor: currentSelectionValid ? 'pointer' : 'not-allowed', fontWeight: 700 }}>Siguiente función</button>}
      {currentSession && currentSessionIndex === selectedSessionIds.length - 1 && <>
        <button onClick={() => handleNext('customer')} disabled={!currentSelectionValid} style={{ padding: 12, background: currentSelectionValid ? '#000000' : '#94a3b8', color: '#fff', border: 0, borderRadius: 6, cursor: currentSelectionValid ? 'pointer' : 'not-allowed', fontWeight: 700 }}>Vender entradas</button>
        <button onClick={() => handleNext('quick')} disabled={!currentSelectionValid} style={{ padding: 12, background: currentSelectionValid ? '#000000' : '#f3f4f6', color: currentSelectionValid ? '#fff' : '#94a3b8', border: '2px solid #000000', borderRadius: 6, cursor: currentSelectionValid ? 'pointer' : 'not-allowed', fontWeight: 700 }}>Vender en función</button>
      </>}
      <button onClick={onClose} style={{ padding: 10, background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}>Cancelar venta</button>
    </aside>
  );

  const submitSale = async (event, saleCustomer = customer) => {
    event.preventDefault();
    if (!saleCustomer.name.trim()) {
      setError('El nombre del cliente es obligatorio');
      return;
    }

    const selections = selectedSessionIds.map(sessionId => ({
      session_id: sessionId,
      items: buildItems(allSelections[sessionId])
    }));

    if (selections.some(selection => selection.items.length === 0)) {
      setError('Cada función del pack debe tener al menos una entrada seleccionada');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await apiAuthFetch('/api/tickets/box-office-pack-sale', {
        method: 'POST',
        body: JSON.stringify({
          selections,
          customer: {
            name: saleCustomer.name.trim(),
            email: saleCustomer.email?.trim() || null,
            phone: saleCustomer.phone?.trim() || null,
            dni: saleCustomer.dni?.trim() || null
          },
          payment_method: paymentMethod,
          discount_id: appliedDiscount?.id || null
        })
      }, token);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'No se pudo registrar la venta del pack');
      setSuccess(data);
      setShowSaleModal(false);
      setShowQuickSaleModal(false);
    } catch (requestError) {
      setError(requestError.message || 'No se pudo registrar la venta del pack');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    const getSaleSession = sale => sessions.find(session => session.id === sale.session_id);
    const getShareUrl = sale => `${window.location.origin}/api/share/sale/${sale.id}`;
    const sendWhatsApp = sale => {
      const digits = String(customer.phone || '').replace(/\D/g, '');
      if (!digits) return;
      const session = getSaleSession(sale);
      const message = `Hola ${customer.name || 'Cliente'}! Te enviamos tus entradas para ${show.title}${session?.function_name ? ` - ${session.function_name}` : ''}.\n\nFunción: ${formatDateLong(session?.starts_at)} a las ${formatTime(session?.starts_at)} hs\n\nPodés ver tus entradas aquí: ${getShareUrl(sale)}\n\nTeatro Español Pigüé`;
      window.open(`https://wa.me/549${digits}?text=${encodeURIComponent(message)}`, '_blank');
    };
    const sendEmail = async sale => {
      if (!customer.email) return;
      setDeliveryStatus(previous => ({ ...previous, [sale.id]: 'sending' }));
      try {
        const response = await apiAuthFetch('/api/payments/email-sale', {
          method: 'POST',
          body: JSON.stringify({ sale_id: sale.id, email: customer.email })
        }, token);
        if (!response.ok) throw new Error('No se pudieron enviar las entradas');
        setDeliveryStatus(previous => ({ ...previous, [sale.id]: 'sent' }));
      } catch {
        setDeliveryStatus(previous => ({ ...previous, [sale.id]: 'error' }));
      }
    };

    return (
      <div style={{ maxWidth: 980, margin: '24px auto', padding: 24, background: '#fff', border: '1px solid #bbf7d0', borderRadius: 12 }}>
        <h2 style={{ marginTop: 0, color: '#166534' }}>Venta de pack registrada</h2>
        <p style={{ color: '#374151', marginBottom: 4 }}>{show.title}</p>
        <p style={{ fontSize: 18, fontWeight: 700, marginTop: 0 }}>Total cobrado: {formatCurrency(success.pack_sale?.total_amount)}</p>
        <p style={{ color: '#64748b' }}>{success.tickets_count} localidades en {success.sales?.length || selectedSessionIds.length} funciones. Cada función tiene su propio QR.</p>

        <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
          {(success.sales || []).map((sale, index) => {
            const session = getSaleSession(sale);
            const itemCount = buildItems(allSelections[sale.session_id]).reduce((count, item) => count + (item.type === 'palco' ? item.capacity : Number(item.quantity || 1)), 0);
            const emailStatus = deliveryStatus[sale.id];
            const hasPhone = Boolean(customer.phone?.replace(/\D/g, ''));
            const hasEmail = Boolean(customer.email);
            return (
              <section key={sale.id} style={{ padding: 18, border: '1px solid #d1d5db', borderRadius: 12, background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>{session?.function_name || `Función ${index + 1}`}</div>
                    <div style={{ marginTop: 4, color: '#475569' }}>{formatDateLong(session?.starts_at)} · {formatTime(session?.starts_at)} hs</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>{itemCount} localidad{itemCount === 1 ? '' : 'es'} · QR propio</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#166534' }}>{formatCurrency(sale.total_amount)}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => window.open(`${getShareUrl(sale)}?mode=print`, '_blank')} style={{ padding: '9px 14px', border: 'none', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Imprimir entradas</button>
                  <button type="button" onClick={() => sendWhatsApp(sale)} disabled={!hasPhone} style={{ padding: '9px 14px', border: 'none', borderRadius: 8, background: hasPhone ? '#000000' : '#d1d5db', color: hasPhone ? '#fff' : '#6b7280', fontWeight: 600, cursor: hasPhone ? 'pointer' : 'not-allowed' }}>Enviar por WhatsApp</button>
                  <button type="button" onClick={() => sendEmail(sale)} disabled={!hasEmail || emailStatus === 'sending'} style={{ padding: '9px 14px', border: 'none', borderRadius: 8, background: hasEmail ? '#000000' : '#d1d5db', color: hasEmail ? '#fff' : '#6b7280', fontWeight: 600, cursor: hasEmail ? 'pointer' : 'not-allowed' }}>{emailStatus === 'sending' ? 'Enviando...' : emailStatus === 'sent' ? 'Email enviado' : 'Enviar por email'}</button>
                </div>
                {emailStatus === 'error' && <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13 }}>No se pudieron enviar las entradas por email. Intentá nuevamente.</div>}
              </section>
            );
          })}
        </div>

        <button onClick={onClose} style={{ marginTop: 24, padding: '10px 16px', background: '#000000', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>Nueva venta</button>
      </div>
    );
  }

  if (step === 'sessions') {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>¿Para qué funciones querés entradas?</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b' }}>Podés iniciar una venta individual o elegir varias funciones para aplicar el precio especial del pack.</p>
          </div>
          <button onClick={onClose} style={{ padding: '8px 12px', background: '#fff', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {sessions.map(session => {
            const checked = selectedSessionIds.includes(session.id);
            const disabled = !checked && selectedSessionIds.length >= maxSessions;
            return (
              <label key={session.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, background: checked ? '#f0fdf4' : '#fff', border: `1px solid ${checked ? '#22c55e' : '#e5e7eb'}`, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => setSessionSelected(session.id)} />
                <span>{session.function_name && <strong>{session.function_name} · </strong>}<strong>{formatDateLong(session.starts_at)}</strong> · {formatTime(session.starts_at)} hs</span>
              </label>
            );
          })}
        </div>
        <button onClick={() => { setCurrentSessionIndex(0); setCurrentSelection(null); setStep('seats'); }} disabled={selectedSessionIds.length === 0} style={{ marginTop: 20, width: '100%', padding: 13, background: selectedSessionIds.length > 0 ? '#7c3aed' : '#94a3b8', color: '#fff', border: 0, borderRadius: 7, cursor: selectedSessionIds.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 700 }}>
          {selectedSessionIds.length === 1 ? 'Seleccionar ubicaciones' : 'Seleccionar ubicaciones para el pack'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto 16px', padding: 16, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Función {currentSessionIndex + 1} de {selectedSessionIds.length}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>{show.title}</div>
        {currentSession?.function_name && <div style={{ fontSize: 16, fontWeight: 600, color: '#166534' }}>{currentSession.function_name}</div>}
        {currentSession && <div style={{ color: '#166534' }}>{formatDateLong(currentSession.starts_at)} · {formatTime(currentSession.starts_at)} hs · {venueLabelMap[show.venue_type] || 'Sala'}</div>}
      </div>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 760px', minWidth: 0 }}>
          {currentSession && (isSalaPrincipal ? (
            <SeatSelection showId={show.id} sessionId={currentSession.id} userId={null} mode="boxoffice" compactMap onSelectionChange={handleSelectionChange} sidebarContent={null} />
          ) : (
            <GeneralAdmissionSelection showId={show.id} sessionId={currentSession.id} userId={null} mode="boxoffice" onSelectionChange={handleSelectionChange} sidebarContent={null} maxCapacity={currentSession.capacity_override || show.general_capacity} ticketPrice={Number(currentSelection?.pricing?.general || 0)} />
          ))}
          {error && <p style={{ color: '#dc2626', margin: '16px 0' }}>{error}</p>}
        </div>
        <div style={{ flex: '0 1 340px', minWidth: 280, width: '100%' }}>{renderSidebar()}</div>
      </div>
      {showSaleModal && (
        <div onClick={() => setShowSaleModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2100, padding: '24px 12px', overflowY: 'auto' }}>
          <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, padding: '20px 16px', boxShadow: '0 25px 60px -12px rgba(30,41,59,0.35)', position: 'relative', marginTop: 24, marginBottom: 24 }}>
            <button type="button" onClick={() => setShowSaleModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</button>
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Datos del espectador</h2>
            <p style={{ marginTop: 0, marginBottom: 20, color: '#6b7280', fontSize: 14 }}>Podés buscar un cliente existente o completar los datos manualmente para asociar la venta.</p>
            <form onSubmit={submitSale} style={{ display: 'grid', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Buscar cliente existente</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
                  placeholder="Nombre, email o DNI"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 16, boxSizing: 'border-box' }}
                />
                {showSearchResults && searchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)', maxHeight: 220, overflowY: 'auto', zIndex: 10 }}>
                    {searchResults.map((selectedCustomer) => (
                      <div key={selectedCustomer.id} onClick={() => selectCustomer(selectedCustomer)} style={{ padding: 12, borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                        <div style={{ fontWeight: 600 }}>{selectedCustomer.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          {selectedCustomer.email && <div>{selectedCustomer.email}</div>}
                          {selectedCustomer.dni && <div>DNI: {selectedCustomer.dni}</div>}
                          {selectedCustomer.phone && <div>{selectedCustomer.phone}</div>}
                          {selectedCustomer.is_registered === false && <div style={{ color: '#f59e0b', fontStyle: 'italic', marginTop: 4 }}>cliente no registrado en el sitio</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchQuery && searchResults.length === 0 && showSearchResults && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 8, padding: 12, fontSize: 13, color: '#6b7280' }}>
                    No se encontraron coincidencias
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 13, color: '#6b7280' }}>O completá los datos manualmente:</label>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Nombre *</label><input required value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} placeholder="Nombre y apellido" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: 16 }} /></div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Email</label><input type="email" value={customer.email} onChange={event => setCustomer({ ...customer, email: event.target.value })} placeholder="email@ejemplo.com" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: 16 }} /></div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Teléfono</label><input type="tel" value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} placeholder="Ej: 2994551234" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: 16 }} /></div>
                  <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>DNI</label><input value={customer.dni} onChange={event => setCustomer({ ...customer, dni: event.target.value.replace(/\D/g, '') })} placeholder="Sin puntos" maxLength={8} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: 16 }} /></div>
                </div>
              </div>
              <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Método de pago</label><select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}><option value="cash">Efectivo</option><option value="qr">QR</option></select></div>

              <div>
                {!appliedDiscount ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>Cupón de descuento:</label>
                    <input type="text" value={discountCode} onChange={event => setDiscountCode(event.target.value.toUpperCase())} placeholder="CÓDIGO" style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, textTransform: 'uppercase', boxSizing: 'border-box', fontSize: 16 }} />
                    <button type="button" onClick={handleApplyDiscount} disabled={!discountCode.trim() || validatingDiscount} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: discountCode.trim() ? '#16a34a' : '#d1d5db', color: '#ffffff', fontWeight: 600, cursor: discountCode.trim() ? 'pointer' : 'not-allowed' }}>{validatingDiscount ? '...' : 'Aplicar'}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#d1fae5', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#047857' }}>{appliedDiscount?.alias || discountCode}</div>
                      <div style={{ fontSize: 12, color: '#059669' }}>Cupón aplicado</div>
                    </div>
                    <button type="button" onClick={handleRemoveDiscount} style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', fontSize: 18 }}>×</button>
                  </div>
                )}
                {discountError && <div style={{ marginTop: 4, fontSize: 12, color: '#b91c1c' }}>{discountError}</div>}
              </div>

              {error && <div style={{ padding: 12, borderRadius: 8, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c' }}>{error}</div>}
              <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', display: 'grid', gap: 8, fontSize: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{formatCurrency(preview.subtotal)}</span></div>
                {Number(preview.discount_amount || 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 600 }}><span>Descuento</span><span>-{formatCurrency(preview.discount_amount)}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, paddingTop: 8, borderTop: '2px solid #1f2937' }}><span>Total</span><span>{formatCurrency(preview.total ?? preview.subtotal)}</span></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}><button type="button" onClick={() => setShowSaleModal(false)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button><button type="submit" disabled={loading} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: loading ? '#9ca3af' : '#000000', color: '#fff', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Procesando...' : `Confirmar venta (${formatCurrency(preview.total ?? preview.subtotal)})`}</button></div>
            </form>
          </div>
        </div>
      )}
      {showQuickSaleModal && (
        <div onClick={() => setShowQuickSaleModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 2100, padding: '24px 12px', overflowY: 'auto' }}>
          <div onClick={event => event.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 16, padding: '20px 16px', boxShadow: '0 25px 60px -12px rgba(30,41,59,0.35)', position: 'relative', marginTop: 24, marginBottom: 24 }}>
            <button type="button" onClick={() => setShowQuickSaleModal(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</button>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Venta en función</h2>
            <p style={{ marginTop: 0, marginBottom: 20, color: '#6b7280', fontSize: 14 }}>Venta rápida sin datos del espectador. Podés ingresar un teléfono para enviar las entradas por WhatsApp.</p>
            <form onSubmit={event => submitSale(event, { name: 'Venta en función', phone: quickSalePhone })} style={{ display: 'grid', gap: 16 }}>
              <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Teléfono (opcional)</label><input type="tel" value={quickSalePhone} onChange={event => setQuickSalePhone(event.target.value)} placeholder="Ej: 2924551234" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 16, boxSizing: 'border-box' }} /></div>
              <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Método de pago</label><select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 8, border: '1px solid #d1d5db', boxSizing: 'border-box' }}><option value="cash">Efectivo</option><option value="qr">QR</option></select></div>

              <div>
                {!appliedDiscount ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>Cupón:</label>
                    <input type="text" value={discountCode} onChange={event => setDiscountCode(event.target.value.toUpperCase())} placeholder="CÓDIGO" style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, textTransform: 'uppercase', boxSizing: 'border-box', fontSize: 16 }} />
                    <button type="button" onClick={handleApplyDiscount} disabled={!discountCode.trim() || validatingDiscount} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: discountCode.trim() ? '#16a34a' : '#d1d5db', color: '#ffffff', fontWeight: 600, cursor: discountCode.trim() ? 'pointer' : 'not-allowed' }}>{validatingDiscount ? '...' : 'Aplicar'}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#d1fae5', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#047857' }}>{appliedDiscount?.alias || discountCode}</div>
                      <div style={{ fontSize: 12, color: '#059669' }}>Cupón aplicado</div>
                    </div>
                    <button type="button" onClick={handleRemoveDiscount} style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', fontSize: 18 }}>×</button>
                  </div>
                )}
                {discountError && <div style={{ marginTop: 4, fontSize: 12, color: '#b91c1c' }}>{discountError}</div>}
              </div>

              {error && <div style={{ padding: 12, borderRadius: 8, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c' }}>{error}</div>}
              <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', display: 'grid', gap: 8, fontSize: 15 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{formatCurrency(preview.subtotal)}</span></div>
                {Number(preview.discount_amount || 0) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 600 }}><span>Descuento</span><span>-{formatCurrency(preview.discount_amount)}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, paddingTop: 8, borderTop: '2px solid #1f2937' }}><span>Total</span><span>{formatCurrency(preview.total ?? preview.subtotal)}</span></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}><button type="button" onClick={() => setShowQuickSaleModal(false)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#374151', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button><button type="submit" disabled={loading} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: loading ? '#9ca3af' : '#000000', color: '#fff', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Procesando...' : `Confirmar venta (${formatCurrency(preview.total ?? preview.subtotal)})`}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
