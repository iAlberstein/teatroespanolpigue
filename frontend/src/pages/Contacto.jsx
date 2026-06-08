import { useEffect, useState } from 'react';
import { theme } from '../styles/theme.js';

const inputStyle = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.body,
  boxSizing: 'border-box',
  outline: 'none'
};

export default function Contacto() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    message: ''
  });
  const [status, setStatus] = useState({ sending: false, success: '', error: '' });

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status.sending) return;

    const { name, phone, email, message } = formData;
    if (!name || !phone || !email || !message) {
      setStatus({ sending: false, success: '', error: 'Completá todos los campos.' });
      return;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus({ sending: false, success: '', error: 'Ingresá un correo electrónico válido.' });
      return;
    }

    setStatus({ sending: true, success: '', error: '' });

    try {
      const res = await fetch('https://formsubmit.co/ajax/teatropigue@gmail.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          Nombre: name,
          Teléfono: phone,
          Email: email,
          Mensaje: message,
          _subject: 'Nuevo mensaje de contacto | Teatro Español Pigüé'
        })
      });

      if (!res.ok) throw new Error('Error al enviar el mensaje');

      setStatus({ sending: false, success: '¡Mensaje enviado! Te responderemos a la brevedad.', error: '' });
      setFormData({ name: '', phone: '', email: '', message: '' });
    } catch (error) {
      setStatus({ sending: false, success: '', error: 'No pudimos enviar tu mensaje. Intentá nuevamente.' });
    }
  };

  return (
    <div style={{
      maxWidth: 800,
      margin: '0 auto',
      padding: isMobile ? theme.spacing.md : theme.spacing['2xl'],
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.xl
    }}>
      {/* Header */}
      <section style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: isMobile ? theme.typography.h2 : theme.typography.h1,
          color: theme.colors.textPrimary,
          marginBottom: theme.spacing.md
        }}>
          Contacto
        </h1>
        <p style={{
          fontSize: theme.typography.body,
          color: theme.colors.textSecondary,
          lineHeight: 1.6,
          maxWidth: 600,
          margin: '0 auto'
        }}>
          ¿Tenés alguna consulta, sugerencia o comentario? Completá el formulario y te responderemos a la brevedad.
        </p>
      </section>

      {/* Formulario */}
      <section style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.borderRadius.xl,
        padding: isMobile ? theme.spacing.lg : theme.spacing['2xl'],
        boxShadow: theme.shadows.sm
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <div>
            <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: theme.typography.semibold, color: theme.colors.textPrimary }}>
              Nombre completo *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={handleChange('name')}
              placeholder="Tu nombre y apellido"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: theme.spacing.md }}>
            <div>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: theme.typography.semibold, color: theme.colors.textPrimary }}>
                Teléfono de contacto *
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={handleChange('phone')}
                placeholder="Ej: 11 1234 5678"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: theme.typography.semibold, color: theme.colors.textPrimary }}>
                Correo electrónico *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={handleChange('email')}
                placeholder="tu@email.com"
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: theme.spacing.xs, fontWeight: theme.typography.semibold, color: theme.colors.textPrimary }}>
              Mensaje *
            </label>
            <textarea
              value={formData.message}
              onChange={handleChange('message')}
              placeholder="Escribí tu consulta, sugerencia o comentario..."
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
            />
          </div>

          {status.error && (
            <p style={{ color: theme.colors.error, margin: 0, fontSize: theme.typography.small }}>
              {status.error}
            </p>
          )}
          {status.success && (
            <p style={{ color: theme.colors.success, margin: 0, fontSize: theme.typography.small }}>
              {status.success}
            </p>
          )}

          <button
            type="submit"
            disabled={status.sending}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              background: status.sending ? theme.colors.textMuted : theme.colors.primary,
              color: theme.colors.surface,
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.body,
              fontWeight: theme.typography.semibold,
              cursor: status.sending ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {status.sending ? 'Enviando...' : 'Enviar mensaje'}
          </button>
        </form>
      </section>

    </div>
  );
}
