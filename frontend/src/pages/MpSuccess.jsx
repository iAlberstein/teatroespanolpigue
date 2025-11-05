import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiAuthFetch } from '../lib/api';

export default function MpSuccess(){
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const reservationIdParam = searchParams.get('reservation_id');
  const paymentId = searchParams.get('payment_id');
  const status = searchParams.get('status');
  const preferenceId = searchParams.get('preference_id');

  const [reservation, setReservation] = useState(null);
  const [reservationId, setReservationId] = useState(reservationIdParam || '');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [confirmingSale, setConfirmingSale] = useState(false);
  const [saleConfirmed, setSaleConfirmed] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const confirmingRef = useRef(false); // Flag para prevenir confirmaciones duplicadas

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
      .then(setReservation)
      .catch(()=>setReservation(null));
  }, [reservationId]);

  // Confirm purchase automatically when approved and we have payment_id (reservationId no es necesario)
  useEffect(() => {
    if (status !== 'approved') return;
    if (!paymentId) return;
    if (confirmingRef.current) return; // Prevenir ejecuciones paralelas
    
    confirmingRef.current = true;
    let aborted = false;
    (async () => {
      try {
        setConfirmingSale(true);
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const res = await apiFetch('/api/payments/confirm', {
          method: 'POST',
          headers,
          body: JSON.stringify({ payment_id: paymentId })
        });
        
        const data = await res.json().catch(() => ({}));
        console.log('[MP_SUCCESS] Confirm response:', { ok: res.ok, status: res.status, data });
        
        if (!aborted) {
          if (res.ok) {
            setSaleConfirmed(true);
            setConfirmingSale(false);
            console.log('[MP_SUCCESS] Sale confirmed successfully');
          } else {
            console.error('[MP_SUCCESS] Confirm failed:', data);
            setConfirmingSale(false);
            setSaleConfirmed(false);
            confirmingRef.current = false; // Liberar en caso de error para permitir retry
          }
        }
      } catch (err) {
        console.error('[MP_SUCCESS] Error confirming:', err);
        if (!aborted) {
          setConfirmingSale(false);
          setSaleConfirmed(false);
        }
      }
    })();
    return () => { aborted = true; };
  }, [status, paymentId, token]);

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
    if (!reservation?.items) return { subtotal: 0, serviceCharge: 0, total: 0 };
    
    const subtotal = reservation.items.reduce((sum, it) => {
      if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
      if (it.type === 'pullman') return sum + (Number(it.price || it.unit_price || 0) * Number(it.quantity || 1));
      return sum;
    }, 0);
    
    const serviceCharge = Math.round(subtotal * 0.10);
    const total = subtotal + serviceCharge;
    
    return { subtotal, serviceCharge, total };
  };
  
  const { subtotal, serviceCharge, total } = calculateTotals();

  const onSendEmail = async () => {
    if (!reservationId || !email) return;
    setSendingEmail(true);
    try {
      const res = await apiFetch('/api/payments/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: reservationId, email })
      });
      setEmailSent(res.ok);
    } finally {
      setSendingEmail(false);
    }
  };

  const onSendWhatsapp = async () => {
    if (!reservationId || !whatsapp) return;
    setSendingWhatsapp(true);
    try {
      const res = await apiFetch('/api/payments/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservation_id: reservationId, phone: whatsapp })
      });
      setWhatsappSent(res.ok);
    } finally {
      setSendingWhatsapp(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ color: '#28a745', marginBottom: 8 }}>🎉 ¡Compra confirmada!</h1>
      <p style={{ fontSize: 16, marginBottom: 24 }}>Gracias por tu compra. Tu pago fue aprobado exitosamente.</p>
      
      {saleConfirmed && (
        <div style={{ 
          padding: 12, 
          background: '#d4edda', 
          border: '1px solid #c3e6cb', 
          borderRadius: 6, 
          marginBottom: 24,
          color: '#155724'
        }}>
          ✓ Tu compra ha sido procesada exitosamente
        </div>
      )}
      
      {!saleConfirmed && confirmingSale && (
        <div style={{ 
          padding: 12, 
          background: '#f8f9fa', 
          border: '1px solid #dee2e6', 
          borderRadius: 6, 
          marginBottom: 24 
        }}>
          Procesando compra...
        </div>
      )}
      
      {!saleConfirmed && !confirmingSale && status === 'approved' && (
        <div style={{ 
          padding: 12, 
          background: '#fff3cd', 
          border: '1px solid #ffeeba', 
          borderRadius: 6, 
          marginBottom: 24,
          color: '#856404'
        }}>
          ⚠️ La compra se confirmará automáticamente. Si no ves la confirmación, recargá la página.
        </div>
      )}
      
      <div style={{ 
        marginTop: 24, 
        padding: 20, 
        border: '1px solid #ddd', 
        borderRadius: 8,
        background: '#fff'
      }}>
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 16 }}>📋 Detalle de tu compra</h2>
        
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
        
        {/* Service charge */}
        <div style={{ 
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          color: '#666'
        }}>
          <span>Cargo por servicio (10%):</span>
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
      
      {/* Leyenda sobre perfil */}
      {saleConfirmed && (
        <div style={{ 
          marginTop: 16, 
          padding: 12, 
          background: '#e7f3ff', 
          border: '1px solid #2196f3',
          borderRadius: 8,
          color: '#0d47a1',
          fontSize: 14,
          textAlign: 'center'
        }}>
          ✓ Tus entradas ya están guardadas en tu perfil
        </div>
      )}

      <div style={{ 
        marginTop: 24, 
        padding: 16, 
        background: '#f8f9fa', 
        borderRadius: 8 
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>📧 Enviar entradas</div>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
          Recibí una copia de tus entradas por email o WhatsApp
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
              {sendingEmail ? 'Enviando...' : emailSent ? '✓ Enviado' : 'Enviar'}
            </button>
          </div>
        </div>
        
        {/* WhatsApp */}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>
            WhatsApp:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input 
              type="tel" 
              placeholder="+54 9 11 1234-5678"
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
              disabled={sendingWhatsapp || !whatsapp}
              style={{
                padding: '10px 20px',
                background: whatsapp && !sendingWhatsapp ? '#25D366' : '#ccc',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: whatsapp && !sendingWhatsapp ? 'pointer' : 'not-allowed',
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {sendingWhatsapp ? 'Enviando...' : whatsappSent ? '✓ Enviado' : 'Enviar'}
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
