import { useState } from 'react';

/**
 * Component to display a list of shows with admin actions
 */
export default function ShowList({ shows, onEdit, onDelete, onManageSessions, onCreateNew }) {
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const handleDelete = async (showId) => {
    if (deleteConfirm === showId) {
      await onDelete(showId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(showId);
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Espectáculos</h2>
        <button
          onClick={onCreateNew}
          style={{
            padding: '10px 20px',
            background: '#28a745',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          + Crear Espectáculo
        </button>
      </div>

      {shows.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: '#f5f5f5',
          borderRadius: 8,
          color: '#666'
        }}>
          No hay espectáculos creados. Hacé click en "Crear Espectáculo" para empezar.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {shows.map(show => (
            <div
              key={show.id}
              style={{
                padding: 20,
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0' }}>{show.title}</h3>
                <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
                  {show.description && <p style={{ margin: '4px 0' }}>{show.description}</p>}
                  <div style={{ marginTop: 8 }}>
                    <strong>Precios:</strong>
                    {show.pricing_json && (
                      <span style={{ marginLeft: 8 }}>
                        Platea: ${Number(show.pricing_json.platea_general || 0).toLocaleString('es-AR')} | 
                        Palcos Bajos: ${Number(show.pricing_json.palcos_bajos || 0).toLocaleString('es-AR')} | 
                        Palcos Altos: ${Number(show.pricing_json.palcos_altos || 0).toLocaleString('es-AR')} | 
                        Pullman: ${Number(show.pricing_json.pullman || 0).toLocaleString('es-AR')}
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <strong>Duración:</strong> {show.duration_minutes} minutos
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <strong>Sesiones:</strong> {show.sessions?.length || 0}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => onManageSessions(show)}
                  style={{
                    padding: '8px 16px',
                    background: '#007bff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  📅 Sesiones
                </button>
                <button
                  onClick={() => onEdit(show)}
                  style={{
                    padding: '8px 16px',
                    background: '#ffc107',
                    color: '#000',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => handleDelete(show.id)}
                  style={{
                    padding: '8px 16px',
                    background: deleteConfirm === show.id ? '#dc3545' : '#6c757d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 14
                  }}
                >
                  {deleteConfirm === show.id ? '⚠️ Confirmar' : '🗑️ Eliminar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
