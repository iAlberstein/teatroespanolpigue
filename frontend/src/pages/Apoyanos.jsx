import { useEffect, useState } from 'react';
import { theme } from '../styles/theme.js';

const impactStats = [
  { label: 'Espectadores 2025', value: '4.212', detail: 'Público de la región (radio 100 km)' },
  { label: 'Salas activas', value: '3', detail: 'Sala Principal, El Tablado y próximas aperturas' },
  { label: 'Presencia digital', value: '+3.000', detail: 'Seguidores y +900.000 visualizaciones anuales' }
];

const partnershipReasons = [
  'Asociarse a un proyecto cultural con prestigio y compromiso social',
  'Acceder a espacios exclusivos para activaciones de marca',
  'Alcanzar a una audiencia diversa y en crecimiento constante',
  'Obtener visibilidad en eventos, materiales gráficos y redes',
  'Contribuir al desarrollo del arte y la cultura en la región'
];

const categories = [
  { title: 'Principal' },
  { title: 'Oro' },
  { title: 'Plata' }
];

const inputStyle = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.body,
  boxSizing: 'border-box',
  outline: 'none'
};

export default function Apoyanos() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    contact: '',
    message: ''
  });
  const [status, setStatus] = useState({ sending: false, success: '', error: '' });

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status.sending) return;

    const { name, company, contact, message } = formData;
    if (!name || !company || !contact || !message) {
      setStatus({ sending: false, success: '', error: 'Completá todos los campos.' });
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
          Empresa: company,
          Contacto: contact,
          Mensaje: message,
          _subject: 'Nueva propuesta de patrocinio | Teatro Español Pigüé'
        })
      });

      if (!res.ok) throw new Error('Error al enviar el mensaje');

      setStatus({ sending: false, success: 'Mensaje enviado. ¡Gracias por escribirnos!', error: '' });
      setFormData({ name: '', company: '', contact: '', message: '' });
      setTimeout(() => setIsModalOpen(false), 2000);
    } catch (error) {
      setStatus({ sending: false, success: '', error: 'No pudimos enviar tu mensaje. Intentá nuevamente.' });
    }
  };

  const Section = ({ title, children }) => (
    <section style={{
      background: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing['2xl'],
      boxShadow: theme.shadows.sm
    }}>
      <h2 style={{
        marginTop: 0,
        fontSize: theme.typography.h2,
        color: theme.colors.textPrimary
      }}>
        {title}
      </h2>
      <div style={{
        marginTop: theme.spacing.md,
        color: theme.colors.textSecondary,
        lineHeight: 1.6,
        textAlign: 'justify'
      }}>
        {children}
      </div>
    </section>
  );

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{
      maxWidth: '1100px',
      margin: '0 auto',
      padding: isMobile
        ? `${theme.spacing['2xl']} ${theme.spacing.md}`
        : `calc(${theme.spacing['2xl']} + 20px) ${theme.spacing.lg}`,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing['2xl']
    }}>
      <section style={{
        background: theme.colors.surface,
        borderRadius: theme.borderRadius['3xl'] || '32px',
        padding: theme.spacing['2xl'],
        border: `1px solid ${theme.colors.border}`,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: theme.spacing.lg,
        alignItems: 'center'
      }}>
        <div>
          <p style={{
            fontSize: theme.typography.tiny,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.sm
          }}>
            Construyamos juntos
          </p>
          <h1 style={{
            fontSize: 'clamp(2rem, 4vw, 3.5rem)',
            margin: 0,
            color: theme.colors.textPrimary,
            lineHeight: 1.1
          }}>
            Historia y valor patrimonial
          </h1>
          <p style={{
            marginTop: theme.spacing.md,
            color: theme.colors.textSecondary,
            lineHeight: 1.7,
            textAlign: 'justify'
          }}>
            ¡El 2026 es el año de nuestro centenario!. El Teatro Español Pigüé, declarado monumento histórico, ha sido desde 1926 un punto de encuentro social, artístico y cultural para toda la región. Nuestra identidad se apoya en una acústica excepcional, un diseño arquitectónico único y una ubicación estratégica en el corazón de la ciudad.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              marginTop: theme.spacing.lg,
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              borderRadius: theme.borderRadius.full,
              border: 'none',
              background: theme.colors.primary,
              color: theme.colors.surface,
              fontWeight: theme.typography.semibold,
              cursor: 'pointer'
            }}
          >
            Enviar mensaje
          </button>
        </div>
        <div style={{
          borderLeft: isMobile ? 'none' : `1px solid ${theme.colors.border}`,
          borderTop: isMobile ? `1px solid ${theme.colors.border}` : 'none',
          paddingLeft: isMobile ? 0 : theme.spacing.lg,
          paddingTop: isMobile ? theme.spacing.lg : 0,
          marginLeft: isMobile ? 0 : theme.spacing.lg,
          marginTop: isMobile ? theme.spacing.lg : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm
        }}>
          <p style={{ margin: 0, color: theme.colors.textSecondary, lineHeight: 1.6, textAlign: 'justify' }}>
            A partir de 2025 iniciamos una nueva gestión para fortalecer nuestro rol como motor cultural, ampliar la participación comunitaria y recuperar el valor patrimonial del teatro. Queremos convertir este espacio en un centro de formación, creación y circulación cultural para toda la región.
          </p>
        </div>
      </section>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: theme.spacing.lg
      }}>
        {impactStats.map((stat) => (
          <div key={stat.label} style={{
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border}`,
            padding: theme.spacing.lg,
            background: theme.colors.surfaceAlt,
            textAlign: 'center'
          }}>
            <p style={{
              margin: 0,
              fontSize: theme.typography.tiny,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: theme.colors.textMuted
            }}>
              {stat.label}
            </p>
            <p style={{
              margin: `${theme.spacing.sm} 0`,
              fontSize: '2rem',
              fontWeight: theme.typography.bold,
              color: theme.colors.textPrimary
            }}>
              {stat.value}
            </p>
            <p style={{
              margin: 0,
              color: theme.colors.textSecondary,
              lineHeight: 1.4
            }}>
              {stat.detail}
            </p>
          </div>
        ))}
      </div>

      <Section title="Misión cultural y propósito social">
        <ul style={{ paddingLeft: theme.spacing['2xl'], marginTop: 0, marginBottom: 0, lineHeight: 1.7 }}>
          <li>Generar espacios de formación y encuentro.</li>
          <li>Estimular la creación artística local.</li>
          <li>Atraer nuevos públicos.</li>
          <li>Proyectar a Pigüé como centro cultural regional.</li>
        </ul>
      </Section>

      <Section title="Impacto actual">
        <p style={{ margin: 0 }}>En el último año nos visitaron +4.000 espectadores, provenientes de distintas localidades ubicadas a 100 km a la redonda. Estos datos evidencian nuestro rol como referente cultural regional y la confianza que la comunidad deposita en nosotros.</p>
      </Section>

      <Section title="Conclusión estratégica">
        <p style={{ marginTop: 0 }}>
          Estos indicadores no reflejan solo visibilidad: reflejan vínculo, confianza y una comunidad real, predispuesta a participar. Es el escenario ideal para que una marca se posicione desde lo cultural, lo social y lo experiencial.
        </p>
        <p style={{ marginTop: theme.spacing.md }}>Ser parte del Teatro Español Pigüé es:</p>
        <ul style={{ paddingLeft: theme.spacing['2xl'], lineHeight: 1.7 }}>
          {partnershipReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </Section>

      <Section title="Categorías de patrocinio">
        <p style={{ marginTop: 0, marginBottom: theme.spacing.lg }}>
          Cada categoría ofrece diferentes niveles de exposición de tu marca. Contactanos para brindarte mayor información de cada uno.
        </p>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: theme.spacing.lg,
          marginTop: theme.spacing.md
        }}>
          {categories.map((cat) => (
            <div key={cat.title} style={{
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.lg,
              padding: theme.spacing.lg,
              background: theme.colors.surfaceAlt,
              textAlign: 'center',
              fontWeight: theme.typography.semibold,
              color: theme.colors.textPrimary
            }}>
              {cat.title}
            </div>
          ))}
        </div>
      </Section>

      <section style={{
        background: '#faf7f0',
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing['2xl'],
        border: `1px solid ${theme.colors.border}`,
        textAlign: 'center'
      }}>
        <h2 style={{ marginTop: 0, color: theme.colors.textPrimary }}>¿Avanzamos?</h2>
        <p style={{
          color: theme.colors.textSecondary,
          lineHeight: 1.6,
          maxWidth: 640,
          margin: '0 auto'
        }}>
          Estamos abiertos a diseñar una propuesta personalizada para tu empresa. Contactanos para conocer más sobre las oportunidades de patrocinio y sumarte a este proyecto cultural único.
        </p>
        <div style={{
          marginTop: theme.spacing.lg,
          display: 'flex',
          justifyContent: 'center',
          gap: theme.spacing.md
        }}>
          <button
            onClick={() => setIsModalOpen(true)}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              borderRadius: theme.borderRadius.full,
              border: 'none',
              background: theme.colors.primary,
              color: theme.colors.surface,
              fontWeight: theme.typography.semibold,
              cursor: 'pointer'
            }}
          >
            Enviar mensaje
          </button>
        </div>
      </section>

      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: theme.colors.overlay,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: theme.spacing.lg
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.colors.surface,
              borderRadius: theme.borderRadius.xl,
              padding: theme.spacing['2xl'],
              width: 'min(480px, 100%)',
              boxShadow: theme.shadows.xl,
              border: `1px solid ${theme.colors.border}`
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg }}>
              <h3 style={{ margin: 0 }}>Contanos más</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: theme.typography.h3,
                  cursor: 'pointer'
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
              <div>
                <label style={{ display: 'block', marginBottom: theme.spacing.xs }}>Nombre y Apellido</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={handleChange('name')}
                  style={inputStyle}
                  placeholder="Ej. Ana García"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: theme.spacing.xs }}>Empresa</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={handleChange('company')}
                  style={inputStyle}
                  placeholder="Nombre de la compañía"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: theme.spacing.xs }}>Contacto</label>
                <input
                  type="text"
                  value={formData.contact}
                  onChange={handleChange('contact')}
                  style={inputStyle}
                  placeholder="Email o teléfono"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: theme.spacing.xs }}>Mensaje</label>
                <textarea
                  value={formData.message}
                  onChange={handleChange('message')}
                  style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
                  placeholder="Contanos cómo te gustaría colaborar"
                />
              </div>

              {status.error && (
                <p style={{ color: '#ef4444', margin: 0 }}>{status.error}</p>
              )}
              {status.success && (
                <p style={{ color: '#22c55e', margin: 0 }}>{status.success}</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.sm }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${theme.colors.border}`,
                    background: theme.colors.surface,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={status.sending}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    borderRadius: theme.borderRadius.md,
                    border: 'none',
                    background: theme.colors.primary,
                    color: theme.colors.surface,
                    fontWeight: theme.typography.semibold,
                    cursor: status.sending ? 'wait' : 'pointer'
                  }}
                >
                  {status.sending ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
