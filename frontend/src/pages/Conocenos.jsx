import { theme } from '../styles/theme.js';
import fotoTeatro from '../assets/images/conocenos/foto_teatro.jpg';
import fotoMapa from '../assets/images/conocenos/foto_mapa.jpg';

const historySections = [
  {
    kicker: 'Historia',
    title: 'Un edificio único, con una historia centenaria.',
    image: fotoTeatro,
    imageAlt: 'Fachada histórica del Teatro Español Pigüé',
    paragraphs: [
      'Inaugurado el 26 de abril de 1926, el Teatro Español Pigüé se convirtió en la única sala concebida y edificada desde el inicio de la ciudad con ese propósito. Iniciativa emprendida por la Sociedad Española de Socorros Mutuos de aquel entonces, fundada el 14 de junio de 1894, apenas diez años después de la creación de la ciudad.',
      'Declarado monumento histórico provincial mediante la Ley 11535 en mayo de 1994, el edificio del Teatro Español fue diseñado por el ingeniero Marseillán, oriundo de Bahía Blanca, y construido por la empresa de Don Domingo Oresti. Este destacado empresario, reconocido por su labor en numerosas obras particulares e institucionales en Pigüé y la región, dejó un legado que aún es visible en la actualidad.',
      'El teatro, con su clásico formato en herradura, cuenta con palcos altos y bajos, palcos laterales, platea y pullman, albergando hasta 446 espectadores. Su extraordinaria acústica lo ha consolidado como un espacio de referencia para la cultura y las artes escénicas.'
    ]
  },
  {
    kicker: 'Territorio',
    title: 'En el sudoeste, el lugar del encuentro.',
    image: fotoMapa,
    imageAlt: 'Mapa de ubicación de Pigüé en la provincia de Buenos Aires',
    paragraphs: [
      'La localidad de Pigüé, cabecera del Partido de Saavedra, se encuentra ubicada en el cruce de las rutas Nacional Nº 33 y Provincial Nº 67, lo que denota una posición estratégica no sólo a nivel local y regional, sino también nacional, destacando una población que alcanza a los 800.000 habitantes en un radio de 100km.',
      'La ruta Nacional Nº 33 constituye un eje natural de unión hacia el norte (Trenque Lauquen, Rosario) hacia el sur (Bahía Blanca, Viedma) y las posibles conexiones con las rutas nacionales Nº 3, 22 y 35. En tanto, la ruta Provincial Nº 67, es la conexión hacia el oeste con Puán y Santa Rosa (La Pampa) y hacia el este con Coronel Suárez y el centro de la provincia de Buenos Aires, mediante las rutas nacionales 226 y 228, y la 76 y 85 de la red vial provincial.',
      'El Teatro Español de Pigüé se encuentra ubicado en la calle España 120, entre las calles Manuel Belgrano y Cdad. de Rodez, solo una cuadra de la Av. E. Casey, una de las arterias principales de la ciudad.'
    ]
  }
];

const team = [
  {
    name: 'Anita Lopez Holzmann',
    role: 'Directora',
    paragraphs: [
      'Se formó en Composición Coreográfica en Comedia Musical en la Universidad Nacional de las Artes (UNA) y en Producción de Espectáculos en la Universidad de Palermo (UP).',
      'Se desempeñó como asistente de dirección y productora ejecutiva en numerosas obras teatrales junto a destacadas figuras como Alejandra Darín, Pacho O’Donnell, Patricio Contreras, Vanesa González, Daniel Miglioranza, María Rogi, Marta Bianchi, María Fiorentino, entre otros. Participó en la organización de funciones regulares y giras internacionales.',
      'Participó como asistente de dirección de Eduardo Lamoglia en los talleres de teatro del Consejo Profesional de Ciencias Económicas.',
      'Asistió a la producción general del Festival Internacional de Teatro y Discapacidad y Festival del Amor (CABA).'
    ]
  },
  {
    name: 'Bruno Alberstein',
    role: 'Coordinador',
    paragraphs: [
      'Se formó en producción de espectáculos, gestión cultural y marketing.',
      'Se desempeñó como jefe técnico en el Teatro La Baita, en la ciudad de Bariloche, asistiendo a los más de 70 espectáculos que pasaron por su cartelera, destacando artistas como Pedro Aznar, Hilda Lizarazu, Leonardo Sbaraglia, Alfredo Casero, Enrique Pinti, Chango Spasiuk, Rosana, Anibal Pachano, Jaime Torres, Los Huayra, Toc Toc, entre otros.',
      'Participó como productor ejecutivo de obras teatrales en la Ciudad Autónoma de Buenos Aires junto a figuras como Alejandra Darín, Pacho O’Donnell, Daniel Miglioranza, Carlos Kaspar, Vanesa Gonzalez, Hernan Cuevas, Manuel Fanego, entre otros. Llevando adelante funciones regulares, giras nacionales e internacionales.',
      'Integró el equipo de Relaciones Institucionales del Palacio Libertad, trabajando mancomunadamente con sus áreas, estableciendo y consolidando los vínculos nacionales e internacionales con organismos y entidades públicas y privadas.',
      'Ejerció el rol de Ceremonial y Protocolo en el Senado de la Nación, asistiendo directamente a su presidencia (Vicepresidente de la Nación) como así también a todas sus autoridades y senadores, programando y ejecutando actividades junto a funcionarios nacionales e internacionales.'
    ]
  }
];

function SectionHeader({ title, description, eyebrow }) {
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      {eyebrow && (
        <p style={{
          fontSize: theme.typography.tiny,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs
        }}>
          {eyebrow}
        </p>
      )}
      <h2 style={{
        margin: 0,
        fontSize: theme.typography.h2,
        color: theme.colors.textPrimary
      }}>
        {title}
      </h2>
      {description && (
        <p style={{
          marginTop: theme.spacing.sm,
          marginBottom: 0,
          color: theme.colors.textSecondary,
          lineHeight: 1.6,
          textAlign: 'justify',
          maxWidth: 720,
          wordBreak: 'break-word'
        }}>
          {description}
        </p>
      )}
    </div>
  );
}

function StoryCard({ section, index, isMobile }) {
  const isReversed = index % 2 !== 0;

  return (
    <article
      style={{
        borderRadius: theme.borderRadius.xl,
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        padding: isMobile ? theme.spacing.lg : theme.spacing['2xl'],
        display: 'grid',
        gap: isMobile ? theme.spacing.lg : theme.spacing['2xl'],
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(380px, 1fr))',
        alignItems: 'center',
        boxSizing: 'border-box',
        width: '100%'
      }}
    >
      <div style={{ order: isReversed ? 2 : 1 }}>
        <h3
          style={{
            marginTop: 0,
            fontSize: theme.typography.h3,
            color: theme.colors.textPrimary
          }}
        >
          {section.title}
        </h3>
        <div style={{ marginTop: theme.spacing.md }}>
          {section.paragraphs.map((paragraph) => (
            <p
              key={paragraph}
              style={{
                marginBottom: theme.spacing.md,
                color: theme.colors.textSecondary,
                lineHeight: 1.8,
                textAlign: 'justify',
                wordBreak: 'break-word'
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>
      <div style={{ order: isReversed ? 1 : 2 }}>
        <div
          style={{
            position: 'relative',
            borderRadius: theme.borderRadius.lg,
            overflow: 'hidden',
            border: `1px solid ${theme.colors.borderLight}`,
            minHeight: isMobile ? 220 : 320,
            width: '100%'
          }}
        >
          <img
            src={section.image}
            alt={section.imageAlt}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'cover'
            }}
          />
        </div>
      </div>
    </article>
  );
}

function TeamCard({ member }) {
  return (
    <article
      style={{
        borderRadius: theme.borderRadius.xl,
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        padding: theme.spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.md
      }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: theme.typography.h3,
            color: theme.colors.textPrimary,
            lineHeight: 1.2
          }}
        >
          {member.name}
        </h3>
        <p
          style={{
            margin: '2px 0 0',
            color: theme.colors.textSecondary,
            fontWeight: theme.typography.medium,
            lineHeight: 1.2
          }}
        >
          {member.role}
        </p>
      </div>
      <div>
        {member.paragraphs.map((paragraph) => (
          <p
            key={paragraph}
            style={{
              marginBottom: theme.spacing.md,
              color: theme.colors.textSecondary,
              lineHeight: 1.7,
              textAlign: 'justify',
              wordBreak: 'break-word'
            }}
          >
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}

export default function Conocenos() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div
      style={{
        width: '100%',
        padding: isMobile ? theme.spacing.md : theme.spacing['2xl'],
        background: '#f7f7f8',
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing['2xl']
        }}
      >
        <section
          style={{
            borderRadius: theme.borderRadius.xl,
            padding: isMobile ? theme.spacing.xl : theme.spacing['2xl'],
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`
          }}
        >
          <SectionHeader
            eyebrow="Conocenos"
            title="Teatro Español Pigüé"
            description="Un espacio vivo que honra su legado centenario mientras impulsa nuevas experiencias culturales en el sudoeste bonaerense."
          />
        </section>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.xl
          }}
        >
          {historySections.map((section, index) => (
            <StoryCard key={section.title} section={section} index={index} isMobile={isMobile} />
          ))}
        </section>

        <section>
          <SectionHeader
            title="Sobre nosotros"

          />
          <div
            style={{
              display: 'grid',
              gap: theme.spacing.lg,
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'
            }}
          >
            {team.map((member) => (
              <TeamCard key={member.name} member={member} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
