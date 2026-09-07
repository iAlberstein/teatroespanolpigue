import { useState, useEffect } from 'react';
import { apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../styles/theme';
import DateInput from '../../components/DateInput';
import { formatDate, formatMonthYear } from '../../lib/dateFormatter.js';

// Helper: nombre del alumno (si es menor, muestra nombre del menor + responsable entre paréntesis)
const getNombreAlumno = (alumno) => {
  if (!alumno) return '-';
  const nombreUsuario = alumno.usuario?.name || alumno.user?.name || alumno.nombre || `Alumno #${alumno.id || alumno.alumno_id}`;
  if (alumno.es_menor && (alumno.nombre_menor || alumno.apellido_menor)) {
    const nombreMenor = `${alumno.nombre_menor || ''} ${alumno.apellido_menor || ''}`.trim();
    return `${nombreMenor} (${nombreUsuario})`;
  }
  return nombreUsuario;
};

const sortAlumnos = (list) => [...list].sort((a, b) => getNombreAlumno(a).localeCompare(getNombreAlumno(b), 'es'));

export default function AteneoDocente() {
  const { token } = useAuth();
  const [clases, setClases] = useState([]);
  const [selectedClase, setSelectedClase] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [contentTab, setContentTab] = useState('alumnos');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [asistencias, setAsistencias] = useState({});
  const [asistAlumnos, setAsistAlumnos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [seguimientoModal, setSeguimientoModal] = useState(null);
  const [seguimientoText, setSeguimientoText] = useState('');
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);
  const [detalleModal, setDetalleModal] = useState(null);
  const [detalleAlumnos, setDetalleAlumnos] = useState([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [showCalendario, setShowCalendario] = useState(false);
  const [mesActual, setMesActual] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [feriados, setFeriados] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => { loadClases(); }, []);
  useEffect(() => { if (selectedClase && fecha && contentTab === 'asistencia') loadAsistencia(); }, [fecha, selectedClase, contentTab]);
  useEffect(() => {
    if (!showCalendario) return;
    const loadFeriados = async () => {
      try {
        const anio = mesActual.getFullYear();
        const res = await apiAuthFetch(`/api/ateneo/feriados?anio=${anio}`, {}, token);
        if (res.ok) { const d = await res.json(); setFeriados(d.feriados || d || []); }
      } catch (err) { console.error(err); }
    };
    loadFeriados();
  }, [mesActual.getFullYear(), showCalendario]);
  useEffect(() => { setSelectedDay(null); }, [mesActual]);

  const loadClases = async () => {
    setLoading(true);
    try {
      const res = await apiAuthFetch('/api/ateneo/docente/mis-clases', {}, token);
      if (res.ok) { const data = await res.json(); setClases(data.clases || data || []); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadAlumnos = async (claseId) => {
    setLoadingAlumnos(true);
    try {
      const res = await apiAuthFetch(`/api/ateneo/docente/clases/${claseId}/alumnos`, {}, token);
      if (res.ok) { const data = await res.json(); setAlumnos(sortAlumnos(data.alumnos || data || [])); }
    } catch (err) { console.error(err); }
    finally { setLoadingAlumnos(false); }
  };

  const loadAsistencia = async () => {
    if (!selectedClase) return;
    try {
      const res = await apiAuthFetch(`/api/ateneo/asistencia/clase/${selectedClase.id}?fecha=${fecha}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        const list = sortAlumnos(data.alumnos || []);
        setAsistAlumnos(list);
        const map = {};
        list.forEach(a => {
          const id = a.alumno_id || a.id;
          map[id] = { presente: a.asistencia ? a.asistencia.presente : true, observaciones: a.asistencia?.observaciones || '' };
        });
        setAsistencias(map);
      }
    } catch (err) { console.error(err); }
  };

  const loadHistorial = async () => {
    if (!selectedClase) return;
    try {
      const res = await apiAuthFetch(`/api/ateneo/asistencia/historial/${selectedClase.id}`, {}, token);
      if (res.ok) { const data = await res.json(); setHistorial(data || []); }
    } catch (err) { console.error(err); }
  };

  const handleSelectClase = (clase) => {
    setSelectedClase(clase);
    setContentTab('alumnos');
    loadAlumnos(clase.id);
  };

  const handleGuardarAsistencia = async () => {
    if (!selectedClase) return;
    setSaving(true);
    try {
      const arr = Object.entries(asistencias).map(([alumno_id, d]) => ({ alumno_id: parseInt(alumno_id), presente: d.presente, observaciones: d.observaciones }));
      const res = await apiAuthFetch('/api/ateneo/asistencia/registrar', {
        method: 'POST', body: JSON.stringify({ clase_id: selectedClase.id, fecha, asistencias: arr })
      }, token);
      if (res.ok) { setSuccessMsg('Asistencia guardada'); setTimeout(() => setSuccessMsg(''), 3000); }
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const togglePresente = (id) => {
    setAsistencias(prev => ({ ...prev, [id]: { ...prev[id], presente: !prev[id]?.presente } }));
  };

  const handleOpenSeguimiento = (alumno) => {
    setSeguimientoModal(alumno);
    setSeguimientoText(alumno.seguimiento || '');
  };

  const handleGuardarSeguimiento = async () => {
    if (!seguimientoModal) return;
    setSavingSeguimiento(true);
    try {
      const res = await apiAuthFetch(`/api/ateneo/docente/inscripcion/${seguimientoModal.inscripcion_id}/seguimiento`, {
        method: 'PUT', body: JSON.stringify({ seguimiento: seguimientoText })
      }, token);
      if (res.ok) {
        setAlumnos(prev => prev.map(a => a.inscripcion_id === seguimientoModal.inscripcion_id ? { ...a, seguimiento: seguimientoText } : a));
        setSeguimientoModal(null);
        setSuccessMsg('Seguimiento actualizado');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) { console.error(err); }
    finally { setSavingSeguimiento(false); }
  };

  const loadDetalle = async (fecha) => {
    if (!selectedClase) return;
    setLoadingDetalle(true);
    setDetalleModal(fecha);
    try {
      const res = await apiAuthFetch(`/api/ateneo/asistencia/clase/${selectedClase.id}?fecha=${fecha}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        setDetalleAlumnos(sortAlumnos(data.alumnos || []));
      }
    } catch (err) { console.error(err); }
    finally { setLoadingDetalle(false); }
  };

  const getEstadoBadge = (estado) => {
    const s = { activo: { bg: '#d1fae5', c: '#059669' }, pendiente: { bg: '#fef3c7', c: '#d97706' }, deuda: { bg: '#fee2e2', c: '#dc2626' }, suspendido: { bg: '#fecaca', c: '#991b1b' } };
    const st = s[estado] || s.pendiente;
    return { padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, background: st.bg, color: st.c };
  };

  const thStyle = { padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
  const tdStyle = { padding: '10px 12px', fontSize: '13px' };

  return (
    <div style={{ minHeight: '60vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: theme.typography.h3, fontWeight: theme.typography.bold, margin: 0 }}>
          Panel Docente
        </h1>
        {clases.length > 0 && (
          <button onClick={() => setShowCalendario(!showCalendario)} style={{
            padding: '8px 16px', background: showCalendario ? '#7c3aed' : '#ede9fe',
            color: showCalendario ? '#fff' : '#7c3aed', border: 'none', borderRadius: 6,
            cursor: 'pointer', fontSize: 13, fontWeight: 600
          }}>{showCalendario ? 'Volver al panel' : 'Ver calendario de clases'}</button>
        )}
      </div>
      {successMsg && <div style={{ padding: '8px 16px', background: '#d1fae5', color: '#059669', borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>{successMsg}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>
      ) : clases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', background: '#f9fafb', borderRadius: 8, color: '#6b7280' }}>
          No tenes clases asignadas
        </div>
      ) : showCalendario ? (
        <DocenteCalendario clases={clases} mesActual={mesActual} setMesActual={setMesActual} feriados={feriados} selectedDay={selectedDay} setSelectedDay={setSelectedDay} isMobile={isMobile} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: theme.spacing.lg }}>
          {/* Sidebar */}
          <div>
            <h3 style={{ fontSize: 11, color: '#9ca3af', marginTop: 0, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mis Clases</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clases.map(c => (
                <button key={c.id} onClick={() => handleSelectClase(c)} style={{
                  padding: '12px', background: selectedClase?.id === c.id ? '#ede9fe' : '#fff',
                  border: `1px solid ${selectedClase?.id === c.id ? '#8b5cf6' : '#e5e7eb'}`,
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left'
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{c.nombre}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {c.horarios?.length > 0 ? c.horarios.map((h, i) => (
                      <span key={i} style={{ fontSize: 10, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4, color: '#6b7280' }}>
                        {c.taller_corto && h.fecha ? formatDate(h.fecha) : h.dia_semana} {(h.hora_inicio||'').substring(0,5)}-{(h.hora_fin||'').substring(0,5)}
                      </span>
                    )) : c.horario ? <span style={{ fontSize: 10, color: '#6b7280' }}>{c.horario}</span> : null}
                  </div>
                  {c.ubicacion && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{c.ubicacion}</div>}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div>
            {!selectedClase ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', background: '#f9fafb', borderRadius: 8, color: '#9ca3af' }}>
                Selecciona una clase
              </div>
            ) : (
              <>
                <h3 style={{ margin: 0, marginBottom: 12, fontSize: 18 }}>
                  {selectedClase.nombre}
                  <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>{alumnos.length} alumnos</span>
                </h3>

                {/* Content tabs */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {['alumnos', 'asistencia', 'historial'].map(t => (
                    <button key={t} onClick={() => {
                      setContentTab(t);
                      if (t === 'asistencia') loadAsistencia();
                      if (t === 'historial') loadHistorial();
                    }} style={{
                      padding: '6px 14px', borderRadius: 6, border: '1px solid',
                      cursor: 'pointer', fontSize: 12, fontWeight: 500,
                      background: contentTab === t ? '#7c3aed' : '#fff',
                      color: contentTab === t ? '#fff' : '#374151',
                      borderColor: contentTab === t ? '#7c3aed' : '#d1d5db'
                    }}>
                      {t === 'alumnos' ? 'Alumnos' : t === 'asistencia' ? 'Asistencia' : 'Historial'}
                    </button>
                  ))}
                </div>

                {/* Alumnos tab */}
                {contentTab === 'alumnos' && (
                  loadingAlumnos ? <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>Cargando...</div> :
                  alumnos.length === 0 ? <div style={{ textAlign: 'center', padding: 24, background: '#f9fafb', borderRadius: 8, color: '#9ca3af' }}>Sin alumnos inscriptos</div> : (
                    isMobile ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {alumnos.map(a => (
                          <div key={a.alumno_id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: 13 }}>{getNombreAlumno(a)}</strong>
                              <span style={getEstadoBadge(a.estado_academico)}>{a.estado_academico || 'pendiente'}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{a.email || '-'}</div>
                            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>{a.seguimiento ? 'Con seguimiento' : 'Sin seguimiento'}</span>
                              <button onClick={() => handleOpenSeguimiento(a)} style={{ padding: '3px 10px', background: '#000000', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Modificar</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                              <th style={thStyle}>Nombre</th>
                              <th style={thStyle}>Contacto</th>
                              <th style={{...thStyle, textAlign: 'center'}}>Estado</th>
                              <th style={thStyle}>Seguimiento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {alumnos.map(a => (
                              <tr key={a.alumno_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={tdStyle}><strong>{getNombreAlumno(a)}</strong></td>
                                <td style={{...tdStyle, fontSize: 12, color: '#6b7280'}}>{a.email || '-'}</td>
                                <td style={{...tdStyle, textAlign: 'center'}}><span style={getEstadoBadge(a.estado_academico)}>{a.estado_academico || 'pendiente'}</span></td>
                                <td style={tdStyle}>
                                  <button onClick={() => handleOpenSeguimiento(a)} style={{ padding: '4px 12px', background: '#000000', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Modificar</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )
                )}

                {/* Asistencia tab */}
                {contentTab === 'asistencia' && (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Fecha</label>
                      <DateInput style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }} value={fecha} onChange={e => { setFecha(e.target.value); }} />
                    </div>
                    {asistAlumnos.length > 0 && (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <button onClick={() => setAsistencias(prev => { const n = {...prev}; Object.keys(n).forEach(k => n[k] = {...n[k], presente: true}); return n; })}
                            style={{ padding: '4px 12px', background: '#000000', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Todos P</button>
                          <button onClick={() => setAsistencias(prev => { const n = {...prev}; Object.keys(n).forEach(k => n[k] = {...n[k], presente: false}); return n; })}
                            style={{ padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Todos A</button>
                        </div>
                        {isMobile ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {asistAlumnos.map(a => {
                              const alumno = a.alumno || a;
                              const id = a.alumno_id || alumno.id;
                              const d = asistencias[id] || { presente: true, observaciones: '' };
                              return (
                                <div key={id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <button onClick={() => togglePresente(id)} style={{
                                    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, flexShrink: 0,
                                    background: d.presente ? '#d1fae5' : '#fee2e2', color: d.presente ? '#059669' : '#dc2626'
                                  }}>{d.presente ? 'P' : 'A'}</button>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{getNombreAlumno(alumno)}</div>
                                    <input type="text" style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
                                      value={d.observaciones} onChange={e => setAsistencias(prev => ({...prev, [id]: {...prev[id], observaciones: e.target.value}}))} placeholder="Obs..." />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                  <th style={thStyle}>Alumno</th>
                                  <th style={{...thStyle, textAlign: 'center', width: 80}}>P/A</th>
                                  <th style={thStyle}>Obs.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {asistAlumnos.map(a => {
                                  const alumno = a.alumno || a;
                                  const id = a.alumno_id || alumno.id;
                                  const d = asistencias[id] || { presente: true, observaciones: '' };
                                  return (
                                    <tr key={id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                      <td style={tdStyle}>{getNombreAlumno(alumno)}</td>
                                      <td style={{...tdStyle, textAlign: 'center'}}>
                                        <button onClick={() => togglePresente(id)} style={{
                                          padding: '4px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                          background: d.presente ? '#d1fae5' : '#fee2e2', color: d.presente ? '#059669' : '#dc2626'
                                        }}>{d.presente ? 'P' : 'A'}</button>
                                      </td>
                                      <td style={tdStyle}>
                                        <input type="text" style={{ width: '100%', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
                                          value={d.observaciones} onChange={e => setAsistencias(prev => ({...prev, [id]: {...prev[id], observaciones: e.target.value}}))} placeholder="..." />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={handleGuardarAsistencia} disabled={saving} style={{ padding: '8px 16px', background: '#000000', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                            {saving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </>
                    )}
                    {asistAlumnos.length === 0 && <div style={{ textAlign: 'center', padding: 24, background: '#f9fafb', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>Selecciona fecha y presiona "Cargar"</div>}
                  </div>
                )}

                {/* Historial tab */}
                {contentTab === 'historial' && (
                  historial.length === 0 ? <div style={{ textAlign: 'center', padding: 24, background: '#f9fafb', borderRadius: 8, color: '#9ca3af', fontSize: 13 }}>Sin registros</div> : isMobile ? (
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
                            <button onClick={() => loadDetalle(h.fecha)} style={{ padding: '3px 10px', background: '#000000', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>Detalle</button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={thStyle}>Fecha</th>
                            <th style={thStyle}>Total</th>
                            <th style={thStyle}>Presentes</th>
                            <th style={thStyle}>%</th>
                            <th style={thStyle}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {historial.map((h, i) => {
                            const total = parseInt(h.dataValues?.total || h.total || 0);
                            const presentes = parseInt(h.dataValues?.presentes || h.presentes || 0);
                            const pct = total > 0 ? Math.round((presentes / total) * 100) : 0;
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={tdStyle}>{formatDate(h.fecha)}</td>
                                <td style={tdStyle}>{total}</td>
                                <td style={tdStyle}>{presentes}</td>
                                <td style={tdStyle}><span style={{ fontWeight: 600, color: pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626' }}>{pct}%</span></td>
                                <td style={tdStyle}>
                                  <button onClick={() => loadDetalle(h.fecha)} style={{ padding: '3px 10px', background: '#000000', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Ver detalle</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}
      {/* Modal detalle asistencia */}
      {detalleModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: 16
        }} onClick={() => setDetalleModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, maxWidth: 600, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Asistencia — {formatDate(detalleModal)}</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>{selectedClase?.nombre}</p>
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
              <button onClick={() => setDetalleModal(null)} style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal seguimiento */}
      {seguimientoModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, padding: 16
        }} onClick={() => setSeguimientoModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, maxWidth: 500, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 16, marginBottom: 4 }}>Seguimiento</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0, marginBottom: 16 }}>{seguimientoModal.nombre}</p>
            <textarea
              style={{ width: '100%', minHeight: 150, padding: 10, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              value={seguimientoText}
              onChange={e => setSeguimientoText(e.target.value)}
              placeholder="Escribí notas de seguimiento del alumno..."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setSeguimientoModal(null)} style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>Cancelar</button>
              <button onClick={handleGuardarSeguimiento} disabled={savingSeguimiento} style={{ padding: '8px 16px', background: '#000000', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                {savingSeguimiento ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocenteCalendario({ clases, mesActual, setMesActual, feriados, selectedDay, setSelectedDay, isMobile }) {
  const DIAS_SEMANA_MAP = { 'Lunes': 1, 'Martes': 2, 'Miercoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sabado': 6, 'Domingo': 0 };
  const DIAS_NOMBRE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  const feriadosSet = new Set(feriados.map(f => f.fecha));
  const feriadosMap = {};
  feriados.forEach(f => { feriadosMap[f.fecha] = f.descripcion; });

  const clasesActivas = (clases || []).filter(c => c.estado === 'activa');

  const CLASS_COLORS_BY_KEY = {
    purple: { bg: '#ede9fe', text: '#7c3aed', dot: '#7c3aed', badge: '#7c3aed' },
    blue:   { bg: '#dbeafe', text: '#2563eb', dot: '#2563eb', badge: '#2563eb' },
    green:  { bg: '#d1fae5', text: '#059669', dot: '#059669', badge: '#059669' },
    amber:  { bg: '#fef3c7', text: '#b45309', dot: '#d97706', badge: '#d97706' },
    pink:   { bg: '#fce7f3', text: '#be185d', dot: '#db2777', badge: '#db2777' },
    indigo: { bg: '#e0e7ff', text: '#4338ca', dot: '#4f46e5', badge: '#4f46e5' },
    teal:   { bg: '#ccfbf1', text: '#0f766e', dot: '#0d9488', badge: '#0d9488' },
    violet: { bg: '#fae8ff', text: '#9333ea', dot: '#a855f7', badge: '#a855f7' },
  };
  const CLASS_COLORS_LIST = Object.values(CLASS_COLORS_BY_KEY);
  const colorMap = {};
  let fallbackIdx = 0;
  clasesActivas.forEach((c) => {
    if (c.color && CLASS_COLORS_BY_KEY[c.color]) {
      colorMap[c.nombre] = CLASS_COLORS_BY_KEY[c.color];
    } else {
      colorMap[c.nombre] = CLASS_COLORS_LIST[fallbackIdx % CLASS_COLORS_LIST.length];
      fallbackIdx++;
    }
  });

  const primerDia = new Date(mesActual.getFullYear(), mesActual.getMonth(), 1);
  const ultimoDia = new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 0);
  const startDay = primerDia.getDay();

  const dias = [];
  for (let i = 0; i < startDay; i++) dias.push(null);
  for (let d = 1; d <= ultimoDia.getDate(); d++) dias.push(d);

  const getFechaStr = (dia) => {
    if (!dia) return '';
    return `${mesActual.getFullYear()}-${String(mesActual.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  };

  const getClasesDelDia = (dia) => {
    if (!dia) return [];
    const fechaStr = getFechaStr(dia);
    if (feriadosSet.has(fechaStr)) return [];
    const fecha = new Date(mesActual.getFullYear(), mesActual.getMonth(), dia);
    const diaSemana = fecha.getDay();
    const result = [];
    for (const clase of clasesActivas) {
      if (!clase.horarios || clase.horarios.length === 0) continue;
      if (clase.fecha_inicio) {
        const inicio = new Date(clase.fecha_inicio + 'T00:00:00');
        if (fecha < inicio) continue;
      }
      if (clase.fecha_fin) {
        const fin = new Date(clase.fecha_fin + 'T23:59:59');
        if (fecha > fin) continue;
      }
      for (const h of clase.horarios) {
        if (clase.taller_corto && h.fecha) {
          const fechaStr = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`;
          if (h.fecha === fechaStr) {
            result.push({ clase: clase.nombre, hora: `${(h.hora_inicio || '').substring(0, 5)}-${(h.hora_fin || '').substring(0, 5)}`, color: colorMap[clase.nombre] || CLASS_COLORS_LIST[0] });
          }
        } else if (DIAS_SEMANA_MAP[h.dia_semana] === diaSemana) {
          result.push({ clase: clase.nombre, hora: `${(h.hora_inicio || '').substring(0, 5)}-${(h.hora_fin || '').substring(0, 5)}`, color: colorMap[clase.nombre] || CLASS_COLORS_LIST[0] });
        }
      }
    }
    return result;
  };

  const mesLabel = formatMonthYear(mesActual);
  const hoy = new Date();
  const esHoy = (dia) => dia && hoy.getFullYear() === mesActual.getFullYear() && hoy.getMonth() === mesActual.getMonth() && hoy.getDate() === dia;
  const esFeriado = (dia) => dia && feriadosSet.has(getFechaStr(dia));

  const selectedClases = selectedDay ? getClasesDelDia(selectedDay) : [];
  const selectedFeriado = selectedDay ? esFeriado(selectedDay) : false;
  const selectedFeriadoNombre = selectedDay && selectedFeriado ? feriadosMap[getFechaStr(selectedDay)] : null;
  const selectedFecha = selectedDay ? new Date(mesActual.getFullYear(), mesActual.getMonth(), selectedDay) : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1))} style={{
          padding: '6px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13
        }}>← Anterior</button>
        <h3 style={{ margin: 0, fontSize: isMobile ? 14 : 16, textTransform: 'capitalize' }}>{mesLabel}</h3>
        <button onClick={() => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1))} style={{
          padding: '6px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13
        }}>Siguiente →</button>
      </div>

      {clasesActivas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: '#f9fafb', borderRadius: 8, color: '#6b7280' }}>
          No tenes clases activas para mostrar en el calendario
        </div>
      ) : (
        <>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              {(isMobile ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'] : ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']).map(d => (
                <div key={d} style={{ padding: isMobile ? '6px 2px' : '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {dias.map((dia, idx) => {
                const clasesDia = dia ? getClasesDelDia(dia) : [];
                const feriado = dia ? esFeriado(dia) : false;
                const isSelected = dia && selectedDay === dia;
                const hasClases = clasesDia.length > 0;
                return (
                  <div key={idx}
                    onClick={() => dia && setSelectedDay(dia === selectedDay ? null : dia)}
                    style={{
                      height: isMobile ? 44 : 80, padding: isMobile ? 2 : 4,
                      borderRight: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6',
                      background: isSelected ? '#ede9fe' : feriado ? '#fef2f2' : esHoy(dia) ? '#f5f3ff' : dia ? '#fff' : '#f9fafb',
                      cursor: dia ? 'pointer' : 'default', overflow: 'hidden', position: 'relative',
                      outline: isSelected ? '2px solid #7c3aed' : 'none', outlineOffset: '-2px',
                      borderRadius: isSelected ? 2 : 0
                    }}
                  >
                    {dia && (
                      <>
                        <div style={{
                          fontSize: isMobile ? 12 : 13, fontWeight: esHoy(dia) ? 700 : 400,
                          color: feriado ? '#dc2626' : esHoy(dia) ? '#7c3aed' : '#374151',
                          textAlign: isMobile ? 'center' : 'left', lineHeight: 1.2
                        }}>{dia}</div>
                        {isMobile ? (
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2, flexWrap: 'wrap' }}>
                            {hasClases && clasesDia.map((c, i) => (
                              <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: c.color.dot }} />
                            ))}
                            {feriado && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#dc2626' }} />}
                          </div>
                        ) : (
                          <div style={{ marginTop: 2, overflow: 'hidden', maxHeight: 52 }}>
                            {feriado && (
                              <div style={{
                                padding: '1px 3px', background: '#fee2e2', color: '#dc2626',
                                borderRadius: 3, fontSize: 8, fontWeight: 500, marginBottom: 1,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                              }}>{feriadosMap[getFechaStr(dia)]}</div>
                            )}
                            {clasesDia.map((c, i) => (
                              <div key={i} style={{
                                background: c.color.bg, color: c.color.text, borderRadius: 3,
                                marginBottom: 1, overflow: 'hidden', lineHeight: 1.2, padding: '1px 3px'
                              }}>
                                <div style={{ fontSize: 8, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.hora}</div>
                                <div style={{ fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.clase}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedDay && (
            <div style={{
              marginTop: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: isMobile ? 12 : 16,
              borderLeft: '4px solid #7c3aed'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: 14, color: '#374151' }}>
                  {DIAS_NOMBRE[selectedFecha.getDay()]} {selectedDay}/{String(mesActual.getMonth() + 1).padStart(2, '0')}
                  {esHoy(selectedDay) && <span style={{ marginLeft: 8, fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>HOY</span>}
                </h4>
                <button onClick={() => setSelectedDay(null)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af', padding: '0 4px'
                }}>✕</button>
              </div>
              {selectedFeriado && (
                <div style={{ padding: '6px 10px', background: '#fef2f2', color: '#dc2626', borderRadius: 6, fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                  Feriado: {selectedFeriadoNombre}
                </div>
              )}
              {selectedClases.length === 0 && !selectedFeriado && (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Sin clases este día</div>
              )}
              {selectedClases.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selectedClases.map((c, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      background: c.color.bg, borderRadius: 6
                    }}>
                      <div style={{
                        background: c.color.badge, color: '#fff', padding: '4px 8px', borderRadius: 4,
                        fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 'fit-content'
                      }}>{c.hora}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{c.clase}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {clasesActivas.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: (colorMap[c.nombre] || CLASS_COLORS_LIST[0]).dot }} />
                <span>{c.nombre}</span>
                {c.horarios && c.horarios.map((h, j) => (
                  <span key={j} style={{ fontSize: 11, color: '#6b7280' }}>
                    {c.taller_corto && h.fecha ? formatDate(h.fecha) : h.dia_semana} {(h.hora_inicio || '').substring(0, 5)}-{(h.hora_fin || '').substring(0, 5)}
                  </span>
                ))}
              </div>
            ))}
            {feriados.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: '#dc2626' }} />
                <span style={{ color: '#6b7280' }}>Feriado / dia libre</span>
              </div>
            )}
            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Tocá un día para ver detalle</div>
          </div>
        </>
      )}
    </div>
  );
}
