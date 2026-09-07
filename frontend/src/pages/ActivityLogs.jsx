import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiAuthFetch } from '../lib/api';
import { formatDateTimeCompact } from '../lib/dateFormatter.js';
import Button from '../components/ui/Button';

export default function ActivityLogs() {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState({
    action_type: '',
    entity_type: '',
    user_id: '',
    from_date: '',
    to_date: '',
    search: ''
  });
  
  const [actionTypes, setActionTypes] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [exporting, setExporting] = useState(false);

  // Fetch action and entity types for filters
  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const [actionsRes, entitiesRes] = await Promise.all([
          apiAuthFetch('/api/activity-logs/action-types', { method: 'GET' }, token),
          apiAuthFetch('/api/activity-logs/entity-types', { method: 'GET' }, token)
        ]);
        
        const actionsData = await actionsRes.json();
        const entitiesData = await entitiesRes.json();
        
        setActionTypes(actionsData.action_types || []);
        setEntityTypes(entitiesData.entity_types || []);
      } catch (err) {
        console.error('Error fetching types:', err);
      }
    };
    
    if (token) {
      fetchTypes();
    }
  }, [token]);

  // Fetch logs
  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '50'
        });
        
        Object.keys(filters).forEach(key => {
          if (filters[key]) {
            params.append(key, filters[key]);
          }
        });
        
        const res = await apiAuthFetch(
          `/api/activity-logs?${params.toString()}`,
          { method: 'GET' },
          token
        );
        
        const data = await res.json();
        
        setLogs(data.logs || []);
        setTotalPages(data.pagination?.pages || 1);
        setTotal(data.pagination?.total || 0);
      } catch (err) {
        console.error('Error fetching logs:', err);
        setError('Error al cargar los logs');
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchLogs();
    }
  }, [token, page, filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page on filter change
  };

  const handleClearFilters = () => {
    setFilters({
      action_type: '',
      entity_type: '',
      user_id: '',
      from_date: '',
      to_date: '',
      search: ''
    });
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          params.append(key, filters[key]);
        }
      });
      
      const res = await apiAuthFetch(
        `/api/activity-logs/export/csv?${params.toString()}`,
        { method: 'GET' },
        token
      );
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs_actividad_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting:', err);
      alert('Error al exportar logs');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return formatDateTimeCompact(dateString);
  };

  const formatActionType = (action) => {
    const actions = {
      login: 'Inicio de sesión',
      logout: 'Cierre de sesión',
      register: 'Registro',
      sale_create: 'Venta creada',
      sale_online: 'Venta online',
      sale_boxoffice: 'Venta en boletería',
      ticket_validate: 'Entrada validada',
      show_create: 'Show creado',
      show_update: 'Show actualizado',
      session_create: 'Sesión creada',
      discount_create: 'Cupón creado',
      discount_update: 'Cupón actualizado',
      user_role_change: 'Cambio de rol',
      user_status_change: 'Cambio de estado',
      bordereaux_close: 'Bordereau cerrado'
    };
    return actions[action] || action;
  };

  const formatEntityType = (entity) => {
    const entities = {
      user: 'Usuario',
      show: 'Show',
      session: 'Sesión',
      sale: 'Venta',
      ticket: 'Entrada',
      discount: 'Cupón',
      bordereaux: 'Bordereau'
    };
    return entities[entity] || entity;
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      admin: '#dc2626',
      boleteria: '#059669',
      espectador: '#6b7280'
    };
    return colors[role] || '#6b7280';
  };

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}> Logs de Actividad</h1>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exportando...' : ' Exportar CSV'}
        </Button>
      </div>

      {/* Filters */}
      <div style={{
        background: '#f9fafb',
        padding: 20,
        borderRadius: 8,
        marginBottom: 24
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {/* Action Type Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
              Tipo de acción
            </label>
            <select
              value={filters.action_type}
              onChange={(e) => handleFilterChange('action_type', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            >
              <option value="">Todos</option>
              {actionTypes.map(type => (
                <option key={type} value={type}>{formatActionType(type)}</option>
              ))}
            </select>
          </div>

          {/* Entity Type Filter */}
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
              Tipo de entidad
            </label>
            <select
              value={filters.entity_type}
              onChange={(e) => handleFilterChange('entity_type', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            >
              <option value="">Todos</option>
              {entityTypes.map(type => (
                <option key={type} value={type}>{formatEntityType(type)}</option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
              Desde
            </label>
            <input
              type="date"
              value={filters.from_date}
              onChange={(e) => handleFilterChange('from_date', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            />
          </div>

          {/* To Date */}
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
              Hasta
            </label>
            <input
              type="date"
              value={filters.to_date}
              onChange={(e) => handleFilterChange('to_date', e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #d1d5db',
                fontSize: 14
              }}
            />
          </div>

          {/* Search */}
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
              Buscar en detalles
            </label>
            <input
              type="text"
              placeholder="Buscar..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
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

        <div style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={handleClearFilters}>
            Limpiar filtros
          </Button>
        </div>
      </div>

      {/* Results count */}
      <div style={{ marginBottom: 16, color: '#6b7280', fontSize: 14 }}>
        Mostrando {logs.length} de {total} registros
      </div>

      {/* Logs table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>Cargando...</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#dc2626' }}>{error}</div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          No se encontraron registros
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 8 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>Fecha/Hora</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>Usuario</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>Acción</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>Entidad</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>Detalles</th>
                  <th style={{ padding: 12, textAlign: 'left', fontSize: 14, fontWeight: 600 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr key={log.id} style={{
                    borderBottom: index < logs.length - 1 ? '1px solid #e5e7eb' : 'none',
                    background: index % 2 === 0 ? 'white' : '#f9fafb'
                  }}>
                    <td style={{ padding: 12, fontSize: 13 }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{log.user?.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{log.user?.email}</div>
                      <div style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'white',
                        background: getRoleBadgeColor(log.user?.role),
                        marginTop: 4
                      }}>
                        {log.user?.role}
                      </div>
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>
                      {formatActionType(log.action_type)}
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>
                      <div>{formatEntityType(log.entity_type)}</div>
                      {log.entity_id && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          ID: {log.entity_id.substring(0, 8)}...
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 12, fontSize: 12, maxWidth: 300 }}>
                      {log.details && (
                        <div style={{
                          background: '#f3f4f6',
                          padding: 8,
                          borderRadius: 4,
                          maxHeight: 80,
                          overflow: 'auto',
                          fontFamily: 'monospace'
                        }}>
                          {typeof log.details === 'object'
                            ? JSON.stringify(log.details, null, 2)
                            : log.details
                          }
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
                      {log.ip_address || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
              marginTop: 24
            }}>
              <Button
                variant="secondary"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                ← Anterior
              </Button>
              <span style={{ fontSize: 14, color: '#6b7280' }}>
                Página {page} de {totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Siguiente →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
