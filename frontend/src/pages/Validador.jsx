import { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { apiAuthFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import '../styles/qr-scanner.css';

export default function Validador() {
  const { user, token } = useAuth();
  const [scanning, setScanning] = useState(true);
  const [scannedData, setScannedData] = useState(null);
  const [selectedSubTickets, setSelectedSubTickets] = useState([]); // Array of "ticketId-subIndex" strings
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [error, setError] = useState('');
  const isProcessingRef = useRef(false);
  const scannerRef = useRef(null);
  const html5QrcodeScannerRef = useRef(null);

  // Verificar permisos
  useEffect(() => {
    if (user && !['admin', 'boleteria'].includes(user.role)) {
      setError('No tenés permisos para acceder a esta sección');
    }
  }, [user]);

  // Inicializar escáner
  useEffect(() => {
    if (!scanning || !token) {
      // Cleanup scanner when not scanning
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.clear().catch(() => {});
        html5QrcodeScannerRef.current = null;
      }
      return;
    }

    // Evitar re-crear si ya existe
    if (html5QrcodeScannerRef.current) {
      return;
    }

    // Nueva sesión de escaneo: permitir procesar un nuevo QR
    isProcessingRef.current = false;

    const onScanSuccess = (decodedText) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      console.log('[VALIDADOR] QR escaneado:', decodedText);

      // Detener escaneo inmediatamente para que no sigan llegando callbacks
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.clear().catch(() => {});
        html5QrcodeScannerRef.current = null;
      }

      setScanning(false);
      handleScan(decodedText);
    };

    const onScanFailure = (error) => {
      // Silenciar errores de escaneo fallido (normal mientras se escanea)
    };

    const config = {
      fps: 10,
      qrbox: function(viewfinderWidth, viewfinderHeight) {
        // 90% del área disponible
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.9);
        return { width: qrboxSize, height: qrboxSize };
      },
      aspectRatio: 1.0,
      disableFlip: false
    };

    html5QrcodeScannerRef.current = new Html5QrcodeScanner(
      'qr-reader',
      config,
      false
    );

    html5QrcodeScannerRef.current.render(onScanSuccess, onScanFailure);

    return () => {
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.clear().catch(() => {});
        html5QrcodeScannerRef.current = null;
      }
    };
  }, [scanning, token]);

  const handleScan = async (decodedText) => {
    console.log('[VALIDADOR] QR escaneado:', decodedText);
    
    // Vibración si está disponible
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
    
    // Llamar al backend para obtener info del QR
    try {
      const response = await apiAuthFetch('/api/tickets/scan-qr', {
        method: 'POST',
        body: JSON.stringify({ qr_data: decodedText })
      }, token);

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.message || 'Error al procesar el QR');
        setTimeout(() => {
          setError('');
          setScanning(true);
        }, 3000);
        return;
      }

      const data = await response.json();
      console.log('[VALIDADOR] Tickets escaneados:', data.tickets?.map(t => ({ id: t.id, location: t.location })));
      setScannedData(data);
      
      // NO auto-seleccionar - dejar que el boletero seleccione manualmente
      setSelectedSubTickets([]);
    } catch (err) {
      console.error('[VALIDADOR] Error al procesar QR:', err);
      setError('Error de conexión al procesar el QR');
      setTimeout(() => {
        setError('');
        setScanning(true);
      }, 3000);
    }
  };

  const toggleSubTicket = (subTicketKey) => {
    setSelectedSubTickets(prev => {
      if (prev.includes(subTicketKey)) {
        return prev.filter(key => key !== subTicketKey);
      }
      return [...prev, subTicketKey];
    });
  };

  const handleValidate = async () => {
    if (selectedSubTickets.length === 0) {
      setError('Seleccioná al menos una entrada para validar');
      return;
    }

    setValidating(true);
    setError('');

    try {
      // Agrupar sub-tickets por ticket_id y contar
      // subKey format: "uuid-v4-with-dashes-index" donde index es el último después del último guion
      const ticketCounts = new Map();
      selectedSubTickets.forEach(subKey => {
        const lastDashIndex = subKey.lastIndexOf('-');
        const ticketId = subKey.substring(0, lastDashIndex);
        ticketCounts.set(ticketId, (ticketCounts.get(ticketId) || 0) + 1);
      });

      const validations = Array.from(ticketCounts.entries()).map(([ticket_id, quantity]) => ({
        ticket_id,
        quantity
      }));

      console.log('[VALIDADOR] Enviando validaciones:', JSON.stringify(validations, null, 2));
      
      const response = await apiAuthFetch('/api/tickets/validate-tickets', {
        method: 'POST',
        body: JSON.stringify({ validations })
      }, token);

      console.log('[VALIDADOR] Response status:', response.status);

      if (!response.ok) {
        const result = await response.json().catch(() => ({ error: 'Error de servidor' }));
        console.error('[VALIDADOR] Error response:', result);
        setError(result.message || result.error || 'Error al validar entradas');
        setValidating(false);
        return;
      }

      const result = await response.json();

      // Vibración de éxito
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }

      setValidationResult(result);
      
      // Actualizar datos escaneados
      setScannedData(prev => ({
        ...prev,
        tickets: prev.tickets.map(t => {
          const validated = result.results.validated.find(v => v.id === t.id);
          const partial = result.results.partially_validated.find(p => p.id === t.id);
          
          if (validated) {
            return { 
              ...t, 
              status: 'validated', 
              validated_at: new Date().toISOString(),
              capacity_validated: validated.capacity_validated 
            };
          } else if (partial) {
            return { 
              ...t, 
              capacity_validated: partial.capacity_validated 
            };
          }
          return t;
        })
      }));

      setSelectedSubTickets([]);
    } catch (err) {
      console.error('[VALIDADOR] Error al validar:', err);
      setError('Error de conexión al validar entradas');
    } finally {
      setValidating(false);
    }
  };

  const handleScanNext = () => {
    setScannedData(null);
    setSelectedSubTickets([]);
    setValidationResult(null);
    setError('');
    setScanning(true);
    // El useEffect se encargará de reiniciar el escáner cuando scanning cambie a true
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  if (user && !['admin', 'boleteria'].includes(user.role)) {
    return (
      <div style={{ padding: 20, textAlign: 'center' }}>
        <h1>Acceso Denegado</h1>
        <p>No tenés permisos para acceder a esta sección.</p>
      </div>
    );
  }

  const totalSelected = selectedSubTickets.length;
  const saleInfo = scannedData?.sale_info || {};
  const isRefundedSale = !!saleInfo.refunded;
  const refundLocations = Array.isArray(saleInfo.refund_locations) ? saleInfo.refund_locations : [];

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: 20 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 24, textAlign: 'center' }}>Validador de Entradas</h1>

        {error && (
          <div style={{ 
            padding: 16, 
            background: '#fee', 
            border: '1px solid #fcc', 
            borderRadius: 8, 
            marginBottom: 16,
            textAlign: 'center',
            color: '#c00',
            fontWeight: 600
          }}>
            {error}
          </div>
        )}

        {validationResult && (
          <div style={{ 
            padding: 16, 
            background: '#efe', 
            border: '1px solid #cfc', 
            borderRadius: 8, 
            marginBottom: 16,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#060', marginBottom: 8 }}>
              ✓ Validación Exitosa
            </div>
            <div style={{ fontSize: 14, color: '#333' }}>
              {validationResult.validated_count} completamente validada{validationResult.validated_count !== 1 ? 's' : ''}
              {validationResult.partially_validated_count > 0 && (
                <span> • {validationResult.partially_validated_count} parcialmente validada{validationResult.partially_validated_count !== 1 ? 's' : ''}</span>
              )}
            </div>
            {validationResult.already_validated_count > 0 && (
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                {validationResult.already_validated_count} ya estaba{validationResult.already_validated_count !== 1 ? 'n' : ''} validada{validationResult.already_validated_count !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {scanning && (
          <div style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#000',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div id="qr-reader" ref={scannerRef} style={{ width: '100%', height: '100%' }}></div>
            </div>
            <div style={{ padding: 16, background: '#1f2937' }}>
              <button
                onClick={() => setScanning(false)}
                style={{
                  width: '100%',
                  padding: 16,
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ← Volver
              </button>
            </div>
          </div>
        )}

        {!scanning && scannedData && (
          <div style={{ background: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            {/* Título del espectáculo */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                {scannedData.sale_info.show_name}
              </h2>
              <div style={{ fontSize: 14, color: '#6b7280' }}>
                {formatDate(scannedData.sale_info.session_date)} - {formatTime(scannedData.sale_info.session_date)}
              </div>
              {scannedData.qr_type === 'container' && scannedData.sale_info.customer_name && (
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                  Cliente: {scannedData.sale_info.customer_name}
                </div>
              )}
            </div>

            {isRefundedSale && (
              <div
                style={{
                  marginBottom: 24,
                  padding: 16,
                  borderRadius: 8,
                  background: '#fef3c7',
                  border: '1px solid #facc15',
                  textAlign: 'left'
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                  Compra reintegrada
                </div>
                <div style={{ fontSize: 13, color: '#92400e' }}>
                  {saleInfo.refund_reason
                    ? `Motivo: ${saleInfo.refund_reason}`
                    : 'Las entradas asociadas a esta compra fueron devueltas.'}
                </div>
                {refundLocations.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Entradas devueltas:</div>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {refundLocations.map((loc, index) => (
                        <li key={index}>{loc}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {typeof saleInfo.original_amount === 'number' && !Number.isNaN(saleInfo.original_amount) && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
                    Monto devuelto: ${Math.abs(saleInfo.original_amount).toLocaleString('es-AR')}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
                  No se pueden validar entradas de una compra reintegrada.
                </div>
              </div>
            )}

            {/* Cards de ubicaciones */}
            <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
              {scannedData.tickets.flatMap((ticket) => {
                const currentValidated = ticket.capacity_validated || 0;
                const totalCapacity = ticket.capacity || 1;
                
                // Para palcos y pullman con capacidad > 1, crear sub-ubicaciones
                if (totalCapacity > 1) {
                  return Array.from({ length: totalCapacity }, (_, index) => {
                    const subTicketKey = `${ticket.id}-${index}`;
                    const isValidated = index < currentValidated;
                    const isSelected = selectedSubTickets.includes(subTicketKey);
                    const personLabel = ticket.type === 'palco' ? `Persona ${index + 1}` : `Pullman ${index + 1}`;
                    
                    return (
                      <div
                        key={subTicketKey}
                        onClick={() => !isValidated && toggleSubTicket(subTicketKey)}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          border: isSelected ? '3px solid #22c55e' : isValidated ? '2px solid #ef4444' : '2px solid #e5e7eb',
                          background: isSelected ? '#f0fdf4' : isValidated ? '#fee' : 'white',
                          cursor: isValidated ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          opacity: isValidated ? 0.7 : 1
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: isValidated ? '#dc2626' : '#111827' }}>
                              {ticket.location} - {personLabel}
                            </div>
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                              {ticket.section}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {isValidated ? (
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626' }}>
                                YA VALIDADA
                              </div>
                            ) : (
                              <div style={{ fontSize: 18, fontWeight: 700, color: isSelected ? '#22c55e' : '#9ca3af' }}>
                                {isSelected ? '✓' : '○'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                }
                
                // Para butacas (capacity = 1), renderizado normal
                const isValidated = ticket.status === 'validated';
                const subTicketKey = `${ticket.id}-0`;
                const isSelected = selectedSubTickets.includes(subTicketKey);
                
                return (
                  <div
                    key={ticket.id}
                    onClick={() => !isValidated && toggleSubTicket(subTicketKey)}
                    style={{
                      padding: 16,
                      borderRadius: 8,
                      border: isSelected ? '3px solid #22c55e' : isValidated ? '2px solid #ef4444' : '2px solid #e5e7eb',
                      background: isSelected ? '#f0fdf4' : isValidated ? '#fee' : 'white',
                      cursor: isValidated ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: isValidated ? 0.7 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: isValidated ? '#dc2626' : '#111827' }}>
                          {ticket.location}
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                          {ticket.section}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {isValidated ? (
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626' }}>
                            YA VALIDADA
                          </div>
                        ) : (
                          <div style={{ fontSize: 18, fontWeight: 700, color: isSelected ? '#22c55e' : '#9ca3af' }}>
                            {isSelected ? '✓' : '○'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botones de acción */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleScanNext}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Escanear Siguiente
              </button>
              <button
                onClick={handleValidate}
                disabled={isRefundedSale || selectedSubTickets.length === 0 || validating}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  background: isRefundedSale || selectedSubTickets.length === 0 ? '#d1d5db' : '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: isRefundedSale || selectedSubTickets.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: validating ? 0.7 : 1
                }}
              >
                {isRefundedSale
                  ? 'Compra reintegrada'
                  : validating
                    ? 'Validando...'
                    : `Validar ${totalSelected > 0 ? `(${totalSelected})` : ''}`}
              </button>
            </div>
          </div>
        )}

        {!scanning && !scannedData && (
          <div style={{ 
            background: 'white', 
            borderRadius: 12, 
            padding: 40, 
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 24, color: '#374151' }}>
              Escaneá el código QR de las entradas para validarlas
            </div>
            <button
              onClick={() => setScanning(true)}
              style={{
                padding: '16px 32px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 18,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(34, 197, 94, 0.3)'
              }}
            >
              📷 Comenzar Escaneo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
