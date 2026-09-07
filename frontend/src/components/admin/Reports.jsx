import React, { useState, useEffect, useRef } from 'react';
import { apiAuthFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { theme } from '../../styles/theme.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import BordereauxModal from './BordereauxModal.jsx';
import TicketViewModal from './TicketViewModal.jsx';
import { formatDate, formatTime, formatDateTime, formatDateLong } from '../../lib/dateFormatter.js';

// Helper para convertir YYYY-MM-DD a DD/MM/AAAA
const formatDateDisplay = (isoDate) => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
};

// Helper para convertir DD/MM/AAAA a YYYY-MM-DD
const parseDateInput = (displayDate) => {
  if (!displayDate) return '';
  // Limpiar caracteres no numéricos excepto /
  const cleaned = displayDate.replace(/[^0-9/]/g, '');
  const parts = cleaned.split('/');
  if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return '';
};

// Componente de input de fecha con calendario y display DD/MM/AAAA
const DateInput = ({ value, onChange, style }) => {
  const displayValue = formatDateDisplay(value);
  const inputRef = useRef(null);
  
  const handleContainerClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.click();
    }
  };
  
  return (
    <div 
      onClick={handleContainerClick}
      style={{ 
        position: 'relative', 
        display: 'inline-block', 
        width: '100%',
        cursor: 'pointer'
      }}
    >
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...style,
          width: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: 0,
          height: '100%',
          cursor: 'pointer',
          zIndex: 1
        }}
      />
      <div style={{
        ...style,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: value ? '#1f2937' : '#9ca3af',
        backgroundColor: '#fff',
        boxSizing: 'border-box'
      }}>
        <span>{displayValue || 'DD/MM/AAAA'}</span>
        <span style={{ fontSize: '14px' }}>📅</span>
      </div>
    </div>
  );
};

export default function Reports({ shows }) {
  const { token, user, hasRole } = useAuth();
  const isProductor = user?.role === 'productor';
  const isBoleteria = hasRole('boleteria');
  const isAdmin = hasRole('admin');
  const [reportType, setReportType] = useState('general'); // 'general' | 'individual'
  const [selectedShowId, setSelectedShowId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(''); // '' = consolidado, id = sesión específica
  const [status, setStatus] = useState('active'); // 'all' | 'active' | 'finished' - Default: active
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showBordereauxModal, setShowBordereauxModal] = useState(false);
  
  // Filtros para detalle de ventas
  const [filterDate, setFilterDate] = useState('');
  const [filterSeller, setFilterSeller] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterProducer, setFilterProducer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sellers, setSellers] = useState([]);
  
  // Paginación para detalle de ventas
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  
  // Paginación del servidor (nuevo)
  const [salesPagination, setSalesPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });
  const [paginatedSales, setPaginatedSales] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  
  // Filtros de período
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Filtrar shows si es productor
  const availableShows = isProductor 
    ? shows.filter(show => {
        const hasProducer = show.producers?.some(p => p.id === user.id);
        return hasProducer;
      })
    : shows;
  
  // Modal de entradas
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [selectedTickets, setSelectedTickets] = useState([]);

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundSale, setRefundSale] = useState(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundEmail, setRefundEmail] = useState('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundTickets, setRefundTickets] = useState([]);
  const [selectedRefundTicketIds, setSelectedRefundTicketIds] = useState([]);
  const [refundTicketsLoading, setRefundTicketsLoading] = useState(false);

  // Al montar, cargar solo el detalle de ventas paginado (sin reporte general)
  useEffect(() => {
    loadSalesPaginated(1);
  }, []);

  const loadGeneralReport = async (isFilter = false) => {
    if (isFilter) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      // Construir query params con filtros
      const params = new URLSearchParams();
      params.append('status', status);
      if (filterDate) params.append('date', filterDate);
      if (filterSeller) params.append('seller_id', filterSeller);
      if (filterChannel) params.append('channel', filterChannel);
      
      // Si es productor, agregar su ID como filtro
      if (user?.role === 'productor' && user.id) {
        params.append('producer_id', user.id);
      }
      
      if (dateFrom) params.append('startDate', dateFrom);
      if (dateTo) params.append('endDate', dateTo);
      
      const url = `/api/reports/general?${params.toString()}`;
      const res = await apiAuthFetch(url, { method: 'GET' }, token);

      if (res.ok) {
        const data = await res.json();
        console.log('[REPORTS FRONTEND] General report data:', data);
        console.log('[REPORTS FRONTEND] serviceBreakdown:', data.serviceBreakdown);
        setReportData(data);
      } else {
        setError('Error al cargar el reporte');
      }
    } catch (err) {
      console.error('Error loading general report:', err);
      setError('Error al cargar el reporte');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadShowReport = async (showId, isFilter = false, sessionId = selectedSessionId) => {
    if (isFilter) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      // Construir query params con filtros
      const params = new URLSearchParams();
      if (filterDate) params.append('date', filterDate);
      if (filterSeller) params.append('seller_id', filterSeller);
      if (filterChannel) params.append('channel', filterChannel);
      if (sessionId) params.append('session_id', sessionId);
      
      const url = `/api/reports/show/${showId}${params.toString() ? '?' + params.toString() : ''}`;
      const res = await apiAuthFetch(url, { method: 'GET' }, token);

      if (res.ok) {
        const data = await res.json();
        console.log('[REPORTS FRONTEND] Show report data:', data);
        console.log('[REPORTS FRONTEND] serviceBreakdown:', data.serviceBreakdown);
        setReportData(data);
      } else {
        setError('Error al cargar el reporte');
      }
    } catch (err) {
      console.error('Error loading show report:', err);
      setError('Error al cargar el reporte');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Nueva función para cargar ventas paginadas desde el servidor
  const loadSalesPaginated = async (page = 1, isRefresh = false) => {
    if (!isRefresh) setLoadingSales(true);
    
    try {
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('limit', ITEMS_PER_PAGE);
      // Si se seleccionó un show específico, no filtrar por estado (mostrar todas sus ventas)
      params.append('status', (reportType === 'individual' && selectedShowId) ? 'all' : status);
      
      if (reportType === 'individual' && selectedShowId) {
        params.append('show_id', selectedShowId);
      }
      if (reportType === 'individual' && selectedSessionId) {
        params.append('session_id', selectedSessionId);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      if (filterDate) {
        params.append('date', filterDate);
      }
      if (filterSeller) {
        params.append('seller_id', filterSeller);
      }
      if (filterChannel) {
        params.append('channel', filterChannel);
      }
      if (dateFrom) {
        params.append('startDate', dateFrom);
      }
      if (dateTo) {
        params.append('endDate', dateTo);
      }
      if (isProductor) {
        params.append('producer_id', user.id);
      }
      
      const url = `/api/reports/sales-detail?${params.toString()}`;
      const res = await apiAuthFetch(url, { method: 'GET' }, token);
      
      if (res.ok) {
        const data = await res.json();
        setPaginatedSales(data.sales || []);
        setSalesPagination(data.pagination || {
          page: 1,
          limit: ITEMS_PER_PAGE,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        });
      } else {
        console.error('Error loading paginated sales');
      }
    } catch (err) {
      console.error('Error loading paginated sales:', err);
    } finally {
      setLoadingSales(false);
    }
  };

  // Cargar ventas paginadas cuando cambian filtros relevantes
  useEffect(() => {
    if (reportData || reportType === 'general') {
      setCurrentPage(1);
      const timer = setTimeout(() => {
        loadSalesPaginated(1, true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, filterDate, filterSeller, filterChannel, status, reportData, selectedSessionId]);

  // Cargar ventas cuando cambia la página
  useEffect(() => {
    if ((reportData || reportType === 'general') && currentPage !== salesPagination.page) {
      loadSalesPaginated(currentPage);
    }
  }, [currentPage]);

  // Reset página cuando cambia el tipo de reporte o show
  useEffect(() => {
    setCurrentPage(1);
    setPaginatedSales([]);
    setSalesPagination({
      page: 1,
      limit: ITEMS_PER_PAGE,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false
    });
  }, [reportType, selectedShowId]);

  // Actualizar lista de vendedores basado en las ventas paginadas cargadas
  useEffect(() => {
    if (paginatedSales && paginatedSales.length > 0) {
      const sellersWithSales = new Map();
      paginatedSales.forEach(sale => {
        if (sale.sold_by_id && sale.sold_by_name) {
          sellersWithSales.set(sale.sold_by_id, {
            id: sale.sold_by_id,
            name: sale.sold_by_name
          });
        }
      });
      setSellers(Array.from(sellersWithSales.values()));
    }
  }, [paginatedSales]);

  const handleTypeChange = (type) => {
    setReportType(type);
    setReportData(null);
    setError('');
    setCurrentPage(1);
    setSelectedSessionId('');
    
    if (type === 'general') {
      // Para reporte general, solo cargar ventas paginadas (sin totales)
      // Los totales generales se verán en Analytics
      setSelectedShowId(null);
      loadSalesPaginated(1);
    }
  };

  const handleShowSelect = (showId) => {
    setSelectedShowId(showId);
    setSelectedSessionId(''); // reset session on show change
    setCurrentPage(1);
    if (showId) {
      // Solo cargar reporte con totales cuando se selecciona un show específico
      loadShowReport(showId);
    } else {
      // Si no hay show seleccionado, limpiar datos y cargar solo ventas paginadas
      setReportData(null);
      loadSalesPaginated(1);
    }
  };

  const handleSessionSelect = (sessionId) => {
    setSelectedSessionId(sessionId);
    setCurrentPage(1);
    loadShowReport(selectedShowId, false, sessionId);
  };

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    if (reportType === 'general') {
      // Recargar con nuevo filtro
      setLoading(true);
      setTimeout(async () => {
        try {
          const url = `/api/reports/general?status=${newStatus}`;
          const res = await apiAuthFetch(url, { method: 'GET' }, token);
          
          if (res.ok) {
            const data = await res.json();
            setReportData(data);
          }
        } catch (err) {
          setError('Error al aplicar filtro');
        } finally {
          setLoading(false);
        }
      }, 100);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDateTimeLocal = (dateStr) => formatDateTime(dateStr);

  const handleViewTickets = async (sale, options = {}) => {
    const { detailsOnly = false } = options;

    try {
      let ticketsResponse = { tickets: [] };

      if (!detailsOnly) {
        const res = await apiAuthFetch(`/api/tickets?sale_id=${sale.sale_id}`, { method: 'GET' }, token);
        if (res.ok) {
          ticketsResponse = await res.json();
        }
      }

      setSelectedSale({
        id: sale.sale_id,
        customer_name: sale.customer_name,
        customer_email: sale.customer_email || '',
        customer_phone: sale.customer_phone || '',
        show_title: sale.show_title,
        session_date: formatDateTime(sale.session_date).date,
        session_time: formatDateTime(sale.session_date).time,
        total_amount: sale.total_amount,
        refunded: sale.refunded || false,
        refund_type: sale.refund_type || null,
        refund_reason: sale.refund_reason || null,
        refunded_at: sale.refunded_at || null,
        is_refund_operation: sale.is_refund_operation || false,
        service_items: sale.service_items || [],
        detailsOnly
      });

      setSelectedTickets(detailsOnly ? [] : (ticketsResponse.tickets || []));
      setShowTicketsModal(true);
    } catch (err) {
      console.error('Error loading tickets/details:', err);
    }
  };

  const canRefund = isAdmin || isBoleteria;
  const canManageSale = (sale) =>
    (sale.channel === 'Boletería' && canRefund) ||
    (sale.channel === 'Online' && isAdmin);

  const handleOpenRefundModal = async (sale) => {
    if (!canManageSale(sale)) return;
    setRefundSale(sale);
    setRefundReason('');
    const emailValue = sale.customer_email && sale.customer_email !== 'N/A' && sale.customer_email !== '-' ? sale.customer_email : '';
    setRefundEmail(emailValue);
    setRefundError('');
    setRefundTickets([]);
    setSelectedRefundTicketIds([]);
    setShowRefundModal(true);

    try {
      setRefundTicketsLoading(true);
      const res = await apiAuthFetch(`/api/tickets?sale_id=${sale.sale_id}`, { method: 'GET' }, token);
      if (res.ok) {
        const data = await res.json();
        const tickets = Array.isArray(data.tickets) ? data.tickets : [];
        setRefundTickets(tickets);

        const selectableIds = tickets
          .filter((t) => !(t.status === 'validated' || (t.capacity_validated && t.capacity_validated > 0)))
          .map((t) => t.id);
        setSelectedRefundTicketIds(selectableIds);
      } else {
        setRefundError('Error al cargar las entradas de la venta');
      }
    } catch (err) {
      console.error('Error loading refund tickets:', err);
      setRefundError('Error al cargar las entradas de la venta');
    } finally {
      setRefundTicketsLoading(false);
    }
  };

  const toggleRefundTicketSelection = (ticket) => {
    const isValidated = ticket.status === 'validated' || (ticket.capacity_validated && ticket.capacity_validated > 0);
    if (isValidated || refundSale?.channel === 'Online') return;

    setSelectedRefundTicketIds((prev) => {
      if (prev.includes(ticket.id)) {
        return prev.filter((id) => id !== ticket.id);
      }
      return [...prev, ticket.id];
    });
  };

  const handleCloseRefundModal = () => {
    setShowRefundModal(false);
    setRefundSale(null);
    setRefundReason('');
    setRefundEmail('');
    setRefundError('');
    setRefundTickets([]);
    setSelectedRefundTicketIds([]);
    setRefundTicketsLoading(false);
  };

  const handleConfirmRefund = async () => {
    if (!refundSale) return;

    try {
      setRefundLoading(true);
      setRefundError('');

      const refundableTickets = refundTickets.filter(
        (t) => !(t.status === 'validated' || (t.capacity_validated && t.capacity_validated > 0))
      );
      const hasSelectable = refundableTickets.length > 0;

      if (!hasSelectable) {
        setRefundError('No hay entradas elegibles para devolver');
        setRefundLoading(false);
        return;
      }

      const hasSelection = selectedRefundTicketIds.length > 0;
      if (!hasSelection) {
        setRefundError('Seleccioná al menos una entrada para devolver');
        setRefundLoading(false);
        return;
      }

      const allSelectableIds = refundableTickets.map((t) => t.id);
      const isAllSelectableSelected =
        allSelectableIds.length > 0 &&
        allSelectableIds.every((id) => selectedRefundTicketIds.includes(id));

      const body = {
        sale_id: refundSale.sale_id,
        reason: refundReason || undefined,
        notify_email: refundEmail || undefined
      };

      if (refundSale.channel !== 'Online' && !isAllSelectableSelected) {
        body.ticket_ids = selectedRefundTicketIds;
      }

      const res = await apiAuthFetch(
        '/api/cash-register/refund',
        {
          method: 'POST',
          body: JSON.stringify(body)
        },
        token
      );

      let data = {};
      try {
        data = await res.json();
      } catch (_) {}

      if (!res.ok) {
        setRefundError(
          data?.message ||
            data?.error ||
            'Error al devolver la venta'
        );
        return;
      }

      if (reportType === 'general') {
        await loadGeneralReport(true);
      } else if (reportType === 'individual' && selectedShowId) {
        await loadShowReport(selectedShowId, true);
      }
      await loadSalesPaginated(salesPagination.page, true);

      handleCloseRefundModal();
    } catch (err) {
      console.error('Error refunding sale:', err);
      setRefundError('Error al devolver la venta');
    } finally {
      setRefundLoading(false);
    }
  };

  const normalizePaymentMethod = (method) => {
    const methods = {
      'cash': 'Efectivo',
      'mp': 'Mercado Pago',
      'card': 'Tarjeta',
      'transfer': 'Transferencia',
      'qr': 'QR'
    };
    return methods[method?.toLowerCase()] || method || 'N/A';
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams();
      
      // Add filters
      if (reportType === 'individual' && selectedShowId) {
        params.append('show_id', selectedShowId);
      }
      if (filterChannel) {
        params.append('channel', filterChannel);
      }
      if (filterDate) {
        params.append('date', filterDate);
      }
      if (filterSeller) {
        params.append('seller_id', filterSeller);
      }
      
      // Build URL
      const url = `/api/reports/export/csv?${params.toString()}`;
      
      // Fetch CSV
      const res = await apiAuthFetch(url, { method: 'GET' }, token);
      
      if (!res.ok) {
        throw new Error('Error al exportar');
      }
      
      // Get blob
      const blob = await res.blob();
      
      // Create download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `ventas_${formatDate(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      
    } catch (err) {
      console.error('Error exporting CSV:', err);
      setError('Error al exportar a CSV');
    }
  };

  // Helper para determinar si un show está activo (tiene funciones futuras)
  const isShowActive = (show) => {
    if (!show.sessions || show.sessions.length === 0) return false;
    const now = new Date();
    return show.sessions.some(session => {
      const sessionDate = session.starts_at || session.date;
      return sessionDate && new Date(sessionDate) > now;
    });
  };

  // Helper para obtener la fecha de la próxima función
  const getNextSessionDate = (show) => {
    if (!show.sessions || show.sessions.length === 0) return null;
    const now = new Date();
    const futureSessions = show.sessions
      .filter(s => {
        const sessionDate = s.starts_at || s.date;
        return sessionDate && new Date(sessionDate) > now;
      })
      .sort((a, b) => {
        const dateA = new Date(a.starts_at || a.date);
        const dateB = new Date(b.starts_at || b.date);
        return dateA - dateB;
      });
    return futureSessions.length > 0 ? new Date(futureSessions[0].starts_at || futureSessions[0].date) : null;
  };

  // Helper para obtener la fecha de la última función
  const getLastSessionDate = (show) => {
    if (!show.sessions || show.sessions.length === 0) return null;
    const dates = show.sessions.map(s => {
      const d = s.starts_at;
      return d ? new Date(d) : null;
    }).filter(Boolean);
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
  };

  // Separar shows en activos y finalizados, ordenados cronológicamente
  const { activeShows, finishedShows } = React.useMemo(() => {
    const active = [];
    const finished = [];
    
    availableShows.forEach(show => {
      if (isShowActive(show)) {
        active.push(show);
      } else {
        finished.push(show);
      }
    });
    
    // Ordenar activos por fecha de próxima función (más próxima primero)
    active.sort((a, b) => {
      const dateA = getNextSessionDate(a);
      const dateB = getNextSessionDate(b);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    });
    
    // Ordenar finalizados por fecha de última función (más reciente primero)
    finished.sort((a, b) => {
      const dateA = getLastSessionDate(a);
      const dateB = getLastSessionDate(b);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB - dateA; // Más reciente primero
    });
    
    return { activeShows: active, finishedShows: finished };
  }, [availableShows]);

  // Helper para filtrar ventas con paginación
  const filterAndPaginateSales = (sales, additionalFilters = {}) => {
    const filtered = sales.filter(sale => {
      // Filtro por estado del show (si aplica)
      if (additionalFilters.statusFilter && status !== 'all') {
        if (status === 'active' && sale.show_status === 'finalizado') return false;
        if (status === 'finished' && sale.show_status === 'activo') return false;
      }
      
      // Filtro por búsqueda
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (sale.customer_name || '').toLowerCase().includes(q) ||
        (sale.customer_dni || '').toLowerCase().includes(q) ||
        (sale.customer_email || '').toLowerCase().includes(q) ||
        (sale.customer_phone || '').toLowerCase().includes(q) ||
        (sale.customer_localidad || '').toLowerCase().includes(q) ||
        (sale.show_title || '').toLowerCase().includes(q) ||
        (sale.locations || '').toLowerCase().includes(q) ||
        (sale.sold_by_name || '').toLowerCase().includes(q) ||
        (sale.payment_method || '').toLowerCase().includes(q) ||
        (sale.discount_code || '').toLowerCase().includes(q)
      );
    });
    
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    return { filtered, paginated, totalItems, totalPages };
  };

  // Componente de controles de paginación
  const PaginationControls = ({ currentPage, totalPages, totalItems, onPageChange }) => {
    if (totalPages <= 1) return null;
    
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginTop: theme.spacing.md,
        paddingTop: theme.spacing.md,
        borderTop: `1px solid ${theme.colors.borderLight}`,
        flexWrap: 'wrap',
        gap: theme.spacing.sm
      }}>
        <div style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary }}>
          Mostrando {Math.min((currentPage - 1) * ITEMS_PER_PAGE + 1, totalItems)}-{Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} de {totalItems} transacciones
        </div>
        
        <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.md,
              background: theme.colors.surface,
              color: currentPage <= 1 ? theme.colors.textMuted : theme.colors.textPrimary,
              cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.small
            }}
          >
            ← Anterior
          </button>
          
          <span style={{ 
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            fontSize: theme.typography.small,
            color: theme.colors.textSecondary
          }}>
            Página {currentPage} de {totalPages}
          </span>
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.md,
              background: theme.colors.surface,
              color: currentPage >= totalPages ? theme.colors.textMuted : theme.colors.textPrimary,
              cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.small
            }}
          >
            Siguiente →
          </button>
        </div>
      </div>
    );
  };

  if (user?.role === 'productor' && availableShows.length === 0) {
    return (
      <div style={{ padding: theme.spacing.lg }}>
        <div style={{ marginBottom: theme.spacing.xl }}>
          <h1 style={{ 
            fontSize: theme.typography.h2, 
            color: theme.colors.textPrimary,
            marginBottom: theme.spacing.sm
          }}>
            Reportes
          </h1>
        </div>
        <Card variant="elevated" padding="lg">
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: theme.colors.textSecondary 
          }}>
            <h3 style={{ 
              fontSize: theme.typography.h4,
              color: theme.colors.textPrimary,
              marginBottom: theme.spacing.md
            }}>
              No tenés shows asignados
            </h3>
            <p>
              Contactá al administrador para que te asigne como productor de un show.
            </p>
            <div style={{ 
              marginTop: theme.spacing.lg,
              padding: theme.spacing.md,
              background: '#eff6ff',
              borderRadius: theme.borderRadius.md,
              fontSize: 14
            }}>
              <strong>Tu ID de productor:</strong> {user.id}<br/>
              <strong>Email:</strong> {user.email}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: theme.spacing.lg }}>
      {/* Header */}
      <div style={{ marginBottom: theme.spacing.xl }}>
        <h1 style={{ 
          fontSize: theme.typography.h2, 
          color: theme.colors.textPrimary,
          marginBottom: theme.spacing.sm
        }}>
          Reportes {user?.role === 'productor' && `(${availableShows.length} show${availableShows.length > 1 ? 's' : ''})`}
        </h1>
        <p style={{ color: theme.colors.textSecondary }}>
          {user?.role === 'productor' ? 'Análisis de tus shows' : 'Análisis de ventas y asistencia'}
        </p>
      </div>

      {/* Filtros */}
      <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
        <div style={{ display: 'flex', gap: theme.spacing.lg, flexWrap: 'wrap' }}>
          {/* Selector único de reporte */}
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: theme.spacing.sm,
              fontWeight: theme.typography.medium,
              color: theme.colors.textPrimary
            }}>
              Seleccionar Reporte
            </label>
            <select
              value={reportType === 'general' ? 'general' : (selectedShowId || '')}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'general') {
                  handleTypeChange('general');
                } else {
                  setReportType('individual');
                  handleShowSelect(value || null);
                }
              }}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border}`,
                fontSize: theme.typography.body,
                fontFamily: theme.typography.fontFamily
              }}
            >
              <option value="general">General ({user?.role === 'productor' ? 'Mis Shows' : 'Todos los Shows'})</option>
              
              {activeShows.length > 0 && (
                <optgroup label="Shows Activos (Próximas funciones)">
                  {activeShows.map(show => (
                    <option key={show.id} value={show.id}>
                      {show.title}
                    </option>
                  ))}
                </optgroup>
              )}
              
              {activeShows.length > 0 && finishedShows.length > 0 && (
                <option disabled style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                  ───────────────
                </option>
              )}
              
              {finishedShows.length > 0 && (
                <optgroup label="Shows Finalizados">
                  {finishedShows.map(show => (
                    <option key={show.id} value={show.id}>
                      {show.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            
            {/* Leyenda de shows disponibles */}
            <div style={{ 
              marginTop: theme.spacing.xs, 
              fontSize: theme.typography.tiny,
              color: theme.colors.textMuted,
              display: 'flex',
              gap: theme.spacing.md
            }}>
              {activeShows.length > 0 && (
                <span>{activeShows.length} activo{activeShows.length > 1 ? 's' : ''}</span>
              )}
              {finishedShows.length > 0 && (
                <span>{finishedShows.length} finalizado{finishedShows.length > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>

          {/* Selector de sesión - solo visible cuando hay un show con más de 1 sesión seleccionado */}
          {reportType === 'individual' && selectedShowId && reportData && reportData.show?.sessions && reportData.show.sessions.length > 1 && (
            <div style={{ flex: 1, minWidth: '220px' }}>
              <label style={{
                display: 'block',
                marginBottom: theme.spacing.sm,
                fontWeight: theme.typography.medium,
                color: theme.colors.textPrimary
              }}>
                Sesión
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => handleSessionSelect(e.target.value)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  borderRadius: theme.borderRadius.md,
                  border: `1px solid ${theme.colors.border}`,
                  fontSize: theme.typography.body,
                  fontFamily: theme.typography.fontFamily,
                  background: selectedSessionId ? '#eff6ff' : theme.colors.surface
                }}
              >
                <option value="">Todas las sesiones (consolidado)</option>
                {reportData.show.sessions
                  .slice()
                  .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
                  .map(s => {
                    return (
                      <option key={s.id} value={s.id}>
                        {formatDate(s.starts_at)} {formatTime(s.starts_at)}hs
                      </option>
                    );
                  })
                }
              </select>
              <div style={{ marginTop: theme.spacing.xs, fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                {selectedSessionId ? 'Vista por sesión individual' : `${reportData.show.sessions.length} sesiones — suma consolidada`}
              </div>
            </div>
          )}

          {/* Filtro de estado */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: theme.spacing.sm,
              fontWeight: theme.typography.medium,
              color: theme.colors.textPrimary
            }}>
              Estado
            </label>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border}`,
                fontSize: theme.typography.body,
                fontFamily: theme.typography.fontFamily
              }}
            >
              <option value="all">Todos</option>
              <option value="active">Activos (futuros)</option>
              <option value="finished">Finalizados</option>
            </select>
          </div>
        </div>
        
        {/* Filtros de período */}
        <div style={{ display: 'flex', gap: theme.spacing.lg, flexWrap: 'wrap', marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border}` }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: theme.spacing.sm,
              fontWeight: theme.typography.medium,
              color: theme.colors.textPrimary
            }}>
              Desde
            </label>
            <DateInput
              value={dateFrom}
              onChange={setDateFrom}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border}`,
                fontSize: theme.typography.body,
                fontFamily: theme.typography.fontFamily
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: theme.spacing.sm,
              fontWeight: theme.typography.medium,
              color: theme.colors.textPrimary
            }}>
              Hasta
            </label>
            <DateInput
              value={dateTo}
              onChange={setDateTo}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border}`,
                fontSize: theme.typography.body,
                fontFamily: theme.typography.fontFamily
              }}
            />
          </div>
          {(dateFrom || dateTo) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                style={{
                  padding: theme.spacing.sm,
                  background: 'transparent',
                  color: theme.colors.textSecondary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  fontSize: theme.typography.small
                }}
              >
                Limpiar fechas
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Export Button - Oculto para productores */}
      {reportData && !isProductor && !isBoleteria && (
        <div style={{ marginBottom: theme.spacing.lg, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleExportCSV}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: '#000000',
              color: theme.colors.surface,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.body,
              fontWeight: theme.typography.semibold,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              boxShadow: theme.shadows.sm,
              transition: theme.transitions.fast
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
            onMouseOut={(e) => e.currentTarget.style.background = theme.colors.success}
          >
            Exportar a Excel (CSV)
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: theme.spacing.md,
          background: theme.colors.error,
          color: theme.colors.surface,
          borderRadius: theme.borderRadius.md,
          marginBottom: theme.spacing.lg
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
          <p style={{ color: theme.colors.textSecondary }}>Cargando reporte...</p>
        </div>
      )}

      {/* Reporte Individual - KPI cards y desglose PRIMERO (cuando hay un show seleccionado) */}
      {!loading && reportData && reportType === 'individual' && (
        <>
          {/* Información del Show */}
          <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: theme.spacing.md }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ marginBottom: theme.spacing.sm, color: theme.colors.textPrimary }}>
                  {reportData.show.title}
                </h2>
                <p style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>
                  {selectedSessionId
                    ? (() => {
                        const sess = reportData.show.sessions?.find(s => String(s.id) === String(selectedSessionId));
                        if (!sess) return 'Sesión individual';
                        return `Sesión: ${formatDate(sess.starts_at)} ${formatTime(sess.starts_at)}hs`;
                      })()
                    : `${reportData.show.sessionsCount} función${reportData.show.sessionsCount !== 1 ? 'es' : ''} — consolidado`
                  }
                </p>
              </div>
              {!isBoleteria && (
                <Button
                  variant="primary"
                  onClick={() => setShowBordereauxModal(true)}
                  style={{ marginLeft: theme.spacing.md }}
                >
                  {selectedSessionId ? 'Ver Bordereau (Sesión)' : 'Ver Bordereau'}
                </Button>
              )}
            </div>
          </Card>

          {/* KPI Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: theme.spacing.md,
            marginBottom: theme.spacing.lg
          }}>
            {!isBoleteria && (
            <Card variant="elevated" padding="md">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                Ingresos
              </div>
              <div style={{ fontSize: theme.typography.h4, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {formatCurrency(reportData.summary.totalRevenue)}
              </div>
            </Card>
            )}

            <Card variant="elevated" padding="md">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                Tickets
              </div>
              <div style={{ fontSize: theme.typography.h4, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.summary.totalTicketsSold}
              </div>
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                {reportData.summary.totalPeopleSold} personas
              </div>
            </Card>

            <Card variant="elevated" padding="md">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                Ocupación
              </div>
              <div style={{ fontSize: theme.typography.h4, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.summary.averageOccupancy}%
              </div>
            </Card>

            <Card variant="elevated" padding="md">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                Asistencia
              </div>
              <div style={{ fontSize: theme.typography.h4, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.summary.averageAttendance}%
              </div>
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                Faltan validar: {reportData.summary.totalPeopleSold - reportData.summary.totalPeopleValidated} personas
              </div>
            </Card>

          </div>

          {/* Desglose por Ubicación - Solo para Sala Principal, oculto para boletería */}
          {!isBoleteria && reportData.show?.venue_type === 'sala_principal' && (
            <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
              <h3 style={{ marginBottom: theme.spacing.md, color: theme.colors.textPrimary }}>
                Desglose por Ubicación
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: theme.spacing.md }}>
                <div>
                  <div style={{ fontSize: theme.typography.small, fontWeight: theme.typography.semibold, marginBottom: theme.spacing.xs }}>
                    Platea General
                  </div>
                  <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary }}>
                    {reportData.locationBreakdown.platea_general.people} personas
                  </div>
                  <div style={{ fontSize: theme.typography.body, fontWeight: theme.typography.medium, color: theme.colors.primary }}>
                    {formatCurrency(reportData.locationBreakdown.platea_general.revenue)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: theme.typography.small, fontWeight: theme.typography.semibold, marginBottom: theme.spacing.xs }}>
                    Palcos Bajos (4 pers)
                  </div>
                  <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary }}>
                    {reportData.locationBreakdown.palcos_bajos.count} palcos ({reportData.locationBreakdown.palcos_bajos.people} personas)
                  </div>
                  <div style={{ fontSize: theme.typography.body, fontWeight: theme.typography.medium, color: theme.colors.primary }}>
                    {formatCurrency(reportData.locationBreakdown.palcos_bajos.revenue)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: theme.typography.small, fontWeight: theme.typography.semibold, marginBottom: theme.spacing.xs }}>
                    Palcos Altos (2 pers)
                  </div>
                  <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary }}>
                    {reportData.locationBreakdown.palcos_altos.count} palcos ({reportData.locationBreakdown.palcos_altos.people} personas)
                  </div>
                  <div style={{ fontSize: theme.typography.body, fontWeight: theme.typography.medium, color: theme.colors.primary }}>
                    {formatCurrency(reportData.locationBreakdown.palcos_altos.revenue)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: theme.typography.small, fontWeight: theme.typography.semibold, marginBottom: theme.spacing.xs }}>
                    Pullman
                  </div>
                  <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary }}>
                    {reportData.locationBreakdown.pullman.people} personas
                  </div>
                  <div style={{ fontSize: theme.typography.body, fontWeight: theme.typography.medium, color: theme.colors.primary }}>
                    {formatCurrency(reportData.locationBreakdown.pullman.revenue)}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Desglose por Servicios - Admin ve todos, productor solo 'a bordereaux' */}
          {(isAdmin || isProductor) && reportData.serviceBreakdown && (
            (isAdmin && (Object.keys(reportData.serviceBreakdown.bordereaux || {}).length > 0 || Object.keys(reportData.serviceBreakdown.teatro || {}).length > 0)) ||
            (isProductor && Object.keys(reportData.serviceBreakdown.bordereaux || {}).length > 0)
          ) && (
            <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
              <h3 style={{ marginBottom: theme.spacing.md, color: theme.colors.textPrimary }}>
                Desglose por Servicios
                {isProductor && <span style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, marginLeft: theme.spacing.sm }}>(a bordereau)</span>}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: theme.spacing.md }}>
                {/* Admin: mostrar servicios a bordereaux */}
                {isAdmin && reportData.serviceBreakdown.bordereaux && Object.entries(reportData.serviceBreakdown.bordereaux).map(([serviceName, data]) => (
                  <div key={`bordereaux-${serviceName}`}>
                    <div style={{ fontSize: theme.typography.small, fontWeight: theme.typography.semibold, marginBottom: theme.spacing.xs }}>
                      {serviceName}
                    </div>
                    <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary }}>
                      {data.quantity} venta{data.quantity > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: theme.typography.body, fontWeight: theme.typography.medium, color: theme.colors.primary }}>
                      {formatCurrency(data.total)}
                    </div>
                  </div>
                ))}
                {/* Admin: mostrar servicios del teatro */}
                {isAdmin && reportData.serviceBreakdown.teatro && Object.entries(reportData.serviceBreakdown.teatro).map(([serviceName, data]) => (
                  <div key={`teatro-${serviceName}`} style={{ opacity: 0.7 }}>
                    <div style={{ fontSize: theme.typography.small, fontWeight: theme.typography.semibold, marginBottom: theme.spacing.xs }}>
                      {serviceName} <span style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>(del teatro)</span>
                    </div>
                    <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary }}>
                      {data.quantity} venta{data.quantity > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: theme.typography.body, fontWeight: theme.typography.medium, color: theme.colors.primary }}>
                      {formatCurrency(data.total)}
                    </div>
                  </div>
                ))}
                {/* Productor: mostrar solo servicios a bordereaux */}
                {isProductor && reportData.serviceBreakdown.bordereaux && Object.entries(reportData.serviceBreakdown.bordereaux).map(([serviceName, data]) => (
                  <div key={`prod-bordereaux-${serviceName}`}>
                    <div style={{ fontSize: theme.typography.small, fontWeight: theme.typography.semibold, marginBottom: theme.spacing.xs }}>
                      {serviceName}
                    </div>
                    <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary }}>
                      {data.quantity} venta{data.quantity > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: theme.typography.body, fontWeight: theme.typography.medium, color: theme.colors.primary }}>
                      {formatCurrency(data.total)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Detalle por Función - Oculto para boletería */}
          {!isBoleteria && (
          <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
            <h3 style={{ marginBottom: theme.spacing.md, color: theme.colors.textPrimary }}>
              Detalle por Función
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'left' }}>Fecha</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Tickets</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Personas</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Ocupación</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Validados</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Asistencia</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.sessions.map((session) => (
                    <tr key={session.session_id} style={{ borderBottom: `1px solid ${theme.colors.borderLight}` }}>
                      <td style={{ padding: theme.spacing.sm }}>
                        <div>{formatDateLong(session.date)}</div>
                        <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                          {formatTime(session.date)}
                        </div>
                      </td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right' }}>{session.ticketsSold}</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right' }}>{session.peopleSold}</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right' }}>{session.occupancy}%</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right' }}>{session.peopleValidated}</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right' }}>{session.attendance}%</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right', fontWeight: theme.typography.semibold }}>
                        {formatCurrency(session.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          )}
        </>
      )}

      {/* Detalle de Ventas - AL FINAL, sin nada debajo */}
      {!loading && !isProductor && (() => {
        const totalItems = salesPagination.total;
        const totalPages = salesPagination.totalPages;
        
        return (
        <Card variant="elevated" padding="lg">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <h3 style={{ margin: 0, color: theme.colors.textPrimary }}>
               Detalle de Ventas ({totalItems} transacciones)
            </h3>
            {loadingSales && (
              <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>
                ⟳ Cargando...
              </span>
            )}
          </div>
          
          {/* Barra de búsqueda */}
          <div style={{ marginBottom: theme.spacing.md }}>
            <input
              type="text"
              placeholder="🔍 Buscar por cliente, DNI, email, ubicación, show..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.body
              }}
            />
          </div>
          
          {/* Filtros */}
          <div style={{ 
            display: 'flex', 
            gap: theme.spacing.md, 
            marginBottom: theme.spacing.md,
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: theme.typography.small, 
                marginBottom: theme.spacing.xs,
                color: theme.colors.textSecondary
              }}>
                 Fecha
              </label>
              <DateInput
                value={filterDate}
                onChange={setFilterDate}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.small
                }}
              />
            </div>
            
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: theme.typography.small, 
                marginBottom: theme.spacing.xs,
                color: theme.colors.textSecondary
              }}>
                Vendedor
              </label>
              <select
                value={filterSeller}
                onChange={(e) => setFilterSeller(e.target.value)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.small
                }}
              >
                <option value="">Todos</option>
                {sellers.map(seller => (
                  <option key={seller.id} value={seller.id}>{seller.name}</option>
                ))}
              </select>
            </div>
            
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: theme.typography.small, 
                marginBottom: theme.spacing.xs,
                color: theme.colors.textSecondary
              }}>
                 Canal
              </label>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.small
                }}
              >
                <option value="">Todos</option>
                <option value="Online">Online</option>
                <option value="Boletería">Boletería</option>
              </select>
            </div>
          </div>
          
          {paginatedSales.length === 0 && !loadingSales ? (
            <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>
              {searchQuery || filterDate || filterSeller || filterChannel
                ? 'No se encontraron ventas con los filtros aplicados.'
                : 'No hay ventas para mostrar. Seleccioná un período o ajustá los filtros.'}
            </div>
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.colors.border}`, background: theme.colors.surfaceAlt }}>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '130px' }}>Fecha Venta</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '150px' }}>Show</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '100px' }}>Acciones</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '200px' }}>Ubicaciones</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '130px' }}>Fecha Función</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '150px' }}>Cliente</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '100px' }}>Localidad</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '120px' }}>Vendido por</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '80px' }}>Canal</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '70px' }}>Tickets</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '70px' }}>Personas</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '90px' }}>Pago</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'right', minWidth: '90px' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSales.map((sale) => {
                  const isRefunded = sale.refunded || false;
                  const isRefundOperation = sale.is_refund_operation || false;
                  const isRefundedOriginal = isRefunded && !isRefundOperation;
                  const showDetailButton = isRefundOperation;
                  const showRefundButton = canManageSale(sale) && !isRefunded && !isRefundOperation;

                  return (
                  <tr key={sale.sale_id} style={{ borderBottom: `1px solid ${theme.colors.borderLight}` }}>
                    <td style={{ padding: theme.spacing.xs }}>
                      <div>{formatDateTimeLocal(sale.sale_date).date}</div>
                      <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{formatDateTimeLocal(sale.sale_date).time}</div>
                    </td>
                    <td style={{ padding: theme.spacing.xs }}>
                      <div style={{ fontWeight: theme.typography.medium }}>{sale.show_title}</div>
                      <span style={{
                        padding: '1px 6px',
                        background: sale.show_status === 'finalizado' ? theme.colors.textMuted : theme.colors.success,
                        borderRadius: theme.borderRadius.full,
                        fontSize: '10px',
                        color: theme.colors.surface
                      }}>
                        {sale.show_status === 'finalizado' ? 'Finalizado' : 'Activo'}
                      </span>
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {isRefundedOriginal ? (
                          <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
                            Reintegrada
                          </span>
                        ) : showDetailButton ? (
                          <Button
                            onClick={() => handleViewTickets(sale, { detailsOnly: true })}
                            variant="secondary"
                            style={{ fontSize: 12, padding: '4px 12px' }}
                          >
                            Ver detalle
                          </Button>
                        ) : (
                          <>
                            <Button
                              onClick={() => handleViewTickets(sale)}
                              variant="secondary"
                              style={{ fontSize: 12, padding: '4px 12px' }}
                            >
                              Ver Entradas
                            </Button>
                            {showRefundButton && (
                              <Button
                                onClick={() => handleOpenRefundModal(sale)}
                                variant="danger"
                                style={{ fontSize: 12, padding: '4px 12px' }}
                              >
                                {sale.channel === 'Online' ? 'Anular' : 'Devolver'}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: theme.spacing.xs, fontSize: theme.typography.tiny }}>
                      {sale.locations && sale.locations.split(', ').map((loc, idx) => (
                        <div key={idx}>{loc}</div>
                      ))}
                      {(() => {
                        let serviceItems = sale.service_items;
                        // Forzar parseo si viene como string
                        if (typeof serviceItems === 'string') {
                          try {
                            serviceItems = JSON.parse(serviceItems);
                          } catch { serviceItems = []; }
                        }
                        const isArray = Array.isArray(serviceItems);
                        const hasItems = isArray && serviceItems.length > 0;
                        if (hasItems) {
                          return serviceItems.map((svc, idx) => (
                            <div key={`svc-${idx}`} style={{ color: '#000', fontWeight: 500, marginTop: 4 }}>{svc.name} - {svc.quantity} persona{svc.quantity > 1 ? 's' : ''}</div>
                          ));
                        }
                        return null;
                      })()}
                    </td>
                    <td style={{ padding: theme.spacing.xs }}>
                      <div>{formatDateTimeLocal(sale.session_date).date}</div>
                      <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{formatDateTimeLocal(sale.session_date).time}</div>
                    </td>
                    <td style={{ padding: theme.spacing.xs }}>
                      <div style={{ fontWeight: theme.typography.medium }}>{sale.customer_name}</div>
                      {sale.customer_dni && (
                        <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>DNI: {sale.customer_dni}</div>
                      )}
                      {sale.customer_email && sale.customer_email !== '-' && (
                        <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{sale.customer_email}</div>
                      )}
                      {sale.customer_phone && sale.customer_phone !== '-' && (
                        <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>Tel: {sale.customer_phone}</div>
                      )}
                    </td>
                    <td style={{ padding: theme.spacing.xs, fontSize: theme.typography.tiny }}>
                      {sale.customer_localidad || '-'}
                    </td>
                    <td style={{ padding: theme.spacing.xs }}>
                      <div style={{ fontWeight: theme.typography.medium }}>{sale.sold_by_name}</div>
                      {sale.sold_by_email !== '-' && (
                        <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{sale.sold_by_email}</div>
                      )}
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 8px',
                        background: sale.channel === 'Boletería' ? theme.colors.info : theme.colors.success,
                        borderRadius: theme.borderRadius.full,
                        fontSize: theme.typography.tiny,
                        color: theme.colors.surface
                      }}>
                        {sale.channel}
                      </span>
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>{sale.tickets_count}</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>{sale.people_count}</td>
                    <td style={{ padding: theme.spacing.xs }}>
                      <div>{normalizePaymentMethod(sale.payment_method)}</div>
                      {sale.discount_code && (
                        <div style={{ fontSize: theme.typography.tiny, color: theme.colors.accent }}>
                          Desc: {sale.discount_code} ({sale.discount_value})
                        </div>
                      )}
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right', fontWeight: theme.typography.semibold }}>
                      {formatCurrency(sale.total_amount)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          
          {loadingSales && (
            <div style={{ padding: theme.spacing.lg, textAlign: 'center', color: theme.colors.textMuted }}>
              Cargando ventas...
            </div>
          )}
          
          <PaginationControls
            currentPage={currentPage}
            totalPages={salesPagination.totalPages}
            totalItems={salesPagination.total}
            onPageChange={setCurrentPage}
          />
        </Card>
        );
      })()}

      {/* Modal de Bordereaux */}
      {showBordereauxModal && selectedShowId && (
        <BordereauxModal
          showId={selectedShowId}
          sessionId={selectedSessionId || undefined}
          onClose={() => setShowBordereauxModal(false)}
        />
      )}

      {/* Modal de Ver Entradas */}
      {showTicketsModal && selectedSale && (
        <TicketViewModal
          sale={selectedSale}
          tickets={selectedTickets}
          onClose={() => {
            setShowTicketsModal(false);
            setSelectedSale(null);
            setSelectedTickets([]);
          }}
        />
      )}

      {/* Modal de Devolución */}
      {showRefundModal && refundSale && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div
            style={{
              background: theme.colors.surface,
              borderRadius: 12,
              maxWidth: 480,
              width: '100%',
              boxShadow: theme.shadows.lg,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: theme.spacing.lg,
                borderBottom: `1px solid ${theme.colors.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: theme.typography.h4,
                  color: theme.colors.textPrimary
                }}
              >
                {refundSale.channel === 'Online' ? 'Anular venta online' : 'Devolver venta'}
              </h2>
              <button
                onClick={handleCloseRefundModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 22,
                  cursor: 'pointer',
                  color: theme.colors.textMuted
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: theme.spacing.lg }}>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: theme.spacing.md,
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.small
                }}
              >
                {refundSale.channel === 'Online'
                  ? 'Esta acción anulará la venta online y liberará todas sus entradas. No se podrá deshacer y no se procesará ningún reintegro desde el sistema.'
                  : 'Esta acción liberará las entradas seleccionadas de esta venta y registrará un movimiento negativo en tu caja actual. Solo se pueden devolver entradas que no tengan ingresos registrados.'}
              </p>

              <div style={{ marginBottom: theme.spacing.md }}>
                <div
                  style={{
                    fontSize: theme.typography.small,
                    marginBottom: theme.spacing.xs,
                    color: theme.colors.textSecondary
                  }}
                >
                  Cliente
                </div>
                <div style={{ fontWeight: theme.typography.medium }}>
                  {refundSale.customer_name}
                </div>
                <div
                  style={{
                    fontSize: theme.typography.tiny,
                    color: theme.colors.textMuted
                  }}
                >
                  {refundSale.show_title} · {formatDateTime(refundSale.session_date).date}{' '}
                  {formatDateTime(refundSale.session_date).time}
                </div>
                <div
                  style={{
                    marginTop: theme.spacing.xs,
                    fontSize: theme.typography.small,
                    color: theme.colors.textPrimary
                  }}
                >
                  Total de la venta: {formatCurrency(refundSale.total_amount)}
                </div>
              </div>

              <div style={{ marginBottom: theme.spacing.md }}>
                <div
                  style={{
                    fontSize: theme.typography.small,
                    marginBottom: theme.spacing.xs,
                    color: theme.colors.textSecondary
                  }}
                >
                  {refundSale.channel === 'Online' ? 'Entradas a anular' : 'Seleccioná las entradas a devolver'}
                </div>

                {refundTicketsLoading ? (
                  <div
                    style={{
                      fontSize: theme.typography.small,
                      color: theme.colors.textSecondary
                    }}
                  >
                    Cargando entradas...
                  </div>
                ) : refundTickets.length === 0 ? (
                  <div
                    style={{
                      fontSize: theme.typography.small,
                      color: theme.colors.textSecondary
                    }}
                  >
                    No se encontraron entradas para esta venta.
                  </div>
                ) : (
                  <div
                    style={{
                      border: `1px solid ${theme.colors.borderLight}`,
                      borderRadius: theme.borderRadius.md,
                      maxHeight: 200,
                      overflowY: 'auto'
                    }}
                  >
                    {refundTickets.map((ticket) => {
                      const isValidated =
                        ticket.status === 'validated' ||
                        (ticket.capacity_validated && ticket.capacity_validated > 0);
                      const isSelected = selectedRefundTicketIds.includes(ticket.id);
                      const currentValidated = ticket.capacity_validated || 0;
                      const totalCapacity = ticket.capacity || 1;
                      const isPartiallyValidated =
                        !isValidated && currentValidated > 0 && currentValidated < totalCapacity;
                      const isFullyValidated =
                        ticket.status === 'validated' || currentValidated >= totalCapacity;

                      let statusLabel = 'Disponible para devolución';
                      let statusColor = theme.colors.textSecondary;

                      if (isFullyValidated) {
                        statusLabel = 'YA INGRESADA';
                        statusColor = '#9ca3af';
                      } else if (isPartiallyValidated) {
                        statusLabel = `${currentValidated}/${totalCapacity} ingresadas`;
                        statusColor = '#92400e';
                      }

                      return (
                        <div
                          key={ticket.id}
                          onClick={() => toggleRefundTicketSelection(ticket)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: theme.spacing.sm,
                            borderBottom: `1px solid ${theme.colors.borderLight}`,
                            cursor: isValidated || refundSale.channel === 'Online' ? 'not-allowed' : 'pointer',
                            background: isSelected && !isValidated ? '#eff6ff' : theme.colors.surface,
                            opacity: isValidated ? 0.6 : 1
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: theme.typography.small,
                                fontWeight: theme.typography.medium
                              }}
                            >
                              {ticket.location || ticket.seat_code}
                            </div>
                            <div
                              style={{
                                fontSize: theme.typography.tiny,
                                color: statusColor
                              }}
                            >
                              {statusLabel}
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: theme.spacing.sm
                            }}
                          >
                            <div
                              style={{
                                fontSize: theme.typography.small,
                                color: theme.colors.textSecondary
                              }}
                            >
                              {formatCurrency(ticket.price || 0)}
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected && !isValidated}
                              disabled={isValidated || refundSale.channel === 'Online'}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleRefundTicketSelection(ticket);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: isValidated ? 'not-allowed' : 'pointer' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {refundTickets.length > 0 && selectedRefundTicketIds.length > 0 && (() => {
                  // Calcular factor de descuento: total_pagado / suma_precios_base
                  const allTicketsBasePrice = refundTickets.reduce((sum, t) => sum + Number(t.price || 0), 0);
                  const saleTotalAmount = Number(refundSale.total_amount || 0);
                  const discountFactor = allTicketsBasePrice > 0 ? saleTotalAmount / allTicketsBasePrice : 1;
                  
                  const selectedTicketsBasePrice = refundTickets
                    .filter(
                      (t) =>
                        selectedRefundTicketIds.includes(t.id) &&
                        !(t.status === 'validated' || (t.capacity_validated && t.capacity_validated > 0))
                    )
                    .reduce((sum, t) => sum + Number(t.price || 0), 0);
                  
                  const totalToRefund = selectedTicketsBasePrice * discountFactor;
                  
                  return (
                    <div
                      style={{
                        marginTop: theme.spacing.xs,
                        fontSize: theme.typography.small,
                        color: theme.colors.textSecondary
                      }}
                    >
                      {refundSale.channel === 'Online' ? 'Entradas a anular:' : 'Entradas seleccionadas:'}{' '}
                      {selectedRefundTicketIds.length} de{' '}
                      {
                        refundTickets.filter(
                          (t) =>
                            !(t.status === 'validated' || (t.capacity_validated && t.capacity_validated > 0))
                        ).length
                      }
                      . {refundSale.channel === 'Online' ? 'Total original:' : 'Total a devolver:'}{' '}
                      {formatCurrency(totalToRefund)}
                      {discountFactor < 1 && (
                        <span style={{ marginLeft: 8, color: theme.colors.textMuted }}>
                          (con descuento aplicado)
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ marginTop: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                {refundSale.customer_email &&
                refundSale.customer_email !== 'N/A' &&
                refundSale.customer_email !== '-' ? (
                  <div
                    style={{
                      fontSize: theme.typography.small,
                      color: theme.colors.textSecondary
                    }}
                  >
                    Se enviará un email de confirmación a:{' '}
                    <span style={{ fontWeight: theme.typography.medium }}>
                      {refundSale.customer_email}
                    </span>
                  </div>
                ) : (
                  <>
                    <label
                      style={{
                        display: 'block',
                        fontSize: theme.typography.small,
                        marginBottom: theme.spacing.xs,
                        color: theme.colors.textSecondary
                      }}
                    >
                      Email del espectador (opcional)
                    </label>
                    <input
                      type="email"
                      value={refundEmail}
                      onChange={(e) => setRefundEmail(e.target.value)}
                      placeholder="email@ejemplo.com"
                      style={{
                        width: '100%',
                        padding: theme.spacing.sm,
                        borderRadius: theme.borderRadius.md,
                        border: `1px solid ${theme.colors.border}`,
                        fontSize: theme.typography.small
                      }}
                    />
                    <div
                      style={{
                        marginTop: theme.spacing.xs,
                        fontSize: theme.typography.tiny,
                        color: theme.colors.textMuted
                      }}
                    >
                      Si ingresás un email, le enviaremos al espectador el comprobante de la devolución.
                    </div>
                  </>
                )}
              </div>

              <div style={{ marginBottom: theme.spacing.md }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: theme.typography.small,
                    marginBottom: theme.spacing.xs,
                    color: theme.colors.textSecondary
                  }}
                >
                  {refundSale.channel === 'Online' ? 'Motivo de la anulación (opcional)' : 'Motivo de la devolución (opcional)'}
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: theme.spacing.sm,
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${theme.colors.border}`,
                    fontSize: theme.typography.small,
                    resize: 'vertical'
                  }}
                />
              </div>

              {refundError && (
                <div
                  style={{
                    marginBottom: theme.spacing.md,
                    padding: theme.spacing.sm,
                    borderRadius: theme.borderRadius.md,
                    background: theme.colors.error,
                    color: theme.colors.surface,
                    fontSize: theme.typography.small
                  }}
                >
                  {refundError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: theme.spacing.sm
                }}
              >
                <button
                  type="button"
                  onClick={handleCloseRefundModal}
                  disabled={refundLoading}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${theme.colors.border}`,
                    background: theme.colors.surface,
                    color: theme.colors.textPrimary,
                    fontSize: theme.typography.small,
                    cursor: refundLoading ? 'default' : 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRefund}
                  disabled={refundLoading}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    borderRadius: theme.borderRadius.md,
                    border: 'none',
                    background: theme.colors.error,
                    color: theme.colors.surface,
                    fontSize: theme.typography.small,
                    cursor: refundLoading ? 'default' : 'pointer'
                  }}
                >
                  {refundLoading
                    ? (refundSale.channel === 'Online' ? 'Anulando...' : 'Devolviendo...')
                    : (refundSale.channel === 'Online' ? 'Confirmar anulación' : 'Confirmar devolución')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
