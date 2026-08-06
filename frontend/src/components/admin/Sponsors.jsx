import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, apiAuthFetch } from '../../lib/api';
import { theme } from '../../styles/theme.js';

export default function Sponsors() {
  const { token } = useAuth();
  const [sponsors, setSponsors] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await apiFetch('/api/sponsors');
      const data = await res.json();
      setSponsors(data);
    } catch (e) {
      setError('Error al cargar patrocinadores');
    }
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await apiAuthFetch('/api/sponsors', {
        method: 'POST',
        body: formData,
      }, token);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Error al subir');
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm('¿Eliminar este patrocinador?')) return;
    try {
      await apiAuthFetch(`/api/sponsors/${filename}`, { method: 'DELETE' }, token);
      await load();
    } catch (e) {
      setError('Error al eliminar');
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: theme.spacing.md }}>Patrocinadores</h2>
      {error && <p style={{ color: theme.colors.accent, marginBottom: theme.spacing.sm }}>{error}</p>}
      
      <div style={{ marginBottom: theme.spacing.lg }}>
        <label style={{
          display: 'inline-block',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          background: theme.colors.primary,
          color: '#fff',
          borderRadius: theme.borderRadius.md,
          cursor: uploading ? 'wait' : 'pointer',
          opacity: uploading ? 0.6 : 1,
        }}>
          {uploading ? 'Subiendo...' : 'Subir logo'}
          <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: theme.spacing.md }}>
        {sponsors.map(s => (
          <div key={s.filename} style={{
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.sm,
            textAlign: 'center',
            position: 'relative',
          }}>
            <img src={s.url} alt={s.filename} style={{ maxWidth: '100%', maxHeight: '80px', objectFit: 'contain' }} />
            <button
              onClick={() => handleDelete(s.filename)}
              style={{
                position: 'absolute', top: 4, right: 4,
                background: theme.colors.accent, color: '#fff',
                border: 'none', borderRadius: '50%',
                width: 22, height: 22, cursor: 'pointer',
                fontSize: 12, lineHeight: '22px',
              }}
            >✕</button>
          </div>
        ))}
      </div>
      {sponsors.length === 0 && <p style={{ color: theme.colors.textMuted }}>No hay patrocinadores cargados.</p>}
    </div>
  );
}
