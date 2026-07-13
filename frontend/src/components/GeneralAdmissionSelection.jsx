import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, API_URL } from '../lib/api';
import { theme } from '../styles/theme';

/**
 * Component for general admission ticket selection (no numbered seats)
 * Used for venues like "El Tablado" and "Las Gemelas"
 * 
 * Props:
 * - showId: ID of the show
 * - sessionId: ID of the selected session
 * - userId: ID of the current user (null for box office)
 * - mode: 'spectator' | 'boxoffice'
 * - onSelectionChange: callback when selection changes
 * - sidebarContent: JSX element for sidebar
 * - maxCapacity: maximum capacity for this venue
 * - ticketPrice: price per ticket
 * - disabled: disable ticket selection controls
 */
export default function GeneralAdmissionSelection({
  showId,
  sessionId,
  userId = null,
  mode = 'spectator',
  onSelectionChange,
  sidebarContent,
  maxCapacity,
  ticketPrice,
  disabled = false
}) {
  const socketRef = useRef(null);
  const socketSyncedRef = useRef(false); // true once socket has provided authoritative availability
  const [ticketCount, setTicketCount] = useState(0);
  const [availableTickets, setAvailableTickets] = useState(maxCapacity); // Initialize with maxCapacity like SeatSelection does
  const [soldCount, setSoldCount] = useState(0);

  // Limit message state (for online purchases)
  const [limitMessage, setLimitMessage] = useState(null);
  const MAX_TICKETS = 10; // Maximum tickets per online purchase
  const isBoxOffice = mode === 'boxoffice';
  
  // Store maxCapacity in ref to avoid re-renders when it changes
  const maxCapacityRef = useRef(maxCapacity);
  if (!maxCapacityRef.current) {
    maxCapacityRef.current = maxCapacity;
  }
  
  // Helper to load availability from backend
  const loadAvailability = useCallback(async () => {
    if (!sessionId) {
      setTicketCount(0);
      setAvailableTickets(maxCapacity);
      setSoldCount(0);
      return;
    }

    // Skip HTTP fetch if socket is already providing authoritative real-time data
    if (socketSyncedRef.current) return;

    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/general-admission-availability`);
      if (res.ok) {
        // Only apply if socket hasn't synced yet (avoid race condition)
        if (!socketSyncedRef.current) {
          const data = await res.json();
          setAvailableTickets(data.available);
          setSoldCount(data.sold);
        }
      }
    } catch (err) {
      console.error('[GeneralAdmission] Error loading availability:', err);
    }
  }, [sessionId, maxCapacity]);

  // Load availability immediately when session changes (like SeatSelection does)
  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    if (!sessionId) return;
    
    console.log('[GeneralAdmission] Component mounted/remounted, sessionId:', sessionId);

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[GeneralAdmission] Socket connected, joining session:', sessionId);
      socket.emit('join_session', { sessionId, userId }); // Changed to match backend event name
      // Do NOT call loadAvailability() here - the backend sends pullman_updated immediately
      // after join_session with the correct count from DB, avoiding HTTP race conditions
    });

    // Listen for pullman events (general admission uses pullman system)
    socket.on('pullman_confirmed', ({ selected, available, capacity }) => {
      console.log('[GeneralAdmission] Confirmed:', { selected, available, capacity });
      setTicketCount(selected);
      setAvailableTickets(available);
    });

    socket.on('pullman_updated', ({ available, capacity }) => {
      console.log('[GeneralAdmission] Updated:', { available, capacity });
      console.log('[GeneralAdmission] Setting availableTickets to:', available);
      socketSyncedRef.current = true; // Mark socket as authoritative source
      setAvailableTickets(available);
    });

    socket.on('pullman_sold', ({ sold }) => {
      console.log('[GeneralAdmission] Sold:', sold);
      setSoldCount(prev => prev + sold);
      setAvailableTickets(prev => Math.max(0, prev - sold));
    });

    socket.on('disconnect', () => {
      console.log('[GeneralAdmission] Socket disconnected');
    });

    socket.on('error', (error) => {
      console.error('[GeneralAdmission] Socket error:', error);
    });

    return () => {
      if (socket) {
        console.log('[GeneralAdmission] Cleaning up socket');
        socket.disconnect();
        socketSyncedRef.current = false; // Reset on cleanup so next mount refetches via HTTP
      }
    };
  }, [sessionId, userId, loadAvailability]);

  // Clear selection function that also emits socket event
  const clearSelection = useCallback((skipSocketEmit = false) => {
    if (!skipSocketEmit && socketRef.current && sessionId && ticketCount > 0) {
      socketRef.current.emit('pullman_clear', { sessionId });
    }
    setTicketCount(0);
  }, [sessionId, ticketCount]);

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange({
        selectedSeatIds: new Set(),
        selectedPalcosLabels: new Set(),
        pullmanSelected: ticketCount,
        generalAdmissionCount: ticketCount,
        clearSelection,
        socketRef: socketRef,
        pricing: {
          platea_general: 0,
          palcos_bajos: 0,
          palcos_altos: 0,
          pullman: ticketPrice,
          general: ticketPrice
        }
      });
    }
  }, [ticketCount, ticketPrice, clearSelection]); // DO NOT include onSelectionChange - causes loop


  // Show limit message with auto-clear
  const showLimitMessage = () => {
    setLimitMessage('Se permiten 10 localidades por compra');
    setTimeout(() => setLimitMessage(null), 3000);
  };

  const handleIncrement = () => {
    // Check if adding would exceed the limit (only for online purchases)
    if (!isBoxOffice && ticketCount >= MAX_TICKETS) {
      showLimitMessage();
      return;
    }
    if (availableTickets > 0) {
      // Emit socket event BEFORE updating state
      if (socketRef.current && sessionId) {
        socketRef.current.emit('pullman_change', {
          sessionId,
          delta: 1
        });
      }
      console.log('[GeneralAdmission] Incrementing ticket count');
    }
  };

  const handleDecrement = () => {
    if (ticketCount > 0) {
      // Emit socket event BEFORE updating state
      if (socketRef.current && sessionId) {
        socketRef.current.emit('pullman_change', {
          sessionId,
          delta: -1
        });
      }
      console.log('[GeneralAdmission] Decrementing ticket count');
    }
  };

  const handleInputChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    // Apply max 10 limit only for online purchases
    const maxAllowed = isBoxOffice ? availableTickets + ticketCount : Math.min(availableTickets + ticketCount, MAX_TICKETS);
    const clamped = Math.max(0, Math.min(value, maxAllowed));
    setTicketCount(clamped);
  };

  // Calculate occupancy including current selection
  console.log('[GeneralAdmission] Rendering with availableTickets:', availableTickets);
  const currentOccupancy = soldCount + ticketCount;
  const occupancyPercentage = ((currentOccupancy / maxCapacityRef.current) * 100).toFixed(1);
  const remainingAfterSelection = availableTickets - ticketCount;
  const isAlmostFull = occupancyPercentage >= 80;
  const isFull = availableTickets === 0 && ticketCount === 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: window.innerWidth >= 1024 ? 'row' : 'column',
      gap: theme.spacing.xl,
      padding: theme.spacing.lg,
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      <style>{`
        .ga-ticket-input::-webkit-outer-spin-button,
        .ga-ticket-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .ga-ticket-input {
          -moz-appearance: textfield;
        }
      `}</style>
      {/* Main content */}
      <div style={{ flex: 1 }}>
        <div style={{
          background: 'white',
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          boxShadow: theme.shadows.md,
          marginBottom: theme.spacing.lg
        }}>
          <h2 style={{
            margin: `0 0 ${theme.spacing.md} 0`,
            fontSize: theme.typography.h3,
            color: theme.colors.textPrimary
          }}>
            Entradas Generales
          </h2>
          
          <p style={{
            margin: `0 0 ${theme.spacing.xl} 0`,
            color: theme.colors.textSecondary,
            fontSize: theme.typography.body
          }}>
            Esta sala no tiene asientos numerados. Seleccioná la cantidad de entradas que necesitás.
          </p>

          {/* Availability indicator */}
          <div style={{
            background: isFull ? '#fee' : isAlmostFull ? '#fff3cd' : '#d1fae5',
            border: `1px solid ${isFull ? '#fcc' : isAlmostFull ? '#ffc107' : '#a7f3d0'}`,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.md,
            marginBottom: theme.spacing.xl
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: theme.spacing.sm
            }}>
              <span style={{
                fontWeight: theme.typography.semibold,
                color: isFull ? '#c00' : isAlmostFull ? '#856404' : '#065f46'
              }}>
                {isFull ? '🔴 Agotado' : isAlmostFull ? '⚠️ Pocas entradas' : '✓ Disponible'}
              </span>
              <span style={{
                fontSize: theme.typography.small,
                color: theme.colors.textSecondary
              }}>
                {availableTickets} entradas disponibles
              </span>
            </div>
            
            {/* Progress bar */}
            <div style={{
              width: '100%',
              height: 8,
              background: '#e5e7eb',
              borderRadius: 4,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${occupancyPercentage}%`,
                height: '100%',
                background: isFull ? '#dc3545' : isAlmostFull ? '#ffc107' : '#10b981',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>

          {/* Ticket selector */}
          {!isFull && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: theme.spacing.lg,
              padding: theme.spacing.xl,
              background: '#f8f9fa',
              borderRadius: theme.borderRadius.lg,
              border: '2px solid #e5e7eb'
            }}>
              <div style={{
                textAlign: 'center'
              }}>
                <label style={{
                  display: 'block',
                  fontSize: theme.typography.h4,
                  fontWeight: theme.typography.semibold,
                  color: theme.colors.textPrimary,
                  marginBottom: theme.spacing.sm
                }}>
                  Cantidad de entradas
                </label>
                <p style={{
                  margin: 0,
                  fontSize: theme.typography.small,
                  color: theme.colors.textSecondary
                }}>
                  {isBoxOffice ? 'Sin límite de entradas' : 'Máximo 10 entradas por compra'}
                </p>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.lg
              }}>
                <button
                  onClick={handleDecrement}
                  disabled={disabled || ticketCount <= 1}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    border: 'none',
                    background: (disabled || ticketCount <= 1) ? '#e5e7eb' : theme.colors.primary,
                    color: (disabled || ticketCount <= 1) ? '#9ca3af' : 'white',
                    fontSize: 24,
                    fontWeight: 'bold',
                    cursor: (disabled || ticketCount <= 1) ? 'not-allowed' : 'pointer',
                    transition: theme.transitions.fast,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: disabled ? 0.5 : 1
                  }}
                >
                  −
                </button>

                <input
                  type="number"
                  className="ga-ticket-input"
                  value={ticketCount}
                  onChange={handleInputChange}
                  min="1"
                  max={isBoxOffice ? availableTickets : Math.min(availableTickets, MAX_TICKETS)}
                  disabled={disabled}
                  style={{
                    width: 80,
                    height: 60,
                    fontSize: 32,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    border: `2px solid ${theme.colors.primary}`,
                    borderRadius: theme.borderRadius.md,
                    outline: 'none',
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'text'
                  }}
                />

                <button
                  onClick={handleIncrement}
                  disabled={disabled || availableTickets <= 0 || (!isBoxOffice && ticketCount >= MAX_TICKETS)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    border: 'none',
                    background: (disabled || availableTickets <= 0 || (!isBoxOffice && ticketCount >= MAX_TICKETS)) ? '#e5e7eb' : theme.colors.primary,
                    color: (disabled || availableTickets <= 0 || (!isBoxOffice && ticketCount >= MAX_TICKETS)) ? '#9ca3af' : 'white',
                    fontSize: 24,
                    fontWeight: 'bold',
                    cursor: (disabled || availableTickets <= 0 || (!isBoxOffice && ticketCount >= MAX_TICKETS)) ? 'not-allowed' : 'pointer',
                    transition: theme.transitions.fast,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: disabled ? 0.5 : 1
                  }}
                >
                  +
                </button>
              </div>

              {/* Price display */}
              <div style={{
                textAlign: 'center',
                padding: theme.spacing.md,
                background: 'white',
                borderRadius: theme.borderRadius.md,
                border: '1px solid #e5e7eb',
                minWidth: 200
              }}>
                <div style={{
                  fontSize: theme.typography.small,
                  color: theme.colors.textSecondary,
                  marginBottom: 4
                }}>
                  Total
                </div>
                <div style={{
                  fontSize: theme.typography.h2,
                  fontWeight: theme.typography.bold,
                  color: theme.colors.primary
                }}>
                  ${(ticketCount * ticketPrice).toLocaleString('es-AR')}
                </div>
                <div style={{
                  fontSize: theme.typography.small,
                  color: theme.colors.textSecondary,
                  marginTop: 4
                }}>
                  {ticketCount} × ${ticketPrice.toLocaleString('es-AR')}
                </div>
              </div>
            </div>
          )}

          {isFull && (
            <div style={{
              textAlign: 'center',
              padding: theme.spacing.xl,
              background: '#fee',
              borderRadius: theme.borderRadius.lg,
              border: '2px solid #fcc'
            }}>
              <div style={{
                fontSize: 48,
                marginBottom: theme.spacing.md
              }}>
                😔
              </div>
              <h3 style={{
                margin: `0 0 ${theme.spacing.sm} 0`,
                color: '#c00'
              }}>
                Entradas agotadas
              </h3>
              <p style={{
                margin: 0,
                color: '#666'
              }}>
                No quedan entradas disponibles para esta función
              </p>
            </div>
          )}
        </div>
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

      {/* Sidebar */}
      {sidebarContent && (
        <div style={{
          width: window.innerWidth >= 1024 ? '380px' : '100%',
          flexShrink: 0
        }}>
          {sidebarContent}
        </div>
      )}
    </div>
  );
}
