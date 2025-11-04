import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiFetch, API_URL } from '../lib/api';
import SalaPrincipalGrid from './SalaPrincipalGrid';

/**
 * Shared component for seat selection
 * Used by both Spectator (Detalle.jsx) and Box Office (Boleteria.jsx)
 * 
 * Props:
 * - showId: ID of the show
 * - sessionId: ID of the selected session
 * - userId: ID of the current user (null for box office)
 * - mode: 'spectator' | 'boxoffice'
 * - onSelectionChange: callback when selection changes
 * - sidebarContent: JSX element for sidebar
 */
export default function SeatSelection({ 
  showId, 
  sessionId, 
  userId = null, 
  mode = 'spectator',
  onSelectionChange,
  sidebarContent
}) {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  
  // Seat selection state
  const [selectedSeatIds, setSelectedSeatIds] = useState(new Set());
  const [selectedPalcosLabels, setSelectedPalcosLabels] = useState(new Set());
  const [pullmanSelected, setPullmanSelected] = useState(0);
  const [pullmanAvailable, setPullmanAvailable] = useState(92);
  
  // Sold and held state
  const [soldSeatIds, setSoldSeatIds] = useState(new Set());
  const [soldPalcosLabels, setSoldPalcosLabels] = useState(new Set());
  const [heldByOtherSeatIds, setHeldByOtherSeatIds] = useState(new Set());
  const [heldByOtherPalcosLabels, setHeldByOtherPalcosLabels] = useState(new Set());
  
  // Pricing state (loaded from backend)
  const [pricing, setPricing] = useState({
    platea_general: 5000,
    palcos_bajos: 10000,
    palcos_altos: 8000,
    pullman: 3000
  });

  // Load availability immediately when session changes (don't wait for socket)
  useEffect(() => {
    if (!sessionId) {
      // Clear all state when no session selected
      setSoldSeatIds(new Set());
      setSoldPalcosLabels(new Set());
      setHeldByOtherSeatIds(new Set());
      setHeldByOtherPalcosLabels(new Set());
      setSelectedSeatIds(new Set());
      setSelectedPalcosLabels(new Set());
      setPullmanSelected(0);
      setPullmanAvailable(92);
      return;
    }
    
    (async () => {
      try {
        console.log(`[${mode.toUpperCase()}] Loading availability for session:`, sessionId);
        const r = await apiFetch(`/api/sessions/${sessionId}/availability`);
        if (!r.ok) return;
        const data = await r.json();
        console.log(`[${mode.toUpperCase()}] Availability loaded:`, data);
        
        // Always set sold seats/palcos immediately (they don't depend on socket)
        setSoldSeatIds(new Set(data.soldSeats || []));
        setSoldPalcosLabels(new Set(data.soldPalcos || []));
        setPullmanAvailable(data.pullman?.available ?? 92);
        
        // Set pricing if available
        if (data.pricing) {
          setPricing(data.pricing);
        }
        
        // Filter held items by socket ID if available
        const myId = socketRef.current?.id;
        if (myId) {
          const otherHeldSeats = new Set((data.heldSeats || []).filter(x => x && x.by !== myId).map(x => x.seatId));
          const otherHeldPalcos = new Set((data.heldPalcos || []).filter(x => x && x.by !== myId).map(x => x.palco));
          setHeldByOtherSeatIds(otherHeldSeats);
          setHeldByOtherPalcosLabels(otherHeldPalcos);
        } else {
          // Socket not ready yet, show all holds (we'll filter later when socket connects)
          const allHeldSeats = new Set((data.heldSeats || []).map(x => x.seatId));
          const allHeldPalcos = new Set((data.heldPalcos || []).map(x => x.palco));
          setHeldByOtherSeatIds(allHeldSeats);
          setHeldByOtherPalcosLabels(allHeldPalcos);
        }
      } catch (err) {
        console.error(`[${mode.toUpperCase()}] Error loading availability:`, err);
      }
    })();
  }, [sessionId, mode]);

  // Socket.IO connection for real-time updates
  useEffect(() => {
    if (!sessionId) return;
    
    // Clear local selections when changing session
    setSelectedSeatIds(new Set());
    setSelectedPalcosLabels(new Set());
    setPullmanSelected(0);
    
    // Connect socket if not already connected
    if (!socketRef.current) {
      socketRef.current = io(API_URL);
    }
    
    const socket = socketRef.current;
    
    // Join session room
    socket.emit('join_session', { sessionId, userId });
    console.log(`[${mode.toUpperCase()}] Joined session:`, sessionId);
    
    // Listen for seat holds from others
    const onSeatHeld = ({ seatId, by }) => {
      if (by !== socket.id) {
        setHeldByOtherSeatIds(prev => new Set([...prev, seatId]));
      }
    };
    
    const onSeatReleased = ({ seatId }) => {
      setHeldByOtherSeatIds(prev => {
        const updated = new Set(prev);
        updated.delete(seatId);
        return updated;
      });
    };
    
    const onPalcoHeld = ({ palco, by }) => {
      if (by !== socket.id) {
        setHeldByOtherPalcosLabels(prev => new Set([...prev, palco]));
      }
    };
    
    const onPalcoReleased = ({ palco }) => {
      setHeldByOtherPalcosLabels(prev => {
        const updated = new Set(prev);
        updated.delete(palco);
        return updated;
      });
    };
    
    const onSeatSold = ({ seatId }) => {
      setSoldSeatIds(prev => new Set([...prev, seatId]));
      setHeldByOtherSeatIds(prev => {
        const updated = new Set(prev);
        updated.delete(seatId);
        return updated;
      });
    };
    
    const onPalcoSold = ({ palco }) => {
      setSoldPalcosLabels(prev => new Set([...prev, palco]));
      setHeldByOtherPalcosLabels(prev => {
        const updated = new Set(prev);
        updated.delete(palco);
        return updated;
      });
    };
    
    const onPullmanUpdated = ({ available }) => {
      setPullmanAvailable(available);
    };
    
    socket.on('seat_held', onSeatHeld);
    socket.on('seat_released', onSeatReleased);
    socket.on('palco_held', onPalcoHeld);
    socket.on('palco_released', onPalcoReleased);
    socket.on('seat_sold', onSeatSold);
    socket.on('palco_sold', onPalcoSold);
    socket.on('pullman_updated', onPullmanUpdated);
    
    return () => {
      socket.off('seat_held', onSeatHeld);
      socket.off('seat_released', onSeatReleased);
      socket.off('palco_held', onPalcoHeld);
      socket.off('palco_released', onPalcoReleased);
      socket.off('seat_sold', onSeatSold);
      socket.off('palco_sold', onPalcoSold);
      socket.off('pullman_updated', onPullmanUpdated);
    };
  }, [sessionId, userId, mode]);

  // Notify parent when selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        selectedSeatIds,
        selectedPalcosLabels,
        pullmanSelected,
        clearSelection,
        socketRef,
        pricing  // Include pricing in callback
      });
    }
  }, [selectedSeatIds, selectedPalcosLabels, pullmanSelected]);

  const handleToggleSeat = ({ r, c, val, row }) => {
    const seatId = `${row || ''}${val}`;
    if (soldSeatIds.has(seatId)) return;
    if (!socketRef.current || !sessionId) return;
    
    // Emit socket event for real-time sync
    console.log(`[${mode.toUpperCase()}] Emitting seat_toggle:`, { sessionId, seatId });
    socketRef.current.emit('seat_toggle', {
      sessionId,
      seatId
    });
    
    setSelectedSeatIds(prev => {
      const updated = new Set(prev);
      if (updated.has(seatId)) {
        updated.delete(seatId);
      } else {
        updated.add(seatId);
      }
      return updated;
    });
  };

  const handleTogglePalco = ({ label }) => {
    if (soldPalcosLabels.has(label)) return;
    if (!socketRef.current || !sessionId) return;
    
    // Emit socket event for real-time sync
    console.log(`[${mode.toUpperCase()}] Emitting palco_toggle:`, { sessionId, palco: label });
    socketRef.current.emit('palco_toggle', {
      sessionId,
      palco: label
    });
    
    setSelectedPalcosLabels(prev => {
      const updated = new Set(prev);
      if (updated.has(label)) {
        updated.delete(label);
      } else {
        updated.add(label);
      }
      return updated;
    });
  };

  const handlePullmanChange = (delta) => {
    if (!socketRef.current || !sessionId) return;
    
    setPullmanSelected(prev => {
      const newVal = prev + delta;
      if (newVal < 0) return 0;
      if (newVal > pullmanAvailable) return pullmanAvailable;
      
      // Emit socket event for real-time sync
      socketRef.current.emit('pullman_select', {
        sessionId,
        selected: newVal
      });
      
      return newVal;
    });
  };

  const clearSelection = () => {
    // Release all holds via socket
    if (socketRef.current && sessionId) {
      // Release seats
      for (const seatId of selectedSeatIds) {
        socketRef.current.emit('seat_toggle', {
          sessionId,
          seatId
        });
      }
      
      // Release palcos
      for (const palco of selectedPalcosLabels) {
        socketRef.current.emit('palco_toggle', {
          sessionId,
          palco
        });
      }
      
      // Clear pullman
      if (pullmanSelected > 0) {
        socketRef.current.emit('pullman_select', {
          sessionId,
          selected: 0
        });
      }
    }
    
    setSelectedSeatIds(new Set());
    setSelectedPalcosLabels(new Set());
    setPullmanSelected(0);
  };

  if (!sessionId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>
        Seleccioná una sesión para ver las butacas disponibles
      </div>
    );
  }

  return (
    <>
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
            onPullmanChange={handlePullmanChange}
            onToggleSeat={handleToggleSeat}
            onTogglePalco={handleTogglePalco}
          />
        </div>
        
        {/* Render custom sidebar */}
        {sidebarContent}
      </div>
    </>
  );
}
