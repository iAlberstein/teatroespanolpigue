import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.message || 'Error al enviar el email');
      }
    } catch (err) {
      setError('Error al enviar el email. Intentá de nuevo.');
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
          <h2 style={{ margin: '0 0 12px 0', color: '#065f46' }}>✅ Email enviado</h2>
          <p style={{ margin: 0, color: '#047857' }}>
            Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
          </p>
        </div>
        <Link 
          to="/login" 
          style={{ 
            display: 'inline-block',
            color: '#007bff', 
            textDecoration: 'none', 
            fontWeight: 600 
          }}
        >
          ← Volver al login
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '60px auto', padding: 24 }}>
      <h1>Recuperar contraseña</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>

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
          {loading ? 'Enviando...' : 'Enviar enlace'}
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
