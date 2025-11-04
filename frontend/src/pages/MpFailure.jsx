import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function MpFailure(){
  const [params] = useSearchParams();
  const reservationId = params.get('reservation_id');
  const status = params.get('status') || 'failure';
  const [canceled, setCanceled] = useState(false);

  // Auto-cancel reservation on mount to release holds
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
      <h1>Pago rechazado</h1>
      <p>Tu pago está en estado <strong>{status}</strong>. Podés intentar de nuevo desde la cartelera.</p>
      {reservationId && <p>Reservation ID: <code>{reservationId}</code></p>}
      {canceled && <p style={{ fontSize: 12, color: '#666' }}>Tu reserva fue cancelada y los asientos liberados.</p>}
      <div style={{ marginTop: 16 }}>
        <a href="/cartelera">Ir a la cartelera</a>
      </div>
    </div>
  );
}
