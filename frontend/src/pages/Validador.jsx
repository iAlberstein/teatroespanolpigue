import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { apiAuthFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import '../styles/qr-scanner.css';

export default function Validador() {
  const { user, token } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [selectedSubTickets, setSelectedSubTickets] = useState([]); // Array of "ticketId-subIndex" strings
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [error, setError] = useState('');
  const isProcessingRef = useRef(false);
  const scannerRef = useRef(null);
  const html5QrcodeScannerRef = useRef(null);

  // Manual search state
  const [manualSearch, setManualSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);

  // Admission report state
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Verificar permisos
  useEffect(() => {
    if (user && !['admin', 'boleteria'].includes(user.role)) {
      setError('No tenés permisos para acceder a esta sección');
    }
  }, [user]);

  // Solicitar permisos de cámara
  useEffect(() => {
    const requestCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Detener el stream inmediatamente, solo queríamos verificar permisos
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error('[VALIDADOR] Error requesting camera permission:', err);
        setError('No se pudo acceder a la cámara. Por favor, permití el acceso a la cámara en la configuración de tu navegador.');
      }
    };

    if (scanning && token) {
      requestCameraPermission();
    }
  }, [scanning, token]);

  // Inicializar escáner
  useEffect(() => {
    if (!scanning || !token) {
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

      // Detener escaneo inmediatamente
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.stop().then(() => {
          html5QrcodeScannerRef.current.clear();
          html5QrcodeScannerRef.current = null;
        }).catch(() => {
          html5QrcodeScannerRef.current = null;
        });
      }

      setScanning(false);
      handleScan(decodedText);
    };

    const onScanFailure = (error) => {
      // Silenciar errores de escaneo fallido (normal mientras se escanea)
    };

    const config = {
      fps: 15,
      qrbox: { width: 280, height: 280 },
      aspectRatio: 1.0,
      disableFlip: false
    };

    console.log('[VALIDADOR] Inicializando escáner...');
    
    html5QrcodeScannerRef.current = new Html5Qrcode('qr-reader', {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
    });

    console.log('[VALIDADOR] Iniciando cámara...');
    html5QrcodeScannerRef.current.start(
      { facingMode: "environment" }, // Usar cámara trasera
      config,
      onScanSuccess,
      onScanFailure
    ).then(() => {
      console.log('[VALIDADOR] ✅ Cámara iniciada correctamente');
    }).catch((err) => {
      console.error('[VALIDADOR] ❌ Error al iniciar cámara:', err);
      setError('Error al inicializar la cámara: ' + err);
      setScanning(false);
    });

    return () => {
      console.log('[VALIDADOR] Cleanup: deteniendo cámara...');
      if (html5QrcodeScannerRef.current) {
        html5QrcodeScannerRef.current.stop()
          .then(() => {
            console.log('[VALIDADOR] ✅ Cámara detenida');
            html5QrcodeScannerRef.current.clear();
            html5QrcodeScannerRef.current = null;
          })
          .catch((err) => {
            console.log('[VALIDADOR] Error al detener cámara:', err);
            html5QrcodeScannerRef.current = null;
          });
      }
    };
  }, [scanning, token]);

  const handleScan = async (decodedText) => {
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
      
      const response = await apiAuthFetch('/api/tickets/validate-tickets', {
        method: 'POST',
        body: JSON.stringify({ validations })
      }, token);

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

  // Manual search handler
  const handleManualSearch = async () => {
    if (!manualSearch || manualSearch.trim().length < 2) {
      setError('Ingresá al menos 2 caracteres para buscar');
      return;
    }
    setSearching(true);
    setError('');
    setSearchResults(null);
    setSelectedSale(null);
    try {
      const response = await apiAuthFetch('/api/tickets/lookup-customer', {
        method: 'POST',
        body: JSON.stringify({ query: manualSearch.trim() })
      }, token);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || data.message || 'Error al buscar');
        return;
      }
      setSearchResults(data.results || []);
      if (data.results && data.results.length === 0) {
        setError('No se encontraron entradas vigentes para este dato');
      }
    } catch (err) {
      console.error('[VALIDADOR] Error en búsqueda manual:', err);
      setError('Error de conexión al buscar');
    } finally {
      setSearching(false);
    }
  };

  // When a sale is selected from search results, load it into scannedData format
  const handleSelectSale = (sale) => {
    setSelectedSale(sale);
    setSearchResults(null);
    setScannedData({
      qr_type: 'manual_lookup',
      sale_info: {
        sale_id: sale.sale_id,
        session_id: sale.session_id,
        show_name: sale.show_name,
        session_date: sale.session_date,
        customer_name: sale.customer_name,
        refunded: sale.refunded,
        refund_locations: [],
        original_amount: null
      },
      tickets: sale.tickets
    });
    setSelectedSubTickets([]);
    setValidationResult(null);
    setManualSearch('');
  };

  // Admission report handler
  const handleAdmissionReport = async () => {
    setLoadingReport(true);
    setError('');
    try {
      const response = await apiAuthFetch('/api/tickets/admission-report', {}, token);
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || data.error || 'Error al obtener reporte');
        return;
      }
      setReportData(data);
      setShowReport(true);
    } catch (err) {
      console.error('[VALIDADOR] Error en reporte:', err);
      setError('Error de conexión al obtener reporte');
    } finally {
      setLoadingReport(false);
    }
  };

  // Reset to home screen
  const handleBackToHome = () => {
    setScannedData(null);
    setSelectedSubTickets([]);
    setValidationResult(null);
    setSearchResults(null);
    setSelectedSale(null);
    setManualSearch('');
    setError('');
    setShowReport(false);
    setReportData(null);
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

  const formatShortDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Check if a session is today
  const isToday = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
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
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '16px 12px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 20, textAlign: 'center', fontSize: 22 }}>Validador de Entradas</h1>

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
               Validación Exitosa
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
          <div style={{ background: 'white', borderRadius: 12, padding: '16px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            {/* Título del espectáculo */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, wordBreak: 'break-word' }}>
                {scannedData.sale_info.show_name}
              </h2>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {formatDate(scannedData.sale_info.session_date)} - {formatTime(scannedData.sale_info.session_date)}
              </div>
              {(scannedData.qr_type === 'container' || scannedData.qr_type === 'manual_lookup') && scannedData.sale_info.customer_name && (
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                  Cliente: {scannedData.sale_info.customer_name}
                </div>
              )}
              {scannedData.qr_type === 'manual_lookup' && (
                <div style={{ display: 'inline-block', marginTop: 6, padding: '2px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                  Búsqueda manual
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
                    const personLabel = ticket.type === 'pullman' ? `Pullman ${index + 1}` : `Persona ${index + 1}`;
                    
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
                                {isSelected ? '' : '○'}
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
                            {isSelected ? '' : '○'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botones de acción */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {validationResult && (
                <button
                  onClick={handleScanNext}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
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
                  Escanear siguiente
                </button>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleBackToHome}
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
                  Volver
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
          </div>
        )}

        {!scanning && !scannedData && !showReport && (
          <div>
            {/* QR Scan Button */}
            <div style={{ 
              background: 'white', 
              borderRadius: 12, 
              padding: '24px 16px', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              textAlign: 'center',
              marginBottom: 20
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#374151' }}>
                Escaneá el código QR de las entradas
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
                  boxShadow: '0 2px 4px rgba(34, 197, 94, 0.3)',
                  width: '100%',
                  maxWidth: 400
                }}
              >
                Escanear QR
              </button>
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
              <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 600 }}>o buscá manualmente</span>
              <div style={{ flex: 1, height: 1, background: '#d1d5db' }} />
            </div>

            {/* Manual Search */}
            <div style={{ 
              background: 'white', 
              borderRadius: 12, 
              padding: '20px 16px', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#374151' }}>
                Búsqueda manual de entradas
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                Si el cliente no tiene su QR, buscá por DNI, apellido, email o teléfono
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={manualSearch}
                  onChange={e => setManualSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualSearch()}
                  placeholder="DNI, apellido, email o teléfono..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '12px 16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: 8,
                    fontSize: 16,
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  onClick={handleManualSearch}
                  disabled={searching}
                  style={{
                    padding: '12px 20px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: searching ? 'not-allowed' : 'pointer',
                    opacity: searching ? 0.7 : 1,
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                >
                  {searching ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {/* Search Results */}
              {searchResults && searchResults.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                    {searchResults.length} compra{searchResults.length !== 1 ? 's' : ''} encontrada{searchResults.length !== 1 ? 's' : ''}:
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {searchResults.map((sale, idx) => {
                      const sessionIsToday = isToday(sale.session_date);
                      const allValidated = sale.validated_tickets >= sale.total_tickets;
                      return (
                        <div
                          key={`${sale.sale_id}-${idx}`}
                          onClick={() => !allValidated && handleSelectSale(sale)}
                          style={{
                            padding: 14,
                            border: sessionIsToday ? '2px solid #22c55e' : '2px solid #e5e7eb',
                            borderRadius: 10,
                            cursor: allValidated ? 'not-allowed' : 'pointer',
                            background: allValidated ? '#f3f4f6' : sessionIsToday ? '#f0fdf4' : 'white',
                            opacity: allValidated ? 0.6 : 1,
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
                                {sale.show_name}
                              </div>
                              <div style={{ fontSize: 13, color: '#6b7280' }}>
                                {formatShortDate(sale.session_date)} - {formatTime(sale.session_date)}
                              </div>
                              <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>
                                {sale.customer_name}
                                {sale.customer_dni && <span style={{ color: '#9ca3af' }}> · DNI {sale.customer_dni}</span>}
                              </div>
                              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                {sale.total_tickets} entrada{sale.total_tickets !== 1 ? 's' : ''}
                                {sale.validated_tickets > 0 && (
                                  <span style={{ color: '#dc2626' }}> · {sale.validated_tickets} validada{sale.validated_tickets !== 1 ? 's' : ''}</span>
                                )}
                                {sale.refunded && (
                                  <span style={{ color: '#dc2626', fontWeight: 600 }}> · REINTEGRADA</span>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              {sessionIsToday && (
                                <div style={{ display: 'inline-block', padding: '2px 8px', background: '#22c55e', color: 'white', borderRadius: 12, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
                                  HOY
                                </div>
                              )}
                              {allValidated ? (
                                <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                                  TODAS VALIDADAS
                                </div>
                              ) : (
                                <div style={{ fontSize: 22, color: '#3b82f6' }}>›</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Admission Report Button */}
            <div style={{ marginTop: 20 }}>
              <button
                onClick={handleAdmissionReport}
                disabled={loadingReport}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: loadingReport ? 'not-allowed' : 'pointer',
                  opacity: loadingReport ? 0.7 : 1
                }}
              >
                {loadingReport ? 'Cargando...' : 'Reporte de ingresos'}
              </button>
            </div>
          </div>
        )}

        {/* Admission Report View */}
        {showReport && reportData && (
          <div>
            <div style={{
              background: 'white',
              borderRadius: 12,
              padding: '20px 16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              marginBottom: 16
            }}>
              <h2 style={{ margin: '0 0 4px 0', fontSize: 18, textAlign: 'center', color: '#111827' }}>
                Reporte de ingresos
              </h2>
              <div style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 }}>
                Funciones de hoy — {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>

              {reportData.sessions.length === 0 ? (
                <div style={{
                  padding: 24,
                  textAlign: 'center',
                  color: '#6b7280',
                  background: '#f9fafb',
                  borderRadius: 8
                }}>
                  No hay funciones programadas para hoy
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {reportData.sessions.map((s) => {
                    const pct = s.total_sold > 0 ? Math.round((s.total_entered / s.total_sold) * 100) : 0;
                    return (
                      <div key={s.session_id} style={{
                        border: '2px solid #e5e7eb',
                        borderRadius: 12,
                        padding: 16,
                        background: '#fafbfc'
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                          {s.show_title}
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                          {new Date(s.starts_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })} hs
                        </div>

                        {/* Progress bar */}
                        <div style={{
                          width: '100%',
                          height: 10,
                          background: '#e5e7eb',
                          borderRadius: 5,
                          overflow: 'hidden',
                          marginBottom: 12
                        }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: pct === 100 ? '#22c55e' : '#3b82f6',
                            transition: 'width 0.3s ease',
                            borderRadius: 5
                          }} />
                        </div>

                        {/* Stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                          <div style={{
                            padding: 12,
                            background: '#eff6ff',
                            borderRadius: 8,
                            border: '1px solid #bfdbfe'
                          }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>
                              {s.total_sold}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                              Vendidas
                            </div>
                          </div>
                          <div style={{
                            padding: 12,
                            background: '#f0fdf4',
                            borderRadius: 8,
                            border: '1px solid #bbf7d0'
                          }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>
                              {s.total_entered}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                              Ingresaron
                            </div>
                          </div>
                          <div style={{
                            padding: 12,
                            background: '#fefce8',
                            borderRadius: 8,
                            border: '1px solid #fde68a'
                          }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#ca8a04' }}>
                              {s.total_pending}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>
                              Faltan
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                          {pct}% ingresado
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => { setShowReport(false); setReportData(null); }}
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
                Volver
              </button>
              <button
                onClick={handleAdmissionReport}
                disabled={loadingReport}
                style={{
                  flex: 1,
                  padding: '14px 20px',
                  background: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: loadingReport ? 'not-allowed' : 'pointer',
                  opacity: loadingReport ? 0.7 : 1
                }}
              >
                {loadingReport ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
