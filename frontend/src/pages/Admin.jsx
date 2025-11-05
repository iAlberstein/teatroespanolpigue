import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiAuthFetch } from '../lib/api';
import ShowList from '../components/admin/ShowList';
import ShowForm from '../components/admin/ShowForm';
import SessionManager from '../components/admin/SessionManager';

export default function Admin() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit' | 'sessions'
  const [selectedShow, setSelectedShow] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if user is admin
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
    }
  }, [user, navigate]);

  // Load shows
  useEffect(() => {
    loadShows();
  }, []);

  const loadShows = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/shows');
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
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>🎭 Panel de Administración</h1>
        <p style={{ color: '#666', margin: '4px 0 0 0' }}>Gestión de espectáculos y sesiones</p>
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
          ✅ {success}
        </div>
      )}

      {/* Render appropriate view */}
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
          onClose={handleCancel}
        />
      )}
    </div>
  );
}
