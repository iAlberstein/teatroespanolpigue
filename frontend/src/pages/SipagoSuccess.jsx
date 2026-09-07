import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatDateLong, formatTime, formatDateShort } from '../lib/dateFormatter.js';
import { theme } from '../styles/theme.js';

export default function SipagoSuccess(){
  const [searchParams] = useSearchParams();
  const reservationIdParam = searchParams.get('reservation_id');
  const attemptIdParam = searchParams.get('attempt_id');
  const packIdParam = searchParams.get('pack_id');
  const discountIdParam = searchParams.get('discount_id');

  const [attemptId] = useState(() => attemptIdParam || sessionStorage.getItem('sipago_attempt_id') || '');
  const [paymentStatus, setPaymentStatus] = useState(attemptId ? 'pending' : null);
  const [verificationPending, setVerificationPending] = useState(false);
  const confirmRequested = useRef(false);
  const [reservation, setReservation] = useState(null);
  const [reservationId, setReservationId] = useState(reservationIdParam || '');
  const [packId, setPackId] = useState(packIdParam || '');
  const [packData, setPackData] = useState(null);
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [saleId, setSaleId] = useState(null);
  const [serviceFeePercent, setServiceFeePercent] = useState(10);
  const [saleBreakdown, setSaleBreakdown] = useState(null);
  const [emailAutoSent, setEmailAutoSent] = useState(false);
  const [autoSentEmail, setAutoSentEmail] = useState('');
  const [saleServiceItems, setSaleServiceItems] = useState([]);
  const [servicesSubtotal, setServicesSubtotal] = useState(0);

  useEffect(() => {
    if (!attemptId || packId) return;
    let stopped = false;
    let attempts = 0;
    const checkStatus = async () => {
      attempts++;
      try {
        const response = await apiFetch(`/api/payments/sipago-status/${attemptId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'status_unavailable');
        if (stopped) return;
        setPaymentStatus(data.status);
        setVerificationPending(Boolean(data.verification_pending));
        if (data.reservation_id) setReservationId(data.reservation_id);
        if (data.sale_id) setSaleId(data.sale_id);
        if (data.status === 'success' && !data.sale_id && !confirmRequested.current) {
          confirmRequested.current = true;
          const confirmResponse = await apiFetch('/api/payments/sipago-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attempt_id: attemptId })
          });
          if (!confirmResponse.ok) {
            confirmRequested.current = false;
            setPaymentStatus('processing_error');
            setVerificationPending(true);
          }
        }
      } catch {
        if (!stopped) setVerificationPending(true);
      }
    };
    checkStatus();
    const interval = setInterval(() => {
      if (attempts >= 60) return clearInterval(interval);
      checkStatus();
    }, 2000);
    return () => { stopped = true; clearInterval(interval); };
  }, [attemptId, packId]);

  useEffect(() => {
    if (!reservationId) return;
    apiFetch(`/api/reservations/${reservationId}`)
      .then(r=>r.json())
      .then(data => {
        setReservation(data);
        if (data && data.status === 'confirmed' && data.sale_id) {
          setSaleId(data.sale_id);
        }
      })
      .catch(()=>setReservation(null));
  }, [reservationId]);

  useEffect(() => {
    // Read pack_id from URL or sessionStorage
    let pid = packIdParam;
    if (!pid) {
      try {
        pid = sessionStorage.getItem('sipago_pack_id');
      } catch {}
    }
    if (pid) setPackId(pid);
  }, [packIdParam]);

  useEffect(() => {
    if (packId) return;
    if (!reservationId) return;
    let attempts = 0;
    const maxAttempts = 15;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await apiFetch(`/api/payments/sale/${reservationId}`);
        const data = await res.json();
        if (data.sale_id) {
          setSaleId(data.sale_id);
          setSaleBreakdown(data);
          if (data.discount) setAppliedDiscount(data.discount);
          if (data.service_fee_percent !== undefined) setServiceFeePercent(data.service_fee_percent);
          if (Array.isArray(data.service_items)) { setSaleServiceItems(data.service_items); setServicesSubtotal(data.services_subtotal || 0); }
          if (data.customer_email) {
            setEmail(prev => prev || data.customer_email);
            setAutoSentEmail(data.customer_email);
          }
          if (data.email_auto_sent) setEmailAutoSent(true);
          clearInterval(interval);
        } else {
          // Even without sale_id, use the breakdown for display
          if (data.subtotal !== undefined) setSaleBreakdown(data);
          if (data.discount) setAppliedDiscount(data.discount);
          if (data.service_fee_percent !== undefined) setServiceFeePercent(data.service_fee_percent);
          if (attempts >= maxAttempts) clearInterval(interval);
        }
      } catch (err) {
        if (attempts >= maxAttempts) clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reservationId, packId]);

  // Poll pack sale data
  useEffect(() => {
    if (!packId) return;
    let attempts = 0;
    const maxAttempts = 15;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await apiFetch(`/api/payments/pack-sale/${packId}`);
        const data = await res.json();
        if (data && data.pack_id) {
          setPackData(data);
          if (data.customer_email) {
            setEmail(prev => prev || data.customer_email);
            setAutoSentEmail(data.customer_email);
            setEmailAutoSent(true);
          }
          if (data.payment_status === 'approved') {
            clearInterval(interval);
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
          }
        }
      } catch (err) {
        if (attempts >= maxAttempts) clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [packId]);

  // Fallback confirm if webhook didn't process yet
  useEffect(() => {
    if (packId || attemptId) return;
    if (!reservationId || saleId) return;
    let aborted = false;
    const timer = setTimeout(async () => {
      try {
        const storedOrderUuid = sessionStorage.getItem('sipago_order_uuid');
        const storedDiscountId = sessionStorage.getItem('sipago_discount_id');
        const storedGuestData = sessionStorage.getItem('sipago_guest_data');
        const storedServiceItems = sessionStorage.getItem('sipago_service_items');
        
        // Parse guest data if available
        let guestData = null;
        try {
          if (storedGuestData) guestData = JSON.parse(storedGuestData);
        } catch {}
        let serviceItems = null;
        try {
          if (storedServiceItems) serviceItems = JSON.parse(storedServiceItems);
        } catch {}
        
        const payload = {
          reservation_id: reservationId,
          order_uuid: storedOrderUuid || undefined,
          discount_id: discountIdParam || storedDiscountId || undefined,
          service_items: Array.isArray(serviceItems) && serviceItems.length > 0 ? serviceItems : undefined,
          customer_name: guestData?.name || undefined,
          customer_email: guestData?.email || undefined,
          customer_phone: guestData?.phone || undefined,
          customer_dni: guestData?.dni || undefined,
          customer_provincia: guestData?.provincia || undefined,
          customer_localidad: guestData?.localidad || undefined
        };
        await apiFetch('/api/payments/sipago-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        // Clear stored values after confirm attempt
        sessionStorage.removeItem('sipago_order_uuid');
        sessionStorage.removeItem('sipago_reservation_id');
        sessionStorage.removeItem('sipago_discount_id');
        sessionStorage.removeItem('sipago_guest_data');
        sessionStorage.removeItem('sipago_service_items');
      } catch {}
    }, 2000);
    return () => { aborted = true; clearTimeout(timer); };
  }, [reservationId, saleId, packId, attemptId]);

  // Fallback pack confirm if webhook didn't process yet
  useEffect(() => {
    if (!packId || (packData && packData.payment_status === 'approved')) return;
    const timer = setTimeout(async () => {
      try {
        const storedOrderUuid = sessionStorage.getItem('sipago_order_uuid');
        const storedDiscountId = sessionStorage.getItem('sipago_discount_id');
        const storedGuestData = sessionStorage.getItem('sipago_guest_data');
        let guestData = null;
        try { if (storedGuestData) guestData = JSON.parse(storedGuestData); } catch {}
        const payload = {
          pack_id: packId,
          order_uuid: storedOrderUuid || undefined,
          discount_id: discountIdParam || storedDiscountId || undefined,
          customer_name: guestData?.name || undefined,
          customer_email: guestData?.email || undefined,
          customer_phone: guestData?.phone || undefined,
          customer_dni: guestData?.dni || undefined,
          customer_provincia: guestData?.provincia || undefined,
          customer_localidad: guestData?.localidad || undefined
        };
        await apiFetch('/api/payments/sipago-pack-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        sessionStorage.removeItem('sipago_order_uuid');
        sessionStorage.removeItem('sipago_pack_id');
        sessionStorage.removeItem('sipago_discount_id');
        sessionStorage.removeItem('sipago_guest_data');
      } catch {}
    }, 2000);
    return () => clearTimeout(timer);
  }, [packId, packData]);

  const formatSeatLocation = (seatCode, type) => {
    if (!seatCode) return type === 'pullman' ? 'Pullman' : '';
    if (type === 'butaca') {
      const match = seatCode.match(/([A-Za-z]+)(\d+)/);
      if (match) {
        const [, fila, num] = match;
        return `Platea Baja - Fila ${fila.toUpperCase()} - Butaca ${num}`;
      }
      return `Platea - ${seatCode}`;
    }
    if (type === 'palco') {
      const isPB = /^PB/i.test(seatCode);
      const num = seatCode.replace(/^P[BA]\s*/i, '');
      return isPB ? `Palco Bajo - ${num}` : `Palco Alto - ${num}`;
    }
    return seatCode;
  };

  const calculateTotals = () => {
    // Use pack data if available (authoritative source)
    if (packData && packData.total_amount !== undefined) {
      return {
        subtotal: packData.subtotal || 0,
        discountAmount: packData.discount_amount || 0,
        serviceCharge: packData.service_fee_amount || 0,
        servicesSubtotal: packData.services_subtotal || 0,
        total: packData.total_amount || 0
      };
    }
    // Use backend-computed breakdown if available (authoritative source)
    if (saleBreakdown && saleBreakdown.subtotal !== undefined) {
      return {
        subtotal: saleBreakdown.subtotal,
        discountAmount: saleBreakdown.discount_amount || 0,
        serviceCharge: saleBreakdown.service_fee_amount || 0,
        servicesSubtotal: saleBreakdown.services_subtotal || 0,
        total: saleBreakdown.total || 0
      };
    }
    // Fallback: compute from reservation items (before sale endpoint responds)
    if (!reservation?.items) return { subtotal: 0, discountAmount: 0, serviceCharge: 0, servicesSubtotal: 0, total: 0 };
    const subtotal = reservation.items.reduce((sum, it) => {
      if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
      if (it.type === 'pullman' || it.type === 'general') return sum + (Number(it.price || it.unit_price || 0) * Number(it.quantity || 1));
      return sum;
    }, 0);
    let discountAmount = 0;
    let subtotalAfterDiscount = subtotal;
    if (appliedDiscount) {
      if (appliedDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
      } else if (appliedDiscount.type === 'fixed') {
        discountAmount = Math.round(appliedDiscount.value);
      }
      discountAmount = Math.min(discountAmount, subtotal);
      subtotalAfterDiscount = subtotal - discountAmount;
    }
    const svcSubtotal = servicesSubtotal;
    const serviceCharge = Math.round((subtotalAfterDiscount + svcSubtotal) * (serviceFeePercent / 100));
    const total = subtotalAfterDiscount + serviceCharge + svcSubtotal;
    return { subtotal, discountAmount, serviceCharge, servicesSubtotal: svcSubtotal, total };
  };

  const { subtotal, discountAmount, serviceCharge, servicesSubtotal: calcServicesSubtotal, total } = calculateTotals();
  const purchaseConfirmed = packId ? packData?.payment_status === 'approved' : Boolean(saleId);

  const onSendEmail = async () => {
    if (packId) return onSendPackEmail();
    if (!reservationId || !email) return;
    setSendingEmail(true);
    try {
      const res = await apiFetch('/api/payments/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: reservationId, email })
      });
      if (res.ok) {
        alert('✅ Email enviado correctamente');
      } else {
        const error = await res.json();
        alert('❌ Error al enviar email: ' + (error.error || 'Error desconocido'));
      }
      setEmailSent(res.ok);
    } catch (err) {
      alert('❌ Error al enviar email: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const onSendPackEmail = async () => {
    if (!packId || !packData || !email) return;
    setSendingEmail(true);
    let ok = true;
    for (const sale of packData.sales || []) {
      try {
        const res = await apiFetch('/api/payments/email-sale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sale_id: sale.id, email })
        });
        if (!res.ok) ok = false;
      } catch {
        ok = false;
      }
    }
    setEmailSent(ok);
    setSendingEmail(false);
    alert(ok ? '✅ Emails del pack enviados correctamente' : '❌ Hubo un error enviando algunos emails');
  };

  const onSendWhatsapp = () => {
    if (!whatsapp) return;
    const cleanPhone = whatsapp.replace(/[\s\-()]/g, '');
    const showName = reservation?.session?.show?.title || packData?.sales?.[0]?.show_title || 'el espectáculo';
    const sessionDate = reservation?.session?.starts_at
      ? formatDateShort(reservation.session.starts_at)
      : '';
    const sessionTime = reservation?.session?.starts_at
      ? formatTime(reservation.session.starts_at)
      : '';
    let shareUrl;
    let message;
    if (packData?.sales?.length) {
      const links = packData.sales.map((s, i) => `Función ${i + 1}: ${window.location.origin}/api/share/sale/${s.id}`).join('\n');
      message = `Hola! Te comparto tus entradas del pack para ${showName}:\n\n${links}\n\nRecordá llegar al menos 30 minutos antes y mostrar el QR en el acceso. Una vez comenzada la función, la ubicación pierde validez.\n\nLas entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo.\n\n¡Nos vemos!`;
    } else {
      if (!saleId) return;
      shareUrl = `${window.location.origin}/api/share/sale/${saleId}`;
      message = `Hola! Te comparto tus entradas para el show ${showName}${sessionDate ? ` del día ${sessionDate}` : ''}${sessionTime ? ` a las ${sessionTime}` : ''}.\n\n Ver entradas: ${shareUrl}\n\nRecordá llegar al menos 30 minutos antes y mostrar el QR en el acceso. Una vez comenzada la función, la ubicación pierde validez (el personal de la sala te asignará un nuevo lugar).\n\nLas entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo.\n\n(Si no podés acceder al link, es porque no tenés agendado este número. Una vez que lo hagas, podrás acceder)\n\n¡Nos vemos!`;
    }
    const waUrl = `https://wa.me/549${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    setWhatsappSent(true);
  };

  if (!packId && attemptId && !saleId && paymentStatus !== 'success') {
    const expired = paymentStatus === 'expired';
    const rejected = paymentStatus === 'rejected';
    const creationFailed = paymentStatus === 'creation_failed';
    const showId = reservation?.session?.show?.id;
    const sessionId = reservation?.session?.id || reservation?.session_id;
    const retryHref = showId ? `/detalle/${showId}${sessionId ? `?sesion=${sessionId}` : ''}` : '/agenda';
    const title = expired ? 'El tiempo para pagar venció' : rejected ? 'El pago fue rechazado' : creationFailed ? 'No pudimos iniciar el pago' : verificationPending ? 'No pudimos verificar el pago todavía' : 'Estamos verificando tu pago';
    const message = expired
      ? 'La operación no fue aprobada y las butacas fueron liberadas. Podés seleccionarlas nuevamente si continúan disponibles.'
      : rejected
        ? 'SiPago no aprobó la operación. No se realizó la compra ni se emitieron entradas.'
        : creationFailed
          ? 'SiPago no pudo crear la operación y no se realizó ningún cobro. Podés volver al espectáculo e intentarlo nuevamente.'
        : verificationPending
          ? 'SiPago todavía no pudo confirmar el resultado. No vuelvas a pagar hasta verificar el estado para evitar una operación duplicada.'
          : 'La operación todavía no tiene una confirmación definitiva. Esta página se actualizará automáticamente.';
    return (
      <div style={{ padding: theme.spacing.lg, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius.lg, boxShadow: theme.shadows.md, padding: theme.spacing.xl }}>
          <h1 style={{ color: theme.colors.textPrimary, marginTop: 0 }}>{title}</h1>
          <p style={{ color: theme.colors.textSecondary, lineHeight: 1.6, marginBottom: theme.spacing.lg }}>{message}</p>
          {(expired || rejected || creationFailed) ? (
            <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to={retryHref} style={{ padding: '12px 20px', borderRadius: theme.borderRadius.md, background: theme.colors.primary, color: theme.colors.surface, textDecoration: 'none', fontWeight: theme.typography.semibold }}>Seleccionar butacas nuevamente</Link>
              <Link to="/agenda" style={{ padding: '12px 20px', borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border}`, color: theme.colors.textPrimary, textDecoration: 'none', fontWeight: theme.typography.semibold }}>Volver a la agenda</Link>
            </div>
          ) : verificationPending ? (
            <button type="button" onClick={() => window.location.reload()} style={{ padding: '12px 20px', border: 0, borderRadius: theme.borderRadius.md, background: theme.colors.primary, color: theme.colors.surface, cursor: 'pointer', fontWeight: theme.typography.semibold }}>Volver a verificar</button>
          ) : (
            <p style={{ color: theme.colors.textMuted, fontSize: theme.typography.small, margin: 0 }}>La verificación puede demorar unos instantes.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ color: purchaseConfirmed ? '#28a745' : '#a16207', marginBottom: 8 }}>{purchaseConfirmed ? '¡Compra confirmada!' : 'Estamos confirmando tu compra'}</h1>
      <p style={{ fontSize: 16, marginBottom: 16 }}>{purchaseConfirmed ? 'Gracias por tu compra. Tu pago fue aprobado exitosamente.' : 'Todavía no tenemos una confirmación definitiva del pago. Esta página se actualizará automáticamente.'}</p>

      {purchaseConfirmed && (
        <div style={{ padding: 12, background: '#e7f3ff', border: '1px solid #2196f3', borderRadius: 8, color: '#0d47a1', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Tus entradas ya están guardadas en tu perfil
        </div>
      )}

      {purchaseConfirmed && emailAutoSent && autoSentEmail && (
        <div style={{ padding: 12, background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 8, color: '#065f46', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          ✅ Tus entradas fueron enviadas automáticamente a <strong>{autoSentEmail}</strong>
        </div>
      )}

      <div style={{ marginTop: 24, padding: 20, border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}>
        {packId ? (
          <>
            <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}>Detalle del Pack Multi-Función</h2>
            {packData?.sales?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Funciones incluidas:</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {packData.sales.map((sale, idx) => (
                    <li key={sale.id} style={{ padding: '10px 0', borderBottom: idx < packData.sales.length - 1 ? '1px solid #eee' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{sale.function_name || `Función ${idx + 1}`}: {formatDateLong(sale.session_date)} - {formatTime(sale.session_date)}</span>
                      <span style={{ fontWeight: 600 }}>${Number(sale.total_amount || 0).toLocaleString('es-AR')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {packData?.service_items?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Servicios asociados:</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {packData.service_items.map((svc, idx) => (
                    <li key={idx} style={{ padding: '10px 0', borderBottom: idx < packData.service_items.length - 1 ? '1px solid #eee' : 'none' }}>
                      <span>{svc.name} - {svc.quantity} persona{svc.quantity > 1 ? 's' : ''} - ${(Number(svc.price || 0) * Number(svc.quantity || 1)).toLocaleString('es-AR')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
              <span>Subtotal entradas:</span>
              <span>${subtotal.toLocaleString('es-AR')}</span>
            </div>
            {discountAmount > 0 && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#059669', fontWeight: 600 }}>
                <span>Descuento:</span>
                <span>-${discountAmount.toLocaleString('es-AR')}</span>
              </div>
            )}
            {calcServicesSubtotal > 0 && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#1e40af' }}>
                <span>Subtotal servicios:</span>
                <span>${calcServicesSubtotal.toLocaleString('es-AR')}</span>
              </div>
            )}
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#666' }}>
              <span>Cargo por servicio:</span>
              <span>${serviceCharge.toLocaleString('es-AR')}</span>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid #333', display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
              <span>Total del pack:</span>
              <span style={{ color: '#28a745' }}>${total.toLocaleString('es-AR')}</span>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}> Detalle de tu compra</h2>

            {reservation?.session?.show && (
              <div style={{ background: '#f8fafc', borderLeft: '4px solid #3b82f6', padding: 16, marginBottom: 20, borderRadius: '0 8px 8px 0' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 17, color: '#1e293b' }}>
                  {reservation.session.show.title}
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
                  {reservation.session.function_name && <>🎭 Función: {reservation.session.function_name}<br/></>}
                  📅 Fecha: {formatDateLong(reservation.session.starts_at)}<br/>
                  🕐 Hora: {formatTime(reservation.session.starts_at)}
                </p>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Entradas:</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(reservation?.items || []).map((it, idx) => (
                  <li key={idx} style={{ padding: '10px 0', borderBottom: idx < (reservation?.items?.length || 0) - 1 ? '1px solid #eee' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ flex: 1 }}>
                      {it.type === 'butaca' && formatSeatLocation(it.seat_code, 'butaca')}
                      {it.type === 'palco' && formatSeatLocation(it.seat_code, 'palco')}
                      {it.type === 'pullman' && `Pullman x${it.quantity || 1}`}
                      {it.type === 'general' && `Entrada General x${it.quantity || 1}`}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>
                      ${Number(it.price || it.unit_price || 0).toLocaleString('es-AR')}
                      {(it.type === 'pullman' || it.type === 'general') && it.quantity > 1 && ' c/u'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {saleServiceItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Servicios asociados:</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {saleServiceItems.map((svc, idx) => (
                    <li key={idx} style={{ padding: '10px 0', borderBottom: idx < saleServiceItems.length - 1 ? '1px solid #eee' : 'none' }}>
                      <span>{svc.name} - {svc.quantity} persona{svc.quantity > 1 ? 's' : ''} - ${(Number(svc.price || 0) * Number(svc.quantity || 1)).toLocaleString('es-AR')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
              <span>Subtotal entradas:</span>
              <span>${subtotal.toLocaleString('es-AR')}</span>
            </div>

            {discountAmount > 0 && appliedDiscount && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#059669', fontWeight: 600 }}>
                <span>Descuento ({appliedDiscount.alias || appliedDiscount.code}):</span>
                <span>-${discountAmount.toLocaleString('es-AR')}</span>
              </div>
            )}

            {calcServicesSubtotal > 0 && (
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#1e40af' }}>
                <span>Subtotal servicios:</span>
                <span>${calcServicesSubtotal.toLocaleString('es-AR')}</span>
              </div>
            )}

            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#666' }}>
              <span>Cargo por servicio:</span>
              <span>${serviceCharge.toLocaleString('es-AR')}</span>
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '2px solid #333', display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
              <span>Total:</span>
              <span style={{ color: '#28a745' }}>${total.toLocaleString('es-AR')}</span>
            </div>
          </>
        )}
      </div>

      {purchaseConfirmed && (
      <div style={{ marginTop: 24, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}> Enviar entradas</div>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
          {emailAutoSent ? 'Si necesitás reenviar tus entradas, podés hacerlo por email o WhatsApp' : 'Recibí una copia de tus entradas por email o WhatsApp'}
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            Email:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input 
              type="email" 
              placeholder="tu@email.com"
              value={email} 
              onChange={e=>setEmail(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
            />
            <button 
              onClick={onSendEmail} 
              disabled={sendingEmail || !email}
              style={{ padding: '10px 20px', background: email && !sendingEmail ? '#007bff' : '#ccc', color: '#fff', border: 'none', borderRadius: 6, cursor: email && !sendingEmail ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600 }}
            >
              {sendingEmail ? 'Enviando...' : emailSent ? ' Enviado' : 'Enviar'}
            </button>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            WhatsApp: <span style={{ color: '#999', fontWeight: 400, fontSize: 12 }}>(código de área + número)</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input 
              type="tel" 
              placeholder="11 1234-5678"
              value={whatsapp} 
              onChange={e=>setWhatsapp(e.target.value)}
              style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
            />
            <button 
              onClick={onSendWhatsapp} 
              disabled={!whatsapp}
              style={{ padding: '10px 20px', background: whatsapp ? '#25D366' : '#ccc', color: '#fff', border: 'none', borderRadius: 6, cursor: whatsapp ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600 }}
            >
              {whatsappSent ? ' Abierto' : 'Abrir WhatsApp'}
            </button>
          </div>
        </div>
      </div>
      )}

      {purchaseConfirmed && (
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <a 
          href="/perfil"
          style={{ display: 'inline-block', padding: '12px 32px', background: '#000000', color: '#fff', textDecoration: 'none', borderRadius: 6, fontSize: 16, fontWeight: 600, transition: 'background 0.2s' }}
        >
          Ver mis entradas en mi perfil →
        </a>
      </div>
      )}
    </div>
  );
}
