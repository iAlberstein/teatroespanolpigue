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
  const [confirmingSale, setConfirmingSale] = useState(false);
  const [saleConfirmed, setSaleConfirmed] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
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
          setSaleConfirmed(res.ok);
          if (!res.ok) {
            console.error('[MP_SUCCESS] Confirm failed:', data);
            confirmingRef.current = false; // Liberar en caso de error para permitir retry
          } else {
            console.log('[MP_SUCCESS] Sale confirmed successfully');
          }
        }
      } finally {
        if (!aborted) setConfirmingSale(false);
      }
    })();
    return () => { aborted = true; };
  }, [status, paymentId, token]);

  const total = () => {
    if (!reservation?.items) return 0;
    return reservation.items.reduce((sum, it) => {
      if (it.type === 'butaca' || it.type === 'palco') return sum + Number(it.price || 0);
      if (it.type === 'pullman') return sum + (Number(it.unit_price || 0) * Number(it.quantity || 0));
      return sum;
    }, 0);
  };

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

  return (
    <div>
      <h1>Compra confirmada</h1>
      <p>¡Gracias! Tu pago fue aprobado.</p>
      {saleConfirmed && <p style={{ color: '#28a745', fontWeight: 600 }}>✓ Compra procesada exitosamente</p>}
      {!saleConfirmed && confirmingSale && <p style={{ color: '#666' }}>Procesando compra...</p>}
      {!saleConfirmed && !confirmingSale && status === 'approved' && (
        <p style={{ color: '#ff9800', fontSize: 14 }}>
          ⚠️ La compra se confirmará automáticamente. Si no ves la confirmación, recargá la página.
        </p>
      )}
      <div style={{ marginTop: 12, padding: 12, border: '1px solid #ddd', borderRadius: 6 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Resumen</div>
        <div>Reservation ID: <code>{reservationId}</code></div>
        {paymentId && <div>Payment ID: <code>{paymentId}</code></div>}
        {preferenceId && <div>Preference ID: <code>{preferenceId}</code></div>}
        <div>Status: <strong>{status || 'approved'}</strong></div>
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 600 }}>Ítems</div>
          <ul>
            {(reservation?.items || []).map((it, idx) => (
              <li key={idx}>
                {it.type === 'butaca' && `Butaca ${it.seat_code} - $${Number(it.price || 0)}`}
                {it.type === 'palco' && `Palco ${it.seat_code} - $${Number(it.price || 0)}`}
                {it.type === 'pullman' && `Pullman x${it.quantity} - $${Number(it.unit_price || 0)} c/u`}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 6 }}>Total estimado: <strong>${total()}</strong></div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Enviar por email</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="email" placeholder="tu@email"
                 value={email} onChange={e=>setEmail(e.target.value)} />
          <button onClick={onSendEmail} disabled={sendingEmail || !email}>
            {sendingEmail ? 'Enviando...' : emailSent ? 'Enviado' : 'Enviar entradas'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <a href="/perfil">Ir a mi perfil</a>
      </div>
    </div>
  );
}
