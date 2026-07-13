import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiAuthFetch } from '../lib/api.js';
import ShowList from '../components/admin/ShowList.jsx';
import ShowForm from '../components/admin/ShowForm.jsx';
import SessionManager from '../components/admin/SessionManager.jsx';
import Reports from '../components/admin/Reports.jsx';
import Discounts from '../components/admin/Discounts.jsx';
import Users from '../components/admin/Users.jsx';
import TrendsCharts from '../components/admin/TrendsCharts.jsx';
import NotificationSettings from '../components/admin/NotificationSettings.jsx';
import SystemSettings from '../components/admin/SystemSettings.jsx';
import Mailing from '../components/admin/Mailing.jsx';
import Billing from '../components/admin/Billing.jsx';
import Sponsors from '../components/admin/Sponsors.jsx';
import TicketSettings from '../components/admin/TicketSettings.jsx';
import AportesAdmin from '../components/admin/AportesAdmin.jsx';
import { theme } from '../styles/theme.js';

export default function Admin() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('reports'); // 'shows' | 'reports' | 'analytics' | 'discounts' | 'users' | 'notifications' | 'settings'
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit' | 'sessions'
  const [selectedShow, setSelectedShow] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  // Track screen size for responsive
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if user has access (admin, boleteria, or productor)
  useEffect(() => {
    if (!user || !['admin', 'boleteria', 'productor'].includes(user.role)) {
      navigate('/');
    } else {
      // Set initial section based on role
      if (user.role === 'productor') {
        setSection('reports');
      } else if (user.role === 'boleteria') {
        setSection('reports');
      } else {
        setSection('shows');
      }
    }
  }, [user, navigate]);

  // Load shows
  useEffect(() => {
    loadShows();
  }, []);

  const loadShows = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/shows?admin=true');
      if (res.ok) {
        const data = await res.json();
        setShows(data);
      }
    } catch (err) {
      console.error('Error loading shows:', err);
      setError('Error al cargar espectáculos');
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async (showId) => {
    try {
      const res = await apiFetch(`/api/shows/${showId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
      setError('Error al cargar sesiones');
    }
  };

  const handleCreateNew = () => {
    setSelectedShow(null);
    setView('create');
    setError('');
    setSuccess('');
  };

  const handleEdit = (show) => {
    setSelectedShow(show);
    setView('edit');
    setError('');
    setSuccess('');
  };

  const handleManageSessions = async (show) => {
    setSelectedShow(show);
    await loadSessions(show.id);
    setView('sessions');
    setError('');
    setSuccess('');
  };

  const handleSaveShow = async (data) => {
    try {
      const url = selectedShow ? `/api/shows/${selectedShow.id}` : '/api/shows';
      const method = selectedShow ? 'PUT' : 'POST';
      
      const res = await apiAuthFetch(url, {
        method,
        body: JSON.stringify(data)
      }, token);

      if (res.ok) {
        setSuccess(selectedShow ? 'Espectáculo actualizado exitosamente' : 'Espectáculo creado exitosamente');
        await loadShows();
        setTimeout(() => {
          setView('list');
          setSuccess('');
        }, 2000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al guardar espectáculo');
      }
    } catch (err) {
      console.error('Error saving show:', err);
      setError('Error de red al guardar espectáculo');
    }
  };

  const handleDeleteShow = async (showId) => {
    try {
      const res = await apiAuthFetch(`/api/shows/${showId}`, {
        method: 'DELETE'
      }, token);

      if (res.ok) {
        setSuccess('Espectáculo eliminado exitosamente');
        await loadShows();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al eliminar espectáculo');
      }
    } catch (err) {
      console.error('Error deleting show:', err);
      setError('Error de red al eliminar espectáculo');
    }
  };

  const handleAddSession = async (data) => {
    try {
      const res = await apiAuthFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(data)
      }, token);

      if (res.ok) {
        setSuccess('Sesión agregada exitosamente');
        await loadSessions(selectedShow.id);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al agregar sesión');
      }
    } catch (err) {
      console.error('Error adding session:', err);
      setError('Error de red al agregar sesión');
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      const res = await apiAuthFetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      }, token);

      if (res.ok) {
        setSuccess('Sesión eliminada exitosamente');
        await loadSessions(selectedShow.id);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al eliminar sesión');
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      setError('Error de red al eliminar sesión');
    }
  };

  const handleEditSession = async (sessionId, data) => {
    try {
      const res = await apiAuthFetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }, token);

      if (res.ok) {
        setSuccess('Sesión actualizada exitosamente');
        await loadSessions(selectedShow.id);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await res.json();
        setError(errorData.message || 'Error al actualizar sesión');
      }
    } catch (err) {
      console.error('Error updating session:', err);
      setError('Error de red al actualizar sesión');
    }
  };

  const handleCancel = () => {
    setView('list');
    setSelectedShow(null);
    setError('');
    setSuccess('');
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? theme.spacing.sm : theme.spacing.lg, maxWidth: '1400px', margin: '0 auto' }}>
      {/* Banner especial para productor */}
      {user?.role === 'productor' && (
        <div style={{
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          color: 'white',
          padding: isMobile ? theme.spacing.md : theme.spacing.lg,
          borderRadius: theme.borderRadius.lg,
          marginBottom: isMobile ? theme.spacing.md : theme.spacing.xl,
          boxShadow: '0 4px 6px rgba(139, 92, 246, 0.2)'
        }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: theme.spacing.md }}>
            <div style={{ fontSize: isMobile ? 28 : 48, fontWeight: 700 }}>PRODUCTOR</div>
            <div>
              <h2 style={{ margin: 0, fontSize: isMobile ? theme.typography.h4 : theme.typography.h3, fontWeight: 700 }}>
                Panel de Productor
              </h2>
              <p style={{ margin: `${theme.spacing.xs} 0 0 0`, opacity: 0.9, fontSize: isMobile ? theme.typography.small : theme.typography.body }}>
                Bienvenido {user.name}. Aquí podés ver los reportes de tus shows.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div style={{ marginBottom: isMobile ? theme.spacing.md : theme.spacing.xl }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? theme.typography.h3 : theme.typography.h2, color: theme.colors.textPrimary }}>
          {user?.role === 'productor' ? 'Reportes de Ventas' : 'Panel de Administración'}
        </h1>
        <p style={{ color: theme.colors.textSecondary, margin: `${theme.spacing.xs} 0 0 0`, fontSize: isMobile ? theme.typography.small : theme.typography.body }}>
          {user?.role === 'productor' ? 'Análisis de ventas de tus shows' : 'Gestión completa del teatro'}
        </p>
      </div>

      {/* Tabs de navegación */}
      <div style={{ 
        display: 'flex', 
        gap: isMobile ? theme.spacing.xs : theme.spacing.md,
        marginBottom: theme.spacing.lg,
        borderBottom: `2px solid ${theme.colors.border}`,
        flexWrap: 'wrap',
        overflowX: isMobile ? 'auto' : 'visible',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: isMobile ? theme.spacing.xs : 0
      }}>
        {/* Shows - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => { setSection('shows'); setView('list'); }}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'shows' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'shows' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {isMobile ? 'Shows' : 'Shows y Sesiones'}
          </button>
        )}
        
        {/* Reportes - todos los roles */}
        <button
          onClick={() => setSection('reports')}
          style={{
            padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
            background: section === 'reports' ? (user?.role === 'productor' ? '#8b5cf6' : theme.colors.primary) : 'none',
            border: 'none',
            borderBottom: section === 'reports' ? `3px solid ${user?.role === 'productor' ? '#8b5cf6' : theme.colors.primary}` : 'none',
            color: section === 'reports' ? 'white' : theme.colors.textSecondary,
            fontWeight: theme.typography.semibold,
            fontSize: isMobile ? theme.typography.small : theme.typography.body,
            cursor: 'pointer',
            marginBottom: '-2px',
            transition: theme.transitions.fast,
            borderRadius: section === 'reports' ? '4px 4px 0 0' : 0,
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          {user?.role === 'productor' ? 'Mis Shows' : 'Reportes'}
        </button>

        {/* Analytics - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('analytics')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'analytics' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'analytics' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Analytics
          </button>
        )}
        
        {/* Cupones - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('discounts')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'discounts' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'discounts' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Cupones
          </button>
        )}
        
        {/* Usuarios - solo admin y boletería */}
        {(user?.role === 'admin' || user?.role === 'boleteria') && (
          <button
            onClick={() => setSection('users')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'users' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'users' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Usuarios
          </button>
        )}
        
        {/* Notificaciones - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('notifications')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'notifications' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'notifications' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {isMobile ? 'Notif.' : 'Notificaciones'}
          </button>
        )}
        
        {/* Costo de Servicio - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('settings')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'settings' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'settings' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {isMobile ? 'Servicio' : 'Costo de Servicio'}
          </button>
        )}

        {/* Mailing - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('mailing')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'mailing' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'mailing' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Mailing
          </button>
        )}

        {/* Facturador - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('billing')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'billing' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'billing' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Facturador
          </button>
        )}

        {/* Tickets - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('tickets')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'tickets' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'tickets' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Tickets
          </button>
        )}

        {/* Aportes - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('aportes')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'aportes' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'aportes' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Aportes
          </button>
        )}

        {/* Patrocinadores - solo admin */}
        {user?.role === 'admin' && (
          <button
            onClick={() => setSection('sponsors')}
            style={{
              padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
              background: 'none',
              border: 'none',
              borderBottom: section === 'sponsors' ? `3px solid ${theme.colors.primary}` : 'none',
              color: section === 'sponsors' ? theme.colors.primary : theme.colors.textSecondary,
              fontWeight: theme.typography.semibold,
              fontSize: isMobile ? theme.typography.small : theme.typography.body,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            {isMobile ? 'Patroc.' : 'Patrocinadores'}
          </button>
        )}
      </div>

      {/* Error/Success messages */}
      {error && (
        <div style={{
          padding: 12,
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: 6,
          marginBottom: 16,
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: 12,
          background: '#d1fae5',
          border: '1px solid #a7f3d0',
          borderRadius: 6,
          marginBottom: 16,
          color: '#065f46'
        }}>
          {success}
        </div>
      )}

      {/* Render appropriate section */}
      {section === 'shows' && (
        <>
          {view === 'list' && (
            <ShowList
              shows={shows}
              onEdit={handleEdit}
              onDelete={handleDeleteShow}
              onManageSessions={handleManageSessions}
              onCreateNew={handleCreateNew}
            />
          )}

          {(view === 'create' || view === 'edit') && (
            <ShowForm
              show={selectedShow}
              onSave={handleSaveShow}
              onCancel={handleCancel}
            />
          )}

          {view === 'sessions' && selectedShow && (
            <SessionManager
              show={selectedShow}
              sessions={sessions}
              onAddSession={handleAddSession}
              onDeleteSession={handleDeleteSession}
              onEditSession={handleEditSession}
              onClose={handleCancel}
            />
          )}
        </>
      )}

      {section === 'reports' && (
        <Reports shows={shows} />
      )}

      {section === 'analytics' && (
        <TrendsCharts />
      )}

      {section === 'discounts' && (
        <Discounts shows={shows} />
      )}

      {section === 'users' && (
        <Users />
      )}

      {section === 'notifications' && (
        <NotificationSettings />
      )}

      {section === 'settings' && (
        <SystemSettings />
      )}

      {section === 'mailing' && (
        <Mailing />
      )}

      {section === 'billing' && (
        <Billing token={token} />
      )}

      {section === 'sponsors' && (
        <Sponsors />
      )}

      {section === 'tickets' && (
        <TicketSettings />
      )}

      {section === 'aportes' && (
        <AportesAdmin token={token} />
      )}
    </div>
  );
}
