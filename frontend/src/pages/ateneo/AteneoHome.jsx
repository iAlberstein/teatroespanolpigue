import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../styles/theme';
import LocationSelector from '../../components/LocationSelector';
import DateInputMask from '../../components/DateInputMask';

const API = import.meta.env.VITE_API_URL || '';
const resolveImg = (url) => url ? (url.startsWith('/') ? API + url : url) : null;

const formatFecha = (fecha) => {
  if (!fecha) return '-';
  const d = new Date(typeof fecha === 'string' && fecha.length === 10 ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d)) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const CLASS_COLORS_MAP = {
  purple: { bg: '#ede9fe', text: '#7c3aed' },
  blue:   { bg: '#dbeafe', text: '#2563eb' },
  green:  { bg: '#d1fae5', text: '#059669' },
  amber:  { bg: '#fef3c7', text: '#d97706' },
  pink:   { bg: '#fce7f3', text: '#db2777' },
  indigo: { bg: '#e0e7ff', text: '#4f46e5' },
  teal:   { bg: '#ccfbf1', text: '#0d9488' },
  violet: { bg: '#fae8ff', text: '#a855f7' },
};
const getClaseColor = (clase) => CLASS_COLORS_MAP[clase?.color] || { bg: '#ede9fe', text: '#7c3aed' };

export default function AteneoHome() {
  const { isAuthenticated, hasRole, token, login, register } = useAuth();
  const [clases, setClases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inscribiendo, setInscribiendo] = useState(null);
  const [inscripcionMsg, setInscripcionMsg] = useState({ id: null, msg: '', ok: false });
  const [showDocenteModal, setShowDocenteModal] = useState(null);
  const [confirmInscripcionModal, setConfirmInscripcionModal] = useState(null);
  const [expandedDesc, setExpandedDesc] = useState({});
  const [authModal, setAuthModal] = useState(null); // null or { claseId, mode: 'login'|'register' }
  const [authForm, setAuthForm] = useState({ email: '', password: '', confirmPassword: '', name: '', phone: '', dni: '', provincia: '', localidad: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const pendingInscripcionRef = useRef(null);
  const [esMenor, setEsMenor] = useState(false);
  const [menorForm, setMenorForm] = useState({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', nombre_tutor: '', telefono_tutor: '' });
  const [guestForm, setGuestForm] = useState({ name: '', email: '', phone: '', dni: '' });

  useEffect(() => {
    loadClases();
  }, []);

  const loadClases = async () => {
    try {
      const res = await apiFetch('/api/ateneo/public/clases');
      if (res.ok) {
        const data = await res.json();
        setClases(data.clases || data || []);
      }
    } catch (err) {
      console.error('Error loading clases:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-inscribe after login/register
  useEffect(() => {
    if (isAuthenticated && pendingInscripcionRef.current) {
      const claseId = pendingInscripcionRef.current;
      pendingInscripcionRef.current = null;
      handleInscribirse(claseId);
    }
  }, [isAuthenticated]);

  const handleInscribirse = async (claseId) => {
    setInscribiendo(claseId);
    setInscripcionMsg({ id: null, msg: '', ok: false });
    try {
      const body = { clase_id: claseId };
      if (esMenor) {
        body.es_menor = true;
        body.nombre_menor = menorForm.nombre;
        body.apellido_menor = menorForm.apellido;
        body.dni_menor = menorForm.dni;
        body.fecha_nacimiento_menor = menorForm.fecha_nacimiento;
        body.nombre_tutor = menorForm.nombre_tutor;
        body.telefono_tutor = menorForm.telefono_tutor;
      }
      if (!isAuthenticated) {
        body.guest = guestForm;
      }
      const res = isAuthenticated
        ? await apiAuthFetch('/api/ateneo/inscripciones', { method: 'POST', body: JSON.stringify(body) }, token)
        : await apiFetch('/api/ateneo/inscripciones', { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
          return;
        }
        setInscripcionMsg({ id: claseId, msg: data.mensaje || 'Inscripcion registrada! Queda pendiente de confirmacion.', ok: true });
        loadClases();
      } else {
        setInscripcionMsg({ id: claseId, msg: data.error || 'Error al inscribirse', ok: false });
      }
    } catch (err) {
      setInscripcionMsg({ id: claseId, msg: 'Error de conexion', ok: false });
    } finally {
      setInscribiendo(null);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={{ minHeight: '60vh' }}>
      {/* Hero */}
      <section style={{
        padding: isMobile ? '40px 16px' : '64px 24px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #fdf2f8 100%)',
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing['2xl']
      }}>
        <h1 style={{
          fontSize: isMobile ? theme.typography.h2 : theme.typography.h1,
          fontWeight: theme.typography.bold,
          color: theme.colors.textPrimary,
          marginBottom: theme.spacing.md,
          letterSpacing: '-0.02em'
        }}>
          Ateneo de Artes Escenicas
        </h1>
        <p style={{
          fontSize: theme.typography.h5,
          color: theme.colors.textSecondary,
          maxWidth: 600,
          margin: '0 auto',
          marginBottom: theme.spacing.xl,
          lineHeight: 1.6
        }}>
          Te damos la bienvenida a tu espacio de crecimiento artístico
        </p>
        <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/ateneo/sobre" style={{
            padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
            background: '#000000',
            color: '#fff',
            borderRadius: theme.borderRadius.md,
            textDecoration: 'none',
            fontWeight: theme.typography.semibold,
            fontSize: theme.typography.body
          }}>
            Sobre el Ateneo
          </Link>
          {isAuthenticated && hasRole('admin', 'admin_ateneo') && (
            <Link to="/ateneo/admin" style={{
              padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
              background: theme.colors.primaryDark,
              color: '#fff',
              borderRadius: theme.borderRadius.md,
              textDecoration: 'none',
              fontWeight: theme.typography.semibold,
              fontSize: theme.typography.body
            }}>
              Panel de Administracion
            </Link>
          )}
          {isAuthenticated && hasRole('docente_ateneo') && (
            <Link to="/ateneo/docente" style={{
              padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
              background: '#000000',
              color: '#fff',
              borderRadius: theme.borderRadius.md,
              textDecoration: 'none',
              fontWeight: theme.typography.semibold,
              fontSize: theme.typography.body
            }}>
              Panel Docente
            </Link>
          )}
          {isAuthenticated && hasRole('alumno_ateneo') && (
            <Link to="/ateneo/alumno" style={{
              padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
              background: '#0d9488',
              color: '#fff',
              borderRadius: theme.borderRadius.md,
              textDecoration: 'none',
              fontWeight: theme.typography.semibold,
              fontSize: theme.typography.body
            }}>
              Mi Portal
            </Link>
          )}
          {!isAuthenticated && (
            <Link to="/login" style={{
              padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
              background: theme.colors.primary,
              color: '#fff',
              borderRadius: theme.borderRadius.md,
              textDecoration: 'none',
              fontWeight: theme.typography.semibold,
              fontSize: theme.typography.body
            }}>
              Ingresar
            </Link>
          )}
        </div>
      </section>

      {/* Clases disponibles */}
      <section style={{ marginBottom: theme.spacing['2xl'] }}>
        <h2 style={{
          fontSize: theme.typography.h3,
          fontWeight: theme.typography.bold,
          color: theme.colors.textPrimary,
          marginBottom: theme.spacing.lg
        }}>
          Clases disponibles
        </h2>

        {loading ? (
          <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>
            Cargando...
          </div>
        ) : clases.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: theme.spacing['2xl'],
            background: theme.colors.surfaceAlt,
            borderRadius: theme.borderRadius.lg,
            color: theme.colors.textSecondary
          }}>
            <p style={{ fontSize: theme.typography.h5, marginBottom: theme.spacing.sm }}>
              Proximamente
            </p>
            <p style={{ fontSize: theme.typography.small }}>
              Las clases del Ateneo se publicaran pronto. Mantente atento.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: theme.spacing.lg
          }}>
            {clases.map(clase => (
              <div key={clase.id} style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.borderRadius.lg,
                overflow: 'hidden',
                transition: theme.transitions.normal,
                boxShadow: theme.shadows.sm
              }}>
                {/* Foto de la actividad */}
                {clase.imagen_actividad_url && (
                  <div style={{ width: '100%', height: 180, overflow: 'hidden' }}>
                    <img src={resolveImg(clase.imagen_actividad_url)} alt={clase.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ padding: theme.spacing.lg }}>
                <h3 style={{
                  fontSize: theme.typography.h4,
                  fontWeight: theme.typography.semibold,
                  color: theme.colors.textPrimary,
                  marginTop: 0,
                  marginBottom: 4
                }}>
                  {clase.nombre}
                </h3>
                {clase.descripcion && (
                  <div style={{ marginBottom: theme.spacing.md }}>
                    <p style={{
                      fontSize: theme.typography.small,
                      color: theme.colors.textSecondary,
                      lineHeight: 1.5,
                      margin: 0,
                      whiteSpace: 'pre-line'
                    }}>
                      {expandedDesc[clase.id] || clase.descripcion.length <= 150
                        ? clase.descripcion
                        : clase.descripcion.substring(0, 150) + '...'}
                    </p>
                    {clase.descripcion.length > 150 && (
                      <button onClick={() => setExpandedDesc(prev => ({ ...prev, [clase.id]: !prev[clase.id] }))} style={{
                        background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, padding: '4px 0 0', textDecoration: 'underline'
                      }}>
                        {expandedDesc[clase.id] ? 'Ver menos' : 'Ver más'}
                      </button>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                  {(() => {
                    const cc = getClaseColor(clase);
                    const chipStyle = {
                      padding: '6px 14px',
                      background: cc.bg,
                      color: cc.text,
                      borderRadius: 16,
                      fontSize: theme.typography.tiny,
                      fontWeight: theme.typography.medium,
                      lineHeight: 1.4,
                      textAlign: 'center'
                    };
                    if (clase.horarios && clase.horarios.length > 0) {
                      const allSameTime = clase.horarios.every(h =>
                        (h.hora_inicio||'').substring(0,5) === (clase.horarios[0].hora_inicio||'').substring(0,5) &&
                        (h.hora_fin||'').substring(0,5) === (clase.horarios[0].hora_fin||'').substring(0,5)
                      );
                      if (clase.taller_corto) {
                        return clase.horarios.map((h, i) => (
                          <span key={i} style={chipStyle}>
                            {h.fecha ? formatFecha(h.fecha) : h.dia_semana} {(h.hora_inicio||'').substring(0,5)}-{(h.hora_fin||'').substring(0,5)}
                          </span>
                        ));
                      } else if (allSameTime) {
                        const dias = clase.horarios.map(h => h.dia_semana).join(' y ');
                        const hora = `${(clase.horarios[0].hora_inicio||'').substring(0,5)}-${(clase.horarios[0].hora_fin||'').substring(0,5)}`;
                        return <span style={chipStyle}>{dias}<br/>{hora}</span>;
                      } else {
                        return (
                          <span style={chipStyle}>
                            {clase.horarios.map((h, i) => (
                              <span key={i}>{h.dia_semana} {(h.hora_inicio||'').substring(0,5)}-{(h.hora_fin||'').substring(0,5)}{i < clase.horarios.length - 1 && <br/>}</span>
                            ))}
                          </span>
                        );
                      }
                    } else if (clase.horario) {
                      return <span style={chipStyle}>{clase.horario}</span>;
                    }
                    return null;
                  })()}
                </div>
                {(clase.fecha_inicio || clase.fecha_fin) && (
                  <div style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 6 }}>
                    {(() => {
                      const fmt = (f) => { if (!f) return null; const d = new Date(f + 'T12:00:00'); return isNaN(d) ? null : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
                      const ini = fmt(clase.fecha_inicio);
                      const fin = fmt(clase.fecha_fin);
                      if (ini && fin) return `Inicio: ${ini} — Fin: ${fin}`;
                      if (ini) return `Inicio: ${ini}`;
                      if (fin) return `Fin: ${fin}`;
                      return null;
                    })()}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: theme.spacing.sm }}>
                  {(clase.costo_matricula || clase.costo_cuota) ? (
                    <div style={{ color: theme.colors.textPrimary }}>
                      {(() => {
                        const hasMat = !clase.matricula_bonificada && clase.costo_matricula && Number(clase.costo_matricula) > 0;
                        const hasCuota = clase.costo_cuota && Number(clase.costo_cuota) > 0;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {hasMat && (
                              <div style={{ fontSize: 13, fontWeight: 600 }}>
                                Matricula ${Number(clase.costo_matricula).toLocaleString('es-AR')} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 11 }}>(anual)</span>
                              </div>
                            )}
                            {hasCuota && (
                              <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {clase.cuota_unica
                                  ? `Pago unico $${Number(clase.costo_cuota).toLocaleString('es-AR')}`
                                  : `Cuota mensual $${Number(clase.costo_cuota).toLocaleString('es-AR')}`}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : <div />}
                  {clase.cupo_disponible != null && (
                    <span style={{
                      fontSize: 11, color: clase.cupo_disponible > 0 ? '#059669' : '#dc2626',
                      fontWeight: 600
                    }}>
                      {clase.cupo_disponible > 0 ? `${clase.cupo_disponible} lugares` : 'Sin cupo'}
                    </span>
                  )}
                </div>

                {/* Conocer al docente */}
                {(clase.bio_docente || clase.imagen_docente_url) && (
                  <button onClick={() => setShowDocenteModal(clase)} style={{
                    width: '100%', padding: '8px 16px', marginTop: 8,
                    background: 'transparent', color: getClaseColor(clase).text,
                    border: `1px solid ${getClaseColor(clase).bg}`, borderRadius: 6,
                    cursor: 'pointer', fontWeight: 500, fontSize: 13
                  }}>
                    Conocer al docente
                  </button>
                )}

                {/* Inscripcion para alumnos */}
                {clase.cupo_disponible > 0 && !hasRole('admin', 'admin_ateneo') && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => setConfirmInscripcionModal(clase)}
                      disabled={inscribiendo === clase.id}
                      style={{
                        width: '100%', padding: '8px 16px',
                        background: inscribiendo === clase.id ? '#9ca3af' : '#7c3aed',
                        color: '#fff', border: 'none', borderRadius: 6,
                        cursor: inscribiendo === clase.id ? 'wait' : 'pointer',
                        fontWeight: 600, fontSize: 13
                      }}
                    >
                      {inscribiendo === clase.id ? 'Inscribiendo...' : 'Inscribirme'}
                    </button>
                  </div>
                )}
                {inscripcionMsg.id === clase.id && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: inscripcionMsg.ok ? '#d1fae5' : '#fee2e2',
                    color: inscripcionMsg.ok ? '#059669' : '#dc2626'
                  }}>
                    {inscripcionMsg.msg}
                    {inscripcionMsg.ok && (
                      <Link to="/ateneo/alumno?tab=pagos" style={{
                        display: 'block', marginTop: 8, padding: '8px 16px',
                        background: '#000000', color: '#fff', borderRadius: 6,
                        textDecoration: 'none', fontWeight: 600, fontSize: 13, textAlign: 'center'
                      }}>
                        Completar pagos
                      </Link>
                    )}
                  </div>
                )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal docente */}
      {showDocenteModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', zIndex: 1000, padding: 16,
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }} onClick={() => setShowDocenteModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 0, maxWidth: 480, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
            margin: 'auto 0'
          }} onClick={e => e.stopPropagation()}>
            {showDocenteModal.imagen_docente_url && (
              <div style={{ width: '100%', height: 240, overflow: 'hidden' }}>
                <img src={resolveImg(showDocenteModal.imagen_docente_url)} alt="Docente" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}
            <div style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0, fontSize: 18 }}>
                {showDocenteModal.nombre_docente || 'Docente'}
              </h3>
              <p style={{ fontSize: 12, color: '#7c3aed', fontWeight: 500, marginBottom: 12 }}>
                {showDocenteModal.nombre}
              </p>
              {showDocenteModal.bio_docente && (
                <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {showDocenteModal.bio_docente}
                </p>
              )}
              <button onClick={() => setShowDocenteModal(null)} style={{
                marginTop: 16, padding: '8px 20px', background: '#000000', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmacion inscripcion */}
      {confirmInscripcionModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', zIndex: 1000, padding: 16,
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }} onClick={() => { setConfirmInscripcionModal(null); setEsMenor(false); setMenorForm({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', nombre_tutor: '', telefono_tutor: '' }); setGuestForm({ name: '', email: '', phone: '', dni: '' }); }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', margin: 'auto 0'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 18, color: '#1f2937' }}>Confirmar inscripcion</h3>
            <p style={{ fontSize: 13, color: '#7c3aed', fontWeight: 500, marginBottom: 16 }}>
              {confirmInscripcionModal.nombre}
            </p>
            {confirmInscripcionModal.taller_corto ? (
              <div style={{
                background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 8,
                padding: 16, marginBottom: 20
              }}>
                <p style={{ margin: '0 0 10px', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  Al confirmar seras redirigido al checkout de <strong>SiPago</strong> para abonar el taller.
                </p>
                <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  Monto a abonar: <strong>${Number(confirmInscripcionModal.costo_cuota || 0).toLocaleString('es-AR')}</strong>
                </p>
              </div>
            ) : (
              <div style={{
                background: '#f5f3ff', border: '1px solid #ede9fe', borderRadius: 8,
                padding: 16, marginBottom: 20
              }}>
                <p style={{ margin: '0 0 10px', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  Al inscribirte, tu solicitud quedara <strong>pendiente de confirmacion</strong> por parte del Ateneo.
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  Una vez confirmada tu inscripcion, se generaran automaticamente los pagos correspondientes a la <strong>matricula</strong> y la <strong>primera cuota mensual</strong>.
                </p>
                <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  Podras consultar el estado de tu inscripcion y realizar los pagos desde tu <strong>panel de alumno</strong>.
                </p>
              </div>
            )}

            {/* Pregunta menor de edad */}
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
              padding: 16, marginBottom: 20
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: '#92400e', fontWeight: 500 }}>
                <input type="checkbox" checked={esMenor} onChange={e => { setEsMenor(e.target.checked); if (!e.target.checked) setMenorForm({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', nombre_tutor: '', telefono_tutor: '' }); }}
                  style={{ width: 18, height: 18, accentColor: '#7c3aed', cursor: 'pointer' }} />
                La inscripcion es para un/a menor de edad
              </label>
              {esMenor && (
                <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Nombre del menor <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" value={menorForm.nombre} onChange={e => setMenorForm(f => ({...f, nombre: e.target.value}))}
                      placeholder="Nombre" style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Apellido del menor <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" value={menorForm.apellido} onChange={e => setMenorForm(f => ({...f, apellido: e.target.value}))}
                      placeholder="Apellido" style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>DNI del menor <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" value={menorForm.dni} onChange={e => setMenorForm(f => ({...f, dni: e.target.value.replace(/\D/g, '')}))}
                      placeholder="Ej: 12345678" maxLength={8} style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Fecha de nacimiento <span style={{ color: '#dc2626' }}>*</span></label>
                    <DateInputMask value={menorForm.fecha_nacimiento} onChange={e => setMenorForm(f => ({...f, fecha_nacimiento: e.target.value}))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Nombre y apellido de padre/madre/tutor <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" value={menorForm.nombre_tutor} onChange={e => setMenorForm(f => ({...f, nombre_tutor: e.target.value}))}
                      placeholder="Nombre y apellido" style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Telefono de padre/madre/tutor <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="tel" value={menorForm.telefono_tutor} onChange={e => setMenorForm(f => ({...f, telefono_tutor: e.target.value}))}
                      placeholder="Ej: 2923456789" style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    Estos datos figuraran en el perfil del alumno inscripto.
                  </div>
                </div>
              )}
            </div>

            {!isAuthenticated && confirmInscripcionModal.taller_corto && (
              <div style={{
                background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 8,
                padding: 16, marginBottom: 20
              }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#1e40af', fontWeight: 600 }}>Tus datos de contacto</h4>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Nombre completo <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" value={guestForm.name} onChange={e => setGuestForm(f => ({...f, name: e.target.value}))}
                      placeholder="Tu nombre" style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Email <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="email" value={guestForm.email} onChange={e => setGuestForm(f => ({...f, email: e.target.value}))}
                      placeholder="tu@email.com" style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>Telefono</label>
                    <input type="tel" value={guestForm.phone} onChange={e => setGuestForm(f => ({...f, phone: e.target.value}))}
                      placeholder="Ej: 2923456789" style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 }}>DNI</label>
                    <input type="text" value={guestForm.dni} onChange={e => setGuestForm(f => ({...f, dni: e.target.value.replace(/\D/g, '')}))}
                      placeholder="Ej: 12345678" maxLength={8} style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#6b7280' }}>No es necesario crear una contraseña. Te contactaremos por email.</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setConfirmInscripcionModal(null); setEsMenor(false); setMenorForm({ nombre: '', apellido: '', dni: '', fecha_nacimiento: '', nombre_tutor: '', telefono_tutor: '' }); setGuestForm({ name: '', email: '', phone: '', dni: '' }); }} style={{
                padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 13
              }}>Cancelar</button>
              <button
                onClick={() => {
                  if (esMenor && (!menorForm.nombre.trim() || !menorForm.apellido.trim() || !menorForm.dni.trim() || !menorForm.fecha_nacimiento || !menorForm.nombre_tutor.trim() || !menorForm.telefono_tutor.trim())) {
                    alert('Completa todos los datos del menor y del tutor para continuar.');
                    return;
                  }
                  if (!isAuthenticated && confirmInscripcionModal.taller_corto && (!guestForm.name.trim() || !guestForm.email.trim())) {
                    alert('Completa tu nombre y email para continuar.');
                    return;
                  }
                  const claseId = confirmInscripcionModal.id;
                  setConfirmInscripcionModal(null);
                  if (!isAuthenticated && !confirmInscripcionModal.taller_corto) {
                    pendingInscripcionRef.current = claseId;
                    setAuthModal({ claseId, mode: 'login' });
                    setAuthForm({ email: '', password: '', confirmPassword: '', name: '', phone: '', dni: '', provincia: '', localidad: '' });
                    setAuthError('');
                  } else {
                    handleInscribirse(claseId);
                  }
                }}
                disabled={inscribiendo === confirmInscripcionModal.id}
                style={{
                  padding: '8px 16px', background: '#000000', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13
                }}
              >{confirmInscripcionModal.taller_corto ? 'Confirmar y abonar' : 'Confirmar mi inscripcion'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal login/registro para inscripcion */}
      {authModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'center', zIndex: 1100, padding: 16,
          overflowY: 'auto', WebkitOverflowScrolling: 'touch'
        }} onClick={() => { setAuthModal(null); pendingInscripcionRef.current = null; }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)', margin: 'auto 0'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 18, color: '#1f2937' }}>
              {authModal.mode === 'login' ? 'Iniciar sesion' : 'Crear cuenta'}
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              {authModal.mode === 'login'
                ? 'Ingresa con tu cuenta para completar la inscripcion.'
                : 'Crea una cuenta para completar la inscripcion.'}
            </p>
            {authError && (
              <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                {authError}
              </div>
            )}
            <form onSubmit={async (e) => {
              e.preventDefault();
              setAuthError('');
              setAuthLoading(true);
              try {
                let result;
                if (authModal.mode === 'login') {
                  result = await login(authForm.email, authForm.password);
                } else {
                  if (!authForm.name.trim()) { setAuthError('El nombre es obligatorio'); setAuthLoading(false); return; }
                  if (!authForm.dni || authForm.dni.length < 7) { setAuthError('El DNI es obligatorio (7-8 digitos)'); setAuthLoading(false); return; }
                  if (!authForm.provincia) { setAuthError('Debe seleccionar una provincia'); setAuthLoading(false); return; }
                  if (!authForm.localidad) { setAuthError('Debe seleccionar una localidad'); setAuthLoading(false); return; }
                  if (authForm.password.length < 6) { setAuthError('La contrasena debe tener al menos 6 caracteres'); setAuthLoading(false); return; }
                  if (authForm.password !== authForm.confirmPassword) { setAuthError('Las contrasenas no coinciden'); setAuthLoading(false); return; }
                  result = await register(authForm.name, authForm.email, authForm.password, authForm.phone, authForm.dni, authForm.provincia, authForm.localidad);
                }
                if (result.success) {
                  setAuthModal(null);
                } else {
                  setAuthError(result.error || 'Error al procesar');
                }
              } catch (err) {
                setAuthError('Error de conexion');
              } finally {
                setAuthLoading(false);
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {authModal.mode === 'register' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Nombre completo <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="text" value={authForm.name} onChange={e => setAuthForm(f => ({...f, name: e.target.value}))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Email <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="email" value={authForm.email} onChange={e => setAuthForm(f => ({...f, email: e.target.value}))} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              {authModal.mode === 'register' && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Telefono</label>
                    <input type="tel" value={authForm.phone} onChange={e => setAuthForm(f => ({...f, phone: e.target.value}))} placeholder="Ej: 2923456789"
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                    <small style={{ color: '#9ca3af', fontSize: 11 }}>Codigo de area + numero, sin espacios</small>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>DNI <span style={{ color: '#dc2626' }}>*</span></label>
                    <input type="text" value={authForm.dni} onChange={e => setAuthForm(f => ({...f, dni: e.target.value.replace(/\D/g, '')}))} placeholder="Ej: 12345678" maxLength={8}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                    <small style={{ color: '#9ca3af', fontSize: 11 }}>Solo numeros, sin puntos</small>
                  </div>
                  <LocationSelector
                    value={{ provincia: authForm.provincia, localidad: authForm.localidad }}
                    onChange={({ provincia, localidad }) => setAuthForm(f => ({...f, provincia, localidad}))}
                    required={true}
                    disabled={authLoading}
                  />
                </>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Contrasena <span style={{ color: '#dc2626' }}>*</span></label>
                <input type="password" value={authForm.password} onChange={e => setAuthForm(f => ({...f, password: e.target.value}))} required minLength={6}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              {authModal.mode === 'register' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4 }}>Confirmar contrasena <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="password" value={authForm.confirmPassword} onChange={e => setAuthForm(f => ({...f, confirmPassword: e.target.value}))} required
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button type="button" onClick={() => {
                  setAuthModal(m => ({ ...m, mode: m.mode === 'login' ? 'register' : 'login' }));
                  setAuthError('');
                }} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: 0 }}>
                  {authModal.mode === 'login' ? 'No tengo cuenta, registrarme' : 'Ya tengo cuenta, iniciar sesion'}
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => { setAuthModal(null); pendingInscripcionRef.current = null; }} style={{
                  padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500, fontSize: 13
                }}>Cancelar</button>
                <button type="submit" disabled={authLoading} style={{
                  padding: '8px 16px', background: '#000000', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  opacity: authLoading ? 0.6 : 1
                }}>{authLoading ? 'Procesando...' : (authModal.mode === 'login' ? 'Iniciar sesion' : 'Registrarme')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
