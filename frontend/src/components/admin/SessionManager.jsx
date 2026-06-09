import { useState } from 'react';
import SeatPricingManager from './SeatPricingManager';

/**
 * Component to manage sessions for a show
 */
export default function SessionManager({ show, sessions, onAddSession, onDeleteSession, onEditSession, onClose }) {
  const [newSession, setNewSession] = useState({
    starts_at: '',
    capacity_override: '',
    use_custom_pricing: false,
    general_price: '',
    platea_general: '',
    palcos_bajos: '',
    palcos_altos: '',
    pullman: '',
    palcos_individual_seats: null
  });
  const [editingSession, setEditingSession] = useState(null);

  const isGeneralAdmission = show.venue_type !== 'sala_principal';
  
  // Parse pricing_json if it's a string
  let pricing = show.pricing_json;
  if (typeof pricing === 'string') {
    try {
      pricing = JSON.parse(pricing);
    } catch (e) {
      pricing = {};
    }
  }
  pricing = pricing || {};
  
  // Debug: log show data
  console.log('[SessionManager] Show data:', {
    id: show.id,
    title: show.title,
    venue_type: show.venue_type,
    pricing_json: pricing,
    pricing_raw: show.pricing_json,
    general_capacity: show.general_capacity,
    isGeneralAdmission
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newSession.starts_at) {
      alert('La fecha y hora son obligatorias');
      return;
    }

    const payload = {
      show_id: show.id,
      starts_at: new Date(newSession.starts_at).toISOString(),
      capacity_override: newSession.capacity_override ? Number(newSession.capacity_override) : null,
      palcos_individual_seats: newSession.palcos_individual_seats
    };

    // Include custom pricing if enabled - merge with show defaults for missing values
    if (newSession.use_custom_pricing) {
      if (isGeneralAdmission) {
        payload.pricing_json = {
          general: newSession.general_price ? Number(newSession.general_price) : (pricing?.general ?? 0)
        };
      } else {
        payload.pricing_json = {
          platea_general: newSession.platea_general ? Number(newSession.platea_general) : (pricing?.platea_general ?? 0),
          palcos_bajos: newSession.palcos_bajos ? Number(newSession.palcos_bajos) : (pricing?.palcos_bajos ?? 0),
          palcos_altos: newSession.palcos_altos ? Number(newSession.palcos_altos) : (pricing?.palcos_altos ?? 0),
          pullman: newSession.pullman ? Number(newSession.pullman) : (pricing?.pullman ?? 0)
        };
      }
    }

    onAddSession(payload);
    setNewSession({ 
      starts_at: '', 
      capacity_override: '', 
      use_custom_pricing: false,
      general_price: '',
      platea_general: '',
      palcos_bajos: '',
      palcos_altos: '',
      pullman: '',
      palcos_individual_seats: null
    });
  };

  const sortedSessions = [...sessions].sort((a, b) => 
    new Date(a.starts_at) - new Date(b.starts_at)
  );

  return (
    <div style={{
      padding: 24,
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: 8
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: '0 0 8px 0' }}>Gestión de Sesiones</h2>
          <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
            <strong>{show.title}</strong>
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#6c757d',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          ← Volver
        </button>
      </div>

      {/* Add new session form */}
      <form onSubmit={handleSubmit} style={{
        padding: 20,
        background: '#f8f9fa',
        borderRadius: 6,
        marginBottom: 24
      }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Agregar Nueva Sesión</h3>
        
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, maxWidth: 600 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 14 }}>
                Fecha *
              </label>
              <input
                type="date"
                value={newSession.starts_at.split('T')[0] || ''}
                onChange={(e) => {
                  const date = e.target.value;
                  const time = newSession.starts_at.split('T')[1] || '20:00';
                  setNewSession(prev => ({ ...prev, starts_at: `${date}T${time}` }));
                }}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid #ccc'
                }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 14 }}>
                Hora *
              </label>
              <select
                value={newSession.starts_at.split('T')[1]?.substring(0, 2) || '20'}
                onChange={(e) => {
                  const date = newSession.starts_at.split('T')[0] || new Date().toISOString().split('T')[0];
                  const minutes = newSession.starts_at.split('T')[1]?.substring(3, 5) || '00';
                  setNewSession(prev => ({ ...prev, starts_at: `${date}T${e.target.value}:${minutes}` }));
                }}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid #ccc'
                }}
                required
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={String(i).padStart(2, '0')}>
                    {String(i).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 14 }}>
                Minutos *
              </label>
              <select
                value={newSession.starts_at.split('T')[1]?.substring(3, 5) || '00'}
                onChange={(e) => {
                  const date = newSession.starts_at.split('T')[0] || new Date().toISOString().split('T')[0];
                  const hour = newSession.starts_at.split('T')[1]?.substring(0, 2) || '20';
                  setNewSession(prev => ({ ...prev, starts_at: `${date}T${hour}:${e.target.value}` }));
                }}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid #ccc'
                }}
                required
              >
                <option value="00">00</option>
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
              </select>
            </div>
          </div>
        </div>

        {/* Custom pricing toggle */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={newSession.use_custom_pricing}
              onChange={(e) => setNewSession(prev => ({ ...prev, use_custom_pricing: e.target.checked }))}
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              Precios personalizados para esta función
            </span>
          </label>
          <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0 24px' }}>
            {isGeneralAdmission 
              ? `Por defecto usa: Entrada General $${(pricing?.general || 0).toLocaleString('es-AR')}`
              : `Por defecto usa: Platea $${(pricing?.platea_general || 0).toLocaleString('es-AR')} | Palcos Bajos $${(pricing?.palcos_bajos || 0).toLocaleString('es-AR')} | Palcos Altos $${(pricing?.palcos_altos || 0).toLocaleString('es-AR')} | Pullman $${(pricing?.pullman || 0).toLocaleString('es-AR')}`
            }
          </p>
        </div>

        {/* Palcos individual seats toggle - only for sala_principal */}
        {!isGeneralAdmission && (
          <div style={{ 
            marginBottom: 16,
            padding: 12, 
            background: newSession.palcos_individual_seats ? '#fef3c7' : '#f8fafc',
            borderRadius: 8,
            border: `1px solid ${newSession.palcos_individual_seats ? '#fcd34d' : '#e2e8f0'}`
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newSession.palcos_individual_seats === true}
                onChange={(e) => setNewSession(prev => ({ 
                  ...prev, 
                  palcos_individual_seats: e.target.checked ? true : null 
                }))}
                style={{ accentColor: '#f59e0b' }}
              />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>
                🪑 Palcos con butacas individuales
              </span>
            </label>
            <p style={{ fontSize: 12, color: '#666', margin: '4px 0 0 24px' }}>
              {newSession.palcos_individual_seats 
                ? 'Esta función NO muestra "(x4 localidades)" ni "(x2 localidades)"'
                : `Por defecto: ${show.palcos_individual_seats ? 'Butacas individuales' : 'Palcos completos'} (heredado del show)`
              }
            </p>
          </div>
        )}

        {/* Custom pricing fields */}
        {newSession.use_custom_pricing && (
          <div style={{ 
            marginBottom: 16, 
            padding: 12, 
            background: '#fff', 
            borderRadius: 4,
            border: '1px solid #ddd'
          }}>
            {isGeneralAdmission ? (
              <div style={{ maxWidth: 300 }}>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
                  Precio Entrada General ($)
                </label>
                <input
                  type="number"
                  value={newSession.general_price}
                  onChange={(e) => setNewSession(prev => ({ ...prev, general_price: e.target.value }))}
                  placeholder={pricing?.general || ''}
                  style={{
                    width: '100%',
                    padding: 6,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    fontSize: 13
                  }}
                />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
                    Platea ($)
                  </label>
                  <input
                    type="number"
                    value={newSession.platea_general}
                    onChange={(e) => setNewSession(prev => ({ ...prev, platea_general: e.target.value }))}
                    placeholder={pricing?.platea_general || ''}
                    style={{
                      width: '100%',
                      padding: 6,
                      borderRadius: 4,
                      border: '1px solid #ccc',
                      fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
                    Palcos Bajos ($)
                  </label>
                  <input
                    type="number"
                    value={newSession.palcos_bajos}
                    onChange={(e) => setNewSession(prev => ({ ...prev, palcos_bajos: e.target.value }))}
                    placeholder={pricing?.palcos_bajos || ''}
                    style={{
                      width: '100%',
                      padding: 6,
                      borderRadius: 4,
                      border: '1px solid #ccc',
                      fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
                    Palcos Altos ($)
                  </label>
                  <input
                    type="number"
                    value={newSession.palcos_altos}
                    onChange={(e) => setNewSession(prev => ({ ...prev, palcos_altos: e.target.value }))}
                    placeholder={pricing?.palcos_altos || ''}
                    style={{
                      width: '100%',
                      padding: 6,
                      borderRadius: 4,
                      border: '1px solid #ccc',
                      fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
                    Pullman ($)
                  </label>
                  <input
                    type="number"
                    value={newSession.pullman}
                    onChange={(e) => setNewSession(prev => ({ ...prev, pullman: e.target.value }))}
                    placeholder={pricing?.pullman || ''}
                    style={{
                      width: '100%',
                      padding: 6,
                      borderRadius: 4,
                      border: '1px solid #ccc',
                      fontSize: 13
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          style={{
            padding: '9px 20px',
            background: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontWeight: 600,
            width: '100%'
          }}
        >
          + Agregar Sesión
        </button>
      </form>

      {/* Sessions list */}
      <div>
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>
          Sesiones Programadas ({sortedSessions.length})
        </h3>
        
        {sortedSessions.length === 0 ? (
          <div style={{
            padding: 30,
            textAlign: 'center',
            background: '#f5f5f5',
            borderRadius: 6,
            color: '#666'
          }}>
            No hay sesiones programadas para este espectáculo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sortedSessions.map(session => {
              const date = new Date(session.starts_at);
              const dateStr = date.toLocaleDateString('es-AR', { 
                weekday: 'long',
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              });
              const timeStr = date.toLocaleTimeString('es-AR', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false
              });

              const isPast = date < new Date();

              // Get session pricing (if any)
              const sessionPricing = session.pricing_json || {};
              
              return (
                <div key={session.id}>
                  {editingSession?.id === session.id ? (
                    /* Edit mode */
                    <div style={{
                      padding: 16,
                      background: '#fffbeb',
                      border: '2px solid #f59e0b',
                      borderRadius: 6
                    }}>
                      {/* Date/Time Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Fecha</label>
                          <input
                            type="date"
                            value={editingSession.starts_at.split('T')[0] || ''}
                            onChange={(e) => {
                              const newDate = e.target.value;
                              const time = editingSession.starts_at.split('T')[1] || '20:00';
                              setEditingSession(prev => ({ ...prev, starts_at: `${newDate}T${time}` }));
                            }}
                            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Hora</label>
                          <select
                            value={editingSession.starts_at.split('T')[1]?.substring(0, 2) || '20'}
                            onChange={(e) => {
                              const dateVal = editingSession.starts_at.split('T')[0];
                              const minutes = editingSession.starts_at.split('T')[1]?.substring(3, 5) || '00';
                              setEditingSession(prev => ({ ...prev, starts_at: `${dateVal}T${e.target.value}:${minutes}` }));
                            }}
                            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                          >
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={String(i).padStart(2, '0')}>{String(i).padStart(2, '0')}:00</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Min</label>
                          <select
                            value={editingSession.starts_at.split('T')[1]?.substring(3, 5) || '00'}
                            onChange={(e) => {
                              const dateVal = editingSession.starts_at.split('T')[0];
                              const hour = editingSession.starts_at.split('T')[1]?.substring(0, 2) || '20';
                              setEditingSession(prev => ({ ...prev, starts_at: `${dateVal}T${hour}:${e.target.value}` }));
                            }}
                            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
                          >
                            <option value="00">00</option>
                            <option value="15">15</option>
                            <option value="30">30</option>
                            <option value="45">45</option>
                          </select>
                        </div>
                      </div>

                      {/* Custom Pricing Toggle */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editingSession.use_custom_pricing || false}
                            onChange={(e) => setEditingSession(prev => ({ 
                              ...prev, 
                              use_custom_pricing: e.target.checked,
                              pricing_json: e.target.checked ? (prev.pricing_json || {}) : null
                            }))}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>Precios personalizados para esta función</span>
                        </label>
                        <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0 24px' }}>
                          {isGeneralAdmission 
                            ? `Por defecto: $${(pricing?.general || 0).toLocaleString('es-AR')}`
                            : `Por defecto: Platea $${(pricing?.platea_general || 0).toLocaleString('es-AR')} | P.Bajos $${(pricing?.palcos_bajos || 0).toLocaleString('es-AR')} | P.Altos $${(pricing?.palcos_altos || 0).toLocaleString('es-AR')} | Pullman $${(pricing?.pullman || 0).toLocaleString('es-AR')}`
                          }
                        </p>
                      </div>

                      {/* Custom Pricing Fields */}
                      {editingSession.use_custom_pricing && (
                        <div style={{ 
                          padding: 12, 
                          background: '#fff', 
                          borderRadius: 4,
                          border: '1px solid #e5e7eb',
                          marginBottom: 12
                        }}>
                          {isGeneralAdmission ? (
                            <div style={{ maxWidth: 200 }}>
                              <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                                Precio Entrada ($)
                              </label>
                              <input
                                type="number"
                                value={editingSession.pricing_json?.general || ''}
                                onChange={(e) => setEditingSession(prev => ({ 
                                  ...prev, 
                                  pricing_json: { ...prev.pricing_json, general: e.target.value ? Number(e.target.value) : null }
                                }))}
                                placeholder={pricing?.general || ''}
                                style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                              />
                            </div>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Platea ($)</label>
                                <input
                                  type="number"
                                  value={editingSession.pricing_json?.platea_general || ''}
                                  onChange={(e) => setEditingSession(prev => ({ 
                                    ...prev, 
                                    pricing_json: { ...prev.pricing_json, platea_general: e.target.value ? Number(e.target.value) : null }
                                  }))}
                                  placeholder={pricing?.platea_general || ''}
                                  style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600 }}>P. Bajos ($)</label>
                                <input
                                  type="number"
                                  value={editingSession.pricing_json?.palcos_bajos || ''}
                                  onChange={(e) => setEditingSession(prev => ({ 
                                    ...prev, 
                                    pricing_json: { ...prev.pricing_json, palcos_bajos: e.target.value ? Number(e.target.value) : null }
                                  }))}
                                  placeholder={pricing?.palcos_bajos || ''}
                                  style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600 }}>P. Altos ($)</label>
                                <input
                                  type="number"
                                  value={editingSession.pricing_json?.palcos_altos || ''}
                                  onChange={(e) => setEditingSession(prev => ({ 
                                    ...prev, 
                                    pricing_json: { ...prev.pricing_json, palcos_altos: e.target.value ? Number(e.target.value) : null }
                                  }))}
                                  placeholder={pricing?.palcos_altos || ''}
                                  style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Pullman ($)</label>
                                <input
                                  type="number"
                                  value={editingSession.pricing_json?.pullman || ''}
                                  onChange={(e) => setEditingSession(prev => ({ 
                                    ...prev, 
                                    pricing_json: { ...prev.pricing_json, pullman: e.target.value ? Number(e.target.value) : null }
                                  }))}
                                  placeholder={pricing?.pullman || ''}
                                  style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', fontSize: 13 }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Precios especiales por ubicación para esta sesión */}
                      {!isGeneralAdmission && (
                        <div style={{ marginTop: 16, marginBottom: 16 }}>
                          <SeatPricingManager 
                            showId={show.id} 
                            sessionId={editingSession.id}
                          />
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setEditingSession(null)}
                          style={{ padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => {
                            if (onEditSession) {
                              const updateData = {
                                starts_at: new Date(editingSession.starts_at).toISOString()
                              };
                              if (editingSession.use_custom_pricing && editingSession.pricing_json) {
                                // Merge with show defaults for any missing/null values
                                if (isGeneralAdmission) {
                                  updateData.pricing_json = {
                                    general: editingSession.pricing_json.general ?? pricing?.general ?? 0
                                  };
                                } else {
                                  updateData.pricing_json = {
                                    platea_general: editingSession.pricing_json.platea_general ?? pricing?.platea_general ?? 0,
                                    palcos_bajos: editingSession.pricing_json.palcos_bajos ?? pricing?.palcos_bajos ?? 0,
                                    palcos_altos: editingSession.pricing_json.palcos_altos ?? pricing?.palcos_altos ?? 0,
                                    pullman: editingSession.pricing_json.pullman ?? pricing?.pullman ?? 0
                                  };
                                }
                              } else if (!editingSession.use_custom_pricing) {
                                updateData.pricing_json = null;
                              }
                              onEditSession(editingSession.id, updateData);
                            }
                            setEditingSession(null);
                          }}
                          style={{ padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                        >
                          💾 Guardar Cambios
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display mode */
                    <div
                      style={{
                        padding: '12px 16px',
                        background: isPast ? '#f5f5f5' : '#fff',
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        opacity: isPast ? 0.6 : 1
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                          {dateStr} - {timeStr}
                        </span>
                        {isPast && <span style={{ color: '#dc3545', fontSize: 12, fontWeight: 600 }}>Finalizada</span>}
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        {!isPast && (
                          <button
                            onClick={() => {
                              const sessionDate = new Date(session.starts_at);
                              const localDate = sessionDate.toISOString().slice(0, 10);
                              const localTime = sessionDate.toTimeString().slice(0, 5);
                              const hasCustomPricing = session.pricing_json && Object.keys(session.pricing_json).length > 0;
                              // Pre-populate with session pricing merged with show defaults
                              const sessionPricing = session.pricing_json || {};
                              const mergedPricing = isGeneralAdmission 
                                ? { general: sessionPricing.general ?? pricing?.general ?? 0 }
                                : {
                                    platea_general: sessionPricing.platea_general ?? pricing?.platea_general ?? 0,
                                    palcos_bajos: sessionPricing.palcos_bajos ?? pricing?.palcos_bajos ?? 0,
                                    palcos_altos: sessionPricing.palcos_altos ?? pricing?.palcos_altos ?? 0,
                                    pullman: sessionPricing.pullman ?? pricing?.pullman ?? 0
                                  };
                              setEditingSession({
                                id: session.id,
                                starts_at: `${localDate}T${localTime}`,
                                use_custom_pricing: hasCustomPricing,
                                pricing_json: mergedPricing
                              });
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#3b82f6',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer',
                              fontSize: 13
                            }}
                          >
                            ✏️ Editar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm('¿Estás seguro de eliminar esta sesión?')) {
                              onDeleteSession(session.id);
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            background: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 13
                          }}
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
