import { theme } from '../styles/theme.js';

const faqs = [
  {
    question: '¿Horario de atención de boletería?',
    answer: 'Atendemos de miércoles a viernes de 18:00 a 20:30.'
  },
  {
    question: '¿Dónde se encuentran?',
    answer: 'El ingreso al teatro se encuentra en España 120, Pigüé.'
  },
  {
    question: '¿Qué accesibilidad tienen?',
    answer: 'Contamos con rampa para acceder a toda la planta baja y baño adaptado.'
  },
  {
    question: '¿Precio de entradas y formas de pago?',
    answer: 'Cada espectáculo tiene un valor de entrada diferente que podés ver en su ficha. Luego de elegir tus ubicaciones, seleccioná tu medio de pago favorito dentro de Mercado Pago.'
  }
];

export default function CentroAyuda() {
  return (
    <div
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: `${theme.spacing['2xl']} ${theme.spacing.lg}`,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing['2xl']
      }}
    >
      <section
        style={{
          background: theme.colors.surface,
          borderRadius: theme.borderRadius.xl,
          border: `1px solid ${theme.colors.border}`,
          padding: theme.spacing['2xl'],
          boxShadow: theme.shadows.sm
        }}
      >
        <p
          style={{
            fontSize: theme.typography.tiny,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: theme.colors.textMuted,
            margin: 0,
            marginBottom: theme.spacing.sm
          }}
        >
          Centro de ayuda
        </p>
        <h1
          style={{
            margin: 0,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.h2
          }}
        >
          Preguntas frecuentes
        </h1>
        <p
          style={{
            marginTop: theme.spacing.md,
            marginBottom: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.6,
            textAlign: 'justify'
          }}
        >
          Encontrá la información básica para planificar tu visita al Teatro Español Pigüé. Si necesitás asistencia adicional, escribinos a teatropigue@gmail.com.
        </p>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
        {faqs.map((faq) => (
          <article
            key={faq.question}
            style={{
              background: theme.colors.surface,
              borderRadius: theme.borderRadius.lg,
              border: `1px solid ${theme.colors.border}`,
              padding: theme.spacing.lg,
              boxShadow: theme.shadows.xs
            }}
          >
            <h3 style={{ marginTop: 0, color: theme.colors.textPrimary }}>{faq.question}</h3>
            <p style={{ marginBottom: 0, color: theme.colors.textSecondary, lineHeight: 1.6 }}>{faq.answer}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
