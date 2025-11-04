import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Wrapper component for routes that require authentication
 * Optionally can restrict by role
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div>Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <h2>Acceso Denegado</h2>
        <p>No tenés permisos para acceder a esta sección.</p>
        <a href="/cartelera">Volver a la cartelera</a>
      </div>
    );
  }

  return children;
}
