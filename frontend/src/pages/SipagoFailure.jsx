import { Link, useSearchParams } from 'react-router-dom';
import SipagoSuccess from './SipagoSuccess.jsx';
import { theme } from '../styles/theme.js';

export default function SipagoFailure() {
  const [params] = useSearchParams();
  if (params.get('attempt_id')) return <SipagoSuccess />;

  return (
    <div style={{ padding: theme.spacing.lg, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius.lg, boxShadow: theme.shadows.md, padding: theme.spacing.xl }}>
        <h1 style={{ color: theme.colors.textPrimary, marginTop: 0 }}>El pago fue rechazado</h1>
        <p style={{ color: theme.colors.textSecondary, lineHeight: 1.6 }}>SiPago no aprobó la operación. No se realizó la compra ni se emitieron entradas.</p>
        <Link to="/agenda" style={{ display: 'inline-block', marginTop: theme.spacing.md, padding: '12px 20px', borderRadius: theme.borderRadius.md, background: theme.colors.primary, color: theme.colors.surface, textDecoration: 'none', fontWeight: theme.typography.semibold }}>Volver a la agenda</Link>
      </div>
    </div>
  );
}
