import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiAuthFetch } from '../../lib/api';
import Button from '../ui/Button';

export default function NotificationSettings() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  
  const [settings, setSettings] = useState({
    smtp_configured: false,
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    from_email: '',
    admin_emails: ''
  });

  // Load SMTP status from backend
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await apiAuthFetch('/api/notifications/status', {}, token);
        const data = await res.json();
        setSettings(data);
      } catch (err) {
        console.error('Error loading notification status:', err);
      }
    };
    
    if (token) {
      loadStatus();
    }
  }, [token]);

  const handleSendTest = async () => {
    if (!testEmail) {
      setError('Ingresá un email para enviar la prueba');
      return;
    }
    
    setSendingTest(true);
    setError('');
    setSuccess('');
    
    try {
      const res = await apiAuthFetch('/api/notifications/test-email', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail })
      }, token);
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess(data.message);
        setTestEmail('');
      } else {
        setError(data.error || 'Error al enviar email de prueba');
      }
    } catch (err) {
      setError('Error al enviar email de prueba');
      console.error(err);
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>⚙️ Configuración de Notificaciones</h2>

      {/* SMTP Status */}
      <div style={{
        background: settings.smtp_configured ? '#d1fae5' : '#fee2e2',
        padding: 16,
        borderRadius: 8,
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <div style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: settings.smtp_configured ? '#059669' : '#dc2626'
        }} />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {settings.smtp_configured ? '✓ SMTP Configurado' : '⚠️ SMTP No Configurado'}
          </div>
          <div style={{ fontSize: 14 }}>
            {settings.smtp_configured 
              ? 'Los emails se están enviando correctamente.'
              : 'Configurá las credenciales SMTP en el archivo .env para enviar emails.'}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div style={{
        background: '#eff6ff',
        padding: 20,
        borderRadius: 8,
        marginBottom: 24,
        border: '1px solid #3b82f6'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>
          📖 Instrucciones de Configuración
        </h3>
        <div style={{ fontSize: 14, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 12px 0' }}>
            Para habilitar el envío de emails, agregá las siguientes variables al archivo <code style={{
              background: '#dbeafe',
              padding: '2px 6px',
              borderRadius: 4,
              fontFamily: 'monospace'
            }}>.env</code> del backend:
          </p>
          <pre style={{
            background: '#1f2937',
            color: '#f3f4f6',
            padding: 16,
            borderRadius: 6,
            overflow: 'auto',
            fontSize: 13,
            fontFamily: 'monospace'
          }}>
{`EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu-email@gmail.com
EMAIL_PASS=tu-app-password
EMAIL_FROM=Teatro Español Pigüé <tu-email@gmail.com>
ADMIN_NOTIFICATION_EMAILS=admin1@mail.com,admin2@mail.com`}
          </pre>
          <p style={{ margin: '12px 0 0 0' }}>
            Para Gmail, necesitás crear una "Contraseña de aplicación" en tu cuenta de Google.
            Ver <code>EMAIL_SETUP.md</code> para instrucciones detalladas.
          </p>
        </div>
      </div>

      {/* Current Configuration */}
      {settings.smtp_configured && (
        <div style={{
          background: 'white',
          padding: 20,
          borderRadius: 8,
          marginBottom: 24,
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Configuración Actual</h3>
          
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                Servidor SMTP
              </label>
              <div style={{
                padding: 8,
                background: '#f9fafb',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'monospace'
              }}>
                {settings.smtp_host}:{settings.smtp_port}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                Usuario SMTP
              </label>
              <div style={{
                padding: 8,
                background: '#f9fafb',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'monospace'
              }}>
                {settings.smtp_user}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                Email de origen
              </label>
              <div style={{
                padding: 8,
                background: '#f9fafb',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'monospace'
              }}>
                {settings.from_email || settings.smtp_user}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
                Emails de administradores
              </label>
              <div style={{
                padding: 8,
                background: '#f9fafb',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'monospace'
              }}>
                {settings.admin_emails || 'No configurado'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Types */}
      <div style={{
        background: 'white',
        padding: 20,
        borderRadius: 8,
        marginBottom: 24,
        border: '1px solid #e5e7eb'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Tipos de Notificaciones</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 12,
            background: '#f9fafb',
            borderRadius: 6
          }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                📧 Email de Confirmación
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Se envía al cliente después de cada compra (online o boletería)
              </div>
            </div>
            <div style={{
              padding: '4px 12px',
              background: '#d1fae5',
              color: '#059669',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600
            }}>
              Activo
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 12,
            background: '#f9fafb',
            borderRadius: 6
          }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                ⏰ Email de Recordatorio
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Se envía 24 horas antes de la función (ejecutar: npm run send-reminders)
              </div>
            </div>
            <div style={{
              padding: '4px 12px',
              background: '#d1fae5',
              color: '#059669',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600
            }}>
              Activo
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 12,
            background: '#f9fafb',
            borderRadius: 6
          }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                👥 Notificación a Administradores
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Se envía a los admins después de cada venta
              </div>
            </div>
            <div style={{
              padding: '4px 12px',
              background: settings.admin_emails ? '#d1fae5' : '#fee2e2',
              color: settings.admin_emails ? '#059669' : '#dc2626',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600
            }}>
              {settings.admin_emails ? 'Activo' : 'Sin configurar'}
            </div>
          </div>
        </div>
      </div>

      {/* Reminder Schedule */}
      <div style={{
        background: 'white',
        padding: 20,
        borderRadius: 8,
        marginBottom: 24,
        border: '1px solid #e5e7eb'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>⏰ Automatización de Recordatorios</h3>
        
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
          Para enviar recordatorios automáticamente, configurá un cron job en el servidor:
        </p>

        <pre style={{
          background: '#1f2937',
          color: '#f3f4f6',
          padding: 16,
          borderRadius: 6,
          overflow: 'auto',
          fontSize: 13,
          fontFamily: 'monospace',
          marginBottom: 12
        }}>
{`# Editar crontab
crontab -e

# Agregar línea para ejecutar diariamente a las 10:00 AM
0 10 * * * cd /path/to/backend && npm run send-reminders`}
        </pre>

        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          O ejecutar manualmente cuando sea necesario: <code style={{
            background: '#f3f4f6',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'monospace'
          }}>npm run send-reminders</code>
        </p>
      </div>

      {/* Test Email */}
      <div style={{
        background: 'white',
        padding: 20,
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        marginBottom: 24
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Enviar Email de Prueba</h3>
        
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
          Enviá un email de prueba para verificar que la configuración SMTP funciona correctamente:
        </p>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              disabled={!settings.smtp_configured}
              style={{
                width: '100%',
                padding: 12,
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
          </div>
          <Button
            onClick={handleSendTest}
            variant="primary"
            disabled={!settings.smtp_configured || sendingTest}
            style={{ whiteSpace: 'nowrap' }}
          >
            {sendingTest ? 'Enviando...' : 'Enviar Prueba'}
          </Button>
        </div>
        
        {!settings.smtp_configured && (
          <p style={{ fontSize: 13, color: '#dc2626', marginTop: 12, marginBottom: 0 }}>
            Configurá SMTP antes de enviar emails de prueba
          </p>
        )}
      </div>

      {/* Messages */}
      {success && (
        <div style={{
          marginTop: 24,
          padding: 16,
          background: '#d1fae5',
          color: '#059669',
          borderRadius: 8,
          border: '1px solid #059669'
        }}>
          {success}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 24,
          padding: 16,
          background: '#fee2e2',
          color: '#dc2626',
          borderRadius: 8,
          border: '1px solid #dc2626'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
