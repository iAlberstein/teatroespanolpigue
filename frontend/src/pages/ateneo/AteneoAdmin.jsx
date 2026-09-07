import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../styles/theme';
import DateInput from '../../components/DateInput';
import RendicionPDF from '../../components/RendicionPDF';
import { formatDate, formatDateLong, formatMonthYear } from '../../lib/dateFormatter.js';

// Helper: nombre del alumno (si es menor, muestra nombre del menor + responsable entre paréntesis)
const getNombreAlumno = (alumno) => {
  if (!alumno) return '-';
  const nombreUsuario = alumno.usuario?.name || alumno.user?.name || alumno.nombre || `Alumno #${alumno.id}`;
  if (alumno.es_menor && (alumno.nombre_menor || alumno.apellido_menor)) {
    const nombreMenor = `${alumno.nombre_menor || ''} ${alumno.apellido_menor || ''}`.trim();
    return `${nombreMenor} (${nombreUsuario})`;
  }
  return nombreUsuario;
};

const sortAlumnos = (list) => [...list].sort((a, b) => getNombreAlumno(a).localeCompare(getNombreAlumno(b), 'es'));

// Helper: formato concepto de pago
const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const formatConcepto = (pago) => {
  if (pago.tipo === 'matricula') return `Matricula ${pago.periodo || new Date().getFullYear()}`;
  if (pago.tipo === 'cuota' && pago.periodo && pago.periodo.includes('-')) {
    const mesNum = parseInt(pago.periodo.split('-')[1]) - 1;
    return `Cuota ${MESES_NOMBRE[mesNum] || pago.periodo}`;
  }
  return `Cuota ${pago.periodo || ''}`;
};

// Helper: recargo 15% si cuota vencida
const RECARGO = 0.15;
const esCuotaVencida = (pago) => {
  if (pago.tipo !== 'cuota') return false;
  if (pago.estado === 'pagado') return false;
  if (!pago.fecha_vencimiento) return false;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(pago.fecha_vencimiento + (String(pago.fecha_vencimiento).length === 10 ? 'T00:00:00' : ''));
  venc.setHours(0, 0, 0, 0);
  return hoy > venc;
};
const montoConRecargo = (pago) => Math.round(parseFloat(pago.monto_final || 0) * (1 + RECARGO));

const getIsMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

const tabs = [
  { id: 'clases', label: 'Clases' },
  { id: 'alumnos', label: 'Alumnos' },
  { id: 'inscripciones', label: 'Inscripciones' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'becas', label: 'Becas' },
  { id: 'asistencia', label: 'Asistencia' },
  { id: 'feriados', label: 'Feriados' },
  { id: 'cumpleanos', label: 'Cumpleaños' },
  { id: 'reportes', label: 'Reportes' },
];

export default function AteneoAdmin() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('clases');
  const isMobile = getIsMobile();

  return (
    <div style={{ minHeight: '60vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: isMobile ? 18 : theme.typography.h3, fontWeight: theme.typography.bold, margin: 0 }}>
          Ateneo - Administracion
        </h1>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: theme.spacing.lg,
        borderBottom: `2px solid ${theme.colors.border}`,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: isMobile ? '6px 10px' : `${theme.spacing.sm} ${theme.spacing.md}`,
              background: activeTab === tab.id ? theme.colors.primaryDark : 'transparent',
              color: activeTab === tab.id ? '#fff' : theme.colors.textSecondary,
              border: 'none',
              borderRadius: `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0`,
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? theme.typography.semibold : theme.typography.regular,
              fontSize: isMobile ? '11px' : theme.typography.small,
              whiteSpace: 'nowrap',
              transition: theme.transitions.fast
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'clases' && <ClasesTab token={token} />}
      {activeTab === 'alumnos' && <AlumnosTab token={token} />}
      {activeTab === 'inscripciones' && <InscripcionesTab token={token} />}
      {activeTab === 'pagos' && <PagosTab token={token} />}
      {activeTab === 'becas' && <BecasTab token={token} />}
      {activeTab === 'asistencia' && <AsistenciaTab token={token} />}
      {activeTab === 'feriados' && <FeriadosTab token={token} />}
      {activeTab === 'cumpleanos' && <CumpleanosTab token={token} onNavigateToAlumnos={() => setActiveTab('alumnos')} />}
      {activeTab === 'reportes' && <ReportesTab token={token} />}
    </div>
  );
}

// ============================================================
// CLASES TAB
// ============================================================
const DIAS_SEMANA = ['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'];

function ClasesTab({ token }) {
  const API = import.meta.env.VITE_API_URL || '';
  const isMobile = getIsMobile();
  const [clases, setClases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingClase, setEditingClase] = useState(null);
  const [form, setForm] = useState({
    nombre: '', descripcion: '', docente_id: '', ubicacion: '',
    cupo: 20, costo_cuota: '', costo_matricula: '', fecha_inicio: '', fecha_fin: '',
    imagen_actividad_url: '', imagen_docente_url: '', bio_docente: '', nombre_docente: '', visible: true,
    docentes_ids: [], taller_corto: false
  });
  const [horarios, setHorarios] = useState([{ dia_semana: '', hora_inicio: '', hora_fin: '', fecha: '' }]);
  const [docentesDisponibles, setDocentesDisponibles] = useState([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  useEffect(() => { loadClases(); loadDocentes(); }, []);

  const loadDocentes = async () => {
    try {
      const res = await apiAuthFetch('/api/ateneo/clases/docentes/disponibles', {}, token);
      if (res.ok) {
        const data = await res.json();
        setDocentesDisponibles(data || []);
      }
    } catch (err) { console.error(err); }
  };

  const loadClases = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/ateneo/clases', {}, token);
      if (res.ok) {
        const data = await res.json();
        setClases(data.clases || data || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!form.nombre) { setError('El nombre es requerido'); return; }
    const validHorarios = form.taller_corto
      ? horarios.filter(h => h.fecha && h.hora_inicio && h.hora_fin)
      : horarios.filter(h => h.dia_semana && h.hora_inicio && h.hora_fin);
    if (validHorarios.length === 0) { setError('Agrega al menos un horario'); return; }
    setError('');
    try {
      const url = editingClase ? `/api/ateneo/clases/${editingClase.id}` : '/api/ateneo/clases';
      const method = editingClase ? 'PUT' : 'POST';
      const payload = { ...form, horarios: validHorarios, docentes_ids: form.docentes_ids || [], taller_corto: !!form.taller_corto };
      const res = await apiAuthFetch(url, { method, body: JSON.stringify(payload) }, token);
      if (res.ok) {
        setShowForm(false);
        setEditingClase(null);
        resetForm();
        loadClases();
      } else {
        const data = await res.json();
        setError(data.message || data.error || 'Error al guardar');
      }
    } catch (err) { setError('Error de conexion'); }
  };

  const resetForm = () => {
    setForm({ nombre: '', descripcion: '', docente_id: '', ubicacion: '',
      cupo: 20, costo_cuota: '', costo_matricula: '', fecha_inicio: '', fecha_fin: '',
      imagen_actividad_url: '', imagen_docente_url: '', bio_docente: '', nombre_docente: '', visible: true, color: '',
      matricula_bonificada: false, cuota_unica: false, docentes_ids: [], taller_corto: false });
    setHorarios([{ dia_semana: '', hora_inicio: '', hora_fin: '', fecha: '' }]);
  };

  const handleEdit = (clase) => {
    setEditingClase(clase);
    setForm({
      nombre: clase.nombre || '',
      descripcion: clase.descripcion || '',
      docente_id: clase.docente_id || '',
      ubicacion: clase.ubicacion || '',
      cupo: clase.cupo || 20,
      costo_cuota: clase.costo_cuota || '',
      costo_matricula: clase.costo_matricula || '',
      fecha_inicio: clase.fecha_inicio || '',
      fecha_fin: clase.fecha_fin || '',
      imagen_actividad_url: clase.imagen_actividad_url || '',
      imagen_docente_url: clase.imagen_docente_url || '',
      bio_docente: clase.bio_docente || '',
      nombre_docente: clase.nombre_docente || '',
      visible: clase.visible !== false,
      color: clase.color || '',
      matricula_bonificada: !!clase.matricula_bonificada,
      cuota_unica: !!clase.cuota_unica,
      docentes_ids: (clase.docentes || []).map(d => d.id),
      taller_corto: !!clase.taller_corto
    });
    if (clase.horarios && clase.horarios.length > 0) {
      setHorarios(clase.horarios.map(h => ({
        dia_semana: h.dia_semana || '',
        hora_inicio: (h.hora_inicio || '').substring(0, 5),
        hora_fin: (h.hora_fin || '').substring(0, 5),
        fecha: h.fecha || ''
      })));
    } else {
      setHorarios([{ dia_semana: '', hora_inicio: '', hora_fin: '', fecha: '' }]);
    }
    setShowForm(true);
  };

  const handleDelete = async (clase) => {
    try {
      const checkRes = await apiAuthFetch(`/api/ateneo/clases/${clase.id}/check-delete`, {}, token);
      const checkData = await checkRes.json();
      const count = checkData.inscripciones_activas || 0;
      const msg = count > 0
        ? `Esta clase tiene ${count} inscripcion(es) activa(s). Al eliminarla se dará de baja a los alumnos y se cancelarán sus pagos pendientes.\n\n¿Confirmar eliminación?`
        : '¿Estás seguro de eliminar esta clase?';
      if (!window.confirm(msg)) return;
      const res = await apiAuthFetch(`/api/ateneo/clases/${clase.id}`, { method: 'DELETE' }, token);
      if (res.ok) {
        setSuccessMsg('Clase eliminada correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadClases();
      } else {
        const d = await res.json();
        setError(d.error || 'Error al eliminar');
      }
    } catch (err) { setError('Error de conexión'); }
  };

  const addHorario = () => {
    setHorarios([...horarios, { dia_semana: '', hora_inicio: '', hora_fin: '', fecha: '' }]);
  };

  const removeHorario = (idx) => {
    if (horarios.length <= 1) return;
    setHorarios(horarios.filter((_, i) => i !== idx));
  };

  const updateHorario = (idx, field, value) => {
    const updated = [...horarios];
    updated[idx] = { ...updated[idx], [field]: value };
    setHorarios(updated);
  };

  const formatHorarios = (clase) => {
    if (clase.horarios && clase.horarios.length > 0) {
      return clase.horarios.map(h => {
        const label = clase.taller_corto && h.fecha
          ? formatDate(h.fecha)
          : h.dia_semana;
        return `${label} ${(h.hora_inicio || '').substring(0, 5)}-${(h.hora_fin || '').substring(0, 5)}`;
      }).join(' | ');
    }
    return clase.horario || '-';
  };

  const handleDragStart = (idx) => { setDragIdx(idx); };
  const handleDragOver = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };
  const handleDrop = async (idx) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const reordered = [...clases];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setClases(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
    try {
      const orden = reordered.map((c, i) => ({ id: c.id, orden: i }));
      await apiAuthFetch('/api/ateneo/clases/reordenar', {
        method: 'PUT', body: JSON.stringify({ orden })
      }, token);
    } catch (err) { console.error('Error guardando orden:', err); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>;

  return (
    <div>
      {successMsg && <div style={{ padding: '8px 16px', background: '#d1fae5', color: '#059669', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{successMsg}</div>}
      {error && !showForm && <div style={{ padding: '8px 16px', background: '#fee2e2', color: '#dc2626', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
        <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>{clases.length} clases</span>
        <button onClick={() => { resetForm(); setEditingClase(null); setShowForm(true); }} style={btnPrimary}>
          Nueva Clase
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 620}}>
            <h3 style={{ marginTop: 0 }}>{editingClase ? 'Editar Clase' : 'Nueva Clase'}</h3>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nombre *</label>
                <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Descripcion</label>
                <textarea style={{...inputStyle, minHeight: 60}} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} />
              </div>

              {/* Docentes section */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{...labelStyle, fontWeight: 600}}>Docentes</label>
                {docentesDisponibles.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>No hay docentes con rol docente_ateneo</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {docentesDisponibles.map(d => {
                      const selected = (form.docentes_ids || []).includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            const ids = form.docentes_ids || [];
                            setForm({...form, docentes_ids: selected ? ids.filter(id => id !== d.id) : [...ids, d.id]});
                          }}
                          style={{
                            padding: '5px 12px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
                            border: selected ? '2px solid #7c3aed' : '1px solid #d1d5db',
                            background: selected ? '#ede9fe' : '#fff',
                            color: selected ? '#7c3aed' : '#374151',
                            fontWeight: selected ? 600 : 400,
                            transition: 'all 0.15s'
                          }}
                        >
                          {selected ? '✓ ' : ''}{d.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                {(form.docentes_ids || []).length > 0 && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    {form.docentes_ids.length} docente{form.docentes_ids.length > 1 ? 's' : ''} seleccionado{form.docentes_ids.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Taller corto checkbox */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', background: form.taller_corto ? '#fef3c7' : '#f9fafb', border: form.taller_corto ? '2px solid #d97706' : '1px solid #e5e7eb', borderRadius: 8, transition: 'all 0.15s' }}>
                  <input type="checkbox" checked={form.taller_corto} onChange={e => {
                    setForm({...form, taller_corto: e.target.checked});
                    setHorarios([{ dia_semana: '', hora_inicio: '', hora_fin: '', fecha: '' }]);
                  }} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14, color: form.taller_corto ? '#92400e' : '#374151' }}>Taller corto</span>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      {form.taller_corto ? 'Definí fechas puntuales en el calendario' : 'Activar para definir fechas puntuales en vez de dias de la semana'}
                    </div>
                  </div>
                </label>
              </div>

              {/* Horarios section */}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{...labelStyle, marginBottom: 0, fontWeight: 600}}>
                    {form.taller_corto ? 'Fechas del taller *' : 'Horarios *'}
                  </label>
                  <button type="button" onClick={addHorario} style={{...btnSmall, background: '#000000'}}>
                    + Agregar {form.taller_corto ? 'fecha' : 'dia'}
                  </button>
                </div>
                {horarios.map((h, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    {form.taller_corto ? (
                      <DateInput
                        style={{...inputStyle, flex: 2}}
                        value={h.fecha}
                        onChange={e => updateHorario(idx, 'fecha', e.target.value)}
                      />
                    ) : (
                      <select
                        style={{...inputStyle, flex: 2}}
                        value={h.dia_semana}
                        onChange={e => updateHorario(idx, 'dia_semana', e.target.value)}
                      >
                        <option value="">Dia...</option>
                        {DIAS_SEMANA.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    )}
                    <input
                      type="text"
                      placeholder="HH:MM"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                      maxLength={5}
                      style={{...inputStyle, flex: 1, textAlign: 'center'}}
                      value={h.hora_inicio}
                      onChange={e => {
                        let v = e.target.value.replace(/[^0-9:]/g, '');
                        if (v.length === 2 && !v.includes(':')) v += ':';
                        updateHorario(idx, 'hora_inicio', v.substring(0, 5));
                      }}
                    />
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>a</span>
                    <input
                      type="text"
                      placeholder="HH:MM"
                      pattern="[0-2][0-9]:[0-5][0-9]"
                      maxLength={5}
                      style={{...inputStyle, flex: 1, textAlign: 'center'}}
                      value={h.hora_fin}
                      onChange={e => {
                        let v = e.target.value.replace(/[^0-9:]/g, '');
                        if (v.length === 2 && !v.includes(':')) v += ':';
                        updateHorario(idx, 'hora_fin', v.substring(0, 5));
                      }}
                    />
                    {horarios.length > 1 && (
                      <button type="button" onClick={() => removeHorario(idx)} style={{
                        background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4,
                        padding: '6px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 600
                      }}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label style={labelStyle}>Ubicacion</label>
                <input style={inputStyle} value={form.ubicacion} onChange={e => setForm({...form, ubicacion: e.target.value})} />
              </div>
              <div>
                <label style={labelStyle}>Cupo maximo</label>
                <input style={inputStyle} type="number" value={form.cupo} onChange={e => setForm({...form, cupo: parseInt(e.target.value) || 20})} />
              </div>
              <div style={{ gridColumn: '1 / -1', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                <label style={{...labelStyle, fontWeight: 600, marginBottom: 8, display: 'block'}}>Costos</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>{form.cuota_unica ? 'Pago unico ($)' : 'Cuota mensual ($)'}</label>
                    <input style={inputStyle} type="number" value={form.costo_cuota} onChange={e => setForm({...form, costo_cuota: e.target.value})} />
                  </div>
                  {!form.matricula_bonificada && (
                    <div>
                      <label style={labelStyle}>Matricula ($)</label>
                      <input style={inputStyle} type="number" value={form.costo_matricula} onChange={e => setForm({...form, costo_matricula: e.target.value})} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.matricula_bonificada} onChange={e => setForm({...form, matricula_bonificada: e.target.checked, ...(e.target.checked ? { costo_matricula: '' } : {})})} />
                    Matricula bonificada
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.cuota_unica} onChange={e => setForm({...form, cuota_unica: e.target.checked})} />
                    Cuota unica (taller/intensivo)
                  </label>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                  {form.matricula_bonificada && 'Sin costo de matricula. '}
                  {form.cuota_unica && 'Se cobra un unico pago por toda la actividad.'}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Fecha inicio</label>
                <DateInput style={inputStyle} value={form.fecha_inicio} onChange={e => setForm({...form, fecha_inicio: e.target.value})} />
              </div>
              <div>
                <label style={labelStyle}>Fecha fin</label>
                <DateInput style={inputStyle} value={form.fecha_fin} onChange={e => setForm({...form, fecha_fin: e.target.value})} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Foto de la actividad</label>
                {form.imagen_actividad_url && (
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={form.imagen_actividad_url.startsWith('/') ? (API + form.imagen_actividad_url) : form.imagen_actividad_url} alt="Actividad" style={{ height: 60, borderRadius: 4, objectFit: 'cover' }} />
                    <button type="button" onClick={() => setForm({...form, imagen_actividad_url: ''})} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>Quitar</button>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  const fd = new FormData(); fd.append('image', file);
                  try {
                    const res = await apiAuthFetch('/api/ateneo/clases/upload-image', { method: 'POST', body: fd, rawBody: true }, token);
                    const data = await res.json();
                    if (res.ok) setForm(f => ({...f, imagen_actividad_url: data.url}));
                    else setError(data.error || 'Error al subir imagen');
                  } catch (err) { setError('Error al subir imagen'); }
                }} style={{ fontSize: 13 }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Foto del docente</label>
                {form.imagen_docente_url && (
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={form.imagen_docente_url.startsWith('/') ? (API + form.imagen_docente_url) : form.imagen_docente_url} alt="Docente" style={{ height: 60, borderRadius: 4, objectFit: 'cover' }} />
                    <button type="button" onClick={() => setForm({...form, imagen_docente_url: ''})} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}>Quitar</button>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  const fd = new FormData(); fd.append('image', file);
                  try {
                    const res = await apiAuthFetch('/api/ateneo/clases/upload-image', { method: 'POST', body: fd, rawBody: true }, token);
                    const data = await res.json();
                    if (res.ok) setForm(f => ({...f, imagen_docente_url: data.url}));
                    else setError(data.error || 'Error al subir imagen');
                  } catch (err) { setError('Error al subir imagen'); }
                }} style={{ fontSize: 13 }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Nombre del docente (visible en la web)</label>
                <input style={inputStyle} value={form.nombre_docente} onChange={e => setForm({...form, nombre_docente: e.target.value})} placeholder="Nombre que se mostrara en 'Conocer al docente'" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Biografia del docente</label>
                <textarea style={{...inputStyle, minHeight: 80}} value={form.bio_docente} onChange={e => setForm({...form, bio_docente: e.target.value})} placeholder="Breve biografia del docente..." />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Color en calendario</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {[
                    { value: 'purple', bg: '#ede9fe', dot: '#7c3aed', label: 'Violeta' },
                    { value: 'blue', bg: '#dbeafe', dot: '#2563eb', label: 'Azul' },
                    { value: 'green', bg: '#d1fae5', dot: '#059669', label: 'Verde' },
                    { value: 'amber', bg: '#fef3c7', dot: '#d97706', label: 'Ámbar' },
                    { value: 'pink', bg: '#fce7f3', dot: '#db2777', label: 'Rosa' },
                    { value: 'indigo', bg: '#e0e7ff', dot: '#4f46e5', label: 'Índigo' },
                    { value: 'teal', bg: '#ccfbf1', dot: '#0d9488', label: 'Teal' },
                    { value: 'violet', bg: '#fae8ff', dot: '#a855f7', label: 'Lila' },
                  ].map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm({...form, color: form.color === c.value ? '' : c.value})}
                      title={c.label}
                      style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: c.bg, border: form.color === c.value ? `3px solid ${c.dot}` : '2px solid #e5e7eb',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: form.color === c.value ? `0 0 0 2px #fff, 0 0 0 4px ${c.dot}` : 'none',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: c.dot }} />
                    </button>
                  ))}
                </div>
                {form.color && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    Seleccionado: {
                      { purple: 'Violeta', blue: 'Azul', green: 'Verde', amber: 'Ámbar', pink: 'Rosa', indigo: 'Índigo', teal: 'Teal', violet: 'Lila' }[form.color]
                    }
                    <button type="button" onClick={() => setForm({...form, color: ''})} style={{
                      background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, marginLeft: 8, textDecoration: 'underline'
                    }}>Quitar</button>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setShowForm(false); setEditingClase(null); setError(''); }} style={btnSecondary}>Cancelar</button>
              <button onClick={handleSubmit} style={btnPrimary}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table / Cards */}
      {clases.length === 0 ? (
        <div style={emptyState}>No hay clases creadas</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clases.map((c, idx) => (
            <div key={c.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{c.nombre}</strong>
                <span style={{
                  padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600,
                  background: c.estado === 'activa' ? '#d1fae5' : c.estado === 'suspendida' ? '#fef3c7' : '#fee2e2',
                  color: c.estado === 'activa' ? '#059669' : c.estado === 'suspendida' ? '#d97706' : '#dc2626'
                }}>{c.estado || 'activa'}</span>
              </div>
              {c.docentes && c.docentes.length > 0
                ? <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{c.docentes.map(d => d.name).join(', ')}</div>
                : c.docente && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{c.docente.name}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {c.horarios && c.horarios.length > 0 ? c.horarios.map((h, i) => (
                  <span key={i} style={{ padding: '1px 6px', background: '#ede9fe', color: '#7c3aed', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>
                    {c.taller_corto && h.fecha ? formatDate(h.fecha) : h.dia_semana} {(h.hora_inicio||'').substring(0,5)}-{(h.hora_fin||'').substring(0,5)}
                  </span>
                )) : <span style={{ color: '#9ca3af', fontSize: 12 }}>{c.horario || '-'}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                <span>Cupo: {c.cupo || '-'}</span>
                <span>{c.costo_cuota ? `$${Number(c.costo_cuota).toLocaleString('es-AR')}/mes` : '-'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleEdit(c)} style={{...btnSmall, flex: 1}}>Editar</button>
                <button onClick={() => handleDelete(c)} style={{...btnSmall, background: '#dc2626', flex: 1}}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={tableContainer}>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={{...thCell, width: 32, textAlign: 'center'}}></th>
                <th style={thCell}>Nombre</th>
                <th style={thCell}>Horarios</th>
                <th style={thCell}>Cupo</th>
                <th style={thCell}>Cuota</th>
                <th style={thCell}>Estado</th>
                <th style={thCell}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clases.map((c, idx) => (
                <tr key={c.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={() => handleDrop(idx)} onDragEnd={handleDragEnd} style={{
                  ...trStyle,
                  opacity: dragIdx === idx ? 0.4 : 1,
                  background: dragOverIdx === idx && dragIdx !== idx ? '#ede9fe' : undefined,
                  cursor: 'grab',
                  transition: 'background 0.15s'
                }}>
                  <td style={{...tdCell, textAlign: 'center', color: '#9ca3af', cursor: 'grab', userSelect: 'none', fontSize: 16}}>⠿</td>
                  <td style={tdCell}>
                    <strong>{c.nombre}</strong>
                    {c.docentes && c.docentes.length > 0
                      ? <div style={{ fontSize: 11, color: '#6b7280' }}>{c.docentes.map(d => d.name).join(', ')}</div>
                      : c.docente && <div style={{ fontSize: 11, color: '#6b7280' }}>{c.docente.name}</div>}
                  </td>
                  <td style={tdCell}>
                    {c.horarios && c.horarios.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {c.horarios.map((h, i) => (
                          <span key={i} style={{
                            padding: '1px 6px', background: '#ede9fe', color: '#7c3aed',
                            borderRadius: 8, fontSize: 11, fontWeight: 500, display: 'inline-block', width: 'fit-content'
                          }}>
                            {c.taller_corto && h.fecha ? formatDate(h.fecha) : h.dia_semana} {(h.hora_inicio||'').substring(0,5)}-{(h.hora_fin||'').substring(0,5)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: 12 }}>{c.horario || '-'}</span>
                    )}
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>{c.cupo || '-'}</td>
                  <td style={tdCell}>{c.costo_cuota ? `$${Number(c.costo_cuota).toLocaleString('es-AR')}` : '-'}</td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600,
                      background: c.estado === 'activa' ? '#d1fae5' : c.estado === 'suspendida' ? '#fef3c7' : '#fee2e2',
                      color: c.estado === 'activa' ? '#059669' : c.estado === 'suspendida' ? '#d97706' : '#dc2626'
                    }}>
                      {c.estado || 'activa'}
                    </span>
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => handleEdit(c)} style={btnSmall}>Editar</button>
                      <button onClick={() => handleDelete(c)} style={{...btnSmall, background: '#dc2626'}}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ALUMNOS TAB
// ============================================================
const ESTADOS_ACADEMICOS = ['pendiente', 'activo', 'deuda', 'suspendido', 'egresado'];

function AlumnosTab({ token }) {
  const isMobile = getIsMobile();
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAlumno, setEditingAlumno] = useState(null);
  const [detailAlumno, setDetailAlumno] = useState(null);
  const [showEstadoModal, setShowEstadoModal] = useState(null);
  const [estadoForm, setEstadoForm] = useState({ estado: '', motivo: '' });
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [seguimientoModal, setSeguimientoModal] = useState(null);
  const [seguimientoText, setSeguimientoText] = useState('');
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);
  const [form, setForm] = useState({
    nombre: '', email: '', password: '', dni: '', telefono: '',
    fecha_nacimiento: '', direccion: '', contacto_emergencia: '', telefono_emergencia: ''
  });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Clases disponibles (para inscribir y generar cuotas)
  const [clasesDisponibles, setClasesDisponibles] = useState([]);

  // Nueva inscripción
  const [showInscribirModal, setShowInscribirModal] = useState(false);
  const [inscribirClaseId, setInscribirClaseId] = useState('');

  // Generar cuotas por inscripción
  const [generarCuotasModal, setGenerarCuotasModal] = useState(null); // { inscripcion }
  const [generarMeses, setGenerarMeses] = useState([]);
  const [generarMontoParcial, setGenerarMontoParcial] = useState('');
  const [generarUsaMontoParcial, setGenerarUsaMontoParcial] = useState(false);

  // Ajustar monto de pago
  const [ajustarPagoModal, setAjustarPagoModal] = useState(null); // pago
  const [ajustarMontoVal, setAjustarMontoVal] = useState('');
  const [ajustarNotasVal, setAjustarNotasVal] = useState('');

  // Extender vencimiento
  const [extenderPagoModal, setExtenderPagoModal] = useState(null); // pago
  const [extenderFecha, setExtenderFecha] = useState('');

  // Inscripciones expanded (to show pagos per inscripción)
  const [expandedInscripcion, setExpandedInscripcion] = useState(null);

  useEffect(() => { loadAlumnos(true); }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadAlumnos(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [buscar, filtroEstado]);

  const loadAlumnos = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (buscar) params.set('buscar', buscar);
      if (filtroEstado) params.set('estado_academico', filtroEstado);
      const res = await apiAuthFetch(`/api/ateneo/alumnos?${params}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setAlumnos(sortAlumnos(data.alumnos || data || []));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadDetail = async (id) => {
    try {
      const res = await apiAuthFetch(`/api/ateneo/alumnos/${id}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setDetailAlumno(data);
      }
    } catch (err) { console.error(err); }
  };

  const loadClasesDisponibles = async () => {
    try {
      const res = await apiAuthFetch('/api/ateneo/clases', {}, token);
      if (res.ok) { const d = await res.json(); setClasesDisponibles(d.clases || d || []); }
    } catch (err) { console.error(err); }
  };

  const handleOpenDetail = async (alumno) => {
    await loadClasesDisponibles();
    loadDetail(alumno.id);
  };

  const handleInscribir = async () => {
    if (!inscribirClaseId) { setError('Selecciona una clase'); return; }
    setError('');
    try {
      const res = await apiAuthFetch('/api/ateneo/inscripciones', {
        method: 'POST',
        body: JSON.stringify({ clase_id: parseInt(inscribirClaseId), alumno_id: detailAlumno.id })
      }, token);
      const data = await res.json();
      if (res.ok) {
        setShowInscribirModal(false);
        setInscribirClaseId('');
        setSuccessMsg('Inscripción creada correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadDetail(detailAlumno.id);
      } else {
        setError(data.error || 'Error al inscribir');
      }
    } catch (err) { setError('Error de conexión'); }
  };

  const handleGenerarCuotas = async () => {
    if (!generarCuotasModal || generarMeses.length === 0) { setError('Seleccioná al menos un mes'); return; }
    if (generarUsaMontoParcial && (!generarMontoParcial || parseFloat(generarMontoParcial) <= 0)) { setError('Ingresá un monto válido'); return; }
    setError('');
    try {
      const body = { inscripcion_id: generarCuotasModal.id, meses: generarMeses };
      if (generarUsaMontoParcial && generarMontoParcial) body.monto_parcial = parseFloat(generarMontoParcial);
      const res = await apiAuthFetch('/api/ateneo/pagos/generar-cuotas-alumno', {
        method: 'POST', body: JSON.stringify(body)
      }, token);
      const data = await res.json();
      if (res.ok) {
        setGenerarCuotasModal(null);
        setGenerarMeses([]);
        setGenerarMontoParcial('');
        setGenerarUsaMontoParcial(false);
        setSuccessMsg(data.message || 'Cuotas generadas');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadDetail(detailAlumno.id);
      } else {
        setError(data.error || 'Error al generar cuotas');
      }
    } catch (err) { setError('Error de conexión'); }
  };

  const handleAjustarMonto = async () => {
    if (!ajustarPagoModal || ajustarMontoVal === '' || parseFloat(ajustarMontoVal) < 0) { setError('Ingresá un monto válido'); return; }
    setError('');
    try {
      const res = await apiAuthFetch(`/api/ateneo/pagos/${ajustarPagoModal.id}/ajustar`, {
        method: 'PUT', body: JSON.stringify({ monto_final: parseFloat(ajustarMontoVal), notas: ajustarNotasVal })
      }, token);
      const data = await res.json();
      if (res.ok) {
        setAjustarPagoModal(null); setAjustarMontoVal(''); setAjustarNotasVal('');
        setSuccessMsg('Monto ajustado correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadDetail(detailAlumno.id);
      } else { setError(data.error || 'Error al ajustar'); }
    } catch (err) { setError('Error de conexión'); }
  };

  const handleExtenderVencimiento = async () => {
    if (!extenderPagoModal || !extenderFecha) { setError('Seleccioná una fecha'); return; }
    setError('');
    try {
      const res = await apiAuthFetch(`/api/ateneo/pagos/${extenderPagoModal.id}/extender-vencimiento`, {
        method: 'PUT', body: JSON.stringify({ fecha_vencimiento: extenderFecha })
      }, token);
      const data = await res.json();
      if (res.ok) {
        setExtenderPagoModal(null); setExtenderFecha('');
        setSuccessMsg('Vencimiento actualizado correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadDetail(detailAlumno.id);
      } else { setError(data.error || 'Error al extender'); }
    } catch (err) { setError('Error de conexión'); }
  };

  const handleEliminarPago = async (pago) => {
    if (!window.confirm(`¿Eliminar ${formatConcepto(pago)}? Esta acción no se puede deshacer.`)) return;
    setError('');
    try {
      const res = await apiAuthFetch(`/api/ateneo/pagos/${pago.id}`, { method: 'DELETE' }, token);
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Pago eliminado correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadDetail(detailAlumno.id);
      } else { setError(data.error || 'Error al eliminar'); }
    } catch (err) { setError('Error de conexión'); }
  };

  const toggleMesGenerar = (mes) => {
    setGenerarMeses(prev => prev.includes(mes) ? prev.filter(m => m !== mes) : [...prev, mes]);
  };

  const getMesesDisponibles = () => {
    const meses = [];
    const now = new Date();
    for (let i = -2; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = formatMonthYear(d);
      meses.push({ val, label });
    }
    return meses;
  };

  const handleSubmit = async () => {
    if (!form.nombre || !form.email) { setError('Nombre y email son requeridos'); return; }
    setError('');
    try {
      const url = editingAlumno ? `/api/ateneo/alumnos/${editingAlumno.id}` : '/api/ateneo/alumnos';
      const method = editingAlumno ? 'PUT' : 'POST';
      const res = await apiAuthFetch(url, { method, body: JSON.stringify(form) }, token);
      if (res.ok) {
        setShowForm(false);
        setEditingAlumno(null);
        resetForm();
        loadAlumnos();
      } else {
        const data = await res.json();
        setError(data.message || data.error || 'Error al guardar');
      }
    } catch (err) { setError('Error de conexion'); }
  };

  const handleEstadoChange = async () => {
    if (!estadoForm.estado) return;
    try {
      const res = await apiAuthFetch(`/api/ateneo/alumnos/${showEstadoModal.id}/estado`, {
        method: 'PUT', body: JSON.stringify(estadoForm)
      }, token);
      if (res.ok) {
        setShowEstadoModal(null);
        setEstadoForm({ estado: '', motivo: '' });
        loadAlumnos();
        if (detailAlumno?.id === showEstadoModal.id) loadDetail(showEstadoModal.id);
      }
    } catch (err) { console.error(err); }
  };

  const handleGuardarSeguimiento = async () => {
    if (!seguimientoModal) return;
    setSavingSeguimiento(true);
    try {
      const res = await apiAuthFetch(`/api/ateneo/inscripciones/${seguimientoModal.id}/seguimiento`, {
        method: 'PUT', body: JSON.stringify({ seguimiento: seguimientoText })
      }, token);
      if (res.ok) {
        if (detailAlumno) {
          setDetailAlumno(prev => ({
            ...prev,
            inscripciones: prev.inscripciones.map(i => i.id === seguimientoModal.id ? { ...i, seguimiento: seguimientoText } : i)
          }));
        }
        setSeguimientoModal(null);
      }
    } catch (err) { console.error(err); }
    finally { setSavingSeguimiento(false); }
  };

  const resetForm = () => {
    setForm({ nombre: '', email: '', password: '', dni: '', telefono: '',
      fecha_nacimiento: '', direccion: '', contacto_emergencia: '', telefono_emergencia: '' });
  };

  const handleEdit = (alumno) => {
    setEditingAlumno(alumno);
    setForm({
      nombre: alumno.usuario?.name || '',
      email: alumno.usuario?.email || '',
      password: '',
      dni: alumno.dni || '',
      telefono: alumno.telefono || '',
      fecha_nacimiento: alumno.fecha_nacimiento || '',
      direccion: alumno.direccion || '',
      contacto_emergencia: alumno.contacto_emergencia || '',
      telefono_emergencia: alumno.telefono_emergencia || ''
    });
    setShowForm(true);
  };

  const getEstadoBadge = (estado) => {
    const styles = {
      activo: { bg: '#d1fae5', color: '#059669' },
      pendiente: { bg: '#fef3c7', color: '#d97706' },
      deuda: { bg: '#fee2e2', color: '#dc2626' },
      suspendido: { bg: '#fecaca', color: '#991b1b' },
      egresado: { bg: '#dbeafe', color: '#2563eb' }
    };
    const s = styles[estado] || styles.pendiente;
    return { padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color };
  };

  if (loading) return <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>;

  // Detail view
  if (detailAlumno) {
    // Pagos agrupados por inscripción
    const pagosPorInscripcion = (id) => (detailAlumno.pagos || []).filter(p => p.inscripcion_id === id);
    const pagosSinInscripcion = (detailAlumno.pagos || []).filter(p => !p.inscripcion_id);

    const PagoRow = ({ p }) => (
      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: p.estado === 'pagado' ? '#f0fdf4' : p.estado === 'vencido' ? '#fef2f2' : '#fefce8', borderRadius: 6, marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{formatConcepto(p)}</span>
          <span style={getEstadoBadge(p.estado === 'pagado' ? 'activo' : p.estado === 'vencido' ? 'deuda' : 'pendiente')}>{p.estado}</span>
          <span style={{ fontSize: 11, color: '#6b7280' }}>${Number(p.monto_final || 0).toLocaleString('es-AR')}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Vto: {formatDate(p.fecha_vencimiento)}</span>
        </div>
        {p.estado !== 'pagado' && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { setAjustarPagoModal(p); setAjustarMontoVal(String(p.monto_final || '')); setAjustarNotasVal(''); setError(''); }}
              style={{ padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Ajustar $
            </button>
            <button onClick={() => { setExtenderPagoModal(p); setExtenderFecha(p.fecha_vencimiento ? p.fecha_vencimiento.substring(0,10) : ''); setError(''); }}
              style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Vto.
            </button>
            <button onClick={() => handleEliminarPago(p)}
              style={{ padding: '2px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Eliminar
            </button>
          </div>
        )}
      </div>
    );

    return (
      <div>
        <button onClick={() => setDetailAlumno(null)} style={{...btnSecondary, marginBottom: 16}}>← Volver al listado</button>

        {successMsg && <div style={{ padding: '8px 16px', background: '#d1fae5', color: '#059669', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{successMsg}</div>}
        {error && !showForm && !showInscribirModal && !generarCuotasModal && !ajustarPagoModal && !extenderPagoModal && (
          <div style={errorBox}>{error}</div>
        )}

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: isMobile ? 14 : 24 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: isMobile ? 16 : undefined }}>{getNombreAlumno(detailAlumno)}</h3>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{detailAlumno.usuario?.email}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={getEstadoBadge(detailAlumno.estado_academico || 'pendiente')}>
                {detailAlumno.estado_academico || 'pendiente'}
              </span>
              <button onClick={() => { setShowEstadoModal(detailAlumno); setEstadoForm({ estado: detailAlumno.estado_academico, motivo: '' }); }} style={btnSmall}>
                Cambiar estado
              </button>
              <button onClick={() => handleEdit(detailAlumno)} style={btnSmall}>Editar</button>
            </div>
          </div>

          {/* Datos personales */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: isMobile ? 10 : 16, marginBottom: 24 }}>
            <div><span style={{ fontSize: 11, color: '#9ca3af' }}>DNI</span><div style={{ fontSize: 14 }}>{detailAlumno.dni || '-'}</div></div>
            <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Telefono</span><div style={{ fontSize: 14 }}>{detailAlumno.telefono || '-'}</div></div>
            <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Fecha nacimiento</span><div style={{ fontSize: 14 }}>{formatDate(detailAlumno.fecha_nacimiento)}</div></div>
            <div style={{ gridColumn: '1 / -1' }}><span style={{ fontSize: 11, color: '#9ca3af' }}>Direccion</span><div style={{ fontSize: 14 }}>{detailAlumno.direccion || '-'}</div></div>
            <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Contacto emergencia</span><div style={{ fontSize: 14 }}>{detailAlumno.contacto_emergencia || '-'}</div></div>
            <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Tel. emergencia</span><div style={{ fontSize: 14 }}>{detailAlumno.telefono_emergencia || '-'}</div></div>
            <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Ingreso</span><div style={{ fontSize: 14 }}>{formatDate(detailAlumno.fecha_ingreso)}</div></div>
          </div>

          {/* Inscripciones + Cuotas */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>Inscripciones ({detailAlumno.inscripciones?.length || 0})</h4>
            <button onClick={() => { setShowInscribirModal(true); setInscribirClaseId(''); setError(''); }} style={{...btnSmall, background: '#000000'}}>
              + Inscribir en clase
            </button>
          </div>

          {detailAlumno.inscripciones && detailAlumno.inscripciones.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>
              {detailAlumno.inscripciones.map(ins => {
                const pagosIns = pagosPorInscripcion(ins.id);
                const isExpanded = expandedInscripcion === ins.id;
                const pendCount = pagosIns.filter(p => p.estado !== 'pagado').length;
                return (
                  <div key={ins.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    {/* Inscripción header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f9fafb', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 13 }}>{ins.clase?.nombre || `Clase #${ins.clase_id}`}</strong>
                        <span style={getEstadoBadge(ins.estado === 'confirmada' ? 'activo' : ins.estado === 'baja' ? 'suspendido' : 'pendiente')}>{ins.estado}</span>
                        {ins.clase?.costo_cuota && (
                          <span style={{ fontSize: 11, color: '#6b7280' }}>${Number(ins.clase.costo_cuota).toLocaleString('es-AR')}/mes</span>
                        )}
                        {pendCount > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 8 }}>
                            {pendCount} pago{pendCount > 1 ? 's' : ''} pendiente{pendCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { setSeguimientoModal(ins); setSeguimientoText(ins.seguimiento || ''); }}
                          style={{ padding: '3px 8px', background: ins.seguimiento ? '#ede9fe' : '#f3f4f6', color: ins.seguimiento ? '#7c3aed' : '#9ca3af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          {ins.seguimiento ? 'Seguimiento' : '+ Nota'}
                        </button>
                        {ins.estado !== 'baja' && (
                          <button onClick={() => { setGenerarCuotasModal(ins); setGenerarMeses([]); setGenerarMontoParcial(''); setGenerarUsaMontoParcial(false); setError(''); }}
                            style={{ padding: '3px 8px', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                            + Generar cuota
                          </button>
                        )}
                        <button onClick={() => setExpandedInscripcion(isExpanded ? null : ins.id)}
                          style={{ padding: '3px 8px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                          {isExpanded ? '▲ Ocultar' : `▼ Pagos (${pagosIns.length})`}
                        </button>
                      </div>
                    </div>

                    {/* Pagos de esta inscripción */}
                    {isExpanded && (
                      <div style={{ padding: '10px 14px', background: '#fff' }}>
                        {pagosIns.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>Sin pagos generados</div>
                        ) : (
                          pagosIns
                            .slice()
                            .sort((a, b) => {
                              if (a.tipo === 'matricula') return -1;
                              if (b.tipo === 'matricula') return 1;
                              return (a.periodo || '').localeCompare(b.periodo || '');
                            })
                            .map(p => <PagoRow key={p.id} p={p} />)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12 }}>Sin inscripciones</div>}

          {/* Pagos sin inscripción (matrícula manual, etc.) */}
          {pagosSinInscripcion.length > 0 && (
            <>
              <h4 style={{ marginBottom: 8, marginTop: 16, fontSize: 14 }}>Otros pagos</h4>
              {pagosSinInscripcion.map(p => <PagoRow key={p.id} p={p} />)}
            </>
          )}

          {/* Modal seguimiento */}
          {seguimientoModal && (
            <div style={modalOverlay}>
              <div style={{...modalContent, maxWidth: 500}}>
                <h3 style={{ marginTop: 0, fontSize: 16 }}>Seguimiento</h3>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
                  {getNombreAlumno(detailAlumno)} → {seguimientoModal.clase?.nombre || ''}
                </p>
                <textarea
                  style={{...inputStyle, minHeight: 150, resize: 'vertical', fontFamily: 'inherit'}}
                  value={seguimientoText}
                  onChange={e => setSeguimientoText(e.target.value)}
                  placeholder="Notas de seguimiento del alumno..."
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button onClick={() => setSeguimientoModal(null)} style={btnSecondary}>Cancelar</button>
                  <button onClick={handleGuardarSeguimiento} disabled={savingSeguimiento} style={btnPrimary}>
                    {savingSeguimiento ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Historial de estados */}
          {detailAlumno.historial_estados && detailAlumno.historial_estados.length > 0 && (
            <>
              <h4 style={{ marginBottom: 8, marginTop: 20, fontSize: 14 }}>Historial de estados</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detailAlumno.historial_estados.map(h => (
                  <div key={h.id} style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: '#9ca3af' }}>{formatDate(h.created_at)}</span>
                    <span style={getEstadoBadge(h.estado_anterior)}>{h.estado_anterior}</span>
                    <span>→</span>
                    <span style={getEstadoBadge(h.estado_nuevo)}>{h.estado_nuevo}</span>
                    {h.motivo && <span style={{ color: '#6b7280' }}>({h.motivo})</span>}
                    {h.responsable && <span style={{ color: '#9ca3af' }}>por {h.responsable.name}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Modal: inscribir en clase */}
        {showInscribirModal && (
          <div style={modalOverlay}>
            <div style={{...modalContent, maxWidth: 420}}>
              <h3 style={{ marginTop: 0 }}>Inscribir en clase</h3>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>Alumno: <strong>{getNombreAlumno(detailAlumno)}</strong></p>
              {error && <div style={errorBox}>{error}</div>}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Clase *</label>
                <select style={inputStyle} value={inscribirClaseId} onChange={e => setInscribirClaseId(e.target.value)}>
                  <option value="">Seleccionar clase...</option>
                  {clasesDisponibles.filter(c => c.estado !== 'finalizada').map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowInscribirModal(false); setError(''); }} style={btnSecondary}>Cancelar</button>
                <button onClick={handleInscribir} style={btnPrimary}>Inscribir</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: generar cuotas para inscripción */}
        {generarCuotasModal && (
          <div style={modalOverlay}>
            <div style={{...modalContent, maxWidth: 480}}>
              <h3 style={{ marginTop: 0 }}>Generar cuotas</h3>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 4px' }}>
                <strong>{getNombreAlumno(detailAlumno)}</strong> — {generarCuotasModal.clase?.nombre || `Clase #${generarCuotasModal.clase_id}`}
              </p>
              {generarCuotasModal.clase?.costo_cuota && (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px' }}>
                  Cuota base: ${Number(generarCuotasModal.clase.costo_cuota).toLocaleString('es-AR')}/mes
                </p>
              )}
              {error && <div style={errorBox}>{error}</div>}
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Seleccioná los meses a generar *</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {getMesesDisponibles().map(({ val, label }) => (
                    <button key={val} type="button"
                      onClick={() => toggleMesGenerar(val)}
                      style={{ padding: '4px 10px', borderRadius: 16, fontSize: 12, cursor: 'pointer', border: generarMeses.includes(val) ? '2px solid #7c3aed' : '1px solid #d1d5db', background: generarMeses.includes(val) ? '#ede9fe' : '#fff', color: generarMeses.includes(val) ? '#7c3aed' : '#374151', fontWeight: generarMeses.includes(val) ? 600 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={generarUsaMontoParcial} onChange={e => setGenerarUsaMontoParcial(e.target.checked)} />
                  Usar monto diferente al de la clase
                </label>
                {generarUsaMontoParcial && (
                  <input type="number" min="0" style={{...inputStyle, marginTop: 6}} placeholder="Monto ($)" value={generarMontoParcial} onChange={e => setGenerarMontoParcial(e.target.value)} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setGenerarCuotasModal(null); setError(''); }} style={btnSecondary}>Cancelar</button>
                <button onClick={handleGenerarCuotas} disabled={generarMeses.length === 0} style={{...btnPrimary, opacity: generarMeses.length === 0 ? 0.5 : 1}}>
                  Generar {generarMeses.length > 0 ? `(${generarMeses.length} mes${generarMeses.length > 1 ? 'es' : ''})` : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: ajustar monto de pago */}
        {ajustarPagoModal && (
          <div style={modalOverlay}>
            <div style={{...modalContent, maxWidth: 400}}>
              <h3 style={{ marginTop: 0 }}>Ajustar monto</h3>
              {error && <div style={errorBox}>{error}</div>}
              <div style={{ marginBottom: 12, padding: 10, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
                <strong>{formatConcepto(ajustarPagoModal)}</strong>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                  Monto original: ${Number(ajustarPagoModal.monto_original || 0).toLocaleString('es-AR')}
                  {parseFloat(ajustarPagoModal.monto_final) !== parseFloat(ajustarPagoModal.monto_original) && (
                    <span> · Actual: ${Number(ajustarPagoModal.monto_final || 0).toLocaleString('es-AR')}</span>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Nuevo monto *</label>
                <input type="number" min="0" style={inputStyle} value={ajustarMontoVal} onChange={e => setAjustarMontoVal(e.target.value)} placeholder="Ej: 15000" />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Notas (opcional)</label>
                <input style={inputStyle} value={ajustarNotasVal} onChange={e => setAjustarNotasVal(e.target.value)} placeholder="Motivo del ajuste..." />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setAjustarPagoModal(null); setError(''); }} style={btnSecondary}>Cancelar</button>
                <button onClick={handleAjustarMonto} style={btnPrimary}>Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: extender vencimiento */}
        {extenderPagoModal && (
          <div style={modalOverlay}>
            <div style={{...modalContent, maxWidth: 380}}>
              <h3 style={{ marginTop: 0 }}>Editar vencimiento</h3>
              {error && <div style={errorBox}>{error}</div>}
              <div style={{ marginBottom: 12, padding: 10, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
                <strong>{formatConcepto(extenderPagoModal)}</strong>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Vencimiento actual: {formatDate(extenderPagoModal.fecha_vencimiento)}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Nueva fecha de vencimiento *</label>
                <DateInput style={inputStyle} value={extenderFecha} onChange={e => setExtenderFecha(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setExtenderPagoModal(null); setError(''); }} style={btnSecondary}>Cancelar</button>
                <button onClick={handleExtenderVencimiento} style={btnPrimary}>Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Form modal (inside detail view) */}
        {showForm && (
          <div style={modalOverlay}>
            <div style={{...modalContent, maxWidth: 620}}>
              <h3 style={{ marginTop: 0 }}>{editingAlumno ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>
              {error && <div style={errorBox}>{error}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Nombre completo *</label>
                  <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
                </div>
                <div>
                  <label style={labelStyle}>Email *</label>
                  <input style={inputStyle} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </div>
                {!editingAlumno && (
                  <div>
                    <label style={labelStyle}>Contraseña</label>
                    <input style={inputStyle} type="password" placeholder="Dejar vacio = ateneo2026" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>DNI</label>
                  <input style={inputStyle} value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} />
                </div>
                <div>
                  <label style={labelStyle}>Telefono</label>
                  <input style={inputStyle} value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha de nacimiento</label>
                  <DateInput style={inputStyle} value={form.fecha_nacimiento} onChange={e => setForm({...form, fecha_nacimiento: e.target.value})} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Direccion</label>
                  <input style={inputStyle} value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})} />
                </div>
                <div>
                  <label style={labelStyle}>Contacto de emergencia</label>
                  <input style={inputStyle} value={form.contacto_emergencia} onChange={e => setForm({...form, contacto_emergencia: e.target.value})} />
                </div>
                <div>
                  <label style={labelStyle}>Tel. emergencia</label>
                  <input style={inputStyle} value={form.telefono_emergencia} onChange={e => setForm({...form, telefono_emergencia: e.target.value})} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => { setShowForm(false); setEditingAlumno(null); setError(''); }} style={btnSecondary}>Cancelar</button>
                <button onClick={handleSubmit} style={btnPrimary}>Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Estado modal (inside detail view) */}
        {showEstadoModal && (
          <div style={modalOverlay}>
            <div style={{...modalContent, maxWidth: 400}}>
              <h3 style={{ marginTop: 0 }}>Cambiar estado academico</h3>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
                Alumno: <strong>{getNombreAlumno(showEstadoModal)}</strong>
              </p>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Nuevo estado</label>
                <select style={inputStyle} value={estadoForm.estado} onChange={e => setEstadoForm({...estadoForm, estado: e.target.value})}>
                  <option value="">Seleccionar...</option>
                  {ESTADOS_ACADEMICOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Motivo (opcional)</label>
                <textarea style={{...inputStyle, minHeight: 60}} value={estadoForm.motivo} onChange={e => setEstadoForm({...estadoForm, motivo: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowEstadoModal(null)} style={btnSecondary}>Cancelar</button>
                <button onClick={handleEstadoChange} style={btnPrimary}>Confirmar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
          <input
            style={{...inputStyle, maxWidth: isMobile ? '100%' : 220}} placeholder="Buscar por nombre o email..."
            value={buscar} onChange={e => setBuscar(e.target.value)}
          />
          <select style={{...inputStyle, maxWidth: isMobile ? '100%' : 150}} value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); }}>
            <option value="">Todos los estados</option>
            {ESTADOS_ACADEMICOS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>{alumnos.length} alumnos</span>
        </div>
        <button onClick={() => { resetForm(); setEditingAlumno(null); setShowForm(true); }} style={btnPrimary}>
          Nuevo Alumno
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 620}}>
            <h3 style={{ marginTop: 0 }}>{editingAlumno ? 'Editar Alumno' : 'Nuevo Alumno'}</h3>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Nombre completo *</label>
                <input style={inputStyle} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
              </div>
              {!editingAlumno && (
                <div>
                  <label style={labelStyle}>Contraseña</label>
                  <input style={inputStyle} type="password" placeholder="Dejar vacio = ateneo2026" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                </div>
              )}
              <div>
                <label style={labelStyle}>DNI</label>
                <input style={inputStyle} value={form.dni} onChange={e => setForm({...form, dni: e.target.value})} />
              </div>
              <div>
                <label style={labelStyle}>Telefono</label>
                <input style={inputStyle} value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} />
              </div>
              <div>
                <label style={labelStyle}>Fecha de nacimiento</label>
                <DateInput style={inputStyle} value={form.fecha_nacimiento} onChange={e => setForm({...form, fecha_nacimiento: e.target.value})} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Direccion</label>
                <input style={inputStyle} value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})} />
              </div>
              <div>
                <label style={labelStyle}>Contacto de emergencia</label>
                <input style={inputStyle} value={form.contacto_emergencia} onChange={e => setForm({...form, contacto_emergencia: e.target.value})} />
              </div>
              <div>
                <label style={labelStyle}>Tel. emergencia</label>
                <input style={inputStyle} value={form.telefono_emergencia} onChange={e => setForm({...form, telefono_emergencia: e.target.value})} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setShowForm(false); setEditingAlumno(null); setError(''); }} style={btnSecondary}>Cancelar</button>
              <button onClick={handleSubmit} style={btnPrimary}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Estado modal */}
      {showEstadoModal && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 400}}>
            <h3 style={{ marginTop: 0 }}>Cambiar estado academico</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
              Alumno: <strong>{getNombreAlumno(showEstadoModal)}</strong>
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nuevo estado</label>
              <select style={inputStyle} value={estadoForm.estado} onChange={e => setEstadoForm({...estadoForm, estado: e.target.value})}>
                <option value="">Seleccionar...</option>
                {ESTADOS_ACADEMICOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Motivo (opcional)</label>
              <textarea style={{...inputStyle, minHeight: 60}} value={estadoForm.motivo} onChange={e => setEstadoForm({...estadoForm, motivo: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEstadoModal(null)} style={btnSecondary}>Cancelar</button>
              <button onClick={handleEstadoChange} style={btnPrimary}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table / Cards */}
      {alumnos.length === 0 ? (
        <div style={emptyState}>No hay alumnos registrados</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alumnos.map(a => (
            <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ cursor: 'pointer', color: '#7c3aed', fontSize: 14 }} onClick={() => handleOpenDetail(a)}>
                  {getNombreAlumno(a)}
                </strong>
                <span style={getEstadoBadge(a.estado_academico || 'pendiente')}>
                  {a.estado_academico || 'pendiente'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{a.usuario?.email || a.user?.email || '-'}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>DNI: {a.dni || '-'} · Clases: {a.clases_activas || 0}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleOpenDetail(a)} style={{...btnSmall, background: '#000000', flex: 1}}>Ver</button>
                <button onClick={() => { setShowEstadoModal(a); setEstadoForm({ estado: a.estado_academico || 'pendiente', motivo: '' }); }} style={{...btnSmall, background: '#000000', flex: 1}}>Estado</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={tableContainer}>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={thCell}>Nombre</th>
                <th style={thCell}>DNI</th>
                <th style={thCell}>Contacto</th>
                <th style={thCell}>Clases</th>
                <th style={thCell}>Estado</th>
                <th style={thCell}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map(a => (
                <tr key={a.id} style={trStyle}>
                  <td style={tdCell}>
                    <strong style={{ cursor: 'pointer', color: '#7c3aed' }} onClick={() => handleOpenDetail(a)}>
                      {getNombreAlumno(a)}
                    </strong>
                  </td>
                  <td style={tdCell}>{a.dni || '-'}</td>
                  <td style={tdCell}>
                    <div style={{ fontSize: '12px' }}>{a.usuario?.email || a.user?.email || '-'}</div>
                    <div style={{ fontSize: '11px', color: theme.colors.textMuted }}>{a.telefono || ''}</div>
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>{a.clases_activas || 0}</td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <span style={getEstadoBadge(a.estado_academico || 'pendiente')}>
                      {a.estado_academico || 'pendiente'}
                    </span>
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => handleOpenDetail(a)} style={{...btnSmall, background: '#000000'}}>Ver</button>
                      <button onClick={() => { setShowEstadoModal(a); setEstadoForm({ estado: a.estado_academico || 'pendiente', motivo: '' }); }} style={{...btnSmall, background: '#000000'}}>Estado</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// INSCRIPCIONES TAB
// ============================================================
function InscripcionesTab({ token }) {
  const isMobile = getIsMobile();
  const [inscripciones, setInscripciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroClase, setFiltroClase] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [buscar, setBuscar] = useState('');
  const [clases, setClases] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [showInscribir, setShowInscribir] = useState(false);
  const [inscribirForm, setInscribirForm] = useState({ alumno_id: '', clase_id: '' });
  const [showBajaModal, setShowBajaModal] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [error, setError] = useState('');
  const [seguimientoModal, setSeguimientoModal] = useState(null);
  const [seguimientoText, setSeguimientoText] = useState('');
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);

  useEffect(() => { loadInscripciones(true); loadClasesYAlumnos(); }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadInscripciones(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [filtroClase, filtroEstado, buscar]);

  const loadInscripciones = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroClase) params.set('clase_id', filtroClase);
      if (filtroEstado) params.set('estado', filtroEstado);
      if (buscar) params.set('buscar', buscar);
      const res = await apiAuthFetch(`/api/ateneo/inscripciones?${params}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setInscripciones(data.inscripciones || data || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadClasesYAlumnos = async () => {
    try {
      const [cRes, aRes] = await Promise.all([
        apiAuthFetch('/api/ateneo/clases', {}, token),
        apiAuthFetch('/api/ateneo/alumnos', {}, token)
      ]);
      if (cRes.ok) { const d = await cRes.json(); setClases(d.clases || d || []); }
      if (aRes.ok) { const d = await aRes.json(); setAlumnos(sortAlumnos(d.alumnos || d || [])); }
    } catch (err) { console.error(err); }
  };

  const handleConfirmar = async (id) => {
    try {
      const res = await apiAuthFetch(`/api/ateneo/inscripciones/${id}/confirmar`, { method: 'PUT' }, token);
      if (res.ok) loadInscripciones();
    } catch (err) { console.error(err); }
  };

  const handleBaja = async () => {
    if (!showBajaModal) return;
    try {
      const res = await apiAuthFetch(`/api/ateneo/inscripciones/${showBajaModal.id}/baja`, {
        method: 'PUT', body: JSON.stringify({ motivo: motivoBaja || 'Baja por admin' })
      }, token);
      if (res.ok) { setShowBajaModal(null); setMotivoBaja(''); loadInscripciones(); }
    } catch (err) { console.error(err); }
  };

  const handleGuardarSeguimiento = async () => {
    if (!seguimientoModal) return;
    setSavingSeguimiento(true);
    try {
      const res = await apiAuthFetch(`/api/ateneo/inscripciones/${seguimientoModal.id}/seguimiento`, {
        method: 'PUT', body: JSON.stringify({ seguimiento: seguimientoText })
      }, token);
      if (res.ok) {
        setInscripciones(prev => prev.map(i => i.id === seguimientoModal.id ? { ...i, seguimiento: seguimientoText } : i));
        setSeguimientoModal(null);
      }
    } catch (err) { console.error(err); }
    finally { setSavingSeguimiento(false); }
  };

  const handleInscribir = async () => {
    if (!inscribirForm.alumno_id || !inscribirForm.clase_id) { setError('Selecciona alumno y clase'); return; }
    setError('');
    try {
      const res = await apiAuthFetch('/api/ateneo/inscripciones', {
        method: 'POST', body: JSON.stringify(inscribirForm)
      }, token);
      if (res.ok) {
        setShowInscribir(false);
        setInscribirForm({ alumno_id: '', clase_id: '' });
        loadInscripciones();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al inscribir');
      }
    } catch (err) { setError('Error de conexion'); }
  };

  const getEstadoBadge = (estado) => {
    const styles = {
      confirmada: { bg: '#d1fae5', color: '#059669' },
      pendiente: { bg: '#fef3c7', color: '#d97706' },
      baja: { bg: '#fee2e2', color: '#dc2626' }
    };
    const s = styles[estado] || styles.pendiente;
    return { padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color };
  };

  if (loading) return <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
          <input
            style={{ ...inputStyle, maxWidth: isMobile ? '100%' : 220 }}
            placeholder="Buscar por alumno o clase..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
          />
          <select style={{...inputStyle, maxWidth: isMobile ? '48%' : 180}} value={filtroClase} onChange={e => setFiltroClase(e.target.value)}>
            <option value="">Todas las clases</option>
            {clases.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select style={{...inputStyle, maxWidth: isMobile ? '48%' : 140}} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="baja">Baja</option>
          </select>
          <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>{inscripciones.length} inscripciones</span>
        </div>
        <button onClick={() => { setInscribirForm({ alumno_id: '', clase_id: '' }); setError(''); setShowInscribir(true); }} style={btnPrimary}>
          Inscribir alumno
        </button>
      </div>

      {/* Modal inscribir */}
      {showInscribir && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 420}}>
            <h3 style={{ marginTop: 0 }}>Inscribir alumno a clase</h3>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Alumno *</label>
              <select style={inputStyle} value={inscribirForm.alumno_id} onChange={e => setInscribirForm({...inscribirForm, alumno_id: e.target.value})}>
                <option value="">Seleccionar alumno...</option>
                {alumnos.map(a => <option key={a.id} value={a.id}>{getNombreAlumno(a)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Clase *</label>
              <select style={inputStyle} value={inscribirForm.clase_id} onChange={e => setInscribirForm({...inscribirForm, clase_id: e.target.value})}>
                <option value="">Seleccionar clase...</option>
                {clases.filter(c => c.estado === 'activa').map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} (cupo: {c.cupo})</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInscribir(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={handleInscribir} style={btnPrimary}>Inscribir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal baja */}
      {showBajaModal && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 400}}>
            <h3 style={{ marginTop: 0 }}>Dar de baja inscripcion</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
              {getNombreAlumno(showBajaModal.alumno)} → {showBajaModal.clase?.nombre}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Motivo (opcional)</label>
              <textarea style={{...inputStyle, minHeight: 60}} value={motivoBaja} onChange={e => setMotivoBaja(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowBajaModal(null); setMotivoBaja(''); }} style={btnSecondary}>Cancelar</button>
              <button onClick={handleBaja} style={{...btnPrimary, background: '#dc2626'}}>Confirmar baja</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal seguimiento */}
      {seguimientoModal && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 500}}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Seguimiento</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
              {getNombreAlumno(seguimientoModal.alumno)} → {seguimientoModal.clase?.nombre || ''}
            </p>
            <textarea
              style={{...inputStyle, minHeight: 150, resize: 'vertical', fontFamily: 'inherit'}}
              value={seguimientoText}
              onChange={e => setSeguimientoText(e.target.value)}
              placeholder="Notas de seguimiento del alumno..."
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setSeguimientoModal(null)} style={btnSecondary}>Cancelar</button>
              <button onClick={handleGuardarSeguimiento} disabled={savingSeguimiento} style={btnPrimary}>
                {savingSeguimiento ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table / Cards */}
      {inscripciones.length === 0 ? (
        <div style={emptyState}>No hay inscripciones registradas</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inscripciones.map(i => (
            <div key={i.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>{getNombreAlumno(i.alumno)}</strong>
                <span style={getEstadoBadge(i.estado || 'pendiente')}>{i.estado || 'pendiente'}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{i.clase?.nombre || `#${i.clase_id}`}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{formatDate(i.fecha_inscripcion || i.created_at)}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setSeguimientoModal(i); setSeguimientoText(i.seguimiento || ''); }} style={{ padding: '4px 10px', background: i.seguimiento ? '#ede9fe' : '#f3f4f6', color: i.seguimiento ? '#7c3aed' : '#9ca3af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, flex: 1 }}>
                  {i.seguimiento ? 'Seguimiento' : '+ Seguimiento'}
                </button>
                {i.estado === 'pendiente' && (
                  <button onClick={() => handleConfirmar(i.id)} style={{...btnSmall, background: '#000000', flex: 1}}>Confirmar</button>
                )}
                {(i.estado === 'pendiente' || i.estado === 'confirmada') && (
                  <button onClick={() => setShowBajaModal(i)} style={{...btnSmall, background: '#dc2626', flex: 1}}>Baja</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={tableContainer}>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={thCell}>Alumno</th>
                <th style={thCell}>Clase</th>
                <th style={thCell}>Estado</th>
                <th style={thCell}>Fecha</th>
                <th style={thCell}>Seguimiento</th>
                <th style={thCell}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {inscripciones.map(i => (
                <tr key={i.id} style={trStyle}>
                  <td style={tdCell}>{getNombreAlumno(i.alumno)}</td>
                  <td style={tdCell}>{i.clase?.nombre || `#${i.clase_id}`}</td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <span style={getEstadoBadge(i.estado || 'pendiente')}>
                      {i.estado || 'pendiente'}
                    </span>
                  </td>
                  <td style={tdCell}>{formatDate(i.fecha_inscripcion || i.created_at)}</td>
                  <td style={tdCell}>
                    <button onClick={() => { setSeguimientoModal(i); setSeguimientoText(i.seguimiento || ''); }} style={{ padding: '3px 10px', background: i.seguimiento ? '#ede9fe' : '#f3f4f6', color: i.seguimiento ? '#7c3aed' : '#9ca3af', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                      {i.seguimiento ? 'Ver/Editar' : 'Agregar'}
                    </button>
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {i.estado === 'pendiente' && (
                        <button onClick={() => handleConfirmar(i.id)} style={{...btnSmall, background: '#000000'}}>Confirmar</button>
                      )}
                      {(i.estado === 'pendiente' || i.estado === 'confirmada') && (
                        <button onClick={() => setShowBajaModal(i)} style={{...btnSmall, background: '#dc2626'}}>Baja</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PAGOS TAB
// ============================================================
function PagosTab({ token }) {
  const isMobile = getIsMobile();
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroClase, setFiltroClase] = useState('');
  const [filtroMes, setFiltroMes] = useState(false);
  const [buscarPagos, setBuscarPagos] = useState('');
  const [filtroTipoPago, setFiltroTipoPago] = useState('');
  const [clases, setClases] = useState([]);
  const [showPagoManual, setShowPagoManual] = useState(null);
  const [pagoManualForm, setPagoManualForm] = useState({ origen: 'efectivo', notas: '' });
  const [showAjustarMonto, setShowAjustarMonto] = useState(null);
  const [ajustarForm, setAjustarForm] = useState({ monto_final: '', notas: '' });
  const [extendingPagoId, setExtendingPagoId] = useState(null);
  const [extendFecha, setExtendFecha] = useState('');
  const [showGenerarCuotas, setShowGenerarCuotas] = useState(false);
  const [generarForm, setGenerarForm] = useState({ clase_id: '', meses: [], cuota_parcial: false, monto_parcial: '' });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadPagos(undefined, true); loadClases(); }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadPagos(undefined, false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [buscarPagos, filtroTipoPago, filtroEstado, filtroClase]);

  const loadPagos = async (mesActual, showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado) params.set('estado', filtroEstado);
      if (filtroClase) params.set('clase_id', filtroClase);
      if (filtroTipoPago) params.set('tipo', filtroTipoPago);
      if (buscarPagos) params.set('buscar', buscarPagos);
      const useMes = mesActual !== undefined ? mesActual : filtroMes;
      if (useMes) {
        const now = new Date();
        const desde = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const hasta = now.toISOString().split('T')[0];
        params.set('desde', desde);
        params.set('hasta', hasta);
      }
      const res = await apiAuthFetch(`/api/ateneo/pagos?${params}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setPagos(data.pagos || data || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadClases = async () => {
    try {
      const res = await apiAuthFetch('/api/ateneo/clases', {}, token);
      if (res.ok) { const d = await res.json(); setClases(d.clases || d || []); }
    } catch (err) { console.error(err); }
  };

  const handleRegistrarPago = async () => {
    if (!showPagoManual) return;
    setError('');
    try {
      const res = await apiAuthFetch('/api/ateneo/pagos/manual', {
        method: 'POST',
        body: JSON.stringify({ pago_id: showPagoManual.id, ...pagoManualForm })
      }, token);
      if (res.ok) {
        setShowPagoManual(null);
        setPagoManualForm({ origen: 'efectivo', notas: '' });
        setSuccessMsg('Pago registrado correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadPagos();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al registrar pago');
      }
    } catch (err) { setError('Error de conexion'); }
  };

  const handleExtenderVencimiento = async (pagoId) => {
    if (!extendFecha) { setError('Selecciona una fecha'); return; }
    setError('');
    try {
      const res = await apiAuthFetch(`/api/ateneo/pagos/${pagoId}/extender-vencimiento`, {
        method: 'PUT',
        body: JSON.stringify({ fecha_vencimiento: extendFecha })
      }, token);
      if (res.ok) {
        setExtendingPagoId(null);
        setExtendFecha('');
        setSuccessMsg('Vencimiento extendido correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadPagos();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al extender vencimiento');
      }
    } catch (err) { setError('Error de conexion'); }
  };

  const handleAjustarMonto = async () => {
    if (!showAjustarMonto) return;
    if (ajustarForm.monto_final === '' || parseFloat(ajustarForm.monto_final) < 0) {
      setError('Ingresa un monto válido');
      return;
    }
    setError('');
    try {
      const res = await apiAuthFetch(`/api/ateneo/pagos/${showAjustarMonto.id}/ajustar`, {
        method: 'PUT',
        body: JSON.stringify({ monto_final: parseFloat(ajustarForm.monto_final), notas: ajustarForm.notas })
      }, token);
      if (res.ok) {
        setShowAjustarMonto(null);
        setAjustarForm({ monto_final: '', notas: '' });
        setSuccessMsg('Monto ajustado correctamente');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadPagos();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al ajustar monto');
      }
    } catch (err) { setError('Error de conexion'); }
  };

  const handleGenerarCuotas = async () => {
    if (!generarForm.clase_id || generarForm.meses.length === 0) {
      setError('Selecciona clase y al menos un mes');
      return;
    }
    if (generarForm.cuota_parcial && (!generarForm.monto_parcial || parseFloat(generarForm.monto_parcial) <= 0)) {
      setError('Ingresa un monto valido para la cuota parcial');
      return;
    }
    setError('');
    try {
      const body = { clase_id: generarForm.clase_id, meses: generarForm.meses };
      if (generarForm.cuota_parcial && generarForm.monto_parcial) {
        body.monto_parcial = parseFloat(generarForm.monto_parcial);
      }
      const res = await apiAuthFetch('/api/ateneo/pagos/generar-cuotas', {
        method: 'POST',
        body: JSON.stringify(body)
      }, token);
      if (res.ok) {
        const data = await res.json();
        setShowGenerarCuotas(false);
        setGenerarForm({ clase_id: '', meses: [], cuota_parcial: false, monto_parcial: '' });
        setSuccessMsg(data.message || 'Cuotas generadas');
        setTimeout(() => setSuccessMsg(''), 3000);
        loadPagos();
      } else {
        const data = await res.json();
        setError(data.error || 'Error al generar cuotas');
      }
    } catch (err) { setError('Error de conexion'); }
  };

  const toggleMes = (mes) => {
    setGenerarForm(prev => ({
      ...prev,
      meses: prev.meses.includes(mes) ? prev.meses.filter(m => m !== mes) : [...prev.meses, mes]
    }));
  };

  const getMesesDisponibles = () => {
    const meses = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = formatMonthYear(d);
      meses.push({ val, label });
    }
    return meses;
  };

  const getEstadoBadge = (estado) => {
    const styles = {
      pagado: { bg: '#d1fae5', color: '#059669' },
      pendiente: { bg: '#fef3c7', color: '#d97706' },
      vencido: { bg: '#fee2e2', color: '#dc2626' },
      anulado: { bg: '#f3f4f6', color: '#6b7280' }
    };
    const s = styles[estado] || styles.pendiente;
    return { padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color };
  };

  // Stats
  const stats = {
    pendientes: pagos.filter(p => p.estado === 'pendiente').length,
    vencidos: pagos.filter(p => p.estado === 'vencido').length,
    pagados: pagos.filter(p => p.estado === 'pagado').length,
    totalPendiente: pagos.filter(p => p.estado === 'pendiente').reduce((s, p) => s + parseFloat(p.monto_final || 0), 0),
    totalVencido: pagos.filter(p => p.estado === 'vencido').reduce((s, p) => s + parseFloat(p.monto_final || 0), 0)
  };

  if (loading) return <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>;

  return (
    <div>
      {successMsg && <div style={{ padding: '8px 16px', background: '#d1fae5', color: '#059669', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{successMsg}</div>}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ padding: '10px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: 11, color: '#166534' }}>Pagados</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>{stats.pagados}</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 11, color: '#854d0e' }}>Pendientes</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{stats.pendientes}</div>
          {stats.totalPendiente > 0 && <div style={{ fontSize: 11, color: '#d97706' }}>${stats.totalPendiente.toLocaleString('es-AR')}</div>}
        </div>
        {stats.vencidos > 0 && (
          <div style={{ padding: '10px 16px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
            <div style={{ fontSize: 11, color: '#991b1b' }}>Vencidos</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{stats.vencidos}</div>
            <div style={{ fontSize: 11, color: '#dc2626' }}>${stats.totalVencido.toLocaleString('es-AR')}</div>
          </div>
        )}
      </div>

      {/* Filters + actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: theme.spacing.md, gap: 8, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap', minWidth: 0, flexDirection: isMobile ? 'column' : 'row' }}>
          <input
            style={{ ...inputStyle, width: isMobile ? '100%' : undefined, maxWidth: isMobile ? '100%' : 220 }}
            placeholder="Buscar por nombre o email..."
            value={buscarPagos}
            onChange={e => setBuscarPagos(e.target.value)}
          />
          <select style={{...inputStyle, width: isMobile ? '100%' : undefined, maxWidth: isMobile ? '100%' : 180}} value={filtroClase} onChange={e => setFiltroClase(e.target.value)}>
            <option value="">Todas las clases</option>
            {clases.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select style={{...inputStyle, width: isMobile ? '100%' : undefined, maxWidth: isMobile ? '100%' : 140}} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencido">Vencido</option>
            <option value="pagado">Pagado</option>
          </select>
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : undefined }}>
            <select style={{...inputStyle, flex: isMobile ? 1 : undefined, maxWidth: isMobile ? undefined : 140}} value={filtroTipoPago} onChange={e => setFiltroTipoPago(e.target.value)}>
              <option value="">Todo</option>
              <option value="matricula">Matrícula</option>
              <option value="cuota">Cuota</option>
            </select>
            <button onClick={() => { setFiltroMes(!filtroMes); loadPagos(!filtroMes); }} style={{
              ...btnSecondary,
              flex: isMobile ? 1 : undefined,
              background: filtroMes ? '#7c3aed' : undefined,
              color: filtroMes ? '#fff' : undefined,
              border: filtroMes ? '1px solid #7c3aed' : undefined
            }}>Este mes</button>
          </div>
          <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>{pagos.length} pagos</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={async () => {
            try {
              const res = await apiAuthFetch('/api/ateneo/pagos/recalcular-estados', { method: 'POST' }, token);
              const data = await res.json();
              if (res.ok) {
                setSuccessMsg(`${data.pagos_vencidos} pagos vencidos, ${data.estados_cambiados} estados actualizados`);
                setTimeout(() => setSuccessMsg(''), 4000);
                loadPagos();
              } else { setError(data.error || 'Error'); }
            } catch (err) { setError('Error de conexion'); }
          }} style={btnSecondary}>
            Recalcular estados
          </button>
          <button onClick={() => { setGenerarForm({ clase_id: '', meses: [], cuota_parcial: false, monto_parcial: '' }); setError(''); setShowGenerarCuotas(true); }} style={btnPrimary}>
            Generar cuotas
          </button>
        </div>
      </div>

      {/* Modal registrar pago manual */}
      {showPagoManual && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 420}}>
            <h3 style={{ marginTop: 0 }}>Registrar pago manual</h3>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ marginBottom: 12, padding: 12, background: '#f9fafb', borderRadius: 6 }}>
              <div style={{ fontSize: 13 }}><strong>{getNombreAlumno(showPagoManual.alumno)}</strong></div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {formatConcepto(showPagoManual)}
                {showPagoManual.clase && ` - ${showPagoManual.clase.nombre}`}
              </div>
              {esCuotaVencida(showPagoManual) ? (
                <div style={{ marginTop: 4 }}>
                  <span style={{ textDecoration: 'line-through', color: '#dc2626', fontSize: 14 }}>${Number(showPagoManual.monto_final || 0).toLocaleString('es-AR')}</span>
                  {' '}<span style={{ fontSize: 16, fontWeight: 700 }}>${montoConRecargo(showPagoManual).toLocaleString('es-AR')}</span>
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 500, marginTop: 2 }}>Incluye 15% de recargo por pago vencido</div>
                </div>
              ) : (
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>${Number(showPagoManual.monto_final || 0).toLocaleString('es-AR')}</div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Medio de pago</label>
              <select style={inputStyle} value={pagoManualForm.origen} onChange={e => setPagoManualForm({...pagoManualForm, origen: e.target.value})}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="debito">Debito</option>
                <option value="credito">Credito</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Notas (opcional)</label>
              <textarea style={{...inputStyle, minHeight: 50}} value={pagoManualForm.notas} onChange={e => setPagoManualForm({...pagoManualForm, notas: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowPagoManual(null); setError(''); }} style={btnSecondary}>Cancelar</button>
              <button onClick={handleRegistrarPago} style={btnPrimary}>Registrar pago</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajustar monto */}
      {showAjustarMonto && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 420}}>
            <h3 style={{ marginTop: 0 }}>Ajustar monto de cuota</h3>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ marginBottom: 12, padding: 12, background: '#f9fafb', borderRadius: 6 }}>
              <div style={{ fontSize: 13 }}><strong>{getNombreAlumno(showAjustarMonto.alumno)}</strong></div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {formatConcepto(showAjustarMonto)}
                {showAjustarMonto.clase && ` - ${showAjustarMonto.clase.nombre}`}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                Monto original: <strong>${Number(showAjustarMonto.monto_original || 0).toLocaleString('es-AR')}</strong>
                {parseFloat(showAjustarMonto.monto_final) !== parseFloat(showAjustarMonto.monto_original) && (
                  <span> · Monto actual: <strong>${Number(showAjustarMonto.monto_final || 0).toLocaleString('es-AR')}</strong></span>
                )}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nuevo monto *</label>
              <input type="number" min="0" step="0.01" style={inputStyle} placeholder="Ej: 15000"
                value={ajustarForm.monto_final} onChange={e => setAjustarForm({...ajustarForm, monto_final: e.target.value})} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Motivo (opcional)</label>
              <textarea style={{...inputStyle, minHeight: 50}} placeholder="Ej: Inscripción a mitad de mes"
                value={ajustarForm.notas} onChange={e => setAjustarForm({...ajustarForm, notas: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAjustarMonto(null); setError(''); }} style={btnSecondary}>Cancelar</button>
              <button onClick={handleAjustarMonto} style={btnPrimary}>Aplicar ajuste</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal generar cuotas */}
      {showGenerarCuotas && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 480}}>
            <h3 style={{ marginTop: 0 }}>Generar cuotas mensuales</h3>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>
              Se generaran cuotas para todos los alumnos con inscripcion confirmada en la clase seleccionada.
            </p>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Clase *</label>
              <select style={inputStyle} value={generarForm.clase_id} onChange={e => setGenerarForm({...generarForm, clase_id: e.target.value})}>
                <option value="">Seleccionar clase...</option>
                {clases.filter(c => c.estado === 'activa').map(c => (
                  <option key={c.id} value={c.id}>{c.nombre} (${Number(c.costo_cuota || 0).toLocaleString('es-AR')}/mes)</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Meses *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {getMesesDisponibles().map(m => (
                  <button key={m.val} type="button" onClick={() => toggleMes(m.val)} style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid',
                    cursor: 'pointer', fontWeight: 500,
                    background: generarForm.meses.includes(m.val) ? '#7c3aed' : '#fff',
                    color: generarForm.meses.includes(m.val) ? '#fff' : '#374151',
                    borderColor: generarForm.meses.includes(m.val) ? '#7c3aed' : '#d1d5db'
                  }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={generarForm.cuota_parcial} onChange={e => {
                  const checked = e.target.checked;
                  setGenerarForm(prev => ({ ...prev, cuota_parcial: checked, monto_parcial: checked ? prev.monto_parcial : '' }));
                }} />
                Cuota parcial
              </label>
              {generarForm.cuota_parcial && (
                <div style={{ marginTop: 8 }}>
                  <label style={labelStyle}>Monto de la cuota parcial *</label>
                  <input type="number" min="0" step="0.01" style={inputStyle} placeholder="Ej: 15000"
                    value={generarForm.monto_parcial} onChange={e => setGenerarForm(prev => ({ ...prev, monto_parcial: e.target.value }))} />
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    Se usara este monto en lugar del costo mensual definido en la clase.
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowGenerarCuotas(false); setError(''); }} style={btnSecondary}>Cancelar</button>
              <button onClick={handleGenerarCuotas} style={btnPrimary}>Generar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table / Cards */}
      {pagos.length === 0 ? (
        <div style={emptyState}>No hay pagos registrados</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pagos.map(p => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{getNombreAlumno(p.alumno)}</strong>
                <span style={getEstadoBadge(p.estado || 'pendiente')}>{p.estado || 'pendiente'}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{p.clase?.nombre || '-'} · {formatConcepto(p)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>
                  {esCuotaVencida(p) ? (
                    <><span style={{ textDecoration: 'line-through', color: '#dc2626', fontSize: 12, marginRight: 4 }}>${Number(p.monto_final || 0).toLocaleString('es-AR')}</span>${montoConRecargo(p).toLocaleString('es-AR')}</>
                  ) : `$${Number(p.monto_final || 0).toLocaleString('es-AR')}`}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>Vence: {formatDate(p.fecha_vencimiento)}</div>
                  {esCuotaVencida(p) && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>+15% recargo</div>}
                  {(p.estado === 'pendiente' || p.estado === 'vencido') && extendingPagoId !== p.id && (
                    <button onClick={() => { setExtendingPagoId(p.id); setExtendFecha(p.fecha_vencimiento ? p.fecha_vencimiento.substring(0, 10) : ''); }} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 500 }}>Extender</button>
                  )}
                </div>
              </div>
              {(p.estado === 'pendiente' || p.estado === 'vencido') && extendingPagoId === p.id && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <DateInput value={extendFecha} onChange={e => setExtendFecha(e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: '4px 6px', flex: 1 }} />
                  <button onClick={() => handleExtenderVencimiento(p.id)} style={{ ...btnSmall, background: '#000000', fontSize: 11, padding: '4px 8px' }}>Guardar</button>
                  <button onClick={() => { setExtendingPagoId(null); setExtendFecha(''); }} style={{ ...btnSmall, background: '#6b7280', fontSize: 11, padding: '4px 8px' }}>Cancelar</button>
                </div>
              )}
              {(p.estado === 'pendiente' || p.estado === 'vencido') && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => { setShowPagoManual(p); setPagoManualForm({ origen: 'efectivo', notas: '' }); setError(''); }} style={{...btnSmall, background: '#000000', flex: 1, padding: '6px 12px'}}>
                    Cobrar
                  </button>
                  <button onClick={() => { setShowAjustarMonto(p); setAjustarForm({ monto_final: p.monto_final, notas: '' }); setError(''); }} style={{...btnSmall, background: '#000000', flex: 1, padding: '6px 12px'}}>
                    Ajustar
                  </button>
                </div>
              )}
              {p.estado === 'pagado' && p.fecha_pago && (
                <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'center' }}>Pagado {formatDate(p.fecha_pago)}{p.origen && ` (${p.origen})`}</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={tableContainer}>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={thCell}>Alumno</th>
                <th style={thCell}>Clase</th>
                <th style={thCell}>Concepto</th>
                <th style={thCell}>Monto</th>
                <th style={thCell}>Estado</th>
                <th style={thCell}>Vencimiento</th>
                <th style={thCell}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map(p => (
                <tr key={p.id} style={trStyle}>
                  <td style={tdCell}>{getNombreAlumno(p.alumno)}</td>
                  <td style={tdCell}>{p.clase?.nombre || '-'}</td>
                  <td style={tdCell}>{formatConcepto(p)}</td>
                  <td style={tdCell}>
                    {esCuotaVencida(p) ? (
                      <>
                        <span style={{ textDecoration: 'line-through', color: '#dc2626', fontSize: 11 }}>${Number(p.monto_final || 0).toLocaleString('es-AR')}</span>
                        {' '}<strong>${montoConRecargo(p).toLocaleString('es-AR')}</strong>
                      </>
                    ) : (
                      <>
                        <div>${Number(p.monto_final || 0).toLocaleString('es-AR')}</div>
                        {p.monto_original && parseFloat(p.monto_original) !== parseFloat(p.monto_final) && (
                          <div style={{ fontSize: 10, color: '#9ca3af', textDecoration: 'line-through' }}>${Number(p.monto_original).toLocaleString('es-AR')}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <span style={getEstadoBadge(p.estado || 'pendiente')}>{p.estado || 'pendiente'}</span>
                  </td>
                  <td style={tdCell}>
                    {formatDate(p.fecha_vencimiento)}
                    {esCuotaVencida(p) && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>Pago vencido, 15% de recargo</div>}
                    {(p.estado === 'pendiente' || p.estado === 'vencido') && (
                      extendingPagoId === p.id ? (
                        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <DateInput value={extendFecha} onChange={e => setExtendFecha(e.target.value)} style={{ ...inputStyle, fontSize: 11, padding: '3px 6px' }} />
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleExtenderVencimiento(p.id)} style={{ ...btnSmall, background: '#000000', fontSize: 10, padding: '2px 6px' }}>Guardar</button>
                            <button onClick={() => { setExtendingPagoId(null); setExtendFecha(''); }} style={{ ...btnSmall, background: '#6b7280', fontSize: 10, padding: '2px 6px' }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 2 }}>
                          <button onClick={() => { setExtendingPagoId(p.id); setExtendFecha(p.fecha_vencimiento ? p.fecha_vencimiento.substring(0, 10) : ''); }} style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 500 }}>Extender</button>
                        </div>
                      )
                    )}
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    {(p.estado === 'pendiente' || p.estado === 'vencido') && (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => { setShowPagoManual(p); setPagoManualForm({ origen: 'efectivo', notas: '' }); setError(''); }} style={{...btnSmall, background: '#000000'}}>
                          Cobrar
                        </button>
                        <button onClick={() => { setShowAjustarMonto(p); setAjustarForm({ monto_final: p.monto_final, notas: '' }); setError(''); }} style={{...btnSmall, background: '#000000'}}>
                          Ajustar
                        </button>
                      </div>
                    )}
                    {p.estado === 'pagado' && p.fecha_pago && (
                      <span style={{ fontSize: 10, color: '#6b7280' }}>
                        {formatDate(p.fecha_pago)}
                        {p.origen && ` (${p.origen})`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BECAS TAB
// ============================================================
function BecasTab({ token }) {
  const isMobile = getIsMobile();
  const [becas, setBecas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alumnos, setAlumnos] = useState([]);
  const [clases, setClases] = useState([]);
  const [showCrear, setShowCrear] = useState(false);
  const [form, setForm] = useState({ alumno_id: '', clase_id: '', tipo: 'porcentaje', valor: '', motivo: '', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '' });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadBecas(); loadAlumnosYClases(); }, []);

  const loadBecas = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/ateneo/becas', {}, token);
      if (res.ok) { const data = await res.json(); setBecas(data.becas || data || []); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadAlumnosYClases = async () => {
    try {
      const [aRes, cRes] = await Promise.all([
        apiAuthFetch('/api/ateneo/alumnos', {}, token),
        apiAuthFetch('/api/ateneo/clases', {}, token)
      ]);
      if (aRes.ok) { const d = await aRes.json(); setAlumnos(sortAlumnos(d.alumnos || d || [])); }
      if (cRes.ok) { const d = await cRes.json(); setClases(d.clases || d || []); }
    } catch (err) { console.error(err); }
  };

  const handleCrear = async () => {
    if (!form.alumno_id || !form.tipo || !form.fecha_inicio) { setError('Alumno, tipo y fecha inicio son requeridos'); return; }
    if (form.tipo !== 'exencion_matricula' && !form.valor) { setError('Valor es requerido'); return; }
    setError('');
    try {
      const res = await apiAuthFetch('/api/ateneo/becas', {
        method: 'POST', body: JSON.stringify({ ...form, valor: form.tipo === 'exencion_matricula' ? 100 : parseFloat(form.valor), clase_id: form.clase_id || null, fecha_fin: form.fecha_fin || null })
      }, token);
      if (res.ok) {
        setShowCrear(false);
        setForm({ alumno_id: '', clase_id: '', tipo: 'porcentaje', valor: '', motivo: '', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '' });
        setSuccessMsg('Beca creada'); setTimeout(() => setSuccessMsg(''), 3000);
        loadBecas();
      } else { const d = await res.json(); setError(d.error || 'Error'); }
    } catch (err) { setError('Error de conexion'); }
  };

  const handleToggle = async (beca) => {
    try {
      if (beca.activa) {
        await apiAuthFetch(`/api/ateneo/becas/${beca.id}`, { method: 'DELETE' }, token);
      } else {
        await apiAuthFetch(`/api/ateneo/becas/${beca.id}`, { method: 'PUT', body: JSON.stringify({ activa: true }) }, token);
      }
      loadBecas();
    } catch (err) { console.error(err); }
  };

  const tipoLabel = (t) => ({ porcentaje: 'Porcentaje', monto_fijo: 'Monto fijo', exencion_matricula: 'Exención matrícula' }[t] || t);
  const valorLabel = (b) => b.tipo === 'porcentaje' ? `${b.valor}%` : b.tipo === 'exencion_matricula' ? 'Total' : `$${Number(b.valor || 0).toLocaleString('es-AR')}`;

  if (loading) return <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>;

  return (
    <div>
      {successMsg && <div style={{ padding: '8px 16px', background: '#d1fae5', color: '#059669', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{successMsg}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
        <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>{becas.length} becas</span>
        <button onClick={() => { setForm({ alumno_id: '', clase_id: '', tipo: 'porcentaje', valor: '', motivo: '', fecha_inicio: new Date().toISOString().split('T')[0], fecha_fin: '' }); setError(''); setShowCrear(true); }} style={btnPrimary}>
          Nueva beca
        </button>
      </div>

      {/* Modal crear beca */}
      {showCrear && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 480}}>
            <h3 style={{ marginTop: 0 }}>Nueva beca</h3>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Alumno *</label>
              <select style={inputStyle} value={form.alumno_id} onChange={e => setForm({...form, alumno_id: e.target.value})}>
                <option value="">Seleccionar...</option>
                {alumnos.map(a => <option key={a.id} value={a.id}>{getNombreAlumno(a)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Clase (vacío = todas)</label>
              <select style={inputStyle} value={form.clase_id} onChange={e => setForm({...form, clase_id: e.target.value})}>
                <option value="">Todas las clases</option>
                {clases.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Tipo *</label>
                <select style={inputStyle} value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value, valor: e.target.value === 'exencion_matricula' ? '100' : form.valor})}>
                  <option value="porcentaje">Porcentaje</option>
                  <option value="monto_fijo">Monto fijo</option>
                  <option value="exencion_matricula">Exención matrícula</option>
                </select>
              </div>
              {form.tipo !== 'exencion_matricula' && (
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Valor *</label>
                  <input type="number" style={inputStyle} value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} placeholder={form.tipo === 'porcentaje' ? '0-100' : 'Monto'} />
                </div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Motivo</label>
              <input type="text" style={inputStyle} value={form.motivo} onChange={e => setForm({...form, motivo: e.target.value})} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Desde *</label>
                <DateInput style={inputStyle} value={form.fecha_inicio} onChange={e => setForm({...form, fecha_inicio: e.target.value})} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Hasta (vacío = indefinida)</label>
                <DateInput style={inputStyle} value={form.fecha_fin} onChange={e => setForm({...form, fecha_fin: e.target.value})} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCrear(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={handleCrear} style={btnPrimary}>Crear beca</button>
            </div>
          </div>
        </div>
      )}

      {becas.length === 0 ? (
        <div style={emptyState}>No hay becas registradas</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {becas.map(b => (
            <div key={b.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontSize: 13 }}>{getNombreAlumno(b.alumno)}</strong>
                <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, background: b.activa ? '#d1fae5' : '#fee2e2', color: b.activa ? '#059669' : '#dc2626' }}>
                  {b.activa ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{b.clase?.nombre || 'Todas las clases'}</div>
              <div style={{ fontSize: 12, marginBottom: 2 }}>{tipoLabel(b.tipo)}: <strong>{valorLabel(b)}</strong></div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
                {formatDate(b.fecha_inicio)}{b.fecha_fin ? ` → ${formatDate(b.fecha_fin)}` : ' → ∞'}
                {b.motivo && ` · ${b.motivo}`}
              </div>
              <button onClick={() => handleToggle(b)} style={{...btnSmall, background: b.activa ? '#dc2626' : '#059669', width: '100%', padding: '6px 12px'}}>
                {b.activa ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={tableContainer}>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={thCell}>Alumno</th>
                <th style={thCell}>Clase</th>
                <th style={thCell}>Tipo</th>
                <th style={thCell}>Valor</th>
                <th style={thCell}>Vigencia</th>
                <th style={thCell}>Estado</th>
                <th style={thCell}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {becas.map(b => (
                <tr key={b.id} style={trStyle}>
                  <td style={tdCell}>{getNombreAlumno(b.alumno)}</td>
                  <td style={tdCell}>{b.clase?.nombre || 'Todas'}</td>
                  <td style={tdCell}>{tipoLabel(b.tipo)}</td>
                  <td style={tdCell}>{valorLabel(b)}</td>
                  <td style={tdCell}>
                    <div style={{ fontSize: 11 }}>
                      {formatDate(b.fecha_inicio)}
                      {b.fecha_fin ? ` → ${formatDate(b.fecha_fin)}` : ' → ∞'}
                    </div>
                    {b.motivo && <div style={{ fontSize: 10, color: '#9ca3af' }}>{b.motivo}</div>}
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600,
                      background: b.activa ? '#d1fae5' : '#fee2e2',
                      color: b.activa ? '#059669' : '#dc2626'
                    }}>
                      {b.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <button onClick={() => handleToggle(b)} style={{...btnSmall, background: b.activa ? '#dc2626' : '#059669'}}>
                      {b.activa ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ASISTENCIA TAB
// ============================================================
function AsistenciaTab({ token }) {
  const isMobile = getIsMobile();
  const [clases, setClases] = useState([]);
  const [claseId, setClaseId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [alumnos, setAlumnos] = useState([]);
  const [asistencias, setAsistencias] = useState({});
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [view, setView] = useState('registrar');
  const [detalleModal, setDetalleModal] = useState(null);
  const [detalleAlumnos, setDetalleAlumnos] = useState([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  useEffect(() => { loadClases(); }, []);
  useEffect(() => { if (claseId && fecha && view === 'registrar') loadAlumnos(); }, [fecha, claseId, view]);
  useEffect(() => { if (claseId && view === 'historial') loadHistorial(); }, [claseId, view]);

  const loadClases = async () => {
    try {
      const res = await apiAuthFetch('/api/ateneo/clases', {}, token);
      if (res.ok) { const d = await res.json(); setClases((d.clases || d || []).filter(c => c.estado === 'activa')); }
    } catch (err) { console.error(err); }
  };

  const loadAlumnos = async () => {
    if (!claseId || !fecha) return;
    setLoading(true);
    try {
      const res = await apiAuthFetch(`/api/ateneo/asistencia/clase/${claseId}?fecha=${fecha}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        const alumnosList = sortAlumnos(data.alumnos || []);
        setAlumnos(alumnosList);
        const map = {};
        alumnosList.forEach(a => {
          const alumnoId = a.alumno_id || a.id;
          const asist = a.asistencia;
          map[alumnoId] = { presente: asist ? asist.presente : true, observaciones: asist?.observaciones || '' };
        });
        setAsistencias(map);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadHistorial = async () => {
    if (!claseId) return;
    try {
      const res = await apiAuthFetch(`/api/ateneo/asistencia/historial/${claseId}`, {}, token);
      if (res.ok) { const data = await res.json(); setHistorial(data || []); }
    } catch (err) { console.error(err); }
  };

  const handleGuardar = async () => {
    if (!claseId || !fecha) return;
    setSaving(true);
    try {
      const asistenciasArr = Object.entries(asistencias).map(([alumno_id, data]) => ({
        alumno_id: parseInt(alumno_id), presente: data.presente, observaciones: data.observaciones
      }));
      const res = await apiAuthFetch('/api/ateneo/asistencia/registrar', {
        method: 'POST', body: JSON.stringify({ clase_id: parseInt(claseId), fecha, asistencias: asistenciasArr })
      }, token);
      if (res.ok) {
        setSuccessMsg('Asistencia guardada'); setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const togglePresente = (alumnoId) => {
    setAsistencias(prev => ({
      ...prev,
      [alumnoId]: { ...prev[alumnoId], presente: !prev[alumnoId]?.presente }
    }));
  };

  const marcarTodos = (presente) => {
    setAsistencias(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { next[k] = { ...next[k], presente }; });
      return next;
    });
  };

  const loadDetalle = async (fecha) => {
    if (!claseId) return;
    setLoadingDetalle(true);
    setDetalleModal(fecha);
    try {
      const res = await apiAuthFetch(`/api/ateneo/asistencia/clase/${claseId}?fecha=${fecha}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setDetalleAlumnos(sortAlumnos(data.alumnos || []));
      }
    } catch (err) { console.error(err); }
    finally { setLoadingDetalle(false); }
  };

  return (
    <div>
      {successMsg && <div style={{ padding: '8px 16px', background: '#d1fae5', color: '#059669', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{successMsg}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setView('registrar')} style={{ ...btnSecondary, ...(view === 'registrar' ? { background: '#000000', color: '#fff', borderColor: '#000000' } : {}) }}>Registrar</button>
        <button onClick={() => { setView('historial'); if (claseId) loadHistorial(); }} style={{ ...btnSecondary, ...(view === 'historial' ? { background: '#000000', color: '#fff', borderColor: '#000000' } : {}) }}>Historial</button>
      </div>

      {/* Selector clase + fecha */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: isMobile ? '1 1 100%' : undefined }}>
          <label style={labelStyle}>Clase</label>
          <select style={{...inputStyle, maxWidth: isMobile ? '100%' : 220}} value={claseId} onChange={e => { setClaseId(e.target.value); setAlumnos([]); setHistorial([]); }}>
            <option value="">Seleccionar clase...</option>
            {clases.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        {view === 'registrar' && (
          <div>
            <label style={labelStyle}>Fecha</label>
            <DateInput style={{...inputStyle, maxWidth: 160}} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
        )}
      </div>

      {/* Registrar asistencia */}
      {view === 'registrar' && alumnos.length > 0 && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => marcarTodos(true)} style={{...btnSmall, background: '#000000'}}>Todos presentes</button>
            <button onClick={() => marcarTodos(false)} style={{...btnSmall, background: '#dc2626'}}>Todos ausentes</button>
          </div>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alumnos.map(a => {
                const alumno = a.alumno || a;
                const alumnoId = a.alumno_id || alumno.id;
                const nombre = getNombreAlumno(alumno);
                const data = asistencias[alumnoId] || { presente: true, observaciones: '' };
                return (
                  <div key={alumnoId} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => togglePresente(alumnoId)} style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, flexShrink: 0,
                      background: data.presente ? '#d1fae5' : '#fee2e2',
                      color: data.presente ? '#059669' : '#dc2626'
                    }}>
                      {data.presente ? 'P' : 'A'}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{nombre}</div>
                      <input type="text" style={{...inputStyle, marginBottom: 0, fontSize: 12}} value={data.observaciones}
                        onChange={e => setAsistencias(prev => ({...prev, [alumnoId]: {...prev[alumnoId], observaciones: e.target.value}}))}
                        placeholder="Obs..." />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={tableContainer}>
              <table style={tableStyle}>
                <thead>
                  <tr style={thRow}>
                    <th style={thCell}>Alumno</th>
                    <th style={{...thCell, textAlign: 'center', width: 100}}>Presente</th>
                    <th style={thCell}>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnos.map(a => {
                    const alumno = a.alumno || a;
                    const alumnoId = a.alumno_id || alumno.id;
                    const nombre = getNombreAlumno(alumno);
                    const data = asistencias[alumnoId] || { presente: true, observaciones: '' };
                    return (
                      <tr key={alumnoId} style={trStyle}>
                        <td style={tdCell}>{nombre}</td>
                        <td style={{...tdCell, textAlign: 'center'}}>
                          <button onClick={() => togglePresente(alumnoId)} style={{
                            padding: '4px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                            background: data.presente ? '#d1fae5' : '#fee2e2',
                            color: data.presente ? '#059669' : '#dc2626'
                          }}>
                            {data.presente ? 'P' : 'A'}
                          </button>
                        </td>
                        <td style={tdCell}>
                          <input type="text" style={{...inputStyle, marginBottom: 0}} value={data.observaciones}
                            onChange={e => setAsistencias(prev => ({...prev, [alumnoId]: {...prev[alumnoId], observaciones: e.target.value}}))}
                            placeholder="Obs..." />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleGuardar} disabled={saving} style={btnPrimary}>
              {saving ? 'Guardando...' : 'Guardar asistencia'}
            </button>
          </div>
        </div>
      )}
      {view === 'registrar' && alumnos.length === 0 && claseId && (
        <div style={emptyState}>Selecciona clase y fecha, luego presiona "Cargar"</div>
      )}

      {/* Historial */}
      {view === 'historial' && (
        historial.length === 0 ? (
          <div style={emptyState}>{claseId ? 'No hay registros de asistencia para esta clase' : 'Selecciona una clase'}</div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historial.map((h, i) => {
              const total = parseInt(h.dataValues?.total || h.total || 0);
              const presentes = parseInt(h.dataValues?.presentes || h.presentes || 0);
              const pct = total > 0 ? Math.round((presentes / total) * 100) : 0;
              return (
                <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDate(h.fecha)}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{presentes}/{total} presentes · <span style={{ fontWeight: 600, color: pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626' }}>{pct}%</span></div>
                  </div>
                  <button onClick={() => loadDetalle(h.fecha)} style={{...btnSmall, background: '#000000'}}>Detalle</button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={tableContainer}>
            <table style={tableStyle}>
              <thead>
                <tr style={thRow}>
                  <th style={thCell}>Fecha</th>
                  <th style={thCell}>Total</th>
                  <th style={thCell}>Presentes</th>
                  <th style={thCell}>%</th>
                  <th style={thCell}></th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => {
                  const total = parseInt(h.dataValues?.total || h.total || 0);
                  const presentes = parseInt(h.dataValues?.presentes || h.presentes || 0);
                  const pct = total > 0 ? Math.round((presentes / total) * 100) : 0;
                  return (
                    <tr key={i} style={trStyle}>
                      <td style={tdCell}>{formatDate(h.fecha)}</td>
                      <td style={tdCell}>{total}</td>
                      <td style={tdCell}>{presentes}</td>
                      <td style={tdCell}>
                        <span style={{ fontWeight: 600, color: pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626' }}>{pct}%</span>
                      </td>
                      <td style={tdCell}>
                        <button onClick={() => loadDetalle(h.fecha)} style={{...btnSmall, background: '#000000'}}>Ver detalle</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Modal detalle asistencia */}
      {detalleModal && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 600, maxHeight: '90vh', overflowY: 'auto'}}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Asistencia — {formatDate(detalleModal)}</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>{clases.find(c => String(c.id) === String(claseId))?.nombre || ''}</p>
            {loadingDetalle ? <div style={{ textAlign: 'center', padding: 16, color: '#9ca3af' }}>Cargando...</div> : (
              detalleAlumnos.length === 0 ? <div style={{ textAlign: 'center', padding: 16, color: '#9ca3af', fontSize: 13 }}>Sin registros</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detalleAlumnos.map(a => {
                    const alumno = a.alumno || a;
                    const nombre = getNombreAlumno(alumno);
                    const presente = a.asistencia ? a.asistencia.presente : null;
                    return (
                      <div key={a.alumno_id || alumno.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: 13 }}>{nombre}</span>
                        {presente === null ? (
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                        ) : (
                          <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, flexShrink: 0, background: presente ? '#d1fae5' : '#fee2e2', color: presente ? '#059669' : '#dc2626' }}>
                            {presente ? 'P' : 'A'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={() => setDetalleModal(null)} style={btnSecondary}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FERIADOS TAB
// ============================================================
function FeriadosTab({ token }) {
  const isMobile = getIsMobile();
  const [feriados, setFeriados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fecha: '', descripcion: '' });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => { loadFeriados(); }, []);

  const loadFeriados = async () => {
    setLoading(true);
    try {
      const anio = new Date().getFullYear();
      const res = await apiAuthFetch(`/api/ateneo/feriados?anio=${anio}`, {}, token);
      if (res.ok) { const d = await res.json(); setFeriados(d.feriados || d || []); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleCrear = async () => {
    if (!form.fecha || !form.descripcion) { setError('Fecha y descripcion son requeridos'); return; }
    setError('');
    try {
      const res = await apiAuthFetch('/api/ateneo/feriados', { method: 'POST', body: JSON.stringify(form) }, token);
      if (res.ok) {
        setShowForm(false); setForm({ fecha: '', descripcion: '' });
        setSuccessMsg('Feriado agregado'); setTimeout(() => setSuccessMsg(''), 3000);
        loadFeriados();
      } else { const d = await res.json(); setError(d.error || 'Error'); }
    } catch (err) { setError('Error de conexion'); }
  };

  const handleEliminar = async (id) => {
    if (!window.confirm('¿Eliminar este feriado?')) return;
    try {
      const res = await apiAuthFetch(`/api/ateneo/feriados/${id}`, { method: 'DELETE' }, token);
      if (res.ok) loadFeriados();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>;

  return (
    <div>
      {successMsg && <div style={{ padding: '8px 16px', background: '#d1fae5', color: '#059669', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{successMsg}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
        <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>{feriados.length} feriados cargados ({new Date().getFullYear()})</span>
        <button onClick={() => { setForm({ fecha: '', descripcion: '' }); setError(''); setShowForm(true); }} style={btnPrimary}>Agregar feriado</button>
      </div>

      {showForm && (
        <div style={modalOverlay}>
          <div style={{...modalContent, maxWidth: 400}}>
            <h3 style={{ marginTop: 0 }}>Nuevo feriado / dia libre</h3>
            {error && <div style={errorBox}>{error}</div>}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Fecha *</label>
              <DateInput style={inputStyle} value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Descripcion *</label>
              <input type="text" style={inputStyle} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="Ej: Feriado nacional, Receso invernal..." />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={handleCrear} style={btnPrimary}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {feriados.length === 0 ? (
        <div style={emptyState}>No hay feriados cargados para este año. Los dias de clase se calculan automaticamente segun los horarios definidos en cada clase.</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {feriados.map(f => (
            <div key={f.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{formatDateLong(f.fecha)}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{f.descripcion}</div>
              </div>
              <button onClick={() => handleEliminar(f.id)} style={{...btnSmall, background: '#dc2626', flexShrink: 0}}>Eliminar</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={tableContainer}>
          <table style={tableStyle}>
            <thead>
              <tr style={thRow}>
                <th style={thCell}>Fecha</th>
                <th style={thCell}>Descripcion</th>
                <th style={{...thCell, textAlign: 'center'}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {feriados.map(f => (
                <tr key={f.id} style={trStyle}>
                  <td style={tdCell}>{formatDateLong(f.fecha)}</td>
                  <td style={tdCell}>{f.descripcion}</td>
                  <td style={{...tdCell, textAlign: 'center'}}>
                    <button onClick={() => handleEliminar(f.id)} style={{...btnSmall, background: '#dc2626'}}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CUMPLEAÑOS TAB
// ============================================================
function CumpleanosTab({ token, onNavigateToAlumnos }) {
  const isMobile = getIsMobile();
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedAlumno, setSelectedAlumno] = useState(null);

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS_SEMANA_CAL = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

  useEffect(() => { loadAlumnos(); }, []);

  const loadAlumnos = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/ateneo/alumnos', {}, token);
      if (res.ok) {
        const data = await res.json();
        // Solo alumnos con fecha de nacimiento
        const conFecha = (data.alumnos || data || []).filter(a => a.fecha_nacimiento);
        setAlumnos(sortAlumnos(conFecha));
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Obtener cumpleaños para el mes actual
  const getCumpleanosPorMes = () => {
    const mes = currentDate.getMonth(); // 0-11
    return alumnos.filter(a => {
      if (!a.fecha_nacimiento) return false;
      const fecha = new Date(a.fecha_nacimiento + 'T12:00:00');
      return fecha.getMonth() === mes;
    }).map(a => {
      const fecha = new Date(a.fecha_nacimiento + 'T12:00:00');
      return { ...a, dia: fecha.getDate() };
    }).sort((a, b) => a.dia - b.dia);
  };

  // Obtener alumnos para un día específico
  const getAlumnosPorDia = (dia) => {
    return alumnos.filter(a => {
      if (!a.fecha_nacimiento) return false;
      const fecha = new Date(a.fecha_nacimiento + 'T12:00:00');
      return fecha.getDate() === dia && fecha.getMonth() === currentDate.getMonth();
    });
  };

  // Generar días del mes
  const getDiasCalendario = () => {
    const anio = currentDate.getFullYear();
    const mes = currentDate.getMonth();
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);
    const diasEnMes = ultimoDia.getDate();
    const diaSemanaInicio = primerDia.getDay(); // 0=Dom, 1=Lun...

    const dias = [];
    // Celdas vacías antes del primer día
    for (let i = 0; i < diaSemanaInicio; i++) {
      dias.push(null);
    }
    // Días del mes
    for (let i = 1; i <= diasEnMes; i++) {
      dias.push(i);
    }
    return dias;
  };

  const cumpleanosMes = getCumpleanosPorMes();
  const diasCalendario = getDiasCalendario();

  const mesAnterior = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const mesSiguiente = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const hoy = new Date();
  const esHoy = (dia) => {
    return dia === hoy.getDate() &&
           currentDate.getMonth() === hoy.getMonth() &&
           currentDate.getFullYear() === hoy.getFullYear();
  };

  if (loading) return <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>;

  return (
    <div>
      {/* Header con navegación */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={mesAnterior} style={{...btnSecondary, padding: '6px 12px'}}>←</button>
          <h3 style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>{MESES[currentDate.getMonth()]} {currentDate.getFullYear()}</h3>
          <button onClick={mesSiguiente} style={{...btnSecondary, padding: '6px 12px'}}>→</button>
        </div>
        <span style={{ fontSize: theme.typography.small, color: theme.colors.textMuted }}>
          {cumpleanosMes.length} cumpleaños este mes
        </span>
      </div>

      {/* Calendario */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: theme.spacing.lg
      }}>
        {/* Días de la semana */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb'
        }}>
          {DIAS_SEMANA_CAL.map(dia => (
            <div key={dia} style={{
              padding: '10px',
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: '#6b7280'
            }}>{dia}</div>
          ))}
        </div>

        {/* Grilla de días */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 1,
          background: '#e5e7eb'
        }}>
          {diasCalendario.map((dia, idx) => {
            if (dia === null) {
              return <div key={`empty-${idx}`} style={{ background: '#f9fafb', minHeight: isMobile ? 60 : 100 }} />;
            }
            const alumnosDia = getAlumnosPorDia(dia);
            const tieneCumple = alumnosDia.length > 0;

            return (
              <div key={dia} style={{
                background: '#fff',
                minHeight: isMobile ? 60 : 100,
                padding: isMobile ? '4px' : '8px',
                position: 'relative',
                border: esHoy(dia) ? '2px solid #7c3aed' : 'none'
              }}>
                <div style={{
                  fontSize: isMobile ? 12 : 14,
                  fontWeight: esHoy(dia) ? 700 : 500,
                  color: esHoy(dia) ? '#7c3aed' : '#374151',
                  marginBottom: 4
                }}>{dia}</div>

                {tieneCumple && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {alumnosDia.slice(0, isMobile ? 2 : 4).map(alumno => (
                      <button
                        key={alumno.id}
                        onClick={() => setSelectedAlumno(alumno)}
                        style={{
                          background: '#fce7f3',
                          border: '1px solid #f9a8d4',
                          borderRadius: 4,
                          padding: isMobile ? '2px 4px' : '4px 6px',
                          fontSize: isMobile ? 9 : 11,
                          color: '#be185d',
                          cursor: 'pointer',
                          textAlign: 'left',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          width: '100%'
                        }}
                        title={getNombreAlumno(alumno)}
                      >
                        {isMobile ? '🎂' : '🎂'} {getNombreAlumno(alumno).split(' ')[0]}
                      </button>
                    ))}
                    {alumnosDia.length > (isMobile ? 2 : 4) && (
                      <div style={{ fontSize: 10, color: '#be185d', paddingLeft: 4 }}>
                        +{alumnosDia.length - (isMobile ? 2 : 4)} más
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista de cumpleaños del mes */}
      <div style={{ marginTop: theme.spacing.lg }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 16 }}>Próximos cumpleaños</h4>
        {cumpleanosMes.length === 0 ? (
          <div style={emptyState}>No hay cumpleaños este mes</div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cumpleanosMes.map(a => (
              <div key={a.id} style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{getNombreAlumno(a)}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {a.dia} de {MESES[currentDate.getMonth()]}
                    {esHoy(a.dia) && <span style={{ color: '#7c3aed', fontWeight: 600, marginLeft: 8 }}>¡Hoy!</span>}
                  </div>
                </div>
                <button onClick={() => setSelectedAlumno(a)} style={{...btnSmall, background: '#000000'}}>Ver</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={tableContainer}>
            <table style={tableStyle}>
              <thead>
                <tr style={thRow}>
                  <th style={thCell}>Día</th>
                  <th style={thCell}>Alumno</th>
                  <th style={thCell}>DNI</th>
                  <th style={thCell}>Teléfono</th>
                  <th style={thCell}></th>
                </tr>
              </thead>
              <tbody>
                {cumpleanosMes.map(a => (
                  <tr key={a.id} style={trStyle}>
                    <td style={tdCell}>
                      <strong style={{ color: esHoy(a.dia) ? '#7c3aed' : '#374151' }}>{a.dia}</strong>
                      {esHoy(a.dia) && <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 4 }}>¡Hoy!</span>}
                    </td>
                    <td style={tdCell}>{getNombreAlumno(a)}</td>
                    <td style={tdCell}>{a.dni || '-'}</td>
                    <td style={tdCell}>{a.telefono || '-'}</td>
                    <td style={tdCell}>
                      <button onClick={() => setSelectedAlumno(a)} style={{...btnSmall, background: '#000000'}}>Ver perfil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de detalle del alumno */}
      {selectedAlumno && (
        <div style={modalOverlay} onClick={() => setSelectedAlumno(null)}>
          <div style={{...modalContent, maxWidth: 500}} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 18 }}>🎂 {getNombreAlumno(selectedAlumno)}</h3>

            <div style={{
              background: '#fce7f3',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 14, color: '#be185d' }}>Cumpleaños</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#be185d' }}>
                {selectedAlumno.fecha_nacimiento ? formatDate(selectedAlumno.fecha_nacimiento) : '-'}
              </div>
              {(() => {
                const hoy = new Date();
                const fechaNac = new Date(selectedAlumno.fecha_nacimiento + 'T12:00:00');
                const edad = hoy.getFullYear() - fechaNac.getFullYear() -
                  (hoy.getMonth() < fechaNac.getMonth() ||
                  (hoy.getMonth() === fechaNac.getMonth() && hoy.getDate() < fechaNac.getDate()) ? 1 : 0);
                return <div style={{ fontSize: 13, color: '#9d174d' }}>Cumple {edad} años</div>;
              })()}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div><span style={{ fontSize: 11, color: '#9ca3af' }}>DNI</span><div style={{ fontSize: 14 }}>{selectedAlumno.dni || '-'}</div></div>
              <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Teléfono</span><div style={{ fontSize: 14 }}>{selectedAlumno.telefono || '-'}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ fontSize: 11, color: '#9ca3af' }}>Email</span><div style={{ fontSize: 14 }}>{selectedAlumno.usuario?.email || '-'}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><span style={{ fontSize: 11, color: '#9ca3af' }}>Dirección</span><div style={{ fontSize: 14 }}>{selectedAlumno.direccion || '-'}</div></div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSelectedAlumno(null)} style={btnSecondary}>Cerrar</button>
              <button
                onClick={() => {
                  setSelectedAlumno(null);
                  onNavigateToAlumnos?.();
                }}
                style={{...btnPrimary, background: '#000000'}}
              >
                Ir a Alumnos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// REPORTES TAB
// ============================================================
function ReportesTab({ token }) {
  const isMobile = getIsMobile();
  const [dashboard, setDashboard] = useState(null);
  const [reporteActivo, setReporteActivo] = useState('dashboard');
  const [ingresos, setIngresos] = useState(null);
  const [morosidad, setMorosidad] = useState(null);
  const [listaAlumnos, setListaAlumnos] = useState(null);
  const [listaClases, setListaClases] = useState([]);
  const [filtroListaClase, setFiltroListaClase] = useState('');
  const [rendicionClases, setRendicionClases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [buscarReporte, setBuscarReporte] = useState('');
  const API = import.meta.env.VITE_API_URL || '';

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (buscarReporte) params.set('buscar', buscarReporte);
      const res = await apiAuthFetch(`/api/ateneo/reportes/dashboard?${params}`, {}, token);
      if (res.ok) setDashboard(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadIngresos = async () => {
    setLoading(true);
    try {
      let url = '/api/ateneo/reportes/ingresos?';
      if (filtroDesde) url += `desde=${filtroDesde}&`;
      if (filtroHasta) url += `hasta=${filtroHasta}&`;
      if (buscarReporte) url += `buscar=${buscarReporte}&`;
      const res = await apiAuthFetch(url, {}, token);
      if (res.ok) setIngresos(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadMorosidad = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (buscarReporte) params.set('buscar', buscarReporte);
      const res = await apiAuthFetch(`/api/ateneo/reportes/morosidad?${params}`, {}, token);
      if (res.ok) setMorosidad(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const exportCSV = (tipo) => {
    let url = `${API}/api/ateneo/reportes/export/${tipo}?`;
    if (filtroDesde) url += `desde=${filtroDesde}&`;
    if (filtroHasta) url += `hasta=${filtroHasta}&`;
    window.open(url, '_blank');
  };

  const loadListaAlumnos = async () => {
    setLoading(true);
    try {
      let url = '/api/ateneo/reportes/lista-alumnos?';
      if (filtroListaClase) url += `clase_id=${filtroListaClase}&`;
      const res = await apiAuthFetch(url, {}, token);
      if (res.ok) setListaAlumnos(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadListaClases = async () => {
    try {
      const res = await apiAuthFetch('/api/ateneo/clases', {}, token);
      if (res.ok) { const d = await res.json(); setListaClases(d.clases || d || []); }
    } catch (err) { console.error(err); }
  };

  const loadRendicionClases = async () => {
    try {
      const res = await apiAuthFetch('/api/ateneo/clases', {}, token);
      if (res.ok) { const d = await res.json(); setRendicionClases(d.clases || d || []); }
    } catch (e) { console.error(e); }
  };

  const handleTabChange = (tab) => {
    setReporteActivo(tab);
    if (tab === 'ingresos' && !ingresos) loadIngresos();
    if (tab === 'morosidad' && !morosidad) loadMorosidad();
    if (tab === 'lista-alumnos') { if (!listaAlumnos) loadListaAlumnos(); if (!listaClases.length) loadListaClases(); }
    if (tab === 'rendicion' && !rendicionClases.length) loadRendicionClases();
  };

  const cardStyle = { padding: isMobile ? '12px 14px' : '16px 20px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', flex: isMobile ? '1 1 calc(50% - 6px)' : '1 1 200px', minWidth: isMobile ? 0 : 150 };
  const cardLabel = { fontSize: 11, color: '#6b7280', marginBottom: 4 };
  const cardValue = { fontSize: 22, fontWeight: 700 };

  if (loading && !dashboard) return <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>Cargando...</div>;

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, maxWidth: isMobile ? '100%' : 220 }}
          placeholder="Buscar por alumno o clase..."
          value={buscarReporte}
          onChange={e => setBuscarReporte(e.target.value)}
        />
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'ingresos', label: 'Ingresos' },
          { id: 'morosidad', label: 'Morosidad' },
          { id: 'lista-alumnos', label: 'Lista Alumnos' },
          { id: 'rendicion', label: 'Rendición Docente' }
        ].map(t => (
          <button key={t.id} onClick={() => handleTabChange(t.id)} style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: reporteActivo === t.id ? '#7c3aed' : '#fff',
            color: reporteActivo === t.id ? '#fff' : '#374151'
          }}>{t.label}</button>
        ))}
      </div>

      {/* DASHBOARD */}
      {reporteActivo === 'dashboard' && dashboard && (
        <div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <div style={cardStyle}>
              <div style={cardLabel}>Alumnos totales</div>
              <div style={{ ...cardValue, color: '#7c3aed' }}>{dashboard.alumnos?.total || 0}</div>
            </div>
            <div style={cardStyle}>
              <div style={cardLabel}>Alumnos activos</div>
              <div style={{ ...cardValue, color: '#059669' }}>{dashboard.alumnos?.activos || 0}</div>
            </div>
            <div style={cardStyle}>
              <div style={cardLabel}>Clases activas</div>
              <div style={{ ...cardValue, color: '#2563eb' }}>{dashboard.clases?.activas || 0}</div>
            </div>
            <div style={cardStyle}>
              <div style={cardLabel}>Inscripciones</div>
              <div style={{ ...cardValue, color: '#7c3aed' }}>{dashboard.inscripciones?.confirmadas || 0}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={cardStyle}>
              <div style={cardLabel}>Ingresos del mes</div>
              <div style={{ ...cardValue, color: '#059669' }}>${Number(dashboard.pagos?.ingresos_mes || 0).toLocaleString('es-AR')}</div>
            </div>
            <div style={cardStyle}>
              <div style={cardLabel}>Pagos pendientes</div>
              <div style={{ ...cardValue, color: '#d97706' }}>{dashboard.pagos?.pendientes || 0}</div>
            </div>
            <div style={cardStyle}>
              <div style={cardLabel}>Pagos vencidos</div>
              <div style={{ ...cardValue, color: '#dc2626' }}>{dashboard.pagos?.vencidos || 0}</div>
            </div>
          </div>
        </div>
      )}

      {/* INGRESOS */}
      {reporteActivo === 'ingresos' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>Desde</label>
              <DateInput value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </div>
            <div>
              <label style={labelStyle}>Hasta</label>
              <DateInput value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            </div>
            <button onClick={loadIngresos} style={btnPrimary}>Filtrar</button>
            <button onClick={() => {
              const now = new Date();
              setFiltroDesde(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
              setFiltroHasta(now.toISOString().split('T')[0]);
              setTimeout(() => loadIngresos(), 50);
            }} style={{...btnSecondary, background: '#000000', color: '#fff', border: '1px solid #000000'}}>Este mes</button>
            <button onClick={() => exportCSV('ingresos')} style={btnSecondary}>Exportar CSV</button>
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>Cargando...</div> : ingresos ? (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={cardStyle}>
                  <div style={cardLabel}>Total pagos</div>
                  <div style={{ ...cardValue, color: '#7c3aed' }}>{ingresos.resumen?.total_pagos || 0}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Total ingresos</div>
                  <div style={{ ...cardValue, color: '#059669' }}>${Number(ingresos.resumen?.total_ingresos || 0).toLocaleString('es-AR')}</div>
                </div>
              </div>

              {/* Por tipo */}
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Por tipo</h4>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(ingresos.por_tipo || {}).map(([tipo, data]) => (
                  <div key={tipo} style={cardStyle}>
                    <div style={cardLabel}>{tipo === 'matricula' ? 'Matrículas' : 'Cuotas'}</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{data.cantidad} - ${Number(data.total).toLocaleString('es-AR')}</div>
                  </div>
                ))}
              </div>

              {/* Por clase */}
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Por clase</h4>
              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(ingresos.por_clase || {}).map(([clase, data]) => (
                    <div key={clase} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{clase}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{data.cantidad} · ${Number(data.total).toLocaleString('es-AR')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={tableContainer}>
                  <table style={tableStyle}>
                    <thead><tr style={thRow}><th style={thCell}>Clase</th><th style={thCell}>Cantidad</th><th style={thCell}>Total</th></tr></thead>
                    <tbody>
                      {Object.entries(ingresos.por_clase || {}).map(([clase, data]) => (
                        <tr key={clase} style={trStyle}>
                          <td style={tdCell}>{clase}</td>
                          <td style={tdCell}>{data.cantidad}</td>
                          <td style={tdCell}>${Number(data.total).toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* MOROSIDAD */}
      {reporteActivo === 'morosidad' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button onClick={loadMorosidad} style={btnPrimary}>Actualizar</button>
            <button onClick={() => exportCSV('morosidad')} style={btnSecondary}>Exportar CSV</button>
          </div>

          {loading ? <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>Cargando...</div> : morosidad ? (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={cardStyle}>
                  <div style={cardLabel}>Alumnos deudores</div>
                  <div style={{ ...cardValue, color: '#dc2626' }}>{morosidad.resumen?.total_alumnos_deudores || 0}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Pagos vencidos</div>
                  <div style={{ ...cardValue, color: '#d97706' }}>{morosidad.resumen?.total_pagos_vencidos || 0}</div>
                </div>
                <div style={cardStyle}>
                  <div style={cardLabel}>Deuda total</div>
                  <div style={{ ...cardValue, color: '#dc2626' }}>${Number(morosidad.resumen?.total_deuda || 0).toLocaleString('es-AR')}</div>
                </div>
              </div>

              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(morosidad.por_alumno || []).map((a, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ fontSize: 13 }}>{a.alumno?.usuario?.name || 'N/A'}</strong>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#dc2626' }}>{a.cuotas_vencidas} cuotas</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>{a.alumno?.usuario?.email || '-'}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>${Number(a.total_adeudado).toLocaleString('es-AR')}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={tableContainer}>
                  <table style={tableStyle}>
                    <thead><tr style={thRow}>
                      <th style={thCell}>Alumno</th><th style={thCell}>Email</th>
                      <th style={thCell}>Cuotas vencidas</th><th style={thCell}>Total adeudado</th>
                    </tr></thead>
                    <tbody>
                      {(morosidad.por_alumno || []).map((a, i) => (
                        <tr key={i} style={trStyle}>
                          <td style={tdCell}>{a.alumno?.usuario?.name || 'N/A'}</td>
                          <td style={{ ...tdCell, fontSize: 12, color: '#6b7280' }}>{a.alumno?.usuario?.email || '-'}</td>
                          <td style={{ ...tdCell, textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#dc2626' }}>
                              {a.cuotas_vencidas}
                            </span>
                          </td>
                          <td style={{ ...tdCell, fontWeight: 600, color: '#dc2626' }}>${Number(a.total_adeudado).toLocaleString('es-AR')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
      {/* RENDICIÓN DOCENTE */}
      {reporteActivo === 'rendicion' && (
        <RendicionPDF token={token} clases={rendicionClases} />
      )}

      {/* LISTA ALUMNOS */}
      {reporteActivo === 'lista-alumnos' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>Filtrar por clase</label>
              <select
                value={filtroListaClase}
                onChange={e => setFiltroListaClase(e.target.value)}
                style={{ ...inputStyle, width: isMobile ? '100%' : 220 }}
              >
                <option value=''>Todas las clases</option>
                {listaClases.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <button onClick={loadListaAlumnos} style={btnPrimary}>Filtrar</button>
            <button
              onClick={() => {
                let url = `${API}/api/ateneo/reportes/export/lista-alumnos?`;
                if (filtroListaClase) url += `clase_id=${filtroListaClase}&`;
                window.open(url, '_blank');
              }}
              style={btnSecondary}
            >Exportar CSV</button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>Cargando...</div>
          ) : listaAlumnos ? (
            <>
              <div style={{ marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
                {listaAlumnos.total} alumno{listaAlumnos.total !== 1 ? 's' : ''} con inscripcion confirmada
              </div>
              {listaAlumnos.total === 0 ? (
                <div style={emptyState}>No hay alumnos con inscripcion confirmada</div>
              ) : isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(listaAlumnos.lista || []).map((item, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>{item.clase}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{item.nombre}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Nac.: {formatDate(item.fecha_nacimiento)} · DNI: {item.dni}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={tableContainer}>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={thRow}>
                        <th style={thCell}>Clase</th>
                        <th style={thCell}>Nombre y Apellido</th>
                        <th style={thCell}>Fecha de Nacimiento</th>
                        <th style={thCell}>DNI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(listaAlumnos.lista || []).map((item, i) => (
                        <tr key={i} style={trStyle}>
                          <td style={{ ...tdCell, color: '#7c3aed', fontWeight: 500 }}>{item.clase}</td>
                          <td style={tdCell}>{item.nombre}</td>
                          <td style={tdCell}>{formatDate(item.fecha_nacimiento)}</td>
                          <td style={{ ...tdCell, fontFamily: 'monospace' }}>{item.dni}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={emptyState}>Usá el boton Filtrar para cargar la lista</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SHARED STYLES
// ============================================================
const btnPrimary = {
  padding: '8px 16px',
  background: '#000000',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '13px'
};

const btnSecondary = {
  padding: '8px 16px',
  background: '#f3f4f6',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '13px'
};

const btnSmall = {
  padding: '4px 12px',
  background: '#000000',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 600
};

const modalOverlay = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  padding: '16px'
};

const modalContent = {
  background: '#fff',
  borderRadius: '8px',
  padding: '24px',
  maxWidth: '560px',
  width: '90%',
  maxHeight: '90vh',
  overflow: 'auto'
};

const labelStyle = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '12px',
  fontWeight: 500,
  color: '#374151'
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  fontSize: '13px',
  boxSizing: 'border-box'
};

const errorBox = {
  padding: '8px 12px',
  background: '#fee2e2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  color: '#dc2626',
  fontSize: '13px',
  marginBottom: '12px'
};

const emptyState = {
  textAlign: 'center',
  padding: '48px 24px',
  background: '#f9fafb',
  borderRadius: '8px',
  color: '#6b7280',
  fontSize: '14px'
};

const tableContainer = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'auto'
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '600px'
};

const thRow = {
  background: '#f9fafb',
  borderBottom: '2px solid #e5e7eb'
};

const thCell = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 600,
  color: '#374151'
};

const trStyle = {
  borderBottom: '1px solid #f3f4f6'
};

const tdCell = {
  padding: '10px 12px',
  fontSize: '13px',
  color: '#1f2937'
};
