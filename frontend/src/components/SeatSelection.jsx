import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiFetch, API_URL } from '../lib/api';
import SalaPrincipalGrid from './SalaPrincipalGrid';
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
  const isHorizontalLayout = isDesktop;
  const desktopScale = isBoxOffice ? 1 : 0.9;

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
  }, [selectedSeatIds, selectedPalcosLabels, pullmanSelected, pricing]);

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
    
    // Emit socket event BEFORE updating state
    socketRef.current.emit('pullman_change', {
      sessionId,
      delta
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
        socketRef.current.emit('pullman_clear', {
          sessionId
        });
      }
    }
    
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
                    selectedPalcosLabels={selectedPalcosLabels}
                    heldByOtherPalcosLabels={heldByOtherPalcosLabels}
                    soldPalcosLabels={soldPalcosLabels}
                    pullmanSelected={pullmanSelected}
                    pullmanAvailable={pullmanAvailable}
                    onPullmanChange={handlePullmanChange}
                    onToggleSeat={handleToggleSeat}
                    onTogglePalco={handleTogglePalco}
                    cellSize={BASE_CELL_SIZE}
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
    </div>
  );
}
