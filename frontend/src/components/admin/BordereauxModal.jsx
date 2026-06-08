import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import theme from '../../styles/theme.js';
import Button from '../ui/Button.jsx';
import isologoBdx from '../../assets/images/NUEVO_ISOLOGO_bdx.png';

export default function BordereauxModal({ showId, onClose }) {
  const { token, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  
  // Estados del formulario
  const [deductionsA, setDeductionsA] = useState([]);
  const [theaterPercentage, setTheaterPercentage] = useState(20);
  const [userPercentage, setUserPercentage] = useState(80);
  const [deductionsB, setDeductionsB] = useState([]);
  const [authorName, setAuthorName] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    loadBordereaux();
  }, [showId]);

  const loadBordereaux = async () => {
    try {
      setLoading(true);
      const res = await apiAuthFetch(`/api/bordereaux/show/${showId}`, {}, token);
      
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
      setTheaterPercentage(response.contract?.theater_percentage || 20);
      setUserPercentage(response.contract?.user_percentage || 80);
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
    // Productores no pueden editar
    if (user?.role === 'productor') {
      alert('No tenés permisos para editar el bordereaux');
      return;
    }
    
    try {
      setSaving(true);
      
      const res = await apiAuthFetch(`/api/bordereaux/${data.bordereaux.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          deductions_a: deductionsA,
          contract_theater_percentage: theaterPercentage,
          contract_user_percentage: userPercentage,
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
    // Productores no pueden cerrar ventas
    if (user?.role === 'productor') {
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
      
      // Call backend PDF endpoint
      const res = await apiAuthFetch(`/api/bordereaux/show/${showId}/pdf`, { method: 'GET' }, token);
      
      if (!res.ok) {
        throw new Error('Error al generar PDF');
      }
      
      // Get PDF blob
      const blob = await res.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bordereaux_${data?.show?.title || 'show'}.pdf`;
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
                <h2 style={{ margin: 0, marginBottom: theme.spacing.sm }}>BORDEREAUX</h2>
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
                <div><strong>FECHA:</strong> {data.show.session_date 
                  ? new Date(data.show.session_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
                  : 'Sin fecha'}</div>
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
                 Bordereaux cerrado el {new Date(data.bordereaux.closed_at).toLocaleString('es-AR')}
              </div>
            )}

            {/* Productores solo pueden ver, no editar ni cerrar */}
            {user?.role === 'productor' ? (
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
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>VALOR</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>PERSONAS</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sales.sectorTotals.map((sector, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${theme.colors.border}` }}>
                      <td style={{ padding: theme.spacing.xs }}>
                        {sector.location}
                        {sector.discountCode && <span style={{ fontSize: '0.85em', color: '#666', marginLeft: 4 }}>({sector.discountCode})</span>}
                      </td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(sector.price)}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{sector.people || sector.quantity}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(sector.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold', background: theme.colors.surfaceAlt }}>
                    <td style={{ padding: theme.spacing.xs }} colSpan="2">TOTAL</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{data.sales.totals.people || data.sales.totals.tickets}</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(data.sales.totals.amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Tabla de entradas */}
          <div style={{ marginBottom: theme.spacing.lg }}>
            <h3>DETALLE DE VENTAS</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>UBICACIÓN</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>VALOR</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>CANTIDAD</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* Venta Online */}
                <tr>
                  <td colSpan="4" style={{ padding: theme.spacing.xs, fontWeight: 'bold', background: theme.colors.surfaceAlt }}>
                    VENTA ONLINE
                  </td>
                </tr>
                {data.sales.online.map((sale, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: theme.spacing.xs }}>{sale.location}</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(sale.price)}</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                      {sale.people && sale.people !== sale.quantity
                        ? <>{sale.quantity} <span style={{ fontSize: '0.85em', color: '#666' }}>({sale.people} entradas)</span></>
                        : sale.quantity}
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(sale.total)}</td>
                  </tr>
                ))}
                
                {/* Subtotal Online */}
                <tr style={{ borderTop: `1px solid ${theme.colors.border}`, fontWeight: 'bold', background: theme.colors.successLight }}>
                  <td style={{ padding: theme.spacing.xs }} colSpan="2">SUBTOTAL ONLINE</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{data.sales.totals.onlinePeople || data.sales.totals.onlineTickets}</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(data.sales.totals.onlineAmount)}</td>
                </tr>

                {/* NO incluir servicios en detalle de ventas (se muestran debajo de deducciones A) */}

                {/* Boletería */}
                <tr>
                  <td colSpan="4" style={{ padding: theme.spacing.xs, fontWeight: 'bold', background: theme.colors.surfaceAlt }}>
                    BOLETERÍA
                  </td>
                </tr>
                {data.sales.boleteria.map((sale, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: theme.spacing.xs }}>{sale.location}</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(sale.price)}</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                      {sale.people && sale.people !== sale.quantity
                        ? <>{sale.quantity} <span style={{ fontSize: '0.85em', color: '#666' }}>({sale.people} entradas)</span></>
                        : sale.quantity}
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(sale.total)}</td>
                  </tr>
                ))}
                
                {/* Subtotal Boletería */}
                <tr style={{ borderTop: `1px solid ${theme.colors.border}`, fontWeight: 'bold', background: theme.colors.infoLight }}>
                  <td style={{ padding: theme.spacing.xs }} colSpan="2">SUBTOTAL BOLETERÍA</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{data.sales.totals.boleteriaPeople || data.sales.totals.boleteriaTickets}</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(data.sales.totals.boleteriaAmount)}</td>
                </tr>

                {/* NO incluir servicios en detalle de ventas (se muestran debajo de deducciones A) */}

                {/* Totales */}
                <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                  <td style={{ padding: theme.spacing.xs }}>TOTALES</td>
                  <td style={{ padding: theme.spacing.xs }}></td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{data.sales.totals.people || data.sales.totals.tickets}</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(data.sales.totals.amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Recaudación */}
          <div style={{ marginBottom: theme.spacing.lg, padding: theme.spacing.md, background: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.xs }}>
              <span>RECAUDADO EN EFECTIVO (BOLETERÍA):</span>
              <strong>{formatCurrency(data.recaudacion.efectivo)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.xs }}>
              <span>RECAUDADO EN VENTA ONLINE (plataforma web):</span>
              <strong>{formatCurrency(data.recaudacion.online)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${theme.colors.border}`, paddingTop: theme.spacing.xs, fontWeight: 'bold', fontSize: theme.typography.body }}>
              <span>TOTAL BRUTO:</span>
              <span>{formatCurrency(data.recaudacion.bruto)}</span>
            </div>
          </div>

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

          {/* Servicios */}
          {data.services && (data.services.online?.length > 0 || data.services.boleteria?.length > 0) && (
            <div style={{ marginBottom: theme.spacing.lg }}>
              <h3>SERVICIOS</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>SERVICIO</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'center' }}>CANTIDAD</th>
                    <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.online.map((svc, idx) => (
                    <tr key={`online-${idx}`}>
                      <td style={{ padding: theme.spacing.xs }}>{svc.name} (Online)</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>{svc.quantity}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.total)}</td>
                    </tr>
                  ))}
                  {data.services.boleteria.map((svc, idx) => (
                    <tr key={`bole-${idx}`}>
                      <td style={{ padding: theme.spacing.xs }}>{svc.name} (Boletería)</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>{svc.quantity}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                    <td style={{ padding: theme.spacing.xs }}>TOTAL SERVICIOS</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                      {(data.services.online?.reduce((sum, s) => sum + s.quantity, 0) || 0) +
                       (data.services.boleteria?.reduce((sum, s) => sum + s.quantity, 0) || 0)}
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                      {formatCurrency(data.services.total || 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Servicios a Bordereaux */}
          {Array.isArray(data.sales.onlineBordereauxServices) && data.sales.onlineBordereauxServices.length > 0 && (
            <div style={{ marginBottom: theme.spacing.lg }}>
              <h3>SERVICIOS A BORDEREAUX</h3>
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
                  {data.sales.onlineBordereauxServices.map((svc, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: theme.spacing.xs }}>{svc.name}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.price)}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{svc.quantity}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.total)}</td>
                    </tr>
                  ))}
                  {data.sales.boleteriaBordereauxServices.map((svc, idx) => (
                    <tr key={`bole-${idx}`}>
                      <td style={{ padding: theme.spacing.xs }}>{svc.name}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.price)}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{svc.quantity}</td>
                      <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>{formatCurrency(svc.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${theme.colors.border}`, fontWeight: 'bold' }}>
                    <td style={{ padding: theme.spacing.xs }} colSpan="2">TOTAL SERVICIOS BORDEREAUX</td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                      {data.sales.onlineBordereauxServices.reduce((sum, s) => sum + s.quantity, 0) +
                       data.sales.boleteriaBordereauxServices.reduce((sum, s) => sum + s.quantity, 0)}
                    </td>
                    <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                      {formatCurrency(
                        data.sales.onlineBordereauxServices.reduce((sum, s) => sum + s.total, 0) +
                        data.sales.boleteriaBordereauxServices.reduce((sum, s) => sum + s.total, 0)
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

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
          <div style={{ marginBottom: theme.spacing.lg }}>
            <h3>CONTRATO</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: theme.typography.small }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>PARTE</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'center' }}>PORCENTAJE</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'left' }}>DESCRIPCIÓN</th>
                  <th style={{ padding: theme.spacing.xs, textAlign: 'right' }}>IMPORTE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: theme.spacing.xs }}>TEATRO</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                    {editMode ? (
                      <>
                        <input
                          type="number"
                          value={Math.round(theaterPercentage)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setTheaterPercentage(val);
                            setUserPercentage(100 - val);
                          }}
                          style={{ width: '60px', padding: '4px', textAlign: 'center', MozAppearance: 'textfield', appearance: 'textfield' }}
                        />%
                      </>
                    ) : (
                      `${Math.round(data.contract.theater_percentage)}%`
                    )}
                  </td>
                  <td style={{ padding: theme.spacing.xs }}>del NETO 2</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                    {(() => {
                      const neto2 = parseFloat(data.neto2) || 0;
                      return formatCurrency(neto2 * (theaterPercentage / 100));
                    })()}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: theme.spacing.xs }}>USUARIO</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'center' }}>
                    {editMode ? (
                      <>
                        <input
                          type="number"
                          value={Math.round(userPercentage)}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            setUserPercentage(val);
                            setTheaterPercentage(100 - val);
                          }}
                          style={{ width: '60px', padding: '4px', textAlign: 'center', MozAppearance: 'textfield', appearance: 'textfield' }}
                        />%
                      </>
                    ) : (
                      `${Math.round(data.contract.user_percentage)}%`
                    )}
                  </td>
                  <td style={{ padding: theme.spacing.xs }}>del NETO 2</td>
                  <td style={{ padding: theme.spacing.xs, textAlign: 'right' }}>
                    {(() => {
                      const neto2 = parseFloat(data.neto2) || 0;
                      return formatCurrency(neto2 * (userPercentage / 100));
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

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
              // Calcular valores en tiempo real considerando deducciones editadas
              const bruto = parseFloat(data.recaudacion.bruto) || 0;
              
              // Calcular total deducciones A (considerando tipo % o fijo)
              const currentDeductionsA = editMode ? deductionsA : (data.deductions_a?.items || []);
              const totalDeductionsA = currentDeductionsA.reduce((sum, ded) => {
                if (ded.type === 'fixed') {
                  return sum + (parseFloat(ded.fixedAmount) || 0);
                }
                return sum + (bruto * ((parseFloat(ded.percentage) || 0) / 100));
              }, 0);
              
              // NETO 1 = Bruto - Deducciones A
              const neto1 = bruto - totalDeductionsA;

              // NETO 2 = NETO 1 + Servicios
              const neto2 = parseFloat(data.neto2) || neto1;

              // Calcular total deducciones B
              const currentDeductionsB = editMode ? deductionsB : (data.deductions_b?.items || []);
              const totalDeductionsB = currentDeductionsB.reduce((sum, ded) => sum + (parseFloat(ded.amount) || 0), 0);

              // Porcentajes del contrato
              const currentUserPercentage = editMode ? userPercentage : (data.contract?.user_percentage || 0);

              // Parte del usuario del NETO 2
              const userShare = neto2 * (currentUserPercentage / 100);
              
              // Total a liquidar = parte del usuario - deducciones B
              const userTotal = Math.max(0, userShare - totalDeductionsB);
              
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: theme.typography.h4, fontWeight: 'bold' }}>
                  <span>TOTAL A LIQUIDAR AL USUARIO:</span>
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
