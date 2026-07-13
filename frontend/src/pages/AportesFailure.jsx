import { Link, useNavigate } from 'react-router-dom';
import { theme } from '../styles/theme.js';

export default function AportesFailure() {
  const navigate = useNavigate();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <div style={{ minHeight: '100vh', background: '#fff5f5', paddingTop: '80px', paddingBottom: '60px' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: isMobile ? theme.spacing.lg : theme.spacing.xl, textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: theme.spacing.lg }}>❌</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: theme.typography.bold, color: theme.colors.textPrimary, marginBottom: theme.spacing.md }}>
          El pago no se procesó
        </h1>
        <p style={{ fontSize: theme.typography.body, color: theme.colors.textSecondary, lineHeight: 1.6, marginBottom: theme.spacing.xl }}>
          Hubo un problema con tu pago. No se realizó ningún cobro. Podés intentarlo nuevamente o elegir pago por transferencia.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <button onClick={() => navigate('/aportes')} style={{ padding: `${theme.spacing.md} ${theme.spacing.lg}`, background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: theme.borderRadius.md, cursor: 'pointer', fontWeight: theme.typography.semibold, fontSize: theme.typography.body }}>
            Intentar nuevamente
          </button>
          <Link to="/" style={{ padding: `${theme.spacing.md} ${theme.spacing.lg}`, background: theme.colors.surfaceAlt, color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius.md, textDecoration: 'none' }}>
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
