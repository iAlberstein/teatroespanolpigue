import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token inválido o faltante');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => navigate('/login'), 3000);
      } else {
        const data = await res.json();
        if (data.error === 'invalid_token') {
          setError('El enlace de recuperación es inválido o ha expirado');
        } else {
          setError(data.message || 'Error al restablecer la contraseña');
        }
      }
    } catch (err) {
      setError('Error al restablecer la contraseña. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: 400, margin: '60px auto', padding: 24 }}>
        <div style={{ 
          padding: 20, 
          background: '#d1fae5', 
          border: '1px solid #10b981', 
          borderRadius: 8,
          marginBottom: 20
        }}>
          <h2 style={{ margin: '0 0 12px 0', color: '#065f46' }}>✅ Contraseña restablecida</h2>
          <p style={{ margin: 0, color: '#047857' }}>
            Tu contraseña se ha restablecido correctamente. Serás redirigido al login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', padding: 24 }}>
      <h1>Restablecer contraseña</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Ingresá tu nueva contraseña.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ padding: 12, background: '#fee', border: '1px solid #fcc', borderRadius: 4, color: '#c00' }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Nueva contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            disabled={!token || loading}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Confirmar contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            disabled={!token || loading}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }}
          />
        </div>

        <button
          type="submit"
          disabled={!token || loading}
          style={{
            padding: 12,
            background: token && !loading ? '#28a745' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            fontWeight: 600,
            cursor: token && !loading ? 'pointer' : 'not-allowed'
          }}
        >
          {loading ? 'Restableciendo...' : 'Restablecer contraseña'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Link to="/login" style={{ color: '#007bff', textDecoration: 'none', fontWeight: 600 }}>
            ← Volver al login
          </Link>
        </div>
      </form>
    </div>
  );
}
