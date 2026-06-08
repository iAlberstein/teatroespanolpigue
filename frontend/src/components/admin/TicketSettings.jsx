import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { theme } from '../../styles/theme.js';

export default function TicketSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiFetch('/api/settings')
      .then(r => r.json())
      .then(data => { setSettings(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key) => {
    setSaving(true);
    setMsg('');
    try {
      const res = await apiFetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: settings[key] }),
      });
      if (res.ok) setMsg('Guardado');
      else setMsg('Error al guardar');
    } catch {
      setMsg('Error al guardar');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
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
                style={{
                  flex: 1,
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.borderRadius.md,
                }}
              />
              <button
                onClick={() => handleSave(f.key)}
                disabled={saving}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  background: theme.colors.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
