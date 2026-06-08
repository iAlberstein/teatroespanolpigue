import { theme } from '../styles/theme.js';

export default function TrabajaConNosotros() {
  return (
    <div
      style={{
        minHeight: '70vh',
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
          Trabajá con nosotros
        </p>
        <h1
          style={{
            margin: 0,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.h2
          }}
        >
          Sumate al equipo del Teatro Español Pigüé
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
          Buscamos profesionales apasionados por la gestión cultural, la técnica escénica, la producción y la atención al público. Si querés formar parte de nuestro equipo y potenciar el valor patrimonial del teatro, envianos tu CV y contanos en qué área te gustaría colaborar.
        </p>
      </section>

      <section
        style={{
          background: theme.colors.surfaceAlt,
          borderRadius: theme.borderRadius.lg,
          border: `1px dashed ${theme.colors.border}`,
          padding: theme.spacing['2xl'],
          textAlign: 'center'
        }}
      >
        <p style={{ margin: 0, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
          Enviá tu CV y datos de contacto a:
        </p>
        <a
          href="mailto:teatropigue@gmail.com"
          style={{
            display: 'inline-block',
            fontSize: theme.typography.h4,
            color: theme.colors.primary,
            textDecoration: 'none',
            fontWeight: theme.typography.semibold
          }}
        >
          teatropigue@gmail.com
        </a>
      </section>
    </div>
  );
}
