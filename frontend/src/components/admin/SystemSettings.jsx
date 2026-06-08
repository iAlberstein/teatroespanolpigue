import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch, apiAuthFetch } from '../../lib/api';

export default function SystemSettings() {
  const { token } = useAuth();
  const [serviceFee, setServiceFee] = useState('10');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch('/api/settings/service_fee_percent');
        const data = await res.json();
        if (data.value) {
          setServiceFee(data.value);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    const numValue = parseFloat(serviceFee);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      setMessage({ type: 'error', text: 'El porcentaje debe estar entre 0 y 100' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });
    
    try {
      const res = await apiAuthFetch(
        '/api/settings/service_fee_percent',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            value: serviceFee,
            description: 'Porcentaje de cargo por servicio aplicado a las compras online'
          })
        },
        token
      );
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Configuración guardada correctamente' });
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.message || 'Error al guardar' });
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        Cargando configuración...
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 24, fontSize: 20, fontWeight: 600 }}>
        Configuración del Sistema
      </h2>
      
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        maxWidth: 500
      }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ 
            display: 'block', 
            marginBottom: 8, 
            fontWeight: 500,
            fontSize: 14
          }}>
            Cargo por servicio (%)
          </label>
          <p style={{ 
            fontSize: 13, 
            color: '#666', 
            marginBottom: 12 
          }}>
            Este porcentaje se aplica sobre el subtotal de las compras online después de aplicar descuentos.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={serviceFee}
              onChange={(e) => setServiceFee(e.target.value)}
              style={{
                width: 100,
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 16,
                textAlign: 'center'
              }}
            />
            <span style={{ fontSize: 18, color: '#666' }}>%</span>
          </div>
        </div>

        {message.text && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 14,
            background: message.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: message.type === 'error' ? '#b91c1c' : '#166534'
          }}>
            {message.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 24px',
            background: saving ? '#9ca3af' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s'
          }}
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div style={{
        marginTop: 24,
        padding: 16,
        background: '#f8fafc',
        borderRadius: 8,
        border: '1px solid #e2e8f0'
      }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          ℹ️ Información
        </h4>
        <ul style={{ 
          fontSize: 13, 
          color: '#64748b', 
          margin: 0, 
          paddingLeft: 20,
          lineHeight: 1.6
        }}>
          <li>El cargo por servicio se muestra al cliente durante el proceso de compra</li>
          <li>Se aplica tanto en la vista del carrito como en el detalle del email de confirmación</li>
          <li>Los cambios se aplican inmediatamente a nuevas compras</li>
          <li>Las ventas por boletería no aplican cargo por servicio</li>
        </ul>
      </div>
    </div>
  );
}
