import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { formatDateLong, formatTime, formatDateShort } from '../lib/dateFormatter.js';

export default function MpSuccess(){
  const [searchParams] = useSearchParams();
  const reservationIdParam = searchParams.get('reservation_id');
  const paymentId = searchParams.get('payment_id');
  const status = searchParams.get('status');
  const preferenceId = searchParams.get('preference_id');

  const [reservation, setReservation] = useState(null);
  const [reservationId, setReservationId] = useState(reservationIdParam || '');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [saleId, setSaleId] = useState(null);
  const [serviceFeePercent, setServiceFeePercent] = useState(10); // Default 10%, will be fetched
  const [emailAutoSent, setEmailAutoSent] = useState(false);
  const [autoSentEmail, setAutoSentEmail] = useState('');
  const [saleServiceItems, setSaleServiceItems] = useState([]);
  const [servicesSubtotal, setServicesSubtotal] = useState(0);
  const [saleBreakdown, setSaleBreakdown] = useState(null);

  // If reservation_id is missing but we have payment_id, fetch payment to get metadata.reservation_id
  useEffect(() => {
    if (reservationId || !paymentId) return;
    let aborted = false;
    (async () => {
      try {
        const r = await apiFetch(`/api/payments/fetch/${paymentId}`);
        const j = await r.json();
        const rid = j?.raw?.metadata?.reservation_id || j?.raw?.body?.metadata?.reservation_id || null;
        if (!aborted && rid) setReservationId(String(rid));
      } catch {}
    })();
    return () => { aborted = true; };
  }, [paymentId, reservationId]);

  useEffect(() => {
    if (!reservationId) return;
    apiFetch(`/api/reservations/${reservationId}`)
      .then(r=>r.json())
      .then(data => {
        setReservation(data);
        // Get sale_id if reservation is confirmed
        if (data && data.status === 'confirmed' && data.sale_id) {
          setSaleId(data.sale_id);
        }
      })
      .catch(()=>setReservation(null));
  }, [reservationId]);

  // Poll for sale_id if not available yet
  useEffect(() => {
    if (!reservationId || saleId) return;
    
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await apiFetch(`/api/payments/sale/${reservationId}`);
        const data = await res.json();
        if (data.sale_id) {
          console.log('[MP_SUCCESS] Sale ID found:', data.sale_id);
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
        } else if (attempts >= maxAttempts) {
          console.log('[MP_SUCCESS] Sale ID not found after', maxAttempts, 'attempts');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('[MP_SUCCESS] Error fetching sale_id:', err);
        if (attempts >= maxAttempts) clearInterval(interval);
      }
    }, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [reservationId, saleId]);

  // Load discount info when reservation is available
  useEffect(() => {
    if (!reservationId) return;
    let aborted = false;
    (async () => {
      try {
        const r = await apiFetch(`/api/payments/discount/${reservationId}`);
        const j = await r.json();
        if (!aborted && j.discount) {
          setAppliedDiscount(j.discount);
        }
      } catch {}
    })();
    return () => { aborted = true; };
  }, [reservationId]);

  // Load service fee from system settings
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const r = await apiFetch('/api/settings');
        const settings = await r.json();
        if (!aborted && settings.service_fee_percent !== undefined) {
          setServiceFeePercent(Number(settings.service_fee_percent));
        }
      } catch {}
    })();
    return () => { aborted = true; };
  }, []);

  // Confirm payment on mount (fallback if webhook fails)
  useEffect(() => {
    if (!reservationId || !paymentId || !status) return;
    if (status !== 'approved') return;
    
    let aborted = false;
    const confirmPayment = async () => {
      try {
        console.log('[MP_SUCCESS] Confirming payment for reservation:', reservationId);
        const response = await apiFetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            reservation_id: reservationId,
            payment_id: paymentId,
            status 
          })
        });
        const result = await response.json();
        console.log('[MP_SUCCESS] Confirmation result:', result);
      } catch (e) {
        console.error('[MP_SUCCESS] Error confirming payment:', e);
      }
    };
    
    if (!aborted) {
      confirmPayment();
    }
    
    return () => { aborted = true; };
  }, [reservationId, paymentId, status]);

  // Format seat location consistently
  const formatSeatLocation = (seatCode, type) => {
    if (!seatCode) return type === 'pullman' ? 'Pullman' : '';
    
    if (type === 'butaca') {
      // Format: "A7" -> "Platea Baja - Fila A - Butaca 7"
      const match = seatCode.match(/([A-Za-z]+)(\d+)/);
      if (match) {
        const [, fila, num] = match;
        return `Platea Baja - Fila ${fila.toUpperCase()} - Butaca ${num}`;
      }
      return `Platea - ${seatCode}`;
    }
    
    if (type === 'palco') {
      // Format: "PB 1" -> "Palco Bajo - 1" or "PA 2" -> "Palco Alto - 2"
      const isPB = /^PB/i.test(seatCode);
      const num = seatCode.replace(/^P[BA]\s*/i, '');
      return isPB ? `Palco Bajo - ${num}` : `Palco Alto - ${num}`;
    }
    
    return seatCode;
  };

  const calculateTotals = () => {
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

  const onSendEmail = async () => {
    if (!reservationId || !email) {
      console.log('[EMAIL] Missing data:', { reservationId, email });
      return;
    }
    console.log('[EMAIL] Sending to:', email, 'for reservation:', reservationId);
    setSendingEmail(true);
    try {
      const res = await apiFetch('/api/payments/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: reservationId, email })
      });
      console.log('[EMAIL] Response:', res.status, res.ok);
      if (res.ok) {
        alert('✅ Email enviado correctamente');
      } else {
        const error = await res.json();
        console.error('[EMAIL] Error:', error);
        alert('❌ Error al enviar email: ' + (error.error || 'Error desconocido'));
      }
      setEmailSent(res.ok);
    } catch (err) {
      console.error('[EMAIL] Exception:', err);
      alert('❌ Error al enviar email: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const onSendWhatsapp = () => {
    if (!whatsapp || !saleId) {
      console.log('[WHATSAPP] Missing data:', { whatsapp, saleId });
      if (!saleId) {
        alert('❌ No se puede enviar por WhatsApp: falta el ID de venta');
      }
      return;
    }
    console.log('[WHATSAPP] Opening for:', whatsapp, 'sale:', saleId);
    
    // Remove spaces, dashes and other characters
    const cleanPhone = whatsapp.replace(/[\s\-()]/g, '');
    
    // Get show details from reservation
    const showName = reservation?.session?.show?.title || 'el espectáculo';
    const sessionDate = reservation?.session?.starts_at
      ? formatDateShort(reservation.session.starts_at)
      : '';
    const sessionTime = reservation?.session?.starts_at
      ? formatTime(reservation.session.starts_at)
      : '';
    
    // Build share URL
    const shareUrl = `${window.location.origin}/api/share/sale/${saleId}`;
    
    // Build message
    const message = `Hola! Te comparto tus entradas para el show ${showName}${sessionDate ? ` del día ${sessionDate}` : ''}${sessionTime ? ` a las ${sessionTime}` : ''}.\n\n Ver entradas: ${shareUrl}\n\nRecordá llegar al menos 30 minutos antes y mostrar el QR en el acceso. Una vez comenzada la función, la ubicación pierde validez (el personal de la sala te asignará un nuevo lugar).\n\nLas entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo.\n\n(Si no podés acceder al link, es porque no tenés agendado este número. Una vez que lo hagas, podrás acceder)\n\n¡Nos vemos!`;
    
    // Open WhatsApp with pre-filled message
    const waUrl = `https://wa.me/549${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
    
    setWhatsappSent(true);
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ color: '#28a745', marginBottom: 8 }}> ¡Compra confirmada!</h1>
      <p style={{ fontSize: 16, marginBottom: 16 }}>Gracias por tu compra. Tu pago fue aprobado exitosamente.</p>
      
      <div style={{ 
        padding: 12, 
        background: '#e7f3ff', 
        border: '1px solid #2196f3',
        borderRadius: 8,
        color: '#0d47a1',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24
      }}>
         Tus entradas ya están guardadas en tu perfil
      </div>

      {emailAutoSent && autoSentEmail && (
        <div style={{ padding: 12, background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 8, color: '#065f46', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          ✅ Tus entradas fueron enviadas automáticamente a <strong>{autoSentEmail}</strong>
        </div>
      )}
      
      <div style={{ 
        marginTop: 24, 
        padding: 20, 
        border: '1px solid #ddd', 
        borderRadius: 8,
        background: '#fff'
      }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}> Detalle de tu compra</h2>
        
        {/* Show Info */}
        {reservation?.session?.show && (
          <div style={{ 
            background: '#f8fafc', 
            borderLeft: '4px solid #3b82f6', 
            padding: 16, 
            marginBottom: 20,
            borderRadius: '0 8px 8px 0'
          }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 17, color: '#1e293b' }}>
              {reservation.session.show.title}
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
              📅 Fecha: {formatDateLong(reservation.session.starts_at)}<br/>
              🕐 Hora: {formatTime(reservation.session.starts_at)}
            </p>
          </div>
        )}
        
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Entradas:</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(reservation?.items || []).map((it, idx) => (
              <li key={idx} style={{ 
                padding: '10px 0', 
                borderBottom: idx < (reservation?.items?.length || 0) - 1 ? '1px solid #eee' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ flex: 1 }}>
                  {it.type === 'butaca' && formatSeatLocation(it.seat_code, 'butaca')}
                  {it.type === 'palco' && formatSeatLocation(it.seat_code, 'palco')}
                  {it.type === 'pullman' && `Pullman x${it.quantity || 1}`}
                </span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>
                  ${Number(it.price || it.unit_price || 0).toLocaleString('es-AR')}
                  {it.type === 'pullman' && it.quantity > 1 && ' c/u'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {saleServiceItems.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>Servicios adicionales:</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {saleServiceItems.map((svc, idx) => (
                <li key={idx} style={{ padding: '10px 0', borderBottom: idx < saleServiceItems.length - 1 ? '1px solid #eee' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>{svc.name} x{svc.quantity} persona{svc.quantity > 1 ? 's' : ''}</span>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>${(Number(svc.price || 0) * Number(svc.quantity || 1)).toLocaleString('es-AR')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Subtotal */}
        <div style={{ 
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid #ddd',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15
        }}>
          <span>Subtotal:</span>
          <span>${subtotal.toLocaleString('es-AR')}</span>
        </div>
        
        {calcServicesSubtotal > 0 && (
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#1e40af' }}>
            <span>Subtotal servicios:</span>
            <span>${calcServicesSubtotal.toLocaleString('es-AR')}</span>
          </div>
        )}

        {/* Discount */}
        {discountAmount > 0 && appliedDiscount && (
          <div style={{ 
            marginTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 15,
            color: '#059669',
            fontWeight: 600
          }}>
            <span>Descuento ({appliedDiscount.alias || appliedDiscount.code}):</span>
            <span>-${discountAmount.toLocaleString('es-AR')}</span>
          </div>
        )}
        
        {/* Service charge */}
        <div style={{ 
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          color: '#666'
        }}>
          <span>Cargo por servicio:</span>
          <span>${serviceCharge.toLocaleString('es-AR')}</span>
        </div>
        
        {/* Total */}
        <div style={{ 
          marginTop: 12, 
          paddingTop: 12, 
          borderTop: '2px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 18,
          fontWeight: 700
        }}>
          <span>Total:</span>
          <span style={{ color: '#28a745' }}>${total.toLocaleString('es-AR')}</span>
        </div>
      </div>

      <div style={{ 
        marginTop: 24, 
        padding: 16, 
        background: '#f8f9fa', 
        borderRadius: 8 
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}> Enviar entradas</div>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
          {emailAutoSent ? 'Si necesitás reenviar tus entradas, podés hacerlo por email o WhatsApp' : 'Recibí una copia de tus entradas por email o WhatsApp'}
        </p>
        
        {/* Email */}
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
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14
              }}
            />
            <button 
              onClick={onSendEmail} 
              disabled={sendingEmail || !email}
              style={{
                padding: '10px 20px',
                background: email && !sendingEmail ? '#007bff' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: email && !sendingEmail ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {sendingEmail ? 'Enviando...' : emailSent ? ' Enviado' : 'Enviar'}
            </button>
          </div>
        </div>
        
        {/* WhatsApp */}
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
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: 6,
                fontSize: 14
              }}
            />
            <button 
              onClick={onSendWhatsapp} 
              disabled={!whatsapp}
              style={{
                padding: '10px 20px',
                background: whatsapp ? '#25D366' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: whatsapp ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {whatsappSent ? ' Abierto' : 'Abrir WhatsApp'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <a 
          href="/perfil"
          style={{
            display: 'inline-block',
            padding: '12px 32px',
            background: '#28a745',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
            transition: 'background 0.2s'
          }}
        >
          Ver mis entradas en mi perfil →
        </a>
      </div>
    </div>
  );
}
