import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiAuthFetch } from '../lib/api';
import SeatSelection from '../components/SeatSelection';
import GeneralAdmissionSelection from '../components/GeneralAdmissionSelection';
import BoxOfficeSessionPicker from '../components/BoxOfficeSessionPicker';
import BoxOfficeReferences from '../components/BoxOfficeReferences';
import TicketViewModal from '../components/admin/TicketViewModal.jsx';
import { formatSeatLocation } from '../lib/seatFormatter';
import { getSeatPriceTier } from '../lib/seatPriceColors.js';
import { formatDate, formatTime, formatDateTimeCompact } from '../lib/dateFormatter.js';
import { 
  getAllRows, 
  getRowSeats, 
  getPBIzquierdaSeats, 
  getPBCentroSeats, 
  getPBDerechaSeats,
  getPalcosBajos,
  getPalcosAltos,
  filterAvailableSeats,
  filterAvailablePalcos,
  filterBlockedSeats,
  filterBlockedPalcos
} from '../lib/seatBlockUtils';
import billete20000 from '../../media/images/billetes/billete20000.png';
import billete10000 from '../../media/images/billetes/billete10000.png';
import billete2000 from '../../media/images/billetes/billete2000.png';
import billete1000 from '../../media/images/billetes/billete1000.png';
import billete500 from '../../media/images/billetes/billete500.png';

export default function BoxOffice() {
  const { token, user, hasRole } = useAuth();
  const DENOMINATIONS = [
    { key: 'bill20000', label: '$20.000', value: 20000, img: billete20000 },
    { key: 'bill10000', label: '$10.000', value: 10000, img: billete10000 },
    { key: 'bill2000', label: '$2.000', value: 2000, img: billete2000 },
    { key: 'bill1000', label: '$1.000', value: 1000, img: billete1000 },
    { key: 'bill500', label: '$500', value: 500, img: billete500 }
  ];
  // No default pricing - all prices must come from session
  const defaultPricing = {
    platea_general: 0,
    palcos_bajos: 0,
    palcos_altos: 0,
    pullman: 0
  };
  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState(null);
  const [selectedShowData, setSelectedShowData] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isWideLayout, setIsWideLayout] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1200;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsWideLayout(window.innerWidth >= 1200);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const selectedShowObj = shows.find((show) => show.id === selectedShow);
  const selectedShowTitle = selectedShowObj?.title || '';
  
  // Customer data
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDni, setCustomerDni] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  
  // Discount state
  const [discountCode, setDiscountCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [discountError, setDiscountError] = useState('');
  const [validatingDiscount, setValidatingDiscount] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [cashError, setCashError] = useState('');
  const [cashSuccess, setCashSuccess] = useState('');
  const [loadingShift, setLoadingShift] = useState(true);
  const [cashShift, setCashShift] = useState(null);
  const [cashHistory, setCashHistory] = useState([]);
  const [cashOperations, setCashOperations] = useState([]);
  const [expandedShifts, setExpandedShifts] = useState({});
  const [shiftOperations, setShiftOperations] = useState({});
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [ticketsModalSale, setTicketsModalSale] = useState(null);
  const [ticketsModalItems, setTicketsModalItems] = useState([]);
  const [openingForm, setOpeningForm] = useState({
    bill20000: '',
    bill10000: '',
    bill2000: '',
    bill1000: '',
    bill500: '',
    opening_note: ''
  });
  const [closingForm, setClosingForm] = useState({
    bill20000: '',
    bill10000: '',
    bill2000: '',
    bill1000: '',
    bill500: '',
    cash_adjustments_amount: '',
    cash_adjustments_note: '',
    closing_note: ''
  });
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [activeSection, setActiveSection] = useState('open');
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showQuickSaleModal, setShowQuickSaleModal] = useState(false);
  const [quickSalePhone, setQuickSalePhone] = useState('');
  
  // Customer search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Blocking mode state
  const [blockingSelection, setBlockingSelection] = useState({
    selectedSeatIds: new Set(),
    selectedPalcosLabels: new Set(),
    pullmanSelected: 0,
    clearSelection: null
  });
  const [blockingLoading, setBlockingLoading] = useState(false);
  const [blockingError, setBlockingError] = useState('');
  const [blockingSuccess, setBlockingSuccess] = useState('');
  const [blockingShow, setBlockingShow] = useState(null);
  const [blockingShowData, setBlockingShowData] = useState(null);
  const [blockingSessions, setBlockingSessions] = useState([]);
  const [blockingSession, setBlockingSession] = useState(null);
  
  // Estado para selección masiva de filas en bloqueo
  const [selectedRows, setSelectedRows] = useState(new Set());

  // Disability quota section
  const [disabilityQuota, setDisabilityQuota] = useState(null);
  const [disabilityQuotaLoading, setDisabilityQuotaLoading] = useState(false);
  const [disabilityQuotaError, setDisabilityQuotaError] = useState('');

  // Associated services
  const [showServices, setShowServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState({});

  // Track current selection
  const [currentSelection, setCurrentSelection] = useState({
    selectedSeatIds: new Set(),
    selectedPalcosLabels: new Set(),
    pullmanSelected: 0,
    clearSelection: null,
    pricing: { ...defaultPricing }
  });

  // Load shows on mount (same as Cartelera)
  useEffect(() => {
    (async () => {
      try {
        // Solo cargar shows activos (no finalizados) para boletería
        const res = await apiFetch('/api/shows?admin=true&status=active');
        if (res.ok) {
          const data = await res.json();
          setShows(data);
        }
      } catch (err) {
        console.error('[BOLETERIA] Error fetching shows:', err);
        setShows([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!token) return;
    loadCashContext();
  }, [token]);

  useEffect(() => {
    if (cashShift) {
      setClosingForm((prev) => ({
        ...prev,
        bill20000: '',
        bill10000: '',
        bill2000: '',
        bill1000: '',
        bill500: '',
        cash_adjustments_amount: '',
        cash_adjustments_note: '',
        closing_note: ''
      }));
    }
  }, [cashShift]);

  const loadCashContext = async () => {
    setLoadingShift(true);
    try {
      const [currentRes, historyRes, operationsRes] = await Promise.all([
        apiAuthFetch('/api/cash-register/current', { method: 'GET' }, token),
        apiAuthFetch('/api/cash-register/history?limit=5', { method: 'GET' }, token),
        apiAuthFetch('/api/cash-register/current/operations', { method: 'GET' }, token)
      ]);

      if (currentRes.ok) {
        const currentData = await currentRes.json();
        setCashShift(currentData.shift || null);
      } else {
        setCashShift(null);
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setCashHistory(historyData.shifts || []);
      }

      if (operationsRes.ok) {
        const operationsData = await operationsRes.json();
        setCashOperations(operationsData.operations || []);
      } else {
        setCashOperations([]);
      }
    } catch (err) {
      console.error('[BOLETERIA] Error loading cash context:', err);
      setCashError('No se pudo obtener el estado de caja.');
    } finally {
      setLoadingShift(false);
    }
  };

  const normalizeCount = (value) => {
    if (value === '' || value === null || value === undefined) return 0;
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;
    return Math.floor(numberValue);
  };

  const buildBillsPayload = (formState) => {
    return DENOMINATIONS.reduce((acc, item) => {
      acc[item.key] = normalizeCount(formState[item.key]);
      return acc;
    }, {});
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(Number(amount || 0));
  };

  const calculateBillTotal = (counts) => {
    return DENOMINATIONS.reduce((total, item) => total + normalizeCount(counts[item.key]) * item.value, 0);
  };

  const handleViewTicketsFromCash = async (operation, options = {}) => {
    const { detailsOnly = false } = options;

    try {
      // Formatear fecha y hora de la función similar a Reports
      let sessionDateStr = '';
      let sessionTimeStr = '';
      if (operation.session_date) {
        sessionDateStr = formatDate(operation.session_date);
        sessionTimeStr = formatTime(operation.session_date);
      }

      let ticketsData = { tickets: [] };

      if (!detailsOnly) {
        const res = await apiAuthFetch(`/api/tickets?sale_id=${operation.id}`, { method: 'GET' }, token);
        if (res.ok) {
          ticketsData = await res.json();
        }
      }

      setTicketsModalSale({
        id: String(operation.id),
        show_title: operation.show_title || 'Venta de entradas',
        session_date: sessionDateStr,
        session_time: sessionTimeStr,
        customer_name: operation.customer_name,
        customer_email: operation.customer_email || '',
        customer_phone: operation.customer_phone || '',
        total_amount: operation.total_amount,
        refunded: operation.refunded || false,
        refund_reason: operation.refund_reason || null,
        refunded_at: operation.refunded_at || null,
        is_refund_operation: operation.is_refund_operation || false,
        detailsOnly
      });

      setTicketsModalItems(detailsOnly ? [] : (ticketsData.tickets || []));
      setShowTicketsModal(true);
    } catch (err) {
      console.error('[BOLETERIA] Error loading tickets/details for sale:', err);
    }
  };

  const handleOpenShift = async (event) => {
    event.preventDefault();
    setCashError('');
    setCashSuccess('');
    try {
      const payload = {
        openingBills: buildBillsPayload(openingForm),
        opening_note: openingForm.opening_note?.trim() || null
      };

      const res = await apiAuthFetch('/api/cash-register/open', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, token);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo abrir la caja');
      }

      const data = await res.json();
      setCashShift(data.shift);
      setCashSuccess('Caja abierta correctamente. ¡Listo para vender!');
      setOpeningForm({
        bill20000: '',
        bill10000: '',
        bill2000: '',
        bill1000: '',
        bill500: '',
        opening_note: ''
      });
      setActiveSection('sales');
      loadCashContext();
    } catch (err) {
      console.error('[BOLETERIA] Error opening shift:', err);
      setCashError(err.message || 'No se pudo abrir la caja');
    }
  };

  const handleCloseShift = async (event) => {
    event.preventDefault();
    setCashError('');
    setCashSuccess('');
    try {
      const payload = {
        closingBills: buildBillsPayload(closingForm),
        closing_note: closingForm.closing_note?.trim() || null,
        cash_adjustments_amount: closingForm.cash_adjustments_amount ? Number(closingForm.cash_adjustments_amount) : 0,
        cash_adjustments_note: closingForm.cash_adjustments_note?.trim() || null
      };

      const res = await apiAuthFetch('/api/cash-register/close', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, token);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo cerrar la caja');
      }

      const data = await res.json();
      setCashShift(null);
      setCashSuccess('Caja cerrada correctamente.');
      setShowCloseModal(false);
      setClosingForm({
        bill20000: '',
        bill10000: '',
        bill2000: '',
        bill1000: '',
        bill500: '',
        cash_adjustments_amount: '',
        cash_adjustments_note: '',
        closing_note: ''
      });
      setActiveSection('open');
      loadCashContext();
    } catch (err) {
      console.error('[BOLETERIA] Error closing shift:', err);
      setCashError(err.message || 'No se pudo cerrar la caja');
    }
  };
  
  // Search customers as user types
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    
    const delaySearch = setTimeout(async () => {
      try {
        const res = await apiAuthFetch(
          `/api/users/search-quick?q=${encodeURIComponent(searchQuery)}`,
          { method: 'GET' },
          token
        );
        const data = await res.json();
        setSearchResults(data.users || []);
        setShowSearchResults(true);
      } catch (err) {
        console.error('Error searching customers:', err);
        setSearchResults([]);
      }
    }, 300); // Debounce 300ms
    
    return () => clearTimeout(delaySearch);
  }, [searchQuery, token]);

  // Load associated services when show changes
  useEffect(() => {
    if (!selectedShow) {
      setShowServices([]);
      setSelectedServices({});
      return;
    }
    apiFetch(`/api/shows/${selectedShow}/services`)
      .then(r => r.json())
      .then(data => setShowServices(Array.isArray(data) ? data : []))
      .catch(() => setShowServices([]));
  }, [selectedShow]);

  // Load sessions when show is selected
  useEffect(() => {
    if (!selectedShow) {
      setSessions([]);
      setSelectedSession(null);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`/api/shows/${selectedShow}/sessions`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
          // Auto-select if only one session
          if (data.length === 1) {
            setSelectedSession(data[0].id);
          }
        }
      } catch (err) {
        console.error('Error loading sessions:', err);
      }
    })();
  }, [selectedShow]);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    if (!selectedShow) {
      setDiscountError('Seleccioná un show primero');
      return;
    }
    
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
          show_id: selectedShow,
          seat_count: seatCount
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

  const handleSelectionChange = (payload) => {
    setCurrentSelection((prev) => ({
      selectedSeatIds: payload?.selectedSeatIds || prev?.selectedSeatIds || new Set(),
      selectedPalcosLabels: payload?.selectedPalcosLabels || prev?.selectedPalcosLabels || new Set(),
      pullmanSelected: payload?.pullmanSelected ?? prev?.pullmanSelected ?? 0,
      clearSelection: payload?.clearSelection || prev?.clearSelection || null,
      pricing: payload?.pricing || prev?.pricing || defaultPricing,
      priceTiers: payload?.priceTiers || prev?.priceTiers || []
    }));
    
    // Check if applied discount still meets seat constraints
    if (appliedDiscount && (appliedDiscount.min_seats || appliedDiscount.max_seats || appliedDiscount.require_even)) {
      const items = [];
      const newSelection = payload?.selectedSeatIds || currentSelection?.selectedSeatIds || new Set();
      const newPalcos = payload?.selectedPalcosLabels || currentSelection?.selectedPalcosLabels || new Set();
      const newPullman = payload?.pullmanSelected ?? currentSelection?.pullmanSelected ?? 0;
      
      for (const seatId of newSelection) {
        items.push({ type: 'butaca', seat_code: seatId });
      }
      for (const label of newPalcos) {
        const isPB = /^PB/i.test(label);
        items.push({ type: 'palco', seat_code: label, quantity: isPB ? 4 : 2 });
      }
      if (newPullman > 0) {
        items.push({ type: payload?.pricing?.general > 0 ? 'general' : 'pullman', quantity: newPullman });
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
      }
    }
  };

  // Blocking mode handlers
  const handleBlockingSelectionChange = (payload) => {
    setBlockingSelection((prev) => ({
      selectedSeatIds: payload?.selectedSeatIds || prev?.selectedSeatIds || new Set(),
      selectedPalcosLabels: payload?.selectedPalcosLabels || prev?.selectedPalcosLabels || new Set(),
      pullmanSelected: payload?.pullmanSelected ?? prev?.pullmanSelected ?? 0,
      clearSelection: payload?.clearSelection || prev?.clearSelection || null
    }));
  };

  // Load blocking sessions when show is selected
  useEffect(() => {
    if (!blockingShow) {
      setBlockingSessions([]);
      setBlockingSession(null);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`/api/shows/${blockingShow}/sessions`);
        if (res.ok) {
          const data = await res.json();
          setBlockingSessions(data);
          if (data.length === 1) {
            setBlockingSession(data[0].id);
          }
        }
      } catch (err) {
        console.error('Error loading blocking sessions:', err);
      }
    })();
  }, [blockingShow]);

  const handleBlockSeats = async () => {
    if (!blockingSession) return;
    const items = [];
    
    for (const seatId of blockingSelection.selectedSeatIds) {
      items.push({ seat_code: seatId, block_type: 'butaca' });
    }
    for (const palco of blockingSelection.selectedPalcosLabels) {
      items.push({ seat_code: palco, block_type: 'palco' });
    }
    
    if (items.length === 0 && blockingSelection.pullmanSelected === 0) {
      setBlockingError('Seleccioná al menos una ubicación para bloquear');
      return;
    }
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      // Block seats/palcos
      if (items.length > 0) {
        const res = await apiAuthFetch('/api/seat-blocks/block', {
          method: 'POST',
          body: JSON.stringify({ session_id: blockingSession, items })
        }, token);
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Error al bloquear');
        }
      }
      
      // Block general admission if applicable
      if (blockingSelection.pullmanSelected > 0) {
        const res = await apiAuthFetch('/api/seat-blocks/block-general', {
          method: 'POST',
          body: JSON.stringify({ session_id: blockingSession, quantity: blockingSelection.pullmanSelected })
        }, token);
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Error al bloquear entradas generales');
        }
      }
      
      setBlockingSuccess(`${items.length + (blockingSelection.pullmanSelected > 0 ? 1 : 0)} ubicación(es) bloqueada(s) exitosamente`);
      if (blockingSelection.clearSelection) {
        blockingSelection.clearSelection();
      }
      
      // Force reload availability
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(blockingSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al bloquear ubicaciones');
    } finally {
      setBlockingLoading(false);
    }
  };

  const handleUnblockSeats = async () => {
    if (!blockingSession) return;
    const items = [];
    
    for (const seatId of blockingSelection.selectedSeatIds) {
      items.push({ seat_code: seatId, block_type: 'butaca' });
    }
    for (const palco of blockingSelection.selectedPalcosLabels) {
      items.push({ seat_code: palco, block_type: 'palco' });
    }
    
    if (items.length === 0 && blockingSelection.pullmanSelected === 0) {
      setBlockingError('Seleccioná al menos una ubicación para liberar');
      return;
    }
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      // Unblock seats/palcos
      if (items.length > 0) {
        const res = await apiAuthFetch('/api/seat-blocks/unblock', {
          method: 'POST',
          body: JSON.stringify({ session_id: blockingSession, items })
        }, token);
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Error al liberar');
        }
      }
      
      // Unblock general admission if applicable
      if (blockingSelection.pullmanSelected > 0) {
        const res = await apiAuthFetch('/api/seat-blocks/unblock-general', {
          method: 'POST',
          body: JSON.stringify({ session_id: blockingSession, quantity: blockingSelection.pullmanSelected })
        }, token);
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Error al liberar entradas generales');
        }
      }
      
      setBlockingSuccess(`${items.length + (blockingSelection.pullmanSelected > 0 ? 1 : 0)} ubicación(es) liberada(s) exitosamente`);
      if (blockingSelection.clearSelection) {
        blockingSelection.clearSelection();
      }
      
      // Force reload availability
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al liberar ubicaciones');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Block entire pullman (92 seats)
  const handleBlockPullman = async () => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      const res = await apiAuthFetch('/api/seat-blocks/block-general', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, quantity: 92 })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al bloquear pullman');
      }
      
      setBlockingSuccess('Pullman completo bloqueado (92 ubicaciones)');
      
      // Force reload availability
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al bloquear pullman');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Unblock entire pullman (92 seats)
  const handleUnblockPullman = async () => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      const res = await apiAuthFetch('/api/seat-blocks/unblock-general', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, quantity: 92 })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al liberar pullman');
      }
      
      setBlockingSuccess('Pullman completo liberado (92 ubicaciones)');
      
      // Force reload availability
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al liberar pullman');
    } finally {
      setBlockingLoading(false);
    }
  };

  // ===== BLOQUEO MASIVO =====

  // Toggle selección de fila (para UI de selección)
  const toggleRowSelection = (row) => {
    setSelectedRows(prev => {
      const updated = new Set(prev);
      if (updated.has(row)) {
        updated.delete(row);
      } else {
        updated.add(row);
      }
      return updated;
    });
  };

  // Bloquear filas seleccionadas
  const handleBlockRows = async () => {
    if (!blockingSession || selectedRows.size === 0) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      // Obtener todas las butacas de las filas seleccionadas
      let allSeats = [];
      selectedRows.forEach(row => {
        allSeats = allSeats.concat(getRowSeats(row));
      });
      
      // Crear items para bloquear
      const items = allSeats.map(seat_code => ({ seat_code, block_type: 'butaca' }));
      
      if (items.length === 0) {
        setBlockingError('No hay butacas para bloquear en las filas seleccionadas');
        return;
      }
      
      const res = await apiAuthFetch('/api/seat-blocks/block', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al bloquear filas');
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.blocked || items.length} butaca(s) de fila(s) ${Array.from(selectedRows).join(', ')} bloqueada(s)`);
      setSelectedRows(new Set());
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al bloquear filas');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Desbloquear filas seleccionadas
  const handleUnblockRows = async () => {
    if (!blockingSession || selectedRows.size === 0) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      // Obtener todas las butacas de las filas seleccionadas
      let allSeats = [];
      selectedRows.forEach(row => {
        allSeats = allSeats.concat(getRowSeats(row));
      });
      
      // Crear items para desbloquear
      const items = allSeats.map(seat_code => ({ seat_code, block_type: 'butaca' }));
      
      const res = await apiAuthFetch('/api/seat-blocks/unblock', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al liberar filas');
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.unblocked || items.length} butaca(s) de fila(s) ${Array.from(selectedRows).join(', ')} liberada(s)`);
      setSelectedRows(new Set());
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al liberar filas');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Bloquear todos los palcos bajos disponibles
  const handleBlockPalcosBajos = async () => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      const palcos = getPalcosBajos();
      const items = palcos.map(seat_code => ({ seat_code, block_type: 'palco' }));
      
      const res = await apiAuthFetch('/api/seat-blocks/block', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al bloquear palcos bajos');
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.blocked || 0} palco(s) bajo(s) bloqueado(s)`);
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al bloquear palcos bajos');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Desbloquear todos los palcos bajos
  const handleUnblockPalcosBajos = async () => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      const palcos = getPalcosBajos();
      const items = palcos.map(seat_code => ({ seat_code, block_type: 'palco' }));
      
      const res = await apiAuthFetch('/api/seat-blocks/unblock', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al liberar palcos bajos');
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.unblocked || 0} palco(s) bajo(s) liberado(s)`);
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al liberar palcos bajos');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Bloquear todos los palcos altos disponibles
  const handleBlockPalcosAltos = async () => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      const palcos = getPalcosAltos();
      const items = palcos.map(seat_code => ({ seat_code, block_type: 'palco' }));
      
      const res = await apiAuthFetch('/api/seat-blocks/block', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al bloquear palcos altos');
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.blocked || 0} palco(s) alto(s) bloqueado(s)`);
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al bloquear palcos altos');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Desbloquear todos los palcos altos
  const handleUnblockPalcosAltos = async () => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      const palcos = getPalcosAltos();
      const items = palcos.map(seat_code => ({ seat_code, block_type: 'palco' }));
      
      const res = await apiAuthFetch('/api/seat-blocks/unblock', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al liberar palcos altos');
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.unblocked || 0} palco(s) alto(s) liberado(s)`);
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al liberar palcos altos');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Bloquear zona PB (izquierda/centro/derecha)
  const handleBlockPBZone = async (zone) => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      let seats = [];
      let zoneName = '';
      
      switch (zone) {
        case 'izquierda':
          seats = getPBIzquierdaSeats();
          zoneName = 'PB Izquierda';
          break;
        case 'centro':
          seats = getPBCentroSeats();
          zoneName = 'PB Centro';
          break;
        case 'derecha':
          seats = getPBDerechaSeats();
          zoneName = 'PB Derecha';
          break;
        default:
          throw new Error('Zona no válida');
      }
      
      const items = seats.map(seat_code => ({ seat_code, block_type: 'butaca' }));
      
      const res = await apiAuthFetch('/api/seat-blocks/block', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || `Error al bloquear ${zoneName}`);
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.blocked || items.length} butaca(s) de ${zoneName} bloqueada(s)`);
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al bloquear zona');
    } finally {
      setBlockingLoading(false);
    }
  };

  // Desbloquear zona PB (izquierda/centro/derecha)
  const handleUnblockPBZone = async (zone) => {
    if (!blockingSession) return;
    
    setBlockingLoading(true);
    setBlockingError('');
    setBlockingSuccess('');
    
    try {
      let seats = [];
      let zoneName = '';
      
      switch (zone) {
        case 'izquierda':
          seats = getPBIzquierdaSeats();
          zoneName = 'PB Izquierda';
          break;
        case 'centro':
          seats = getPBCentroSeats();
          zoneName = 'PB Centro';
          break;
        case 'derecha':
          seats = getPBDerechaSeats();
          zoneName = 'PB Derecha';
          break;
        default:
          throw new Error('Zona no válida');
      }
      
      const items = seats.map(seat_code => ({ seat_code, block_type: 'butaca' }));
      
      const res = await apiAuthFetch('/api/seat-blocks/unblock', {
        method: 'POST',
        body: JSON.stringify({ session_id: blockingSession, items })
      }, token);
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || `Error al liberar ${zoneName}`);
      }
      
      const data = await res.json();
      setBlockingSuccess(`${data.unblocked || items.length} butaca(s) de ${zoneName} liberada(s)`);
      
      // Force reload
      const currentSession = blockingSession;
      setBlockingSession(null);
      setTimeout(() => setBlockingSession(currentSession), 100);
    } catch (err) {
      setBlockingError(err.message || 'Error al liberar zona');
    } finally {
      setBlockingLoading(false);
    }
  };

  const calculateTotal = () => {
    const pricing = currentSelection.pricing || defaultPricing;
    const priceTiers = currentSelection.priceTiers || [];
    
    // Calculate seats total using priceTiers rules if available
    let seatsTotal = 0;
    for (const seatId of currentSelection.selectedSeatIds) {
      const tierInfo = priceTiers.length > 0 ? getSeatPriceTier(seatId, priceTiers) : null;
      const seatPrice = tierInfo?.price ? Number(tierInfo.price) : Number(pricing.platea_general || 0);
      seatsTotal += seatPrice;
    }
    
    // Calculate palcos price based on label (PB vs PA) and priceTiers
    let palcosTotal = 0;
    for (const palco of currentSelection.selectedPalcosLabels) {
      const isPB = /^PB/i.test(palco);
      const tierInfo = priceTiers.length > 0 ? getSeatPriceTier(palco, priceTiers) : null;
      const palcoPrice = tierInfo?.price ? Number(tierInfo.price) : (isPB ? Number(pricing.palcos_bajos || 0) : Number(pricing.palcos_altos || 0));
      palcosTotal += palcoPrice;
    }
    
    // Calculate pullman or general admission total
    const isGeneralAdmission = pricing.general && pricing.general > 0;
    const pullmanOrGeneralPrice = isGeneralAdmission ? Number(pricing.general) : Number(pricing.pullman || 0);
    const pullmanTotal = currentSelection.pullmanSelected * pullmanOrGeneralPrice;
    const subtotal = seatsTotal + palcosTotal + pullmanTotal;
    
    // Apply discount FIRST (before any charges)
    let discountAmount = 0;
    let total = subtotal;
    
    if (appliedDiscount) {
      if (appliedDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
      } else if (appliedDiscount.type === 'fixed') {
        discountAmount = Math.round(appliedDiscount.value);
      }
      // Ensure discount doesn't exceed subtotal
      discountAmount = Math.min(discountAmount, subtotal);
      total = subtotal - discountAmount;
    }
    
    // Services (not subject to ticket discount)
    const serviceItems = [];
    let servicesSubtotal = 0;
    for (const svc of showServices) {
      const qty = Number(selectedServices[svc.id] || 0);
      if (qty > 0) {
        serviceItems.push({ service_id: svc.id, name: svc.name, price: Number(svc.price), quantity: qty });
        servicesSubtotal += Number(svc.price) * qty;
      }
    }

    total = total + servicesSubtotal;
    
    return { subtotal, discountAmount, total, serviceItems, servicesSubtotal };
  };

  const handleConfirmSale = async (event) => {
    if (event) {
      event.preventDefault();
    }
    if (!cashShift) {
      setError('Debés abrir la caja antes de registrar ventas.');
      return;
    }
    if (!customerName.trim()) {
      setError('El nombre del cliente es obligatorio');
      return;
    }

    const { serviceItems: currentServiceItems } = calculateTotal();
    if (currentSelection.selectedSeatIds.size === 0 && currentSelection.selectedPalcosLabels.size === 0 && currentSelection.pullmanSelected === 0 && currentServiceItems.length === 0) {
      setError('Debe seleccionar al menos una entrada o un servicio');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(null);

    try {
      const pricing = currentSelection.pricing || defaultPricing;

      const items = [];
      
      // Add seats
      for (const seatId of currentSelection.selectedSeatIds) {
        items.push({
          type: 'butaca',
          seat_code: seatId,
          price: Number(pricing.platea_general || 0)
        });
      }
      
      // Add palcos
      for (const palco of currentSelection.selectedPalcosLabels) {
        const isPB = /^PB/i.test(palco);
        const price = isPB ? Number(pricing.palcos_bajos || 0) : Number(pricing.palcos_altos || 0);
        items.push({
          type: 'palco',
          seat_code: palco,
          price
        });
      }
      
      // Add pullman or general admission
      if (currentSelection.pullmanSelected > 0) {
        // Check if this is general admission (has general price) or pullman
        const isGeneralAdmission = pricing.general && pricing.general > 0;
        items.push({
          type: isGeneralAdmission ? 'general' : 'pullman',
          quantity: currentSelection.pullmanSelected,
          price: isGeneralAdmission ? Number(pricing.general) : Number(pricing.pullman || 0)
        });
      }

      const { serviceItems: currentServiceItems2 } = calculateTotal();
      const res = await apiAuthFetch('/api/tickets/box-office-sale', {
        method: 'POST',
        body: JSON.stringify({
          session_id: selectedSession,
          items,
          customer: {
            name: customerName.trim(),
            email: customerEmail.trim() || null,
            phone: customerPhone.trim() || null,
            dni: customerDni.trim() || null
          },
          payment_method: paymentMethod,
          discount_id: appliedDiscount?.id || null,
          service_items: currentServiceItems2.length > 0 ? currentServiceItems2 : undefined
        })
      }, token);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error al procesar la venta');
      }

      const data = await res.json();
      setSuccess(data);
      setShowSaleModal(false);
      setError('');
      
      // Clear selection and customer data
      if (currentSelection.clearSelection) {
        currentSelection.clearSelection();
      }
      setCustomerName('');
      setCustomerEmail('');
      setCustomerPhone('');
      setCustomerDni('');
      setDiscountCode('');
      setAppliedDiscount(null);
      setDiscountError('');
      
    } catch (err) {
      setError(err.message || 'Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  const totalItems = currentSelection.selectedSeatIds.size + currentSelection.selectedPalcosLabels.size + currentSelection.pullmanSelected;
  const { subtotal, discountAmount, total, serviceItems: saleServiceItems, servicesSubtotal } = calculateTotal();
  
  useEffect(() => {
    if (showSaleModal && totalItems === 0) {
      setShowSaleModal(false);
    }
  }, [showSaleModal, totalItems]);

  const handleCloseSaleModal = () => {
    setShowSaleModal(false);
    setError('');
    setShowSearchResults(false);
  };

  const handleCancelSale = () => {
    handleCloseSaleModal();
    if (currentSelection.clearSelection) {
      currentSelection.clearSelection();
    }
    setDiscountCode('');
    setAppliedDiscount(null);
    setDiscountError('');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerDni('');
    setPaymentMethod('cash');
    setSearchQuery('');
    setSearchResults([]);
    setSuccess(null);
  };

  const handleOpenSaleModal = () => {
    if (totalItems === 0) return;
    setShowSaleModal(true);
    setError('');
    setShowSearchResults(false);
  };

  const handleOpenQuickSaleModal = () => {
    if (totalItems === 0) return;
    setShowQuickSaleModal(true);
    setQuickSalePhone('');
    setPaymentMethod('cash');
    setError('');
  };

  const handleCloseQuickSaleModal = () => {
    setShowQuickSaleModal(false);
    setError('');
  };

  const handleConfirmQuickSale = async (event) => {
    if (event) event.preventDefault();
    if (!cashShift) {
      setError('Debés abrir la caja antes de registrar ventas.');
      return;
    }
    if (currentSelection.selectedSeatIds.size === 0 && currentSelection.selectedPalcosLabels.size === 0 && currentSelection.pullmanSelected === 0) {
      setError('Debe seleccionar al menos una entrada');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(null);

    try {
      const pricing = currentSelection.pricing || defaultPricing;
      const items = [];
      for (const seatId of currentSelection.selectedSeatIds) {
        items.push({ type: 'butaca', seat_code: seatId, price: Number(pricing.platea_general || 0) });
      }
      for (const palco of currentSelection.selectedPalcosLabels) {
        const isPB = /^PB/i.test(palco);
        const price = isPB ? Number(pricing.palcos_bajos || 0) : Number(pricing.palcos_altos || 0);
        items.push({ type: 'palco', seat_code: palco, price });
      }
      if (currentSelection.pullmanSelected > 0) {
        const isGeneralAdmission = pricing.general && pricing.general > 0;
        items.push({
          type: isGeneralAdmission ? 'general' : 'pullman',
          quantity: currentSelection.pullmanSelected,
          price: isGeneralAdmission ? Number(pricing.general) : Number(pricing.pullman || 0)
        });
      }

      const res = await apiAuthFetch('/api/tickets/box-office-sale', {
        method: 'POST',
        body: JSON.stringify({
          session_id: selectedSession,
          items,
          customer: {
            name: 'Venta en función',
            phone: quickSalePhone.trim() || null
          },
          payment_method: paymentMethod,
          discount_id: appliedDiscount?.id || null
        })
      }, token);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Error al procesar la venta');
      }

      const data = await res.json();
      setSuccess(data);
      setShowQuickSaleModal(false);
      setError('');

      if (currentSelection.clearSelection) currentSelection.clearSelection();
      setQuickSalePhone('');
      setDiscountCode('');
      setAppliedDiscount(null);
      setDiscountError('');
    } catch (err) {
      setError(err.message || 'Error al procesar la venta');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeSale = () => {
    handleCancelSale();
    setSelectedShow(null);
    setSelectedSession(null);
    setSelectedShowData(null);
    setSuccess(null);
    setActiveSection('sales');
    loadCashContext();
  };

  const handleSendWhatsApp = () => {
    if (!success) return;
    const phoneRaw = success.sale?.customer_phone || success.sale?.customer_phone_raw || '';
    const digits = (phoneRaw || '').replace(/\D/g, '');
    if (!digits) return;

    const customerName = success.sale?.customer_name || 'Cliente';
    const showTitle = success.sale?.show_title || selectedShowTitle || 'Espectáculo';
    const sessionDate = success.sale?.session_date || '';
    const sessionTime = success.sale?.session_time || '';
    const shareUrl = success.sale?.share_url || '';

    const message = `Hola ${customerName}! Te enviamos tus entradas para ${showTitle}.

Función: ${sessionDate}${sessionDate && sessionTime ? ' a las ' : ''}${sessionTime}

Podés ver tus entradas aquí: ${shareUrl}

Recordá llegar al menos 30 minutos antes de la función, las funciones comienzan puntual. Una vez comenzada la función, la ubicación pierde validez (el personal de la sala te asignará un nuevo lugar).

Las entradas no tienen cambio ni devolución, excepto en casos de cancelación/modificación del espectáculo.

Teatro Español Pigüé`;

    const waUrl = `https://wa.me/549${digits}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  };

  const handlePrintTickets = () => {
    if (!success) return;
    const printUrl = success.sale?.print_url || success.sale?.share_url;
    if (printUrl) {
      window.open(printUrl, '_blank');
      return;
    }

    const qr = success.sale?.container_qr_code || success.sale?.container_qr_data;
    if (qr) {
      window.open(qr, '_blank');
    } else {
      window.print();
    }
  };

  // Select customer from search results
  const selectCustomer = (customer) => {
    setCustomerName(customer.name);
    setCustomerEmail(customer.email || '');
    setCustomerPhone(customer.phone || '');
    setCustomerDni(customer.dni || '');
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  // Sidebar content for box office mode
  const boxOfficeSidebar = (() => {
    if (!selectedSession && !success) {
      return null;
    }

    if (success) {
      const tickets = success.tickets || [];
      const hasPhone = Boolean(success.sale?.customer_phone);
      return (
        <aside
          style={{
            background: '#ffffff',
            border: '2px solid #bbf7d0',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 16px 30px rgba(15, 23, 42, 0.12)',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 24
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, color: '#047857' }}> Venta exitosa</div>
              <div style={{ fontSize: 14, color: '#374151', display: 'grid', gap: 6 }}>
                {success.sale?.customer_name && <div><strong>Cliente:</strong> {success.sale.customer_name}</div>}
                {success.sale?.customer_email && <div><strong>Email:</strong> {success.sale.customer_email}</div>}
                {success.sale?.customer_phone && <div><strong>Teléfono:</strong> {success.sale.customer_phone}</div>}
                {success.sale?.show_title && (
                  <div>
                    <strong>Función:</strong> {success.sale.show_title}
                    {success.sale.session_date && (
                      <>
                        {' • '}
                        {success.sale.session_date}
                      </>
                    )}
                    {success.sale.session_time && (
                      <>
                        {' a las '}
                        {success.sale.session_time}
                      </>
                    )}
                  </div>
                )}
              </div>
              {success.discount && (
                <div
                  style={{
                    padding: 12,
                    background: '#fef3c7',
                    border: '1px solid #fde68a',
                    borderRadius: 10,
                    color: '#92400e'
                  }}
                >
                  <div style={{ fontWeight: 600 }}> Descuento aplicado: {success.discount.alias || success.discount.code}</div>
                </div>
              )}
              <div
                style={{
                  padding: 16,
                  background: '#ecfdf5',
                  borderRadius: 12,
                  border: '1px solid #d1fae5',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 15,
                  fontWeight: 600,
                  color: '#064e3b'
                }}
              >
                <span>Total cobrado</span>
                <span>${Number(success.sale?.total_amount || 0).toLocaleString('es-AR')}</span>
              </div>
              {tickets.length > 0 && (() => {
                const regularTickets = tickets.filter(t => t.type !== 'service');
                const serviceTickets = tickets.filter(t => t.type === 'service');
                return (
                  <>
                    {regularTickets.length > 0 && (
                      <div>
                        <strong>Entradas ({regularTickets.length}):</strong>
                        <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 14, display: 'grid', gap: 6 }}>
                          {regularTickets.map((ticket) => (
                            <li key={ticket.id}>
                              {ticket.location || `${ticket.type?.toUpperCase() || 'Entrada'} ${ticket.seat_code || ''}`}
                              {' • '}
                              <span style={{ color: '#059669', fontWeight: 600 }}>
                                ${Number(ticket.price || 0).toLocaleString('es-AR')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {serviceTickets.length > 0 && (
                      <div>
                        <strong>Servicios asociados:</strong>
                        <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 14, display: 'grid', gap: 6 }}>
                          {serviceTickets.map((ticket) => (
                            <li key={ticket.id}>
                              {ticket.seat_code || ticket.location} - {ticket.capacity || 1} persona{(ticket.capacity || 1) > 1 ? 's' : ''} - <span style={{ color: '#059669', fontWeight: 600 }}>${(Number(ticket.price || 0) * Number(ticket.capacity || 1)).toLocaleString('es-AR')}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
              {success.user_association?.found && (
                <div style={{ padding: 12, background: '#fef9c3', borderRadius: 10, color: '#78350f', fontSize: 13 }}>
                  {success.user_association.message}
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                alignItems: 'center'
              }}
            >
              <button
                type="button"
                onClick={handleSendWhatsApp}
                disabled={!hasPhone}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  background: hasPhone ? '#16a34a' : '#d1d5db',
                  color: hasPhone ? '#ffffff' : '#6b7280',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: hasPhone ? 'pointer' : 'not-allowed',
                  transition: 'opacity 0.2s'
                }}
              >
                Enviar por WhatsApp
              </button>
              <button
                type="button"
                onClick={handlePrintTickets}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  background: '#111827',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer'
                }}
              >
                 Imprimir tickets
              </button>
              <button
                type="button"
                onClick={handleFinalizeSale}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer'
                }}
              >
                Finalizar
              </button>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', textAlign: 'center', maxWidth: 260 }}>
                El ticket se envía automáticamente por email cuando se ingresa uno válido.
              </div>
              {success.sale?.share_url && (
                <div style={{ fontSize: 12, color: '#047857', textAlign: 'center', maxWidth: '100%' }}>
                  También podés compartir este link: <br />
                  <a href={success.sale.share_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', wordBreak: 'break-word' }}>
                    {success.sale.share_url}
                  </a>
                </div>
              )}
            </div>
          </div>
        </aside>
      );
    }
    const summaryDisabled = totalItems === 0;
    return (
      <aside
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 20, textAlign: 'center' }}>Resumen de la venta</h3>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 24,
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              flex: isWideLayout ? '1 1 360px' : '1 1 auto',
              maxWidth: isWideLayout ? 440 : '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}
          >
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>Entradas seleccionadas</div>
              {summaryDisabled ? (
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Seleccioná butacas o palcos para ver el detalle de la venta.
                </div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, display: 'grid', gap: 6, listStyle: 'none', padding: 0 }}>
                  {Array.from(currentSelection.selectedSeatIds).map((sid) => {
                    const tierInfo = currentSelection.priceTiers?.length > 0 ? getSeatPriceTier(sid, currentSelection.priceTiers) : null;
                    const seatPrice = tierInfo?.price ? Number(tierInfo.price) : Number(currentSelection.pricing?.platea_general || 0);
                    return (
                      <li key={sid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{formatSeatLocation(sid, 'butaca')}</span>
                        <span style={{ fontWeight: 600 }}>${seatPrice.toLocaleString('es-AR')}</span>
                      </li>
                    );
                  })}
                  {Array.from(currentSelection.selectedPalcosLabels).map((label) => {
                    const isPB = /^PB/i.test(label);
                    const tierInfo = currentSelection.priceTiers?.length > 0 ? getSeatPriceTier(label, currentSelection.priceTiers) : null;
                    const palcoPrice = tierInfo?.price ? Number(tierInfo.price) : (isPB ? Number(currentSelection.pricing?.palcos_bajos || 0) : Number(currentSelection.pricing?.palcos_altos || 0));
                    return (
                      <li key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{formatSeatLocation(label, 'palco')}</span>
                        <span style={{ fontWeight: 600 }}>${palcoPrice.toLocaleString('es-AR')}</span>
                      </li>
                    );
                  })}
                  {currentSelection.pullmanSelected > 0 && (
                    <li style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{currentSelection.pricing?.general > 0 ? 'Entrada General' : 'Pullman'} x {currentSelection.pullmanSelected}</span>
                      <span style={{ fontWeight: 600 }}>
                        ${((currentSelection.pricing?.general > 0 ? Number(currentSelection.pricing.general) : Number(currentSelection.pricing?.pullman || 0)) * currentSelection.pullmanSelected).toLocaleString('es-AR')}
                      </span>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Services selection in sidebar */}
            {showServices.length > 0 && (
              <div>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>Servicios adicionales</div>
                {showServices.map(svc => {
                  const qty = Number(selectedServices[svc.id] || 0);
                  return (
                    <div key={svc.id} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{svc.name}</span>
                          {svc.description && <span style={{ fontSize: 11, color: '#6b7280', display: 'block' }}>{svc.description}</span>}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>${Number(svc.price).toLocaleString('es-AR')}/u</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button type="button" onClick={() => setSelectedServices(prev => ({ ...prev, [svc.id]: Math.max(0, (Number(prev[svc.id]) || 0) - 1) }))} style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>−</button>
                        <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{qty}</span>
                        <button type="button" onClick={() => setSelectedServices(prev => ({ ...prev, [svc.id]: (Number(prev[svc.id]) || 0) + 1 }))} style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>+</button>
                        {qty > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, color: '#1e40af' }}>${(Number(svc.price) * qty).toLocaleString('es-AR')}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                padding: 16,
                borderRadius: 12,
                background: '#f8fafc',
                display: 'grid',
                gap: 8,
                fontSize: 15
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal entradas</span>
                <span>${subtotal.toLocaleString('es-AR')}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 600 }}>
                  <span>Descuento</span>
                  <span>-${discountAmount.toLocaleString('es-AR')}</span>
                </div>
              )}
              {servicesSubtotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e40af' }}>
                  <span>Servicios</span>
                  <span>${servicesSubtotal.toLocaleString('es-AR')}</span>
                </div>
              )}
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 8,
                  borderTop: '2px solid #1f2937',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: 20
                }}
              >
                <span>Total</span>
                <span>${total.toLocaleString('es-AR')}</span>
              </div>
            </div>
          </div>

          <div
            style={{
              flex: isWideLayout ? '0 1 260px' : '1 1 auto',
              maxWidth: isWideLayout ? 300 : '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center'
            }}
          >
            <button
              type="button"
              onClick={handleCancelSale}
              style={{
                width: '100%',
                maxWidth: '100%',
                padding: 12,
                borderRadius: 10,
                border: '1px solid #ef4444',
                background: '#fef2f2',
                color: '#b91c1c',
                fontWeight: 600,
                cursor: summaryDisabled ? 'not-allowed' : 'pointer',
                opacity: summaryDisabled ? 0.5 : 1
              }}
              disabled={summaryDisabled}
            >
              Cancelar venta
            </button>
            <button
              type="button"
              onClick={handleOpenSaleModal}
              style={{
                width: '100%',
                maxWidth: '100%',
                padding: 12,
                borderRadius: 10,
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                cursor: summaryDisabled ? 'not-allowed' : 'pointer',
                opacity: summaryDisabled ? 0.5 : 1
              }}
              disabled={summaryDisabled}
            >
              Vender entradas
            </button>
            <button
              type="button"
              onClick={handleOpenQuickSaleModal}
              style={{
                width: '100%',
                maxWidth: '100%',
                padding: 12,
                borderRadius: 10,
                border: '2px solid #2563eb',
                background: '#eff6ff',
                color: '#2563eb',
                fontWeight: 600,
                cursor: summaryDisabled ? 'not-allowed' : 'pointer',
                opacity: summaryDisabled ? 0.5 : 1
              }}
              disabled={summaryDisabled}
            >
              Vender en función
            </button>
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', textAlign: 'center', maxWidth: '100%' }}>
              Al confirmar podrás cargar los datos del espectador.
            </div>
          </div>
        </div>
      </aside>
    );
  })();

  const renderOpenSection = () => {
    if (loadingShift) {
      return <div style={{ color: '#6b7280' }}>Cargando estado de caja...</div>;
    }

    if (cashShift) {
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{
            padding: isWideLayout ? 16 : 12,
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            background: '#f9fafb',
            overflowX: 'hidden'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isWideLayout ? 'auto auto auto auto 1fr' : '1fr 1fr',
              gap: isWideLayout ? 24 : 10,
              alignItems: 'start'
            }}>
              <div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Estado</div>
                <div style={{ fontSize: isWideLayout ? 18 : 15, fontWeight: 600, color: '#059669' }}>Caja abierta</div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Apertura</div>
                <div style={{ fontSize: isWideLayout ? 16 : 14, fontWeight: 600, color: '#1f2937' }}>
                  {(() => {
                    if (!cashShift.opened_at) return '';
                    return formatDateTimeCompact(cashShift.opened_at);
                  })()}
                </div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Dinero en caja</div>
                <div style={{ fontSize: isWideLayout ? 16 : 14, fontWeight: 600 }}>
                  {(() => {
                    const summary = cashShift.summary || {};
                    const expected =
                      typeof summary.expected_cash === 'number'
                        ? summary.expected_cash
                        : (summary.opening_total_cash || cashShift.opening_total_cash || 0);
                    return formatCurrency(expected);
                  })()}
                </div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Operado con QR</div>
                <div style={{ fontSize: isWideLayout ? 16 : 14, fontWeight: 600, color: '#7c3aed' }}>
                  {(() => {
                    const qrTotal = cashOperations
                      .filter(op => op.payment_method === 'qr')
                      .reduce((sum, op) => sum + Number(op.total_amount || 0), 0);
                    return formatCurrency(qrTotal);
                  })()}
                </div>
              </div>
              <button
                onClick={() => setShowCloseModal(true)}
                style={{
                  padding: '10px 18px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  gridColumn: isWideLayout ? 'auto' : '1 / -1',
                  justifySelf: isWideLayout ? 'end' : 'stretch'
                }}
              >
                 Cerrar caja
              </button>
            </div>
            {cashShift.opening_note ? (
              <div style={{ marginTop: 12, fontSize: 14, color: '#6b7280' }}>
                <strong>Nota:</strong> {cashShift.opening_note}
              </div>
            ) : null}
          </div>

          {/* Se quita el detalle por denominación de billetes iniciales para una vista más simple de caja abierta */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 16,
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}> Detalle de ventas de esta caja</h3>
              {cashOperations.length > 0 && (
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {cashOperations.length} transacción{cashOperations.length !== 1 ? 'es' : ''}
                </span>
              )}
            </div>

            {cashOperations.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Todavía no registraste ventas en esta caja.
              </div>
            ) : isWideLayout ? (
              <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '6px 4px', textAlign: 'center', minWidth: 80 }}>Operación</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 140 }}>Show</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 120 }}>Fecha función</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 150 }}>Cliente</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 200 }}>Ubicaciones</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', minWidth: 60 }}>Tickets</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', minWidth: 70 }}>Personas</th>
                      <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 90 }}>Pago</th>
                      <th style={{ padding: '6px 4px', textAlign: 'right', minWidth: 90 }}>Total</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', minWidth: 90 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashOperations.slice(0, 50).map((op) => {
                      const sessionDateStr = op.session_date ? formatDate(op.session_date) : '-';
                      const sessionTimeStr = op.session_date ? formatTime(op.session_date) : '';

                      const isRefunded = op.refunded || false;
                      const isRefundOperation = op.is_refund_operation || false;
                      const isRefundedOriginal = isRefunded && !isRefundOperation;
                      const showDetailButton = isRefundOperation;

                      return (
                        <tr key={op.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: isRefundOperation ? '#fef2f2' : '#ecfdf5',
                              color: isRefundOperation ? '#dc2626' : '#059669',
                              border: `1px solid ${isRefundOperation ? '#fecaca' : '#a7f3d0'}`
                            }}>
                              {isRefundOperation ? 'Devolución' : 'Venta'}
                            </span>
                          </td>
                          <td style={{ padding: '6px 4px', fontWeight: 600 }}>
                            {op.show_title || 'Venta de entradas'}
                          </td>
                          <td style={{ padding: '6px 4px' }}>
                            <div>{sessionDateStr}</div>
                            {sessionTimeStr && (
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{sessionTimeStr}</div>
                            )}
                          </td>
                          <td style={{ padding: '6px 4px' }}>
                            <div style={{ fontWeight: 500 }}>{op.customer_name}</div>
                            {op.customer_dni && (
                              <div style={{ fontSize: 11, color: '#6b7280' }}>DNI: {op.customer_dni}</div>
                            )}
                            {op.customer_email && (
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>{op.customer_email}</div>
                            )}
                            {op.customer_phone && (
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>Tel: {op.customer_phone}</div>
                            )}
                          </td>
                          <td style={{ padding: '6px 4px', fontSize: 11 }}>
                            {op.locations
                              ?.split(', ')
                              .filter(Boolean)
                              .map((loc, idx) => (
                                <div key={idx}>{loc}</div>
                              ))}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>{op.tickets_count}</td>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>{op.people_count}</td>
                          <td style={{ padding: '6px 4px' }}>
                            <div>{(op.payment_method || 'N/A').toUpperCase()}</div>
                            {op.discount_code && (
                              <div style={{ fontSize: 11, color: '#059669' }}>
                                Desc: {op.discount_code} {op.discount_value && `(${op.discount_value})`}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>
                            {formatCurrency(op.total_amount)}
                          </td>
                          <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                            {isRefundedOriginal ? (
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>Reintegrada</span>
                            ) : showDetailButton ? (
                              <button
                                type="button"
                                onClick={() => handleViewTicketsFromCash(op, { detailsOnly: true })}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  border: '1px solid #d1d5db',
                                  background: '#f9fafb',
                                  fontSize: 11,
                                  cursor: 'pointer'
                                }}
                              >
                                Ver detalle
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleViewTicketsFromCash(op)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  border: '1px solid #d1d5db',
                                  background: '#f9fafb',
                                  fontSize: 11,
                                  cursor: 'pointer'
                                }}
                              >
                                Ver entradas
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cashOperations.slice(0, 50).map((op) => {
                  const sessionDateStr = op.session_date ? formatDate(op.session_date) : '-';
                  const sessionTimeStr = op.session_date ? formatTime(op.session_date) : '';
                  const isRefundOperation = op.is_refund_operation || false;
                  const isRefundedOriginal = (op.refunded || false) && !isRefundOperation;

                  return (
                    <div key={op.id} style={{
                      border: `1px solid ${isRefundOperation ? '#fecaca' : '#e5e7eb'}`,
                      borderRadius: 8,
                      padding: 10,
                      background: isRefundOperation ? '#fef2f2' : '#fff',
                      fontSize: 13
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: isRefundOperation ? '#fef2f2' : '#ecfdf5',
                          color: isRefundOperation ? '#dc2626' : '#059669',
                          border: `1px solid ${isRefundOperation ? '#fecaca' : '#a7f3d0'}`
                        }}>
                          {isRefundOperation ? 'Devolución' : 'Venta'}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(op.total_amount)}</span>
                      </div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{op.show_title || 'Venta de entradas'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                        {sessionDateStr}{sessionTimeStr ? ` - ${sessionTimeStr}` : ''} · {(op.payment_method || 'N/A').toUpperCase()} · {op.tickets_count} ticket{op.tickets_count !== 1 ? 's' : ''}
                      </div>
                      {op.customer_name && (
                        <div style={{ fontSize: 12, color: '#374151' }}>{op.customer_name}</div>
                      )}
                      {op.locations && (
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, wordBreak: 'break-word' }}>{op.locations}</div>
                      )}
                      <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                        {isRefundedOriginal ? (
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>Reintegrada</span>
                        ) : isRefundOperation ? (
                          <button type="button" onClick={() => handleViewTicketsFromCash(op, { detailsOnly: true })} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 11, cursor: 'pointer' }}>
                            Ver detalle
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleViewTicketsFromCash(op)} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 11, cursor: 'pointer' }}>
                            Ver entradas
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}
      >
        <form onSubmit={handleOpenShift} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, textAlign: 'center' }}>Apertura de caja</h3>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 16
            }}
          >
            {DENOMINATIONS.map((item) => (
              <label
                key={item.key}
                style={{
                  width: isWideLayout ? 240 : 'calc(50% - 8px)',
                  minWidth: 0,
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 12,
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                {item.img && (
                  <img
                    src={item.img}
                    alt={item.label}
                    style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 4 }}
                  />
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  value={openingForm[item.key]}
                  onChange={(e) => setOpeningForm((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  placeholder="Cantidad"
                  style={{
                    width: '100%',
                    padding: '12px 10px',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <label
              style={{
                fontSize: 14,
                color: '#374151',
                width: isWideLayout ? '50%' : '100%'
              }}
            >
              Nota opcional
              <textarea
                value={openingForm.opening_note}
                onChange={(e) => setOpeningForm((prev) => ({ ...prev, opening_note: e.target.value }))}
                placeholder="Observaciones iniciales (cambios, sobres, etc.)"
                rows={3}
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  boxSizing: 'border-box',
                  fontSize: 16
                }}
              />
            </label>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: 8,
              gap: 16,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ fontSize: 14, color: '#6b7280' }}>
              Efectivo declarado:{' '}
              <strong>{formatCurrency(calculateBillTotal(openingForm))}</strong>
            </div>
            <button
              type="submit"
              style={{
                padding: '10px 16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
               Abrir caja
            </button>
          </div>
        </form>
      </div>
    );
  };

  const toggleShiftExpanded = async (shiftId) => {
    const isExpanded = expandedShifts[shiftId];
    
    if (!isExpanded && !shiftOperations[shiftId]) {
      // Cargar operaciones del turno
      try {
        const res = await apiAuthFetch(`/api/cash-register/shift/${shiftId}/operations`, { method: 'GET' }, token);
        if (res.ok) {
          const data = await res.json();
          setShiftOperations(prev => ({ ...prev, [shiftId]: data.operations || [] }));
        }
      } catch (err) {
        console.error('Error loading shift operations:', err);
      }
    }
    
    setExpandedShifts(prev => ({ ...prev, [shiftId]: !isExpanded }));
  };

  const renderHistorySection = () => {
    return (
      <div>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}> Últimos cierres</h3>
        {cashHistory.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>Todavía no registraste cierres de caja.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {cashHistory.map((shift) => {
              const isExpanded = expandedShifts[shift.id];
              const operations = shiftOperations[shift.id] || [];
              
              return (
                <div
                  key={shift.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    background: '#ffffff',
                    overflow: 'hidden'
                  }}
                >
                  {/* Header clickeable */}
                  <div
                    onClick={() => toggleShiftExpanded(shift.id)}
                    style={{
                      padding: 16,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      background: isExpanded ? '#f9fafb' : '#ffffff',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        <div>
                          <strong>{shift.cashier?.name || 'Boletería'}</strong>
                          <div style={{ fontSize: 13, color: '#6b7280' }}>
                            Apertura: {formatDateTimeCompact(shift.opened_at)}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>Estado: {shift.status === 'closed' ? 'Cerrada' : 'Abierta'}</div>
                        {shift.closed_at ? (
                          <div style={{ fontSize: 13, color: '#6b7280' }}>Cierre: {formatDateTimeCompact(shift.closed_at)}</div>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
                      <span> Apertura: <strong>{formatCurrency(shift.summary?.opening_total_cash)}</strong></span>
                      <span> Ventas efectivo: <strong>{formatCurrency(shift.summary?.cash_sales_total)}</strong></span>
                      <span style={{ color: '#7c3aed' }}> Operado con QR: <strong>{formatCurrency(
                        shift.summary?.qr_sales_total || 
                        operations.filter(op => op.payment_method === 'qr').reduce((sum, op) => sum + Number(op.total_amount || 0), 0)
                      )}</strong></span>
                      <span> Diferencia: <strong>{formatCurrency(shift.summary?.discrepancy_amount)}</strong></span>
                    </div>
                    {shift.closing_note ? (
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        Nota cierre: {shift.closing_note}
                      </div>
                    ) : null}
                  </div>
                  
                  {/* Contenido expandible - Operaciones */}
                  {isExpanded && (
                    <div style={{ 
                      borderTop: '1px solid #e5e7eb',
                      padding: 16,
                      background: '#f9fafb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                          Detalle de operaciones
                        </h4>
                        {operations.length > 0 && (
                          <span style={{ fontSize: 12, color: '#6b7280' }}>
                            {operations.length} transacción{operations.length !== 1 ? 'es' : ''}
                          </span>
                        )}
                      </div>
                      {operations.length === 0 ? (
                        <p style={{ color: '#9ca3af', fontSize: 13 }}>No hay operaciones en este turno.</p>
                      ) : isWideLayout ? (
                        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f3f4f6' }}>
                                <th style={{ padding: '6px 4px', textAlign: 'center', minWidth: 80 }}>Operación</th>
                                <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 140 }}>Show</th>
                                <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 120 }}>Fecha función</th>
                                <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 150 }}>Cliente</th>
                                <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 180 }}>Ubicaciones</th>
                                <th style={{ padding: '6px 4px', textAlign: 'center', minWidth: 60 }}>Tickets</th>
                                <th style={{ padding: '6px 4px', textAlign: 'center', minWidth: 70 }}>Personas</th>
                                <th style={{ padding: '6px 4px', textAlign: 'left', minWidth: 90 }}>Pago</th>
                                <th style={{ padding: '6px 4px', textAlign: 'right', minWidth: 90 }}>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {operations.map((op) => {
                                const sessionDateStr = op.session_date ? formatDate(op.session_date) : '-';
                                const sessionTimeStr = op.session_date ? formatTime(op.session_date) : '';
                                const isRefundOperation = op.is_refund_operation || false;

                                return (
                                  <tr key={op.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                      <span style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        background: isRefundOperation ? '#fef2f2' : '#ecfdf5',
                                        color: isRefundOperation ? '#dc2626' : '#059669',
                                        border: `1px solid ${isRefundOperation ? '#fecaca' : '#a7f3d0'}`
                                      }}>
                                        {isRefundOperation ? 'Devolución' : 'Venta'}
                                      </span>
                                    </td>
                                    <td style={{ padding: '6px 4px', fontWeight: 600 }}>
                                      {op.show_title || 'Show'}
                                    </td>
                                    <td style={{ padding: '6px 4px' }}>
                                      <div>{sessionDateStr}</div>
                                      {sessionTimeStr && (
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{sessionTimeStr}</div>
                                      )}
                                    </td>
                                    <td style={{ padding: '6px 4px' }}>
                                      <div style={{ fontWeight: 500 }}>{op.customer_name}</div>
                                      {op.customer_dni && (
                                        <div style={{ fontSize: 11, color: '#6b7280' }}>DNI: {op.customer_dni}</div>
                                      )}
                                      {op.customer_email && (
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{op.customer_email}</div>
                                      )}
                                      {op.customer_phone && (
                                        <div style={{ fontSize: 11, color: '#9ca3af' }}>Tel: {op.customer_phone}</div>
                                      )}
                                    </td>
                                    <td style={{ padding: '6px 4px', fontSize: 11 }}>
                                      {op.locations
                                        ?.split(', ')
                                        .filter(Boolean)
                                        .map((loc, idx) => (
                                          <div key={idx}>{loc}</div>
                                        ))}
                                    </td>
                                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>{op.tickets_count}</td>
                                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>{op.people_count}</td>
                                    <td style={{ padding: '6px 4px' }}>
                                      <div>{(op.payment_method || 'N/A').toUpperCase()}</div>
                                      {op.discount_code && (
                                        <div style={{ fontSize: 11, color: '#059669' }}>
                                          Desc: {op.discount_code} {op.discount_value && `(${op.discount_value})`}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>
                                      {formatCurrency(op.total_amount)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {operations.map((op) => {
                            const sessionDateStr = op.session_date ? formatDate(op.session_date) : '-';
                            const sessionTimeStr = op.session_date ? formatTime(op.session_date) : '';
                            const isRefundOperation = op.is_refund_operation || false;

                            return (
                              <div key={op.id} style={{
                                border: `1px solid ${isRefundOperation ? '#fecaca' : '#e5e7eb'}`,
                                borderRadius: 8,
                                padding: 10,
                                background: isRefundOperation ? '#fef2f2' : '#fff',
                                fontSize: 13
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                    background: isRefundOperation ? '#fef2f2' : '#ecfdf5',
                                    color: isRefundOperation ? '#dc2626' : '#059669',
                                    border: `1px solid ${isRefundOperation ? '#fecaca' : '#a7f3d0'}`
                                  }}>
                                    {isRefundOperation ? 'Devolución' : 'Venta'}
                                  </span>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>{formatCurrency(op.total_amount)}</span>
                                </div>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{op.show_title || 'Show'}</div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>
                                  {sessionDateStr}{sessionTimeStr ? ` - ${sessionTimeStr}` : ''} · {(op.payment_method || 'N/A').toUpperCase()} · {op.tickets_count} ticket{op.tickets_count !== 1 ? 's' : ''}
                                </div>
                                {op.customer_name && <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{op.customer_name}</div>}
                                {op.locations && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, wordBreak: 'break-word' }}>{op.locations}</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderSalesSection = () => {
    if (!cashShift) {
      return (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            border: '2px dashed #d1d5db',
            borderRadius: 16,
            background: '#f9fafb'
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>Aperturá la caja para comenzar a vender</div>
          <p style={{ marginTop: 12, color: '#6b7280', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
            Necesitamos registrar el efectivo inicial antes de habilitar el mapa de butacas. Esto garantiza control sobre la recaudación y simplifica el cierre de caja.
          </p>
        </div>
      );
    }

    const pricing = currentSelection.pricing || defaultPricing;

    const handleShowChange = async (showId) => {
      setSelectedShow(showId);
      setSelectedSession(null);
      if (currentSelection.clearSelection) {
        currentSelection.clearSelection();
      }
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
      
      // Load show data to determine venue type
      if (showId) {
        try {
          const res = await apiFetch(`/api/shows/${showId}`);
          if (res.ok) {
            const data = await res.json();
            // Parse pricing_json if it's a string
            if (typeof data.pricing_json === 'string') {
              try {
                data.pricing_json = JSON.parse(data.pricing_json);
              } catch (e) {
                data.pricing_json = {};
              }
            }
            console.log('[Boleteria] Show loaded:', {
              id: data.id,
              title: data.title,
              venue_type: data.venue_type,
              general_capacity: data.general_capacity,
              pricing_json: data.pricing_json
            });
            setSelectedShowData(data);
          }
        } catch (err) {
          console.error('Error loading show data:', err);
        }
      } else {
        setSelectedShowData(null);
      }
    };

    const handleSessionChange = (sessionId) => {
      setSelectedSession(sessionId);
      if (currentSelection.clearSelection) {
        currentSelection.clearSelection();
      }
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    };

    return (
      <div>
        <div style={isWideLayout ? undefined : { padding: '0 8px' }}>
          <BoxOfficeSessionPicker
            isWideLayout={isWideLayout}
            shows={shows}
            sessions={sessions}
            selectedShow={selectedShow}
            selectedSession={selectedSession}
            onSelectShow={handleShowChange}
            onSelectSession={handleSessionChange}
          />
        </div>

        {selectedSession && (
          <div style={isWideLayout ? undefined : { padding: '0 8px' }}>
            <BoxOfficeReferences
              isWideLayout={isWideLayout}
              pricing={pricing}
              formatCurrency={formatCurrency}
            />
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: isWideLayout ? 'row' : 'column',
            alignItems: 'stretch',
            width: '100%',
            gap: 16,
            padding: isWideLayout ? 24 : 0,
            boxSizing: 'border-box',
            overflowX: isWideLayout ? 'visible' : 'hidden'
          }}
        >
          <div
            style={{
              flex: success ? '1 1 100%' : (isWideLayout ? '0 0 75%' : '1 1 auto'),
              maxWidth: '100%',
              minWidth: 0,
              width: '100%'
            }}
          >
            {(() => {
              if (!selectedShowData) {
                return (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <p>Seleccione un espectáculo para continuar...</p>
                  </div>
                );
              }
              
              if (success) {
                return (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    width: '100%',
                    minHeight: '70vh',
                    padding: '24px'
                  }}>
                    <div style={{ maxWidth: '600px', width: '100%' }}>
                      {boxOfficeSidebar}
                    </div>
                  </div>
                );
              }
              
              if (selectedShowData.venue_type === 'sala_principal') {
                return (
                  <SeatSelection
                    showId={selectedShow}
                    sessionId={selectedSession}
                    userId={null}
                    mode="boxoffice"
                    onSelectionChange={handleSelectionChange}
                    sidebarContent={null}
                  />
                );
              } else if (selectedShowData.venue_type === 'el_tablado' || selectedShowData.venue_type === 'las_gemelas') {
                return (
                  <GeneralAdmissionSelection
                    showId={selectedShow}
                    sessionId={selectedSession}
                    userId={null}
                    mode="boxoffice"
                    onSelectionChange={handleSelectionChange}
                    sidebarContent={boxOfficeSidebar}
                    maxCapacity={selectedShowData.general_capacity}
                    ticketPrice={selectedShowData.pricing_json?.general || 0}
                  />
                );
              } else {
                return (
                  <div style={{ padding: 24, textAlign: 'center' }}>
                    <p>Tipo de sala no reconocido: {selectedShowData.venue_type}</p>
                  </div>
                );
              }
            })()}
          </div>

          {/* Only show sidebar for sala_principal when NOT in success state */}
          {!success && boxOfficeSidebar && selectedShowData && selectedShowData.venue_type === 'sala_principal' && (
            <div
              style={{
                flex: isWideLayout ? '0 0 25%' : '1 1 auto',
                maxWidth: isWideLayout ? '25%' : '100%',
                minWidth: 0,
                width: '100%'
              }}
            >
              {boxOfficeSidebar}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Blocking sidebar with block/unblock buttons
  const blockingSidebar = (() => {
    if (!blockingSession) return null;
    
    const totalItems = blockingSelection.selectedSeatIds.size + 
                       blockingSelection.selectedPalcosLabels.size + 
                       (blockingSelection.pullmanSelected > 0 ? 1 : 0);
    const summaryDisabled = totalItems === 0;
    
    return (
      <aside
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 12px 28px rgba(15, 23, 42, 0.08)',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 20, textAlign: 'center' }}>🔒 Gestión de bloqueos</h3>

        {blockingError && (
          <div style={{ marginBottom: 16, padding: 12, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c' }}>
            {blockingError}
          </div>
        )}

        {blockingSuccess && (
          <div style={{ marginBottom: 16, padding: 12, background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534' }}>
            {blockingSuccess}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Ubicaciones seleccionadas</div>
            {summaryDisabled ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Seleccioná butacas o palcos para bloquear o liberar.
              </div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, display: 'grid', gap: 6 }}>
                {Array.from(blockingSelection.selectedSeatIds).map((sid) => (
                  <li key={sid}>{formatSeatLocation(sid, 'butaca')}</li>
                ))}
                {Array.from(blockingSelection.selectedPalcosLabels).map((label) => (
                  <li key={label}>{formatSeatLocation(label, 'palco')}</li>
                ))}
                {blockingSelection.pullmanSelected > 0 && (
                  <li>Pullman/General x {blockingSelection.pullmanSelected}</li>
                )}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              type="button"
              onClick={handleBlockSeats}
              disabled={summaryDisabled || blockingLoading}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: 'none',
                background: summaryDisabled ? '#d1d5db' : '#dc2626',
                color: '#ffffff',
                fontWeight: 600,
                cursor: summaryDisabled ? 'not-allowed' : 'pointer',
                opacity: summaryDisabled ? 0.5 : 1
              }}
            >
              {blockingLoading ? 'Procesando...' : '🔒 Bloquear selección'}
            </button>
            <button
              type="button"
              onClick={handleUnblockSeats}
              disabled={summaryDisabled || blockingLoading}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: '1px solid #16a34a',
                background: summaryDisabled ? '#f3f4f6' : '#dcfce7',
                color: summaryDisabled ? '#9ca3af' : '#166534',
                fontWeight: 600,
                cursor: summaryDisabled ? 'not-allowed' : 'pointer',
                opacity: summaryDisabled ? 0.5 : 1
              }}
            >
              {blockingLoading ? 'Procesando...' : '🔓 Liberar selección'}
            </button>
          </div>

          {/* Pullman blocking section */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Pullman completo (92 ubicaciones)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={handleBlockPullman}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: !blockingSession ? '#d1d5db' : '#7c3aed',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔒 Bloquear Pullman'}
              </button>
              <button
                type="button"
                onClick={handleUnblockPullman}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #7c3aed',
                  background: !blockingSession ? '#f3f4f6' : '#f3e8ff',
                  color: !blockingSession ? '#9ca3af' : '#6b21a8',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔓 Liberar Pullman'}
              </button>
            </div>
          </div>

          {/* Bloqueo masivo de filas */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Bloquear filas completas</div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: 4,
              marginBottom: 12
            }}>
              {getAllRows().map(row => (
                <button
                  key={row}
                  type="button"
                  onClick={() => toggleRowSelection(row)}
                  disabled={blockingLoading}
                  style={{
                    padding: '6px 4px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: selectedRows.has(row) ? '#2563eb' : '#d1d5db',
                    background: selectedRows.has(row) ? '#2563eb' : '#ffffff',
                    color: selectedRows.has(row) ? '#ffffff' : '#374151',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: blockingLoading ? 'not-allowed' : 'pointer',
                    opacity: blockingLoading ? 0.5 : 1
                  }}
                >
                  {row}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={handleBlockRows}
                disabled={!blockingSession || blockingLoading || selectedRows.size === 0}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: !blockingSession || selectedRows.size === 0 ? '#d1d5db' : '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession || selectedRows.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession || selectedRows.size === 0 ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : `🔒 Bloquear fila(s) (${selectedRows.size})`}
              </button>
              <button
                type="button"
                onClick={handleUnblockRows}
                disabled={!blockingSession || blockingLoading || selectedRows.size === 0}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #16a34a',
                  background: !blockingSession || selectedRows.size === 0 ? '#f3f4f6' : '#dcfce7',
                  color: !blockingSession || selectedRows.size === 0 ? '#9ca3af' : '#166534',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession || selectedRows.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession || selectedRows.size === 0 ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : `🔓 Liberar fila(s) (${selectedRows.size})`}
              </button>
            </div>
          </div>

          {/* Bloqueo masivo de palcos */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Bloquear palcos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={handleBlockPalcosBajos}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: !blockingSession ? '#d1d5db' : '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔒 Bloquear Palcos Bajos'}
              </button>
              <button
                type="button"
                onClick={handleUnblockPalcosBajos}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #16a34a',
                  background: !blockingSession ? '#f3f4f6' : '#dcfce7',
                  color: !blockingSession ? '#9ca3af' : '#166534',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔓 Liberar Palcos Bajos'}
              </button>
              <div style={{ height: 8 }} />
              <button
                type="button"
                onClick={handleBlockPalcosAltos}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: !blockingSession ? '#d1d5db' : '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔒 Bloquear Palcos Altos'}
              </button>
              <button
                type="button"
                onClick={handleUnblockPalcosAltos}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #16a34a',
                  background: !blockingSession ? '#f3f4f6' : '#dcfce7',
                  color: !blockingSession ? '#9ca3af' : '#166534',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔓 Liberar Palcos Altos'}
              </button>
            </div>
          </div>

          {/* Bloqueo masivo de zonas PB */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
            <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 14 }}>Bloquear zonas PB</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
              Izq: impares ≥9 | Centro: 1-8 | Der: pares ≥10
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => handleBlockPBZone('izquierda')}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: !blockingSession ? '#d1d5db' : '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔒 PB Izquierda'}
              </button>
              <button
                type="button"
                onClick={() => handleUnblockPBZone('izquierda')}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #16a34a',
                  background: !blockingSession ? '#f3f4f6' : '#dcfce7',
                  color: !blockingSession ? '#9ca3af' : '#166534',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔓 PB Izquierda'}
              </button>
              <div style={{ height: 4 }} />
              <button
                type="button"
                onClick={() => handleBlockPBZone('centro')}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: !blockingSession ? '#d1d5db' : '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔒 PB Centro'}
              </button>
              <button
                type="button"
                onClick={() => handleUnblockPBZone('centro')}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #16a34a',
                  background: !blockingSession ? '#f3f4f6' : '#dcfce7',
                  color: !blockingSession ? '#9ca3af' : '#166534',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔓 PB Centro'}
              </button>
              <div style={{ height: 4 }} />
              <button
                type="button"
                onClick={() => handleBlockPBZone('derecha')}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: 'none',
                  background: !blockingSession ? '#d1d5db' : '#dc2626',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔒 PB Derecha'}
              </button>
              <button
                type="button"
                onClick={() => handleUnblockPBZone('derecha')}
                disabled={!blockingSession || blockingLoading}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #16a34a',
                  background: !blockingSession ? '#f3f4f6' : '#dcfce7',
                  color: !blockingSession ? '#9ca3af' : '#166534',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: !blockingSession ? 'not-allowed' : 'pointer',
                  opacity: !blockingSession ? 0.5 : 1
                }}
              >
                {blockingLoading ? 'Procesando...' : '🔓 PB Derecha'}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            <strong>Bloquear:</strong> Las ubicaciones aparecerán como vendidas para el público.<br/>
            <strong>Liberar:</strong> Las ubicaciones volverán a estar disponibles.
          </div>
        </div>
      </aside>
    );
  })();

  // Load show data when blocking show is selected
  useEffect(() => {
    if (!blockingShow) {
      setBlockingShowData(null);
      return;
    }
    const showObj = shows.find(s => s.id === blockingShow);
    setBlockingShowData(showObj || null);
  }, [blockingShow, shows]);

  // Render blocking section (similar to sales but with blocking controls)
  const renderBlockingSection = () => {
    return (
      <div style={{ padding: isWideLayout ? 0 : '0 16px' }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 600 }}>🔒 Bloqueo de ubicaciones</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Seleccioná un espectáculo y función para gestionar bloqueos. Las ubicaciones bloqueadas aparecerán como vendidas para el público.
          </p>
        </div>

        <BoxOfficeSessionPicker
          shows={shows}
          sessions={blockingSessions}
          selectedShow={blockingShow}
          selectedSession={blockingSession}
          onSelectShow={(showId) => {
            setBlockingShow(showId);
            setBlockingSession(null);
            setBlockingError('');
            setBlockingSuccess('');
          }}
          onSelectSession={(sessionId) => {
            setBlockingSession(sessionId);
            setBlockingError('');
            setBlockingSuccess('');
          }}
        />

        {!blockingSession && (
          <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
            Seleccioná un espectáculo y función para gestionar bloqueos.
          </div>
        )}

        {blockingSession && blockingShowData && (
          <div
            style={{
              display: 'flex',
              flexDirection: isWideLayout ? 'row' : 'column',
              gap: 24,
              marginTop: 24
            }}
          >
            {/* Seat selection grid */}
            <div
              style={{
                flex: isWideLayout ? '1 1 75%' : '1 1 auto',
                maxWidth: isWideLayout ? '75%' : '100%',
                minWidth: 0,
                overflow: 'hidden'
              }}
            >
              {blockingShowData.venue_type === 'sala_principal' ? (
                <SeatSelection
                  showId={blockingShow}
                  sessionId={blockingSession}
                  userId={null}
                  mode="blocking"
                  onSelectionChange={handleBlockingSelectionChange}
                  sidebarContent={null}
                />
              ) : (
                <GeneralAdmissionSelection
                  showId={blockingShow}
                  sessionId={blockingSession}
                  userId={null}
                  mode="blocking"
                  onSelectionChange={handleBlockingSelectionChange}
                  sidebarContent={blockingSidebar}
                  maxCapacity={blockingShowData.general_capacity}
                  ticketPrice={blockingShowData.pricing_json?.general || 0}
                />
              )}
            </div>

            {/* Blocking sidebar - only for sala_principal */}
            {blockingShowData.venue_type === 'sala_principal' && (
              <div
                style={{
                  flex: isWideLayout ? '0 0 25%' : '1 1 auto',
                  maxWidth: isWideLayout ? '25%' : '100%',
                  minWidth: 0,
                  width: '100%'
                }}
              >
                {blockingSidebar}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderDisabilityQuotaSection = () => {
    const loadData = async () => {
      setDisabilityQuotaLoading(true);
      setDisabilityQuotaError('');
      try {
        const res = await apiAuthFetch('/api/discounts/disability-quota', {}, token);
        if (!res.ok) throw new Error('Error al cargar datos');
        const data = await res.json();
        setDisabilityQuota(data);
      } catch (err) {
        setDisabilityQuotaError('No se pudo cargar el cupo discapacidad.');
      } finally {
        setDisabilityQuotaLoading(false);
      }
    };

    if (!disabilityQuota && !disabilityQuotaLoading && !disabilityQuotaError) {
      loadData();
    }

    return (
      <div style={{ padding: isWideLayout ? 0 : '0 8px' }}>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 600 }}>♿ Cupo Discapacidad</h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
              Localidades adquiridas con el cupón <strong>CUPO-DISCAPACIDAD</strong> por función.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setDisabilityQuota(null); setDisabilityQuotaError(''); }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: '#ffffff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13
            }}
          >
            ↺ Actualizar
          </button>
        </div>

        {disabilityQuotaLoading && (
          <div style={{ color: '#6b7280', padding: '24px 0', textAlign: 'center' }}>Cargando...</div>
        )}

        {disabilityQuotaError && (
          <div style={{ padding: 12, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c' }}>
            {disabilityQuotaError}
          </div>
        )}

        {disabilityQuota && !disabilityQuotaLoading && (
          <>
            {!disabilityQuota.discount_exists && (
              <div style={{ padding: 12, background: '#fef9c3', border: '1px solid #fde047', borderRadius: 8, color: '#854d0e', marginBottom: 12 }}>
                El cupón <strong>CUPO-DISCAPACIDAD</strong> no existe en el sistema. Crealo desde el panel de administración.
              </div>
            )}

            {disabilityQuota.results.length === 0 ? (
              <p style={{ color: '#9ca3af' }}>No hay funciones próximas programadas.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Espectáculo</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>Fecha y hora</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#374151' }}>Localidades c/ cupo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disabilityQuota.results.map((row) => (
                      <tr
                        key={row.session_id}
                        style={{ borderBottom: '1px solid #f3f4f6' }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{row.show_title}</td>
                        <td style={{ padding: '10px 12px', color: '#374151' }}>
                          {formatDate(row.starts_at)}
                          <span style={{ color: '#9ca3af', marginLeft: 6 }}>{formatTime(row.starts_at)}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            minWidth: 36,
                            padding: '2px 12px',
                            borderRadius: 999,
                            fontWeight: 700,
                            fontSize: 15,
                            background: row.ticket_count > 0 ? '#ede9fe' : '#f3f4f6',
                            color: row.ticket_count > 0 ? '#7c3aed' : '#9ca3af',
                            border: `1px solid ${row.ticket_count > 0 ? '#c4b5fd' : '#e5e7eb'}`
                          }}>
                            {row.ticket_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const actionButtons = [
    { key: 'open', label: 'Estado de caja', icon: '' },
    { key: 'history', label: 'Ver cierres', icon: '' }
  ];

  if (cashShift) {
    actionButtons.push({ key: 'sales', label: 'Vender', icon: '' });
  }

  // Add "Bloqueos" button only for admin users
  if (hasRole('admin')) {
    actionButtons.push({ key: 'blocking', label: 'Bloqueos', icon: '🔒' });
  }

  // Add "Cupo discapacidad" for admin and boleteria
  if (hasRole('admin', 'boleteria')) {
    actionButtons.push({ key: 'disability', label: 'Cupo discapacidad', icon: '♿' });
  }

  const renderActionButtons = () => (
    <div
      style={{
        display: 'flex',
        gap: !isWideLayout ? 6 : 12,
        flexWrap: 'nowrap'
      }}
    >
      {actionButtons.map((action) => {
        const isActive = activeSection === action.key;
        const isDisabled = action.key === 'sales' && !cashShift;
        return (
          <button
            key={action.key}
            type="button"
            onClick={() => { if (!isDisabled) { setActiveSection(action.key); window.scrollTo({ top: 0, behavior: 'smooth' }); } }}
            style={{
              padding: !isWideLayout ? '4px 6px' : '10px 18px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: isActive ? '#2563eb' : '#d1d5db',
              background: isActive ? '#2563eb' : '#ffffff',
              color: isActive ? '#ffffff' : '#1f2937',
              fontWeight: 600,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: !isWideLayout ? 4 : 8,
              fontSize: !isWideLayout ? '11px' : '16px'
            }}
          >
            <span>{action.icon}</span>
            {action.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '100vw',
        padding: !isWideLayout ? '0 4px 24px' : '0 5px 24px',
        boxSizing: 'border-box',
        margin: 0,
        overflowX: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: !isWideLayout ? 8 : 16,
          margin: '24px 0 20px'
        }}
      >
        {renderActionButtons()}
      </div>

      {cashError && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          color: '#b91c1c'
        }}>
          {cashError}
        </div>
      )}

      {cashSuccess && (
        <div style={{
          marginBottom: 16,
          padding: '12px 16px',
          background: '#dcfce7',
          border: '1px solid #bbf7d0',
          borderRadius: 8,
          color: '#166534'
        }}>
          {cashSuccess}
        </div>
      )}

      <section style={{
        padding: isWideLayout ? 24 : '16px 8px',
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)',
        overflowX: 'hidden',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {activeSection === 'open' && renderOpenSection()}
        {activeSection === 'history' && renderHistorySection()}
        {activeSection === 'sales' && renderSalesSection()}
        {activeSection === 'blocking' && renderBlockingSection()}
        {activeSection === 'disability' && renderDisabilityQuotaSection()}
      </section>

      {showSaleModal && (
        <div
          onClick={handleCloseSaleModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 2100,
            padding: '24px 12px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 640,
              background: '#ffffff',
              borderRadius: 16,
              padding: '20px 16px',
              boxShadow: '0 25px 60px -12px rgba(30,41,59,0.35)',
              position: 'relative',
              marginTop: 24,
              marginBottom: 24
            }}
          >
            <button
              type="button"
              onClick={handleCloseSaleModal}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                fontSize: 22,
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ×
            </button>
            <h2 style={{ marginTop: 0, marginBottom: 12 }}>Datos del espectador</h2>
            <p style={{ marginTop: 0, marginBottom: 20, color: '#6b7280', fontSize: 14 }}>
              Podés buscar un cliente existente o completar los datos manualmente para asociar la venta.
            </p>

            <form onSubmit={handleConfirmSale} style={{ display: 'grid', gap: 16 }}>
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                   Buscar cliente existente
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSearchResults(true);
                  }}
                  placeholder="Nombre, email o DNI"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                    boxSizing: 'border-box'
                  }}
                />
                {showSearchResults && searchResults.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)',
                    maxHeight: 220,
                    overflowY: 'auto',
                    zIndex: 10
                  }}>
                    {searchResults.map((customer) => (
                      <div
                        key={customer.id}
                        onClick={() => selectCustomer(customer)}
                        style={{
                          padding: 12,
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{customer.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                          {customer.email && <div> {customer.email}</div>}
                          {customer.dni && <div> DNI: {customer.dni}</div>}
                          {customer.phone && <div>{customer.phone}</div>}
                          {customer.is_registered === false && (
                            <div style={{ color: '#f59e0b', fontStyle: 'italic', marginTop: 4 }}>
                              cliente no registrado en el sitio
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchQuery && searchResults.length === 0 && showSearchResults && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    color: '#6b7280'
                  }}>
                    No se encontraron coincidencias
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ fontSize: 13, color: '#6b7280' }}>O completá los datos manualmente:</label>
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: isWideLayout ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Nombre *</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nombre y apellido"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        boxSizing: 'border-box',
                        fontSize: 16
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Email</label>
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="email@ejemplo.com"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        boxSizing: 'border-box',
                        fontSize: 16
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Teléfono</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Ej: 2994551234"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        boxSizing: 'border-box',
                        fontSize: 16
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>DNI</label>
                    <input
                      type="text"
                      value={customerDni}
                      onChange={(e) => setCustomerDni(e.target.value.replace(/\D/g, ''))}
                      placeholder="Sin puntos"
                      maxLength={8}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #d1d5db',
                        boxSizing: 'border-box',
                        fontSize: 16
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Método de pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: 16,
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="cash">Efectivo</option>
                  <option value="qr">QR</option>
                </select>
              </div>

              <div>
                {!appliedDiscount ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontWeight: 600, fontSize: 13, width: isWideLayout ? 'auto' : '100%' }}>Cupón de descuento:</label>
                    <input
                      type="text"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="CÓDIGO"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        textTransform: 'uppercase',
                        boxSizing: 'border-box',
                        fontSize: 16
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyDiscount}
                      disabled={!discountCode.trim() || validatingDiscount}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: discountCode.trim() ? '#16a34a' : '#d1d5db',
                        color: '#ffffff',
                        fontWeight: 600,
                        cursor: discountCode.trim() ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {validatingDiscount ? '...' : 'Aplicar'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#d1fae5', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#047857' }}> {appliedDiscount?.alias || discountCode}</div>
                      <div style={{ fontSize: 12, color: '#059669' }}>
                        Cupón aplicado
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveDiscount}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#047857',
                        cursor: 'pointer',
                        fontSize: 18
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                {discountError && (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#b91c1c' }}>{discountError}</div>
                )}
              </div>

              {error && (
                <div style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  onClick={handleCloseSaleModal}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    background: '#f3f4f6',
                    color: '#374151',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: loading ? '#9ca3af' : '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Procesando...' : `Confirmar venta ($${total.toLocaleString('es-AR')})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQuickSaleModal && (
        <div
          onClick={handleCloseQuickSaleModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 2100,
            padding: '24px 12px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              background: '#ffffff',
              borderRadius: 16,
              padding: '20px 16px',
              boxShadow: '0 25px 60px -12px rgba(30,41,59,0.35)',
              position: 'relative',
              marginTop: 24,
              marginBottom: 24
            }}
          >
            <button
              type="button"
              onClick={handleCloseQuickSaleModal}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                fontSize: 22,
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ×
            </button>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Venta en función</h2>
            <p style={{ marginTop: 0, marginBottom: 20, color: '#6b7280', fontSize: 14 }}>
              Venta rápida sin datos del espectador. Podés ingresar un teléfono para enviar las entradas por WhatsApp.
            </p>

            <form onSubmit={handleConfirmQuickSale} style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Teléfono (opcional)</label>
                <input
                  type="tel"
                  value={quickSalePhone}
                  onChange={(e) => setQuickSalePhone(e.target.value)}
                  placeholder="Ej: 2924551234"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 16,
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  Si ingresás un teléfono, podrás enviar las entradas por WhatsApp luego de confirmar.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Método de pago</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: 16,
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="cash">Efectivo</option>
                  <option value="qr">QR</option>
                </select>
              </div>

              <div>
                {!appliedDiscount ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>Cupón:</label>
                    <input
                      type="text"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="CÓDIGO"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        textTransform: 'uppercase',
                        boxSizing: 'border-box',
                        fontSize: 16
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyDiscount}
                      disabled={!discountCode.trim() || validatingDiscount}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: discountCode.trim() ? '#16a34a' : '#d1d5db',
                        color: '#ffffff',
                        fontWeight: 600,
                        cursor: discountCode.trim() ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {validatingDiscount ? '...' : 'Aplicar'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#d1fae5', borderRadius: 8, border: '1px solid #a7f3d0' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#047857' }}> {appliedDiscount?.alias || discountCode}</div>
                      <div style={{ fontSize: 12, color: '#059669' }}>
                        Cupón aplicado
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveDiscount}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#047857',
                        cursor: 'pointer',
                        fontSize: 18
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
                {discountError && (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#b91c1c' }}>{discountError}</div>
                )}
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: '#f8fafc',
                  display: 'grid',
                  gap: 8,
                  fontSize: 15
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal entradas</span>
                  <span>${subtotal.toLocaleString('es-AR')}</span>
                </div>
                {discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 600 }}>
                    <span>Descuento</span>
                    <span>-${discountAmount.toLocaleString('es-AR')}</span>
                  </div>
                )}
                {servicesSubtotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1e40af' }}>
                    <span>Servicios</span>
                    <span>${servicesSubtotal.toLocaleString('es-AR')}</span>
                  </div>
                )}
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 8,
                    borderTop: '2px solid #1f2937',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    fontSize: 20
                  }}
                >
                  <span>Total</span>
                  <span>${total.toLocaleString('es-AR')}</span>
                </div>
              </div>

              {error && (
                <div style={{
                  padding: 12,
                  borderRadius: 8,
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  onClick={handleCloseQuickSaleModal}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: '1px solid #d1d5db',
                    background: '#f3f4f6',
                    color: '#374151',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 10,
                    border: 'none',
                    background: loading ? '#9ca3af' : '#2563eb',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Procesando...' : `Confirmar venta ($${total.toLocaleString('es-AR')})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCloseModal && cashShift && (
        <div
          onClick={() => setShowCloseModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 24,
            overflowY: 'auto'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: isWideLayout ? '70vw' : '100%',
              background: '#ffffff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 25px 50px -12px rgba(30,41,59,0.35)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              marginTop: 32,
              marginBottom: 32
            }}
          >
            <button
              onClick={() => setShowCloseModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'none',
                border: 'none',
                fontSize: 22,
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ×
            </button>
            <h3 style={{ marginTop: 0, fontSize: 24, textAlign: 'center' }}>Cierre de caja</h3>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Contá el efectivo por denominación y registrá las observaciones finales si corresponde.</p>
            
            {/* Resumen informativo de QR */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: isWideLayout ? 24 : 12,
              padding: '12px 16px',
              background: '#f3f4f6',
              borderRadius: 10,
              marginBottom: 8,
              flexWrap: 'wrap'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Efectivo esperado</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>
                  {formatCurrency(cashShift.summary?.expected_cash || cashShift.opening_total_cash || 0)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Operado con QR</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#7c3aed' }}>
                  {formatCurrency(cashOperations.filter(op => op.payment_method === 'qr').reduce((sum, op) => sum + Number(op.total_amount || 0), 0))}
                </div>
              </div>
            </div>
            
            <form onSubmit={handleCloseShift} style={{ marginTop: 16, display: 'grid', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 16
                }}
              >
                {DENOMINATIONS.map((item) => (
                  <label
                    key={item.key}
                    style={{
                      width: isWideLayout ? 240 : 'calc(50% - 8px)',
                      minWidth: 0,
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      padding: 12,
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 10,
                      boxSizing: 'border-box'
                    }}
                  >
                    {item.img && (
                      <img
                        src={item.img}
                        alt={item.label}
                        style={{ width: '100%', height: 'auto', objectFit: 'contain', borderRadius: 4 }}
                      />
                    )}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={closingForm[item.key]}
                      onChange={(e) =>
                        setClosingForm((prev) => ({ ...prev, [item.key]: e.target.value }))
                      }
                      placeholder="Cantidad"
                      style={{
                        width: '100%',
                        padding: '12px 10px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        fontSize: 16,
                        textAlign: 'center',
                        boxSizing: 'border-box'
                      }}
                    />
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <label
                  style={{
                    fontSize: 14,
                    color: '#374151',
                    width: isWideLayout ? '50%' : '100%'
                  }}
                >
                  Observaciones finales (opcional)
                  <textarea
                    value={closingForm.closing_note}
                    onChange={(e) => setClosingForm((prev) => ({ ...prev, closing_note: e.target.value }))}
                    placeholder="Observaciones finales"
                    rows={2}
                    style={{
                      marginTop: 6,
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      boxSizing: 'border-box',
                      fontSize: 16
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', flexDirection: isWideLayout ? 'row' : 'column', justifyContent: 'space-between', alignItems: isWideLayout ? 'center' : 'stretch', gap: 12 }}>
                <div>
                  {(() => {
                    const totalBills = calculateBillTotal(closingForm);
                    const summary = cashShift?.summary || {};
                    let expected = 0;
                    if (typeof summary.expected_cash === 'number') {
                      expected = summary.expected_cash;
                    } else {
                      const opening = summary.opening_total_cash || cashShift?.opening_total_cash || 0;
                      const cashSales = summary.cash_sales_total || 0;
                      const adjustments = summary.adjustments_amount || 0;
                      expected = opening + cashSales + adjustments;
                    }
                    const difference = totalBills - expected;
                    let diffColor = '#1d4ed8';
                    if (difference < 0) diffColor = '#b91c1c';
                    else if (difference > 0) diffColor = '#15803d';

                    return (
                      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                        Total: <strong>{formatCurrency(totalBills)}</strong><br />
                        Esperado: <strong>{formatCurrency(expected)}</strong><br />
                        Diferencia:{' '}
                        <strong style={{ color: diffColor }}>{formatCurrency(difference)}</strong>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setShowCloseModal(false)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      background: '#f3f4f6',
                      color: '#374151',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Confirmar cierre
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {showTicketsModal && ticketsModalSale && (
        <TicketViewModal
          sale={ticketsModalSale}
          tickets={ticketsModalItems}
          onClose={() => {
            setShowTicketsModal(false);
            setTicketsModalSale(null);
            setTicketsModalItems([]);
          }}
        />
      )}
    </div>
  );
}
