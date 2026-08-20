import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import theme from '../../styles/theme.js';
import { formatDateLong, formatTime, formatDateTimeCompact } from '../../lib/dateFormatter.js';
import Button from '../ui/Button.jsx';
import isologoBdx from '../../assets/images/NUEVO_ISOLOGO_bdx.png';

export default function BordereauxModal({ showId, sessionId, onClose }) {
  const { token, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  
  // Estados del formulario
  const [deductionsA, setDeductionsA] = useState([]);
  // Contrato: lista de items "default" (aplica a toda fecha sin override propio)
  const [contractItems, setContractItems] = useState([]);
  // Overrides por fecha: { [session_id]: [items] }. Solo relevante en la vista general
  // (consolidada) de shows con más de una función/fecha.
  const [sessionContractOverrides, setSessionContractOverrides] = useState({});
  const [deductionsB, setDeductionsB] = useState([]);
  const [authorName, setAuthorName] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    loadBordereaux();
  }, [showId, sessionId]);

  const loadBordereaux = async () => {
    try {
      setLoading(true);
      const url = sessionId
        ? `/api/bordereaux/show/${showId}/session/${sessionId}`
        : `/api/bordereaux/show/${showId}`;
      const res = await apiAuthFetch(url, {}, token);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const response = await res.json();
      
      if (!response || !response.deductions_a) {
        throw new Error('Invalid response from server');
      }
      
      setData(response);
      
      // Inicializar formulario con datos existentes
      setDeductionsA(response.deductions_a.items || []);
      // En la vista general viene en response.contract.items (default del show);
      // en la vista de sesión individual viene ya resuelto para esa fecha (override o default).
      setContractItems(response.contract?.items || []);
      setSessionContractOverrides(response.bordereaux?.session_contract_overrides || {});
      setDeductionsB(response.deductions_b?.items || []);
      setAuthorName(response.show?.author_name || '');
    } catch (error) {
      console.error('Error loading bordereaux:', error);
      alert('Error al cargar el bordereaux. Asegúrate de que la tabla "bordereaux" existe en la base de datos.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Productores no pueden editar, ni la vista de sesión individual
    if (user?.role === 'productor' || sessionId) {
      alert('No tenés permisos para editar el bordereaux');
      return;
    }
    
    try {
      setSaving(true);
      
      const res = await apiAuthFetch(`/api/bordereaux/${data.bordereaux.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          deductions_a: deductionsA,
          contract_items: contractItems,
          session_contract_overrides: sessionContractOverrides,
          deductions_b: deductionsB,
          author_name: authorName
        })
      }, token);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      // Recargar datos
      await loadBordereaux();
      setEditMode(false);
      alert('Cambios guardados correctamente');
    } catch (error) {
      console.error('Error saving bordereaux:', error);
      alert('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    // Productores ni vista de sesión individual pueden cerrar
    if (user?.role === 'productor' || sessionId) {
      alert('No tenés permisos para cerrar el bordereaux');
      return;
    }
    
    if (!confirm('¿Está seguro de cerrar el bordereaux? Esta acción es irreversible.')) {
      return;
    }
    
    try {
      setClosing(true);
      
      const res = await apiAuthFetch(`/api/bordereaux/${data.bordereaux.id}/close`, {
        method: 'POST'
      }, token);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      // Recargar datos
      await loadBordereaux();
      alert('Bordereaux cerrado exitosamente');
    } catch (error) {
      console.error('Error closing bordereaux:', error);
      alert('Error al cerrar el bordereaux');
    } finally {
      setClosing(false);
    }
  };

  const addDeductionA = () => {
    setDeductionsA([...deductionsA, { name: '', type: 'percentage', percentage: 0, fixedAmount: 0, description: 'del Bruto' }]);
  };

  const removeDeductionA = (index) => {
    setDeductionsA(deductionsA.filter((_, i) => i !== index));
  };

  const updateDeductionA = (index, field, value) => {
    const updated = [...deductionsA];
    updated[index][field] = value;
    setDeductionsA(updated);
  };

  const addContractItem = () => {
    setContractItems([...contractItems, { title: '', mode: 'percentage', percentage: 0, fixedAmount: 0, description: 'del Neto 2', settle: false }]);
  };

  const removeContractItem = (index) => {
    setContractItems(contractItems.filter((_, i) => i !== index));
  };

  const updateContractItem = (index, field, value) => {
    const updated = [...contractItems];
    updated[index] = { ...updated[index], [field]: value };
    setContractItems(updated);
  };

  // Overrides de contrato por fecha (solo vista general, shows con más de una función)
  const getSessionItems = (sessionId) => sessionContractOverrides[sessionId] || null;

  const toggleSessionOverride = (sessionId, enabled) => {
    const updated = { ...sessionContractOverrides };
    if (enabled) {
      // Al activar, arrancar con una copia de la distribución default como punto de partida
      updated[sessionId] = contractItems.map(it => ({ ...it }));
    } else {
      delete updated[sessionId];
    }
    setSessionContractOverrides(updated);
  };

  const addSessionContractItem = (sessionId) => {
    const current = sessionContractOverrides[sessionId] || [];
    setSessionContractOverrides({
      ...sessionContractOverrides,
      [sessionId]: [...current, { title: '', mode: 'percentage', percentage: 0, fixedAmount: 0, description: 'del Neto 2', settle: false }]
    });
  };

  const removeSessionContractItem = (sessionId, index) => {
    const current = sessionContractOverrides[sessionId] || [];
    setSessionContractOverrides({
      ...sessionContractOverrides,
      [sessionId]: current.filter((_, i) => i !== index)
    });
  };

  const updateSessionContractItem = (sessionId, index, field, value) => {
    const current = sessionContractOverrides[sessionId] || [];
    const updated = current.map((it, i) => i === index ? { ...it, [field]: value } : it);
    setSessionContractOverrides({ ...sessionContractOverrides, [sessionId]: updated });
  };

  const addDeductionB = () => {
    setDeductionsB([...deductionsB, { description: '', amount: 0 }]);
  };

  const removeDeductionB = (index) => {
    setDeductionsB(deductionsB.filter((_, i) => i !== index));
  };

  const updateDeductionB = (index, field, value) => {
    const updated = [...deductionsB];
    updated[index][field] = value;
    setDeductionsB(updated);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(value);
  };

  const handleDownloadPDF = async () => {
    try {
      setPrinting(true);
      
      // Call backend PDF endpoint (session-specific or consolidated)
      const pdfUrl = sessionId
        ? `/api/bordereaux/show/${showId}/session/${sessionId}/pdf`
        : `/api/bordereaux/show/${showId}/pdf`;
      const res = await apiAuthFetch(pdfUrl, { method: 'GET' }, token);
      
      if (!res.ok) {
        throw new Error('Error al generar PDF');
      }
      
      // Get PDF blob
      const blob = await res.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sessionId
        ? `bordereaux_sesion_${data?.show?.title || 'show'}.pdf`
        : `bordereaux_${data?.show?.title || 'show'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Error al descargar el PDF');
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{
          background: theme.colors.surface,
          padding: theme.spacing.xl,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.xl
        }}>
          Cargando bordereaux...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isClosed = data.bordereaux.status === 'cerrado';
  const showWatermark = !isClosed;

  return (
    <>
      {/* Estilos para impresión/PDF */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .bordereaux-content, .bordereaux-content * {
            visibility: visible;
          }
          .bordereaux-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .bordereaux-watermark {
            display: none !important;
          }
          @page {
            margin: 1cm;
            size: A4;
          }
        }
      `}</style>

      <div 
        className="no-print"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: theme.spacing.md,
          overflow: 'auto'
        }}
        onClick={onClose}
      >
        <div 
          className="bordereaux-content"
          style={{
            background: theme.colors.surface,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            maxWidth: '1000px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative'
          }}
          onClick={(e) => e.stopPropagation()}
        >
        {/* Watermark PROVISORIO */}
        {showWatermark && (
          <div 
            className="bordereaux-watermark"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-45deg)',
              fontSize: '80px',
              fontWeight: 'bold',
              color: 'rgba(255, 0, 0, 0.1)',
              pointerEvents: 'none',
              zIndex: 1,
              whiteSpace: 'nowrap'
            }}
          >
            BORDEREAUX PROVISORIO
          </div>
        )}

        {/* Contenido */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: theme.spacing.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, flex: 1 }}>
              {/* Logo */}
              <img 
                src={isologoBdx} 
                alt="Teatro Español"
                style={{
                  height: '80px',
                  width: 'auto',
                  objectFit: 'contain'
                }}
              />
              {/* Info */}
              <div>
                <h2 style={{ margin: 0, marginBottom: theme.spacing.sm }}>
                  BORDEREAUX{sessionId ? ' — SESIÓN' : ''}
                </h2>
                <div><strong>OBRA:</strong> {data.show.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
                  <strong>AUTOR:</strong> 
                  {editMode ? (
                    <input
                      type="text"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder="Nombre del autor"
                      style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, minWidth: 200 }}
                    />
                  ) : (
                    <span>{data.show.author_name || '-'}</span>
                  )}
                </div>
                {sessionId ? (
                  <div><strong>FECHA:</strong> {data.show.session_date
                    ? `${formatDateLong(data.show.session_date)} ${formatTime(data.show.session_date)}hs`
                    : 'Sin fecha'}</div>
                ) : data.show.session_dates && data.show.session_dates.length > 1 ? (
                  <div>
                    <strong>FUNCIONES:</strong>
                    {data.show.session_dates.map((sd, i) => (
                      <div key={i} style={{ marginLeft: 8, fontSize: theme.typography.small }}>
                        {formatDateLong(sd)} {formatTime(sd)}hs
                      </div>
                    ))}
                  </div>
                ) : (
                  <div><strong>FECHA:</strong> {data.show.session_date
                    ? formatDateLong(data.show.session_date)
                    : 'Sin fecha'}</div>
                )}
              </div>
            </div>
            <button 
              className="no-print"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                padding: '0 8px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Botones de acción */}
          <div className="no-print" style={{ marginBottom: theme.spacing.lg }}>
            {/* Banner de estado cerrado */}
            {isClosed && (
              <div style={{
                background: theme.colors.success,
                color: 'white',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.md,
                marginBottom: theme.spacing.sm,
                textAlign: 'center'
              }}>
                 Bordereaux cerrado el {formatDateTimeCompact(data.bordereaux.closed_at)}
              </div>
            )}

            {/* Vista por sesión individual: solo lectura + PDF */}
            {sessionId ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, width: '100%' }}>
                <div style={{
                  padding: theme.spacing.md,
                  background: '#eff6ff',
                  borderRadius: theme.borderRadius.md,
                  color: '#1e40af',
                  fontSize: theme.typography.small
                }}>
                  Vista de sesión individual — solo lectura. Para editar el bordereaux usá la vista consolidada del show.
                </div>
                <Button
                  variant="success"
                  size="sm"
                  onClick={handleDownloadPDF}
                  disabled={printing}
                >
                  {printing ? ' Generando...' : ' Descargar PDF (Sesión)'}
                </Button>
              </div>
            ) : user?.role === 'productor' ? (
              !isClosed && (
                <div style={{
                  padding: theme.spacing.md,
                  background: '#eff6ff',
                  borderRadius: theme.borderRadius.md,
                  color: '#1e40af',
                  fontSize: theme.typography.small,
                  width: '100%'
                }}>
                   Solo podés descargar el PDF una vez que el administrador cierre la venta.
                </div>
              )
            ) : (
              <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap', justifyContent: isClosed ? 'center' : 'flex-start' }}>
                <Button
                  variant={editMode ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => editMode ? handleSave() : setEditMode(true)}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : editMode ? 'Guardar Cambios' : 'Editar'}
                </Button>

                {editMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditMode(false);
                      loadBordereaux();
                    }}
                  >
                    Cancelar
                  </Button>
                )}

                {!editMode && (
                  <>
                    <Button
                      variant="success"
                      size={isClosed ? 'md' : 'sm'}
                      onClick={handleDownloadPDF}
                      disabled={printing}
                    >
                      {printing ? ' Generando...' : ' Descargar PDF'}
                    </Button>

                    {!isClosed && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleClose}
                        disabled={closing}
                      >
                        {closing ? 'Cerrando...' : 'Cerrar Venta'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Consolidado por Sector */}
          {Array.isArray(data.sales.sectorTotals) && data.sales.sectorTotals.length > 0 && (
            <div style={{ marginBottom: theme.spacing.lg }}>
              <h3>CONSOLIDADO POR SECTOR</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>SECTOR</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>CANTIDAD</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>VALOR</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.sectorTotals.map((sector, idx) => (
                    <>
                      {/* Fila principal del sector */}
                      <tr 
                        key={idx} 
                        style={{ 
                          borderBottom: sector.items?.length > 0 ? 'none' : `1px solid ${theme.colors.border}`,
                          background: theme.colors.surfaceAlt,
                          fontWeight: 600
                        }}
                      >
                        <td style={{ padding: theme.spacing.xs }}>
                          {sector.location}
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                          {/* Para palcos: cantidad de palcos (calculado) con localidades entre paréntesis */}
                          {sector.location?.toLowerCase().includes('palco')
                            ? (() => {
                                const localidades = sector.people || sector.quantity;
                                const isBajo = sector.location.toLowerCase().includes('bajo');
                                const palcos = isBajo ? Math.round(localidades / 4) : Math.round(localidades / 2);
                                return `${palcos} (${localidades} localidades)`;
                              })()
                            : (sector.people || sector.quantity)}
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                          {/* Valor vacío para fila de total */}
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                          {formatCurrency(sector.total)}
                        </td>
                      </tr>
                      
                      {/* Detalle de items con precios */}
                      {sector.items?.length > 0 && sector.items.map((item, itemIdx) => (
                        <tr 
                          key={`${idx}-item-${itemIdx}`}
                          style={{ 
                            borderBottom: itemIdx === sector.items.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                            backgroundColor: '#f8fafc'
                          }}
                        >
                          <td style={{ padding: `${theme.spacing.xs}px ${theme.spacing.xs}px ${theme.spacing.xs}px 24px` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {item.color && (
                                <div
                                  style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '3px',
                                    backgroundColor: item.color,
                                    border: '1px solid #e5e7eb'
                                  }}
                                />
                              )}
                              <span style={{ 
                                fontSize: '0.9em', 
                                color: item.specialPricing?.isSpecial ? '#0369a1' : '#64748b',
                                fontWeight: item.specialPricing?.isSpecial ? 500 : 400
                              }}>
                                {(() => {
                                  const parts = [];
                                  if (item.specialPricing?.isSpecial && item.specialPricing?.label) parts.push(item.specialPricing.label);
                                  if (item.discountCode) parts.push(`(${item.discountCode})`);
                                  return parts.join(' ') || sector.location;
                                })()}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: theme.spacing.xs, textAlign: 'right', fontSize: '0.9em' }}>
                            {/* Para palcos: cantidad de palcos (calculado) con localidades entre paréntesis */}
                            {sector.location?.toLowerCase().includes('palco')
                              ? (() => {
                                  const localidades = item.people || item.quantity;
                                  const isBajo = sector.location.toLowerCase().includes('bajo');
                                  const palcos = isBajo ? Math.round(localidades / 4) : Math.round(localidades / 2);
                                  return `${palcos} (${localidades} localidades)`;
                                })()
                              : (item.people || item.quantity)}
                          </td>
                          <td style={{ padding: theme.spacing.xs, textAlign: 'right', fontSize: '0.9em', fontWeight: 500 }}>
                            {formatCurrency(item.price)}
                          </td>
                          <td style={{ padding: theme.spacing.xs, textAlign: 'right', fontSize: '0.9em' }}>
                            {formatCurrency(item.total)}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                  <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold', background: theme.colors.surfaceAlt }}>
                    <td style={{ padding: theme.spacing.xs }}>TOTAL BRUTO</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{data.sales.totals.people || data.sales.totals.tickets}</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}></td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(data.sales.totals.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Deducciones A */}
          <div style={{ marginBottom: theme.spacing.lg }}>
            <h3>DEDUCCIONES (A)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>CONCEPTO</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'center' }}>PORCENTAJE</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>DESCRIPCIÓN</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>IMPORTE</th>
                  {editMode && <th style={{ padding: theme.spacing.xs }}>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {editMode ? (
                  <>
                    {deductionsA.map((ded, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: theme.spacing.xs }}>
                          <input
                            type="text"
                            value={ded.name}
                            onChange={(e) => updateDeductionA(idx, 'name', e.target.value)}
                            style={{ width: '100%', padding: '4px' }}
                          />
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                            <select
                              value={ded.type || 'percentage'}
                              onChange={(e) => updateDeductionA(idx, 'type', e.target.value)}
                              style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                            >
                              <option value="percentage">%</option>
                              <option value="fixed">Fijo</option>
                            </select>
                            {(ded.type || 'percentage') === 'percentage' && (
                              <input
                                type="number"
                                value={ded.percentage}
                                onChange={(e) => updateDeductionA(idx, 'percentage', parseFloat(e.target.value) || 0)}
                                style={{ width: '60px', padding: '4px', textAlign: 'center', MozAppearance: 'textfield', appearance: 'textfield' }}
                              />
                            )}
                          </div>
                        </td>
                        <td style={{ padding: theme.spacing.xs }}>
                          <input
                            type="text"
                            value={ded.description}
                            onChange={(e) => updateDeductionA(idx, 'description', e.target.value)}
                            style={{ width: '100%', padding: '4px' }}
                          />
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                          {(ded.type || 'percentage') === 'fixed' ? (
                            <input
                              type="number"
                              value={ded.fixedAmount || 0}
                              onChange={(e) => updateDeductionA(idx, 'fixedAmount', parseFloat(e.target.value) || 0)}
                              style={{ width: '100px', padding: '4px', textAlign: 'right', MozAppearance: 'textfield', appearance: 'textfield' }}
                            />
                          ) : (
                            formatCurrency((parseFloat(data.recaudacion.bruto) * (ded.percentage / 100)))
                          )}
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                          <button
                            onClick={() => removeDeductionA(idx)}
                            style={{ color: theme.colors.danger, border: 'none', background: 'none', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan="5" style={{ padding: theme.spacing.xs }}>
                        <Button variant="secondary" size="sm" onClick={addDeductionA}>
                          + Agregar deducción
                        </Button>
                      </td>
                    </tr>
                  </>
                ) : (
                  data.deductions_a.items.map((ded, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: theme.spacing.xs }}>{ded.name}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                        {(ded.type || 'percentage') === 'fixed' ? 'Fijo' : `${Math.round(ded.percentage)}%`}
                      </td>
                      <td style={{ padding: theme.spacing.xs }}>{ded.description}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(ded.amount)}</td>
                    </tr>
                  ))
                )}
                <tr style={{ borderTop: `1px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                  <td colSpan="3" style={{ padding: theme.spacing.xs }}>TOTAL DEDUCCIONES (A)</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                    {(() => {
                      const bruto = parseFloat(data.recaudacion.bruto) || 0;
                      const currentDedA = editMode ? deductionsA : (data.deductions_a?.items || []);
                      const totalDedA = currentDedA.reduce((sum, ded) => {
                        if (ded.type === 'fixed') return sum + (parseFloat(ded.fixedAmount) || 0);
                        return sum + (bruto * ((parseFloat(ded.percentage) || 0) / 100));
                      }, 0);
                      return formatCurrency(totalDedA);
                    })()}
                  </td>
                  {editMode && <td></td>}
                </tr>
                <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                  <td colSpan="3" style={{ padding: theme.spacing.xs }}>NETO 1</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                    {(() => {
                      const bruto = parseFloat(data.recaudacion.bruto) || 0;
                      const currentDedA = editMode ? deductionsA : (data.deductions_a?.items || []);
                      const totalDedA = currentDedA.reduce((sum, ded) => {
                        if (ded.type === 'fixed') return sum + (parseFloat(ded.fixedAmount) || 0);
                        return sum + (bruto * ((parseFloat(ded.percentage) || 0) / 100));
                      }, 0);
                      return formatCurrency(bruto - totalDedA);
                    })()}
                  </td>
                  {editMode && <td></td>}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Servicios Asociados */}
          {Array.isArray(data.sales.onlineBordereauxServices) && (data.sales.onlineBordereauxServices.length > 0 || data.sales.boleteriaBordereauxServices?.length > 0) && (() => {
            // Consolidate online + boleteria rows by service name
            const allSvcs = [
              ...(data.sales.onlineBordereauxServices || []),
              ...(data.sales.boleteriaBordereauxServices || [])
            ];
            const consolidated = Object.values(
              allSvcs.reduce((acc, svc) => {
                if (!acc[svc.name]) {
                  acc[svc.name] = { name: svc.name, price: svc.price, quantity: 0, total: 0 };
                }
                acc[svc.name].quantity += svc.quantity;
                acc[svc.name].total += svc.total;
                return acc;
              }, {})
            );
            const totalQty = consolidated.reduce((sum, s) => sum + s.quantity, 0);
            const totalAmt = consolidated.reduce((sum, s) => sum + s.total, 0);
            return (
              <div style={{ marginBottom: theme.spacing.lg }}>
                <h3>SERVICIOS ASOCIADOS</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>SERVICIO</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>VALOR</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>CANTIDAD</th>
                      <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidated.map((svc, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: theme.spacing.xs }}>{svc.name}</td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.price)}</td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{svc.quantity}</td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.total)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                      <td style={{ padding: theme.spacing.xs }} colSpan="2">TOTAL SERVICIOS ASOCIADOS</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{totalQty}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(totalAmt)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* NETO 2 */}
          {data.neto2 && (
            <div style={{ marginBottom: theme.spacing.lg, padding: theme.spacing.md, background: '#f3f4f6', borderRadius: theme.borderRadius.md }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: theme.typography.h3, fontWeight: 'bold' }}>
                <span>NETO 2 (NETO 1 + Servicios):</span>
                <span>{formatCurrency(data.neto2)}</span>
              </div>
            </div>
          )}

          {/* Contrato */}
          {(() => {
            const hasMultipleSessions = !sessionId && Array.isArray(data.show?.session_dates) && data.show.session_dates.length > 1;

            const calcItemAmount = (item, neto2) => item.mode === 'fixed'
              ? (parseFloat(item.fixedAmount) || 0)
              : (parseFloat(neto2) || 0) * ((parseFloat(item.percentage) || 0) / 100);

            // Tabla editable/de solo lectura para una lista de items de contrato.
            const ContractItemsTable = ({ items, neto2, editable, onUpdate, onRemove, onAdd, readonlyAmounts }) => (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>PARTE</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'center' }}>TIPO</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>DESCRIPCIÓN</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'center' }}>LIQUIDAR</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>IMPORTE</th>
                    {editable && <th style={{ padding: theme.spacing.xs }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: theme.spacing.xs }}>
                        {editable ? (
                          <input
                            type="text"
                            value={item.title || ''}
                            placeholder="Ej: Teatro, Autor..."
                            onChange={(e) => onUpdate(idx, 'title', e.target.value)}
                            style={{ width: '100%', padding: '4px' }}
                          />
                        ) : (item.title || '-')}
                      </td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                        {editable ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                            <select
                              value={item.mode || 'percentage'}
                              onChange={(e) => onUpdate(idx, 'mode', e.target.value)}
                              style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                            >
                              <option value="percentage">%</option>
                              <option value="fixed">Fijo</option>
                            </select>
                            {(item.mode || 'percentage') === 'percentage' ? (
                              <input
                                type="number"
                                value={item.percentage}
                                onChange={(e) => onUpdate(idx, 'percentage', parseFloat(e.target.value) || 0)}
                                style={{ width: '55px', padding: '4px', textAlign: 'center' }}
                              />
                            ) : (
                              <input
                                type="number"
                                value={item.fixedAmount || 0}
                                onChange={(e) => onUpdate(idx, 'fixedAmount', parseFloat(e.target.value) || 0)}
                                style={{ width: '90px', padding: '4px', textAlign: 'right' }}
                              />
                            )}
                          </div>
                        ) : (
                          item.mode === 'fixed' ? 'Fijo' : `${Math.round(parseFloat(item.percentage) || 0)}%`
                        )}
                      </td>
                      <td style={{ padding: theme.spacing.xs }}>
                        {editable ? (
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => onUpdate(idx, 'description', e.target.value)}
                            style={{ width: '100%', padding: '4px' }}
                          />
                        ) : (item.description || '-')}
                      </td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                        {editable ? (
                          <input
                            type="checkbox"
                            checked={!!item.settle}
                            onChange={(e) => onUpdate(idx, 'settle', e.target.checked)}
                            title="Marca la/s parte/s cuyo importe se liquida en efectivo/transferencia"
                          />
                        ) : (item.settle ? '✓' : '')}
                      </td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                        {readonlyAmounts ? formatCurrency(parseFloat(item.amount) || 0) : formatCurrency(calcItemAmount(item, neto2))}
                      </td>
                      {editable && (
                        <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                          <button onClick={() => onRemove(idx)} style={{ color: theme.colors.danger, border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {editable && (
                    <tr>
                      <td colSpan="6" style={{ padding: theme.spacing.xs }}>
                        <Button variant="secondary" size="sm" onClick={onAdd}>+ Agregar parte</Button>
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                    <td colSpan="4" style={{ padding: theme.spacing.xs }}>TOTAL</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                      {formatCurrency(readonlyAmounts
                        ? items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0)
                        : items.reduce((sum, it) => sum + calcItemAmount(it, neto2), 0))}
                    </td>
                    {editable && <td></td>}
                  </tr>
                </tbody>
              </table>
            );

            if (sessionId) {
              // Vista de sesión individual: solo lectura, contrato ya resuelto para esta fecha.
              return (
                <div style={{ marginBottom: theme.spacing.lg }}>
                  <h3>
                    CONTRATO
                    {data.contract?.is_override && (
                      <span style={{ marginLeft: theme.spacing.sm, fontSize: theme.typography.small, fontWeight: 'normal', color: theme.colors.primary }}>
                        (distribución propia para esta fecha)
                      </span>
                    )}
                  </h3>
                  <ContractItemsTable items={data.contract?.items || []} readonlyAmounts editable={false} />
                </div>
              );
            }

            if (!hasMultipleSessions) {
              // Show de una sola función: un único editor, igual que antes pero con lista abierta de items.
              return (
                <div style={{ marginBottom: theme.spacing.lg }}>
                  <h3>CONTRATO</h3>
                  <ContractItemsTable
                    items={editMode ? contractItems : (data.contract?.items || [])}
                    neto2={data.neto2}
                    editable={editMode}
                    onUpdate={(idx, field, value) => updateContractItem(idx, field, value)}
                    onRemove={removeContractItem}
                    onAdd={addContractItem}
                  />
                </div>
              );
            }

            // Show con múltiples funciones (pack): distribución default + override por fecha.
            const bySession = data.contract?.by_session || [];
            return (
              <div style={{ marginBottom: theme.spacing.lg }}>
                <h3>CONTRATO</h3>
                <div style={{ marginBottom: theme.spacing.sm, fontSize: theme.typography.small, color: theme.colors.textSecondary }}>
                  Distribución por defecto (se aplica a toda fecha sin distribución propia):
                </div>
                <ContractItemsTable
                  items={editMode ? contractItems : (data.contract?.items || [])}
                  neto2={data.neto2}
                  editable={editMode}
                  onUpdate={(idx, field, value) => updateContractItem(idx, field, value)}
                  onRemove={removeContractItem}
                  onAdd={addContractItem}
                />

                <div style={{ marginTop: theme.spacing.md }}>
                  {(editMode
                    ? [...bySession].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
                    : bySession
                  ).map((slot) => {
                    const hasOverride = editMode ? !!sessionContractOverrides[slot.session_id] : slot.is_override;
                    const overrideItems = sessionContractOverrides[slot.session_id] || [];
                    return (
                      <div key={slot.session_id} style={{ marginTop: theme.spacing.md, padding: theme.spacing.sm, border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius.md }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xs }}>
                          <strong style={{ fontSize: theme.typography.small }}>
                            {formatDateLong(slot.starts_at)} {formatTime(slot.starts_at)}{slot.function_name ? ` — ${slot.function_name}` : ''}
                          </strong>
                          {editMode && (
                            <label style={{ fontSize: theme.typography.small, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                type="checkbox"
                                checked={hasOverride}
                                onChange={(e) => toggleSessionOverride(slot.session_id, e.target.checked)}
                              />
                              Usar distribución propia para esta fecha
                            </label>
                          )}
                        </div>
                        {editMode ? (
                          hasOverride ? (
                            <ContractItemsTable
                              items={overrideItems}
                              neto2={slot.neto2}
                              editable
                              onUpdate={(idx, field, value) => updateSessionContractItem(slot.session_id, idx, field, value)}
                              onRemove={(idx) => removeSessionContractItem(slot.session_id, idx)}
                              onAdd={() => addSessionContractItem(slot.session_id)}
                            />
                          ) : (
                            <div style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, fontStyle: 'italic' }}>
                              Usa la distribución por defecto.
                            </div>
                          )
                        ) : (
                          <ContractItemsTable items={slot.items || []} readonlyAmounts editable={false} />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: theme.spacing.md, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', fontSize: theme.typography.h4, padding: theme.spacing.sm, background: '#f3f4f6', borderRadius: theme.borderRadius.md }}>
                  <span>TOTAL CONTRATO (TODAS LAS FECHAS):</span>
                  <span>{formatCurrency(data.contract?.total || 0)}</span>
                </div>
                {editMode && (
                  <div style={{ marginTop: theme.spacing.xs, fontSize: theme.typography.small, color: theme.colors.textSecondary }}>
                    Este total se recalcula al guardar los cambios.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Deducciones B */}
          <div style={{ marginBottom: theme.spacing.lg }}>
            <h3>DEDUCCIONES (B)</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>DESCRIPCIÓN</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>IMPORTE</th>
                  {editMode && <th style={{ padding: theme.spacing.xs }}>Acción</th>}
                </tr>
              </thead>
              <tbody>
                {editMode ? (
                  <>
                    {deductionsB.map((ded, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: theme.spacing.xs }}>
                          <input
                            type="text"
                            value={ded.description}
                            onChange={(e) => updateDeductionB(idx, 'description', e.target.value)}
                            style={{ width: '100%', padding: '4px' }}
                          />
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                          <input
                            type="number"
                            value={ded.amount}
                            onChange={(e) => updateDeductionB(idx, 'amount', parseFloat(e.target.value) || 0)}
                            style={{ width: '120px', padding: '4px', textAlign: 'right', MozAppearance: 'textfield', appearance: 'textfield' }}
                          />
                        </td>
                        <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                          <button
                            onClick={() => removeDeductionB(idx)}
                            style={{ color: theme.colors.danger, border: 'none', background: 'none', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan="3" style={{ padding: theme.spacing.xs }}>
                        <Button variant="secondary" size="sm" onClick={addDeductionB}>
                          + Agregar item
                        </Button>
                      </td>
                    </tr>
                  </>
                ) : (
                  data.deductions_b.items.map((ded, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: theme.spacing.xs }}>{ded.description}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(ded.amount)}</td>
                    </tr>
                  ))
                )}
                <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                  <td style={{ padding: theme.spacing.xs }}>TOTAL</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(data.deductions_b.total)}</td>
                  {editMode && <td></td>}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Liquidación Final */}
          <div style={{ padding: theme.spacing.md, background: theme.colors.primaryLight, borderRadius: theme.borderRadius.md }}>
            {(() => {
              const hasMultipleSessions = !sessionId && Array.isArray(data.show?.session_dates) && data.show.session_dates.length > 1;

              // Para shows con múltiples funciones, el desglose por fecha (con overrides propios
              // por fecha) solo se recalcula en el servidor; se muestra el último valor guardado.
              if (hasMultipleSessions) {
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: theme.typography.h4, fontWeight: 'bold' }}>
                    <span>TOTAL A LIQUIDAR (partes marcadas "Liquidar"):</span>
                    <span>{formatCurrency(data.liquidacion?.user_total || 0)}</span>
                  </div>
                );
              }

              // Calcular valores en tiempo real considerando deducciones/contrato editados
              const bruto = parseFloat(data.recaudacion.bruto) || 0;

              const currentDeductionsA = editMode ? deductionsA : (data.deductions_a?.items || []);
              const totalDeductionsA = currentDeductionsA.reduce((sum, ded) => {
                if (ded.type === 'fixed') return sum + (parseFloat(ded.fixedAmount) || 0);
                return sum + (bruto * ((parseFloat(ded.percentage) || 0) / 100));
              }, 0);

              const neto1 = bruto - totalDeductionsA;
              const neto2 = parseFloat(data.neto2) || neto1;

              const currentDeductionsB = editMode ? deductionsB : (data.deductions_b?.items || []);
              const totalDeductionsB = currentDeductionsB.reduce((sum, ded) => sum + (parseFloat(ded.amount) || 0), 0);

              // Suma de los items de contrato marcados "Liquidar" (settle), sobre el NETO 2
              const currentContractItems = editMode ? contractItems : (data.contract?.items || []);
              const settleTotal = currentContractItems.reduce((sum, item) => {
                if (!item.settle) return sum;
                const amount = item.mode === 'fixed' ? (parseFloat(item.fixedAmount) || 0) : neto2 * ((parseFloat(item.percentage) || 0) / 100);
                return sum + amount;
              }, 0);

              const userTotal = Math.max(0, settleTotal - totalDeductionsB);

              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: theme.typography.h4, fontWeight: 'bold' }}>
                  <span>TOTAL A LIQUIDAR (partes marcadas "Liquidar"):</span>
                  <span>{formatCurrency(userTotal)}</span>
                </div>
              );
            })()}
          </div>

          {/* Firmas */}
          {isClosed && (
            <div style={{ marginTop: theme.spacing.xl, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.xl }}>
              <div>
                <div style={{ borderBottom: `1px solid ${theme.colors.border}`, height: '60px', marginBottom: theme.spacing.xs }}></div>
                <div style={{ textAlign: 'center' }}>
                  <strong>Firma USUARIO</strong>
                  <div style={{ marginTop: theme.spacing.xs }}>Aclaración: _________________</div>
                </div>
              </div>
              <div>
                <div style={{ borderBottom: `1px solid ${theme.colors.border}`, height: '60px', marginBottom: theme.spacing.xs }}></div>
                <div style={{ textAlign: 'center' }}>
                  <strong>Firma TEATRO</strong>
                  <div style={{ marginTop: theme.spacing.xs }}>Aclaración: _________________</div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
