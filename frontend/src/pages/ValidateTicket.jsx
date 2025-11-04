import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiAuthFetch } from '../lib/api';

export default function ValidateTicket() {
  const { token } = useAuth();
  const [qrData, setQrData] = useState('');
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleValidate = async (e) => {
    e.preventDefault();
    
    if (!qrData.trim()) {
      setError('Ingresá el código QR');
      return;
    }

    setError('');
    setResult(null);
    setValidating(true);

    try {
      const res = await apiAuthFetch('/api/tickets/validate', {
        method: 'POST',
        body: JSON.stringify({ qr_data: qrData.trim(), validation_type: 'manual' })
      }, token);

      const data = await res.json();

      if (res.ok) {
        setResult({
          success: true,
          ...data
        });
        setQrData(''); // Clear input on success
      } else {
        setError(data.message || data.error || 'Error al validar ticket');
        setResult({ success: false, ...data });
      }
    } catch (err) {
      setError('Error de conexión. Verificá tu conexión a internet.');
    } finally {
      setValidating(false);
    }
  };

  const handleClear = () => {
    setQrData('');
    setResult(null);
    setError('');
  };

  return (
    <div style={{ maxWidth: 600, margin: '24px auto', padding: 24 }}>
      <h1>Validar Entrada</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Escaneá el código QR de la entrada o ingresá los datos manualmente.
      </p>

      <form onSubmit={handleValidate} style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
            Datos del QR:
          </label>
          <textarea
            value={qrData}
            onChange={(e) => setQrData(e.target.value)}
            placeholder='{"ticket_id":"...","session_id":"...","user_id":"...","type":"...","seat_code":"...","salt":"...","timestamp":"..."}'
            rows={6}
            style={{
              width: '100%',
              padding: 12,
              border: '1px solid #ccc',
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 12
            }}
          />
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            Pegá aquí el contenido del código QR escaneado
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={validating || !qrData.trim()}
            style={{
              flex: 1,
              padding: 12,
              background: validating ? '#ccc' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: validating || !qrData.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {validating ? 'Validando...' : '✓ Validar Entrada'}
          </button>
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: 12,
              background: '#e5e7eb',
              color: '#374151',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Limpiar
          </button>
        </div>
      </form>

      {error && (
        <div style={{
          padding: 16,
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: 6,
          color: '#991b1b',
          marginBottom: 16
        }}>
          <strong>❌ Error:</strong> {error}
        </div>
      )}

      {result && result.success && (
        <div style={{
          padding: 20,
          background: '#d1fae5',
          border: '2px solid #10b981',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#065f46', marginBottom: 12 }}>
            ✅ Entrada Válida
          </div>
          
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              {result.show?.title}
            </div>
            <div style={{ color: '#666' }}>
              📅 {result.show?.date} • 🕐 {result.show?.time}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div><strong>Sector:</strong> {result.ticket?.section}</div>
            {result.ticket?.seat_code && (
              <div><strong>Asiento:</strong> {result.ticket.seat_code}</div>
            )}
            <div><strong>Tipo:</strong> {result.ticket?.type}</div>
            {result.ticket?.validated_at && (
              <div style={{ marginTop: 8, fontSize: 14, color: '#065f46' }}>
                ✓ Validada el {new Date(result.ticket.validated_at).toLocaleString()}
              </div>
            )}
            {result.validated_by && (
              <div style={{ fontSize: 14, color: '#065f46' }}>
                👤 Validada por: <strong>{result.validated_by.name}</strong>
              </div>
            )}
          </div>

          {result.time_warning && (
            <div style={{
              padding: 12,
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: 4,
              color: '#92400e',
              fontSize: 14,
              marginTop: 12
            }}>
              ⚠️ {result.time_warning}
            </div>
          )}
        </div>
      )}

      {result && !result.success && result.error === 'already_validated' && (
        <div style={{
          padding: 20,
          background: '#fef3c7',
          border: '2px solid #fbbf24',
          borderRadius: 8
        }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#92400e', marginBottom: 8 }}>
            ⚠️ Entrada Ya Validada
          </div>
          <div style={{ color: '#78350f', marginBottom: 4 }}>
            Esta entrada ya fue validada el{' '}
            <strong>
              {result.validated_at && new Date(result.validated_at).toLocaleString()}
            </strong>
          </div>
          {result.validated_by && (
            <div style={{ color: '#78350f', fontSize: 14 }}>
              Validada por: <strong>{result.validated_by.name}</strong> ({result.validated_by.email})
            </div>
          )}
        </div>
      )}

      <div style={{
        marginTop: 32,
        padding: 16,
        background: '#f3f4f6',
        borderRadius: 6,
        fontSize: 14
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>💡 Cómo validar:</div>
        <ol style={{ marginLeft: 20, color: '#666' }}>
          <li>Escaneá el código QR con tu dispositivo</li>
          <li>Copiá los datos del QR (texto JSON)</li>
          <li>Pegá los datos en el campo de arriba</li>
          <li>Presioná "Validar Entrada"</li>
        </ol>
        <div style={{ marginTop: 12, color: '#666', fontSize: 12 }}>
          <strong>Nota:</strong> En el futuro se podrá escanear directamente con la cámara del dispositivo.
        </div>
      </div>
    </div>
  );
}
