import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { theme } from '../styles/theme.js';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function AportesSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const paymentId = params.get('payment_id');
  const externalReference = params.get('external_reference');
  const status = params.get('status');
  const collectionStatus = params.get('collection_status');
  const merchantOrderId = params.get('merchant_order_id');

  const [aportes, setAportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const isApproved = status === 'approved' || collectionStatus === 'approved';

  useEffect(() => {
    // Llamar confirm-payment como fallback por si el webhook llegó tarde
    if (paymentId && isApproved) {
      fetch(`${API_URL}/api/aportes/confirm-payment?payment_id=${paymentId}&external_reference=${externalReference || ''}&collection_status=approved`)
        .catch(() => {});
    }
    if (externalReference) {
      // Esperar un momento para que confirm-payment procese antes de fetchear
      setTimeout(() => fetchAportes(externalReference), 1500);
    } else {
      setLoading(false);
    }
  }, [paymentId, externalReference]);

  async function fetchAportes(ref) {
    try {
      const ids = ref.split(',');
      const results = [];
      for (const id of ids) {
        const res = await fetch(`${API_URL}/api/aportes/detail/${id}`);
        if (res.ok) {
          const data = await res.json();
          results.push(data);
        }
      }
      setAportes(results);
    } catch (e) {
      // Si falla, igual mostramos la página sin detalle
    } finally {
      setLoading(false);
    }
  }

  const dni = aportes[0]?.dni || '';
  const nombre = aportes[0]?.nombre || '';
  const apellido = aportes[0]?.apellido || '';
  const numerosAporte = aportes.map(a => a.numero_aporte).filter(Boolean);
  const montoTotal = aportes.reduce((acc, a) => acc + (a.monto || 0), 0);

  const waMessage = encodeURIComponent(
    `¡Hice mi aporte solidario al Teatro Español Pigüé! 🎭\n` +
    `Podés sumarte vos también entrando en https://www.teatropigue.com.ar/aportes\n` +
    `Cuando completes el formulario, ingresá mi DNI como referido: *${dni}*\n` +
    `¡Entre más seamos, mejor para todos! 💪`
  );
  const waUrl = `https://wa.me/?text=${waMessage}`;

  const igText = `¡Me sumé al Bono Solidario del Teatro Español Pigüé! 🎭✨ Vos también podés hacerlo en www.teatropigue.com.ar/aportes — usá mi DNI ${dni} como referido y los dos ganamos beneficios. #TeatroEspañolPigüé #AporteSolidario #Pigüé`;

  const handleCopyIg = () => {
    navigator.clipboard.writeText(igText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8faf8',
      paddingTop: '80px',
      paddingBottom: '60px',
    }}>
      <div style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: isMobile ? `${theme.spacing.lg} ${theme.spacing.md}` : theme.spacing.xl,
      }}>

        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: theme.spacing.xl,
        }}>
          <div style={{
            width: '72px', height: '72px',
            borderRadius: '50%',
            background: isApproved ? '#dcfce7' : '#fef9c3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto',
            marginBottom: theme.spacing.lg,
            fontSize: '36px',
          }}>
            {isApproved ? '✅' : '⏳'}
          </div>
          <h1 style={{
            fontSize: isMobile ? '1.6rem' : '2rem',
            fontWeight: theme.typography.bold,
            color: theme.colors.textPrimary,
            marginBottom: theme.spacing.sm,
          }}>
            {isApproved ? '¡Gracias por tu aporte!' : 'Pago pendiente'}
          </h1>
          <p style={{
            fontSize: theme.typography.body,
            color: theme.colors.textSecondary,
            lineHeight: 1.6,
          }}>
            {isApproved
              ? 'Tu contribución solidaria fue procesada con éxito. En breve recibirás un email de confirmación.'
              : 'Tu pago está siendo procesado. Te avisaremos por email cuando se confirme.'}
          </p>
        </div>

        {/* Detalle del pago */}
        <div style={{
          background: '#fff',
          borderRadius: theme.borderRadius.lg,
          border: `1px solid ${theme.colors.border}`,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          boxShadow: theme.shadows.sm,
        }}>
          <h2 style={{
            fontSize: theme.typography.h3,
            fontWeight: theme.typography.semibold,
            color: theme.colors.textPrimary,
            marginBottom: theme.spacing.md,
          }}>
            Detalle del pago
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {nombre && (
              <Row label="Aportante" value={`${nombre} ${apellido}`} />
            )}
            {dni && (
              <Row label="DNI" value={dni} />
            )}
            {paymentId && (
              <Row label="N° de pago MP" value={paymentId} />
            )}
            {merchantOrderId && merchantOrderId !== 'null' && (
              <Row label="Orden MP" value={merchantOrderId} />
            )}
            {montoTotal > 0 && (
              <Row label="Total abonado" value={`$${montoTotal.toLocaleString('es-AR')}`} highlight />
            )}
          </div>

          {/* Números de aporte */}
          {loading ? (
            <p style={{ color: theme.colors.textMuted, fontSize: theme.typography.small, marginTop: theme.spacing.md }}>
              Cargando números de aporte...
            </p>
          ) : numerosAporte.length > 0 ? (
            <div style={{
              marginTop: theme.spacing.md,
              padding: theme.spacing.md,
              background: '#f0fdf4',
              borderRadius: theme.borderRadius.md,
              border: '1px solid #bbf7d0',
            }}>
              <p style={{
                fontSize: theme.typography.small,
                fontWeight: theme.typography.semibold,
                color: '#15803d',
                marginBottom: theme.spacing.sm,
              }}>
                🎫 Tus números de aporte (válidos para el sorteo):
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {numerosAporte.map(n => (
                  <span key={n} style={{
                    background: '#15803d',
                    color: '#fff',
                    padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                    borderRadius: theme.borderRadius.full,
                    fontWeight: theme.typography.bold,
                    fontSize: '1.1rem',
                  }}>
                    #{n}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ color: theme.colors.textMuted, fontSize: theme.typography.small, marginTop: theme.spacing.md }}>
              Los números de aporte aparecerán en el email de confirmación.
            </p>
          )}
        </div>

        {/* Sección de referidos / compartir */}
        {isApproved && dni && (
          <div style={{
            background: '#fff',
            borderRadius: theme.borderRadius.lg,
            border: `2px solid ${theme.colors.primary}`,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
            boxShadow: theme.shadows.sm,
          }}>
            <h2 style={{
              fontSize: theme.typography.h3,
              fontWeight: theme.typography.bold,
              color: theme.colors.textPrimary,
              marginBottom: theme.spacing.sm,
            }}>
              🎁 ¡Invitá a otros y ganás más!
            </h2>
            <p style={{
              fontSize: theme.typography.body,
              color: theme.colors.textSecondary,
              lineHeight: 1.6,
              marginBottom: theme.spacing.md,
            }}>
              Cada persona que aporte usando tu DNI como referido te da un beneficio extra. ¡Compartí y multiplicá tus ventajas!
            </p>

            {/* Tu código de referido */}
            <div style={{
              background: '#f5f3ff',
              border: '1px solid #c4b5fd',
              borderRadius: theme.borderRadius.md,
              padding: theme.spacing.md,
              textAlign: 'center',
              marginBottom: theme.spacing.lg,
            }}>
              <p style={{ fontSize: theme.typography.small, color: '#7c3aed', marginBottom: '4px', fontWeight: theme.typography.medium }}>
                Tu código de referido es tu DNI
              </p>
              <p style={{
                fontSize: '2rem',
                fontWeight: theme.typography.bold,
                color: '#4c1d95',
                letterSpacing: '4px',
              }}>
                {dni}
              </p>
            </div>

            {/* Botones de compartir */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
              {/* WhatsApp */}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: theme.spacing.sm,
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  background: '#25D366',
                  color: '#fff',
                  borderRadius: theme.borderRadius.md,
                  textDecoration: 'none',
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.body,
                  transition: theme.transitions.fast,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Compartir por WhatsApp
              </a>

              {/* Instagram: copiar texto */}
              <button
                onClick={handleCopyIg}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: theme.spacing.sm,
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  fontWeight: theme.typography.semibold,
                  fontSize: theme.typography.body,
                  transition: theme.transitions.fast,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
                </svg>
                {copied ? '¡Texto copiado! Pegalo en Instagram' : 'Copiar texto para Instagram'}
              </button>

              {copied && (
                <p style={{
                  fontSize: theme.typography.small,
                  color: '#7c3aed',
                  textAlign: 'center',
                  fontStyle: 'italic',
                }}>
                  Abrí Instagram, creá una historia o publicación y pegá el texto ✨
                </p>
              )}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          <button
            onClick={() => navigate('/aportes')}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              background: theme.colors.primary,
              color: '#fff',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: theme.typography.semibold,
              fontSize: theme.typography.body,
            }}
          >
            Ver mis aportes
          </button>
          <Link
            to="/"
            style={{
              textAlign: 'center',
              padding: `${theme.spacing.md} ${theme.spacing.lg}`,
              background: theme.colors.surfaceAlt,
              color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.borderRadius.md,
              textDecoration: 'none',
              fontWeight: theme.typography.medium,
              fontSize: theme.typography.body,
            }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: `${theme.spacing.xs} 0`,
      borderBottom: `1px solid ${theme.colors.border}`,
    }}>
      <span style={{
        fontSize: theme.typography.small,
        color: theme.colors.textMuted,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: highlight ? theme.typography.h3 : theme.typography.body,
        fontWeight: highlight ? theme.typography.bold : theme.typography.medium,
        color: highlight ? theme.colors.primary : theme.colors.textPrimary,
      }}>
        {value}
      </span>
    </div>
  );
}
