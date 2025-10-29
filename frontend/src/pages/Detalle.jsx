import { useParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import SalaPrincipalGrid from '../components/SalaPrincipalGrid.jsx';

export default function Detalle(){
  const { id } = useParams();
  const [sessions, setSessions] = useState([]);
  const [reservation, setReservation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const socketRef = useRef(null);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [selectedSeatIds, setSelectedSeatIds] = useState(new Set());
  const [heldByOtherSeatIds, setHeldByOtherSeatIds] = useState(new Set());
  const [selectedPalcosLabels, setSelectedPalcosLabels] = useState(new Set());
  const [heldByOtherPalcosLabels, setHeldByOtherPalcosLabels] = useState(new Set());
  const [soldSeatIds, setSoldSeatIds] = useState(new Set());
  const [soldPalcosLabels, setSoldPalcosLabels] = useState(new Set());
  const [pullmanSelected, setPullmanSelected] = useState(0);
  const [pullmanAvailable, setPullmanAvailable] = useState(92);
  const [syncing, setSyncing] = useState(false);
  const expiredHandledRef = useRef(false);

  const handleExpire = async () => {
    if (expiredHandledRef.current) return;
    expiredHandledRef.current = true;
    try {
      alert('Tu reserva expiró');
    } catch {}
    try {
      if (socketRef.current && sessions[0]?.id) {
        const sid = sessions[0].id;
        socketRef.current.emit('pullman_clear', { sessionId: sid });
        socketRef.current.emit('seat_clear', { sessionId: sid });
        socketRef.current.emit('palco_clear', { sessionId: sid });
      }
      setSelectedSeatIds(new Set());
      setHeldByOtherSeatIds(new Set());
      setSelectedPalcosLabels(new Set());
      setHeldByOtherPalcosLabels(new Set());
      if (reservation) {
        await fetch(`http://localhost:4000/api/reservations/${reservation.id}`, { method: 'DELETE' }).catch(()=>{});
      }
      setReservation(null);
      setTimeLeft(0);
    } finally {
      try { window.location.reload(); } catch {}
    }
  };

  useEffect(() => {
    fetch('http://localhost:4000/api/sessions')
      .then(r=>r.json())
      .then(all => setSessions(all.filter(x=>x.show_id===id)))
      .catch(()=>setSessions([]));
  }, [id]);

  // Establish socket once (mount), register listeners
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io('http://localhost:4000');
    }
    const s = socketRef.current;

    const onExpired = ({ reservation_id }) => {
      if (reservation && reservation.id === reservation_id) {
        handleExpire();
      }
    };
    const onCreated = () => {};
    const onCanceled = ({ reservation_id }) => {
      if (reservation && reservation.id === reservation_id) {
        setReservation(null);
        setTimeLeft(0);
      }
    };
    s.on('reservation_expired', onExpired);
    s.on('reservation_created', onCreated);
    s.on('reservation_canceled', onCanceled);

    // Pullman realtime sync
    const onPullmanUpdated = ({ available, capacity }) => {
      setPullmanAvailable(available);
    };
    const onPullmanConfirmed = ({ selected, available, capacity }) => {
      setPullmanSelected(selected);
      setPullmanAvailable(available);
    };
    s.on('pullman_updated', onPullmanUpdated);
    s.on('pullman_confirmed', onPullmanConfirmed);

    // Seats realtime locks
    const onSeatHeld = ({ seatId, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedSeatIds(prev => new Set(prev).add(seatId));
      } else {
        setHeldByOtherSeatIds(prev => new Set(prev).add(seatId));
      }
    };
    const onSeatReleased = ({ seatId, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
      } else {
        setHeldByOtherSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
      }
    };
    const onSeatDenied = ({ seatId }) => {
      // optional UI feedback; for ahora, nada
    };
    s.on('seat_held', onSeatHeld);
    s.on('seat_released', onSeatReleased);
    s.on('seat_denied', onSeatDenied);

    // Palcos realtime locks
    const onPalcoHeld = ({ palco, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedPalcosLabels(prev => new Set(prev).add(palco));
      } else {
        setHeldByOtherPalcosLabels(prev => new Set(prev).add(palco));
      }
    };
    const onPalcoReleased = ({ palco, by }) => {
      const myId = s.id;
      if (by === myId) {
        setSelectedPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
      } else {
        setHeldByOtherPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
      }
    };
    const onPalcoDenied = ({ palco }) => {};
    s.on('palco_held', onPalcoHeld);
    s.on('palco_released', onPalcoReleased);
    s.on('palco_denied', onPalcoDenied);

    // SOLD realtime
    const onSeatSold = ({ seatId }) => {
      setSoldSeatIds(prev => new Set(prev).add(seatId));
      setSelectedSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
      setHeldByOtherSeatIds(prev => { const n = new Set(prev); n.delete(seatId); return n; });
    };
    const onPalcoSold = ({ palco }) => {
      setSoldPalcosLabels(prev => new Set(prev).add(palco));
      setSelectedPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
      setHeldByOtherPalcosLabels(prev => { const n = new Set(prev); n.delete(palco); return n; });
    };
    const onPullmanSold = ({ sold }) => {
      // Recompute available from snapshot calculation style: available already pushed by backend via pullman_updated, but keep in sync if only sold arrives
      // No-op; rely on pullman_updated emitted by backend after sold. This handler kept for completeness.
    };
    s.on('seat_sold', onSeatSold);
    s.on('palco_sold', onPalcoSold);
    s.on('pullman_sold', onPullmanSold);

    return () => {
      s.off('reservation_expired', onExpired);
      s.off('reservation_created', onCreated);
      s.off('reservation_canceled', onCanceled);
      s.off('pullman_updated', onPullmanUpdated);
      s.off('pullman_confirmed', onPullmanConfirmed);
      s.off('seat_held', onSeatHeld);
      s.off('seat_released', onSeatReleased);
      s.off('seat_denied', onSeatDenied);
      s.off('palco_held', onPalcoHeld);
      s.off('palco_released', onPalcoReleased);
      s.off('palco_denied', onPalcoDenied);
      s.off('seat_sold', onSeatSold);
      s.off('palco_sold', onPalcoSold);
      s.off('pullman_sold', onPullmanSold);
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Join session when sessions[0] is available
  useEffect(() => {
    if (socketRef.current && sessions[0]) {
      socketRef.current.emit('join_session', sessions[0].id);
    }
  }, [sessions]);

  // Load availability snapshot when session available and socket connected (to know my socket id)
  useEffect(() => {
    const sId = sessions[0]?.id;
    const s = socketRef.current;
    if (!sId || !s || !s.id) return;
    (async () => {
      try {
        const r = await fetch(`http://localhost:4000/api/sessions/${sId}/availability`);
        if (!r.ok) return;
        const data = await r.json();
        const myId = s.id;
        const otherHeldSeats = new Set((data.heldSeats || []).filter(x => x && x.by !== myId).map(x => x.seatId));
        const otherHeldPalcos = new Set((data.heldPalcos || []).filter(x => x && x.by !== myId).map(x => x.palco));
        setHeldByOtherSeatIds(otherHeldSeats);
        setHeldByOtherPalcosLabels(otherHeldPalcos);
        setSoldSeatIds(new Set(data.soldSeats || []));
        setSoldPalcosLabels(new Set(data.soldPalcos || []));
        setPullmanAvailable(data.pullman?.available ?? 92);
      } catch {}
    })();
  }, [sessions, socketRef.current?.id]);

  useEffect(() => {
    if (!reservation?.expires_at) return;
    expiredHandledRef.current = false;
    const end = new Date(reservation.expires_at).getTime();
    // initialize immediately to avoid transient 0 triggering expire
    const initial = Math.max(0, Math.floor((end - Date.now())/1000));
    setTimeLeft(initial);
    const i = setInterval(() => {
      const diff = Math.max(0, Math.floor((end - Date.now())/1000));
      setTimeLeft(diff);
      if (diff === 0) {
        clearInterval(i);
        handleExpire();
      }
    }, 1000);
    return () => clearInterval(i);
  }, [reservation]);

  // Local timer hit zero: enforce expiration cleanup
  useEffect(() => {
    const end = reservation?.expires_at ? new Date(reservation.expires_at).getTime() : null;
    if (reservation && timeLeft === 0 && end && Date.now() >= end) {
      handleExpire();
    }
  }, [timeLeft, reservation]);

  const firstSessionId = useMemo(() => sessions[0]?.id, [sessions]);

  const onPullmanChange = (delta) => {
    if (!socketRef.current || !firstSessionId) return;
    socketRef.current.emit('pullman_change', { sessionId: firstSessionId, delta });
  };

  const buildItems = () => {
    const items = [];
    for (const sid of Array.from(selectedSeatIds)) {
      items.push({ type: 'butaca', section: 'Platea General', seat_code: sid });
    }
    for (const label of Array.from(selectedPalcosLabels)) {
      const isPB = /^PB/i.test(label);
      const pack = isPB ? 4 : 2;
      items.push({ type: 'palco', section: label.startsWith('PB') ? 'Palcos Bajos' : 'Palcos Altos', seat_code: label, quantity: pack });
    }
    if (pullmanSelected > 0) {
      items.push({ type: 'pullman', section: 'Pullman', quantity: pullmanSelected });
    }
    return items;
  };

  // Auto-reserve: on any selection change, create or update reservation
  useEffect(() => {
    const items = buildItems();
    if (!firstSessionId) return;
    if (items.length === 0) {
      // Auto-cancel cuando la selección queda vacía
      if (reservation && !syncing) {
        (async () => {
          // liberar pullman en tiempo real
          if (socketRef.current && firstSessionId) {
            socketRef.current.emit('pullman_clear', { sessionId: firstSessionId });
            socketRef.current.emit('seat_clear', { sessionId: firstSessionId });
            socketRef.current.emit('palco_clear', { sessionId: firstSessionId });
          }
          // limpiar asientos en UI
          setSelectedSeatIds(new Set());
          setHeldByOtherSeatIds(new Set());
          setSelectedPalcosLabels(new Set());
          setHeldByOtherPalcosLabels(new Set());
          await cancelReservation();
        })();
      }
      return;
    }
    if (syncing) return;
    let aborted = false;
    const sync = async () => {
      try {
        setSyncing(true);
        if (!reservation) {
          // create new reservation and start timer immediately
          const res = await fetch('http://localhost:4000/api/reservations', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-socket-id': socketRef.current?.id || ''
            },
            body: JSON.stringify({ session_id: firstSessionId, items })
          });
          if (!res.ok) return; // soft fail
          const data = await res.json();
          if (!aborted) setReservation(data);
        } else {
          const res = await fetch(`http://localhost:4000/api/reservations/${reservation.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-socket-id': socketRef.current?.id || ''
            },
            body: JSON.stringify({ items })
          });
          if (res.status === 409) {
            // backend says reservation not active (likely expired) -> expire locally now
            if (!aborted) await handleExpire();
            return;
          }
          if (!res.ok) return;
          const data = await res.json();
          if (!aborted) setReservation(data);
        }
      } finally {
        if (!aborted) setSyncing(false);
      }
    };
    sync();
    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeatIds, selectedPalcosLabels, pullmanSelected, firstSessionId]);

  const startReservation = async () => {
    if (!firstSessionId) return;
    if (selectedCells.size === 0 && selectedPalcos.size === 0 && pullmanSelected === 0) {
      alert('Seleccioná al menos una butaca o un palco en la grilla.');
      return;
    }
    const items = [];
    // butacas individuales
    for (const key of Array.from(selectedCells)) {
      const [r, c, rowLetter, seat] = key.split(':');
      items.push({ type: 'butaca', section: 'Platea General', seat_code: `${rowLetter}${seat}` });
    }
    // palcos (packs)
    for (const p of Array.from(selectedPalcos)) {
      // p form: "<label>@r,c" e.g. "PB 12@14,32"
      const label = p.split('@')[0]; // PB 12 | PA 14
      const isPB = /^PB/i.test(label);
      const pack = isPB ? 4 : 2;
      items.push({ type: 'palco', section: label.startsWith('PB') ? 'Palcos Bajos' : 'Palcos Altos', seat_code: label, quantity: pack });
    }
    // pullman (sin numeración)
    if (pullmanSelected > 0) {
      items.push({ type: 'pullman', section: 'Pullman', quantity: pullmanSelected });
    }
    const res = await fetch('http://localhost:4000/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: firstSessionId, items })
    });
    if (!res.ok) {
      const e = await res.json().catch(()=>({error:'Unknown'}));
      alert('No se pudo crear la reserva: ' + (e.error || res.status));
      return;
    }
    const data = await res.json();
    setReservation(data);
  };

  const cancelReservation = async () => {
    if (!reservation) return;
    await fetch(`http://localhost:4000/api/reservations/${reservation.id}`, { method: 'DELETE' });
    setReservation(null);
    setTimeLeft(0);
    // limpiar carrito local
    setSelectedSeatIds(new Set());
    setHeldByOtherSeatIds(new Set());
    setSelectedPalcosLabels(new Set());
    setHeldByOtherPalcosLabels(new Set());
    // limpiar pullman vía socket para sincronizar disponibles globales
    if (socketRef.current && firstSessionId) {
      socketRef.current.emit('pullman_clear', { sessionId: firstSessionId });
    } else {
      setPullmanSelected(0);
    }
  };

  const fmt = (s) => {
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const r = (s%60).toString().padStart(2,'0');
    return `${m}:${r}`;
  };

  return (
    <div>
      <h1>Detalle de espectáculo</h1>
      {/* Referencias arriba */}
      <div style={{ marginBottom: 12, fontSize: 12 }}>
        <div style={{ marginBottom: 6, fontWeight: 600 }}>Sectores</div>
        <div style={{ marginTop: 4, marginBottom: 8 }}>
          <span style={{ background:'#a8d8a8', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Platea General</span>
          <span style={{ background:'#8fbc8f', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Palcos Bajos</span>
          <span style={{ background:'#6b8e6b', padding:'2px 6px', borderRadius:4, marginRight:6, color:'#fff' }}>Palcos Altos</span>
          <span style={{ background:'#c0c0c0', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Pullman</span>
        </div>
        <div style={{ marginBottom: 6, fontWeight: 600 }}>Estado de butaca</div>
        <div>
          <span style={{ background:'#ffd700', padding:'2px 6px', borderRadius:4, marginRight:6 }}>Seleccionada</span>
          <span style={{ background:'#9370db', padding:'2px 6px', borderRadius:4, marginRight:6, color:'#fff' }}>Reservada</span>
          <span style={{ background:'#808080', padding:'2px 6px', borderRadius:4, marginRight:6, color:'#fff' }}>Vendida</span>
        </div>
      </div>
      <div style={{ display:'flex', gap:24, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div>
          <SalaPrincipalGrid
            selectedSeatIds={selectedSeatIds}
            heldByOtherSeatIds={heldByOtherSeatIds}
            soldSeatIds={soldSeatIds}
            selectedPalcosLabels={selectedPalcosLabels}
            heldByOtherPalcosLabels={heldByOtherPalcosLabels}
            soldPalcosLabels={soldPalcosLabels}
            pullmanSelected={pullmanSelected}
            pullmanAvailable={pullmanAvailable}
            onPullmanChange={onPullmanChange}
            onToggleSeat={({ r, c, val, row }) => {
              if (!socketRef.current || !firstSessionId) return;
              // Prevent new holds if reservation expired
              const end = reservation?.expires_at ? new Date(reservation.expires_at).getTime() : null;
              if (reservation && end && Date.now() >= end) { handleExpire(); return; }
              const seatId = `${row || ''}${val}`;
              socketRef.current.emit('seat_toggle', { sessionId: firstSessionId, seatId });
            }}
            onTogglePalco={({ label }) => {
              if (!socketRef.current || !firstSessionId) return;
              const end = reservation?.expires_at ? new Date(reservation.expires_at).getTime() : null;
              if (reservation && end && Date.now() >= end) { handleExpire(); return; }
              socketRef.current.emit('palco_toggle', { sessionId: firstSessionId, palco: label });
            }}
          />
        </div>
        <div style={{ minWidth: 260 }}>
          <div style={{ marginBottom: 4, fontWeight: 600 }}>Carrito</div>
          {reservation && (
            <div style={{ marginBottom: 8, fontSize: 13 }}>Tiempo restante: <strong>{fmt(timeLeft)}</strong></div>
          )}
          <ul>
            {Array.from(selectedSeatIds).map(sid => {
              const m = sid.match(/^([A-M]?)(\d+)$/);
              const row = m ? m[1] : '';
              const seat = m ? m[2] : sid;
              return <li key={sid}>Fila {row || '?'} - Asiento {seat}</li>;
            })}
            {Array.from(selectedPalcosLabels).map(label => {
              const pack = /^PB/i.test(label) ? 4 : 2;
              return <li key={label}>{label} (pack {pack})</li>;
            })}
            {pullmanSelected > 0 && (
              <li>Pullman x {pullmanSelected}</li>
            )}
          </ul>
          {reservation && (
            <button onClick={cancelReservation} style={{ marginTop: 8 }}>Cancelar reserva</button>
          )}
        </div>
      </div>
      {/* Debug info opcional: quitar en producción si no lo necesitás */}
      {/* <h3>Sesiones</h3>
      <pre>{JSON.stringify(sessions, null, 2)}</pre>
      <h3>Reserva actual</h3>
      <pre>{JSON.stringify(reservation, null, 2)}</pre> */}
    </div>
  );
}
