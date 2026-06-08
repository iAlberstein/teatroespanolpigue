import { theme } from '../../styles/theme';

export default function SobreElAteneo() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const pStyle = {
    fontSize: isMobile ? '15px' : '16px',
    lineHeight: 1.8,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
    textAlign: 'justify',
  };

  return (
    <div style={{ minHeight: '60vh' }}>
      <section style={{
        padding: isMobile ? '40px 16px' : '64px 24px',
        textAlign: 'center',
        background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #fdf2f8 100%)',
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing['2xl']
      }}>
        <h1 style={{
          fontSize: isMobile ? theme.typography.h2 : theme.typography.h1,
          fontWeight: theme.typography.bold,
          color: theme.colors.textPrimary,
          marginBottom: theme.spacing.md,
          letterSpacing: '-0.02em'
        }}>
          Sobre el Ateneo
        </h1>
        <p style={{
          fontSize: theme.typography.h5,
          color: theme.colors.textSecondary,
          maxWidth: 600,
          margin: '0 auto',
          lineHeight: 1.6
        }}>
          Ateneo de Artes Escénicas del Teatro Español Pigüé
        </p>
      </section>

      <section style={{
        maxWidth: 800,
        margin: '0 auto',
        marginBottom: theme.spacing['2xl'],
      }}>
        <p style={pStyle}>
          El Ateneo es un <strong>espacio de formación en artes escénicas</strong>, pensado para quienes buscan desarrollarse dentro del ámbito teatral. Su propuesta se apoya en una <strong>formación sólida, práctica y profundamente vinculada con la experiencia real</strong> del hacer escénico.
        </p>
        <p style={pStyle}>
          Los docentes a cargo del Ateneo son <strong>profesionales con formación específica y trayectoria activa</strong> en el campo de las artes escénicas, que han construido su carrera ejerciendo aquello que enseñan. Esta experiencia directa se traduce en una <strong>enseñanza anclada en la práctica</strong>, el conocimiento del medio y los procesos reales de trabajo.
        </p>
        <p style={pStyle}>
          Uno de los principales valores diferenciales del Ateneo es que <strong>parte de la formación se desarrolla directamente sobre el escenario</strong>. Las clases no se limitan al aula: el <strong>espacio escénico se convierte en una herramienta pedagógica central</strong>, permitiendo que los estudiantes entren en contacto temprano con las dinámicas propias del trabajo teatral.
        </p>
        <p style={pStyle}>
          De manera complementaria, el Ateneo ofrece clases de <strong>técnica (iluminación y sonido) y producción</strong>, ampliando la mirada sobre el hecho escénico y brindando herramientas clave para comprender y abordar los distintos roles que intervienen en una producción teatral.
        </p>
        <p style={pStyle}>
          Se fomentará la conformación de <strong>grupos de trabajo orientados al desarrollo de producciones escénicas propias</strong>. Estos procesos culminarán con la <strong>programación de funciones en el Teatro Español Pigüé</strong>, atravesando todas las etapas de producción correspondientes: elección de la obra, gestión de derechos de autor, inscripción en Actores para la conformación de cooperativas teatrales, planificación y ejecución de las distintas fases de producción, funciones abiertas al público con venta de entradas y posterior rendición de bordereaux, entre otros aspectos fundamentales del circuito profesional, <strong>acompañados y guiados en todo momento por el equipo de producción del teatro</strong>.
        </p>
        <p style={pStyle}>
          La misión del Ateneo es <strong>brindar todas las herramientas disponibles</strong> para que quienes participen puedan <strong>desarrollarse profesionalmente en el ambiente teatral</strong>, comprendiendo el hecho escénico en su totalidad y adquiriendo experiencia concreta en cada una de sus etapas.
        </p>
        <p style={pStyle}>
          Asimismo, quienes forman parte del Ateneo pueden realizar <strong>prácticas profesionales dentro del Teatro Español Pigüé</strong>, participando activamente en las funciones que integran su programación. Estas prácticas permiten transitar por <strong>distintos oficios teatrales —técnicos, artísticos y de producción—</strong>, adquiriendo experiencia concreta en un contexto real de trabajo y fortaleciendo una <strong>formación integral vinculada al funcionamiento cotidiano de una sala teatral</strong>.
        </p>
      </section>
    </div>
  );
}
