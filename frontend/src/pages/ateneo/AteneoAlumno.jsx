import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiAuthFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../styles/theme';
import DateInputMask from '../../components/DateInputMask';
import { formatDate, formatMonthYear } from '../../lib/dateFormatter.js';

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

// Helper: recargo 15% si cuota vencida (fecha actual > fecha_vencimiento)
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

export default function AteneoAlumno() {
  const { token, user } = useAuth();
  const [perfil, setPerfil] = useState(null);
  const [inscripciones, setInscripciones] = useState([]);
  const [pagosData, setPagosData] = useState({ todos: [], pendientes: [], vencidos: [], pagados: [], resumen: {} });
  const [asistencia, setAsistencia] = useState([]);
  const [asistStats, setAsistStats] = useState({ total: 0, presentes: 0, porcentaje: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('perfil');
  const [perfilEditing, setPerfilEditing] = useState(false);
  const [perfilForm, setPerfilForm] = useState({ fecha_nacimiento: '', direccion: '', contacto_emergencia: '', telefono_emergencia: '', es_menor: false, nombre_menor: '', apellido_menor: '', dni_menor: '', fecha_nacimiento_menor: '' });
  const [perfilSaving, setPerfilSaving] = useState(false);
  const [perfilMsg, setPerfilMsg] = useState(null);
  const [showBaja, setShowBaja] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [pagando, setPagando] = useState(null);
  const [pagoMsg, setPagoMsg] = useState(null);
  const [showPagoModal, setShowPagoModal] = useState(null);
  const [showAnteriores, setShowAnteriores] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    // Manejar retorno de Sipago
    const pagoStatus = searchParams.get('pago');
    const pagoId = searchParams.get('id');
    if (pagoStatus === 'ok') {
      setPagoMsg({ ok: true, msg: 'Pago procesado correctamente' });
      setActiveTab('pagos');
      // Verificar estado real del pago
      if (pagoId && token) {
        apiAuthFetch(`/api/ateneo/pagos/${pagoId}/verificar`, {}, token).catch(() => {});
      }
      setSearchParams({}, { replace: true });
    } else if (pagoStatus === 'error') {
      setPagoMsg({ ok: false, msg: 'El pago no pudo completarse. Intentá nuevamente.' });
      setActiveTab('pagos');
      setSearchParams({}, { replace: true });
    } else if (pagoStatus === 'pendiente') {
      setPagoMsg({ ok: true, msg: 'Tu pago está siendo procesado. Puede demorar unos minutos.' });
      setActiveTab('pagos');
      setSearchParams({}, { replace: true });
    }
    // Support ?tab= URL parameter
    const tabParam = searchParams.get('tab');
    if (tabParam && ['perfil', 'clases', 'pagos', 'asistencia'].includes(tabParam)) {
      setActiveTab(tabParam);
      setSearchParams({}, { replace: true });
    }
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [perfilRes, insRes, pagRes] = await Promise.all([
        apiAuthFetch('/api/ateneo/alumnos/me/perfil', {}, token),
        apiAuthFetch('/api/ateneo/inscripciones/mis-inscripciones', {}, token),
        apiAuthFetch('/api/ateneo/pagos/mis-pagos', {}, token)
      ]);
      if (perfilRes.ok) {
        const data = await perfilRes.json();
        setPerfil(data);
        setPerfilForm({
          fecha_nacimiento: data.fecha_nacimiento || '',
          direccion: data.direccion || '',
          contacto_emergencia: data.contacto_emergencia || '',
          telefono_emergencia: data.telefono_emergencia || '',
          es_menor: data.es_menor || false,
          nombre_menor: data.nombre_menor || '',
          apellido_menor: data.apellido_menor || '',
          dni_menor: data.dni_menor || '',
          fecha_nacimiento_menor: data.fecha_nacimiento_menor || ''
        });
      }
      if (insRes.ok) {
        const data = await insRes.json();
        setInscripciones(data.inscripciones || data || []);
      }
      if (pagRes.ok) {
        const data = await pagRes.json();
        const sortByVenc = (arr) => [...arr].sort((a, b) => {
          const da = a.fecha_vencimiento ? new Date(a.fecha_vencimiento + 'T12:00:00') : new Date('2099-01-01');
          const db = b.fecha_vencimiento ? new Date(b.fecha_vencimiento + 'T12:00:00') : new Date('2099-01-01');
          return da - db;
        });
        setPagosData({
          todos: sortByVenc(data.todos || data || []),
          pendientes: sortByVenc(data.pendientes || []),
          vencidos: sortByVenc(data.vencidos || []),
          pagados: sortByVenc(data.pagados || []),
          resumen: data.resumen || {}
        });
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handlePagarClick = (pago) => {
    setPagoMsg(null);

    // Block if inscription is still pending (not confirmed by admin)
    const inscPendiente = inscripciones.find(i => i.clase_id === pago.clase_id && i.estado === 'pendiente');
    if (inscPendiente) {
      setShowPagoModal({ tipo: 'inscripcion_pendiente' });
      return;
    }

    const matriculaPendiente = pagosData.todos.find(p => p.tipo === 'matricula' && (p.estado === 'pendiente' || p.estado === 'vencido'));
    const cuotasPendientes = pagosData.todos.filter(p => p.tipo === 'cuota' && (p.estado === 'pendiente' || p.estado === 'vencido'));

    // If clicking a cuota but matrícula is still pending, block
    if (pago.tipo === 'cuota' && matriculaPendiente) {
      setShowPagoModal({ tipo: 'bloqueado', matricula: matriculaPendiente });
      return;
    }

    // If clicking matrícula and there are also cuotas, show info modal
    if (pago.tipo === 'matricula' && cuotasPendientes.length > 0) {
      setShowPagoModal({ tipo: 'matricula_info', pago, cuotasPendientes: cuotasPendientes.length });
      return;
    }

    // Direct payment
    handlePagarDirecto(pago.id);
  };

  const handlePagarDirecto = async (pagoId) => {
    setShowPagoModal(null);
    setPagando(pagoId);
    setPagoMsg(null);
    try {
      const res = await apiAuthFetch(`/api/ateneo/pagos/${pagoId}/iniciar-pago`, { method: 'POST' }, token);
      const data = await res.json();
      if (res.ok && data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        setPagoMsg({ ok: false, msg: data.error || 'Error al iniciar el pago' });
      }
    } catch (err) {
      setPagoMsg({ ok: false, msg: 'Error de conexión' });
    } finally {
      setPagando(null);
    }
  };

  const handleBaja = async () => {
    if (!showBaja) return;
    try {
      const res = await apiAuthFetch(`/api/ateneo/inscripciones/${showBaja.id}/baja`, {
        method: 'PUT', body: JSON.stringify({ motivo: motivoBaja || 'Baja voluntaria' })
      }, token);
      if (res.ok) {
        setShowBaja(null);
        setMotivoBaja('');
        loadData();
      }
    } catch (err) { console.error(err); }
  };

  const loadAsistencia = async (alumnoId) => {
    try {
      const res = await apiAuthFetch(`/api/ateneo/asistencia/alumno/${alumnoId}`, {}, token);
      if (res.ok) {
        const data = await res.json();
        const regs = data.asistencias || data.registros || data || [];
        setAsistencia(regs);
        if (data.stats) setAsistStats(data.stats);
        else {
          const t = regs.length;
          const p = regs.filter(r => r.presente).length;
          setAsistStats({ total: t, presentes: p, porcentaje: t > 0 ? Math.round((p / t) * 100) : 0 });
        }
      }
    } catch (err) { console.error(err); }
  };

  const handlePerfilSave = async () => {
    setPerfilSaving(true);
    setPerfilMsg(null);
    try {
      const res = await apiAuthFetch('/api/ateneo/alumnos/me/perfil', {
        method: 'PUT',
        body: JSON.stringify(perfilForm)
      }, token);
      if (res.ok) {
        setPerfilMsg({ ok: true, text: 'Perfil actualizado correctamente' });
        setPerfilEditing(false);
        loadData();
      } else {
        const data = await res.json();
        setPerfilMsg({ ok: false, text: data.error || 'Error al guardar' });
      }
    } catch (err) {
      setPerfilMsg({ ok: false, text: 'Error de conexion' });
    } finally {
      setPerfilSaving(false);
      setTimeout(() => setPerfilMsg(null), 4000);
    }
  };

  const tabs = [
    { id: 'perfil', label: 'Mi Perfil' },
    { id: 'clases', label: 'Mis Clases' },
    { id: 'pagos', label: 'Mis Pagos' },
    { id: 'asistencia', label: 'Asistencia' },
  ];

  const getEstadoBadge = (estado) => {
    const styles = {
      activo: { bg: '#d1fae5', color: '#059669' },
      confirmada: { bg: '#d1fae5', color: '#059669' },
      pendiente: { bg: '#fef3c7', color: '#d97706' },
      deuda: { bg: '#fee2e2', color: '#dc2626' },
      vencido: { bg: '#fee2e2', color: '#dc2626' },
      suspendido: { bg: '#fecaca', color: '#991b1b' },
      baja: { bg: '#fecaca', color: '#991b1b' },
      pagado: { bg: '#d1fae5', color: '#059669' },
      egresado: { bg: '#dbeafe', color: '#2563eb' }
    };
    const s = styles[estado] || styles.pendiente;
    return { padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600, background: s.bg, color: s.color };
  };

  return (
    <div style={{ minHeight: '60vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
        <h1 style={{ fontSize: theme.typography.h3, fontWeight: theme.typography.bold, margin: 0 }}>
          Mi Portal - Ateneo
        </h1>
        <Link to="/ateneo" style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, textDecoration: 'none' }}>
          Volver al Ateneo
        </Link>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: theme.spacing.lg,
        borderBottom: `2px solid ${theme.colors.border}`
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id === 'asistencia' && perfil?.id && asistencia.length === 0) loadAsistencia(perfil.id); }}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              background: activeTab === tab.id ? '#0d9488' : 'transparent',
              color: activeTab === tab.id ? '#fff' : theme.colors.textSecondary,
              border: 'none',
              borderRadius: `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0`,
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? theme.typography.semibold : theme.typography.regular,
              fontSize: theme.typography.small
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.xl, color: theme.colors.textMuted }}>Cargando...</div>
      ) : (
        <>
          {/* PERFIL TAB */}
          {activeTab === 'perfil' && perfil && (
            <div>
              {perfilMsg && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500,
                  background: perfilMsg.ok ? '#d1fae5' : '#fee2e2',
                  color: perfilMsg.ok ? '#059669' : '#dc2626',
                  border: `1px solid ${perfilMsg.ok ? '#a7f3d0' : '#fecaca'}`
                }}>
                  {perfilMsg.text}
                </div>
              )}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: isMobile ? 16 : 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18 }}>{perfil.usuario?.name || 'Sin nombre'}</h3>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{perfil.usuario?.email}</div>
                  </div>
                  <span style={getEstadoBadge(perfil.estado_academico || 'pendiente')}>
                    {perfil.estado_academico || 'pendiente'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                  <div>
                    <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>DNI</span>
                    <div style={{ fontSize: 14 }}>{perfil.dni || '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Telefono</span>
                    <div style={{ fontSize: 14 }}>{perfil.telefono || '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Fecha de ingreso</span>
                    <div style={{ fontSize: 14 }}>{formatDate(perfil.fecha_ingreso)}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h4 style={{ margin: 0, fontSize: 15 }}>Datos personales</h4>
                    {!perfilEditing && (
                      <button onClick={() => setPerfilEditing(true)} style={{
                        padding: '6px 14px', background: '#000000', color: '#fff',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
                      }}>Editar</button>
                    )}
                  </div>
                  {perfilEditing ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Fecha de nacimiento</label>
                          <DateInputMask style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.fecha_nacimiento} onChange={e => setPerfilForm({ ...perfilForm, fecha_nacimiento: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Direccion</label>
                          <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.direccion} onChange={e => setPerfilForm({ ...perfilForm, direccion: e.target.value })} placeholder="Tu direccion..." />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Contacto de emergencia</label>
                          <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.contacto_emergencia} onChange={e => setPerfilForm({ ...perfilForm, contacto_emergencia: e.target.value })} placeholder="Nombre del contacto..." />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Telefono de emergencia</label>
                          <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.telefono_emergencia} onChange={e => setPerfilForm({ ...perfilForm, telefono_emergencia: e.target.value })} placeholder="Telefono..." />
                        </div>
                      </div>
                      {/* Menor de edad - edicion */}
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: '#92400e', fontWeight: 500 }}>
                          <input type="checkbox" checked={perfilForm.es_menor} onChange={e => { const v = e.target.checked; setPerfilForm(f => ({ ...f, es_menor: v, ...(!v ? { nombre_menor: '', apellido_menor: '', dni_menor: '', fecha_nacimiento_menor: '' } : {}) })); }}
                            style={{ width: 16, height: 16, accentColor: '#7c3aed', cursor: 'pointer' }} />
                          El alumno inscripto es menor de edad
                        </label>
                        {perfilForm.es_menor && (
                          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 3 }}>Nombre del menor</label>
                              <input style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                                value={perfilForm.nombre_menor} onChange={e => setPerfilForm(f => ({...f, nombre_menor: e.target.value}))} placeholder="Nombre" />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 3 }}>Apellido del menor</label>
                              <input style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                                value={perfilForm.apellido_menor} onChange={e => setPerfilForm(f => ({...f, apellido_menor: e.target.value}))} placeholder="Apellido" />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 3 }}>DNI del menor</label>
                              <input style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                                value={perfilForm.dni_menor} onChange={e => setPerfilForm(f => ({...f, dni_menor: e.target.value.replace(/\D/g, '')}))} placeholder="Ej: 12345678" maxLength={8} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 3 }}>Fecha de nacimiento del menor</label>
                              <DateInputMask style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                                value={perfilForm.fecha_nacimiento_menor} onChange={e => setPerfilForm(f => ({...f, fecha_nacimiento_menor: e.target.value}))} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setPerfilEditing(false); setPerfilForm({ fecha_nacimiento: perfil.fecha_nacimiento || '', direccion: perfil.direccion || '', contacto_emergencia: perfil.contacto_emergencia || '', telefono_emergencia: perfil.telefono_emergencia || '', es_menor: perfil.es_menor || false, nombre_menor: perfil.nombre_menor || '', apellido_menor: perfil.apellido_menor || '', dni_menor: perfil.dni_menor || '', fecha_nacimiento_menor: perfil.fecha_nacimiento_menor || '' }); }} style={{
                          padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
                        }}>Cancelar</button>
                        <button onClick={handlePerfilSave} disabled={perfilSaving} style={{
                          padding: '8px 16px', background: perfilSaving ? '#9ca3af' : '#7c3aed', color: '#fff',
                          border: 'none', borderRadius: 6, cursor: perfilSaving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600
                        }}>{perfilSaving ? 'Guardando...' : 'Guardar'}</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                        <div>
                          <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Fecha de nacimiento</span>
                          <div style={{ fontSize: 14 }}>{formatDate(perfil.fecha_nacimiento)}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Direccion</span>
                          <div style={{ fontSize: 14 }}>{perfil.direccion || '-'}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Contacto de emergencia</span>
                          <div style={{ fontSize: 14 }}>{perfil.contacto_emergencia || '-'}</div>
                        </div>
                        <div>
                          <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Telefono de emergencia</span>
                          <div style={{ fontSize: 14 }}>{perfil.telefono_emergencia || '-'}</div>
                        </div>
                      </div>
                      {/* Datos del menor - solo lectura */}
                      {perfil.es_menor && (
                        <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 16 }}>
                          <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#92400e' }}>Alumno/a inscripto/a (menor de edad)</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                            <div>
                              <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Nombre</span>
                              <div style={{ fontSize: 14 }}>{perfil.nombre_menor || '-'}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Apellido</span>
                              <div style={{ fontSize: 14 }}>{perfil.apellido_menor || '-'}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>DNI</span>
                              <div style={{ fontSize: 14 }}>{perfil.dni_menor || '-'}</div>
                            </div>
                            <div>
                              <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Fecha de nacimiento</span>
                              <div style={{ fontSize: 14 }}>{formatDate(perfil.fecha_nacimiento_menor)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'perfil' && !perfil && user && (
            <div>
              {perfilMsg && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500,
                  background: perfilMsg.ok ? '#d1fae5' : '#fee2e2',
                  color: perfilMsg.ok ? '#059669' : '#dc2626',
                  border: `1px solid ${perfilMsg.ok ? '#a7f3d0' : '#fecaca'}`
                }}>
                  {perfilMsg.text}
                </div>
              )}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: isMobile ? 16 : 24 }}>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: 0, fontSize: 18 }}>{user.name || 'Sin nombre'}</h3>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{user.email}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
                  <div>
                    <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>DNI</span>
                    <div style={{ fontSize: 14 }}>{user.dni || '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Telefono</span>
                    <div style={{ fontSize: 14 }}>{user.phone || '-'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Localidad</span>
                    <div style={{ fontSize: 14 }}>{user.localidad || '-'}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h4 style={{ margin: 0, fontSize: 15 }}>Datos personales</h4>
                    {!perfilEditing && (
                      <button onClick={() => setPerfilEditing(true)} style={{
                        padding: '6px 14px', background: '#000000', color: '#fff',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
                      }}>Editar</button>
                    )}
                  </div>
                  {perfilEditing ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Fecha de nacimiento</label>
                          <DateInputMask style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.fecha_nacimiento} onChange={e => setPerfilForm({ ...perfilForm, fecha_nacimiento: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Direccion</label>
                          <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.direccion} onChange={e => setPerfilForm({ ...perfilForm, direccion: e.target.value })} placeholder="Tu direccion..." />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Contacto de emergencia</label>
                          <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.contacto_emergencia} onChange={e => setPerfilForm({ ...perfilForm, contacto_emergencia: e.target.value })} placeholder="Nombre del contacto..." />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Telefono de emergencia</label>
                          <input style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                            value={perfilForm.telefono_emergencia} onChange={e => setPerfilForm({ ...perfilForm, telefono_emergencia: e.target.value })} placeholder="Telefono..." />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setPerfilEditing(false); setPerfilForm({ fecha_nacimiento: '', direccion: '', contacto_emergencia: '', telefono_emergencia: '' }); }} style={{
                          padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
                        }}>Cancelar</button>
                        <button onClick={handlePerfilSave} disabled={perfilSaving} style={{
                          padding: '8px 16px', background: perfilSaving ? '#9ca3af' : '#7c3aed', color: '#fff',
                          border: 'none', borderRadius: 6, cursor: perfilSaving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600
                        }}>{perfilSaving ? 'Guardando...' : 'Guardar'}</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                      <div>
                        <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Fecha de nacimiento</span>
                        <div style={{ fontSize: 14 }}>-</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Direccion</span>
                        <div style={{ fontSize: 14 }}>-</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Contacto de emergencia</span>
                        <div style={{ fontSize: 14 }}>-</div>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4, fontWeight: 500 }}>Telefono de emergencia</span>
                        <div style={{ fontSize: 14 }}>-</div>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{
                  background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8,
                  padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 20
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#92400e' }}>No tenes inscripciones activas</div>
                    <div style={{ fontSize: 12, color: '#a16207', marginTop: 2 }}>Inscribite a una clase para completar tu perfil de alumno.</div>
                  </div>
                  <Link to="/ateneo" style={{
                    padding: '8px 16px', background: '#000000', color: '#fff',
                    borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap'
                  }}>Ver oferta</Link>
                </div>
              </div>
            </div>
          )}

          {/* CLASES TAB */}
          {activeTab === 'clases' && (() => {
            const activas = inscripciones.filter(i => i.estado === 'pendiente' || i.estado === 'confirmada');
            const anteriores = inscripciones.filter(i => i.estado !== 'pendiente' && i.estado !== 'confirmada');
            const renderClaseCard = (i) => (
              <div key={i.id} style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.borderRadius.lg,
                padding: theme.spacing.lg,
                opacity: (i.estado === 'baja') ? 0.7 : 1
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
                  <h3 style={{ margin: 0, fontSize: theme.typography.h5 }}>
                    {i.clase?.nombre || `Clase #${i.clase_id}`}
                  </h3>
                  <span style={getEstadoBadge(i.estado || 'pendiente')}>
                    {i.estado || 'pendiente'}
                  </span>
                </div>
                {i.clase?.docente && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    Docente: {i.clase.docente.name}
                  </div>
                )}
                {/* Horarios multi-dia */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: theme.spacing.sm }}>
                  {i.clase?.horarios && i.clase.horarios.length > 0 ? (
                    i.clase.horarios.map((h, idx) => (
                      <span key={idx} style={{
                        padding: '2px 8px', background: '#ede9fe', color: '#7c3aed',
                        borderRadius: 8, fontSize: 11, fontWeight: 500
                      }}>
                        {i.clase?.taller_corto && h.fecha ? formatDate(h.fecha) : h.dia_semana} {(h.hora_inicio||'').substring(0,5)}-{(h.hora_fin||'').substring(0,5)}
                      </span>
                    ))
                  ) : i.clase?.horario ? (
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{i.clase.horario}</span>
                  ) : null}
                </div>
                {i.clase?.ubicacion && (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{i.clase.ubicacion}</div>
                )}
                {(i.estado === 'pendiente' || i.estado === 'confirmada') && (
                  <button onClick={() => { setShowBaja(i); setMotivoBaja(''); }} style={{
                    marginTop: 10, padding: '6px 14px', background: 'transparent',
                    color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6,
                    cursor: 'pointer', fontSize: 12, fontWeight: 500, width: '100%'
                  }}>
                    Darme de baja
                  </button>
                )}
                {i.estado === 'baja' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                    Baja: {i.motivo_baja || 'Sin motivo'}
                  </div>
                )}
              </div>
            );
            return (
            <div>
              {activas.length === 0 && anteriores.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: theme.spacing['2xl'],
                  background: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.lg,
                  color: theme.colors.textSecondary
                }}>
                  <p style={{ fontSize: theme.typography.h5, marginBottom: theme.spacing.sm }}>No tenes inscripciones activas</p>
                  <Link to="/ateneo" style={{ color: theme.colors.primaryDark, textDecoration: 'none', fontWeight: theme.typography.semibold }}>
                    Ver oferta
                  </Link>
                </div>
              ) : (
                <>
                  {activas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', background: '#f9fafb', borderRadius: 8, color: '#6b7280', marginBottom: 16 }}>
                      No tenés clases activas actualmente.{' '}
                      <Link to="/ateneo" style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}>Ver clases disponibles</Link>
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                      gap: theme.spacing.md
                    }}>
                      {activas.map(renderClaseCard)}
                    </div>
                  )}

                  {anteriores.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <button onClick={() => setShowAnteriores(!showAnteriores)} style={{
                        width: '100%', padding: '10px 16px', background: '#f9fafb',
                        border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer',
                        fontSize: 13, color: '#6b7280', fontWeight: 500,
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6
                      }}>
                        {showAnteriores ? '▲ Ocultar anteriores' : `▼ Ver anteriores (${anteriores.length})`}
                      </button>
                      {showAnteriores && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
                          gap: theme.spacing.md,
                          marginTop: 12
                        }}>
                          {anteriores.map(renderClaseCard)}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Modal baja */}
              {showBaja && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', zIndex: 1000, padding: 16
                }}>
                  <div style={{
                    background: '#fff', borderRadius: 8, padding: 24, maxWidth: 400, width: '100%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                  }}>
                    <h3 style={{ marginTop: 0, fontSize: 16 }}>Confirmar baja</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
                      Vas a darte de baja de <strong>{showBaja.clase?.nombre}</strong>. Esta accion no se puede deshacer.
                    </p>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Motivo (opcional)</label>
                      <textarea style={{
                        width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6,
                        fontSize: 13, minHeight: 50, boxSizing: 'border-box'
                      }} value={motivoBaja} onChange={e => setMotivoBaja(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowBaja(null)} style={{
                        padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
                      }}>Cancelar</button>
                      <button onClick={handleBaja} style={{
                        padding: '8px 16px', background: '#dc2626', color: '#fff',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
                      }}>Confirmar baja</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Calendario integrado en Mis Clases */}
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px', color: '#374151' }}>Calendario</h3>
                <CalendarioTab perfil={perfil} inscripciones={inscripciones} />
              </div>
            </div>
          );
          })()}

          {/* ASISTENCIA TAB */}
          {activeTab === 'asistencia' && (
            <div>
              {asistencia.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', background: '#f9fafb', borderRadius: 8, color: '#6b7280' }}>
                  No hay registros de asistencia
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{ padding: '12px 20px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: 11, color: '#166534' }}>Presentes</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>{asistStats.presentes}</div>
                    </div>
                    <div style={{ padding: '12px 20px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: 11, color: '#991b1b' }}>Ausentes</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{asistStats.total - asistStats.presentes}</div>
                    </div>
                    <div style={{ padding: '12px 20px', background: asistStats.porcentaje >= 80 ? '#f0fdf4' : asistStats.porcentaje >= 50 ? '#fefce8' : '#fef2f2', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 11, color: '#374151' }}>Asistencia</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: asistStats.porcentaje >= 80 ? '#059669' : asistStats.porcentaje >= 50 ? '#d97706' : '#dc2626' }}>{asistStats.porcentaje}%</div>
                    </div>
                  </div>
                  {isMobile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {asistencia.map(r => (
                        <div key={r.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, flexShrink: 0,
                            background: r.presente ? '#d1fae5' : '#fee2e2',
                            color: r.presente ? '#059669' : '#dc2626'
                          }}>
                            {r.presente ? 'P' : 'A'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(r.fecha)} · {r.clase?.nombre || '-'}</div>
                            {r.observaciones && <div style={{ fontSize: 11, color: '#6b7280' }}>{r.observaciones}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={thS}>Fecha</th>
                            <th style={thS}>Clase</th>
                            <th style={{...thS, textAlign: 'center'}}>Estado</th>
                            <th style={thS}>Observaciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {asistencia.map(r => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={tdS}>{formatDate(r.fecha)}</td>
                              <td style={tdS}>{r.clase?.nombre || '-'}</td>
                              <td style={{...tdS, textAlign: 'center'}}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600,
                                  background: r.presente ? '#d1fae5' : '#fee2e2',
                                  color: r.presente ? '#059669' : '#dc2626'
                                }}>
                                  {r.presente ? 'Presente' : 'Ausente'}
                                </span>
                              </td>
                              <td style={{...tdS, color: '#6b7280', fontSize: 12}}>{r.observaciones || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* PAGOS TAB */}
          {activeTab === 'pagos' && (
            <div>
              {pagoMsg && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500,
                  background: pagoMsg.ok ? '#d1fae5' : '#fee2e2',
                  color: pagoMsg.ok ? '#059669' : '#dc2626',
                  border: `1px solid ${pagoMsg.ok ? '#a7f3d0' : '#fecaca'}`
                }}>
                  {pagoMsg.msg}
                </div>
              )}
              {pagosData.todos.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: theme.spacing['2xl'],
                  background: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.lg,
                  color: theme.colors.textSecondary
                }}>
                  No hay pagos registrados
                </div>
              ) : (
                <>
                  {/* Resumen */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    <div style={{ padding: '12px 20px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: 11, color: '#166534' }}>Pagados</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>{pagosData.pagados.length}</div>
                    </div>
                    <div style={{ padding: '12px 20px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
                      <div style={{ fontSize: 11, color: '#854d0e' }}>Pendientes</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>{pagosData.pendientes.length}</div>
                    </div>
                    {pagosData.vencidos.length > 0 && (
                      <div style={{ padding: '12px 20px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                        <div style={{ fontSize: 11, color: '#991b1b' }}>Vencidos</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{pagosData.vencidos.length}</div>
                      </div>
                    )}
                  </div>

                  {isMobile ? (
                    /* Mobile: Cards */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {pagosData.todos.map(p => (
                        <div key={p.id} style={{
                          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <strong style={{ fontSize: 13 }}>{formatConcepto(p)}</strong>
                            <span style={getEstadoBadge(p.estado || 'pendiente')}>{p.estado || 'pendiente'}</span>
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{p.clase?.nombre || '-'}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div>
                              {esCuotaVencida(p) ? (
                                <span style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>
                                  <span style={{ textDecoration: 'line-through', color: '#dc2626', fontSize: 14, marginRight: 6 }}>${Number(p.monto_final || 0).toLocaleString('es-AR')}</span>
                                  ${montoConRecargo(p).toLocaleString('es-AR')}
                                </span>
                              ) : parseFloat(p.monto_original) > 0 && parseFloat(p.monto_final) < parseFloat(p.monto_original) ? (
                                <span style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>
                                  <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: 13, marginRight: 6 }}>${Number(p.monto_original).toLocaleString('es-AR')}</span>
                                  ${Number(p.monto_final || 0).toLocaleString('es-AR')}
                                </span>
                              ) : (
                                <span style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>${Number(p.monto_final || 0).toLocaleString('es-AR')}</span>
                              )}
                              {parseFloat(p.monto_original) > 0 && parseFloat(p.monto_final) < parseFloat(p.monto_original) && p.estado !== 'pagado' && (
                                <div style={{ fontSize: 10, color: '#059669', fontWeight: 600, marginTop: 2 }}>Beca aplicada ({Math.round((1 - parseFloat(p.monto_final) / parseFloat(p.monto_original)) * 100)}% desc.)</div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 12, color: '#6b7280' }}>Vence: {formatDate(p.fecha_vencimiento)}</div>
                              {esCuotaVencida(p) && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>Pago vencido, 15% de recargo</div>}
                            </div>
                          </div>
                          {(p.estado === 'pendiente' || p.estado === 'vencido') && (
                            <button onClick={() => handlePagarClick(p)} disabled={pagando === p.id} style={{
                              width: '100%', padding: '8px 14px', background: pagando === p.id ? '#9ca3af' : '#7c3aed',
                              color: '#fff', border: 'none', borderRadius: 6, cursor: pagando === p.id ? 'wait' : 'pointer',
                              fontSize: 13, fontWeight: 600
                            }}>
                              {pagando === p.id ? 'Procesando...' : 'Pagar'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Desktop: Table */
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={thS}>Concepto</th>
                            <th style={thS}>Clase</th>
                            <th style={thS}>Monto</th>
                            <th style={{...thS, textAlign: 'center'}}>Estado</th>
                            <th style={thS}>Vencimiento</th>
                            <th style={{...thS, textAlign: 'center'}}>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagosData.todos.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={tdS}>{formatConcepto(p)}</td>
                              <td style={tdS}>{p.clase?.nombre || '-'}</td>
                              <td style={tdS}>
                                {esCuotaVencida(p) ? (
                                  <>
                                    <span style={{ textDecoration: 'line-through', color: '#dc2626', fontSize: 12 }}>${Number(p.monto_final || 0).toLocaleString('es-AR')}</span>
                                    {' '}<strong>${montoConRecargo(p).toLocaleString('es-AR')}</strong>
                                  </>
                                ) : parseFloat(p.monto_original) > 0 && parseFloat(p.monto_final) < parseFloat(p.monto_original) ? (
                                  <>
                                    <span style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: 12 }}>${Number(p.monto_original).toLocaleString('es-AR')}</span>
                                    {' '}<strong>${Number(p.monto_final || 0).toLocaleString('es-AR')}</strong>
                                    {p.estado !== 'pagado' && <div style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>Beca ({Math.round((1 - parseFloat(p.monto_final) / parseFloat(p.monto_original)) * 100)}% desc.)</div>}
                                  </>
                                ) : (
                                  `$${Number(p.monto_final || 0).toLocaleString('es-AR')}`
                                )}
                              </td>
                              <td style={{...tdS, textAlign: 'center'}}>
                                <span style={getEstadoBadge(p.estado || 'pendiente')}>{p.estado || 'pendiente'}</span>
                              </td>
                              <td style={tdS}>
                                <span style={{ color: '#6b7280' }}>{formatDate(p.fecha_vencimiento)}</span>
                                {esCuotaVencida(p) && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>Pago vencido, 15% de recargo</div>}
                              </td>
                              <td style={{...tdS, textAlign: 'center'}}>
                                {(p.estado === 'pendiente' || p.estado === 'vencido') ? (
                                  <button onClick={() => handlePagarClick(p)} disabled={pagando === p.id} style={{
                                    padding: '5px 14px', background: pagando === p.id ? '#9ca3af' : '#7c3aed',
                                    color: '#fff', border: 'none', borderRadius: 6,
                                    cursor: pagando === p.id ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600
                                  }}>
                                    {pagando === p.id ? 'Procesando...' : 'Pagar'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* Payment modal */}
              {showPagoModal && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', zIndex: 1000, padding: 16
                }}>
                  <div style={{
                    background: '#fff', borderRadius: 8, padding: 24, maxWidth: 440, width: '100%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                  }}>
                    {showPagoModal.tipo === 'inscripcion_pendiente' && (
                      <>
                        <h3 style={{ marginTop: 0, fontSize: 16, color: '#d97706' }}>Inscripcion pendiente de confirmacion</h3>
                        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                          Tu inscripcion aun no fue confirmada por la administracion del Ateneo. Una vez confirmada, podras abonar la matricula y las cuotas.
                        </p>
                        <p style={{ fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '8px 12px', borderRadius: 6, lineHeight: 1.5, margin: '12px 0' }}>
                          También podés abonar en efectivo en el teatro de miércoles a viernes de 18:00 a 20:30.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setShowPagoModal(null)} style={{
                            padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
                          }}>Entendido</button>
                        </div>
                      </>
                    )}
                    {showPagoModal.tipo === 'bloqueado' && (
                      <>
                        <h3 style={{ marginTop: 0, fontSize: 16, color: '#dc2626' }}>Matricula pendiente</h3>
                        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                          Recorda que primero debes abonar la matricula para poder avanzar con tu inscripcion y pago de cuotas.
                        </p>
                        <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, marginBottom: 12 }}>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>Matricula pendiente</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
                            ${Number(showPagoModal.matricula.monto_final || 0).toLocaleString('es-AR')}
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '8px 12px', borderRadius: 6, lineHeight: 1.5, margin: '0 0 16px' }}>
                          También podés abonar en efectivo en el teatro de miércoles a viernes de 18:00 a 20:30.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setShowPagoModal(null)} style={{
                            padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
                          }}>Cerrar</button>
                          <button onClick={() => handlePagarDirecto(showPagoModal.matricula.id)} style={{
                            padding: '8px 16px', background: '#000000', color: '#fff',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
                          }}>Pagar matricula</button>
                        </div>
                      </>
                    )}
                    {showPagoModal.tipo === 'matricula_info' && (
                      <>
                        <h3 style={{ marginTop: 0, fontSize: 16 }}>Pagar matricula</h3>
                        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                          Al abonar la matricula se confirmara tu inscripcion. Luego podras pagar las {showPagoModal.cuotasPendientes} cuota(s) pendiente(s).
                        </p>
                        <div style={{ padding: 12, background: '#f9fafb', borderRadius: 6, marginBottom: 12 }}>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>Matricula</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>
                            ${Number(showPagoModal.pago.monto_final || 0).toLocaleString('es-AR')}
                          </div>
                        </div>
                        <p style={{ fontSize: 12, color: '#7c3aed', background: '#f5f3ff', padding: '8px 12px', borderRadius: 6, lineHeight: 1.5, margin: '0 0 16px' }}>
                          También podés abonar en efectivo en el teatro de miércoles a viernes de 18:00 a 20:30.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => setShowPagoModal(null)} style={{
                            padding: '8px 16px', background: '#f3f4f6', color: '#374151',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
                          }}>Cancelar</button>
                          <button onClick={() => handlePagarDirecto(showPagoModal.pago.id)} style={{
                            padding: '8px 16px', background: '#000000', color: '#fff',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
                          }}>Pagar matricula</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </>
      )}
    </div>
  );
}

function CalendarioTab({ perfil, inscripciones }) {
  const { token } = useAuth();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [mesActual, setMesActual] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [feriados, setFeriados] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);

  const DIAS_SEMANA_MAP = {
    'Lunes': 1, 'Martes': 2, 'Miercoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sabado': 6, 'Domingo': 0
  };
  const DIAS_NOMBRE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  useEffect(() => {
    const loadFeriados = async () => {
      try {
        const anio = mesActual.getFullYear();
        const res = await apiAuthFetch(`/api/ateneo/feriados?anio=${anio}`, {}, token);
        if (res.ok) { const d = await res.json(); setFeriados(d.feriados || d || []); }
      } catch (err) { console.error(err); }
    };
    loadFeriados();
  }, [mesActual.getFullYear()]);

  // Reset selected day when month changes
  useEffect(() => { setSelectedDay(null); }, [mesActual]);

  const feriadosSet = new Set(feriados.map(f => f.fecha));
  const feriadosMap = {};
  feriados.forEach(f => { feriadosMap[f.fecha] = f.descripcion; });

  const clasesActivas = (inscripciones || [])
    .filter(i => i.estado === 'confirmada' || i.estado === 'pendiente')
    .map(i => i.clase)
    .filter(Boolean);

  // Per-class color palette (no red - reserved for feriados)
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
            result.push({ clase: clase.nombre, hora: `${(h.hora_inicio || '').substring(0, 5)}-${(h.hora_fin || '').substring(0, 5)}`, color: colorMap[clase.nombre] || CLASS_COLORS[0] });
          }
        } else if (DIAS_SEMANA_MAP[h.dia_semana] === diaSemana) {
          result.push({ clase: clase.nombre, hora: `${(h.hora_inicio || '').substring(0, 5)}-${(h.hora_fin || '').substring(0, 5)}`, color: colorMap[clase.nombre] || CLASS_COLORS[0] });
        }
      }
    }
    return result;
  };

  const mesLabel = formatMonthYear(mesActual);
  const hoy = new Date();
  const esHoy = (dia) => dia && hoy.getFullYear() === mesActual.getFullYear() && hoy.getMonth() === mesActual.getMonth() && hoy.getDate() === dia;
  const esFeriado = (dia) => dia && feriadosSet.has(getFechaStr(dia));

  // Selected day detail
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
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              {(isMobile ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'] : ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']).map(d => (
                <div key={d} style={{ padding: isMobile ? '6px 2px' : '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{d}</div>
              ))}
            </div>
            {/* Calendar grid - fixed cell sizes */}
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
                      height: isMobile ? 44 : 80,
                      padding: isMobile ? 2 : 4,
                      borderRight: '1px solid #f3f4f6',
                      borderBottom: '1px solid #f3f4f6',
                      background: isSelected ? '#ede9fe' : feriado ? '#fef2f2' : esHoy(dia) ? '#f5f3ff' : dia ? '#fff' : '#f9fafb',
                      cursor: dia ? 'pointer' : 'default',
                      overflow: 'hidden',
                      position: 'relative',
                      outline: isSelected ? '2px solid #7c3aed' : 'none',
                      outlineOffset: '-2px',
                      borderRadius: isSelected ? 2 : 0
                    }}
                  >
                    {dia && (
                      <>
                        {/* Day number */}
                        <div style={{
                          fontSize: isMobile ? 12 : 13,
                          fontWeight: esHoy(dia) ? 700 : 400,
                          color: feriado ? '#dc2626' : esHoy(dia) ? '#7c3aed' : '#374151',
                          textAlign: isMobile ? 'center' : 'left',
                          lineHeight: 1.2
                        }}>{dia}</div>

                        {isMobile ? (
                          /* Mobile: colored dots */
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 2, flexWrap: 'wrap' }}>
                            {hasClases && clasesDia.map((c, i) => (
                              <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: c.color.dot }} />
                            ))}
                            {feriado && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#dc2626' }} />}
                          </div>
                        ) : (
                          /* Desktop: compact chips with fixed layout */
                          <div style={{ marginTop: 2, overflow: 'hidden', maxHeight: 52 }}>
                            {feriado && (
                              <div style={{
                                padding: '1px 3px', background: '#fee2e2', color: '#dc2626',
                                borderRadius: 3, fontSize: 8, fontWeight: 500, marginBottom: 1,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                              }}>
                                {feriadosMap[getFechaStr(dia)]}
                              </div>
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

          {/* Selected day detail panel */}
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
                <div style={{
                  padding: '6px 10px', background: '#fef2f2', color: '#dc2626', borderRadius: 6,
                  fontSize: 12, fontWeight: 500, marginBottom: 8
                }}>
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

          {/* Legend */}
          <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {clasesActivas.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: (colorMap[c.nombre] || CLASS_COLORS[0]).dot }} />
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

function InfoField({ label, value, span = 1 }) {
  return (
    <div style={{ gridColumn: span > 1 ? `1 / -1` : undefined }}>
      <span style={{ fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 2 }}>{label}</span>
      <div style={{ fontSize: 14 }}>{value || '-'}</div>
    </div>
  );
}

const thS = { padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600 };
const tdS = { padding: '10px 12px', fontSize: '13px' };
