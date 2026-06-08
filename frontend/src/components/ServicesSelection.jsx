import { useState } from 'react';

export default function ServicesSelection({ services, selectedServices, onQuantityChange, maxQuantity, formatCurrency }) {
  const [showServiceDetail, setShowServiceDetail] = useState(null);

  if (!services || services.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 20, padding: 16, background: '#f8f9fa', borderRadius: 8 }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>
        Sumar servicios asociados:
      </h4>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {services.map(service => {
          const quantity = selectedServices[service.id] || 0;
          const maxForThisService = Math.min(maxQuantity, 10); // Límite de 10 por servicio
          
          return (
            <div key={service.id} style={{
              border: '1px solid #dee2e6',
              borderRadius: 6,
              padding: 12,
              background: '#fff'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 8
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                    {service.name}
                  </div>
                  
                  {service.description && (
                    <button
                      type="button"
                      onClick={() => setShowServiceDetail(showServiceDetail === service.id ? null : service.id)}
                      style={{
                        padding: '2px 8px',
                        background: '#007bff',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
                      {showServiceDetail === service.id ? 'Ocultar' : 'Ver detalle'}
                    </button>
                  )}
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {formatCurrency(service.price)}
                  </div>
                  <div style={{ fontSize: 11, color: '#6c757d' }}>
                    por unidad
                  </div>
                </div>
              </div>

              {showServiceDetail === service.id && service.description && (
                <div style={{
                  padding: 8,
                  background: '#e9ecef',
                  borderRadius: 4,
                  fontSize: 12,
                  marginBottom: 8,
                  lineHeight: 1.4
                }}>
                  {service.description}
                </div>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Cantidad:</span>
                
                <select
                  value={quantity}
                  onChange={(e) => onQuantityChange(service.id, parseInt(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #ced4da',
                    borderRadius: 4,
                    fontSize: 13,
                    minWidth: 60
                  }}
                  disabled={maxQuantity === 0}
                >
                  <option value={0}>0</option>
                  {Array.from({ length: Math.min(maxForThisService, maxQuantity) }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>

                {maxQuantity === 0 && (
                  <span style={{ fontSize: 12, color: '#dc3545' }}>
                    Seleccioná primero las entradas
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
