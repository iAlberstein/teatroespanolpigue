import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../styles/theme';
import DateInputMask from '../../components/DateInputMask';

const formatFecha = (fecha) => {
  if (!fecha) return '-';
  const d = new Date(typeof fecha === 'string' && fecha.length === 10 ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d)) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function AteneoPerfilAlumno() {
  const { token } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fecha_nacimiento: '', direccion: '', contacto_emergencia: '', telefono_emergencia: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => { loadPerfil(); }, []);

  const loadPerfil = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/ateneo/alumnos/me/perfil', {}, token);
      if (res.ok) {
        const data = await res.json();
        setPerfil(data);
        setForm({
          fecha_nacimiento: data.fecha_nacimiento || '',
          direccion: data.direccion || '',
          contacto_emergencia: data.contacto_emergencia || '',
          telefono_emergencia: data.telefono_emergencia || ''
        });
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiAuthFetch('/api/ateneo/alumnos/me/perfil', {
        method: 'PUT',
        body: JSON.stringify(form)
      }, token);
      if (res.ok) {
        setMsg({ ok: true, text: 'Perfil actualizado correctamente' });
        setEditing(false);
        loadPerfil();
      } else {
        const data = await res.json();
        setMsg({ ok: false, text: data.error || 'Error al guardar' });
      }
    } catch (err) {
      setMsg({ ok: false, text: 'Error de conexión' });
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const getEstadoBadge = (estado) => {
    const styles = {
      activo: { bg: '#d1fae5', color: '#059669' },
      pendiente: { bg: '#fef3c7', color: '#d97706' },
      deuda: { bg: '#fee2e2', color: '#dc2626' },
      suspendido: { bg: '#fecaca', color: '#991b1b' },
      egresado: { bg: '#dbeafe', color: '#2563eb' }
    };
    const s = styles[estado] || styles.pendiente;
    return { padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color, display: 'inline-block' };
  };

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: 14, boxSizing: 'border-box', background: '#fff'
  };
  const labelStyle = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>Cargando...</div>;
  }

  if (!perfil) {
    return (
      <div style={{ textAlign: 'center', padding: 48, background: '#f9fafb', borderRadius: 8, color: '#6b7280' }}>
        <p style={{ fontSize: 16, marginBottom: 8 }}>No se encontró tu perfil de alumno</p>
        <p style={{ fontSize: 13 }}>Contactá al administrador del Ateneo.</p>
        <Link to="/ateneo" style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}>Volver al Ateneo</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '60vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, margin: 0 }}>Mi Perfil</h1>
        <Link to="/ateneo/alumno" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>← Volver a Mi Portal</Link>
      </div>

      {msg && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500,
          background: msg.ok ? '#d1fae5' : '#fee2e2',
          color: msg.ok ? '#059669' : '#dc2626',
          border: `1px solid ${msg.ok ? '#a7f3d0' : '#fecaca'}`
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>{perfil.usuario?.name || 'Sin nombre'}</h3>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{perfil.usuario?.email}</div>
          </div>
          <span style={getEstadoBadge(perfil.estado_academico || 'pendiente')}>
            {perfil.estado_academico || 'pendiente'}
          </span>
        </div>

        {/* Read-only fields */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <span style={labelStyle}>DNI</span>
            <div style={{ fontSize: 14 }}>{perfil.dni || '-'}</div>
          </div>
          <div>
            <span style={labelStyle}>Teléfono</span>
            <div style={{ fontSize: 14 }}>{perfil.telefono || '-'}</div>
          </div>
          <div>
            <span style={labelStyle}>Fecha de ingreso</span>
            <div style={{ fontSize: 14 }}>{formatFecha(perfil.fecha_ingreso)}</div>
          </div>
        </div>

        {/* Editable fields */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: 15 }}>Datos personales</h4>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{
                padding: '6px 14px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
              }}>Editar</button>
            )}
          </div>

          {editing ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Fecha de nacimiento</label>
                  <DateInputMask style={inputStyle} value={form.fecha_nacimiento} onChange={e => setForm({ ...form, fecha_nacimiento: e.target.value })} />
                </div>
                <div>
                  <label style={labelStyle}>Dirección</label>
                  <input style={inputStyle} value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Tu dirección..." />
                </div>
                <div>
                  <label style={labelStyle}>Contacto de emergencia</label>
                  <input style={inputStyle} value={form.contacto_emergencia} onChange={e => setForm({ ...form, contacto_emergencia: e.target.value })} placeholder="Nombre del contacto..." />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono de emergencia</label>
                  <input style={inputStyle} value={form.telefono_emergencia} onChange={e => setForm({ ...form, telefono_emergencia: e.target.value })} placeholder="Teléfono..." />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditing(false); setForm({ fecha_nacimiento: perfil.fecha_nacimiento || '', direccion: perfil.direccion || '', contacto_emergencia: perfil.contacto_emergencia || '', telefono_emergencia: perfil.telefono_emergencia || '' }); }} style={{
                  padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
                }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '8px 16px', background: saving ? '#9ca3af' : '#7c3aed', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600
                }}>{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <div>
                <span style={labelStyle}>Fecha de nacimiento</span>
                <div style={{ fontSize: 14 }}>{formatFecha(perfil.fecha_nacimiento)}</div>
              </div>
              <div>
                <span style={labelStyle}>Dirección</span>
                <div style={{ fontSize: 14 }}>{perfil.direccion || '-'}</div>
              </div>
              <div>
                <span style={labelStyle}>Contacto de emergencia</span>
                <div style={{ fontSize: 14 }}>{perfil.contacto_emergencia || '-'}</div>
              </div>
              <div>
                <span style={labelStyle}>Teléfono de emergencia</span>
                <div style={{ fontSize: 14 }}>{perfil.telefono_emergencia || '-'}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
