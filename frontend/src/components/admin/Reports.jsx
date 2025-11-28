import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { theme } from '../../styles/theme.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import BordereauxModal from './BordereauxModal.jsx';
import TicketViewModal from './TicketViewModal.jsx';

export default function Reports({ shows }) {
  const { token, user } = useAuth();
  const isProductor = user?.role === 'productor';
  const isBoleteria = user?.role === 'boleteria';
  const isAdmin = user?.role === 'admin';
  const [reportType, setReportType] = useState('general'); // 'general' | 'individual'
  const [selectedShowId, setSelectedShowId] = useState('');
  const [status, setStatus] = useState('all'); // 'all' | 'active' | 'finished'
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
  const [sellers, setSellers] = useState([]);
  
  // Filtrar shows si es productor
  const availableShows = isProductor 
    ? shows.filter(show => {
        const hasProducer = show.producers?.some(p => p.id === user.id);
        console.log(`[REPORTS] Show "${show.title}": producers=`, show.producers, 'hasProducer=', hasProducer);
        return hasProducer;
      })
    : shows;
  
  console.log('[REPORTS] =====================================');
  console.log('[REPORTS] User role:', user?.role);
  console.log('[REPORTS] User ID:', user?.id);
  console.log('[REPORTS] All shows:', shows.length);
  console.log('[REPORTS] Available shows for user:', availableShows.length);
  console.log('[REPORTS] Available shows:', availableShows);
  console.log('[REPORTS] =====================================');
  
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

  // Cargar reporte general al montar
  useEffect(() => {
    loadGeneralReport();
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
        console.log('[REPORTS] Filtering by producer_id:', user.id);
      }
      
      const url = `/api/reports/general?${params.toString()}`;
      console.log('[REPORTS] Loading report:', url);
      const res = await apiAuthFetch(url, { method: 'GET' }, token);
      
      if (res.ok) {
        const data = await res.json();
        console.log('[REPORTS] Report data:', data);
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

  const loadShowReport = async (showId, isFilter = false) => {
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
      
      const url = `/api/reports/show/${showId}${params.toString() ? '?' + params.toString() : ''}`;
      const res = await apiAuthFetch(url, { method: 'GET' }, token);
      
      if (res.ok) {
        const data = await res.json();
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
  
  // Actualizar lista de vendedores basado en el reporte actual
  useEffect(() => {
    if (reportData && reportData.salesDetail) {
      // Extraer vendedores únicos que tienen ventas en este reporte
      const sellersWithSales = new Map();
      reportData.salesDetail.forEach(sale => {
        if (sale.sold_by_id && sale.sold_by_name) {
          sellersWithSales.set(sale.sold_by_id, {
            id: sale.sold_by_id,
            name: sale.sold_by_name
          });
        }
      });
      setSellers(Array.from(sellersWithSales.values()));
    }
  }, [reportData]);

  // Aplicar filtros automáticamente cuando cambian
  useEffect(() => {
    if (reportData && !loading) {
      const timer = setTimeout(() => {
        if (reportType === 'general') {
          loadGeneralReport(true);
        } else if (selectedShowId && reportType === 'show') {
          loadShowReport(selectedShowId, true);
        }
      }, 300); // Debounce para evitar múltiples llamadas
      
      return () => clearTimeout(timer);
    }
  }, [filterDate, filterSeller, filterChannel]);

  const handleTypeChange = (type) => {
    setReportType(type);
    setReportData(null);
    setError('');
    
    if (type === 'general') {
      loadGeneralReport();
    }
  };

  const handleShowSelect = (showId) => {
    setSelectedShowId(showId);
    if (showId) {
      loadShowReport(showId);
    }
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

  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    const dateFormatted = date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeFormatted = date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return { date: dateFormatted, time: timeFormatted };
  };

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
        detailsOnly
      });

      setSelectedTickets(detailsOnly ? [] : (ticketsResponse.tickets || []));
      setShowTicketsModal(true);
    } catch (err) {
      console.error('Error loading tickets/details:', err);
    }
  };

  const canRefund = isAdmin || isBoleteria;

  const handleOpenRefundModal = async (sale) => {
    if (!canRefund) return;
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
    if (isValidated) return;

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

      if (!isAllSelectableSelected) {
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
      a.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      
    } catch (err) {
      console.error('Error exporting CSV:', err);
      setError('Error al exportar a CSV');
    }
  };

  // Si es productor sin shows asignados, mostrar mensaje
  if (user?.role === 'productor' && availableShows.length === 0) {
    return (
      <div style={{ padding: theme.spacing.lg }}>
        <div style={{ marginBottom: theme.spacing.xl }}>
          <h1 style={{ 
            fontSize: theme.typography.h2, 
            color: theme.colors.textPrimary,
            marginBottom: theme.spacing.sm
          }}>
            📊 Reportes
          </h1>
        </div>
        <Card variant="elevated" padding="lg">
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: theme.colors.textSecondary 
          }}>
            <div style={{ fontSize: 48, marginBottom: theme.spacing.lg }}>🎭</div>
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
          📊 Reportes {user?.role === 'productor' && `(${availableShows.length} show${availableShows.length > 1 ? 's' : ''})`}
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
              value={reportType === 'general' ? 'general' : selectedShowId}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'general') {
                  handleTypeChange('general');
                } else {
                  setReportType('individual');
                  handleShowSelect(value);
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
              <option value="general">📊 General ({user?.role === 'productor' ? 'Mis Shows' : 'Todos los Shows'})</option>
              <optgroup label="📄 Reportes Individuales">
                {availableShows.map(show => (
                  <option key={show.id} value={show.id}>
                    {show.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

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
      </Card>

      {/* Export Button - Oculto para productores */}
      {reportData && !isProductor && !isBoleteria && (
        <div style={{ marginBottom: theme.spacing.lg, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleExportCSV}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: theme.colors.success,
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
            📥 Exportar a Excel (CSV)
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

      {/* Reporte General */}
      {!loading && reportData && reportType === 'general' && (
        <>
          {/* KPI Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: theme.spacing.md,
            marginBottom: theme.spacing.lg
          }}>
            <Card variant="elevated" padding="lg">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                💰 Ingresos Totales
              </div>
              <div style={{ fontSize: theme.typography.h3, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {formatCurrency(reportData.totals.totalRevenue)}
              </div>
            </Card>

            <Card variant="elevated" padding="lg">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                🎫 Tickets Vendidos
              </div>
              <div style={{ fontSize: theme.typography.h3, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.totals.totalTicketsSold}
              </div>
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                {reportData.totals.totalPeopleSold} personas
              </div>
            </Card>

            <Card variant="elevated" padding="lg">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                📊 Ocupación Promedio
              </div>
              <div style={{ fontSize: theme.typography.h3, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.totals.averageOccupancy}%
              </div>
            </Card>

            <Card variant="elevated" padding="lg">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                👥 Asistencia Real
              </div>
              <div style={{ fontSize: theme.typography.h3, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.totals.averageAttendance}%
              </div>
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                {reportData.totals.totalPeopleValidated} validados
              </div>
            </Card>
          </div>

          {/* Desglose por Ubicación */}
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
                  Palcos Bajos
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
                  Palcos Altos
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

          {/* Ranking de Shows */}
          <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
            <h3 style={{ marginBottom: theme.spacing.md, color: theme.colors.textPrimary }}>
              Ranking de Shows por Ingresos
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'left' }}>#</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'left' }}>Show</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Sesiones</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Tickets</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Personas</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Ocupación</th>
                    <th style={{ padding: theme.spacing.sm, textAlign: 'right' }}>Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.shows.map((show, idx) => (
                    <tr key={show.show_id} style={{ borderBottom: `1px solid ${theme.colors.borderLight}` }}>
                      <td style={{ padding: theme.spacing.sm }}>{idx + 1}</td>
                      <td style={{ padding: theme.spacing.sm, fontWeight: theme.typography.medium }}>{show.show_title}</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>{show.sessions}</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>{show.tickets}</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>{show.people}</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right' }}>{show.occupancy}%</td>
                      <td style={{ padding: theme.spacing.sm, textAlign: 'right', fontWeight: theme.typography.semibold, color: theme.colors.primary }}>
                        {formatCurrency(show.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Detalle de Ventas - Oculto para productores */}
          {reportData.salesDetail && !isProductor && (
            <Card variant="elevated" padding="lg">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                <h3 style={{ margin: 0, color: theme.colors.textPrimary }}>
                  📝 Detalle de Ventas ({reportData.salesDetail.length} transacciones)
                </h3>
                {isRefreshing && (
                  <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>
                    ⟳ Actualizando...
                  </span>
                )}
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
                    📅 Fecha
                  </label>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
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
                    👤 Vendedor
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
                    📍 Canal
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
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${theme.colors.border}`, background: theme.colors.surfaceAlt }}>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '130px' }}>Fecha Venta</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '150px' }}>Show</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '130px' }}>Fecha Función</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '150px' }}>Cliente</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '120px' }}>Vendido por</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '80px' }}>Canal</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '200px' }}>Ubicaciones</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '70px' }}>Tickets</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '70px' }}>Personas</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '90px' }}>Pago</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'right', minWidth: '90px' }}>Total</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '100px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.salesDetail.map((sale) => {
                      const isRefunded = sale.refunded || false;
                      const isRefundOperation = sale.is_refund_operation || false;
                      const isRefundedOriginal = isRefunded && !isRefundOperation;
                      const showDetailButton = isRefundOperation;
                      const showRefundButton = canRefund && sale.channel === 'Boletería' && !isRefunded && !isRefundOperation;

                      return (
                      <tr key={sale.sale_id} style={{ borderBottom: `1px solid ${theme.colors.borderLight}` }}>
                        <td style={{ padding: theme.spacing.xs }}>
                          <div>{formatDateTime(sale.sale_date).date}</div>
                          <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{formatDateTime(sale.sale_date).time}</div>
                        </td>
                        <td style={{ padding: theme.spacing.xs, fontWeight: theme.typography.medium }}>
                          {sale.show_title}
                        </td>
                        <td style={{ padding: theme.spacing.xs }}>
                          <div>{formatDateTime(sale.session_date).date}</div>
                          <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{formatDateTime(sale.session_date).time}</div>
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
                        <td style={{ padding: theme.spacing.xs, fontSize: theme.typography.tiny }}>
                          {sale.locations.split(', ').map((loc, idx) => (
                            <div key={idx}>{loc}</div>
                          ))}
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
                                    Devolver
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {reportData.salesDetail.length === 0 && (
                <div style={{ padding: theme.spacing.lg, textAlign: 'center', color: theme.colors.textMuted }}>
                  No hay ventas que coincidan con los filtros seleccionados
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Reporte Individual */}
      {!loading && reportData && reportType === 'individual' && (
        <>
          {/* Información del Show */}
          <Card variant="elevated" padding="lg" style={{ marginBottom: theme.spacing.lg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: theme.spacing.md }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ marginBottom: theme.spacing.sm, color: theme.colors.textPrimary }}>
                  {reportData.show.title}
                </h2>
                <p style={{ color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                  {reportData.show.description}
                </p>
                <p style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>
                  {reportData.show.sessionsCount} funciones
                </p>
              </div>
              {!isBoleteria && (
                <Button
                  variant="primary"
                  onClick={() => setShowBordereauxModal(true)}
                  style={{ marginLeft: theme.spacing.md }}
                >
                  📄 Ver Bordereaux
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
            <Card variant="elevated" padding="md">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                💰 Ingresos
              </div>
              <div style={{ fontSize: theme.typography.h4, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {formatCurrency(reportData.summary.totalRevenue)}
              </div>
            </Card>

            <Card variant="elevated" padding="md">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                🎫 Tickets
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
                📊 Ocupación
              </div>
              <div style={{ fontSize: theme.typography.h4, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.summary.averageOccupancy}%
              </div>
            </Card>

            <Card variant="elevated" padding="md">
              <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }}>
                👥 Asistencia
              </div>
              <div style={{ fontSize: theme.typography.h4, fontWeight: theme.typography.bold, color: theme.colors.primary }}>
                {reportData.summary.averageAttendance}%
              </div>
            </Card>

          </div>

          {/* Desglose por Ubicación */}
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

          {/* Detalle por Función */}
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
                        <div>{new Date(session.date).toLocaleDateString('es-AR', { 
                          weekday: 'long', 
                          day: '2-digit', 
                          month: 'long',
                          year: 'numeric'
                        })}</div>
                        <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>
                          {new Date(session.date).toLocaleTimeString('es-AR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          })}
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

          {/* Detalle de Ventas - Oculto para productores */}
          {reportData.salesDetail && user?.role !== 'productor' && (
            <Card variant="elevated" padding="lg">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
                <h3 style={{ margin: 0, color: theme.colors.textPrimary }}>
                  📝 Detalle de Ventas ({reportData.salesDetail.length} transacciones)
                </h3>
                {isRefreshing && (
                  <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>
                    ⟳ Actualizando...
                  </span>
                )}
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
                    📅 Fecha
                  </label>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
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
                    👤 Vendedor
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
                    📍 Canal
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
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${theme.colors.border}`, background: theme.colors.surfaceAlt }}>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '130px' }}>Fecha Venta</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '130px' }}>Fecha Función</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '150px' }}>Cliente</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '120px' }}>Vendido por</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '80px' }}>Canal</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '200px' }}>Ubicaciones</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '70px' }}>Tickets</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '70px' }}>Personas</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left', minWidth: '90px' }}>Pago</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'right', minWidth: '90px' }}>Total</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'center', minWidth: '100px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.salesDetail.map((sale) => {
                      const isRefunded = sale.refunded || false;
                      const isRefundOperation = sale.is_refund_operation || false;
                      const isRefundedOriginal = isRefunded && !isRefundOperation;
                      const showDetailButton = isRefundOperation;

                      return (
                      <tr key={sale.sale_id} style={{ borderBottom: `1px solid ${theme.colors.borderLight}` }}>
                        <td style={{ padding: theme.spacing.xs }}>
                          <div>{formatDateTime(sale.sale_date).date}</div>
                          <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{formatDateTime(sale.sale_date).time}</div>
                        </td>
                        <td style={{ padding: theme.spacing.xs }}>
                          <div>{formatDateTime(sale.session_date).date}</div>
                          <div style={{ fontSize: theme.typography.tiny, color: theme.colors.textMuted }}>{formatDateTime(sale.session_date).time}</div>
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
                        <td style={{ padding: theme.spacing.xs, fontSize: theme.typography.tiny }}>
                          {sale.locations.split(', ').map((loc, idx) => (
                            <div key={idx}>{loc}</div>
                          ))}
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
                        <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
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
                            <Button
                              onClick={() => handleViewTickets(sale)}
                              variant="secondary"
                              style={{ fontSize: 12, padding: '4px 12px' }}
                            >
                              Ver Entradas
                            </Button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {reportData.salesDetail.length === 0 && (
                <div style={{ padding: theme.spacing.lg, textAlign: 'center', color: theme.colors.textMuted }}>
                  No hay ventas que coincidan con los filtros seleccionados
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* Modal de Bordereaux */}
      {showBordereauxModal && selectedShowId && (
        <BordereauxModal
          showId={selectedShowId}
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
                Devolver venta
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
                Esta acción liberará las entradas seleccionadas de esta venta y registrará un
                movimiento negativo en tu caja actual. Solo se pueden devolver
                entradas que no tengan ingresos registrados.
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
                  Seleccioná las entradas a devolver
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
                            cursor: isValidated ? 'not-allowed' : 'pointer',
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
                              disabled={isValidated}
                              onChange={() => toggleRefundTicketSelection(ticket)}
                              style={{ cursor: isValidated ? 'not-allowed' : 'pointer' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {refundTickets.length > 0 && selectedRefundTicketIds.length > 0 && (
                  <div
                    style={{
                      marginTop: theme.spacing.xs,
                      fontSize: theme.typography.small,
                      color: theme.colors.textSecondary
                    }}
                  >
                    Entradas seleccionadas:{' '}
                    {selectedRefundTicketIds.length} de{' '}
                    {
                      refundTickets.filter(
                        (t) =>
                          !(t.status === 'validated' || (t.capacity_validated && t.capacity_validated > 0))
                      ).length
                    }
                    . Total a devolver:{' '}
                    {formatCurrency(
                      refundTickets
                        .filter(
                          (t) =>
                            selectedRefundTicketIds.includes(t.id) &&
                            !(t.status === 'validated' || (t.capacity_validated && t.capacity_validated > 0))
                        )
                        .reduce((sum, t) => sum + Number(t.price || 0), 0)
                    )}
                  </div>
                )}
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
                  Motivo de la devolución (opcional)
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
                  {refundLoading ? 'Devolviendo...' : 'Confirmar devolución'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
