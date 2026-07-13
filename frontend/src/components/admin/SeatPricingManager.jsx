import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

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

export default function SeatPricingManager({ 
  showId, 
  sessionId = null, 
  draftRules = [], 
  onRulesChange,
  isDraft = false 
}) {
  const { token } = useAuth();
  
  // Server rules (for existing shows/sessions)
  const [serverRules, setServerRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Use draftRules if in draft mode, otherwise use serverRules
  const rules = isDraft ? draftRules : serverRules;
  const setRules = isDraft ? onRulesChange : setServerRules;
  
  // Form state
  const [selectedType, setSelectedType] = useState('platea_rows'); // platea_rows, palcos_bajos, palcos_altos
  const [rowFrom, setRowFrom] = useState('A');
  const [rowTo, setRowTo] = useState('C');
  const [palcoFrom, setPalcoFrom] = useState(1);
  const [palcoTo, setPalcoTo] = useState(5);
  const [price, setPrice] = useState('');
  const [isPalcoAlto, setIsPalcoAlto] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#10b981');

  const loadRules = async () => {
    // Skip if in draft mode or no showId
    if (isDraft || !showId) return;
    
    setLoading(true);
    try {
      const queryParams = sessionId ? `?sessionId=${sessionId}` : '';
      const res = await apiAuthFetch(`/api/seat-pricing/rules/${showId}${queryParams}`, {}, token);
      const data = await res.json();
      
      if (data.success) {
        setServerRules(data.rules);
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
  }, [showId, sessionId, isDraft]);

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
      if (isDraft) {
        // In draft mode, just add to local state
        const newRule = {
          id: `draft-${Date.now()}`,
          ...payload,
          created_at: new Date().toISOString()
        };
        onRulesChange([...draftRules, newRule]);
        setSuccess('Regla agregada (se guardará al crear el espectáculo)');
        setPrice('');
        setSelectedColor('#10b981');
      } else {
        // Server mode - save to API
        const res = await apiAuthFetch('/api/seat-pricing/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }, token);

        const data = await res.json();

        if (data.success) {
          setSuccess('Regla de precio creada exitosamente');
          setPrice('');
          setSelectedColor('#10b981');
          loadRules();
        } else {
          setError(data.message || 'Error al crear regla');
        }
      }
    } catch (err) {
      setError('Error de conexión al guardar');
    }
  };

  const handleDelete = async (ruleId) => {
    if (!confirm('¿Estás seguro de eliminar esta regla de precio?')) return;

    setError(null);
    setSuccess(null);

    if (isDraft) {
      // In draft mode, just remove from local state
      onRulesChange(draftRules.filter(r => r.id !== ruleId));
      setSuccess('Regla eliminada');
    } else {
      // Server mode - delete from API
      try {
        const res = await apiAuthFetch(`/api/seat-pricing/rules/${ruleId}`, {
          method: 'DELETE'
        }, token);

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
      <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              style={{
                width: '50px',
                height: '36px',
                padding: '2px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                background: '#fff'
              }}
            />
            <span style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
              {selectedColor}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
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
      </div>
    </div>
  );
}
