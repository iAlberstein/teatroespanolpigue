import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthFetch } from '../../lib/api';
import { Line } from 'react-chartjs-2';
import { formatDateShort, formatTime } from '../../lib/dateFormatter.js';

export default function Dashboard() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch trends data for last 7 days
        const res = await apiAuthFetch(
          '/api/reports/trends?days=7',
          { method: 'GET' },
          token
        );
        const data = await res.json();
        setDashboardData(data);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchDashboardData();
    }
  }, [token]);

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        Cargando dashboard...
      </div>
    );
  }

  if (!dashboardData) {
    return null;
  }

  const chartData = {
    labels: dashboardData.trends.dates.slice(-7).map(date => formatDateShort(date)),
    datasets: [
      {
        label: 'Ingresos ($)',
        data: dashboardData.trends.revenue.slice(-7),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => '$' + value.toLocaleString('es-AR')
        }
      }
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24
      }}>
        <h2 style={{ margin: 0 }}>📊 Dashboard - Últimos 7 días</h2>
        <div style={{
          fontSize: 14,
          color: '#6b7280',
          background: '#f3f4f6',
          padding: '6px 12px',
          borderRadius: 6
        }}>
          Actualizado: {formatTime(new Date())}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 20,
        marginBottom: 32
      }}>
        {/* Total Sales */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: 12,
          padding: 24,
          color: 'white',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            fontSize: 14,
            opacity: 0.9,
            marginBottom: 8,
            fontWeight: 500
          }}>
            Total Ventas
          </div>
          <div style={{
            fontSize: 42,
            fontWeight: 700,
            marginBottom: 8
          }}>
            {dashboardData.totals.sales}
          </div>
          <div style={{
            fontSize: 13,
            opacity: 0.8
          }}>
            {dashboardData.totals.tickets} entradas vendidas
          </div>
        </div>

        {/* Total Revenue */}
        <div style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          borderRadius: 12,
          padding: 24,
          color: 'white',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            fontSize: 14,
            opacity: 0.9,
            marginBottom: 8,
            fontWeight: 500
          }}>
            Ingresos Totales
          </div>
          <div style={{
            fontSize: 42,
            fontWeight: 700,
            marginBottom: 8
          }}>
            ${(dashboardData.totals.revenue / 1000).toFixed(1)}K
          </div>
          <div style={{
            fontSize: 13,
            opacity: 0.8
          }}>
            ${dashboardData.totals.revenue.toLocaleString('es-AR')}
          </div>
        </div>

        {/* Average Ticket Price */}
        <div style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          borderRadius: 12,
          padding: 24,
          color: 'white',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            fontSize: 14,
            opacity: 0.9,
            marginBottom: 8,
            fontWeight: 500
          }}>
            Precio Promedio
          </div>
          <div style={{
            fontSize: 42,
            fontWeight: 700,
            marginBottom: 8
          }}>
            ${Math.round(dashboardData.totals.revenue / dashboardData.totals.tickets)}
          </div>
          <div style={{
            fontSize: 13,
            opacity: 0.8
          }}>
            por entrada
          </div>
        </div>

        {/* Channels Breakdown */}
        <div style={{
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          borderRadius: 12,
          padding: 24,
          color: 'white',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            fontSize: 14,
            opacity: 0.9,
            marginBottom: 8,
            fontWeight: 500
          }}>
            Canales de Venta
          </div>
          <div style={{
            display: 'flex',
            gap: 20,
            marginTop: 12
          }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {dashboardData.channels.online}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Online
              </div>
            </div>
            <div style={{
              width: 1,
              background: 'rgba(255,255,255,0.3)'
            }} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>
                {dashboardData.channels.boxoffice}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Boletería
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: 32
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 20 }}>
          Ingresos de los últimos 7 días
        </h3>
        <div style={{ height: 250 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Top Shows */}
      {dashboardData.top_shows && dashboardData.top_shows.length > 0 && (
        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: 20 }}>
            🏆 Top Shows de la Semana
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {dashboardData.top_shows.slice(0, 5).map((show, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: 16,
                  background: '#f9fafb',
                  borderRadius: 8,
                  transition: 'transform 0.2s'
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
    </div>
  );
}
