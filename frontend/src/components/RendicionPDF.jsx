import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../lib/api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoAteneo from '../assets/images/logo_ateneo.png';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const formatPeriodo = (p) => {
  if (!p || !p.includes('-')) return p || '';
  const [anio, mes] = p.split('-');
  return `${MESES[parseInt(mes) - 1] || mes} ${anio}`;
};

const formatHora = (h) => {
  if (!h) return '';
  return h.slice(0, 5);
};

const fmtMoney = (n) => {
  const num = parseFloat(n) || 0;
  return `$${num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const inputSt = {
  padding: '6px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 13,
  boxSizing: 'border-box',
  width: '100%'
};

const labelSt = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 3
};

const btnPrimary = {
  padding: '8px 18px',
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13
};

const btnSecondary = {
  padding: '8px 18px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13
};

export default function RendicionPDF({ token, clases }) {
  const [claseId, setClaseId] = useState('');
  const [periodosDisponibles, setPeriodosDisponibles] = useState([]);
  const [periodosSeleccionados, setPeriodosSeleccionados] = useState([]);
  const [claseInfo, setClaseInfo] = useState(null);
  const [filas, setFilas] = useState([]);
  const [porcentajeDocente, setPorcentajeDocente] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingDatos, setLoadingDatos] = useState(false);
  const [step, setStep] = useState(1); // 1=elegir clase/cuotas, 2=editar tabla

  // Al cambiar clase, cargar períodos disponibles
  useEffect(() => {
    if (!claseId) { setPeriodosDisponibles([]); setPeriodosSeleccionados([]); setClaseInfo(null); setFilas([]); setStep(1); return; }
    loadPeriodosDisponibles();
  }, [claseId]);

  const loadPeriodosDisponibles = async () => {
    setLoadingDatos(true);
    try {
      const res = await apiAuthFetch(`/api/ateneo/reportes/rendicion-datos?clase_id=${claseId}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setPeriodosDisponibles(data.periodosDisponibles || []);
        setClaseInfo(data.clase);
        setFilas([]);
        setPeriodosSeleccionados([]);
        setStep(1);
      }
    } catch (e) { console.error(e); }
    finally { setLoadingDatos(false); }
  };

  const togglePeriodo = (p) => {
    setPeriodosSeleccionados(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort()
    );
  };

  const cargarDatos = async () => {
    if (!claseId || periodosSeleccionados.length === 0) return;
    setLoading(true);
    try {
      const params = `clase_id=${claseId}&periodos=${periodosSeleccionados.join(',')}`;
      const res = await apiAuthFetch(`/api/ateneo/reportes/rendicion-datos?${params}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setClaseInfo(data.clase);
        setFilas((data.filas || []).map((f, i) => ({ ...f, _id: i, monto: parseFloat(f.monto) || 0 })));
        setStep(2);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const addFila = () => {
    setFilas(prev => [...prev, { _id: Date.now(), nombre: '', monto: 0, observaciones: '' }]);
  };

  const removeFila = (id) => {
    setFilas(prev => prev.filter(f => f._id !== id));
  };

  const updateFila = (id, field, value) => {
    setFilas(prev => prev.map(f => f._id === id ? { ...f, [field]: field === 'monto' ? (parseFloat(value) || 0) : value } : f));
  };

  const totalRecaudado = filas.reduce((s, f) => s + (parseFloat(f.monto) || 0), 0);
  const pct = parseFloat(porcentajeDocente) || 0;
  const totalDocente = Math.round(totalRecaudado * pct / 100);

  const horarioTexto = () => {
    if (!claseInfo?.horarios?.length) return '-';
    return claseInfo.horarios
      .map(h => `${h.dia} ${formatHora(h.hora_inicio)}-${formatHora(h.hora_fin)}`)
      .join(' / ');
  };

  const mesesTexto = () => {
    if (!periodosSeleccionados.length) return '-';
    return periodosSeleccionados.map(formatPeriodo).join(', ');
  };

  const generarPDF = () => {
    // Calcular altura necesaria antes de crear el doc para decidir el tamaño
    // Usamos A4 estándar pero con pageBreak: 'avoid' en autoTable
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const GREEN_DARK = [22, 78, 50]; // verde oscuro para encabezados

    // ── CABECERA: Logo centrado ──
    let y = 10;
    const logoW = 60;
    const logoH = 20;
    try {
      doc.addImage(logoAteneo, 'PNG', (pageW - logoW) / 2, y, logoW, logoH);
    } catch (e) { /* ignorar si falla */ }
    y += logoH + 5;

    // Título centrado
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text('RENDICIÓN DE CUOTAS', pageW / 2, y, { align: 'center' });
    y += 6;

    // Nombre de la clase centrado
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text((claseInfo?.nombre || '').toUpperCase(), pageW / 2, y, { align: 'center' });
    y += 7;

    // Línea separadora verde
    doc.setDrawColor(...GREEN_DARK);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageW - margin, y);
    doc.setLineWidth(0.2);
    y += 6;

    // ── INFO DE LA CLASE ──
    const col1 = margin;
    const col2 = pageW / 2 + 5;
    doc.setFontSize(10);

    doc.setFont('helvetica', 'bold');
    doc.text('Profesor/a:', col1, y);
    doc.setFont('helvetica', 'normal');
    doc.text(claseInfo?.docente || '-', col1 + 25, y);

    doc.setFont('helvetica', 'bold');
    doc.text('Días y horarios:', col2, y);
    doc.setFont('helvetica', 'normal');
    const horTexto = horarioTexto();
    const horLines = doc.splitTextToSize(horTexto, pageW - col2 - margin - 5);
    doc.text(horLines, col2 + 33, y);
    y += Math.max(6, horLines.length * 5);

    doc.setFont('helvetica', 'bold');
    doc.text('Período/s:', col1, y);
    doc.setFont('helvetica', 'normal');
    const periodoLines = doc.splitTextToSize(mesesTexto(), pageW / 2 - margin - 25);
    doc.text(periodoLines, col1 + 22, y);

    doc.setFont('helvetica', 'bold');
    doc.text('Cant. alumnos:', col2, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(filas.length), col2 + 33, y);
    y += Math.max(6, periodoLines.length * 5) + 3;

    doc.setDrawColor(...GREEN_DARK);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageW - margin, y);
    doc.setLineWidth(0.2);
    y += 5;

    // ── TABLA DE ALUMNOS ──
    autoTable(doc, {
      startY: y,
      head: [['N°', 'Nombre y Apellido', 'Monto', 'Observaciones']],
      body: filas.map((f, i) => [
        i + 1,
        f.nombre || '-',
        fmtMoney(f.monto),
        f.observaciones || ''
      ]),
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: GREEN_DARK, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 72 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 'auto' }
      },
      alternateRowStyles: { fillColor: [235, 245, 240] },
      margin: { left: margin, right: margin },
      pageBreak: 'avoid'
    });

    y = doc.lastAutoTable.finalY + 5;

    // ── TOTALES ──
    doc.setDrawColor(...GREEN_DARK);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    doc.setLineWidth(0.2);
    y += 7;

    // Zona de totales: label desde xLabel, valor alineado a la derecha de xValue
    // xLabel reserva 100mm para el label, el valor va al margen derecho
    const xLabel = margin + 80;   // donde empieza el bloque de totales
    const xValue = pageW - margin; // borde derecho para alinear valores

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Total recaudado:', xLabel, y);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtMoney(totalRecaudado), xValue, y, { align: 'right' });
    y += 7;

    if (pct > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Porcentaje docente (${pct}%):`, xLabel, y);
      doc.text(fmtMoney(totalDocente), xValue, y, { align: 'right' });
      y += 7;

      // Línea divisoria verde antes del total final
      doc.setDrawColor(...GREEN_DARK);
      doc.setLineWidth(0.5);
      doc.line(xLabel, y, pageW - margin, y);
      doc.setLineWidth(0.2);
      y += 6;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...GREEN_DARK);
      doc.text('TOTAL A RENDIR AL DOCENTE:', xLabel, y);
      doc.text(fmtMoney(totalDocente), xValue, y, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    // ── FIRMAS ──
    y += 20;
    const firmaW = (pageW - margin * 2 - 20) / 2;
    const xFirma1 = margin;
    const xFirma2 = margin + firmaW + 20;

    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.4);
    doc.line(xFirma1, y, xFirma1 + firmaW, y);
    doc.line(xFirma2, y, xFirma2 + firmaW, y);

    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('Firma Docente', xFirma1 + firmaW / 2, y, { align: 'center' });
    doc.text('Firma Ateneo', xFirma2 + firmaW / 2, y, { align: 'center' });

    // ── PIE ──
    y += 10;
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-AR')} — Ateneo Teatro Español Pigüé`, pageW / 2, y, { align: 'center' });

    const nombreArchivo = `rendicion_${(claseInfo?.nombre || 'clase').toLowerCase().replace(/\s+/g, '_')}_${periodosSeleccionados.join('-') || 'sin_periodo'}.pdf`;
    doc.save(nombreArchivo);
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div>
      {/* PASO 1: Selección de clase y períodos */}
      {step === 1 && (
        <div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={{ flex: '1 1 260px' }}>
              <label style={labelSt}>Clase</label>
              <select
                value={claseId}
                onChange={e => setClaseId(e.target.value)}
                style={inputSt}
              >
                <option value=''>Seleccionar clase...</option>
                {(clases || []).map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            {claseId && claseInfo && (
              <div style={{ flex: '1 1 260px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#374151' }}>
                <div><strong>Profesor/a:</strong> {claseInfo.docente}</div>
                <div><strong>Horario:</strong> {horarioTexto()}</div>
              </div>
            )}
          </div>

          {claseId && loadingDatos && (
            <div style={{ color: '#6b7280', fontSize: 13, padding: '12px 0' }}>Cargando períodos disponibles...</div>
          )}

          {claseId && !loadingDatos && (
            <>
              <label style={{ ...labelSt, marginBottom: 8 }}>
                Cuotas a incluir en la rendición
                <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>(seleccioná uno o más períodos)</span>
              </label>

              {periodosDisponibles.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>No hay cuotas pagadas registradas para esta clase.</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {periodosDisponibles.map(p => {
                    const sel = periodosSeleccionados.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => togglePeriodo(p)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 20,
                          border: sel ? '2px solid #7c3aed' : '1px solid #d1d5db',
                          background: sel ? '#7c3aed' : '#fff',
                          color: sel ? '#fff' : '#374151',
                          cursor: 'pointer',
                          fontWeight: sel ? 600 : 400,
                          fontSize: 13
                        }}
                      >
                        {formatPeriodo(p)}
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={labelSt}>% a rendir al docente</label>
                  <input
                    type='number'
                    min='0'
                    max='100'
                    step='1'
                    value={porcentajeDocente}
                    onChange={e => setPorcentajeDocente(e.target.value)}
                    placeholder='ej: 60'
                    style={{ ...inputSt, width: 100 }}
                  />
                </div>

                <button
                  onClick={cargarDatos}
                  disabled={!periodosSeleccionados.length || loading}
                  style={{
                    ...btnPrimary,
                    marginTop: 18,
                    opacity: (!periodosSeleccionados.length || loading) ? 0.5 : 1,
                    cursor: (!periodosSeleccionados.length || loading) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Cargando...' : 'Cargar datos →'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* PASO 2: Edición de tabla y generación PDF */}
      {step === 2 && claseInfo && (
        <div>
          {/* Header info */}
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            <div><strong style={{ color: '#7c3aed' }}>Clase:</strong> {claseInfo.nombre}</div>
            <div><strong style={{ color: '#7c3aed' }}>Profesor/a:</strong> {claseInfo.docente}</div>
            <div><strong style={{ color: '#7c3aed' }}>Horario:</strong> {horarioTexto()}</div>
            <div><strong style={{ color: '#7c3aed' }}>Períodos:</strong> {mesesTexto()}</div>
          </div>

          {/* % docente */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
            <div>
              <label style={labelSt}>% a rendir al docente</label>
              <input
                type='number'
                min='0'
                max='100'
                step='1'
                value={porcentajeDocente}
                onChange={e => setPorcentajeDocente(e.target.value)}
                placeholder='ej: 60'
                style={{ ...inputSt, width: 100 }}
              />
            </div>
            <button onClick={() => setStep(1)} style={btnSecondary}>← Volver</button>
            <button onClick={generarPDF} style={btnPrimary}>Generar PDF</button>
          </div>

          {/* Tabla editable */}
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#164e32' }}>
                  <th style={{ padding: '10px 8px', color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'center', width: 36 }}>N°</th>
                  <th style={{ padding: '10px 8px', color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>Nombre y Apellido</th>
                  <th style={{ padding: '10px 8px', color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'right', width: 130 }}>Monto</th>
                  <th style={{ padding: '10px 8px', color: '#fff', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>Observaciones</th>
                  <th style={{ padding: '10px 8px', width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f._id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#f0faf5' }}>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 13, color: '#6b7280' }}>{i + 1}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        value={f.nombre}
                        onChange={e => updateFila(f._id, 'nombre', e.target.value)}
                        style={{ ...inputSt, border: '1px solid transparent', background: 'transparent', padding: '4px 6px' }}
                        onFocus={e => e.target.style.border = '1px solid #a78bfa'}
                        onBlur={e => e.target.style.border = '1px solid transparent'}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        type='number'
                        value={f.monto}
                        onChange={e => updateFila(f._id, 'monto', e.target.value)}
                        style={{ ...inputSt, border: '1px solid transparent', background: 'transparent', padding: '4px 6px', textAlign: 'right' }}
                        onFocus={e => e.target.style.border = '1px solid #a78bfa'}
                        onBlur={e => e.target.style.border = '1px solid transparent'}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        value={f.observaciones || ''}
                        onChange={e => updateFila(f._id, 'observaciones', e.target.value)}
                        placeholder='—'
                        style={{ ...inputSt, border: '1px solid transparent', background: 'transparent', padding: '4px 6px' }}
                        onFocus={e => e.target.style.border = '1px solid #a78bfa'}
                        onBlur={e => e.target.style.border = '1px solid transparent'}
                      />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => removeFila(f._id)}
                        title='Eliminar fila'
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1 }}
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Agregar fila */}
          <button
            onClick={addFila}
            style={{ ...btnSecondary, marginTop: 10, fontSize: 12, padding: '6px 14px' }}
          >+ Agregar fila</button>

          {/* Totales */}
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: '#f0faf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: '14px 20px', minWidth: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
                <span style={{ color: '#374151' }}>Total recaudado:</span>
                <span style={{ fontWeight: 600 }}>{fmtMoney(totalRecaudado)}</span>
              </div>
              {pct > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8, color: '#6b7280' }}>
                    <span>Porcentaje docente ({pct}%):</span>
                    <span>{fmtMoney(totalDocente)}</span>
                  </div>
                  <div style={{ borderTop: '2px solid #164e32', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: '#164e32' }}>
                    <span>Total a rendir:</span>
                    <span>{fmtMoney(totalDocente)}</span>
                  </div>
                </>
              )}
              {!pct && (
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Ingresá el % docente para calcular el monto a rendir</div>
              )}
            </div>
          </div>

          {/* Botón generar PDF abajo también */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={generarPDF} style={{ ...btnPrimary, fontSize: 14 }}>Generar PDF</button>
            <button onClick={() => setStep(1)} style={btnSecondary}>← Volver a selección</button>
          </div>
        </div>
      )}
    </div>
  );
}
