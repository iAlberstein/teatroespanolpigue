import { theme } from '../styles/theme.js';

export default function Hipoacusicos() {
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
          Atención a personas hipoacúsicas
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
          Próximamente pondremos en funcionamiento el Aro Magnético ya instalado en la Sala Principal. Este sistema crea un campo magnético que transmite el sonido directamente a audífonos e implantes cocleares con bobina telefónica (posición T), ofreciendo una experiencia sonora clara y sin interferencias de ruido ambiente.
        </p>
      </section>

      <section
        style={{
          background: theme.colors.surface,
          borderRadius: theme.borderRadius.xl,
          border: `1px solid ${theme.colors.border}`,
          padding: theme.spacing['2xl'],
          boxShadow: theme.shadows.sm,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.md
        }}
      >
        <h2
          style={{
            margin: 0,
            color: theme.colors.textPrimary,
            fontSize: theme.typography.h3
          }}
        >
          ¿Qué implica el Aro Magnético?
        </h2>
        <ul
          style={{
            paddingLeft: theme.spacing.lg,
            margin: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7
          }}
        >
          <li>Transmisión directa del audio del escenario a tu dispositivo auditivo configurado en posición T.</li>
          <li>Reducción de ecos, reverberaciones y ruidos de sala que suelen dificultar la escucha.</li>
          <li>Señalética clara dentro de la sala para que puedas ubicarte dentro de la zona de cobertura ideal.</li>
        </ul>
        <p
          style={{
            margin: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7,
            textAlign: 'justify'
          }}
        >
          Mientras finalizamos las pruebas técnicas, estamos habilitando capacitaciones para el personal de sala y armando instructivos para las personas usuarias. Avisaremos por todos nuestros canales cuando el servicio esté disponible en las funciones regulares.
        </p>
        <p
          style={{
            margin: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7,
            textAlign: 'justify'
          }}
        >
          Si necesitás coordinar una visita previa o hacer una consulta específica, escribinos a{' '}
          <a
            href="mailto:teatropigue@gmail.com"
            style={{ color: theme.colors.primary, textDecoration: 'none', fontWeight: theme.typography.semibold }}
          >
            teatropigue@gmail.com
          </a>{' '}
          y te acompañamos en el proceso.
        </p>
      </section>
    </div>
  );
}
