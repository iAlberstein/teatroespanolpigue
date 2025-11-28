import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthFetch } from '../../lib/api';
import Button from '../ui/Button';

export default function ComparisonReport() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [comparison, setComparison] = useState(null);
  
  const [period1Start, setPeriod1Start] = useState('');
  const [period1End, setPeriod1End] = useState('');
  const [period2Start, setPeriod2Start] = useState('');
  const [period2End, setPeriod2End] = useState('');

  const handleCompare = async () => {
    if (!period1Start || !period1End || !period2Start || !period2End) {
      setError('Por favor completá todos los campos de fecha');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        period1_start: period1Start,
        period1_end: period1End,
        period2_start: period2Start,
        period2_end: period2End
      });
      
      const res = await apiAuthFetch(
        `/api/reports/compare?${params.toString()}`,
        { method: 'GET' },
        token
      );
      
      const data = await res.json();
      setComparison(data);
    } catch (err) {
      console.error('Error comparing periods:', err);
      setError('Error al comparar períodos');
    } finally {
      setLoading(false);
    }
  };

  const formatChange = (value) => {
    if (value > 0) {
      return (
        <span style={{ color: '#059669', fontWeight: 600 }}>
          +{value.toFixed(1)}%
        </span>
      );
    } else if (value < 0) {
      return (
        <span style={{ color: '#dc2626', fontWeight: 600 }}>
          {value.toFixed(1)}%
        </span>
      );
    } else {
      return <span style={{ color: '#6b7280' }}>0%</span>;
    }
  };

  const formatCurrency = (value) => {
    return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>🔄 Comparación de Períodos</h2>

      {/* Date inputs */}
      <div style={{
        background: '#f9fafb',
        padding: 20,
        borderRadius: 8,
        marginBottom: 24
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
          {/* Period 1 */}
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16 }}>Período 1</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                  Desde
                </label>
                <input
                  type="date"
                  value={period1Start}
                  onChange={(e) => setPeriod1Start(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                  Hasta
                </label>
                <input
                  type="date"
                  value={period1End}
                  onChange={(e) => setPeriod1End(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                />
              </div>
            </div>
          </div>

          {/* Period 2 */}
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 16 }}>Período 2</h3>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                  Desde
                </label>
                <input
                  type="date"
                  value={period2Start}
                  onChange={(e) => setPeriod2Start(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                  Hasta
                </label>
                <input
                  type="date"
                  value={period2End}
                  onChange={(e) => setPeriod2End(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #d1d5db',
                    fontSize: 14
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Button onClick={handleCompare} disabled={loading}>
            {loading ? 'Comparando...' : 'Comparar Períodos'}
          </Button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: 12, background: '#fee2e2', color: '#dc2626', borderRadius: 4 }}>
            {error}
          </div>
        )}
      </div>

      {/* Comparison results */}
      {comparison && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginBottom: 24 }}>
            {/* Period 1 stats */}
            <div style={{
              background: 'white',
              padding: 20,
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Período 1
              </h3>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
                {formatDate(comparison.period1.start)} - {formatDate(comparison.period1.end)}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Ventas</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{comparison.period1.sales_count}</div>
                </div>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Ingresos</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>
                    {formatCurrency(comparison.period1.total_revenue)}
                  </div>
                </div>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Entradas</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{comparison.period1.total_tickets}</div>
                </div>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Precio promedio por entrada</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>
                    {formatCurrency(comparison.period1.avg_ticket_price)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Canales</div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    Online: {comparison.period1.channels.online} | Boletería: {comparison.period1.channels.boxoffice}
                  </div>
                </div>
              </div>
            </div>

            {/* Period 2 stats */}
            <div style={{
              background: 'white',
              padding: 20,
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginTop: 0, marginBottom: 16 }}>
                Período 2
              </h3>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
                {formatDate(comparison.period2.start)} - {formatDate(comparison.period2.end)}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Ventas</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{comparison.period2.sales_count}</div>
                </div>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Ingresos</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#059669' }}>
                    {formatCurrency(comparison.period2.total_revenue)}
                  </div>
                </div>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Entradas</div>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{comparison.period2.total_tickets}</div>
                </div>
                <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Precio promedio por entrada</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>
                    {formatCurrency(comparison.period2.avg_ticket_price)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Canales</div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    Online: {comparison.period2.channels.online} | Boletería: {comparison.period2.channels.boxoffice}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Changes */}
          <div style={{
            background: 'white',
            padding: 20,
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Cambios (Período 2 vs Período 1)</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div style={{ textAlign: 'center', padding: 16, background: '#f9fafb', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Ventas</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {formatChange(comparison.changes.sales_count)}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, background: '#f9fafb', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Ingresos</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {formatChange(comparison.changes.total_revenue)}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, background: '#f9fafb', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Entradas</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {formatChange(comparison.changes.total_tickets)}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, background: '#f9fafb', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Precio/Entrada</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {formatChange(comparison.changes.avg_ticket_price)}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: 16, background: '#f9fafb', borderRadius: 6 }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>Monto/Venta</div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {formatChange(comparison.changes.avg_sale_amount)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
