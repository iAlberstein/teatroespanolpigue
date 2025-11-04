import { useMemo, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function MpPending(){
  const [params] = useSearchParams();
  const reservationId = params.get('reservation_id');
  const status = params.get('status') || 'pending';
  const [canceled, setCanceled] = useState(false);

  // Auto-cancel reservation on mount to release holds (pending puede tardar y bloquear asientos)
  useEffect(() => {
    if (!reservationId) return;
    let aborted = false;
    (async () => {
      try {
        await apiFetch(`/api/reservations/${reservationId}`, { method: 'DELETE' });
        if (!aborted) setCanceled(true);
      } catch {}
    })();
    return () => { aborted = true; };
  }, [reservationId]);

  return (
    <div>
      <h1>Pago pendiente</h1>
      <p>Tu pago está en estado <strong>{status}</strong>. Cuando se apruebe, verás tus entradas en el perfil.</p>
      {reservationId && <p>Reservation ID: <code>{reservationId}</code></p>}
      {canceled && <p style={{ fontSize: 12, color: '#666' }}>Tu reserva fue cancelada y los asientos liberados.</p>}
      <div style={{ marginTop: 16 }}>
        <a href="/perfil">Ir a mi perfil</a>
      </div>
    </div>
  );
}
