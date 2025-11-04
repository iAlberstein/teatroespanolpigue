import { useState } from 'react';

/**
 * Component to manage sessions for a show
 */
export default function SessionManager({ show, sessions, onAddSession, onDeleteSession, onClose }) {
  const [newSession, setNewSession] = useState({
    starts_at: '',
    capacity_override: '',
    use_custom_pricing: false,
    platea_general: '',
    palcos_bajos: '',
    palcos_altos: '',
    pullman: ''
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
      capacity_override: newSession.capacity_override ? Number(newSession.capacity_override) : null
    };

    // Include custom pricing if enabled
    if (newSession.use_custom_pricing) {
      payload.pricing_json = {
        platea_general: newSession.platea_general ? Number(newSession.platea_general) : (show.pricing_json?.platea_general || 5000),
        palcos_bajos: newSession.palcos_bajos ? Number(newSession.palcos_bajos) : (show.pricing_json?.palcos_bajos || 10000),
        palcos_altos: newSession.palcos_altos ? Number(newSession.palcos_altos) : (show.pricing_json?.palcos_altos || 8000),
        pullman: newSession.pullman ? Number(newSession.pullman) : (show.pricing_json?.pullman || 3000)
      };
    }

    onAddSession(payload);
    setNewSession({ 
      starts_at: '', 
      capacity_override: '', 
      use_custom_pricing: false,
      platea_general: '',
      palcos_bajos: '',
      palcos_altos: '',
      pullman: ''
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
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 14 }}>
                Fecha y Hora *
              </label>
              <input
                type="datetime-local"
                value={newSession.starts_at}
                onChange={(e) => setNewSession(prev => ({ ...prev, starts_at: e.target.value }))}
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
                Capacidad (opcional)
              </label>
              <input
                type="number"
                value={newSession.capacity_override}
                onChange={(e) => setNewSession(prev => ({ ...prev, capacity_override: e.target.value }))}
                placeholder="Default: 154"
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid #ccc'
                }}
              />
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
            Por defecto usa: Platea ${show.pricing_json?.platea_general || 5000} | Palcos Bajos ${show.pricing_json?.palcos_bajos || 10000} | Palcos Altos ${show.pricing_json?.palcos_altos || 8000} | Pullman ${show.pricing_json?.pullman || 3000}
          </p>
        </div>

        {/* Custom pricing fields */}
        {newSession.use_custom_pricing && (
          <div style={{ 
            marginBottom: 16, 
            padding: 12, 
            background: '#fff', 
            borderRadius: 4,
            border: '1px solid #ddd'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>
                  Platea ($)
                </label>
                <input
                  type="number"
                  value={newSession.platea_general}
                  onChange={(e) => setNewSession(prev => ({ ...prev, platea_general: e.target.value }))}
                  placeholder={show.pricing_json?.platea_general || '5000'}
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
                  placeholder={show.pricing_json?.palcos_bajos || '10000'}
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
                  placeholder={show.pricing_json?.palcos_altos || '8000'}
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
                  placeholder={show.pricing_json?.pullman || '3000'}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

              return (
                <div
                  key={session.id}
                  style={{
                    padding: 16,
                    background: isPast ? '#f5f5f5' : '#fff',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: isPast ? 0.6 : 1
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>
                      {dateStr}
                    </div>
                    <div style={{ fontSize: 14, color: '#666' }}>
                      🕐 {timeStr} | 
                      👥 Capacidad: {session.capacity_override || 154} | 
                      {isPast && <span style={{ color: '#dc3545', marginLeft: 8 }}>⚠️ Finalizada</span>}
                    </div>
                  </div>

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
                      fontSize: 14
                    }}
                  >
                    🗑️ Eliminar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
