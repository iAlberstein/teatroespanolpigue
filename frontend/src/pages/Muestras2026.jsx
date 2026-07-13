import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

function getTimeLeft() {
  // Deadline: July 12, 2026 at 23:59:59 Argentina time (UTC-3)
  const deadline = new Date('2026-07-13T02:59:59Z'); // 23:59:59 ART = 02:59:59 UTC next day
  const diff = deadline - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, expired: false };
}

export default function Muestras2026() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre_apellido: '',
    institucion: '',
    localidad: '',
    email: '',
    telefono: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [timeLeft, setTimeLeft] = useState(getTimeLeft());
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/muestras2026/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al procesar la inscripción.');
      } else {
        setSuccess(data.nombre_apellido);
      }
    } catch (err) {
      setError('Error de conexión. Por favor intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    border: '1.5px solid #d1d5db',
    borderRadius: 8,
    fontSize: 15,
    fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    outline: 'none',
    boxSizing: 'border-box',
    color: '#1e293b',
    background: '#fff',
    transition: 'border-color 0.2s'
  };

  if (success) {
    return (
      <div style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '32px 16px' : '48px 32px'
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: isMobile ? '40px 24px' : '56px 48px',
          maxWidth: 560,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{
            width: 64,
            height: 64,
            background: '#dcfce7',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 32
          }}>
            ✓
          </div>
          <h2 style={{
            margin: '0 0 16px',
            fontSize: isMobile ? 20 : 24,
            fontWeight: 700,
            color: '#1e293b',
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif'
          }}>
            {success}, tu institución se encuentra inscripta.
          </h2>
          <p style={{
            margin: '0 0 32px',
            fontSize: 15,
            color: '#64748b',
            lineHeight: 1.6,
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif'
          }}>
            En breve recibirás más información al mail que ingresaste en el formulario.
          </p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '13px 32px',
              background: '#2d6a4f',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
              letterSpacing: '0.3px'
            }}
          >
            Volver al sitio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '70vh',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: isMobile ? '32px 16px' : '48px 32px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: isMobile ? '32px 20px' : '48px 48px',
        maxWidth: 600,
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            margin: '0 0 10px',
            fontSize: isMobile ? 22 : 28,
            fontWeight: 700,
            color: '#1e293b',
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            MUESTRAS DE FIN DE AÑO 2026
          </h1>
          <p style={{
            margin: '0 0 24px',
            fontSize: 15,
            color: '#475569',
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            lineHeight: 1.5
          }}>
            Registrá tu institución para participar del sorteo de fechas
          </p>

          {/* Countdown */}
          <div style={{
            display: 'inline-block',
            background: '#ffffff',
            border: '2px solid #2d6a4f',
            borderRadius: 12,
            padding: isMobile ? '16px 24px' : '20px 36px'
          }}>
            <p style={{
              margin: '0 0 10px',
              fontSize: 12,
              color: '#166534',
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              fontWeight: 700
            }}>
              Tiempo para inscribirse
            </p>
            {timeLeft.expired ? (
              <p style={{ margin: 0, fontSize: 15, color: '#dc2626', fontWeight: 700, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>Inscripciones cerradas</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 8 : 12, justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? 36 : 48, fontWeight: 700, color: '#2d6a4f', lineHeight: 1, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
                    {String(timeLeft.days).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', marginTop: 4 }}>días</div>
                </div>
                <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 700, color: '#2d6a4f', lineHeight: 1.1, paddingBottom: 16, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>-</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? 36 : 48, fontWeight: 700, color: '#2d6a4f', lineHeight: 1, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
                    {String(timeLeft.hours).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', marginTop: 4 }}>horas</div>
                </div>
                <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 700, color: '#2d6a4f', lineHeight: 1.1, paddingBottom: 16, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>:</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? 36 : 48, fontWeight: 700, color: '#2d6a4f', lineHeight: 1, fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
                    {String(timeLeft.minutes).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', marginTop: 4 }}>minutos</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 16 }}>
            <input
              name="nombre_apellido"
              type="text"
              value={form.nombre_apellido}
              onChange={handleChange}
              placeholder="Nombre y apellido"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              name="institucion"
              type="text"
              value={form.institucion}
              onChange={handleChange}
              placeholder="Nombre de la institución"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              name="localidad"
              type="text"
              value={form.localidad}
              onChange={handleChange}
              placeholder="Localidad"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Mail de contacto"
              style={inputStyle}
              required
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <input
              name="telefono"
              type="tel"
              value={form.telefono}
              onChange={handleChange}
              placeholder="Teléfono de contacto"
              style={inputStyle}
              required
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 20,
              color: '#dc2626',
              fontSize: 14,
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading ? '#6b7280' : '#2d6a4f',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Enviando...' : 'Inscribir Institución'}
          </button>
        </form>
      </div>
    </div>
  );
}
