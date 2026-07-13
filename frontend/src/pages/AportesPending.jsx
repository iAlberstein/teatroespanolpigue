import { Link } from 'react-router-dom';
import { theme } from '../styles/theme.js';

export default function AportesPending() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <div style={{ minHeight: '100vh', background: '#fffbeb', paddingTop: '80px', paddingBottom: '60px' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: isMobile ? theme.spacing.lg : theme.spacing.xl, textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: theme.spacing.lg }}>⏳</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: theme.typography.bold, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
          Pago pendiente
        </h1>
        <p style={{ fontSize: theme.typography.body, color: theme.colors.textSecondary, lineHeight: 1.6, marginBottom: theme.spacing.xl }}>
          Tu pago está siendo procesado. En cuanto se confirme, recibirás un email con tus números de aporte.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <Link to="/aportes" style={{ padding: `${theme.spacing.md} ${theme.spacing.lg}`, background: theme.colors.primary, color: '#fff', borderRadius: theme.borderRadius.md, textDecoration: 'none', fontWeight: theme.typography.semibold }}>
            Ver mis aportes
          </Link>
          <Link to="/" style={{ padding: `${theme.spacing.md} ${theme.spacing.lg}`, background: theme.colors.surfaceAlt, color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius.md, textDecoration: 'none' }}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
