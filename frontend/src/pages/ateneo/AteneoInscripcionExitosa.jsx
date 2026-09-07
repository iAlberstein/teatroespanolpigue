import { useSearchParams, Link } from 'react-router-dom';
import { theme } from '../../styles/theme';

export default function AteneoInscripcionExitosa() {
  const [searchParams] = useSearchParams();
  const ok = searchParams.get('pago') === 'ok';

  return (
    <div style={{ padding: theme.spacing.lg, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
        padding: theme.spacing.xl
      }}>
        <h1 style={{ color: ok ? theme.colors.textPrimary : '#dc2626', marginTop: 0 }}>
          {ok ? 'Inscripcion exitosa' : 'El pago no pudo completarse'}
        </h1>
        <p style={{ color: theme.colors.textSecondary, lineHeight: 1.6, marginBottom: theme.spacing.lg }}>
          {ok
            ? 'Tu inscripcion al taller fue registrada correctamente. Proximamente te enviaremos mas informacion al contacto ingresado en el formulario.'
            : 'Si ya abonaste, el estado se actualizara en unos minutos. De lo contrario, podes volver a intentarlo desde el Ateneo.'}
        </p>
        <Link to="/ateneo" style={{
          padding: '12px 20px',
          borderRadius: theme.borderRadius.md,
          background: theme.colors.primary,
          color: theme.colors.surface,
          textDecoration: 'none',
          fontWeight: theme.typography.semibold
        }}>
          Volver al Ateneo
        </Link>
      </div>
    </div>
  );
}
