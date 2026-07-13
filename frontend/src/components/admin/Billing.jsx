import React, { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api';
import { formatDate, formatDateTimeCompact, formatDateISO } from '../../lib/dateFormatter.js';

const Billing = ({ token }) => {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({ totalServiceCharge: 0, salesCount: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [singleDate, setSingleDate] = useState('');
  const [selectedSales, setSelectedSales] = useState(new Set());

  // Load sales data
  const loadSales = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ status: activeTab });
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);

      const res = await apiAuthFetch(`/api/billing?${params}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setSales(data);
      }
    } catch (error) {
      console.error('Error loading sales:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load summary
  const loadSummary = async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);

      const res = await apiAuthFetch(`/api/billing/summary?${params}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Error loading summary:', error);
    }
  };

  // Mark sales as invoiced
  const markAsInvoiced = async () => {
    if (selectedSales.size === 0) {
      alert('Selecciona al menos una venta para facturar');
      return;
    }

    try {
      const res = await apiAuthFetch('/api/billing/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          saleIds: Array.from(selectedSales),
          userId: token?.user?.id 
        })
      }, token);

      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        setSelectedSales(new Set());
        loadSales();
        loadSummary();
      } else {
        const error = await res.json();
        alert(error.error || 'Error al facturar');
      }
    } catch (error) {
      console.error('Error marking as invoiced:', error);
      alert('Error al facturar');
    }
  };

  // Toggle sale selection
  const toggleSaleSelection = (saleId) => {
    const newSelected = new Set(selectedSales);
    if (newSelected.has(saleId)) {
      newSelected.delete(saleId);
    } else {
      newSelected.add(saleId);
    }
    setSelectedSales(newSelected);
  };

  // Toggle select all visible sales (only for pending tab)
  const toggleSelectAll = (checked) => {
    if (!checked) {
      setSelectedSales(new Set());
      return;
    }
    const allIds = sales.map((sale) => sale.id);
    setSelectedSales(new Set(allIds));
  };

  // Format date
  const formatDateTime = (dateString) => formatDateTimeCompact(dateString);

  // Normalize numeric amount
  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  // Format currency
  const formatCurrency = (amount) => {
    const num = toNumber(amount);
    return `$${num.toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  };

  // Get release date (10 days after purchase)
  const getReleaseDate = (purchaseDate) => {
    const date = new Date(purchaseDate);
    date.setDate(date.getDate() + 10);
    return formatDate(date.toISOString());
  };

  // Helpers for date filters in calculator
  const handleSingleDateChange = (value) => {
    setSingleDate(value);
    if (value) {
      setDateFrom(value);
      setDateTo(value);
    } else {
      setDateFrom('');
      setDateTo('');
    }
  };

  const getTodayDateString = () => formatDateISO(new Date());

  const handleUntilToday = () => {
    const todayStr = getTodayDateString();
    setSingleDate('');
    setDateFrom('');
    setDateTo(todayStr);
  };

  // Total de venta (suma de la columna Monto, sin service charge)
  const totalNetSales = sales.reduce((sum, sale) => {
    return sum + toNumber(sale.netAmount ?? sale.totalAmount);
  }, 0);

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'Fecha de compra',
      'Cliente',
      'Email',
      'DNI',
      'Show',
      'Fecha Show',
      'Monto',
      'Service Charge',
      'Liberación',
      'Estado Facturación',
      'Fecha Facturación',
      'Facturado por'
    ];

    const csvData = sales.map(sale => [
      formatDate(sale.createdAt),
      sale.customerName || 'N/A',
      sale.customerEmail || 'N/A',
      sale.customerDni || 'N/A',
      sale.showTitle || 'N/A',
      sale.sessionDate ? formatDate(sale.sessionDate) : 'N/A',
      // Monto neto (butacas sin service charge)
      sale.netAmount ?? sale.totalAmount,
      sale.serviceCharge,
      getReleaseDate(sale.createdAt),
      sale.billingStatus === 'invoiced' ? 'Facturado' : 'Pendiente',
      sale.invoicedAt ? formatDateTime(sale.invoicedAt) : 'N/A',
      sale.invoicedBy ? sale.invoicedBy.name : 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `facturacion_${activeTab}_${formatDateISO(new Date())}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get billing status badge
  const getBillingStatusBadge = (status) => {
    if (status === 'invoiced') {
      return (
        <span style={{
          backgroundColor: '#6b7280',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          Facturado
        </span>
      );
    } else {
      return (
        <span style={{
          backgroundColor: '#10b981',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          Facturar
        </span>
      );
    }
  };

  useEffect(() => {
    loadSales();
    loadSummary();
  }, [activeTab, dateFrom, dateTo]);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Facturador</h2>
      
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'pending' ? '#3b82f6' : '#e5e7eb',
            color: activeTab === 'pending' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Por Facturar ({sales.filter(s => s.billingStatus === 'pending').length})
        </button>
        <button
          onClick={() => setActiveTab('invoiced')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'invoiced' ? '#3b82f6' : '#e5e7eb',
            color: activeTab === 'invoiced' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Facturados ({sales.filter(s => s.billingStatus === 'invoiced').length})
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Sales Table */}
        <div style={{ flex: 1 }}>
          {loading ? (
            <div>Cargando...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>
                    {activeTab === 'pending' && (
                      <input
                        type="checkbox"
                        checked={
                          sales.length > 0 &&
                          selectedSales.size === sales.length
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                  </th>
                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>Fecha de compra</th>
                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>Show</th>
                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>Monto</th>
                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>Service Charge</th>
                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>Liberación</th>
                  <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>Facturado</th>
                  {activeTab === 'invoiced' && (
                    <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #d1d5db' }}>Facturado por</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                      {activeTab === 'pending' && (
                        <input
                          type="checkbox"
                          checked={selectedSales.has(sale.id)}
                          onChange={() => toggleSaleSelection(sale.id)}
                        />
                      )}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                      {formatDate(sale.createdAt)}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                      <div>
                        <div style={{ fontWeight: '600' }}>{sale.showTitle || 'N/A'}</div>
                        {sale.sessionDate && (
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {new Date(sale.sessionDate).toLocaleDateString('es-AR')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                      {formatCurrency(toNumber(sale.netAmount ?? sale.totalAmount))}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                      {formatCurrency(sale.serviceCharge)}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                      {getReleaseDate(sale.createdAt)}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                      {getBillingStatusBadge(sale.billingStatus)}
                      {sale.invoicedAt && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                          {formatDate(sale.invoicedAt)}
                        </div>
                      )}
                    </td>
                    {activeTab === 'invoiced' && (
                      <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>
                        {sale.invoicedBy ? (
                          <div>
                            <div style={{ fontWeight: '600' }}>{sale.invoicedBy.name}</div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>{sale.invoicedBy.email}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#6b7280' }}>N/A</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Calculator Sidebar */}
        <div style={{ width: '300px', backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px' }}>
          <h3>Calculador de Service Charge</h3>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '600' }}>
              Desde:
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '600' }}>
              Hasta:
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '600' }}>
              Fecha puntual:
            </label>
            <input
              type="date"
              value={singleDate}
              onChange={(e) => handleSingleDateChange(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '15px', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleUntilToday}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#0ea5e9',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Hasta hoy
            </button>
          </div>

          <div style={{ 
            padding: '15px', 
            backgroundColor: '#e0f2fe', 
            borderRadius: '6px', 
            marginBottom: '15px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '5px' }}>Total Service Charge:</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>
              {formatCurrency(summary.totalServiceCharge)}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>
              {summary.salesCount} ventas
            </div>
          </div>

          <div style={{ 
            padding: '12px', 
            backgroundColor: '#fefce8', 
            borderRadius: '6px', 
            marginBottom: '15px',
            textAlign: 'center',
            border: '1px solid #facc15'
          }}>
            <div style={{ fontSize: '14px', color: '#854d0e', marginBottom: '5px' }}>Total de venta (sin service):</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#854d0e' }}>
              {formatCurrency(totalNetSales)}
            </div>
          </div>

          {activeTab === 'pending' && (
            <button
              onClick={markAsInvoiced}
              disabled={selectedSales.size === 0}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: selectedSales.size > 0 ? '#10b981' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: selectedSales.size > 0 ? 'pointer' : 'not-allowed',
                marginBottom: '10px'
              }}
            >
              Facturar ({selectedSales.size} seleccionados)
            </button>
          )}

          <button
            onClick={exportToCSV}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '10px'
            }}
          >
            Exportar a CSV
          </button>

          <div style={{ marginTop: '15px', fontSize: '12px', color: '#6b7280' }}>
            <p><strong>Nota:</strong> Por defecto se muestran las ventas con fecha de liberación posterior a mañana.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;
