import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api';
import { theme } from '../../styles/theme.js';
import { formatDate, formatDateISO } from '../../lib/dateFormatter.js';

export default function AportesAdmin({ token }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  const [activeTab, setActiveTab] = useState('resumen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Data states
  const [resumen, setResumen] = useState(null);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [allAportes, setAllAportes] = useState([]);
  const [searchDni, setSearchDni] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  useEffect(() => {
    if (activeTab === 'resumen') loadResumen();
    if (activeTab === 'pending') loadPendingTransfers();
    if (activeTab === 'all') loadAllAportes();
  }, [activeTab]);

  const loadResumen = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/aportes/admin/resumen', {}, token);
      const data = await res.json();
      if (res.ok) setResumen(data);
    } catch (e) {
      setError('Error cargando resumen');
    } finally {
      setLoading(false);
    }
  };

  const loadPendingTransfers = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/aportes/admin/pending-transfers', {}, token);
      const data = await res.json();
      if (res.ok) setPendingTransfers(data.aportes || []);
    } catch (e) {
      setError('Error cargando transferencias pendientes');
    } finally {
      setLoading(false);
    }
  };

  const loadAllAportes = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/aportes/admin/all', {}, token);
      const data = await res.json();
      if (res.ok) setAllAportes(data.aportes || []);
    } catch (e) {
      setError('Error cargando aportes');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTransfer = async (id, approved) => {
    setLoading(true);
    try {
      const res = await apiAuthFetch(`/api/aportes/verify-transfer/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, verified_by: 'Admin' })
      }, token);
      
      const data = await res.json();
      if (res.ok) {
        setSuccess(approved ? 'Transferencia aprobada exitosamente' : 'Transferencia rechazada');
        loadPendingTransfers();
      } else {
        setError(data.error || 'Error al verificar');
      }
    } catch (e) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!allAportes.length) return;
    const headers = ['N° Aporte','Nombre','Apellido','DNI','Email','Teléfono','Provincia','Localidad','Monto','Método Pago','Estado','Referido DNI','Fecha'];
    const rows = allAportes.map(a => [
      a.numero_aporte,
      a.nombre,
      a.apellido,
      a.dni,
      a.email,
      a.telefono,
      a.provincia,
      a.localidad,
      a.monto,
      a.payment_method,
      a.payment_status,
      a.referido_dni || '',
      a.created_at ? formatDate(a.created_at) : ''
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aportes_${formatDateISO(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSearch = async () => {
    if (!searchDni) return;
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/aportes/my-aportes?dni=${searchDni}`);
      const data = await res.json();
      if (res.ok) {
        setSearchResults(data);
      } else {
        setError('DNI no encontrado');
        setSearchResults(null);
      }
    } catch (e) {
      setError('Error de búsqueda');
    } finally {
      setLoading(false);
    }
  };

  const renderTabs = () => (
    <div style={{
      display: 'flex',
      gap: isMobile ? '8px' : '16px',
      marginBottom: '24px',
      borderBottom: `2px solid ${theme.colors.border}`,
      flexWrap: 'wrap',
    }}>
      {[
        { id: 'resumen', label: 'Resumen' },
        { id: 'pending', label: 'Transferencias Pendientes' },
        { id: 'search', label: 'Buscar por DNI' },
        { id: 'all', label: 'Todos los Aportes' },
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => {
            setActiveTab(tab.id);
            setError(null);
            setSuccess(null);
          }}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === tab.id ? `3px solid ${theme.colors.primary}` : 'none',
            color: activeTab === tab.id ? theme.colors.primary : theme.colors.textSecondary,
            fontWeight: theme.typography.semibold,
            fontSize: theme.typography.small,
            cursor: 'pointer',
            marginBottom: '-2px',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const renderResumen = () => {
    if (!resumen) return <p>Cargando...</p>;

    return (
      <div style={{ display: 'grid', gap: '16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: '16px',
        }}>
          <StatCard title="Total Aportes" value={resumen.total_aportes} color="#3b82f6" />
          <StatCard title="Aprobados" value={resumen.aprobados} color="#10b981" />
          <StatCard title="Pendientes" value={resumen.pendientes} color="#f59e0b" />
          <StatCard title="Rechazados" value={resumen.rechazados} color="#ef4444" />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: '16px',
          marginTop: '16px',
        }}>
          <StatCard 
            title="Monto Total Recaudado" 
            value={`$${resumen.monto_total_recaudado?.toLocaleString('es-AR')}`}
            color="#7c3aed"
          />
          <StatCard title="Total Referidos" value={resumen.total_referidos} color="#ec4899" />
          <StatCard title="Bonus Otorgados" value={resumen.total_bonus_otorgados} color="#06b6d4" />
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
          borderRadius: theme.borderRadius.lg,
          padding: '24px',
          color: '#ffffff',
          textAlign: 'center',
          marginTop: '16px',
        }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px', opacity: 0.9 }}>
            TOTAL NÚMEROS PARA SORTEO
          </p>
          <p style={{ margin: 0, fontSize: '48px', fontWeight: '700' }}>
            {resumen.numeros_sorteo}
          </p>
          <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.9 }}>
            (Aportes aprobados + Bonus)
          </p>
        </div>
      </div>
    );
  };

  const renderPendingTransfers = () => {
    if (pendingTransfers.length === 0) {
      return (
        <div style={{
          background: '#f0fdf4',
          borderRadius: theme.borderRadius.md,
          padding: '24px',
          textAlign: 'center',
        }}>
          <p style={{ margin: 0, color: '#065f46' }}>
            🎉 No hay transferencias pendientes de verificación
          </p>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {pendingTransfers.map(aporte => (
          <div
            key={aporte.id}
            style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.md,
              padding: '16px',
            }}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
              gap: '12px',
              marginBottom: '16px',
            }}>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: theme.colors.textMuted }}>Aporte #{aporte.numero_aporte}</p>
                <p style={{ margin: 0, fontWeight: 600 }}>{aporte.nombre}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: theme.colors.textSecondary }}>
                  DNI: {aporte.dni}
                </p>
              </div>
              <div>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px' }}>
                  <strong>Monto:</strong> ${aporte.monto?.toLocaleString('es-AR')}
                </p>
                <p style={{ margin: '0 0 4px 0', fontSize: '14px' }}>
                  <strong>Email:</strong> {aporte.email}
                </p>
                <p style={{ margin: 0, fontSize: '14px', color: theme.colors.textSecondary }}>
                  {aporte.provincia}, {aporte.localidad}
                </p>
              </div>
            </div>

            {aporte.transfer_receipt_url && (
              <div style={{ marginBottom: '16px' }}>
                <a 
                  href={aporte.transfer_receipt_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    borderRadius: theme.borderRadius.md,
                    textDecoration: 'none',
                    fontSize: '14px',
                  }}
                >
                  📎 Ver comprobante
                </a>
              </div>
            )}

            {aporte.referido_dni && (
              <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#7c3aed' }}>
                Referido por DNI: {aporte.referido_dni}
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleVerifyTransfer(aporte.id, true)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: loading ? 'wait' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                ✓ Aprobar
              </button>
              <button
                onClick={() => handleVerifyTransfer(aporte.id, false)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: loading ? 'wait' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                ✗ Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSearch = () => (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <input
          type="text"
          value={searchDni}
          onChange={(e) => setSearchDni(e.target.value)}
          placeholder="Ingresá un DNI"
          maxLength={8}
          style={{
            flex: 1,
            padding: '12px',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.body,
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !searchDni}
          style={{
            padding: '12px 24px',
            background: theme.colors.primary,
            color: '#ffffff',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: theme.typography.body,
            fontWeight: 600,
          }}
        >
          Buscar
        </button>
      </div>

      {searchResults && (
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.borderRadius.md,
          padding: '24px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
            Resultados para DNI: {searchResults.dni}
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: '12px',
            marginBottom: '20px',
          }}>
            <StatCard title="Aportes" value={searchResults.total_aportes} color="#3b82f6" small />
            <StatCard title="Bonus Otorgados" value={searchResults.total_bonus_otorgados} color="#ec4899" small />
            <StatCard title="Bonus Recibidos" value={searchResults.total_bonus_recibidos} color="#06b6d4" small />
            <StatCard title="Chances Sorteo" value={searchResults.total_chances_sorteo} color="#10b981" small />
          </div>

          {searchResults.aportes.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: theme.colors.textSecondary }}>
                Números de aporte:
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {searchResults.aportes.map(aporte => (
                  <span
                    key={aporte.id}
                    style={{
                      background: '#059669',
                      color: '#ffffff',
                      padding: '8px 12px',
                      borderRadius: theme.borderRadius.md,
                      fontSize: '14px',
                      fontWeight: 600,
                    }}
                  >
                    #{aporte.numero_aporte}
                  </span>
                ))}
              </div>
            </div>
          )}

          {searchResults.referidos_realizados.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: theme.colors.textSecondary }}>
                Referidos realizados:
              </h4>
              {searchResults.referidos_realizados.map(ref => (
                <p key={ref.id} style={{ margin: '4px 0', fontSize: '14px' }}>
                  {ref.referido_nombre} (DNI: {ref.referido_dni}) - +{ref.bonus_extra} bonus
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderAllAportes = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ color: theme.colors.textMuted, fontSize: '14px', margin: 0 }}>
          Mostrando {allAportes.length} aportes
        </p>
        <button
          onClick={handleExportCSV}
          disabled={!allAportes.length}
          style={{
            padding: '8px 16px',
            background: '#059669',
            color: '#fff',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: allAportes.length ? 'pointer' : 'not-allowed',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          ⬇ Exportar CSV
        </button>
      </div>
      {allAportes.map(aporte => (
        <div
          key={aporte.id}
          style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.borderRadius.md,
            padding: '12px',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>#{aporte.numero_aporte}</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: theme.colors.textMuted }}>
              {aporte.nombre} {aporte.apellido}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '14px' }}>DNI: {aporte.dni}</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: theme.colors.textSecondary }}>
              {aporte.email}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '14px' }}>${aporte.monto?.toLocaleString('es-AR')}</p>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: theme.colors.textMuted }}>
              {aporte.payment_method}
            </p>
          </div>
          <div>
            <span style={{
              display: 'inline-block',
              padding: '4px 8px',
              borderRadius: theme.borderRadius.sm,
              fontSize: '12px',
              fontWeight: 600,
              background: aporte.payment_status === 'approved' ? '#d1fae5' : 
                         aporte.payment_status === 'rejected' ? '#fee2e2' : '#fef3c7',
              color: aporte.payment_status === 'approved' ? '#065f46' :
                     aporte.payment_status === 'rejected' ? '#991b1b' : '#92400e',
            }}>
              {aporte.payment_status === 'approved' ? 'Aprobado' :
               aporte.payment_status === 'rejected' ? 'Rechazado' : 'Pendiente'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <h2 style={{ margin: '0 0 24px 0', fontSize: '24px' }}>
        Gestión de Aportes Solidarios
      </h2>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #ef4444',
          borderRadius: theme.borderRadius.md,
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#dc2626',
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #10b981',
          borderRadius: theme.borderRadius.md,
          padding: '12px 16px',
          marginBottom: '16px',
          color: '#065f46',
        }}>
          {success}
        </div>
      )}

      {renderTabs()}

      {activeTab === 'resumen' && renderResumen()}
      {activeTab === 'pending' && renderPendingTransfers()}
      {activeTab === 'search' && renderSearch()}
      {activeTab === 'all' && renderAllAportes()}
    </div>
  );
}

function StatCard({ title, value, color, small }) {
  return (
    <div style={{
      background: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.borderRadius.md,
      padding: small ? '12px' : '20px',
      textAlign: 'center',
    }}>
      <p style={{
        margin: '0 0 8px 0',
        fontSize: small ? '12px' : '14px',
        color: theme.colors.textSecondary,
      }}>
        {title}
      </p>
      <p style={{
        margin: 0,
        fontSize: small ? '20px' : '32px',
        fontWeight: '700',
        color: color,
      }}>
        {value}
      </p>
    </div>
  );
}
