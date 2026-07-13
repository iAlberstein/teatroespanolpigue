import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthFetch } from '../../lib/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatDateShort, formatMonthYear } from '../../lib/dateFormatter.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function TrendsCharts() {
  const { token } = useAuth();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [trendsData, setTrendsData] = useState(null);
  const [periodYears, setPeriodYears] = useState(0);
  const [periodMonths, setPeriodMonths] = useState(1);
  const [periodDays, setPeriodDays] = useState(0);
  const [scReport, setScReport] = useState(null);
  const [scLoading, setScLoading] = useState(true);
  const debounceRef = useRef(null);

  const totalDays = Math.max(1, periodYears * 365 + periodMonths * 30 + periodDays);

  useEffect(() => {
    const fetchServiceChargeReport = async () => {
      setScLoading(true);
      try {
        const res = await apiAuthFetch('/api/billing/service-charge-report', { method: 'GET' }, token);
        if (res.ok) {
          const data = await res.json();
          setScReport(data);
        }
      } catch (err) {
        console.error('Error fetching service charge report:', err);
      } finally {
        setScLoading(false);
      }
    };
    if (token) fetchServiceChargeReport();
  }, [token]);

  const fetchTrends = useCallback(async (days) => {
    const isFirst = !trendsData;
    if (isFirst) setInitialLoading(true);
    else setRefreshing(true);
    setError(null);
    
    try {
      const res = await apiAuthFetch(
        `/api/reports/trends?days=${days}`,
        { method: 'GET' },
        token
      );
      
      const data = await res.json();
      setTrendsData(data);
    } catch (err) {
      console.error('Error fetching trends:', err);
      setError('Error al cargar gráficos');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [token, trendsData]);

  useEffect(() => {
    if (!token) return;
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    // Primera carga: sin debounce. Cambios de slider: debounce 600ms
    if (!trendsData) {
      fetchTrends(totalDays);
    } else {
      debounceRef.current = setTimeout(() => {
        fetchTrends(totalDays);
      }, 600);
    }
    
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [token, totalDays]);

  if (initialLoading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        Cargando gráficos...
      </div>
    );
  }

  if (error && !trendsData) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#dc2626' }}>
        {error}
      </div>
    );
  }

  if (!trendsData) {
    return null;
  }

  // Prepare chart data
  const revenueChartData = {
    labels: trendsData.trends.dates.map(date => formatDateShort(date)),
    datasets: [
      {
        label: 'Ingresos Totales',
        data: trendsData.trends.revenue,
        borderColor: '#ec4899',
        backgroundColor: 'rgba(236, 72, 153, 0.08)',
        fill: true,
        tension: 0.4,
        borderWidth: 2.5
      },
      {
        label: 'Online',
        data: trendsData.trends.revenueOnline || [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        fill: false,
        tension: 0.4,
        borderWidth: 2,
        borderDash: [5, 3]
      },
      {
        label: 'Boletería',
        data: trendsData.trends.revenueBoxoffice || [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        fill: false,
        tension: 0.4,
        borderWidth: 2,
        borderDash: [5, 3]
      }
    ]
  };

  const channelsChartData = {
    labels: ['Online', 'Boletería'],
    datasets: [
      {
        data: [trendsData.channels.online, trendsData.channels.boxoffice],
        backgroundColor: ['#3b82f6', '#10b981'],
        borderWidth: 2,
        borderColor: '#fff'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: $${ctx.raw.toLocaleString('es-AR')}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (v) => '$' + v.toLocaleString('es-AR')
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom'
      }
    }
  };

  return (
    <div>
      {/* Period selector with sliders */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <h2 style={{ margin: 0 }}>Gráficos de Tendencias</h2>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            {refreshing && (
              <div style={{
                fontSize: 12,
                color: '#3b82f6',
                fontWeight: 500,
                animation: 'pulse 1.5s infinite'
              }}>
                Actualizando...
              </div>
            )}
            <div style={{
              background: '#f3f4f6',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 13,
              color: '#374151',
              fontWeight: 600
            }}>
              Período: {totalDays} día{totalDays !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          background: 'white',
          padding: 16,
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          {[
            { label: 'Años', value: periodYears, setter: setPeriodYears, max: 5 },
            { label: 'Meses', value: periodMonths, setter: setPeriodMonths, max: 12 },
            { label: 'Días', value: periodDays, setter: setPeriodDays, max: 30 }
          ].map(({ label, value, setter, max }) => (
            <div key={label}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6
              }}>
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{label}</span>
                <span style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#1f2937',
                  minWidth: 28,
                  textAlign: 'right'
                }}>{value}</span>
              </div>
              <input
                type="range"
                min={0}
                max={max}
                value={value}
                onChange={(e) => setter(parseInt(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#3b82f6',
                  cursor: 'pointer'
                }}
              />
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#9ca3af',
                marginTop: 2
              }}>
                <span>0</span>
                <span>{max}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div style={{
          background: 'white',
          padding: 20,
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
            Total Ventas
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#1f2937' }}>
            {trendsData.totals.sales}
          </div>
        </div>
        <div style={{
          background: 'white',
          padding: 20,
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>
            Total Ingresos
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#059669' }}>
            ${trendsData.totals.revenue.toLocaleString('es-AR')}
          </div>
        </div>
      </div>

      {/* Charts grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: 24
      }}>
        {/* Revenue trend */}
        <div style={{
          background: 'white',
          padding: 20,
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Ingresos en el tiempo</h3>
          <div style={{ height: 300 }}>
            <Line data={revenueChartData} options={chartOptions} />
          </div>
        </div>

        {/* Channels breakdown */}
        <div style={{
          background: 'white',
          padding: 20,
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Ventas por Canal</h3>
          <div style={{ height: 300 }}>
            <Doughnut data={channelsChartData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      {/* Top Shows */}
      {trendsData.top_shows && trendsData.top_shows.length > 0 && (
        <div style={{
          background: 'white',
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginTop: 24
        }}>
          <h3 style={{ marginTop: 0, marginBottom: 20 }}>
            Top Shows del Período
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {trendsData.top_shows.slice(0, 5).map((show, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 16,
                  background: '#f9fafb',
                  borderRadius: 8
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: ['#667eea', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][index],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 18,
                  marginRight: 16
                }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {show.title}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {show.sales} ventas · {show.tickets} entradas
                  </div>
                </div>
                <div style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: '#059669'
                }}>
                  ${show.revenue.toLocaleString('es-AR')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Service Charge Report */}
      <div style={{
        background: 'white',
        borderRadius: 8,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginTop: 24
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>
          Ingresos por Service Charge
        </h3>
        {scReport && scReport.config && (
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            Service charge: {scReport.config.serviceFeePercent}% · Retención SiPago: {scReport.config.sipagoFeeRate}% + IVA ({scReport.config.ivaRate}%)
          </div>
        )}

        {scLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>Cargando reporte...</div>
        ) : !scReport || scReport.months.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>No hay datos disponibles.</div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 24
            }}>
              <div style={{ background: '#f0fdf4', padding: 16, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#059669', marginBottom: 4 }}>Total Service Charge</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>
                  ${scReport.totals.serviceChargeTotal.toLocaleString('es-AR')}
                </div>
              </div>
              <div style={{ background: '#fef2f2', padding: 16, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 4 }}>Retención SiPago</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>
                  -${scReport.totals.sipagoRetentionTotal.toLocaleString('es-AR')}
                </div>
              </div>
              <div style={{ background: '#eff6ff', padding: 16, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#2563eb', marginBottom: 4 }}>Neto Plataforma</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>
                  ${scReport.totals.platformNetTotal.toLocaleString('es-AR')}
                </div>
              </div>
              <div style={{ background: '#f9fafb', padding: 16, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Ventas Online</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#1f2937' }}>
                  {scReport.totals.salesCount.toLocaleString('es-AR')}
                </div>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ height: 350, marginBottom: 24 }}>
              <Bar
                data={{
                  labels: scReport.months.map(m => {
                    const [y, mo] = m.month.split('-');
                    const d = new Date(y, parseInt(mo) - 1);
                    return formatMonthYear(d);
                  }),
                  datasets: [
                    {
                      label: 'Service Charge',
                      data: scReport.months.map(m => m.serviceChargeTotal),
                      backgroundColor: 'rgba(16, 185, 129, 0.7)',
                      borderColor: '#059669',
                      borderWidth: 1
                    },
                    {
                      label: 'Retención SiPago',
                      data: scReport.months.map(m => m.sipagoRetentionTotal),
                      backgroundColor: 'rgba(220, 38, 38, 0.7)',
                      borderColor: '#dc2626',
                      borderWidth: 1
                    },
                    {
                      label: 'Neto Plataforma',
                      data: scReport.months.map(m => m.platformNetTotal),
                      backgroundColor: 'rgba(37, 99, 235, 0.7)',
                      borderColor: '#2563eb',
                      borderWidth: 1
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: $${ctx.raw.toLocaleString('es-AR')}`
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (v) => '$' + v.toLocaleString('es-AR')
                      }
                    }
                  }
                }}
              />
            </div>

            {/* Detail table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Mes</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ventas</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Monto Bruto</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>Service Charge</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>Retención SiPago</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>Neto Plataforma</th>
                  </tr>
                </thead>
                <tbody>
                  {scReport.months.map((m) => {
                    const [y, mo] = m.month.split('-');
                    const d = new Date(y, parseInt(mo) - 1);
                    const label = formatMonthYear(d);
                    return (
                      <tr key={m.month} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{label}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{m.salesCount}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>${m.grossTotal.toLocaleString('es-AR')}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>${m.serviceChargeTotal.toLocaleString('es-AR')}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>-${m.sipagoRetentionTotal.toLocaleString('es-AR')}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#2563eb', fontWeight: 700 }}>${m.platformNetTotal.toLocaleString('es-AR')}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f9fafb', borderTop: '2px solid #d1d5db', fontWeight: 700 }}>
                    <td style={{ padding: '10px 12px' }}>TOTAL</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{scReport.totals.salesCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>${scReport.totals.grossTotal.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>${scReport.totals.serviceChargeTotal.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626' }}>-${scReport.totals.sipagoRetentionTotal.toLocaleString('es-AR')}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#2563eb' }}>${scReport.totals.platformNetTotal.toLocaleString('es-AR')}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
