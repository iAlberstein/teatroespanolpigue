import { Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Cartelera from './pages/Cartelera.jsx';
import Detalle from './pages/Detalle.jsx';
import Perfil from './pages/Perfil.jsx';
import Boleteria from './pages/Boleteria.jsx';
import Admin from './pages/Admin.jsx';
import ValidateTicket from './pages/ValidateTicket.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MpSuccess from './pages/MpSuccess.jsx';
import MpPending from './pages/MpPending.jsx';
import MpFailure from './pages/MpFailure.jsx';

function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  
  return (
    <nav style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      padding: '12px 16px',
      background: '#f8f9fa',
      borderBottom: '1px solid #dee2e6',
      marginBottom: 16 
    }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link to="/" style={{ textDecoration: 'none', color: '#333' }}>Home</Link>
        <Link to="/cartelera" style={{ textDecoration: 'none', color: '#333' }}>Cartelera</Link>
        {isAuthenticated && (
          <>
            <Link to="/perfil" style={{ textDecoration: 'none', color: '#333' }}>Mi Perfil</Link>
            {(user?.role === 'boleteria' || user?.role === 'admin') && (
              <>
                <Link to="/validar" style={{ textDecoration: 'none', color: '#333' }}>✓ Validar Entrada</Link>
                <Link to="/boleteria" style={{ textDecoration: 'none', color: '#333' }}>Boletería</Link>
              </>
            )}
            {user?.role === 'admin' && (
              <Link to="/admin" style={{ textDecoration: 'none', color: '#333' }}>Admin</Link>
            )}
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {isAuthenticated ? (
          <>
            <span style={{ fontSize: 14, color: '#666' }}>
              👤 {user?.name} <span style={{ fontSize: 12, color: '#999' }}>({user?.role})</span>
            </span>
            <button 
              onClick={logout}
              style={{
                padding: '6px 12px',
                background: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              Cerrar sesión
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={{ textDecoration: 'none', color: '#007bff' }}>Iniciar sesión</Link>
            <Link to="/register" style={{ textDecoration: 'none', color: '#28a745', fontWeight: 600 }}>Registrarse</Link>
          </>
        )}
      </div>
    </nav>
  );
}

function AppRoutes() {
  return (
    <div>
      <Navbar />
      <div style={{ padding: '0 16px' }}>
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
              <ValidateTicket />
            </ProtectedRoute>
          } />
          <Route path="/boleteria" element={
            <ProtectedRoute allowedRoles={['boleteria', 'admin']}>
              <Boleteria />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Admin />
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
