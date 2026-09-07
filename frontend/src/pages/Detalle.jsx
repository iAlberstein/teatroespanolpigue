import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import SeatSelection from '../components/SeatSelection.jsx';
import GeneralAdmissionSelection from '../components/GeneralAdmissionSelection.jsx';
import BoxOfficeReferences from '../components/BoxOfficeReferences.jsx';
import GuestCheckoutModal from '../components/GuestCheckoutModal.jsx';
import GuestCheckoutForm from '../components/GuestCheckoutForm.jsx';
import PackCheckout from '../components/PackCheckout.jsx';
import { apiFetch, apiAuthFetch } from '../lib/api';
import { formatSeatLocation, validatePlateaBajaRows } from '../lib/seatFormatter';
import { getShowImageUrl } from '../lib/media';
import { getSeatPriceTier } from '../lib/seatPriceColors.js';
import { formatDateLong, formatTime, formatDateShort } from '../lib/dateFormatter.js';

export default function Detalle(){
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('sesion');
  const { user, token, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(sessionParam);
  const [reservation, setReservation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const expiredHandledRef = useRef(false);
  const creatingReservationRef = useRef(false);
  const syncingRef = useRef(false); // Ref version of syncing for debounce
  const reservationRef = useRef(null); // Ref version of reservation for debounce
  const selectionSectionRef = useRef(null);
  
  const venueLabelMap = {
    sala_principal: 'Sala Principal',
    el_tablado: 'El Tablado',
    las_gemelas: 'Nueva sala'
  };
  
  // Discount state
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);
  
  // Service fee state (fetched from settings)
  const [serviceFeePercent, setServiceFeePercent] = useState(10);

  // Associated services state
  const [showServices, setShowServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState({});

  // Guest checkout modal state
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestData, setGuestData] = useState(null);
  const [emittingFreeTickets, setEmittingFreeTickets] = useState(false);
  const [creatingSipagoOrder, setCreatingSipagoOrder] = useState(false);

  // Pack multi-function checkout state
  const [showPackCheckout, setShowPackCheckout] = useState(false);

  // Auto-open pack checkout for pack-enabled shows with multiple sessions
  useEffect(() => {
    if (show?.pack_enabled && sessions.length >= 2) {
      setShowPackCheckout(true);
    }
  }, [show?.pack_enabled, sessions.length]);

  // Mobile cart drawer state
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Responsive check
  const isWideLayout = typeof window !== 'undefined' && window.innerWidth >= 1200;
  const [isMobileHero, setIsMobileHero] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  // No default pricing - all prices must come from session
  const defaultPricing = {
    platea_general: 0,
    palcos_bajos: 0,
    palcos_altos: 0,
    pullman: 0
  };

  // Scroll to top when loading finishes
  useEffect(() => {
    if (!initialLoading) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [initialLoading]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(Number(amount || 0));
  };

  // Check if user can proceed with reservations
  // Returns true if user is authenticated OR has accepted guest checkout
  const canProceed = () => {
    return isAuthenticated || isGuest;
  };

  const handleExpire = async () => {
    if (expiredHandledRef.current) return;
    expiredHandledRef.current = true;
    try {
      alert('Tu reserva expiró');
    } catch {}
    try {
      if (reservation) {
        await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' }).catch(()=>{});
      }
      setReservation(null);
      setTimeLeft(0);
    } finally {
      try { window.location.reload(); } catch {}
    }
  };

  // Check if user should see guest modal
  useEffect(() => {
    // Wait for auth to finish loading before showing guest modal
    if (authLoading) return;
    
    if (!isAuthenticated) {
      const guestAccepted = sessionStorage.getItem('guestCheckoutAccepted');
      if (!guestAccepted) {
        setShowGuestModal(true);
      } else {
        setIsGuest(true);
      }
    } else {
      // User is authenticated, ensure modal is closed
      setShowGuestModal(false);
    }
  }, [isAuthenticated, authLoading]);

  // When guest accepts modal (isGuest becomes true), trigger reservation if there are selections
  // Use a ref to avoid circular dependencies
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;
  
  useEffect(() => {
    if (!isGuest) return;
    
    // Small delay to ensure state is updated
    const timer = setTimeout(() => {
      const sel = clearSelectionRef.current;
      if (sel && selectedSession && !reservation && sel.selectedSeatIds?.size > 0) {
        // Trigger the auto-reserve effect by updating currentSelection
        setCurrentSelection(prev => ({ ...prev }));
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isGuest, selectedSession, reservation]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsMobileHero(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load service fee from settings
  useEffect(() => {
    apiFetch('/api/settings/service_fee_percent')
      .then(r => r.json())
      .then(data => {
        if (data.value) {
          setServiceFeePercent(parseFloat(data.value));
        }
      })
      .catch(err => console.error('[Detalle] Error loading service fee:', err));
  }, []);

  // Load show info
  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/shows/${id}`)
      .then(r => r.json())
      .then(data => {
        // Parse pricing_json if it's a string
        if (typeof data.pricing_json === 'string') {
          try {
            data.pricing_json = JSON.parse(data.pricing_json);
          } catch (e) {
            data.pricing_json = {};
          }
        }
        console.log('[Detalle] Show loaded:', {
          id: data.id,
          title: data.title,
          venue_type: data.venue_type,
          general_capacity: data.general_capacity,
          pricing_json: data.pricing_json
        });
        setShow(data);
      })
      .catch(err => console.error('Error loading show:', err));
  }, [id]);

  // Load associated services
  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/shows/${id}/services`)
      .then(r => r.json())
      .then(data => setShowServices(Array.isArray(data) ? data : []))
      .catch(() => setShowServices([]));
  }, [id]);

  // Load sessions
  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/shows/${id}/sessions`)
      .then(r=>r.json())
      .then(sessions => {
        setSessions(sessions);
        // Pre-select session: URL param > single session > null (user chooses)
        if (sessionParam && sessions.find(s => s.id === sessionParam)) {
          // Use session from URL parameter if valid
          setSelectedSession(sessionParam);
        } else if (sessions.length === 1) {
          setSelectedSession(sessions[0].id);
        } else if (sessions.length > 0 && !sessionParam) {
          // Don't auto-select, let user choose
          setSelectedSession(null);
        }
      })
      .catch(err => {
        console.error('Error loading sessions:', err);
        setSessions([]);
      });
  }, [id]);

  // Inject JSON-LD structured data for SEO (correct timezone for Google)
  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/seo/show/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.jsonLd) {
          const existingScript = document.querySelector('script[data-seo-jsonld]');
          if (existingScript) existingScript.remove();
          const script = document.createElement('script');
          script.type = 'application/ld+json';
          script.setAttribute('data-seo-jsonld', 'true');
          script.textContent = JSON.stringify(data.jsonLd);
          document.head.appendChild(script);
        }
      })
      .catch(() => {});
    return () => {
      const script = document.querySelector('script[data-seo-jsonld]');
      if (script) script.remove();
    };
  }, [id]);

  // Initial loading delay of 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Reservation timer
  useEffect(() => {
    if (!reservation?.expires_at) return;
    expiredHandledRef.current = false;
    const end = new Date(reservation.expires_at).getTime();
    const initial = Math.max(0, Math.floor((end - Date.now())/1000));
    setTimeLeft(initial);
    const i = setInterval(() => {
      const diff = Math.max(0, Math.floor((end - Date.now())/1000));
      setTimeLeft(diff);
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

  const buildItems = (selectedSeatIds, selectedPalcosLabels, pullmanSelected, generalAdmissionCount = 0) => {
    const items = [];
    for (const sid of Array.from(selectedSeatIds)) {
      items.push({ type: 'butaca', section: 'Platea General', seat_code: sid });
    }
    for (const label of Array.from(selectedPalcosLabels)) {
      const isPB = /^PB/i.test(label);
      const pack = isPB ? 4 : 2;
      items.push({ type: 'palco', section: label.startsWith('PB') ? 'Palcos Bajos' : 'Palcos Altos', seat_code: label, quantity: pack });
    }
    // For sala_principal: use pullman type
    // For el_tablado/las_gemelas: use general type (passed via generalAdmissionCount)
    if (show?.venue_type === 'sala_principal' && pullmanSelected > 0) {
      items.push({ type: 'pullman', section: 'Pullman', quantity: pullmanSelected });
    } else if ((show?.venue_type === 'el_tablado' || show?.venue_type === 'las_gemelas') && (generalAdmissionCount > 0 || pullmanSelected > 0)) {
      // GeneralAdmissionSelection uses pullmanSelected for backward compatibility
      const qty = generalAdmissionCount > 0 ? generalAdmissionCount : pullmanSelected;
      items.push({ type: 'general', section: 'General', quantity: qty });
    } else if (pullmanSelected > 0) {
      // Fallback for pullman if venue_type is not set
      items.push({ type: 'pullman', section: 'Pullman', quantity: pullmanSelected });
    }
    return items;
  };

  // Keep syncingRef in sync with syncing state
  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  // Sync reservation with backend - called after debounce
  const syncReservation = useCallback(async (items, socketRef) => {
    if (items.length === 0) return;
    if (!canProceed()) return;
    if (syncingRef.current) return;
    
    syncingRef.current = true;
    setSyncing(true);
    
    try {
      // If reservation exists, update it
      if (reservation && reservation.id) {
        console.log('[Sync] Updating reservation with items:', items.length);
        const updateRes = await apiFetch(`/api/reservations/${reservation.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-socket-id': socketRef?.current?.id || ''
          },
          body: JSON.stringify({ items })
        });

        if (!updateRes.ok) {
          const updateError = await updateRes.json().catch(() => ({}));
          if (updateRes.status === 409 && (updateError.error === 'Reservation not active' || updateError.error === 'items_conflict')) {
            console.log('[Sync] Reservation expired or items conflict, canceling and creating new one');
            // Cancel the expired/conflicted reservation to prevent finding it again
            try {
              await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' });
              console.log('[Sync] Canceled expired reservation:', reservation.id);
            } catch {}
            setReservation(null);
            // Continue to create new reservation below
          } else {
            console.error('[Sync] Update failed:', updateError);
            return;
          }
        } else {
          return;
        }
      }
      
      // Prevent multiple concurrent creation attempts
      if (creatingReservationRef.current) return;
      creatingReservationRef.current = true;
      
      // Check if user already has active reservation
      if (user?.id) {
        try {
          const checkRes = await apiFetch(`/api/reservations?user_id=${user.id}&session_id=${selectedSession}&status=active`);
          if (checkRes.ok) {
            const existingReservations = await checkRes.json();
            if (Array.isArray(existingReservations) && existingReservations.length > 0) {
              const existing = existingReservations[0];
              setReservation(existing);
              creatingReservationRef.current = false;
              console.log('[Sync] Found existing reservation, updating with items:', items.length);
              const existingUpdateRes = await apiFetch(`/api/reservations/${existing.id}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'x-socket-id': socketRef?.current?.id || ''
                },
                body: JSON.stringify({ items })
              });

              if (!existingUpdateRes.ok) {
                const existingUpdateError = await existingUpdateRes.json().catch(() => ({}));
                if (existingUpdateRes.status === 409 && existingUpdateError.error === 'Reservation not active') {
                  console.log('[Sync] Existing reservation expired, canceling and creating new one');
                  // Cancel the expired reservation
                  try {
                    await apiFetch(`/api/reservations/${existing.id}`, { method: 'DELETE' });
                    console.log('[Sync] Canceled expired existing reservation:', existing.id);
                  } catch {}
                  setReservation(null);
                  // Continue to create new reservation
                } else {
                  return;
                }
              } else {
                return;
              }
            }
          }
        } catch (err) {
          // Ignore errors checking for existing reservations
        }
      }
      
      // Create new reservation
      const headers = {
        'Content-Type': 'application/json',
        'x-socket-id': socketRef?.current?.id || ''
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      console.log('[Sync] Creating reservation with items:', items.length);
      const res = await apiFetch('/api/reservations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ session_id: selectedSession, items, user_id: user?.id })
      });
      
      // Handle conflict - reservation already exists
      if (res.status === 409) {
        const body = await res.json().catch(()=>({}));
        if (body?.reservation) {
          setReservation(body.reservation);
          creatingReservationRef.current = false;
          const conflictUpdateRes = await apiFetch(`/api/reservations/${body.reservation.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-socket-id': socketRef?.current?.id || ''
            },
            body: JSON.stringify({ items })
          });

          if (!conflictUpdateRes.ok) {
            const conflictUpdateError = await conflictUpdateRes.json().catch(() => ({}));
            if (conflictUpdateRes.status === 409 && conflictUpdateError.error === 'Reservation not active') {
              console.log('[Sync] Conflict reservation expired, canceling and creating new one');
              // Cancel the expired conflict reservation
              try {
                await apiFetch(`/api/reservations/${body.reservation.id}`, { method: 'DELETE' });
                console.log('[Sync] Canceled expired conflict reservation:', body.reservation.id);
              } catch {}
              setReservation(null);
              // Continue to create new reservation
            } else {
              return;
            }
          } else {
            return;
          }
        }
      }
      
      if (!res.ok) {
        const e = await res.json().catch(()=>({}));
        if (e.error === 'seat_not_available') {
          creatingReservationRef.current = false;
          return;
        }
        console.error('[Reservation] Failed to create:', e);
        creatingReservationRef.current = false;
        return;
      }
      
      const data = await res.json();
      setReservation(data);
      creatingReservationRef.current = false;
    } catch(err) {
      console.error('[Reservation sync] error:', err);
      creatingReservationRef.current = false;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [selectedSession, reservation, user, token, isGuest, isAuthenticated]);

  // Handle empty selection - cancel reservation
  const handleEmptySelection = useCallback(async (socketRef) => {
    creatingReservationRef.current = false;
    if (reservation && !syncingRef.current) {
      if (socketRef?.current && selectedSession) {
        socketRef.current.emit('pullman_clear', { sessionId: selectedSession });
        socketRef.current.emit('seat_clear', { sessionId: selectedSession });
        socketRef.current.emit('palco_clear', { sessionId: selectedSession });
      }
      await cancelReservation();
    }
  }, [reservation, selectedSession]);

  const cancelReservation = useCallback(async () => {
    if (!reservation) return;
    
    try {
      console.log('[Detalle] Cancelling reservation:', reservation.id);
      console.log('[Detalle] clearSelectionRef.current:', clearSelectionRef.current);
      
      // Get socket reference
      const socketRef = clearSelectionRef.current?.socketRef;
      console.log('[Detalle] socketRef:', socketRef);
      
      const socket = socketRef?.current;
      console.log('[Detalle] socket:', socket);
      console.log('[Detalle] socket.connected:', socket?.connected);
      
      if (socket && socket.connected) {
        console.log('[Detalle] ✅ Using socket to cancel reservation');
        
        // Emit cancel event via socket
        socket.emit('cancel_reservation', { reservationId: reservation.id });
        console.log('[Detalle] Event emitted, waiting for response...');
        
        // Wait for confirmation
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.error('[Detalle] ❌ Socket cancel timeout after 5s');
              reject(new Error('Timeout'));
            }, 5000);
            
            socket.once('cancel_reservation_success', () => {
              console.log('[Detalle] ✅ Socket cancel success');
              clearTimeout(timeout);
              resolve();
            });
            
            socket.once('cancel_reservation_error', (data) => {
              console.error('[Detalle] ❌ Socket cancel error:', data);
              clearTimeout(timeout);
              reject(new Error(data.error));
            });
          });
        } catch (socketErr) {
          console.error('[Detalle] ❌ Socket cancel failed, using HTTP fallback:', socketErr);
          // Fallback to HTTP
          await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' });
        }
      } else {
        console.log('[Detalle] ❌ Socket not available, using HTTP');
        console.log('[Detalle] Reason:', !socket ? 'socket is null' : 'socket not connected');
        // No socket, use HTTP
        await apiFetch(`/api/reservations/${reservation.id}`, { method: 'DELETE' });
      }
      
      // Clear reservation state
      setReservation(null);
      setTimeLeft(0);
      
      // Reset creation flag to allow new reservations
      creatingReservationRef.current = false;
      
      // Clear selection WITHOUT emitting socket events (backend already released holds)
      if (clearSelectionRef.current?.clearSelection) {
        clearSelectionRef.current.clearSelection(true); // true = skipSocketEmit
      }
      if (socket && socket.connected) {
        socket.disconnect();
      }
      
      console.log('[Detalle] ✅ Reservation cancelled successfully');
      
      // Redirect to home after cancelling
      navigate('/');
      
    } catch (err) {
      console.error('[Detalle] ❌ Error cancelling:', err);
      alert('Error al cancelar la reserva: ' + err.message);
      // Also reset flag on error to allow retry
      creatingReservationRef.current = false;
    }
  }, [reservation, navigate]);

  const fmt = (s) => {
    const m = Math.floor(s/60).toString().padStart(2,'0');
    const r = (s%60).toString().padStart(2,'0');
    return `${m}:${r}`;
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    
    // Calculate seat count using seatUtils logic
    const items = [];
    for (const seatId of currentSelection.selectedSeatIds) {
      items.push({ type: 'butaca', seat_code: seatId });
    }
    for (const label of currentSelection.selectedPalcosLabels) {
      const isPB = /^PB/i.test(label);
      items.push({ type: 'palco', seat_code: label, quantity: isPB ? 4 : 2 });
    }
    if (currentSelection.pullmanSelected > 0) {
      items.push({ type: currentSelection.pricing?.general > 0 ? 'general' : 'pullman', quantity: currentSelection.pullmanSelected });
    }
    if (currentSelection.generalAdmissionCount > 0) {
      items.push({ type: 'general', quantity: currentSelection.generalAdmissionCount });
    }
    const seatCount = items.reduce((sum, item) => {
      if (item.type === 'butaca') return sum + 1;
      if (item.type === 'palco' && item.quantity) return sum + item.quantity;
      if ((item.type === 'pullman' || item.type === 'general') && item.quantity) return sum + item.quantity;
      return sum + 1;
    }, 0);
    
    setValidatingDiscount(true);
    setDiscountError('');
    
    try {
      const res = await apiFetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: discountCode.trim(),
          show_id: id,
          seat_count: seatCount,
          items
        })
      });
      
      if (res.ok) {
        const discount = await res.json();
        // Apply multiplier hint for fixed discount
        if (discount.type === 'fixed' && discount.multiplier_hint && discount.multiplier_hint > 1) {
          discount.value = Number(discount.value) * discount.multiplier_hint;
        }
        setAppliedDiscount(discount);
        setDiscountError('');
      } else {
        const error = await res.json();
        setDiscountError(error.message || 'Código inválido');
        setAppliedDiscount(null);
      }
    } catch (err) {
      setDiscountError('Error al validar cupón');
      setAppliedDiscount(null);
    } finally {
      setValidatingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError('');
  };

  const handlePaymentClick = () => {
    // If user is guest and hasn't filled the form yet, show the form
    if (isGuest && !guestData) {
      setShowGuestForm(true);
    } else {
      // User is authenticated or guest has filled the form, proceed to payment
      payWithSipago(guestData);
    }
  };

  const handleFreeEmissionClick = () => {
    // If user is guest and hasn't filled the form yet, show the form
    if (isGuest && !guestData) {
      setShowGuestForm(true);
    } else {
      // User is authenticated or guest has filled the form, emit free tickets
      emitFreeTickets(guestData);
    }
  };

  const handleGuestFormSubmit = (data) => {
    setGuestData(data);
    setShowGuestForm(false);
    // Check if this is a free emission ($0 total)
    const { total } = calculatePrices();
    if (total === 0 && appliedDiscount) {
      emitFreeTickets(data);
    } else {
      // Proceed to payment with guest data
      payWithSipago(data);
    }
  };

  const payWithSipago = async (customerData = null) => {
    if (!reservation || creatingSipagoOrder) return;
    let currentReservation = reservation;
    setCreatingSipagoOrder(true);
    try {
      // CRITICAL: Sync the current selection to the reservation BEFORE creating preference
      // This ensures the DB has all the items the user selected
      const items = buildItems(
        currentSelection.selectedSeatIds,
        currentSelection.selectedPalcosLabels,
        currentSelection.pullmanSelected,
        currentSelection.generalAdmissionCount || 0
      );

      if (items.length === 0) {
        alert('No hay items seleccionados para el pago.');
        return;
      }

      console.log('[SIPAGO] Syncing reservation before payment with items:', items.length);

      // Force sync the reservation with current items
      const syncRes = await apiFetch(`/api/reservations/${currentReservation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-socket-id': currentSelection.socketRef?.current?.id || ''
        },
        body: JSON.stringify({ items })
      });

      if (!syncRes.ok) {
        const syncError = await syncRes.json().catch(() => ({}));
        console.error('[SIPAGO] Error syncing reservation:', syncError);

        // If reservation expired, try to create a new one
        if (syncRes.status === 409 && syncError.error === 'Reservation not active') {
          console.log('[SIPAGO] Reservation expired, creating new one...');

          // Clear expired reservation
          setReservation(null);
          currentReservation = null;

          // Create new reservation
          const headers = {
            'Content-Type': 'application/json',
            'x-socket-id': currentSelection.socketRef?.current?.id || ''
          };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const createRes = await apiFetch('/api/reservations', {
            method: 'POST',
            headers,
            body: JSON.stringify({ session_id: selectedSession, items, user_id: user?.id })
          });

          if (!createRes.ok) {
            const createError = await createRes.json().catch(() => ({}));
            console.error('[SIPAGO] Error creating new reservation:', createError);
            alert('Tu reserva expiró y no se pudo crear una nueva. Por favor, intentá de nuevo.');
            return;
          }

          currentReservation = await createRes.json();
          setReservation(currentReservation);
          console.log('[SIPAGO] New reservation created:', currentReservation.id);
        } else {
          alert('Error al sincronizar la reserva. Por favor, intentá de nuevo.');
          return;
        }
      }

      console.log('[SIPAGO] Reservation ready, creating Sipago order...');

      const payload = {
        reservation_id: currentReservation.id,
        discount_id: appliedDiscount?.id || null,
        service_items: cartServiceItems.length > 0 ? cartServiceItems : undefined
      };

      // Add customer data - guest checkout or logged-in user
      if (customerData) {
        payload.customer_name = customerData.name;
        payload.customer_dni = customerData.dni;
        payload.customer_phone = customerData.phone;
        payload.customer_email = customerData.email;
        payload.customer_provincia = customerData.provincia;
        payload.customer_localidad = customerData.localidad;
      } else if (user) {
        payload.customer_name = user.name || null;
        payload.customer_dni = user.dni || null;
        payload.customer_phone = user.phone || null;
        payload.customer_email = user.email || null;
        payload.customer_provincia = user.provincia || null;
        payload.customer_localidad = user.localidad || null;
      }

      const r = await apiFetch('/api/payments/sipago-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}));
        console.error('[SIPAGO] Error creating order:', errorData);
        alert(errorData.error === 'sipago_creation_failed' ? 'SiPago no pudo iniciar la operación. No se realizó ningún cobro y tus butacas siguen reservadas mientras el contador esté activo. Podés volver a intentarlo.' : 'Error al crear la orden de pago. No se realizó ningún cobro; podés volver a intentarlo.');
        return;
      }
      
      const data = await r.json();
      
      // Persist order UUID and guest data for fallback confirm after redirect
      try {
        // Clear previous sipago session data first to avoid stale values
        sessionStorage.removeItem('sipago_order_uuid');
        sessionStorage.removeItem('sipago_attempt_id');
        sessionStorage.removeItem('sipago_reservation_id');
        sessionStorage.removeItem('sipago_discount_id');
        sessionStorage.removeItem('sipago_guest_data');

        if (data.attempt_id) {
          sessionStorage.setItem('sipago_attempt_id', String(data.attempt_id));
          sessionStorage.setItem('sipago_reservation_id', String(currentReservation.id));
          // Only set discount_id if there's actually a discount applied to THIS purchase
          if (appliedDiscount?.id) {
            sessionStorage.setItem('sipago_discount_id', String(appliedDiscount.id));
          }
        }
        // Save customer data for confirm after redirect (guest or logged-in user)
        if (customerData) {
          sessionStorage.setItem('sipago_guest_data', JSON.stringify(customerData));
        } else if (user) {
          sessionStorage.setItem('sipago_guest_data', JSON.stringify({
            name: user.name || '',
            dni: user.dni || '',
            phone: user.phone || '',
            email: user.email || '',
            provincia: user.provincia || '',
            localidad: user.localidad || ''
          }));
        }
        // Save service_items for confirm fallback
        if (cartServiceItems.length > 0) {
          sessionStorage.setItem('sipago_service_items', JSON.stringify(cartServiceItems));
        }
      } catch {}
      
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        alert('No se pudo obtener la URL de pago de Sipago.');
      }
    } catch (e) {
      console.error('[SIPAGO] Network error:', e);
      alert('No pudimos iniciar el pago en SiPago. No se realizó ningún cobro y tus butacas siguen reservadas mientras el contador esté activo. Podés volver a intentarlo.');
    } finally {
      setCreatingSipagoOrder(false);
    }
  };

  const emitFreeTickets = async (customerData = null) => {
    if (!reservation) return;
    let currentReservation = reservation;
    setEmittingFreeTickets(true);
    try {
      // Sync the current selection to the reservation first
      const items = buildItems(
        currentSelection.selectedSeatIds,
        currentSelection.selectedPalcosLabels,
        currentSelection.pullmanSelected,
        currentSelection.generalAdmissionCount || 0
      );

      if (items.length === 0) {
        alert('No hay items seleccionados.');
        setEmittingFreeTickets(false);
        return;
      }

      // Force sync the reservation with current items
      const syncRes = await apiFetch(`/api/reservations/${currentReservation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-socket-id': currentSelection.socketRef?.current?.id || ''
        },
        body: JSON.stringify({ items })
      });

      if (!syncRes.ok) {
        const syncError = await syncRes.json().catch(() => ({}));

        // If reservation expired, try to create a new one
        if (syncRes.status === 409 && syncError.error === 'Reservation not active') {
          console.log('[FREE_EMISSION] Reservation expired, creating new one...');

          // Clear expired reservation
          setReservation(null);
          currentReservation = null;

          // Create new reservation
          const headers = {
            'Content-Type': 'application/json',
            'x-socket-id': currentSelection.socketRef?.current?.id || ''
          };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const createRes = await apiFetch('/api/reservations', {
            method: 'POST',
            headers,
            body: JSON.stringify({ session_id: selectedSession, items, user_id: user?.id })
          });

          if (!createRes.ok) {
            const createError = await createRes.json().catch(() => ({}));
            console.error('[FREE_EMISSION] Error creating new reservation:', createError);
            alert('Tu reserva expiró y no se pudo crear una nueva. Por favor, intentá de nuevo.');
            setEmittingFreeTickets(false);
            return;
          }

          currentReservation = await createRes.json();
          setReservation(currentReservation);
          console.log('[FREE_EMISSION] New reservation created:', currentReservation.id);
        } else {
          alert('Error al sincronizar la reserva. Por favor, intentá de nuevo.');
          setEmittingFreeTickets(false);
          return;
        }
      }

      const payload = {
        reservation_id: currentReservation.id,
        discount_id: appliedDiscount?.id || null,
        service_items: cartServiceItems.length > 0 ? cartServiceItems : undefined
      };

      // Add customer data - guest checkout or logged-in user
      if (customerData) {
        payload.customer_name = customerData.name;
        payload.customer_dni = customerData.dni;
        payload.customer_phone = customerData.phone;
        payload.customer_email = customerData.email;
        payload.customer_provincia = customerData.provincia;
        payload.customer_localidad = customerData.localidad;
      } else if (user) {
        payload.customer_name = user.name || null;
        payload.customer_dni = user.dni || null;
        payload.customer_phone = user.phone || null;
        payload.customer_email = user.email || null;
        payload.customer_provincia = user.provincia || null;
        payload.customer_localidad = user.localidad || null;
      }

      const r = await apiFetch('/api/payments/free-emission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}));
        console.error('[FREE_EMISSION] Error:', errorData);
        alert(errorData.message || 'Error al emitir las entradas. Por favor, intentá de nuevo.');
        setEmittingFreeTickets(false);
        return;
      }
      
      const data = await r.json();
      // Small delay so user sees the "Enviando entradas" screen
      await new Promise(resolve => setTimeout(resolve, 1500));
      // Redirect to success page
      const successUrl = `/sipago/success?reservation_id=${currentReservation.id}`;
      window.location.href = successUrl;
    } catch (e) {
      console.error('[FREE_EMISSION] Network error:', e);
      alert('Error de red al emitir las entradas. Por favor, intentá de nuevo.');
      setEmittingFreeTickets(false);
    }
  };

  // Track current selection state
  const [currentSelection, setCurrentSelection] = useState({
    selectedSeatIds: new Set(),
    selectedPalcosLabels: new Set(),
    pullmanSelected: 0,
    socketRef: null
  });
  
  // Track price tiers for seat pricing rules
  const [priceTiers, setPriceTiers] = useState([]);

  // Store full selection object in a ref for stable access
  const clearSelectionRef = useRef(null);

  // Handle selection changes from SeatSelection component
  const handleSeatSelectionChange = useCallback((selection) => {
    // Update ref with full selection object (includes clearSelection and socketRef)
    clearSelectionRef.current = selection;
    // Update selection state - no restoration, clean slate on page refresh
    setCurrentSelection(selection);
    // Update price tiers if available
    if (selection.priceTiers) {
      setPriceTiers(selection.priceTiers);
    }
    
    // Check if applied discount still meets seat constraints
    if (appliedDiscount && (appliedDiscount.min_seats || appliedDiscount.max_seats || appliedDiscount.require_even || appliedDiscount.platea_baja_only)) {
      const items = [];
      
      for (const seatId of selection.selectedSeatIds) {
        items.push({ type: 'butaca', seat_code: seatId });
      }
      for (const label of selection.selectedPalcosLabels) {
        const isPB = /^PB/i.test(label);
        items.push({ type: 'palco', seat_code: label, quantity: isPB ? 4 : 2 });
      }
      if (selection.pullmanSelected > 0) {
        items.push({ type: selection.pricing?.general > 0 ? 'general' : 'pullman', quantity: selection.pullmanSelected });
      }
      if (selection.generalAdmissionCount > 0) {
        items.push({ type: 'general', quantity: selection.generalAdmissionCount });
      }
      
      const seatCount = items.reduce((sum, item) => {
        if (item.type === 'butaca') return sum + 1;
        if (item.type === 'palco' && item.quantity) return sum + item.quantity;
        if ((item.type === 'pullman' || item.type === 'general') && item.quantity) return sum + item.quantity;
        return sum + 1;
      }, 0);
      
      if (appliedDiscount.min_seats && seatCount < appliedDiscount.min_seats) {
        setDiscountError(`Debes seleccionar ${appliedDiscount.min_seats} localidades como mínimo`);
        setAppliedDiscount(null);
      } else if (appliedDiscount.max_seats && seatCount > appliedDiscount.max_seats) {
        setDiscountError(`No podés seleccionar más de ${appliedDiscount.max_seats} localidades con este cupón`);
        setAppliedDiscount(null);
      } else if (appliedDiscount.require_even && seatCount % 2 !== 0) {
        setDiscountError('Este cupón requiere seleccionar un número par de localidades');
        setAppliedDiscount(null);
      } else if (appliedDiscount.platea_baja_only) {
        const rowError = validatePlateaBajaRows(items, appliedDiscount.row_start, appliedDiscount.row_end);
        if (rowError) {
          setDiscountError(rowError);
          setAppliedDiscount(null);
        }
      }
    }
  }, [appliedDiscount]);

  // Auto-reserve when selection changes - with debounce
  useEffect(() => {
    if (!selectedSession) return;
    
    const items = buildItems(
      currentSelection.selectedSeatIds,
      currentSelection.selectedPalcosLabels,
      currentSelection.pullmanSelected,
      currentSelection.generalAdmissionCount || 0
    );
    
    // Handle empty selection immediately
    if (items.length === 0) {
      handleEmptySelection(currentSelection.socketRef);
      return;
    }
    
    // Debounce sync: wait 400ms after last selection change
    const timer = setTimeout(() => {
      syncReservation(items, currentSelection.socketRef);
    }, 400);
    
    return () => clearTimeout(timer);
  }, [currentSelection, selectedSession, syncReservation, handleEmptySelection]);

  const scrollToSelection = () => {
    selectionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

// ...

  const heroImageUrl = show ? getShowImageUrl(show, isMobileHero ? 'principal_mobile' : 'principal_web') : null;
  const thumbnailUrl = show ? getShowImageUrl(show, 'secundaria_web') : null;
  const synopsis = show?.description?.trim() || 'Próximamente compartiremos más información sobre este espectáculo.';
  const heroDescription = synopsis.length > 320 ? `${synopsis.slice(0, 320)}…` : synopsis;
  const fullSynopsisParagraphs = synopsis.split('\n').filter((p) => p.trim().length > 0);
  
  // Calculate session date label
  const selectedSessionObj = sessions.find(s => s.id === selectedSession) || sessions[0];
  const sessionDateLabel = selectedSessionObj?.starts_at
    ? formatDateLong(selectedSessionObj.starts_at)
    : 'Fecha a confirmar';
  const sessionTimeLabel = selectedSessionObj?.starts_at
    ? formatTime(selectedSessionObj.starts_at)
    : '';
  const sessionFunctionName = selectedSessionObj?.function_name || '';

  // Calculate prices and total
  const calculatePrices = () => {
    const pricing = currentSelection.pricing || defaultPricing;

// ...
    const items = [];
    let subtotal = 0;

    // Seats - use priceTiers rules if available, otherwise fall back to base pricing
    Array.from(currentSelection.selectedSeatIds).forEach(sid => {
      // Check if there's a specific price tier for this seat
      const tierInfo = priceTiers && priceTiers.length > 0 ? getSeatPriceTier(sid, priceTiers) : null;
      const price = tierInfo?.price ? Number(tierInfo.price) : Number(pricing.platea_general || 0);
      items.push({
        type: 'butaca',
        label: formatSeatLocation(sid, 'butaca'),
        price,
        quantity: 1
      });
      subtotal += price;
    });

    // Palcos - use priceTiers rules if available, otherwise fall back to base pricing
    Array.from(currentSelection.selectedPalcosLabels).forEach(label => {
      const isPB = /^PB/i.test(label);
      // Check if there's a specific price tier for this palco
      const tierInfo = priceTiers && priceTiers.length > 0 ? getSeatPriceTier(label, priceTiers) : null;
      const price = tierInfo?.price ? Number(tierInfo.price) : (isPB ? Number(pricing.palcos_bajos || 0) : Number(pricing.palcos_altos || 0));
      const seats = isPB ? 4 : 2;
      items.push({
        type: 'palco',
        label: formatSeatLocation(label, 'palco'),
        price,
        quantity: 1,
        seats
      });
      subtotal += price;
    });

    // Pullman (sala_principal) or General Admission (el_tablado, las_gemelas)
    if (show?.venue_type === 'sala_principal' && currentSelection.pullmanSelected > 0) {
      const price = Number(pricing.pullman || 0);
      items.push({
        type: 'pullman',
        label: 'Pullman',
        price,
        quantity: currentSelection.pullmanSelected
      });
      subtotal += price * currentSelection.pullmanSelected;
    } else if ((show?.venue_type === 'el_tablado' || show?.venue_type === 'las_gemelas') && 
               (currentSelection.generalAdmissionCount > 0 || currentSelection.pullmanSelected > 0)) {
      const qty = currentSelection.generalAdmissionCount > 0 ? currentSelection.generalAdmissionCount : currentSelection.pullmanSelected;
      const price = Number(pricing.general || pricing.pullman || 0);
      items.push({
        type: 'general',
        label: 'Entrada General',
        price,
        quantity: qty
      });
      subtotal += price * qty;
    } else if (currentSelection.pullmanSelected > 0) {
      // Fallback for pullman if venue_type is not set
      const price = Number(pricing.pullman || 0);
      items.push({
        type: 'pullman',
        label: 'Pullman',
        price,
        quantity: currentSelection.pullmanSelected
      });
      subtotal += price * currentSelection.pullmanSelected;
    }

    // Apply discount FIRST (before service charge)
    let discountAmount = 0;
    let subtotalAfterDiscount = subtotal;
    
    if (appliedDiscount) {
      const remainingUses = appliedDiscount.remaining_uses;
      const discountType = appliedDiscount.type;
      // 'internal' type = cortesía = 100% discount
      const effectivePercent = discountType === 'internal' ? 100 : Number(appliedDiscount.value || 0);
      
      if ((discountType === 'percentage' || discountType === 'internal') && remainingUses != null) {
        // Expand items into individual tickets to limit discount to N tickets
        const individualTickets = [];
        for (const item of items) {
          if (item.type === 'palco') {
            const palcoSeats = item.seats || 4;
            const perSeatPrice = item.price / palcoSeats;
            for (let i = 0; i < palcoSeats; i++) {
              individualTickets.push(perSeatPrice);
            }
          } else {
            const qty = item.quantity || 1;
            for (let i = 0; i < qty; i++) {
              individualTickets.push(item.price);
            }
          }
        }
        const totalTicketCount = individualTickets.length;
        const discountableCount = Math.min(totalTicketCount, remainingUses);
        
        // Sort by price descending so the most expensive tickets get discounted first
        const sorted = [...individualTickets].sort((a, b) => b - a);
        const discountableSubtotal = sorted.slice(0, discountableCount).reduce((sum, p) => sum + p, 0);
        discountAmount = Math.round(discountableSubtotal * (effectivePercent / 100));
      } else if (discountType === 'percentage' || discountType === 'internal') {
        discountAmount = Math.round(subtotal * (effectivePercent / 100));
      } else if (discountType === 'fixed') {
        discountAmount = Math.round(appliedDiscount.value);
      }
      // Ensure discount doesn't exceed subtotal
      discountAmount = Math.min(discountAmount, subtotal);
      subtotalAfterDiscount = subtotal - discountAmount;
    }
    
    // Services (not subject to ticket discount, but ARE part of the total before service charge)
    const serviceItems = [];
    let servicesSubtotal = 0;
    for (const svc of showServices) {
      const qty = Number(selectedServices[svc.id] || 0);
      if (qty > 0) {
        serviceItems.push({ service_id: svc.id, name: svc.name, price: Number(svc.price), quantity: qty });
        servicesSubtotal += Number(svc.price) * qty;
      }
    }

    // Service charge applied AFTER discount (dynamic percentage from settings), on tickets + services
    const serviceCharge = Math.round((subtotalAfterDiscount + servicesSubtotal) * (serviceFeePercent / 100));
    const total = subtotalAfterDiscount + serviceCharge + servicesSubtotal;

    return { items, subtotal, serviceCharge, discountAmount, total, serviceFeePercent, serviceItems, servicesSubtotal };
  };

  const { items: cartItems, subtotal: cartSubtotal, serviceCharge: cartServiceCharge, discountAmount: cartDiscountAmount, total: cartTotal, serviceItems: cartServiceItems, servicesSubtotal: cartServicesSubtotal } = calculatePrices();

  // Sidebar content for spectator mode
  const spectatorSidebar = (
    <div style={{ minWidth: 260 }}>
      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 16 }}> Carrito</div>
      {show && selectedSession && (
        <div style={{ marginBottom: 10, padding: '8px 10px', background: '#f0f9ff', borderRadius: 6, borderLeft: '3px solid #3b82f6' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{show.title}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {sessionFunctionName && <>{sessionFunctionName} · </>}{sessionDateLabel} - {sessionTimeLabel} hs
          </div>
        </div>
      )}
      {reservation && (
        <div style={{ marginBottom: 12, fontSize: 13, padding: 8, background: '#fff3cd', borderRadius: 4 }}>
          Tiempo restante: <strong>{fmt(timeLeft)}</strong>
        </div>
      )}
      
      {cartItems.length === 0 ? (
        <p style={{ color: '#666', fontSize: 14, fontStyle: 'italic' }}>
          Seleccioná tus butacas
        </p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {cartItems.map((item, idx) => (
              <li key={idx} style={{ 
                padding: '8px 0', 
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 14
              }}>
                <span>
                  {item.label} {item.type === 'pullman' ? `x${item.quantity}` : (item.quantity > 1 && `x${item.quantity}`)}
                </span>
                <span style={{ fontWeight: 600 }}>
                  ${(item.price * item.quantity).toLocaleString('es-AR')}
                </span>
              </li>
            ))}
          </ul>
          
          {/* Subtotal tickets */}
          <div style={{ 
            marginTop: 12,
            paddingTop: 8,
            borderTop: '1px solid #ddd',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14
          }}>
            <span>Subtotal entradas:</span>
            <span>${cartSubtotal.toLocaleString('es-AR')}</span>
          </div>

          {/* Services selection */}
          {showServices.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #ddd' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                Sumá servicios adicionales
              </div>
              {(() => {
                // Total de localidades: butacas×1, PB×4, PA×2, pullman/general×qty
                let totalLocalidades = currentSelection.selectedSeatIds?.size || 0;
                Array.from(currentSelection.selectedPalcosLabels || []).forEach(label => {
                  totalLocalidades += /^PB/i.test(label) ? 4 : 2;
                });
                const generalQty = currentSelection.generalAdmissionCount > 0
                  ? currentSelection.generalAdmissionCount
                  : (currentSelection.pullmanSelected || 0);
                totalLocalidades += generalQty;
                return showServices.map(svc => {
                  const qty = Math.min(Number(selectedServices[svc.id] || 0), totalLocalidades);
                  return (
                    <div key={svc.id} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{svc.name}</span>
                          {svc.description && <span style={{ fontSize: 11, color: '#6b7280', display: 'block' }}>{svc.description}</span>}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 8 }}>${Number(svc.price).toLocaleString('es-AR')}/u</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <select
                          value={qty}
                          onChange={e => setSelectedServices(prev => ({ ...prev, [svc.id]: Number(e.target.value) }))}
                          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer' }}
                          disabled={totalLocalidades === 0}
                        >
                          {Array.from({ length: totalLocalidades + 1 }, (_, i) => (
                            <option key={i} value={i}>{i === 0 ? 'Sin agregar' : `${i} persona${i > 1 ? 's' : ''}`}</option>
                          ))}
                        </select>
                        {qty > 0 && (
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
                            ${(Number(svc.price) * qty).toLocaleString('es-AR')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
              {cartServicesSubtotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb', color: '#374151' }}>
                  <span>Subtotal servicios:</span>
                  <span>${cartServicesSubtotal.toLocaleString('es-AR')}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Discount section */}
          {!appliedDiscount ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#666' }}>
                ¿Tenés un cupón de descuento?
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                  placeholder="CÓDIGO"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    fontSize: 13,
                    textTransform: 'uppercase'
                  }}
                />
                <button
                  onClick={handleApplyDiscount}
                  disabled={!discountCode.trim() || validatingDiscount}
                  style={{
                    padding: '6px 12px',
                    background: discountCode.trim() ? '#28a745' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 13,
                    cursor: discountCode.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: 600
                  }}
                >
                  {validatingDiscount ? '...' : 'Aplicar'}
                </button>
              </div>
              {discountError && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#dc3545' }}>
                  {discountError}
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #eee'
            }}>
              <div style={{ 
                padding: 8,
                background: '#d1fae5',
                border: '1px solid #a7f3d0',
                borderRadius: 4
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                       {appliedDiscount?.alias || discountCode}
                    </div>
                    <div style={{ fontSize: 11, color: '#059669' }}>
                      Cupón aplicado
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveDiscount}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#059669',
                      cursor: 'pointer',
                      fontSize: 18,
                      padding: 4
                    }}
                    title="Quitar cupón"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Discount amount */}
          {cartDiscountAmount > 0 && (
            <div style={{ 
              marginTop: 6,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 14,
              color: '#059669',
              fontWeight: 600
            }}>
              <span>Descuento:</span>
              <span>-${cartDiscountAmount.toLocaleString('es-AR')}</span>
            </div>
          )}
          
          {/* Service charge */}
          <div style={{ 
            marginTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            color: '#666'
          }}>
            <span>Cargo por servicio:</span>
            <span>${cartServiceCharge.toLocaleString('es-AR')}</span>
          </div>
          
          {/* Total */}
          <div style={{ 
            marginTop: 12,
            paddingTop: 12,
            borderTop: '2px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 16,
            fontWeight: 700
          }}>
            <span>TOTAL:</span>
            <span>${cartTotal.toLocaleString('es-AR')}</span>
          </div>
        </>
      )}
      
      {reservation && (
        <div style={{ display:'flex', flexDirection: 'column', gap:8, marginTop:16 }}>
          {cartTotal > 0 ? (
            <>
              <div style={{ color: '#6B7280', fontSize: 12, textAlign: 'center' }}>Tené tu tarjeta a mano, tendrás 10 minutos para completar el pago</div>
              <button
                onClick={handlePaymentClick}
                disabled={creatingSipagoOrder}
                style={{
                  background: creatingSipagoOrder ? '#9ca3af' : '#000000',
                  color:'#fff',
                  border:'none',
                  padding:'12px 16px',
                  borderRadius:6,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: creatingSipagoOrder ? 'not-allowed' : 'pointer'
                }}
              >
                {creatingSipagoOrder ? 'Generando pago seguro...' : `Pagar $${cartTotal.toLocaleString('es-AR')}`}
              </button>
            </>
          ) : (
            <>
              <button 
                disabled
                style={{ 
                  background:'#9ca3af', 
                  color:'#fff', 
                  border:'none', 
                  padding:'12px 16px', 
                  borderRadius:6,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'not-allowed',
                  opacity: 0.6
                }}
              >
                Pagar $0
              </button>
              <button 
                onClick={handleFreeEmissionClick} 
                style={{ 
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  color:'#fff', 
                  border:'none', 
                  padding:'12px 16px', 
                  borderRadius:6,
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)'
                }}
              >
                Emitir entradas
              </button>
            </>
          )}
          <button 
            onClick={cancelReservation}
            style={{
              background: '#fff',
              color: '#666',
              border: '1px solid #ddd',
              padding: '8px 12px',
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            ✕ Cancelar reserva
          </button>
        </div>
      )}
    </div>
  );

  // Loading spinner component
  if (initialLoading) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            border: '4px solid #e5e7eb',
            borderTop: '4px solid #f97316',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}
        />
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
        <p style={{ color: '#64748b', fontSize: 16 }}>Cargando selección de entradas...</p>
      </div>
    );
  }

  if (emittingFreeTickets) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, color: '#fff'
      }}>
        <div style={{
          width: 60, height: 60, border: '4px solid rgba(255,255,255,0.3)',
          borderTopColor: '#fff', borderRadius: '50%',
          animation: 'spin 1s linear infinite', marginBottom: 24
        }} />
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Enviando entradas...</div>
        <div style={{ fontSize: 15, opacity: 0.85 }}>Estamos generando tus entradas de cortesía</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        padding: !isWideLayout ? '0 0 24px' : '0 5px 24px',
        boxSizing: 'border-box',
        margin: 0,
        overflowX: 'hidden'
      }}
    >
      
      {/* Session selector (only if multiple sessions) */}
      {!showPackCheckout && sessions.length > 1 && (
        <div style={{ marginBottom: 24, paddingTop: 80, textAlign: 'center' }}>
          <h3 style={{ 
            fontSize: 18, 
            fontWeight: 600, 
            marginBottom: 16,
            color: '#1e293b'
          }}>
            Seleccionar función
          </h3>
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 12, 
            justifyContent: 'center' 
          }}>
            {sessions.map(session => {
              const dateStr = formatDateShort(session.starts_at);
              const timeStr = formatTime(session.starts_at);
              const isSelected = selectedSession === session.id;
              
              return (
                <button
                  key={session.id}
                  onClick={() => { setSelectedSession(session.id); setTimeout(() => selectionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 8,
                    border: isSelected ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                    background: isSelected ? '#3b82f6' : '#fff',
                    color: isSelected ? '#fff' : '#334155',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    minWidth: 160
                  }}
                >
                  {session.function_name && <div style={{ marginBottom: 2 }}>{session.function_name}</div>}
                  <div style={{ textTransform: 'capitalize' }}>{dateStr}</div>
                  <div style={{ fontSize: 14, opacity: 0.9 }}>{timeStr} hs</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pack multi-function promo removed — shown directly via PackCheckout */}
      {show?.pack_enabled && sessions.length >= 2 && !showPackCheckout && (
        <div style={{
          marginBottom: 24,
          padding: 20,
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          borderRadius: 12,
          border: '2px solid #86efac',
          textAlign: 'center'
        }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#166534' }}>Pack Multi-Función</h3>
          <p style={{ margin: '0 0 4px 0', color: '#166534', fontSize: 15, fontWeight: 600 }}>
            Comprando para más de una función tus entradas tienen descuento.
          </p>
          <p style={{ margin: '0 0 16px 0', color: '#166534', fontSize: 14 }}>
            Verás el descuento aplicado en el detalle de tu carrito de compra.
          </p>
          <button
            onClick={() => setShowPackCheckout(true)}
            style={{
              padding: '12px 24px',
              background: '#000000',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Ver opciones de pack
          </button>
        </div>
      )}

      {/* Check if show is finished */}
      {show?.show_status === 'finalizado' ? (
        <section style={{
          padding: 40,
          background: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16
          }}>🎭</div>
          <h3 style={{
            fontSize: 20,
            fontWeight: 600,
            color: '#334155',
            marginBottom: 8
          }}>
            Este espectáculo ha finalizado
          </h3>
          <p style={{
            color: '#64748b',
            fontSize: 15,
            marginBottom: 24
          }}>
            La venta de entradas para este show ya no está disponible.
          </p>
          <button
            onClick={() => window.location.href = '/agenda'}
            style={{
              padding: '12px 24px',
              background: '#000000',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Ver shows disponibles
          </button>
        </section>
      ) : (
      <section
        ref={selectionSectionRef}
        style={{
        padding: isWideLayout ? 24 : '24px 0',
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)'
      }}>
        {showPackCheckout ? (
          <PackCheckout
            show={show}
            sessions={sessions}
            user={user}
            token={token}
            isGuest={isGuest}
            guestData={guestData}
            onGuestCheckoutNeeded={(data) => {
              if (data) {
                setGuestData(data);
                setIsGuest(true);
              } else {
                setShowGuestModal(true);
              }
            }}
            serviceFeePercent={serviceFeePercent}
            showServices={showServices}
            onClose={() => setShowPackCheckout(false)}
          />
        ) : (
        <>
        {selectedSession && show && (
          <div style={{
            padding: isWideLayout ? '0 0 16px 0' : '0 24px 16px 24px',
            borderBottom: '1px solid #e5e7eb',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
              {show.title}
            </h3>
            <span style={{ fontSize: 14, color: '#64748b' }}>
              {sessionFunctionName && <>{sessionFunctionName} · </>}{sessionDateLabel} - {sessionTimeLabel} hs
            </span>
          </div>
        )}
        {selectedSession && show?.venue_type === 'sala_principal' && (
          <div
            style={
              isWideLayout
                ? { marginBottom: 16 }
                : { padding: '0 24px', marginBottom: 16 }
            }
          >
            <BoxOfficeReferences
              isWideLayout={isWideLayout}
              pricing={currentSelection.pricing || defaultPricing}
              formatCurrency={formatCurrency}
              priceTiers={priceTiers}
            />
          </div>
        )}

        {!isWideLayout && selectedSession && show?.venue_type === 'sala_principal' && (
          <div style={{ textAlign: 'center', padding: '8px 24px 0', marginBottom: 4 }}>
            <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
              Elegí tus ubicaciones en el mapa
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Más abajo está tu carrito de compras
            </p>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: isWideLayout ? 'row' : 'column',
            alignItems: isWideLayout ? 'flex-start' : 'stretch',
            gap: 24,
            width: '100%'
          }}
        >
          <div
            style={{
              flex: isWideLayout ? '1 1 0%' : '1 1 auto',
              minWidth: 0,
              width: '100%',
              margin: 0
            }}
          >
            {show && show.venue_type === 'sala_principal' ? (
              <SeatSelection
                showId={id}
                sessionId={selectedSession}
                userId={user?.id}
                mode="spectator"
                onSelectionChange={handleSeatSelectionChange}
                sidebarContent={null}
              />
            ) : show && (show.venue_type === 'el_tablado' || show.venue_type === 'las_gemelas') ? (
              selectedSession ? (
                <GeneralAdmissionSelection
                  showId={id}
                  sessionId={selectedSession}
                  userId={user?.id}
                  mode="spectator"
                  onSelectionChange={handleSeatSelectionChange}
                  sidebarContent={spectatorSidebar}
                  maxCapacity={show.general_capacity}
                  ticketPrice={show.pricing_json?.general || 0}
                />
              ) : (
                <div style={{ padding: 24, textAlign: 'center' }}>
                  <p>Seleccioná una función para continuar</p>
                </div>
              )
            ) : (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <p>Cargando información del espectáculo...</p>
              </div>
            )}
          </div>

          {/* Only show sidebar for sala_principal (GeneralAdmissionSelection includes its own) */}
          {/* Desktop: show sidebar inline. Mobile: handled by CartPeek + CartDrawer */}
          {show && show.venue_type === 'sala_principal' && isWideLayout && (
            <div
              style={{
                flex: '0 0 260px',
                maxWidth: 280,
                width: 260,
                alignSelf: 'stretch',
                display: 'flex',
                flexDirection: 'column',
                padding: 0
              }}
            >
              {spectatorSidebar}
            </div>
          )}
        </div>
        </>
      )}
      </section>
      )}

      {/* Guest Checkout Modal */}
      {showGuestModal && (
        <GuestCheckoutModal
          onClose={() => setShowGuestModal(false)}
          onContinueAsGuest={() => setIsGuest(true)}
          showId={id}
        />
      )}

      {/* Guest Checkout Form */}
      {showGuestForm && (
        <GuestCheckoutForm
          onSubmit={handleGuestFormSubmit}
          onCancel={() => setShowGuestForm(false)}
          loading={false}
          submitLabel={calculatePrices().total === 0 && appliedDiscount ? 'Emitir entradas' : 'Continuar al pago'}
        />
      )}

      {/* Mobile Cart Peek - Fixed bottom bar (for all venue types on mobile) */}
      {!isWideLayout && show && cartItems.length > 0 && (
        <>
          {/* Backdrop with blur when drawer is open */}
          {isMobileCartOpen && (
            <div
              onClick={() => setIsMobileCartOpen(false)}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(4px)',
                zIndex: 998,
                transition: 'opacity 0.3s ease'
              }}
            />
          )}

          {/* Cart Drawer - Slides up from bottom */}
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              background: '#fff',
              borderRadius: '16px 16px 0 0',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
              zIndex: 999,
              transform: isMobileCartOpen ? 'translateY(0)' : 'translateY(calc(100% - 95px))',
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              height: isMobileCartOpen ? '85vh' : '95px',
              maxHeight: isMobileCartOpen ? '85vh' : '95px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Peek handle - visible when closed */}
            <div
              onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}
              style={{
                padding: '12px 16px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                borderBottom: isMobileCartOpen ? '1px solid #e5e7eb' : 'none'
              }}
            >
              {/* Drag handle bar */}
              <div style={{
                width: 40,
                height: 4,
                background: '#d1d5db',
                borderRadius: 2,
                marginBottom: 8
              }} />
              
              {/* Button when closed - Ir a pagar */}
              {!isMobileCartOpen && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  padding: '4px 0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>🛒</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>
                      ${cartTotal.toLocaleString('es-AR')}
                    </span>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>
                      ({cartItems.length} {cartItems.length === 1 ? 'item' : 'items'})
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMobileCartOpen(true);
                    }}
                    style={{
                      background: '#000000',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Ir a pagar →
                  </button>
                </div>
              )}
              
              {/* Header when open - Modificar selección button */}
              {isMobileCartOpen && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%'
                }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>🛒 Tu selección</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMobileCartOpen(false);
                    }}
                    style={{
                      background: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      padding: '8px 16px',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Modificar selección
                  </button>
                </div>
              )}
            </div>

            {/* Cart content - scrollable when open */}
            {isMobileCartOpen && (
              <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '0 16px 16px'
              }}>
                {/* Show info */}
                {show && selectedSession && (
                  <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f0f9ff', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{show.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {sessionFunctionName && <>{sessionFunctionName} · </>}{sessionDateLabel} - {sessionTimeLabel} hs
                    </div>
                  </div>
                )}

                {/* Reservation timer */}
                {reservation && (
                  <div style={{ marginBottom: 12, fontSize: 13, padding: 10, background: '#fff3cd', borderRadius: 6 }}>
                    Tiempo restante: <strong>{fmt(timeLeft)}</strong>
                  </div>
                )}

                {/* Cart items */}
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
                  {cartItems.map((item, idx) => (
                    <li key={idx} style={{ 
                      padding: '10px 0', 
                      borderBottom: '1px solid #eee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 14
                    }}>
                      <span>
                        {item.label} {item.type === 'pullman' ? `x${item.quantity}` : (item.quantity > 1 && `x${item.quantity}`)}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        ${(item.price * item.quantity).toLocaleString('es-AR')}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Subtotal tickets */}
                <div style={{ 
                  paddingTop: 8,
                  borderTop: '1px solid #ddd',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 14
                }}>
                  <span>Subtotal entradas:</span>
                  <span>${cartSubtotal.toLocaleString('es-AR')}</span>
                </div>

                {/* Services selection */}
                {showServices.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #ddd' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                      Sumá servicios adicionales
                    </div>
                    {(() => {
                      let totalLocalidades = currentSelection.selectedSeatIds?.size || 0;
                      Array.from(currentSelection.selectedPalcosLabels || []).forEach(label => {
                        totalLocalidades += /^PB/i.test(label) ? 4 : 2;
                      });
                      const generalQty = currentSelection.generalAdmissionCount > 0
                        ? currentSelection.generalAdmissionCount
                        : (currentSelection.pullmanSelected || 0);
                      totalLocalidades += generalQty;
                      return showServices.map(svc => {
                        const qty = Math.min(Number(selectedServices[svc.id] || 0), totalLocalidades);
                        return (
                          <div key={svc.id} style={{ marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                              <div>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{svc.name}</span>
                                {svc.description && <span style={{ fontSize: 11, color: '#6b7280', display: 'block' }}>{svc.description}</span>}
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 8 }}>${Number(svc.price).toLocaleString('es-AR')}/u</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <select
                                value={qty}
                                onChange={e => setSelectedServices(prev => ({ ...prev, [svc.id]: Number(e.target.value) }))}
                                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer' }}
                                disabled={totalLocalidades === 0}
                              >
                                {Array.from({ length: totalLocalidades + 1 }, (_, i) => (
                                  <option key={i} value={i}>{i === 0 ? 'Sin agregar' : `${i} persona${i > 1 ? 's' : ''}`}</option>
                                ))}
                              </select>
                              {qty > 0 && (
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
                                  ${(Number(svc.price) * qty).toLocaleString('es-AR')}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                    {cartServicesSubtotal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb', color: '#374151' }}>
                        <span>Subtotal servicios:</span>
                        <span>${cartServicesSubtotal.toLocaleString('es-AR')}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Discount section */}
                {!appliedDiscount ? (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4, color: '#666' }}>
                      ¿Tenés un cupón de descuento?
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="text"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                        placeholder="CÓDIGO"
                        style={{
                          flex: 1,
                          padding: '6px 8px',
                          border: '1px solid #ccc',
                          borderRadius: 4,
                          fontSize: 13,
                          textTransform: 'uppercase'
                        }}
                      />
                      <button
                        onClick={handleApplyDiscount}
                        disabled={!discountCode.trim() || validatingDiscount}
                        style={{
                          padding: '6px 12px',
                          background: discountCode.trim() ? '#28a745' : '#ccc',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          fontSize: 13,
                          cursor: discountCode.trim() ? 'pointer' : 'not-allowed',
                          fontWeight: 600
                        }}
                      >
                        {validatingDiscount ? '...' : 'Aplicar'}
                      </button>
                    </div>
                    {discountError && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#dc3545' }}>
                        {discountError}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
                    <div style={{ padding: 8, background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>
                            {appliedDiscount?.alias || discountCode}
                          </div>
                          <div style={{ fontSize: 11, color: '#059669' }}>Cupón aplicado</div>
                        </div>
                        <button
                          onClick={handleRemoveDiscount}
                          style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', fontSize: 18, padding: 4 }}
                          title="Quitar cupón"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Discount amount */}
                {cartDiscountAmount > 0 && (
                  <div style={{ 
                    marginTop: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 14,
                    color: '#059669',
                    fontWeight: 600
                  }}>
                    <span>Descuento:</span>
                    <span>-${cartDiscountAmount.toLocaleString('es-AR')}</span>
                  </div>
                )}

                {/* Service charge */}
                <div style={{ 
                  marginTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 14,
                  color: '#666'
                }}>
                  <span>Cargo por servicio:</span>
                  <span>${cartServiceCharge.toLocaleString('es-AR')}</span>
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
                  <span>TOTAL:</span>
                  <span>${cartTotal.toLocaleString('es-AR')}</span>
                </div>

                {/* Action buttons */}
                {reservation && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    {cartTotal > 0 ? (
                      <>
                        <div style={{ color: '#6B7280', fontSize: 12, textAlign: 'center' }}>Tené tu tarjeta a mano, tendrás 10 minutos para completar el pago</div>
                        <button
                          onClick={() => {
                            setIsMobileCartOpen(false);
                            handlePaymentClick();
                          }}
                          disabled={creatingSipagoOrder}
                          style={{
                            background: creatingSipagoOrder ? '#9ca3af' : '#000000',
                            color: '#fff',
                            border: 'none',
                            padding: '14px 16px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 16,
                            cursor: creatingSipagoOrder ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {creatingSipagoOrder ? 'Generando pago seguro...' : `Ir a pagar $${cartTotal.toLocaleString('es-AR')}`}
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          disabled
                          style={{ 
                            background: '#9ca3af',
                            color: '#fff',
                            border: 'none',
                            padding: '14px 16px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 16,
                            cursor: 'not-allowed',
                            opacity: 0.6
                          }}
                        >
                          Pagar $0
                        </button>
                        <button 
                          onClick={() => {
                            setIsMobileCartOpen(false);
                            handleFreeEmissionClick();
                          }} 
                          style={{ 
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            color: '#fff',
                            border: 'none',
                            padding: '14px 16px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 16,
                            cursor: 'pointer'
                          }}
                        >
                          Emitir entradas
                        </button>
                      </>
                    )}
                    
                    <button 
                      onClick={cancelReservation}
                      style={{
                        background: '#fff',
                        color: '#dc3545',
                        border: '1px solid #dc3545',
                        padding: '10px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        cursor: 'pointer'
                      }}
                    >
                      ✕ Cancelar reserva
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Spacer for fixed peek when drawer is closed */}
          {!isMobileCartOpen && <div style={{ height: 95 }} />}
        </>
      )}
    </div>
  );
}
