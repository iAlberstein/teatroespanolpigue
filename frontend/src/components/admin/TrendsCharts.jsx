import { useState, useEffect } from 'react';
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
import { Line, Doughnut } from 'react-chartjs-2';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trendsData, setTrendsData] = useState(null);
  const [period, setPeriod] = useState('30'); // 7, 30, 90, 365

  useEffect(() => {
    const fetchTrends = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const res = await apiAuthFetch(
          `/api/reports/trends?days=${period}`,
          { method: 'GET' },
          token
        );
        
        const data = await res.json();
        setTrendsData(data);
      } catch (err) {
        console.error('Error fetching trends:', err);
        setError('Error al cargar gráficos');
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchTrends();
    }
  }, [token, period]);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        Cargando gráficos...
      </div>
    );
  }

  if (error) {
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
    labels: trendsData.trends.dates.map(date => {
      const d = new Date(date);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    }),
    datasets: [
      {
        label: 'Ingresos ($)',
        data: trendsData.trends.revenue,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4
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
      }
    },
    scales: {
      y: {
        beginAtZero: true
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
      {/* Period selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24
      }}>
        <h2 style={{ margin: 0 }}>📈 Gráficos de Tendencias</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {['7', '30', '90', '365'].map(days => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: 6,
                background: period === days ? '#3b82f6' : '#f3f4f6',
                color: period === days ? 'white' : '#374151',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 14
              }}
            >
              {days === '7' ? '7 días' : 
               days === '30' ? '30 días' :
               days === '90' ? '3 meses' :
               '1 año'}
            </button>
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
    </div>
  );
}
