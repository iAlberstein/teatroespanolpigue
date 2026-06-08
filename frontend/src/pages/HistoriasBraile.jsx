import { theme } from '../styles/theme.js';

export default function HistoriasBraile() {
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
          Historias en braile
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
          Gracias al Programa de Accesibilidad a las Artes Escénicas del Teatro Nacional Cervantes contamos con material impreso en braile que recopila historias, sinopsis y descripciones distintas producciones. Este contenido fue desarrollado para acompañar la experiencia escénica de personas ciegas o con baja visión, acercando la posibilidad de participar plenamente en la vida cultural.
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
          ¿Cómo acceder al material?
        </h2>
        <ul
          style={{
            paddingLeft: theme.spacing.lg,
            margin: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7
          }}
        >
          <li>Coordinamos tu visita para que puedas acceder al material con anticipación.</li>
          <li>Podés solicitar lecturas guiadas o acompañamiento por parte del equipo de mediación.</li>
        </ul>
        <p
          style={{
            margin: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7,
            textAlign: 'justify'
          }}
        >
          Para acceder al servicio escribinos o llamanos al{' '}
          <a
            href="tel:+541128765729"
            style={{ color: theme.colors.primary, textDecoration: 'none', fontWeight: theme.typography.semibold }}
          >
            11 2876 5729
          </a>
          . También podés contactarnos por correo a{' '}
          <a
            href="mailto:teatropigue@gmail.com"
            style={{ color: theme.colors.primary, textDecoration: 'none', fontWeight: theme.typography.semibold }}
          >
            teatropigue@gmail.com
          </a>{' '}
        </p>
        <p
          style={{
            margin: 0,
            color: theme.colors.textSecondary,
            lineHeight: 1.7,
            textAlign: 'justify'
          }}
        >
          Nuestro compromiso es seguir ampliando la colección y sumar versiones accesibles, así como cápsulas sonoras complementarias. Si tenés sugerencias o materiales que quieras compartir, estamos abiertos a construir esta biblioteca táctil y sonora junto a la comunidad.
        </p>
      </section>
    </div>
  );
}
