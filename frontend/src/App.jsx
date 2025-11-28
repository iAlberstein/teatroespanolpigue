import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Cartelera from './pages/Cartelera.jsx';
import Detalle from './pages/Detalle.jsx';
import Perfil from './pages/Perfil.jsx';
import Boleteria from './pages/Boleteria.jsx';
import Admin from './pages/Admin.jsx';
import ActivityLogs from './pages/ActivityLogs.jsx';
import Validador from './pages/Validador.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MpSuccess from './pages/MpSuccess.jsx';
import MpPending from './pages/MpPending.jsx';
import MpFailure from './pages/MpFailure.jsx';
import { theme } from './styles/theme.js';
import { useState } from 'react';

function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  return (
    <nav style={{ 
      background: theme.colors.surface,
      borderBottom: `1px solid ${theme.colors.border}`,
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      boxShadow: theme.shadows.sm,
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? `${theme.spacing.sm} ${theme.spacing.md}` : `${theme.spacing.md} ${theme.spacing.lg}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Logo y nombre */}
        <Link to="/" style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: theme.spacing.md,
          textDecoration: 'none',
        }}>
          <img 
            src="/media/images/NUEVO_ISOLOGO.png" 
            alt="Teatro Español Pigüé" 
            style={{ 
              height: isMobile ? '35px' : '50px',
              width: 'auto',
            }} 
          />
        
        </Link>

        {/* Botón hamburguesa para móvil */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: window.innerWidth < 768 ? 'block' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: theme.spacing.sm,
          }}
        >
          <div style={{ width: '24px', height: '2px', background: theme.colors.textPrimary, marginBottom: '5px' }}></div>
          <div style={{ width: '24px', height: '2px', background: theme.colors.textPrimary, marginBottom: '5px' }}></div>
          <div style={{ width: '24px', height: '2px', background: theme.colors.textPrimary }}></div>
        </button>

        {/* Navegación desktop */}
        <div style={{ 
          display: window.innerWidth < 768 ? 'none' : 'flex', 
          gap: theme.spacing.lg,
          alignItems: 'center',
        }}>
          {/* Links principales */}
          <div style={{ display: 'flex', gap: theme.spacing.lg }}>
            {(!isAuthenticated || (user?.role !== 'boleteria' && user?.role !== 'admin')) && (
              <Link to="/cartelera" style={{ 
                textDecoration: 'none', 
                color: theme.colors.textSecondary,
                fontSize: theme.typography.body,
                fontWeight: theme.typography.medium,
                transition: theme.transitions.fast,
                ':hover': { color: theme.colors.primary }
              }}>
                Cartelera
              </Link>
            )}
            {isAuthenticated && (
              <>
                {user?.role !== 'boleteria' && (
                  <Link to="/perfil" style={{ 
                    textDecoration: 'none', 
                    color: theme.colors.textSecondary,
                    fontSize: theme.typography.body,
                    fontWeight: theme.typography.medium,
                  }}>
                    Mi Perfil
                  </Link>
                )}
                {(user?.role === 'boleteria' || user?.role === 'admin') && (
                  <>
                    <Link to="/validar" style={{ 
                      textDecoration: 'none', 
                      color: theme.colors.textSecondary,
                      fontSize: theme.typography.body,
                      fontWeight: theme.typography.medium,
                    }}>
                      Validar
                    </Link>
                    <Link to="/boleteria" style={{ 
                      textDecoration: 'none', 
                      color: theme.colors.textSecondary,
                      fontSize: theme.typography.body,
                      fontWeight: theme.typography.medium,
                    }}>
                      Boletería
                    </Link>
                  </>
                )}
                {user?.role === 'admin' && (
                  <Link to="/activity-logs" style={{ 
                    textDecoration: 'none', 
                    color: theme.colors.textSecondary,
                    fontSize: theme.typography.body,
                    fontWeight: theme.typography.medium,
                  }}>
                    Logs
                  </Link>
                )}
                {(user?.role === 'admin' || user?.role === 'boleteria') && (
                  <Link to="/admin" style={{ 
                    textDecoration: 'none', 
                    color: theme.colors.textSecondary,
                    fontSize: theme.typography.body,
                    fontWeight: theme.typography.medium,
                  }}>
                    Admin
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Usuario / Auth */}
          <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
            {isAuthenticated ? (
              <>
                <span style={{ 
                  fontSize: theme.typography.small, 
                  color: theme.colors.textMuted,
                  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                  background: theme.colors.surfaceAlt,
                  borderRadius: theme.borderRadius.full,
                }}>
                  {user?.name}
                </span>
                <button 
                  onClick={logout}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    background: theme.colors.accent,
                    color: theme.colors.surface,
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                    fontSize: theme.typography.small,
                    fontWeight: theme.typography.medium,
                    transition: theme.transitions.fast,
                  }}
                  onMouseOver={(e) => e.target.style.background = theme.colors.accentLight}
                  onMouseOut={(e) => e.target.style.background = theme.colors.accent}
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link to="/login" style={{ 
                  textDecoration: 'none', 
                  color: theme.colors.textSecondary,
                  fontSize: theme.typography.small,
                  fontWeight: theme.typography.medium,
                }}>
                  Ingresar
                </Link>
                <Link to="/register" style={{ 
                  textDecoration: 'none', 
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  background: theme.colors.primary,
                  color: theme.colors.surface,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.small,
                  fontWeight: theme.typography.semibold,
                }}>
                  Registrarse
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Menú móvil */}
      {menuOpen && (
        <div style={{
          display: window.innerWidth < 768 ? 'flex' : 'none',
          flexDirection: 'column',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          background: theme.colors.surfaceAlt,
          borderTop: `1px solid ${theme.colors.border}`,
        }}>
          {(!isAuthenticated || (user?.role !== 'boleteria' && user?.role !== 'admin')) && (
            <Link to="/cartelera" onClick={() => setMenuOpen(false)} style={{ 
              textDecoration: 'none', 
              color: theme.colors.textSecondary,
              padding: theme.spacing.sm,
            }}>
              Cartelera
            </Link>
          )}
          {isAuthenticated && (
            <>
              {user?.role !== 'boleteria' && (
                <Link to="/perfil" onClick={() => setMenuOpen(false)} style={{ 
                  textDecoration: 'none', 
                  color: theme.colors.textSecondary,
                  padding: theme.spacing.sm,
                }}>
                  Mi Perfil
                </Link>
              )}
              {(user?.role === 'boleteria' || user?.role === 'admin') && (
                <>
                  <Link to="/validar" onClick={() => setMenuOpen(false)} style={{ 
                    textDecoration: 'none', 
                    color: theme.colors.textSecondary,
                    padding: theme.spacing.sm,
                  }}>
                    Validar
                  </Link>
                  <Link to="/boleteria" onClick={() => setMenuOpen(false)} style={{ 
                    textDecoration: 'none', 
                    color: theme.colors.textSecondary,
                    padding: theme.spacing.sm,
                  }}>
                    Boletería
                  </Link>
                </>
              )}
              {(user?.role === 'admin' || user?.role === 'boleteria') && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} style={{ 
                  textDecoration: 'none', 
                  color: theme.colors.textSecondary,
                  padding: theme.spacing.sm,
                }}>
                  Admin
                </Link>
              )}
              {user?.role === 'admin' && (
                <Link to="/activity-logs" onClick={() => setMenuOpen(false)} style={{ 
                  textDecoration: 'none', 
                  color: theme.colors.textSecondary,
                  padding: theme.spacing.sm,
                }}>
                  Logs
                </Link>
              )}
              <button 
                onClick={() => { logout(); setMenuOpen(false); }}
                style={{
                  padding: theme.spacing.sm,
                  background: theme.colors.accent,
                  color: theme.colors.surface,
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Salir
              </button>
            </>
          )}
          {!isAuthenticated && (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)} style={{ 
                textDecoration: 'none', 
                color: theme.colors.textSecondary,
                padding: theme.spacing.sm,
              }}>
                Ingresar
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} style={{ 
                textDecoration: 'none', 
                padding: theme.spacing.sm,
                background: theme.colors.primary,
                color: theme.colors.surface,
                borderRadius: theme.borderRadius.md,
                textAlign: 'center',
              }}>
                Registrarse
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isFullWidth =
    location.pathname.startsWith('/boleteria') ||
    location.pathname.startsWith('/cartelera');
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const containerStyle = isFullWidth
    ? {
        width: '100%',
        margin: 0,
        padding: 0,
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }
    : {
        width: '100%',
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? '16px' : theme.spacing.lg,
        boxSizing: 'border-box',
        overflowX: 'hidden'
      };

  return (
    <div style={{
      minHeight: '100vh',
      background: theme.colors.background,
      fontFamily: theme.typography.fontFamily,
      overflowX: 'hidden'
    }}>
      <Navbar />
      <div style={containerStyle}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cartelera" element={<Cartelera />} />
          <Route path="/cartelera/:id" element={<Detalle />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected routes */}
          <Route path="/perfil" element={
            <ProtectedRoute>
              <Perfil />
            </ProtectedRoute>
          } />
          <Route path="/validar" element={
            <ProtectedRoute allowedRoles={['boleteria', 'admin']}>
              <Validador />
            </ProtectedRoute>
          } />
          <Route path="/boleteria" element={
            <ProtectedRoute allowedRoles={['boleteria', 'admin']}>
              <Boleteria />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin', 'boleteria', 'productor']}>
              <Admin />
            </ProtectedRoute>
          } />
          <Route path="/activity-logs" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ActivityLogs />
            </ProtectedRoute>
          } />
          
          {/* Payment callbacks */}
          <Route path="/mp/success" element={<MpSuccess />} />
          <Route path="/mp/pending" element={<MpPending />} />
          <Route path="/mp/failure" element={<MpFailure />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
