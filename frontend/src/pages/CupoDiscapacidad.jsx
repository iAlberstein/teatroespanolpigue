import { theme } from '../styles/theme.js';

export default function CupoDiscapacidad() {
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
          Accesibilidad
        </p>
        <h1
          style={{
            margin: 0,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.h2
          }}
        >
          Cupo para personas con discapacidad
        </h1>
        <p
          style={{
            marginTop: theme.spacing.md,
            marginBottom: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7,
            textAlign: 'justify'
          }}
        >
          En cada función que se realice en la Sala Principal contamos con 8 entradas destinadas exclusivamente a personas con discapacidad. Para acceder a este beneficio, el titular debe presentar su Certificado Único de Discapacidad (CUD) en la boletería del teatro y retirar sus tickets hasta una semana antes de la función. Pasado ese plazo, las entradas vuelven a estar disponibles para la venta general.
        </p>
        <p
          style={{
            marginTop: theme.spacing.md,
            marginBottom: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7,
            textAlign: 'justify'
          }}
        >
          Si por alguna situación particular no podés acercarte en persona a la boletería, escribinos a{' '}
          <a href="mailto:teatropigue@gmail.com" style={{ color: theme.colors.primary, textDecoration: 'none', fontWeight: theme.typography.semibold }}>
            teatropigue@gmail.com
          </a>{' '}
          o al WhatsApp 2923 67-9531 detallando el espectáculo, la fecha y tus datos para coordinar una alternativa.
        </p>
      </section>
    </div>
  );
}
