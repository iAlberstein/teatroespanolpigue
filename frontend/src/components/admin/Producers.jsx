import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import Card from '../ui/Card';
import Button from '../ui/Button';

export default function Producers() {
  const { token } = useAuth();
  const [producers, setProducers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  });

  const theme = {
    colors: {
      primary: '#2563eb',
      success: '#10b981',
      danger: '#ef4444',
      warning: '#f59e0b',
      surface: '#ffffff',
      surfaceAlt: '#f9fafb',
      border: '#e5e7eb',
      borderLight: '#f3f4f6',
      text: '#111827',
      textMuted: '#6b7280'
    },
    spacing: {
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px'
    },
    typography: {
      tiny: '12px',
      small: '14px',
      medium: 500
    },
    borderRadius: {
      md: '8px'
    }
  };

  useEffect(() => {
    loadProducers();
  }, []);

  const loadProducers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiAuthFetch('/api/producers', { method: 'GET' }, token);
      const data = await res.json();
      
      if (res.ok) {
        setProducers(data.producers || []);
      } else {
        setError(data.error || 'Error al cargar productores');
      }
    } catch (err) {
      setError('Error al cargar productores');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ name: '', email: '', phone: '' });
    setShowModal(true);
  };

  const handleEdit = (producer) => {
    setEditingId(producer.id);
    setFormData({
      name: producer.name,
      email: producer.email || '',
      phone: producer.phone || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      const url = editingId ? `/api/producers/${editingId}` : '/api/producers';
      const method = editingId ? 'PATCH' : 'POST';
      
      const res = await apiAuthFetch(url, {
        method,
        body: JSON.stringify(formData)
      }, token);

      const data = await res.json();

      if (res.ok) {
        setSuccess(editingId ? 'Productor actualizado' : 'Productor creado');
        setShowModal(false);
        loadProducers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Error al guardar');
      }
    } catch (err) {
      setError('Error al guardar productor');
      console.error(err);
    }
  };

  const handleToggleActive = async (id, currentActive) => {
    if (!confirm(`¿${currentActive ? 'Desactivar' : 'Activar'} este productor?`)) return;

    try {
      const res = await apiAuthFetch(`/api/producers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !currentActive })
      }, token);

      if (res.ok) {
        setSuccess(`Productor ${currentActive ? 'desactivado' : 'activado'}`);
        loadProducers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al cambiar estado');
      }
    } catch (err) {
      setError('Error al cambiar estado');
      console.error(err);
    }
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.lg
      }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Productores</h2>
        <Button onClick={handleCreate} variant="primary">
          + Nuevo Productor
        </Button>
      </div>

      {error && (
        <div style={{
          padding: theme.spacing.md,
          background: '#fee2e2',
          color: '#dc2626',
          borderRadius: theme.borderRadius.md,
          marginBottom: theme.spacing.md
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: theme.spacing.md,
          background: '#d1fae5',
          color: '#059669',
          borderRadius: theme.borderRadius.md,
          marginBottom: theme.spacing.md
        }}>
          {success}
        </div>
      )}

      {loading ? (
        <Card>
          <div style={{ padding: theme.spacing.xl, textAlign: 'center', color: theme.colors.textMuted }}>
            Cargando productores...
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.colors.surfaceAlt, borderBottom: `2px solid ${theme.colors.border}` }}>
                  <th style={{ padding: theme.spacing.sm, textAlign: 'left' }}>Nombre</th>
                  <th style={{ padding: theme.spacing.sm, textAlign: 'left' }}>Contacto</th>
                  <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Estado</th>
                  <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {producers.map(producer => (
                  <tr key={producer.id} style={{ borderBottom: `1px solid ${theme.colors.borderLight}` }}>
                    <td style={{ padding: theme.spacing.sm }}>
                      <div style={{ fontWeight: theme.typography.medium }}>{producer.name}</div>
                    </td>
                    <td style={{ padding: theme.spacing.sm }}>
                      {producer.email && <div style={{ fontSize: theme.typography.tiny }}>{producer.email}</div>}
                      {producer.phone && <div style={{ fontSize: theme.typography.tiny }}>Tel: {producer.phone}</div>}
                    </td>
                    <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        background: producer.active ? theme.colors.success : theme.colors.textMuted,
                        color: theme.colors.surface,
                        borderRadius: 4,
                        fontSize: theme.typography.tiny,
                        fontWeight: theme.typography.medium
                      }}>
                        {producer.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: theme.spacing.xs, justifyContent: 'center' }}>
                        <button
                          onClick={() => handleEdit(producer)}
                          style={{
                            padding: '4px 12px',
                            background: theme.colors.primary,
                            color: theme.colors.surface,
                            border: 'none',
                            borderRadius: 4,
                            fontSize: theme.typography.tiny,
                            cursor: 'pointer'
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleToggleActive(producer.id, producer.active)}
                          style={{
                            padding: '4px 12px',
                            background: producer.active ? theme.colors.warning : theme.colors.success,
                            color: theme.colors.surface,
                            border: 'none',
                            borderRadius: 4,
                            fontSize: theme.typography.tiny,
                            cursor: 'pointer'
                          }}
                        >
                          {producer.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {producers.length === 0 && (
            <div style={{ padding: theme.spacing.lg, textAlign: 'center', color: theme.colors.textMuted }}>
              No hay productores registrados
            </div>
          )}
        </Card>
      )}

      {/* Modal de crear/editar */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            maxWidth: 500,
            width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              padding: 24,
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {editingId ? 'Editar Productor' : 'Nuevo Productor'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: 0,
                  width: 32,
                  height: 32
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 6
                }}>
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 6
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 500,
                  marginBottom: 6
                }}>
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  onClick={() => setShowModal(false)}
                  variant="secondary"
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary">
                  {editingId ? 'Guardar' : 'Crear'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
