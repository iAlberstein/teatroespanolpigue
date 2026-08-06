import { useState, useEffect } from 'react';
import { apiFetch, apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../styles/theme.js';

const inputStyle = {
  flex: 1,
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.borderRadius.md,
};

const buttonStyle = {
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  background: theme.colors.primary,
  color: '#fff',
  border: 'none',
  borderRadius: theme.borderRadius.md,
  cursor: 'pointer',
};

const dangerButtonStyle = {
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  background: 'transparent',
  color: theme.colors.accent || '#dc2626',
  border: `1px solid ${theme.colors.accent || '#dc2626'}`,
  borderRadius: theme.borderRadius.md,
  cursor: 'pointer',
};

export default function TicketSettings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState({});
  const [instructions, setInstructions] = useState([]);
  const [infoLines, setInfoLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingInstr, setSavingInstr] = useState(false);
  const [savingLines, setSavingLines] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiFetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings(data);
        try {
          setInstructions(data.ticket_instructions ? JSON.parse(data.ticket_instructions) : []);
        } catch {
          setInstructions([]);
        }
        try {
          setInfoLines(data.ticket_info_lines ? JSON.parse(data.ticket_info_lines) : []);
        } catch {
          setInfoLines([]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const showMsg = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key) => {
    setSaving(true);
    try {
      const res = await apiAuthFetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings[key] }),
      }, token);
      showMsg(res.ok ? 'Guardado' : 'Error al guardar');
    } catch {
      showMsg('Error al guardar');
    }
    setSaving(false);
  };

  const handleSaveInstructions = async () => {
    setSavingInstr(true);
    try {
      const cleaned = instructions.map(i => i.trim()).filter(Boolean);
      const res = await apiAuthFetch('/api/settings/ticket_instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: JSON.stringify(cleaned),
          description: 'Instrucciones que aparecen debajo del QR en el ticket',
        }),
      }, token);
      showMsg(res.ok ? 'Instrucciones guardadas' : 'Error al guardar');
    } catch {
      showMsg('Error al guardar');
    }
    setSavingInstr(false);
  };

  const handleSaveInfoLines = async () => {
    setSavingLines(true);
    try {
      const cleaned = infoLines
        .map(l => ({ title: (l.title || '').trim(), description: (l.description || '').trim() }))
        .filter(l => l.title);
      const res = await apiAuthFetch('/api/settings/ticket_info_lines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: JSON.stringify(cleaned),
          description: 'Líneas informativas / promociones activas mostradas en el ticket',
        }),
      }, token);
      showMsg(res.ok ? 'Promociones guardadas' : 'Error al guardar');
    } catch {
      showMsg('Error al guardar');
    }
    setSavingLines(false);
  };

  if (loading) return <p>Cargando configuración...</p>;

  const fields = [
    { key: 'service_fee_percent', label: 'Cargo por servicio (%)', type: 'number' },
    { key: 'max_tickets_per_purchase', label: 'Máximo tickets por compra', type: 'number' },
    { key: 'reservation_timeout_minutes', label: 'Timeout reserva (minutos)', type: 'number' },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: theme.spacing.md }}>Configuración de Tickets</h2>
      {msg && <p style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>{msg}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, maxWidth: 400 }}>
        {fields.map(f => (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
            <label style={{ fontSize: theme.typography.small, fontWeight: theme.typography.medium }}>{f.label}</label>
            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
              <input
                type={f.type}
                value={settings[f.key] || ''}
                onChange={e => handleChange(f.key, e.target.value)}
                style={inputStyle}
              />
              <button onClick={() => handleSave(f.key)} disabled={saving} style={buttonStyle}>
                Guardar
              </button>
            </div>
          </div>
        ))}
      </div>

      <hr style={{ margin: `${theme.spacing.xl} 0`, border: 'none', borderTop: `1px solid ${theme.colors.border}` }} />

      <h3 style={{ marginBottom: theme.spacing.sm }}>Instrucciones del ticket</h3>
      <p style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, marginBottom: theme.spacing.md }}>
        Textos que aparecen debajo del QR, en la sección "Instrucciones" del ticket.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, maxWidth: 600 }}>
        {instructions.map((text, idx) => (
          <div key={idx} style={{ display: 'flex', gap: theme.spacing.sm }}>
            <input
              type="text"
              value={text}
              onChange={e => setInstructions(prev => prev.map((v, i) => i === idx ? e.target.value : v))}
              style={inputStyle}
            />
            <button
              onClick={() => setInstructions(prev => prev.filter((_, i) => i !== idx))}
              style={dangerButtonStyle}
            >
              Eliminar
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button onClick={() => setInstructions(prev => [...prev, ''])} style={buttonStyle}>
            + Agregar instrucción
          </button>
          <button onClick={handleSaveInstructions} disabled={savingInstr} style={buttonStyle}>
            Guardar instrucciones
          </button>
        </div>
      </div>

      <hr style={{ margin: `${theme.spacing.xl} 0`, border: 'none', borderTop: `1px solid ${theme.colors.border}` }} />

      <h3 style={{ marginBottom: theme.spacing.sm }}>Promociones activas / avisos</h3>
      <p style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, marginBottom: theme.spacing.md }}>
        Bloques con título y descripción que aparecen en el ticket, debajo del QR.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, maxWidth: 600 }}>
        {infoLines.map((line, idx) => (
          <div key={idx} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.xs,
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: theme.borderRadius.md,
          }}>
            <input
              type="text"
              placeholder="Título"
              value={line.title || ''}
              onChange={e => setInfoLines(prev => prev.map((v, i) => i === idx ? { ...v, title: e.target.value } : v))}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Descripción (opcional)"
              value={line.description || ''}
              onChange={e => setInfoLines(prev => prev.map((v, i) => i === idx ? { ...v, description: e.target.value } : v))}
              style={inputStyle}
            />
            <button
              onClick={() => setInfoLines(prev => prev.filter((_, i) => i !== idx))}
              style={{ ...dangerButtonStyle, alignSelf: 'flex-start' }}
            >
              Eliminar
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: theme.spacing.sm }}>
          <button onClick={() => setInfoLines(prev => [...prev, { title: '', description: '' }])} style={buttonStyle}>
            + Agregar promoción
          </button>
          <button onClick={handleSaveInfoLines} disabled={savingLines} style={buttonStyle}>
            Guardar promociones
          </button>
        </div>
      </div>
    </div>
  );
}
