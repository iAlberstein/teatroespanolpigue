import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import UserTicketsModal from './UserTicketsModal';
import LocationSelector from '../LocationSelector';

export default function Users() {
  const { token, user: authUser } = useAuth();
  const isBoleteria = authUser?.role === 'boleteria';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Edit modal
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', dni: '', provincia: '', localidad: '' });
  
  // Tickets modal
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Roles
  const [availableRoles, setAvailableRoles] = useState([]);
  const [rolesModalUser, setRolesModalUser] = useState(null);
  const [addingRole, setAddingRole] = useState('');

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
    spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px' },
    typography: { tiny: '11px', small: '13px', medium: 500 }
  };

  useEffect(() => {
    loadUsers();
  }, [page, searchTerm, roleFilter, activeFilter, isBoleteria]);

  useEffect(() => {
    if (!isBoleteria) loadAvailableRoles();
  }, [isBoleteria]);

  const loadAvailableRoles = async () => {
    try {
      const res = await apiAuthFetch('/api/users/meta/roles', {}, token);
      if (res.ok) {
        const data = await res.json();
        setAvailableRoles(data.roles || []);
      }
    } catch (err) {
      console.error('Error loading roles:', err);
    }
  };

  useEffect(() => {
    if (isBoleteria) {
      setRoleFilter('');
    }
  }, [isBoleteria]);

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      
      if (searchTerm) params.append('search', searchTerm);
      if (!isBoleteria && roleFilter) params.append('role', roleFilter);
      if (activeFilter) params.append('active', activeFilter);
      
      const res = await apiAuthFetch(`/api/users?${params.toString()}`, {}, token);
      const data = await res.json();
      
      setUsers(data.users || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError('Error al cargar usuarios');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (isBoleteria) return;
    if (!confirm(`¿Cambiar rol a ${newRole}?`)) return;
    
    try {
      const res = await apiAuthFetch(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole })
      }, token);
      
      if (res.ok) {
        setSuccess('Rol actualizado correctamente');
        setTimeout(() => setSuccess(''), 3000);
        loadUsers();
      } else {
        const data = await res.json();
        setError(data.message || 'Error al cambiar rol');
      }
    } catch (err) {
      setError('Error al cambiar rol');
      console.error(err);
    }
  };

  const handleStatusToggle = async (userId, currentStatus) => {
    if (isBoleteria) return;
    const action = currentStatus ? 'desactivar' : 'activar';
    if (!confirm(`¿Está seguro de ${action} este usuario?`)) return;
    
    try {
      const res = await apiAuthFetch(`/api/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !currentStatus })
      }, token);
      
      if (res.ok) {
        setSuccess(`Usuario ${action}do correctamente`);
        setTimeout(() => setSuccess(''), 3000);
        loadUsers();
      } else {
        const data = await res.json();
        setError(data.message || 'Error al cambiar estado');
      }
    } catch (err) {
      setError('Error al cambiar estado');
      console.error(err);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      dni: user.dni || '',
      provincia: user.provincia || '',
      localidad: user.localidad || ''
    });
  };

  const handleUpdateUser = async () => {
    if (!editForm.name || !editForm.email) {
      setError('Nombre y email son requeridos');
      return;
    }
    
    try {
      const res = await apiAuthFetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      }, token);
      
      if (res.ok) {
        setSuccess('Usuario actualizado correctamente');
        setTimeout(() => setSuccess(''), 3000);
        setEditingUser(null);
        loadUsers();
      } else {
        const data = await res.json();
        setError(data.message || 'Error al actualizar usuario');
      }
    } catch (err) {
      setError('Error al actualizar usuario');
      console.error(err);
    }
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      admin: '#dc2626',
      boleteria: '#d97706',
      productor: '#7c3aed',
      espectador: '#2563eb',
      premium: '#0891b2',
      admin_ateneo: '#be123c',
      docente_ateneo: '#059669',
      alumno_ateneo: '#0d9488'
    };
    return colors[role] || '#6b7280';
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Admin',
      boleteria: 'Boleteria',
      productor: 'Productor',
      espectador: 'Espectador',
      premium: 'Premium',
      admin_ateneo: 'Admin Ateneo',
      docente_ateneo: 'Docente Ateneo',
      alumno_ateneo: 'Alumno Ateneo'
    };
    return labels[role] || role;
  };

  const handleAddRole = async (userId, roleName) => {
    try {
      const res = await apiAuthFetch(`/api/users/${userId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ role: roleName })
      }, token);
      if (res.ok) {
        const data = await res.json();
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: data.roles } : u));
        if (rolesModalUser?.id === userId) {
          setRolesModalUser(prev => ({ ...prev, roles: data.roles }));
        }
        setAddingRole('');
        setSuccess('Rol agregado');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        const data = await res.json();
        setError(data.message || 'Error al agregar rol');
      }
    } catch (err) {
      setError('Error al agregar rol');
    }
  };

  const handleRemoveRole = async (userId, roleName) => {
    if (!confirm(`Quitar rol ${getRoleLabel(roleName)}?`)) return;
    try {
      const res = await apiAuthFetch(`/api/users/${userId}/roles/${roleName}`, {
        method: 'DELETE'
      }, token);
      if (res.ok) {
        const data = await res.json();
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, roles: data.roles } : u));
        if (rolesModalUser?.id === userId) {
          setRolesModalUser(prev => ({ ...prev, roles: data.roles }));
        }
        setSuccess('Rol removido');
        setTimeout(() => setSuccess(''), 2000);
      } else {
        const data = await res.json();
        setError(data.message || 'Error al quitar rol');
      }
    } catch (err) {
      setError('Error al quitar rol');
    }
  };

  return (
    <div style={{ padding: theme.spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
        <h2 style={{ margin: 0 }}>Gestión de Usuarios</h2>
        <div style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>
          Total: {total} usuarios
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{
          padding: theme.spacing.md,
          background: '#fee2e2',
          border: `1px solid #fecaca`,
          borderRadius: 6,
          marginBottom: theme.spacing.md,
          color: theme.colors.danger
        }}>
          {error}
        </div>
      )}
      
      {success && (
        <div style={{
          padding: theme.spacing.md,
          background: '#d1fae5',
          border: `1px solid #a7f3d0`,
          borderRadius: 6,
          marginBottom: theme.spacing.md,
          color: theme.colors.success
        }}>
          {success}
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          style={{
            flex: 1,
            minWidth: 250,
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            fontSize: theme.typography.small
          }}
        />
        
        {!isBoleteria && (
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            style={{
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 6,
              fontSize: theme.typography.small
            }}
          >
            <option value="">Todos los roles</option>
            <option value="admin">Admin</option>
            <option value="boleteria">Boleteria</option>
            <option value="productor">Productor</option>
            <option value="espectador">Espectador</option>
            <option value="premium">Premium</option>
            <option value="admin_ateneo">Admin Ateneo</option>
            <option value="docente_ateneo">Docente Ateneo</option>
            <option value="alumno_ateneo">Alumno Ateneo</option>
          </select>
        )}
        
        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(1);
          }}
          style={{
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            fontSize: theme.typography.small
          }}
        >
          <option value="">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
        
        <button
          onClick={() => {
            setSearchTerm('');
            setRoleFilter('');
            setActiveFilter('');
            setPage(1);
          }}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            background: theme.colors.surfaceAlt,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            fontSize: theme.typography.small,
            cursor: 'pointer'
          }}
        >
          Limpiar filtros
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.lg }}>Cargando...</div>
      ) : (
        <div style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 8,
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: theme.colors.surfaceAlt, borderBottom: `2px solid ${theme.colors.border}` }}>
                <th style={{ padding: theme.spacing.sm, textAlign: 'left' }}>Usuario</th>
                <th style={{ padding: theme.spacing.sm, textAlign: 'left' }}>Contacto</th>
                {!isBoleteria && (
                  <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Rol</th>
                )}
                <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Estado</th>
                <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Entradas</th>
                <th style={{ padding: theme.spacing.sm, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(userItem => (
                <tr key={userItem.id} style={{ borderBottom: `1px solid ${theme.colors.borderLight}` }}>
                  <td style={{ padding: theme.spacing.sm }}>
                    <div style={{ fontWeight: theme.typography.medium }}>{userItem.name}</div>
                  </td>
                  <td style={{ padding: theme.spacing.sm }}>
                    {userItem.email && <div style={{ fontSize: theme.typography.tiny }}>{userItem.email}</div>}
                    {userItem.dni && <div style={{ fontSize: theme.typography.tiny }}>DNI: {userItem.dni}</div>}
                    {userItem.phone && <div style={{ fontSize: theme.typography.tiny }}>Tel: {userItem.phone}</div>}
                  </td>
                  {!isBoleteria && (
                    <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                        {(userItem.roles || [userItem.role || 'espectador']).map(r => (
                          <span key={r} style={{
                            padding: '2px 8px',
                            background: getRoleBadgeColor(r),
                            color: '#fff',
                            borderRadius: 12,
                            fontSize: '10px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}>
                            {getRoleLabel(r)}
                          </span>
                        ))}
                        <button
                          onClick={() => setRolesModalUser(userItem)}
                          title="Gestionar roles"
                          style={{
                            padding: '2px 6px',
                            background: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: 12,
                            fontSize: '10px',
                            cursor: 'pointer',
                            lineHeight: 1
                          }}
                        >
                          +/-
                        </button>
                      </div>
                    </td>
                  )}
                  <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      background: (userItem.active !== false) ? theme.colors.success : theme.colors.textMuted,
                      color: theme.colors.surface,
                      borderRadius: 4,
                      fontSize: theme.typography.tiny,
                      fontWeight: theme.typography.medium
                    }}>
                      {(userItem.active !== false) ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        setSelectedUser(userItem);
                        setShowTicketsModal(true);
                      }}
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
                      Ver
                    </button>
                  </td>
                  <td style={{ padding: theme.spacing.sm, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: theme.spacing.xs, justifyContent: 'center' }}>
                      <button
                        onClick={() => handleEditUser(userItem)}
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
                      {!isBoleteria && (
                        <button
                          onClick={() => handleStatusToggle(userItem.id, userItem.active !== false)}
                          style={{
                            padding: '4px 12px',
                            background: (userItem.active !== false) ? theme.colors.warning : theme.colors.success,
                            color: theme.colors.surface,
                            border: 'none',
                            borderRadius: 4,
                            fontSize: theme.typography.tiny,
                            cursor: 'pointer'
                          }}
                        >
                          {(userItem.active !== false) ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: theme.spacing.sm,
          marginTop: theme.spacing.lg
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              background: page === 1 ? theme.colors.surfaceAlt : theme.colors.primary,
              color: page === 1 ? theme.colors.textMuted : theme.colors.surface,
              border: 'none',
              borderRadius: 4,
              cursor: page === 1 ? 'not-allowed' : 'pointer'
            }}
          >
            Anterior
          </button>
          <span style={{ padding: theme.spacing.sm }}>
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              background: page === totalPages ? theme.colors.surfaceAlt : theme.colors.primary,
              color: page === totalPages ? theme.colors.textMuted : theme.colors.surface,
              border: 'none',
              borderRadius: 4,
              cursor: page === totalPages ? 'not-allowed' : 'pointer'
            }}
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
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
          zIndex: 1000
        }}>
          <div style={{
            background: theme.colors.surface,
            borderRadius: 8,
            padding: theme.spacing.lg,
            maxWidth: 500,
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginTop: 0 }}>Editar Usuario</h3>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: theme.typography.small }}>
                Nombre *
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4
                }}
              />
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: theme.typography.small }}>
                Email *
              </label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4
                }}
              />
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: theme.typography.small }}>
                Teléfono
              </label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4
                }}
              />
            </div>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: theme.typography.small }}>
                DNI
              </label>
              <input
                type="text"
                value={editForm.dni}
                onChange={(e) => setEditForm({ ...editForm, dni: e.target.value.replace(/\D/g, '') })}
                maxLength={8}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4
                }}
              />
            </div>

            <div style={{ marginBottom: theme.spacing.md }}>
              <LocationSelector
                value={{ provincia: editForm.provincia, localidad: editForm.localidad }}
                onChange={(location) => setEditForm({ 
                  ...editForm, 
                  provincia: location.provincia, 
                  localidad: location.localidad 
                })}
                required={false}
                disabled={false}
              />
            </div>
            
            <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingUser(null)}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  background: theme.colors.surfaceAlt,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateUser}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  background: theme.colors.primary,
                  color: theme.colors.surface,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestion de roles */}
      {rolesModalUser && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: theme.colors.surface,
            borderRadius: 8,
            padding: theme.spacing.lg,
            maxWidth: 480,
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0 }}>Roles de {rolesModalUser.name}</h3>
            
            <div style={{ marginBottom: theme.spacing.md }}>
              <div style={{ fontSize: theme.typography.small, color: theme.colors.textMuted, marginBottom: 8 }}>
                Roles actuales:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(rolesModalUser.roles || []).length === 0 && (
                  <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>Sin roles asignados</span>
                )}
                {(rolesModalUser.roles || []).map(r => (
                  <span key={r} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    background: getRoleBadgeColor(r),
                    color: '#fff',
                    borderRadius: 12,
                    fontSize: '12px',
                    fontWeight: 600
                  }}>
                    {getRoleLabel(r)}
                    <button
                      onClick={() => handleRemoveRole(rolesModalUser.id, r)}
                      style={{
                        background: 'rgba(255,255,255,0.3)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '50%',
                        width: 16, height: 16,
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        lineHeight: 1
                      }}
                      title={`Quitar ${getRoleLabel(r)}`}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: theme.spacing.md }}>
              <div style={{ fontSize: theme.typography.small, color: theme.colors.textMuted, marginBottom: 8 }}>
                Agregar rol:
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={addingRole}
                  onChange={(e) => setAddingRole(e.target.value)}
                  style={{
                    flex: 1,
                    padding: theme.spacing.sm,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: 4,
                    fontSize: theme.typography.small
                  }}
                >
                  <option value="">Seleccionar rol...</option>
                  {availableRoles
                    .filter(r => !(rolesModalUser.roles || []).includes(r.nombre))
                    .map(r => (
                      <option key={r.id} value={r.nombre}>
                        {getRoleLabel(r.nombre)} ({r.modulo})
                      </option>
                    ))
                  }
                </select>
                <button
                  onClick={() => addingRole && handleAddRole(rolesModalUser.id, addingRole)}
                  disabled={!addingRole}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    background: addingRole ? theme.colors.success : theme.colors.surfaceAlt,
                    color: addingRole ? '#fff' : theme.colors.textMuted,
                    border: 'none',
                    borderRadius: 4,
                    cursor: addingRole ? 'pointer' : 'not-allowed',
                    fontSize: theme.typography.small
                  }}
                >
                  Agregar
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setRolesModalUser(null); setAddingRole(''); }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  background: theme.colors.surfaceAlt,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de entradas del usuario */}
      {showTicketsModal && selectedUser && (
        <UserTicketsModal
          user={selectedUser}
          onClose={() => {
            setShowTicketsModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}
