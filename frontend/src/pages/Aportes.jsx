import { useState, useEffect } from 'react';
import { theme } from '../styles/theme.js';
import { useLocation, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function Aportes() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Estados
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [view, setView] = useState('form'); // 'form', 'my-aportes', 'success'

  // Form data
  const [formData, setFormData] = useState({
    dni: '',
    email: '',
    nombre: '',
    apellido: '',
    telefono: '',
    provincia: '',
    localidad: '',
    cantidad: 1,
    referido_dni: ''
  });

  // Mis aportes data
  const [myAportes, setMyAportes] = useState(null);
  const [searchDni, setSearchDni] = useState('');

  // Provincias y localidades
  const [provincias, setProvincias] = useState([]);
  const [localidades, setLocalidades] = useState([]);

  // Cargar configuración inicial
  useEffect(() => {
    fetchConfig();
    fetchProvincias();
    
    // Check URL params for MP callback
    const params = new URLSearchParams(location.search);
    const collectionStatus = params.get('collection_status');
    const preferenceId = params.get('preference_id');
    
    if (collectionStatus === 'approved') {
      setView('success');
      setSuccess('¡Tu pago fue aprobado! En breve recibirás un email con tu número de aporte.');
    } else if (collectionStatus === 'rejected') {
      setError('El pago fue rechazado. Por favor intentá nuevamente.');
    }
  }, [location]);

  // Cargar localidades cuando cambia provincia
  useEffect(() => {
    if (formData.provincia) {
      fetchLocalidades(formData.provincia);
    }
  }, [formData.provincia]);

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/api/aportes/config`);
      const data = await response.json();
      setConfig(data);
    } catch (e) {
      console.error('Error fetching config:', e);
    }
  };

  const fetchProvincias = async () => {
    try {
      const response = await fetch(`${API_URL}/api/locations/provinces`);
      const data = await response.json();
      setProvincias(data.provinces || []);
    } catch (e) {
      console.error('Error fetching provincias:', e);
    }
  };

  const fetchLocalidades = async (provincia) => {
    try {
      const response = await fetch(`${API_URL}/api/locations/localities/${encodeURIComponent(provincia)}`);
      const data = await response.json();
      setLocalidades(data.localidades || []);
    } catch (e) {
      console.error('Error fetching localidades:', e);
    }
  };

  const fetchMyAportes = async () => {
    if (!searchDni || !/^\d{7,8}$/.test(searchDni)) {
      setError('Ingresá un DNI válido (7-8 dígitos)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/aportes/my-aportes?dni=${searchDni}`);
      const data = await response.json();
      
      if (response.ok) {
        setMyAportes(data);
        setView('my-aportes');
      } else {
        setError(data.error || 'Error al buscar tus aportes');
      }
    } catch (e) {
      setError('Error de conexión. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validaciones
    if (!/^\d{7,8}$/.test(formData.dni)) {
      setError('El DNI debe tener 7 u 8 dígitos');
      setLoading(false);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Ingresá un email válido');
      setLoading(false);
      return;
    }

    if (!formData.nombre || !formData.apellido || !formData.telefono || !formData.provincia || !formData.localidad) {
      setError('Completá todos los campos obligatorios');
      setLoading(false);
      return;
    }

    // Si ingresó referido, validar que sea diferente a su propio DNI
    if (formData.referido_dni && formData.referido_dni === formData.dni) {
      setError('No podés usar tu propio DNI como código de referido');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/aportes/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok && data.checkout_url) {
        // Redirigir a MercadoPago
        window.location.href = data.checkout_url;
      } else {
        setError(data.error || 'Error al crear el pago. Intentá nuevamente.');
      }
    } catch (e) {
      setError('Error de conexión. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const containerStyle = {
    maxWidth: '800px',
    margin: '0 auto',
    padding: isMobile ? '16px' : '32px',
  };

  const cardStyle = {
    background: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: isMobile ? '20px' : '32px',
    marginBottom: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  };

  const inputStyle = {
    width: '100%',
    padding: '12px',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.body,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    fontWeight: theme.typography.medium,
  };

  const buttonStyle = {
    padding: '14px 28px',
    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.body,
    fontWeight: theme.typography.semibold,
    cursor: loading ? 'wait' : 'pointer',
    width: '100%',
    opacity: loading ? 0.7 : 1,
  };

  const renderHero = () => (
    <div style={{
      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
      borderRadius: theme.borderRadius.lg,
      padding: isMobile ? '32px 20px' : '48px',
      marginBottom: '32px',
      textAlign: 'center',
      color: '#ffffff',
    }}>
      <h1 style={{ 
        fontSize: isMobile ? '28px' : '36px', 
        margin: '0 0 16px 0',
        fontWeight: '700',
      }}>
        Aporte Solidario
      </h1>
      <p style={{ 
        fontSize: isMobile ? '16px' : '18px', 
        margin: '0 0 24px 0',
        opacity: 0.95,
      }}>
        Apoyá al Teatro Español Pigüé y ganá chances para sorteos especiales
      </p>
      <div style={{
        display: 'inline-block',
        background: 'rgba(255,255,255,0.2)',
        padding: '16px 32px',
        borderRadius: theme.borderRadius.md,
        backdropFilter: 'blur(10px)',
      }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '14px', opacity: 0.9 }}>Bono Contribución</p>
        <p style={{ margin: 0, fontSize: '32px', fontWeight: '700' }}>
          ${config?.monto_aporte?.toLocaleString('es-AR') || '5.000'}
        </p>
      </div>
    </div>
  );

  const renderBenefits = () => (
    <div style={cardStyle}>
      <h2 style={{ 
        fontSize: '20px', 
        margin: '0 0 24px 0',
        color: theme.colors.textPrimary,
      }}>
        ¿Qué incluye tu aporte?
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: '20px',
      }}>
        <div style={{
          background: '#f0fdf4',
          padding: '20px',
          borderRadius: theme.borderRadius.md,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎁</div>
          <h3 style={{ fontSize: '16px', margin: '0 0 8px 0', color: '#065f46' }}>Sorteos Especiales</h3>
          <p style={{ fontSize: '14px', margin: 0, color: '#047857' }}>
            Participás en sorteos exclusivos para aportantes
          </p>
        </div>
        <div style={{
          background: '#eff6ff',
          padding: '20px',
          borderRadius: theme.borderRadius.md,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎫</div>
          <h3 style={{ fontSize: '16px', margin: '0 0 8px 0', color: '#1e40af' }}>Tickets Extras</h3>
          <p style={{ fontSize: '14px', margin: 0, color: '#1d4ed8' }}>
            4 aportes = 5 tickets en tus compras
          </p>
        </div>
        <div style={{
          background: '#fef3c7',
          padding: '20px',
          borderRadius: theme.borderRadius.md,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎉</div>
          <h3 style={{ fontSize: '16px', margin: '0 0 8px 0', color: '#92400e' }}>Sorpresas</h3>
          <p style={{ fontSize: '14px', margin: 0, color: '#b45309' }}>
            Regalos sorpresa durante el vivo de YouTube
          </p>
        </div>
      </div>
    </div>
  );

  const renderReferidosInfo = () => (
    <div style={{
      ...cardStyle,
      background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
      color: '#ffffff',
    }}>
      <h2 style={{ 
        fontSize: '20px', 
        margin: '0 0 16px 0',
      }}>
        🤝 Sistema de Referidos
      </h2>
      <p style={{ margin: '0 0 16px 0', opacity: 0.95 }}>
        Compartí tu DNI con amigos para que lo usen como código de referido al aportar.
      </p>
      <ul style={{ 
        margin: '0 0 16px 0', 
        paddingLeft: '20px',
        opacity: 0.95,
      }}>
        <li style={{ marginBottom: '8px' }}>Vos ganás <strong>+1 aporte extra</strong> por cada referido</li>
        <li>Tu amigo también gana <strong>+1 aporte extra</strong></li>
      </ul>
      <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
        Más amigos invitás = Más chances de ganar 🏆
      </p>
    </div>
  );

  const renderForm = () => (
    <div style={cardStyle}>
      <h2 style={{ 
        fontSize: '22px', 
        margin: '0 0 8px 0',
        color: theme.colors.textPrimary,
      }}>
        Hacé tu aporte
      </h2>
      <p style={{ 
        fontSize: '14px', 
        margin: '0 0 24px 0',
        color: theme.colors.textSecondary,
      }}>
        Completá tus datos para generar tu pago seguro con MercadoPago
      </p>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #ef4444',
          borderRadius: theme.borderRadius.md,
          padding: '12px 16px',
          marginBottom: '20px',
          color: '#dc2626',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: '16px',
          marginBottom: '20px',
        }}>
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleInputChange}
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Apellido *</label>
            <input
              type="text"
              name="apellido"
              value={formData.apellido}
              onChange={handleInputChange}
              style={inputStyle}
              required
            />
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: '16px',
          marginBottom: '20px',
        }}>
          <div>
            <label style={labelStyle}>DNI *</label>
            <input
              type="text"
              name="dni"
              value={formData.dni}
              onChange={handleInputChange}
              style={inputStyle}
              placeholder="12345678"
              maxLength={8}
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Teléfono *</label>
            <input
              type="tel"
              name="telefono"
              value={formData.telefono}
              onChange={handleInputChange}
              style={inputStyle}
              placeholder="+54 2923 123456"
              required
            />
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Email *</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            style={inputStyle}
            placeholder="tu@email.com"
            required
          />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: '16px',
          marginBottom: '20px',
        }}>
          <div>
            <label style={labelStyle}>Provincia *</label>
            <select
              name="provincia"
              value={formData.provincia}
              onChange={handleInputChange}
              style={inputStyle}
              required
            >
              <option value="">Seleccioná...</option>
              {provincias.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Localidad *</label>
            <select
              name="localidad"
              value={formData.localidad}
              onChange={handleInputChange}
              style={inputStyle}
              disabled={!formData.provincia}
              required
            >
              <option value="">Seleccioná...</option>
              {localidades.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Selector de cantidad */}
        {(() => {
          const OPCIONES = [
            { cantidad: 1,  numeros: 1,  bonus: 0,  label: null },
            { cantidad: 2,  numeros: 2,  bonus: 0,  label: null },
            { cantidad: 4,  numeros: 5,  bonus: 1,  label: 'POPULAR' },
            { cantidad: 6,  numeros: 8,  bonus: 2,  label: 'RECOMENDADO' },
            { cantidad: 10, numeros: 14, bonus: 4,  label: 'MEJOR VALOR' },
          ];
          const montoUnitario = config?.monto_aporte || 5000;
          const seleccionado = OPCIONES.find(o => o.cantidad === formData.cantidad) || OPCIONES[0];
          return (
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Cantidad de aportes</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
                gap: '10px',
                marginTop: '8px',
              }}>
                {OPCIONES.map((op, idx) => {
                  const isSelected = formData.cantidad === op.cantidad;
                  const intensity = idx; // 0–4
                  const bgColors = ['#f9fafb','#f0fdf4','#dcfce7','#bbf7d0','#86efac'];
                  const borderColors = ['#e5e7eb','#86efac','#4ade80','#22c55e','#16a34a'];
                  const textColors = ['#374151','#15803d','#15803d','#14532d','#14532d'];
                  return (
                    <button
                      key={op.cantidad}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, cantidad: op.cantidad }))}
                      style={{
                        position: 'relative',
                        padding: '12px 8px',
                        background: isSelected ? (intensity >= 2 ? '#16a34a' : '#1d4ed8') : bgColors[intensity],
                        border: `2px solid ${isSelected ? 'transparent' : borderColors[intensity]}`,
                        borderRadius: theme.borderRadius.md,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s',
                        boxShadow: isSelected ? '0 0 0 3px rgba(37,99,235,0.3)' : 'none',
                      }}
                    >
                      {op.label && (
                        <span style={{
                          position: 'absolute',
                          top: '-10px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: intensity === 4 ? '#7c3aed' : intensity === 3 ? '#059669' : '#2563eb',
                          color: '#fff',
                          fontSize: '9px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '999px',
                          whiteSpace: 'nowrap',
                          letterSpacing: '0.5px',
                        }}>
                          {op.label}
                        </span>
                      )}
                      <div style={{
                        fontSize: '22px',
                        fontWeight: '800',
                        color: isSelected ? '#fff' : textColors[intensity],
                        lineHeight: 1,
                      }}>
                        {op.cantidad}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        color: isSelected ? 'rgba(255,255,255,0.85)' : theme.colors.textMuted,
                        marginTop: '2px',
                      }}>
                        aporte{op.cantidad > 1 ? 's' : ''}
                      </div>
                      <div style={{
                        marginTop: '6px',
                        padding: '3px 0',
                        background: isSelected ? 'rgba(255,255,255,0.2)' : (intensity >= 2 ? '#dcfce7' : '#f3f4f6'),
                        borderRadius: '6px',
                      }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: '700',
                          color: isSelected ? '#fff' : (intensity >= 2 ? '#15803d' : '#374151'),
                        }}>
                          {op.numeros} Nº
                        </span>
                        {op.bonus > 0 && (
                          <span style={{
                            display: 'block',
                            fontSize: '10px',
                            color: isSelected ? 'rgba(255,255,255,0.9)' : '#16a34a',
                            fontWeight: '600',
                          }}>
                            +{op.bonus} bonus
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: isSelected ? 'rgba(255,255,255,0.9)' : theme.colors.textSecondary,
                        marginTop: '4px',
                      }}>
                        ${(montoUnitario * op.cantidad).toLocaleString('es-AR')}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Resumen selección */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: theme.borderRadius.md,
                padding: '12px 16px',
                marginTop: '12px',
              }}>
                <span style={{ fontSize: '14px', color: '#15803d' }}>
                  🎫 {seleccionado.numeros} número{seleccionado.numeros > 1 ? 's' : ''} para el sorteo
                  {seleccionado.bonus > 0 && ` (+${seleccionado.bonus} bonus por volumen)`}
                </span>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#059669' }}>
                  ${(montoUnitario * seleccionado.cantidad).toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          );
        })()}

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>¿Tenés un código de referido? (Opcional)</label>
          <input
            type="text"
            name="referido_dni"
            value={formData.referido_dni}
            onChange={handleInputChange}
            style={inputStyle}
            placeholder="DNI de quien te invitó"
            maxLength={8}
          />
        </div>

        <button type="submit" style={buttonStyle} disabled={loading}>
          {loading ? 'Procesando...' : 'Pagar con MercadoPago'}
        </button>
      </form>

      {/* Buscar mis aportes */}
      <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: `1px solid ${theme.colors.border}` }}>
        <p style={{ fontSize: '14px', color: theme.colors.textSecondary, margin: '0 0 12px 0' }}>
          ¿Ya hiciste un aporte? Buscá tus números:
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={searchDni}
            onChange={(e) => setSearchDni(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Tu DNI"
            maxLength={8}
          />
          <button
            onClick={fetchMyAportes}
            disabled={loading}
            style={{
              padding: '12px 20px',
              background: theme.colors.surfaceAlt,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.md,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: '14px',
            }}
          >
            Buscar
          </button>
        </div>
      </div>
    </div>
  );

  const renderMyAportes = () => {
    if (!myAportes) return null;

    return (
      <div style={cardStyle}>
        <button
          onClick={() => setView('form')}
          style={{
            background: 'none',
            border: 'none',
            color: theme.colors.primary,
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '16px',
            padding: 0,
          }}
        >
          ← Volver al formulario
        </button>

        <h2 style={{ 
          fontSize: '22px', 
          margin: '0 0 8px 0',
          color: theme.colors.textPrimary,
        }}>
          Tus Aportes
        </h2>
        <p style={{ 
          fontSize: '14px', 
          margin: '0 0 24px 0',
          color: theme.colors.textSecondary,
        }}>
          DNI: {myAportes.dni}
        </p>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '24px',
        }}>
          <div style={{
            background: '#f0fdf4',
            padding: '16px',
            borderRadius: theme.borderRadius.md,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0', color: '#059669' }}>
              {myAportes.total_aportes}
            </p>
            <p style={{ fontSize: '12px', margin: 0, color: '#047857' }}>Aportes</p>
          </div>
          <div style={{
            background: '#eff6ff',
            padding: '16px',
            borderRadius: theme.borderRadius.md,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0', color: '#2563eb' }}>
              {myAportes.total_bonus_recibidos}
            </p>
            <p style={{ fontSize: '12px', margin: 0, color: '#1d4ed8' }}>Bonus Recibidos</p>
          </div>
          <div style={{
            background: '#fef3c7',
            padding: '16px',
            borderRadius: theme.borderRadius.md,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0', color: '#d97706' }}>
              {myAportes.total_bonus_otorgados}
            </p>
            <p style={{ fontSize: '12px', margin: 0, color: '#b45309' }}>Bonus Otorgados</p>
          </div>
          <div style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
            padding: '16px',
            borderRadius: theme.borderRadius.md,
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 4px 0', color: '#ffffff' }}>
              {myAportes.total_chances_sorteo}
            </p>
            <p style={{ fontSize: '12px', margin: 0, color: '#e9d5ff' }}>Chances Sorteo</p>
          </div>
        </div>

        {/* Números de aporte */}
        {myAportes.aportes.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', margin: '0 0 16px 0', color: theme.colors.textPrimary }}>
              Tus números de aporte
            </h3>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              {myAportes.aportes.map(aporte => (
                <div
                  key={aporte.id}
                  style={{
                    background: '#000000',
                    color: '#ffffff',
                    padding: '12px 20px',
                    borderRadius: theme.borderRadius.md,
                    fontSize: '18px',
                    fontWeight: '700',
                  }}
                >
                  #{aporte.numero_aporte}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Referidos */}
        {myAportes.referidos_realizados.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', margin: '0 0 16px 0', color: theme.colors.textPrimary }}>
              Referidos realizados
            </h3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              {myAportes.referidos_realizados.map(ref => (
                <div
                  key={ref.id}
                  style={{
                    background: '#f9fafb',
                    padding: '12px 16px',
                    borderRadius: theme.borderRadius.md,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '14px', color: theme.colors.textPrimary }}>
                    {ref.referido_nombre} (DNI: {ref.referido_dni})
                  </span>
                  <span style={{ 
                    fontSize: '14px', 
                    color: '#7c3aed',
                    fontWeight: 600,
                  }}>
                    +{ref.bonus_extra} bonus
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Código de referido */}
        <div style={{
          background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
          borderRadius: theme.borderRadius.md,
          padding: '20px',
          textAlign: 'center',
          color: '#ffffff',
        }}>
          <p style={{ margin: '0 0 12px 0', fontSize: '14px', opacity: 0.9 }}>
            Tu código de referido (tu DNI)
          </p>
          <p style={{ 
            margin: '0 0 16px 0', 
            fontSize: '28px', 
            fontWeight: '700',
            letterSpacing: '2px',
          }}>
            {myAportes.dni}
          </p>
          <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
            Compartilo con amigos para ganar aportes extras
          </p>
        </div>
      </div>
    );
  };

  const renderSuccess = () => (
    <div style={cardStyle}>
      <div style={{
        textAlign: 'center',
        padding: '32px',
      }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
        <h2 style={{ 
          fontSize: '24px', 
          margin: '0 0 16px 0',
          color: '#059669',
        }}>
          ¡Gracias por tu aporte!
        </h2>
        <p style={{ 
          fontSize: '16px', 
          margin: '0 0 24px 0',
          color: theme.colors.textSecondary,
        }}>
          {success}
        </p>
        <button
          onClick={() => {
            setSuccess(null);
            setView('form');
            // Limpiar URL params
            navigate('/aportes', { replace: true });
          }}
          style={{
            padding: '14px 28px',
            background: theme.colors.primary,
            color: '#ffffff',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.body,
            fontWeight: theme.typography.semibold,
            cursor: 'pointer',
          }}
        >
          Hacer otro aporte
        </button>
      </div>
    </div>
  );

  // Si el sistema está cerrado
  if (config?.estado_sistema === 'cerrado') {
    return (
      <div style={containerStyle}>
        <div style={{
          background: '#fef2f2',
          border: '1px solid #ef4444',
          borderRadius: theme.borderRadius.lg,
          padding: '32px',
          textAlign: 'center',
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '16px' }}>
            Sistema Cerrado
          </h2>
          <p style={{ color: '#7f1d1d' }}>
            El período de aportes solidarios ha finalizado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {renderHero()}
      
      {view === 'success' && renderSuccess()}
      {view === 'my-aportes' && renderMyAportes()}
      {view === 'form' && (
        <>
          {renderBenefits()}
          {renderReferidosInfo()}
          {renderForm()}
        </>
      )}

      {/* Footer info */}
      <div style={{
        textAlign: 'center',
        padding: '24px',
        color: theme.colors.textMuted,
        fontSize: '12px',
      }}>
        <p>
          El sorteo se realizará en vivo por YouTube. <br/>
          Todos los aportes son finales. No se realizan devoluciones.
        </p>
      </div>
    </div>
  );
}
