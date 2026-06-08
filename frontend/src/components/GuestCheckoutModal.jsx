import { useNavigate } from 'react-router-dom';

export default function GuestCheckoutModal({ onClose, onContinueAsGuest, showId }) {
  const navigate = useNavigate();

  const handleRegister = () => {
    // Guardar la URL de retorno en localStorage
    localStorage.setItem('returnTo', `/detalle/${showId}`);
    navigate('/register');
  };

  const handleContinue = () => {
    // Guardar en localStorage que el usuario decidió continuar como guest
    sessionStorage.setItem('guestCheckoutAccepted', 'true');
    onContinueAsGuest();
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        maxWidth: '500px',
        width: '100%',
        padding: '32px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '32px',
            color: 'white',
            fontWeight: 'bold'
          }}>
            i
          </div>
          <h2 style={{
            margin: 0,
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '8px'
          }}>
            Comprá tus entradas
          </h2>
        </div>

        {/* Message */}
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <p style={{
            margin: 0,
            fontSize: '15px',
            lineHeight: '1.6',
            color: '#1e40af'
          }}>
            <strong>Sugerimos adquirir tus entradas con tu usuario</strong>, para que queden guardadas en tu perfil y puedas acceder a ellas en cualquier momento.
          </p>
          <p style={{
            margin: '12px 0 0 0',
            fontSize: '14px',
            lineHeight: '1.6',
            color: '#3b82f6'
          }}>
            Si querés avanzar sin registrarte, asegurate de ingresar tus datos correctamente al finalizar la compra.
          </p>
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <button
            onClick={handleRegister}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 12px rgba(13, 110, 253, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(13, 110, 253, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(13, 110, 253, 0.3)';
            }}
          >
            Registrarme
          </button>

          <button
            onClick={handleContinue}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: 'white',
              color: '#374151',
              border: '2px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#9ca3af';
              e.currentTarget.style.background = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.background = 'white';
            }}
          >
            Continuar sin registro
          </button>
        </div>

        {/* Footer note */}
        <p style={{
          margin: '16px 0 0 0',
          fontSize: '13px',
          color: '#6b7280',
          textAlign: 'center',
          lineHeight: '1.5'
        }}>
          Al continuar sin registro, recibirás tus entradas por email y WhatsApp
        </p>
      </div>
    </div>
  );
}
