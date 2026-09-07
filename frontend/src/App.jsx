import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Agenda from './pages/Agenda.jsx';
import Salas from './pages/Salas.jsx';
import Conocenos from './pages/Conocenos.jsx';
import Apoyanos from './pages/Apoyanos.jsx';
import TrabajaConNosotros from './pages/TrabajaConNosotros.jsx';
import CentroAyuda from './pages/CentroAyuda.jsx';
import CupoDiscapacidad from './pages/CupoDiscapacidad.jsx';
import Hipoacusicos from './pages/Hipoacusicos.jsx';
import HistoriasBraile from './pages/HistoriasBraile.jsx';
import Contacto from './pages/Contacto.jsx';
import Detalle from './pages/Detalle.jsx';
import ShowInfo from './pages/ShowInfo.jsx';
import Perfil from './pages/Perfil.jsx';
import Boleteria from './pages/Boleteria.jsx';
import Admin from './pages/Admin.jsx';
import ActivityLogs from './pages/ActivityLogs.jsx';
import Validador from './pages/Validador.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import SipagoSuccess from './pages/SipagoSuccess.jsx';
import SipagoFailure from './pages/SipagoFailure.jsx';
import Aportes from './pages/Aportes.jsx';
import AportesSuccess from './pages/AportesSuccess.jsx';
import AportesPending from './pages/AportesPending.jsx';
import AportesFailure from './pages/AportesFailure.jsx';
import AteneoHome from './pages/ateneo/AteneoHome.jsx';
import AteneoAdmin from './pages/ateneo/AteneoAdmin.jsx';
import AteneoDocente from './pages/ateneo/AteneoDocente.jsx';
import AteneoAlumno from './pages/ateneo/AteneoAlumno.jsx';
import AteneoPerfilAlumno from './pages/ateneo/AteneoPerfilAlumno.jsx';
import AteneoInscripcionExitosa from './pages/ateneo/AteneoInscripcionExitosa.jsx';
import SobreElAteneo from './pages/ateneo/SobreElAteneo.jsx';
import { theme } from './styles/theme.js';
import { useState, useEffect, useRef } from 'react';
import isologo from './assets/images/NUEVO_ISOLOGO.png';
import isologoBdx from './assets/images/NUEVO_ISOLOGO_bdx.png';
import logoAteneo from './assets/images/logo_ateneo.png';

const sponsorModules = import.meta.glob('./assets/images/patrocinadores/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  import: 'default'
});

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  
  return null;
}

// ============================================================
// ATENEO NAVBAR
// ============================================================
function AteneoNavbar() {
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const getPerfilLink = () => {
    if (hasRole('admin', 'admin_ateneo')) return '/ateneo/admin';
    if (hasRole('docente_ateneo')) return '/ateneo/docente';
    if (hasRole('alumno_ateneo')) return '/ateneo/alumno';
    return '/ateneo';
  };

  const getPerfilLabel = () => {
    if (hasRole('admin', 'admin_ateneo')) return 'Panel Admin';
    if (hasRole('docente_ateneo')) return 'Mi Perfil Docente';
    return 'Mi Portal';
  };

  const navLinkStyle = (path) => ({
    textDecoration: 'none',
    color: isActive(path) ? '#7c3aed' : theme.colors.textSecondary,
    fontSize: theme.typography.body,
    fontWeight: isActive(path) ? theme.typography.bold : theme.typography.medium,
    transition: theme.transitions.fast,
    borderBottom: isActive(path) ? '2px solid #7c3aed' : '2px solid transparent',
    paddingBottom: '4px',
  });

  const mobileNavLinkStyle = (path) => ({
    textDecoration: 'none',
    color: isActive(path) ? '#7c3aed' : theme.colors.textSecondary,
    padding: theme.spacing.sm,
    fontWeight: isActive(path) ? theme.typography.bold : theme.typography.regular,
    borderLeft: isActive(path) ? '3px solid #7c3aed' : '3px solid transparent',
  });

  return (
    <nav style={{
      background: theme.colors.surface,
      borderBottom: '1px solid #e9e5f5',
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 1000,
      boxShadow: '0 1px 8px rgba(124,58,237,0.06)',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? `${theme.spacing.sm} ${theme.spacing.md}` : `${theme.spacing.md} ${theme.spacing.lg}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Logo Ateneo */}
        <Link to="/ateneo" style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, textDecoration: 'none' }}>
          <img src={logoAteneo} alt="Ateneo de Artes Escénicas" style={{ height: isMobile ? '35px' : '50px', width: 'auto' }} />
        </Link>

        {/* Hamburguesa móvil */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: window.innerWidth < 768 ? 'block' : 'none',
            background: 'none', border: 'none', cursor: 'pointer', padding: theme.spacing.sm,
          }}
        >
          <div style={{ width: '24px', height: '2px', background: theme.colors.textPrimary, marginBottom: '5px' }}></div>
          <div style={{ width: '24px', height: '2px', background: theme.colors.textPrimary, marginBottom: '5px' }}></div>
          <div style={{ width: '24px', height: '2px', background: theme.colors.textPrimary }}></div>
        </button>

        {/* Desktop nav */}
        <div style={{ display: window.innerWidth < 768 ? 'none' : 'flex', gap: theme.spacing.lg, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: theme.spacing.lg }}>
            <Link to="/ateneo" style={navLinkStyle('/ateneo')}>
              Inicio
            </Link>
            <Link to="/ateneo/sobre" style={navLinkStyle('/ateneo/sobre')}>
              Sobre el Ateneo
            </Link>
            {isAuthenticated && (
              <Link to={getPerfilLink()} style={navLinkStyle(getPerfilLink())}>
                {getPerfilLabel()}
              </Link>
            )}
          </div>
          <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
            <Link to="/" style={{
              textDecoration: 'none',
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              background: theme.colors.surfaceAlt,
              color: theme.colors.textSecondary,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.small,
              fontWeight: theme.typography.medium,
              border: `1px solid ${theme.colors.border}`,
              transition: theme.transitions.fast,
            }}>
              Volver al teatro
            </Link>
            {isAuthenticated ? (
              <>
                <span style={{
                  fontSize: theme.typography.small,
                  color: theme.colors.textMuted,
                  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                  background: '#f5f3ff',
                  borderRadius: theme.borderRadius.full,
                }}>
                  {user?.name}
                </span>
                <button
                  onClick={logout}
                  style={{
                    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                    background: '#000000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                    fontSize: theme.typography.small,
                    fontWeight: theme.typography.medium,
                  }}
                >
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link to="/login" style={{ textDecoration: 'none', color: theme.colors.textSecondary, fontSize: theme.typography.small }}>
                  Ingresar
                </Link>
                <Link to="/register" style={{
                  textDecoration: 'none',
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  background: '#000000',
                  color: '#fff',
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

      {/* Menu móvil */}
      {menuOpen && (
        <div ref={menuRef} style={{
          display: window.innerWidth < 768 ? 'flex' : 'none',
          flexDirection: 'column', gap: theme.spacing.sm,
          padding: theme.spacing.md, background: '#faf8ff',
          borderTop: '1px solid #e9e5f5',
        }}>
          <Link to="/ateneo" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/ateneo')}>
            Inicio
          </Link>
          <Link to="/ateneo/sobre" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/ateneo/sobre')}>
            Sobre el Ateneo
          </Link>
          {isAuthenticated && (
            <Link to={getPerfilLink()} onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle(getPerfilLink())}>
              {getPerfilLabel()}
            </Link>
          )}
          <Link to="/" onClick={() => setMenuOpen(false)} style={{
            textDecoration: 'none', padding: theme.spacing.sm,
            color: theme.colors.textSecondary, fontWeight: theme.typography.medium,
            borderLeft: '3px solid transparent',
          }}>
            Volver al teatro
          </Link>
          {isAuthenticated ? (
            <button
              onClick={() => { logout(); setMenuOpen(false); }}
              style={{
                padding: theme.spacing.sm, background: '#000000', color: '#fff',
                border: 'none', borderRadius: theme.borderRadius.md, cursor: 'pointer', textAlign: 'left',
              }}
            >
              Salir
            </button>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/login')}>Ingresar</Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} style={{
                textDecoration: 'none', padding: theme.spacing.sm,
                background: '#000000', color: '#fff',
                borderRadius: theme.borderRadius.md, textAlign: 'center',
              }}>Registrarse</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

// ============================================================
// TEATRO NAVBAR
// ============================================================
function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  const navLinkStyle = (path) => ({
    textDecoration: 'none',
    color: isActive(path) ? theme.colors.textPrimary : theme.colors.textSecondary,
    fontSize: theme.typography.body,
    fontWeight: isActive(path) ? theme.typography.bold : theme.typography.medium,
    transition: theme.transitions.fast,
    borderBottom: isActive(path) ? `2px solid ${theme.colors.textPrimary}` : '2px solid transparent',
    paddingBottom: '4px',
  });

  const mobileNavLinkStyle = (path) => ({
    textDecoration: 'none',
    color: isActive(path) ? theme.colors.textPrimary : theme.colors.textSecondary,
    padding: theme.spacing.sm,
    fontWeight: isActive(path) ? theme.typography.bold : theme.typography.regular,
    borderLeft: isActive(path) ? `3px solid ${theme.colors.primary}` : '3px solid transparent',
  });
  
  return (
    <nav style={{ 
      background: theme.colors.surface,
      borderBottom: `1px solid ${theme.colors.border}`,
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
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
            src={isologo} 
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
            <Link to="/agenda" style={navLinkStyle('/agenda')}>
              Agenda
            </Link>
            <Link to="/conocenos" style={navLinkStyle('/conocenos')}>
              Conocenos
            </Link>
            <Link to="/salas" style={navLinkStyle('/salas')}>
              Salas
            </Link>
            <Link to="/ateneo" style={navLinkStyle('/ateneo')}>
              Ateneo
            </Link>
            {isAuthenticated && (
              <>
                {user?.role !== 'boleteria' && (
                  <Link to="/perfil" style={navLinkStyle('/perfil')}>
                    Mi Perfil
                  </Link>
                )}
                {(user?.role === 'boleteria' || user?.role === 'admin') && (
                  <>
                    <Link to="/validar" style={navLinkStyle('/validar')}>
                      Validar
                    </Link>
                    <Link to="/boleteria" style={navLinkStyle('/boleteria')}>
                      Boleteria
                    </Link>
                  </>
                )}
                {user?.role === 'admin' && (
                  <Link to="/activity-logs" style={navLinkStyle('/activity-logs')}>
                    Logs
                  </Link>
                )}
                {(user?.role === 'admin' || user?.role === 'boleteria') && (
                  <Link to="/admin" style={navLinkStyle('/admin')}>
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
                    background: theme.colors.primary,
                    color: theme.colors.surface,
                    border: 'none',
                    borderRadius: theme.borderRadius.md,
                    cursor: 'pointer',
                    fontSize: theme.typography.small,
                    fontWeight: theme.typography.medium,
                    transition: theme.transitions.fast,
                  }}
                  onMouseOver={(e) => e.target.style.background = theme.colors.primaryLight}
                  onMouseOut={(e) => e.target.style.background = theme.colors.primary}
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

      {/* Menu movil */}
      {menuOpen && (
        <div 
          ref={menuRef}
          style={{
            display: window.innerWidth < 768 ? 'flex' : 'none',
            flexDirection: 'column',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            background: theme.colors.surfaceAlt,
            borderTop: `1px solid ${theme.colors.border}`,
          }}
        >
          <Link to="/agenda" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/agenda')}>
            Agenda
          </Link>
          <Link to="/conocenos" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/conocenos')}>
            Conocenos
          </Link>
          <Link to="/salas" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/salas')}>
            Salas
          </Link>
          <Link to="/ateneo" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/ateneo')}>
            Ateneo
          </Link>
          {isAuthenticated && (
            <>
              {user?.role !== 'boleteria' && (
                <Link to="/perfil" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/perfil')}>
                  Mi Perfil
                </Link>
              )}
              {(user?.role === 'boleteria' || user?.role === 'admin') && (
                <>
                  <Link to="/validar" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/validar')}>
                    Validar
                  </Link>
                  <Link to="/boleteria" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/boleteria')}>
                    Boleteria
                  </Link>
                </>
              )}
              {(user?.role === 'admin' || user?.role === 'boleteria') && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/admin')}>
                  Admin
                </Link>
              )}
              {user?.role === 'admin' && (
                <Link to="/activity-logs" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/activity-logs')}>
                  Logs
                </Link>
              )}
              <button 
                onClick={() => { logout(); setMenuOpen(false); }}
                style={{
                  padding: theme.spacing.sm,
                  background: theme.colors.primary,
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
              <Link to="/login" onClick={() => setMenuOpen(false)} style={mobileNavLinkStyle('/login')}>
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

// Placeholder component for new sections
function PlaceholderPage({ title }) {
  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
      textAlign: 'center'
    }}>
      <h1 style={{
        fontSize: theme.typography.h1,
        color: theme.colors.textPrimary,
        marginBottom: theme.spacing.md
      }}>
        {title}
      </h1>
      <p style={{
        color: theme.colors.textSecondary,
        fontSize: theme.typography.body
      }}>
        Contenido en desarrollo
      </p>
    </div>
  );
}

// Footer component
function Footer() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [newsletterName, setNewsletterName] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState({ loading: false, message: '', error: false });

  const handleSubscribe = async () => {
    if (!newsletterName.trim() || !newsletterEmail.trim()) {
      setNewsletterStatus({ loading: false, message: 'Completa todos los campos', error: true });
      return;
    }
    
    setNewsletterStatus({ loading: true, message: '', error: false });
    
    try {
      const API_URL = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${API_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newsletterName, email: newsletterEmail })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setNewsletterStatus({ loading: false, message: 'Suscripcion exitosa', error: false });
        setNewsletterName('');
        setNewsletterEmail('');
      } else {
        setNewsletterStatus({ loading: false, message: data.message || 'Error al suscribirse', error: true });
      }
    } catch (err) {
      setNewsletterStatus({ loading: false, message: 'Error de conexion', error: true });
    }
  };

  const columnTitleStyle = {
    fontSize: theme.typography.small,
    fontWeight: theme.typography.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  };

  const linkStyle = {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.small,
    textDecoration: 'none',
    display: 'block',
    marginBottom: theme.spacing.sm,
    transition: theme.transitions.fast
  };

  const inputStyle = {
    width: '100%',
    padding: theme.spacing.sm,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.small,
    marginBottom: theme.spacing.sm,
    outline: 'none'
  };

  // Social icons as simple SVGs
  const InstagramIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  );

  const FacebookIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
    </svg>
  );

  const MailIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );

  const WhatsAppIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  );

  return (
    <footer style={{
      background: theme.colors.surface,
      borderTop: `1px solid ${theme.colors.border}`,
      marginTop: 'auto'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? theme.spacing.lg : theme.spacing.xl
      }}>
        {/* Main columns */}
        <div style={{
          display: isMobile ? 'flex' : 'grid',
          flexDirection: 'column',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: isMobile ? theme.spacing.xl : theme.spacing.lg
        }}>
          {/* Column 1: Newsletter */}
          <div style={{ paddingRight: isMobile ? 0 : theme.spacing.lg, borderRight: isMobile ? 'none' : `1px solid ${theme.colors.border}` }}>
            <h4 style={columnTitleStyle}>Suscribite al Newsletter</h4>
            <p style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, marginBottom: theme.spacing.md, lineHeight: 1.5 }}>
              Sumate a nuestro newsletter y recibi en tu correo las ultimas novedades.
            </p>
            <input
              type="text"
              placeholder="Nombre"
              value={newsletterName}
              onChange={(e) => setNewsletterName(e.target.value)}
              style={inputStyle}
            />
            <input
              type="email"
              placeholder="Correo electronico"
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              style={inputStyle}
            />
            <button 
              onClick={handleSubscribe}
              disabled={newsletterStatus.loading}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                background: newsletterStatus.loading ? theme.colors.textMuted : theme.colors.primary,
                color: theme.colors.surface,
                border: 'none',
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.small,
                fontWeight: theme.typography.semibold,
                cursor: newsletterStatus.loading ? 'wait' : 'pointer'
              }}
            >
              {newsletterStatus.loading ? 'ENVIANDO...' : 'SUSCRIBIRME'}
            </button>
            {newsletterStatus.message && (
              <p style={{
                fontSize: theme.typography.tiny,
                color: newsletterStatus.error ? '#ef4444' : '#22c55e',
                marginTop: theme.spacing.sm,
                marginBottom: 0
              }}>
                {newsletterStatus.message}
              </p>
            )}
          </div>

          {/* Column 2: Sitio */}
          <div style={{ paddingLeft: isMobile ? 0 : theme.spacing.lg, paddingRight: isMobile ? 0 : theme.spacing.lg, borderRight: isMobile ? 'none' : `1px solid ${theme.colors.border}`, borderTop: isMobile ? `1px solid ${theme.colors.border}` : 'none', paddingTop: isMobile ? theme.spacing.lg : 0 }}>
            <h4 style={columnTitleStyle}>Sitio</h4>
            <Link to="/conocenos" style={linkStyle}>Nosotros</Link>
            <Link to="/apoyanos" style={linkStyle}>Apoyanos</Link>
            <Link to="/salas" style={linkStyle}>Salas</Link>
            <Link to="/ateneo" style={linkStyle}>Ateneo</Link>
            <Link to="/trabaja-con-nosotros" style={linkStyle}>Trabaja con nosotros</Link>
            <Link to="/centro-de-ayuda" style={linkStyle}>Centro de ayuda</Link>
          </div>

          {/* Column 3: Accesibilidad */}
          <div style={{ paddingLeft: isMobile ? 0 : theme.spacing.lg, paddingRight: isMobile ? 0 : theme.spacing.lg, borderRight: isMobile ? 'none' : `1px solid ${theme.colors.border}`, borderTop: isMobile ? `1px solid ${theme.colors.border}` : 'none', paddingTop: isMobile ? theme.spacing.lg : 0 }}>
            <h4 style={columnTitleStyle}>Accesibilidad</h4>
            <Link to="/accesibilidad/cupo-discapacidad" style={linkStyle}>Cupo discapacidad</Link>
            <Link to="/accesibilidad/hipoacusicos" style={linkStyle}>Hipoacusicos</Link>
            <Link to="/accesibilidad/historias-en-braile" style={linkStyle}>Historias en braile</Link>
          </div>

          {/* Column 4: Encontranos */}
          <div style={{ paddingLeft: isMobile ? 0 : theme.spacing.lg, borderTop: isMobile ? `1px solid ${theme.colors.border}` : 'none', paddingTop: isMobile ? theme.spacing.lg : 0 }}>
            <h4 style={columnTitleStyle}>Encontranos</h4>
            <p style={{ ...linkStyle, marginBottom: theme.spacing.md }}>
              <strong>Horarios de boletería:</strong><br />
              miércoles a viernes 18:00 a 20:30<br />
              <span style={{ fontSize: theme.typography.tiny }}>(pagos en efectivo y QR con dinero en cuenta)</span>
            </p>
            <p style={{ ...linkStyle, marginBottom: theme.spacing.md }}>
              Espana 120, Pigue, Provincia de Buenos Aires, Argentina
            </p>
            <p style={{ ...linkStyle, marginBottom: theme.spacing.md }}>
              (+54) 2923 67-9531
            </p>
            <Link to="/contacto" style={{
              display: 'inline-block',
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              background: theme.colors.primary,
              color: theme.colors.surface,
              textDecoration: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.small,
              fontWeight: theme.typography.semibold,
              cursor: 'pointer'
            }}>
              CONTACTANOS
            </Link>
          </div>
        </div>

        {/* Bottom section */}
        <div style={{
          borderTop: `1px solid ${theme.colors.border}`,
          marginTop: theme.spacing.xl,
          paddingTop: theme.spacing.xl,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: theme.spacing.md
        }}>
          <img 
            src={isologo} 
            alt="Teatro Espanol Pigue" 
            style={{ height: 50, width: 'auto' }}
          />
          
          {/* Social icons */}
          <div style={{ display: 'flex', gap: theme.spacing.md, color: theme.colors.textPrimary }}>
            <a href="https://www.instagram.com/teatroespanolpigue" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
              <InstagramIcon />
            </a>
            <a href="https://www.facebook.com/teatroespanolpigue" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
              <FacebookIcon />
            </a>
            <a href="mailto:teatropigue@gmail.com" style={{ color: 'inherit' }}>
              <MailIcon />
            </a>
            <a href="https://wa.me/5492923679531" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
              <WhatsAppIcon />
            </a>
          </div>

          {/* Copyright */}
          <p style={{
            fontSize: theme.typography.tiny,
            color: theme.colors.textMuted,
            margin: 0
          }}>
            © Teatro Espanol Pigüé
          </p>
        </div>
      </div>
    </footer>
  );
}

// Static fallback logos from assets
const staticSponsorLogos = Object.entries(sponsorModules)
  .map(([path, src]) => {
    const fileName = path.split('/').pop() || '';
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const displayName = baseName
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return {
      src,
      alt: `Patrocinador ${displayName}`.trim()
    };
  })
  .sort((a, b) => a.alt.localeCompare(b.alt));

const API_URL = import.meta.env.VITE_API_URL || '';

function SponsorsMarquee() {
  const [logos, setLogos] = useState(staticSponsorLogos);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/sponsors`);
        if (res.ok) {
          const data = await res.json();
          // API is the source of truth: use its data (even if empty)
          setLogos(data.map(s => ({
            src: `${API_URL}${s.url}`,
            alt: s.filename
          })));
        }
      } catch (err) { /* API failed, keep static fallback */ }
    })();
  }, []);

  if (logos.length === 0) return null;
  const trackLogos = [...logos, ...logos];
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <section
      aria-label="Patrocinadores del Teatro Español Pigüé"
      style={{
        background: '#ffffff',
        borderTop: `1px solid ${theme.colors.border}`,
        borderBottom: `1px solid ${theme.colors.border}`
      }}
    >
      <style>
        {`
          @keyframes sponsorScroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}
      </style>
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: `${theme.spacing.lg} 0`,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '3px' : theme.spacing['2xl'],
            animation: 'sponsorScroll 35s linear infinite',
            width: 'max-content',
            minWidth: '100%'
          }}
        >
          {trackLogos.map(({ src, alt }, index) => (
            <div
              key={`${alt}-${index}`}
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `0 ${theme.spacing.lg}`
              }}
            >
              <img
                src={src}
                alt={alt}
                style={{
                  height: 56,
                  width: 'auto',
                  filter: 'grayscale(1)',
                  opacity: 0.9,
                  transition: 'filter 0.3s ease, opacity 0.3s ease'
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isAteneo = location.pathname.startsWith('/ateneo');
  const isFullWidth =
    location.pathname === '/' ||
    location.pathname.startsWith('/boleteria') ||
    location.pathname.startsWith('/detalle') ||
    location.pathname.startsWith('/info');
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const containerStyle = isAteneo
    ? {
        width: '100%',
        maxWidth: '1400px',
        margin: '0 auto',
        padding: isMobile ? '16px' : '24px 32px',
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }
    : isFullWidth
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
      display: 'flex',
      flexDirection: 'column',
      background: theme.colors.background,
      fontFamily: theme.typography.fontFamily,
      overflowX: 'hidden'
    }}>
      {isAteneo ? <AteneoNavbar /> : <Navbar />}
      <ScrollToTop />
      {/* Spacer for fixed navbar */}
      <div style={{ height: isAteneo ? (isMobile ? '60px' : '72px') : (isMobile ? '55px' : '70px') }} />
      <div style={{ ...containerStyle, flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/conocenos" element={<Conocenos />} />
          <Route path="/salas" element={<Salas />} />
          <Route path="/ateneo" element={<AteneoHome />} />
          <Route path="/ateneo/sobre" element={<SobreElAteneo />} />
          <Route path="/ateneo/admin" element={
            <ProtectedRoute allowedRoles={['admin', 'admin_ateneo']}>
              <AteneoAdmin />
            </ProtectedRoute>
          } />
          <Route path="/ateneo/docente" element={
            <ProtectedRoute allowedRoles={['docente_ateneo', 'admin', 'admin_ateneo']}>
              <AteneoDocente />
            </ProtectedRoute>
          } />
          <Route path="/ateneo/alumno" element={
            <ProtectedRoute allowedRoles={['alumno_ateneo', 'admin', 'admin_ateneo']}>
              <AteneoAlumno />
            </ProtectedRoute>
          } />
          <Route path="/ateneo/perfil" element={
            <ProtectedRoute allowedRoles={['alumno_ateneo', 'admin', 'admin_ateneo']}>
              <AteneoPerfilAlumno />
            </ProtectedRoute>
          } />
          <Route path="/ateneo/inscripcion-exitosa" element={<AteneoInscripcionExitosa />} />
          <Route path="/apoyanos" element={<Apoyanos />} />
          <Route path="/trabaja-con-nosotros" element={<TrabajaConNosotros />} />
          <Route path="/centro-de-ayuda" element={<CentroAyuda />} />
          <Route path="/accesibilidad/cupo-discapacidad" element={<CupoDiscapacidad />} />
          <Route path="/accesibilidad/gestion-de-publicos" element={<PlaceholderPage title="Gestion de publicos" />} />
          <Route path="/accesibilidad/hipoacusicos" element={<Hipoacusicos />} />
          <Route path="/accesibilidad/historias-en-braile" element={<HistoriasBraile />} />
          <Route path="/accesibilidad/discapacidad-motriz" element={<PlaceholderPage title="Discapacidad motriz" />} />
          <Route path="/contacto" element={<Contacto />} />
          <Route path="/detalle/:id" element={<Detalle />} />
          <Route path="/info/:id" element={<ShowInfo />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/recuperar-contrasena" element={<ForgotPassword />} />
          <Route path="/restablecer-contrasena" element={<ResetPassword />} />
          
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
          
          {/* Payment callbacks (Sipago) */}
          <Route path="/sipago/success" element={<SipagoSuccess />} />
          <Route path="/sipago/failure" element={<SipagoFailure />} />
          
          {/* Aportes Solidarios (hidden route) */}
          <Route path="/aportes" element={<Aportes />} />
          <Route path="/aportes/success" element={<AportesSuccess />} />
          <Route path="/aportes/pending" element={<AportesPending />} />
          <Route path="/aportes/failure" element={<AportesFailure />} />
        </Routes>
      </div>
      {!isAteneo && <SponsorsMarquee />}
      {!isAteneo && <Footer />}
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
