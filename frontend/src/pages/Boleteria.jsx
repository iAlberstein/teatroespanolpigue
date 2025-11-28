import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiAuthFetch } from '../lib/api';
import SeatSelection from '../components/SeatSelection';
import BoxOfficeSessionPicker from '../components/BoxOfficeSessionPicker';
import BoxOfficeReferences from '../components/BoxOfficeReferences';
import TicketViewModal from '../components/admin/TicketViewModal.jsx';
import { formatSeatLocation } from '../lib/seatFormatter';
import billete20000 from '../../media/images/billetes/billete20000.png';
import billete10000 from '../../media/images/billetes/billete10000.png';
import billete2000 from '../../media/images/billetes/billete2000.png';
import billete1000 from '../../media/images/billetes/billete1000.png';
import billete500 from '../../media/images/billetes/billete500.png';

export default function BoxOffice() {
  const { token, user } = useAuth();
  const DENOMINATIONS = [
    { key: 'bill20000', label: '$20.000', value: 20000, img: billete20000 },
    { key: 'bill10000', label: '$10.000', value: 10000, img: billete10000 },
    { key: 'bill2000', label: '$2.000', value: 2000, img: billete2000 },
    { key: 'bill1000', label: '$1.000', value: 1000, img: billete1000 },
    { key: 'bill500', label: '$500', value: 500, img: billete500 }
  ];
  const defaultPricing = {
    platea_general: 5000,
    palcos_bajos: 10000,
    palcos_altos: 8000,
    pullman: 3000
  };
  const [shows, setShows] = useState([]);
  const [selectedShow, setSelectedShow] = useState(null);
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
  
  // Customer search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

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
        console.log('[BOLETERIA] Fetching shows from /api/shows');
        const res = await apiFetch('/api/shows');
        if (res.ok) {
          const data = await res.json();
          console.log('[BOLETERIA] Shows loaded:', data);
          setShows(data);
        } else {
          console.error('[BOLETERIA] Failed to load shows:', res.status);
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
        const d = new Date(operation.session_date);
        sessionDateStr = d.toLocaleDateString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        sessionTimeStr = d.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
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
    
    setValidatingDiscount(true);
    setDiscountError('');
    
    try {
      const res = await apiFetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: discountCode.trim(),
          show_id: selectedShow 
        })
      });
      
      if (res.ok) {
        const discount = await res.json();
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
      pricing: payload?.pricing || prev?.pricing || defaultPricing
    }));
  };

  const calculateTotal = () => {
    const pricing = currentSelection.pricing || defaultPricing;
    
    const seatsTotal = currentSelection.selectedSeatIds.size * Number(pricing.platea_general || 5000);
    
    // Calculate palcos price based on label (PB vs PA)
    let palcosTotal = 0;
    for (const palco of currentSelection.selectedPalcosLabels) {
      const isPB = /^PB/i.test(palco);
      const price = isPB ? Number(pricing.palcos_bajos || 10000) : Number(pricing.palcos_altos || 8000);
      palcosTotal += price;
    }
    
    const pullmanTotal = currentSelection.pullmanSelected * Number(pricing.pullman || 3000);
    const subtotal = seatsTotal + palcosTotal + pullmanTotal;
    
    // Apply discount
    let discountAmount = 0;
    let total = subtotal;
    
    if (appliedDiscount && subtotal > 0) {
      if (appliedDiscount.type === 'percentage') {
        discountAmount = Math.round(subtotal * (appliedDiscount.value / 100));
      } else if (appliedDiscount.type === 'fixed') {
        discountAmount = Math.round(appliedDiscount.value);
      }
      discountAmount = Math.min(discountAmount, subtotal);
      total = subtotal - discountAmount;
    }
    
    return { subtotal, discountAmount, total };
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
      
      // Add seats
      for (const seatId of currentSelection.selectedSeatIds) {
        items.push({
          type: 'butaca',
          seat_code: seatId,
          price: Number(pricing.platea_general || 5000)
        });
      }
      
      // Add palcos
      for (const palco of currentSelection.selectedPalcosLabels) {
        const isPB = /^PB/i.test(palco);
        const price = isPB ? Number(pricing.palcos_bajos || 10000) : Number(pricing.palcos_altos || 8000);
        items.push({
          type: 'palco',
          seat_code: palco,
          price
        });
      }
      
      // Add pullman
      if (currentSelection.pullmanSelected > 0) {
        items.push({
          type: 'pullman',
          quantity: currentSelection.pullmanSelected,
          price: Number(pricing.pullman || 3000)
        });
      }

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
          discount_id: appliedDiscount?.id || null
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
  const { subtotal, discountAmount, total } = calculateTotal();
  
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

  const handleFinalizeSale = () => {
    handleCancelSale();
    setSelectedShow(null);
    setSelectedSession(null);
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

Recordá llegar al menos 30 minutos antes de la función.

Teatro Español Pigüé`;

    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
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
              <div style={{ fontSize: 20, fontWeight: 700, color: '#047857' }}>✅ Venta exitosa</div>
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
                  <div style={{ fontWeight: 600 }}>🎟️ Descuento aplicado: {success.discount.code}</div>
                  <div style={{ fontSize: 13 }}>
                    -${Number(success.discount.amount || 0).toLocaleString('es-AR')}
                    {success.discount.type === 'percentage' && ` (${success.discount.value}%)`}
                  </div>
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
              {tickets.length > 0 && (
                <div>
                  <strong>Entradas ({tickets.length}):</strong>
                  <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 14, display: 'grid', gap: 6 }}>
                    {tickets.map((ticket) => (
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
                📱 Enviar por WhatsApp
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
                🖨️ Imprimir tickets
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
              flex: '1 1 360px',
              maxWidth: 440,
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
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, display: 'grid', gap: 6 }}>
                  {Array.from(currentSelection.selectedSeatIds).map((sid) => (
                    <li key={sid}>{formatSeatLocation(sid, 'butaca')}</li>
                  ))}
                  {Array.from(currentSelection.selectedPalcosLabels).map((label) => (
                    <li key={label}>{formatSeatLocation(label, 'palco')}</li>
                  ))}
                  {currentSelection.pullmanSelected > 0 && <li>Pullman x {currentSelection.pullmanSelected}</li>}
                </ul>
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
                <span>Subtotal</span>
                <span>${subtotal.toLocaleString('es-AR')}</span>
              </div>
              {discountAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 600 }}>
                  <span>Descuento</span>
                  <span>-${discountAmount.toLocaleString('es-AR')}</span>
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
              flex: '0 1 260px',
              maxWidth: 300,
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
            padding: 16,
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            background: '#f9fafb'
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
              <div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Estado</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#059669' }}>Caja abierta</div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Apertura</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1f2937' }}>
                  {(() => {
                    if (!cashShift.opened_at) return '';
                    const d = new Date(cashShift.opened_at);
                    const dateStr = d.toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    });
                    const timeStr = d.toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
                    });
                    return `${dateStr} - ${timeStr}`;
                  })()}
                </div>
              </div>
              <div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>Dinero en caja</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
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
              <button
                onClick={() => setShowCloseModal(true)}
                style={{
                  marginLeft: 'auto',
                  padding: '10px 18px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                🔐 Cerrar caja
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
              <h3 style={{ margin: 0, fontSize: 16 }}>📊 Detalle de ventas de esta caja</h3>
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
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
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
                      const sessionDate = op.session_date ? new Date(op.session_date) : null;
                      const sessionDateStr = sessionDate
                        ? sessionDate.toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit'
                          })
                        : '-';
                      const sessionTimeStr = sessionDate
                        ? sessionDate.toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          })
                        : '';

                      const isRefunded = op.refunded || false;
                      const isRefundOperation = op.is_refund_operation || false;
                      const isRefundedOriginal = isRefunded && !isRefundOperation;
                      const showDetailButton = isRefundOperation;

                      return (
                        <tr key={op.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
                  width: 240,
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
                    fontSize: 14,
                    textAlign: 'center'
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
                  border: '1px solid #d1d5db'
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
              ✅ Abrir caja
            </button>
          </div>
        </form>
      </div>
    );
  };

  const renderHistorySection = () => {
    return (
      <div>
        <h3 style={{ marginBottom: 12, fontSize: 18 }}>📚 Últimos cierres</h3>
        {cashHistory.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>Todavía no registraste cierres de caja.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {cashHistory.map((shift) => (
              <div
                key={shift.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 16,
                  background: '#ffffff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{shift.cashier?.name || 'Boletería'}</strong>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>
                      Apertura: {new Date(shift.opened_at).toLocaleString('es-AR')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>Estado: {shift.status === 'closed' ? 'Cerrada' : 'Abierta'}</div>
                    {shift.closed_at ? (
                      <div style={{ fontSize: 13, color: '#6b7280' }}>Cierre: {new Date(shift.closed_at).toLocaleString('es-AR')}</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14 }}>
                  <span>💵 Apertura: <strong>{formatCurrency(shift.summary?.opening_total_cash)}</strong></span>
                  <span>💰 Ventas efectivo: <strong>{formatCurrency(shift.summary?.cash_sales_total)}</strong></span>
                  <span>📊 Diferencia: <strong>{formatCurrency(shift.summary?.discrepancy_amount)}</strong></span>
                </div>
                {shift.closing_note ? (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Nota cierre: {shift.closing_note}
                  </div>
                ) : null}
              </div>
            ))}
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

    const handleShowChange = (showId) => {
      setSelectedShow(showId);
      setSelectedSession(null);
      if (currentSelection.clearSelection) {
        currentSelection.clearSelection();
      }
    };

    const handleSessionChange = (sessionId) => {
      setSelectedSession(sessionId);
      if (currentSelection.clearSelection) {
        currentSelection.clearSelection();
      }
    };

    return (
      <div>
        <div style={isWideLayout ? undefined : { padding: '0 24px' }}>
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
          <div style={isWideLayout ? undefined : { padding: '0 24px' }}>
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
              flex: isWideLayout ? '0 0 75%' : '1 1 auto',
              maxWidth: '100%',
              minWidth: 0,
              width: '100%'
            }}
          >
            <SeatSelection
              showId={selectedShow}
              sessionId={selectedSession}
              userId={null}
              mode="boxoffice"
              onSelectionChange={handleSelectionChange}
              sidebarContent={null}
            />
          </div>

          {boxOfficeSidebar && (
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


  const actionButtons = [
    { key: 'open', label: 'Estado de caja', icon: '🧾' },
    { key: 'history', label: 'Ver cierres', icon: '📚' }
  ];

  if (cashShift) {
    actionButtons.push({ key: 'sales', label: 'Vender', icon: '🎟️' });
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
            onClick={() => !isDisabled && setActiveSection(action.key)}
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
        padding: !isWideLayout ? '0 0 24px' : '0 5px 24px',
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
        padding: isWideLayout ? 24 : '24px 0',
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.05)'
      }}>
        {activeSection === 'open' && renderOpenSection()}
        {activeSection === 'history' && renderHistorySection()}
        {activeSection === 'sales' && renderSalesSection()}
      </section>

      {showSaleModal && (
        <div
          onClick={handleCloseSaleModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2100,
            padding: 24
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 640,
              background: '#ffffff',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 25px 60px -12px rgba(30,41,59,0.35)',
              position: 'relative'
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
                  🔍 Buscar cliente existente
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
                    fontSize: 14
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
                          {customer.email && <div>📧 {customer.email}</div>}
                          {customer.dni && <div>🆔 DNI: {customer.dni}</div>}
                          {customer.phone && <div>📱 {customer.phone}</div>}
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
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
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
                        border: '1px solid #d1d5db'
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
                        border: '1px solid #d1d5db'
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
                        border: '1px solid #d1d5db'
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
                        border: '1px solid #d1d5db'
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
                    fontSize: 15,
                    borderRadius: 8,
                    border: '1px solid #d1d5db'
                  }}
                >
                  <option value="cash">Efectivo</option>
                  <option value="card">Tarjeta</option>
                  <option value="transfer">Transferencia</option>
                  <option value="qr">QR</option>
                  <option value="mp">Mercado Pago</option>
                </select>
              </div>

              <div>
                {!appliedDiscount ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <label style={{ fontWeight: 600, fontSize: 13 }}>Cupón de descuento:</label>
                    <input
                      type="text"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      placeholder="CÓDIGO"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        textTransform: 'uppercase'
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
                      <div style={{ fontWeight: 600, color: '#047857' }}>🎫 {discountCode}</div>
                      <div style={{ fontSize: 12, color: '#059669' }}>
                        {appliedDiscount.type === 'percentage' ? `${appliedDiscount.value}%` : `$${appliedDiscount.value}`} descuento aplicado
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
                      width: 240,
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
                        fontSize: 14,
                        textAlign: 'center'
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
                      border: '1px solid #d1d5db'
                    }}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                    let diffColor = '#1d4ed8'; // azul por defecto (0)
                    if (difference < 0) diffColor = '#b91c1c'; // rojo
                    else if (difference > 0) diffColor = '#15803d'; // verde

                    return (
                      <div style={{ fontSize: 13, color: '#6b7280' }}>
                        Total: <strong>{formatCurrency(totalBills)}</strong>{' '}
                        | Esperado: <strong>{formatCurrency(expected)}</strong>{' '}
                        | Diferencia:{' '}
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
