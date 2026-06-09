import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiFetch, API_URL } from '../lib/api';
import SalaPrincipalGrid from './SalaPrincipalGrid';
import PriceTiersDisplay from './PriceTiersDisplay';
import matrix from './SalaPrincipalMatrix.js';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

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
// Generate or retrieve a guest identifier for tracking across refreshes
const getGuestId = () => {
  let guestId = sessionStorage.getItem('guestSocketId');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    sessionStorage.setItem('guestSocketId', guestId);
  }
  return guestId;
};

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
  const gridContainerRef = useRef(null);
  
  // Guest identifier for tracking across refreshes
  const guestId = !userId ? getGuestId() : null;
  
  // Socket connection state
  const [socketConnected, setSocketConnected] = useState(false);

  // Seat selection state
  const [selectedSeatIds, setSelectedSeatIds] = useState(new Set());
  const [selectedPalcosLabels, setSelectedPalcosLabels] = useState(new Set());
  const [pullmanSelected, setPullmanSelected] = useState(0);
  const [pullmanAvailable, setPullmanAvailable] = useState(92);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1200;
  });
  const BASE_CELL_SIZE = 28;
  const MIN_ZOOM = 0.32;
  const MAX_ZOOM = 2.6;
  const GRID_COLS = matrix[0].length;

  // Sold, held, and blocked state
  const [soldSeatIds, setSoldSeatIds] = useState(new Set());
  const [soldPalcosLabels, setSoldPalcosLabels] = useState(new Set());
  const [heldByOtherSeatIds, setHeldByOtherSeatIds] = useState(new Set());
  const [heldByOtherPalcosLabels, setHeldByOtherPalcosLabels] = useState(new Set());
  const [blockedSeatIds, setBlockedSeatIds] = useState(new Set());
  const [blockedPalcosLabels, setBlockedPalcosLabels] = useState(new Set());
  
  // Pricing state (loaded from backend - no defaults, must come from session)
  const [pricing, setPricing] = useState({
    platea_general: 0,
    palcos_bajos: 0,
    palcos_altos: 0,
    pullman: 0
  });
  
  // Price tiers for display with different prices per zone
  const [priceTiers, setPriceTiers] = useState([]);

  // Limit message state (for online purchases)
  const [limitMessage, setLimitMessage] = useState(null);
  const MAX_TICKETS = 10; // Maximum tickets per online purchase

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
        const r = await apiFetch(`/api/sessions/${sessionId}/availability`);
        if (!r.ok) return;
        const data = await r.json();
        
        // Always set sold seats/palcos immediately (they don't depend on socket)
        setSoldSeatIds(new Set(data.soldSeats || []));
        setSoldPalcosLabels(new Set(data.soldPalcos || []));
        setPullmanAvailable(data.pullman?.available ?? 92);
        
        // Set blocked seats/palcos
        setBlockedSeatIds(new Set(data.blockedSeats || []));
        setBlockedPalcosLabels(new Set(data.blockedPalcos || []));
        
        // Set pricing if available
        if (data.pricing) {
          setPricing(data.pricing);
        }
        
        // Set price tiers if available
        if (data.priceTiers) {
          setPriceTiers(data.priceTiers);
        }
        
        // Filter held items by socket ID or guest ID
        const myId = socketRef.current?.id;
        const myGuestId = guestId;
        
        const isMyHold = (hold) => {
          if (!hold) return false;
          if (myId && hold.by === myId) return true;
          if (myGuestId && hold.guestId === myGuestId) return true;
          return false;
        };
        
        const otherHeldSeats = new Set((data.heldSeats || []).filter(x => !isMyHold(x)).map(x => x.seatId));
        const otherHeldPalcos = new Set((data.heldPalcos || []).filter(x => !isMyHold(x)).map(x => x.palco));
        setHeldByOtherSeatIds(otherHeldSeats);
        setHeldByOtherPalcosLabels(otherHeldPalcos);
        
        // Don't restore selections on page refresh - start fresh
        // User requested clean slate behavior instead of unreliable restoration
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
    setSocketConnected(false);

    // Connect socket if not already connected
    if (!socketRef.current) {
      socketRef.current = io(API_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });
    }
    
    const socket = socketRef.current;
    
    // When socket connects, re-filter holds to exclude our own
    const onConnect = async () => {
      console.log('[SeatSelection] Socket connected with id:', socket.id);
      setSocketConnected(true);
      
      // Join session room immediately on connect
      // Include guestId for guests to help track across refreshes
      socket.emit('join_session', { sessionId, userId, guestId });
      
      try {
        const r = await apiFetch(`/api/sessions/${sessionId}/availability`);
        if (!r.ok) return;
        const data = await r.json();
        
        // Filter out our own holds (by socket ID or guest ID)
        const myId = socket.id;
        const myGuestId = guestId;
        const isMyHold = (hold) => {
          if (!hold) return false;
          if (hold.by === myId) return true;
          if (myGuestId && hold.guestId === myGuestId) return true;
          return false;
        };
        
        const otherHeldSeats = new Set((data.heldSeats || []).filter(x => !isMyHold(x)).map(x => x.seatId));
        const otherHeldPalcos = new Set((data.heldPalcos || []).filter(x => !isMyHold(x)).map(x => x.palco));
        setHeldByOtherSeatIds(otherHeldSeats);
        setHeldByOtherPalcosLabels(otherHeldPalcos);
      } catch (err) {
        console.error('[SeatSelection] Error re-filtering holds:', err);
      }
    };
    
    const onDisconnect = (reason) => {
      console.log('[SeatSelection] Socket disconnected:', reason);
      setSocketConnected(false);
    };
    
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    
    // If already connected, join immediately
    if (socket.connected) {
      onConnect();
    }
    
    // Listen for seat holds from others
    const onSeatHeld = ({ seatId, by }) => {
      if (by !== socket.id) {
        setHeldByOtherSeatIds(prev => new Set([...prev, seatId]));
      }
    };
    
    const onSeatReleased = ({ seatId, by, reason }) => {
      console.log('[SeatSelection] seat_released event:', { seatId, by, reason });
      setHeldByOtherSeatIds(prev => {
        const updated = new Set(prev);
        const wasHeld = updated.has(seatId);
        updated.delete(seatId);
        console.log('[SeatSelection] Removed from holds:', seatId, 'wasHeld:', wasHeld);
        return updated;
      });
    };
    
    const onPalcoHeld = ({ palco, by }) => {
      if (by !== socket.id) {
        setHeldByOtherPalcosLabels(prev => new Set([...prev, palco]));
      }
    };
    
    const onPalcoReleased = ({ palco, by, reason }) => {
      console.log('[SeatSelection] palco_released event:', { palco, by, reason });
      setHeldByOtherPalcosLabels(prev => {
        const updated = new Set(prev);
        const wasHeld = updated.has(palco);
        updated.delete(palco);
        console.log('[SeatSelection] Removed palco from holds:', palco, 'wasHeld:', wasHeld);
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
    
    const onPullmanSold = ({ sold }) => {
      setPullmanAvailable(prev => Math.max(0, prev - sold));
    };
    
    const onPullmanConfirmed = ({ selected, available }) => {
      setPullmanSelected(selected);
      setPullmanAvailable(available);
    };
    
    socket.on('seat_held', onSeatHeld);
    socket.on('seat_released', onSeatReleased);
    socket.on('palco_held', onPalcoHeld);
    socket.on('palco_released', onPalcoReleased);
    socket.on('seat_sold', onSeatSold);
    socket.on('palco_sold', onPalcoSold);
    socket.on('pullman_updated', onPullmanUpdated);
    socket.on('pullman_sold', onPullmanSold);
    socket.on('pullman_confirmed', onPullmanConfirmed);
    
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('seat_held', onSeatHeld);
      socket.off('seat_released', onSeatReleased);
      socket.off('palco_held', onPalcoHeld);
      socket.off('palco_released', onPalcoReleased);
      socket.off('seat_sold', onSeatSold);
      socket.off('palco_sold', onPalcoSold);
      socket.off('pullman_updated', onPullmanUpdated);
      socket.off('pullman_sold', onPullmanSold);
      socket.off('pullman_confirmed', onPullmanConfirmed);
    };
  }, [sessionId, userId, mode]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsDesktop(window.innerWidth >= 1200);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const allowHorizontalScroll = isDesktop; // horizontal scroll del contenedor lo maneja TransformWrapper
  const isBoxOffice = mode === 'boxoffice';
  const isBlocking = mode === 'blocking';
  const isHorizontalLayout = isDesktop;
  const desktopScale = isBoxOffice ? 1 : 0.9;

  // Calculate total tickets considering palco multipliers
  const calculateTotalTickets = () => {
    const regularSeats = selectedSeatIds.size;
    let palcoTickets = 0;
    for (const label of selectedPalcosLabels) {
      if (/^PB/i.test(label)) {
        palcoTickets += 4; // Palcos bajos = 4 entradas
      } else if (/^PA/i.test(label)) {
        palcoTickets += 2; // Palcos altos = 2 entradas
      }
    }
    const pullmanTickets = pullmanSelected;
    return regularSeats + palcoTickets + pullmanTickets;
  };

  // Show limit message with auto-clear
  const showLimitMessage = () => {
    setLimitMessage('Se permiten 10 localidades por compra');
    setTimeout(() => setLimitMessage(null), 3000);
  };

  // Notify parent when selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        selectedSeatIds,
        selectedPalcosLabels,
        pullmanSelected,
        clearSelection,
        socketRef,
        pricing,
        socketConnected
      });
    }
  }, [selectedSeatIds, selectedPalcosLabels, pullmanSelected, pricing, socketConnected]);

  const handleToggleSeat = ({ r, c, val, row }) => {
    const seatId = `${row || ''}${val}`;
    if (soldSeatIds.has(seatId)) return;
    // In blocking mode, allow selecting blocked seats (for unblocking)
    // In other modes, blocked seats should be treated as unavailable
    if (mode !== 'blocking' && blockedSeatIds.has(seatId)) return;
    if (heldByOtherSeatIds.has(seatId)) return; // Don't allow selecting seats held by others
    if (!socketRef.current || !sessionId) return;

    // Check if adding this seat would exceed the limit (only for online purchases, not blocking)
    const isAdding = !selectedSeatIds.has(seatId);
    if (!isBoxOffice && !isBlocking && isAdding) {
      const currentTotal = calculateTotalTickets();
      if (currentTotal >= MAX_TICKETS) {
        showLimitMessage();
        return;
      }
    }

    // Warn if socket not connected
    if (!socketConnected) {
      console.warn('[SeatSelection] Socket not connected, selection may not sync');
    }

    // Emit socket event for real-time sync
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
    // In blocking mode, allow selecting blocked palcos (for unblocking)
    if (mode !== 'blocking' && blockedPalcosLabels.has(label)) return;
    if (heldByOtherPalcosLabels.has(label)) return; // Don't allow selecting palcos held by others
    if (!socketRef.current || !sessionId) return;

    // Check if adding this palco would exceed the limit (only for online purchases, not blocking)
    const isAdding = !selectedPalcosLabels.has(label);
    if (!isBoxOffice && !isBlocking && isAdding) {
      const palcoTickets = /^PB/i.test(label) ? 4 : 2;
      const currentTotal = calculateTotalTickets();
      if (currentTotal + palcoTickets > MAX_TICKETS) {
        showLimitMessage();
        return;
      }
    }

    // Warn if socket not connected
    if (!socketConnected) {
      console.warn('[SeatSelection] Socket not connected, selection may not sync');
    }

    // Emit socket event for real-time sync
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

    // Check if adding pullman tickets would exceed the limit (only for online purchases)
    if (!isBoxOffice && delta > 0) {
      const currentTotal = calculateTotalTickets();
      if (currentTotal + delta > MAX_TICKETS) {
        showLimitMessage();
        return;
      }
    }

    // Emit socket event BEFORE updating state
    socketRef.current.emit('pullman_change', {
      sessionId,
      delta
    });
  };

  const clearSelection = (skipSocketEmit = false) => {
    // Release all holds via socket (unless skipSocketEmit is true)
    if (!skipSocketEmit && socketRef.current && sessionId) {
      // Use bulk clear events instead of individual toggles
      socketRef.current.emit('seat_clear', { sessionId });
      socketRef.current.emit('palco_clear', { sessionId });
      
      // Clear pullman
      if (pullmanSelected > 0) {
        socketRef.current.emit('pullman_clear', { sessionId });
      }
    }
    
    // Clear local selection state
    setSelectedSeatIds(new Set());
    setSelectedPalcosLabels(new Set());
    setPullmanSelected(0);
  };

  if (!sessionId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>
        Seleccioná una función para ver las butacas disponibles
      </div>
    );
  }

  const hasSidebar = Boolean(sidebarContent);

  return (
    <div
      style={{
        width: '100%',
        padding: (isBoxOffice || mode === 'spectator') ? 0 : (isDesktop ? '0 8px 0 0' : '0 12px'),
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: isHorizontalLayout ? 'row' : 'column',
          alignItems: isHorizontalLayout ? 'flex-start' : 'stretch',
          gap: 24,
          width: '100%'
        }}
      >
        <div
          style={{
            flex: isHorizontalLayout ? '1 1 0%' : '1 1 auto',
            minWidth: 0,
            width: '100%',
            margin: 0
          }}
        >
          <TransformWrapper
            initialScale={isDesktop ? desktopScale : MIN_ZOOM}
            minScale={isDesktop ? desktopScale : MIN_ZOOM}
            maxScale={isDesktop ? desktopScale : MAX_ZOOM}
            centerOnInit
            wheel={{ disabled: true }}
            doubleClick={{ disabled: true }}
            pinch={{ disabled: isDesktop && isBoxOffice }}
          >
            {({ zoomIn, zoomOut }) => (
              <div style={{ position: 'relative' }}>
                {!isDesktop && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(255,255,255,0.9)',
                      borderRadius: 999,
                      padding: '4px 6px',
                      boxShadow: '0 2px 6px rgba(15,23,42,0.15)',
                      zIndex: 2
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Zoom</span>
                    <button
                      type="button"
                      onClick={() => zoomOut()}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        border: '1px solid #d1d5db',
                        background: '#ffffff',
                        color: '#111827',
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => zoomIn()}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        border: '1px solid #d1d5db',
                        background: '#ffffff',
                        color: '#111827',
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      +
                    </button>
                  </div>
                )}

                <TransformComponent
                  wrapperStyle={{
                    width: '100%',
                    maxWidth: '100%',
                    height: 'fit-content',
                    maxHeight: isDesktop ? undefined : '40vh',
                    overflow: allowHorizontalScroll ? 'auto' : 'hidden'
                  }}
                  contentStyle={{
                    width: 'fit-content',
                    height: 'fit-content',
                    margin: '0 auto'
                  }}
                >
                  <SalaPrincipalGrid
                    selectedSeatIds={selectedSeatIds}
                    heldByOtherSeatIds={heldByOtherSeatIds}
                    soldSeatIds={soldSeatIds}
                    blockedSeatIds={blockedSeatIds}
                    selectedPalcosLabels={selectedPalcosLabels}
                    heldByOtherPalcosLabels={heldByOtherPalcosLabels}
                    soldPalcosLabels={soldPalcosLabels}
                    blockedPalcosLabels={blockedPalcosLabels}
                    pullmanSelected={pullmanSelected}
                    pullmanAvailable={pullmanAvailable}
                    onPullmanChange={handlePullmanChange}
                    onToggleSeat={handleToggleSeat}
                    onTogglePalco={handleTogglePalco}
                    cellSize={BASE_CELL_SIZE}
                    mode={mode}
                    priceTiers={priceTiers}
                  />
                </TransformComponent>
              </div>
            )}
          </TransformWrapper>
        </div>

        {/* Render custom sidebar */}
        {hasSidebar && (
          <div
            style={{
              flex: isDesktop ? '0 0 260px' : '1 1 auto',
              maxWidth: isDesktop ? 280 : '100%',
              width: isDesktop ? 260 : '100%',
              alignSelf: 'stretch',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {sidebarContent}
          </div>
        )}
      </div>

      {/* Limit message notification */}
      {limitMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 100,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#dc2626',
            color: 'white',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {limitMessage}
        </div>
      )}
    </div>
  );
}
