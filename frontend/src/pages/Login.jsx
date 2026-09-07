import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // Si venimos de un cierre de sesión automático por token vencido
  // (ej: boletero validando entradas durante varios días), mostramos aviso.
  useEffect(() => {
    if (sessionStorage.getItem('session_expired')) {
      setError('Tu sesión venció. Iniciá sesión nuevamente para continuar.');
      sessionStorage.removeItem('session_expired');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'Error al iniciar sesión');
    }

    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', padding: 24 }}>
      <h1>Iniciar Sesión</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ padding: 12, background: '#fee', border: '1px solid #fcc', borderRadius: 4, color: '#c00' }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            background: '#000000',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Iniciando...' : 'Iniciar Sesión'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Link to="/recuperar-contrasena" style={{ color: '#007bff', textDecoration: 'none', fontSize: 14 }}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <span style={{ color: '#666' }}>¿No tenés cuenta? </span>
          <Link to="/register" style={{ color: '#007bff', textDecoration: 'none', fontWeight: 600 }}>
            Registrate
          </Link>
        </div>
      </form>
    </div>
  );
}
