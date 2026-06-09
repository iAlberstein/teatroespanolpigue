import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';

function formatPrice(price) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

const SECTION_CONFIG = {
  platea_rows: {
    label: 'Filas de Platea',
    icon: '🎭',
    rowOptions: 'ABCDEFGHIJKLM'.split('').map(l => ({ value: l, label: `Fila ${l}` }))
  },
  palcos_bajos: {
    label: 'Palcos Bajos (PB)',
    icon: '📦',
    min: 1,
    max: 20
  },
  palcos_altos: {
    label: 'Palcos Altos (PA)',
    icon: '📦',
    min: 1,
    max: 18
  }
};

export default function SeatPricingManager({ showId, sessionId = null }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Form state
  const [selectedType, setSelectedType] = useState('platea_rows'); // platea_rows, palcos_bajos, palcos_altos
  const [rowFrom, setRowFrom] = useState('A');
  const [rowTo, setRowTo] = useState('C');
  const [palcoFrom, setPalcoFrom] = useState(1);
  const [palcoTo, setPalcoTo] = useState(5);
  const [price, setPrice] = useState('');
  const [isPalcoAlto, setIsPalcoAlto] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#10b981');

  // Predefined colors for selection
  const COLOR_OPTIONS = [
    '#10b981', // green
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
  ];

  const loadRules = async () => {
    if (!showId) return;
    
    setLoading(true);
    try {
      const queryParams = sessionId ? `?sessionId=${sessionId}` : '';
      const res = await apiFetch(`/api/seat-pricing/rules/${showId}${queryParams}`);
      const data = await res.json();
      
      if (data.success) {
        setRules(data.rules);
      } else {
        setError(data.message || 'Error al cargar reglas');
      }
    } catch (err) {
      setError('Error de conexión al cargar reglas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, [showId, sessionId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!price || parseFloat(price) <= 0) {
      setError('El precio debe ser mayor a 0');
      return;
    }

    const payload = {
      show_id: sessionId ? null : showId,
      session_id: sessionId,
      price: parseFloat(price),
      color: selectedColor
    };

    if (selectedType === 'platea_rows') {
      if (rowFrom > rowTo) {
        setError('La fila inicial debe ser menor o igual a la fila final');
        return;
      }
      payload.row_from = rowFrom;
      payload.row_to = rowTo;
    } else {
      if (parseInt(palcoFrom) > parseInt(palcoTo)) {
        setError('El palco inicial debe ser menor o igual al palco final');
        return;
      }
      payload.palco_from = parseInt(palcoFrom);
      payload.palco_to = parseInt(palcoTo);
      payload.is_palco_alto = selectedType === 'palcos_altos';
    }

    try {
      const res = await apiFetch('/api/seat-pricing/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Regla de precio creada exitosamente');
        setPrice('');
        setSelectedColor('#10b981');
        loadRules();
      } else {
        setError(data.message || 'Error al crear regla');
      }
    } catch (err) {
      setError('Error de conexión al guardar');
    }
  };

  const handleDelete = async (ruleId) => {
    if (!confirm('¿Estás seguro de eliminar esta regla de precio?')) return;

    setError(null);
    setSuccess(null);

    try {
      const res = await apiFetch(`/api/seat-pricing/rules/${ruleId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Regla eliminada');
        loadRules();
      } else {
        setError(data.message || 'Error al eliminar');
      }
    } catch (err) {
      setError('Error de conexión al eliminar');
    }
  };

  const getRuleLabel = (rule) => {
    if (rule.row_from && rule.row_to) {
      return `Filas ${rule.row_from} a ${rule.row_to}`;
    }
    if (rule.palco_from !== null && rule.palco_to !== null) {
      const prefix = rule.is_palco_alto ? 'PA' : 'PB';
      return `${prefix} ${rule.palco_from} a ${rule.palco_to}`;
    }
    return 'Regla personalizada';
  };

  // Group rules by type for display
  const groupedRules = rules.reduce((acc, rule) => {
    let key = 'other';
    if (rule.row_from) key = 'platea';
    else if (rule.palco_from !== null) key = rule.is_palco_alto ? 'palcos_altos' : 'palcos_bajos';
    
    if (!acc[key]) acc[key] = [];
    acc[key].push(rule);
    return acc;
  }, {});

  return (
    <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#374151' }}>
        💰 Precios por Ubicación
      </h3>

      {sessionId && (
        <div style={{ 
          padding: '8px 12px', 
          background: '#dbeafe', 
          borderRadius: '6px', 
          fontSize: '13px', 
          color: '#1e40af',
          marginBottom: '16px'
        }}>
          ⚠️ Estás configurando precios específicos para esta sesión. 
          Estos sobrescribirán los precios del espectáculo base.
        </div>
      )}

      {/* Existing Rules */}
      {rules.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '14px', color: '#4b5563', marginBottom: '10px' }}>
            Reglas existentes:
          </h4>
          
          {Object.entries(groupedRules).map(([type, typeRules]) => (
            <div key={type} style={{ marginBottom: '12px' }}>
              <div style={{ 
                fontSize: '13px', 
                fontWeight: 600, 
                color: '#374151',
                marginBottom: '6px',
                textTransform: 'capitalize'
              }}>
                {type === 'platea' && '🎭 Platea'}
                {type === 'palcos_bajos' && '📦 Palcos Bajos'}
                {type === 'palcos_altos' && '📦 Palcos Altos'}
              </div>
              
              {typeRules.map(rule => (
                <div 
                  key={rule.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'white',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    marginBottom: '6px',
                    borderLeft: `4px solid ${rule.color || '#10b981'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        backgroundColor: rule.color || '#10b981',
                        border: '1px solid #e5e7eb'
                      }}
                    />
                    <span style={{ fontSize: '13px', color: '#4b5563' }}>
                      {getRuleLabel(rule)}
                    </span>
                    <span style={{ 
                      fontSize: '14px', 
                      fontWeight: 600, 
                      color: '#059669',
                      marginLeft: '8px'
                    }}>
                      {formatPrice(rule.price)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '12px',
                      color: '#dc2626',
                      background: 'transparent',
                      border: '1px solid #dc2626',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add New Rule Form */}
      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
        <h4 style={{ fontSize: '14px', color: '#374151', margin: '0 0 12px 0' }}>
          Agregar nueva regla:
        </h4>

        {error && (
          <div style={{ 
            padding: '10px 12px', 
            background: '#fee2e2', 
            color: '#dc2626', 
            borderRadius: '6px', 
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ 
            padding: '10px 12px', 
            background: '#d1fae5', 
            color: '#059669', 
            borderRadius: '6px', 
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            {success}
          </div>
        )}

        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
            Tipo de ubicación:
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '14px'
            }}
          >
            <option value="platea_rows">Filas de Platea (A-M)</option>
            <option value="palcos_bajos">Palcos Bajos (PB)</option>
            <option value="palcos_altos">Palcos Altos (PA)</option>
          </select>
        </div>

        {selectedType === 'platea_rows' ? (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
                Desde fila:
              </label>
              <select
                value={rowFrom}
                onChange={(e) => setRowFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px'
                }}
              >
                {'ABCDEFGHIJKLM'.split('').map(l => (
                  <option key={l} value={l}>Fila {l}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
                Hasta fila:
              </label>
              <select
                value={rowTo}
                onChange={(e) => setRowTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px'
                }}
              >
                {'ABCDEFGHIJKLM'.split('').map(l => (
                  <option key={l} value={l}>Fila {l}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
                Desde palco:
              </label>
              <input
                type="number"
                min={selectedType === 'palcos_bajos' ? 1 : 1}
                max={selectedType === 'palcos_bajos' ? 20 : 18}
                value={palcoFrom}
                onChange={(e) => setPalcoFrom(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px'
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
                Hasta palco:
              </label>
              <input
                type="number"
                min={selectedType === 'palcos_bajos' ? 1 : 1}
                max={selectedType === 'palcos_bajos' ? 20 : 18}
                value={palcoTo}
                onChange={(e) => setPalcoTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
            Precio:
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#6b7280',
              fontSize: '14px'
            }}>
              $
            </span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="5000"
              style={{
                width: '100%',
                padding: '8px 12px 8px 28px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', color: '#4b5563', marginBottom: '6px' }}>
            Color de la regla:
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {COLOR_OPTIONS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: color,
                  border: selectedColor === color ? '3px solid #1f2937' : '2px solid transparent',
                  cursor: 'pointer',
                  boxShadow: selectedColor === color ? '0 0 0 2px #fff, 0 0 0 4px ' + color : 'none'
                }}
                title={color}
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: loading ? '#9ca3af' : '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Guardando...' : 'Agregar regla de precio'}
        </button>
      </form>
    </div>
  );
}
