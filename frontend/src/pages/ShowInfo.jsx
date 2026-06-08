import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getShowImageUrl } from '../lib/media';

export default function ShowInfo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });

  const venueLabelMap = {
    sala_principal: 'Sala Principal',
    el_tablado: 'El Tablado',
    las_gemelas: 'Nueva sala'
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    apiFetch(`/api/shows/${id}`)
      .then(res => res.json())
      .then(data => {
        console.log('[ShowInfo] Show loaded:', data);
        setShow(data);
      })
      .catch(err => {
        console.error('[ShowInfo] Error loading show:', err);
      });

    apiFetch(`/api/shows/${id}/sessions`)
      .then(res => res.json())
      .then(sessions => {
        console.log('[ShowInfo] Sessions loaded:', sessions);
        setSessions(sessions);
      })
      .catch(err => {
        console.error('[ShowInfo] Error loading sessions:', err);
      });

    // Inject JSON-LD structured data for SEO (Google rich results with correct timezone)
    apiFetch(`/api/seo/show/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.jsonLd) {
          const existingScript = document.querySelector('script[data-seo-jsonld]');
          if (existingScript) existingScript.remove();
          const script = document.createElement('script');
          script.type = 'application/ld+json';
          script.setAttribute('data-seo-jsonld', 'true');
          script.textContent = JSON.stringify(data.jsonLd);
          document.head.appendChild(script);
        }
      })
      .catch(() => {});

    return () => {
      const script = document.querySelector('script[data-seo-jsonld]');
      if (script) script.remove();
    };
  }, [id]);

  if (!show) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        Cargando información del show...
      </div>
    );
  }

  const heroImageUrl = getShowImageUrl(show, 'principal_web');
  
  const getPricing = () => {
    // Prioridad: usar pricing de la primera sesión disponible
    if (sessions.length > 0) {
      let sessionPricing = sessions[0].pricing_json;
      if (typeof sessionPricing === 'string') {
        try {
          sessionPricing = JSON.parse(sessionPricing);
        } catch {
          sessionPricing = null;
        }
      }
      if (sessionPricing && Object.keys(sessionPricing).length > 0) {
        return sessionPricing;
      }
    }
    // Fallback: usar pricing del show
    if (!show.pricing_json) return null;
    let pricing = show.pricing_json;
    if (typeof pricing === 'string') {
      try {
        pricing = JSON.parse(pricing);
      } catch {
        return null;
      }
    }
    return pricing;
  };

  const pricing = getPricing();

  // Get palcos_individual_seats from session (if set) or fallback to show
  const getPalcosIndividualSeats = () => {
    if (sessions.length > 0 && sessions[0].palcos_individual_seats !== null && sessions[0].palcos_individual_seats !== undefined) {
      return sessions[0].palcos_individual_seats;
    }
    return show.palcos_individual_seats || false;
  };
  const palcosIndividualSeats = getPalcosIndividualSeats();

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
        padding: isMobile ? '0 0 40px' : '0 20px 40px',
        boxSizing: 'border-box'
      }}
    >
      {/* Hero Image */}
      {heroImageUrl && (
        <div style={{ width: '100%', marginBottom: 32 }}>
          <img
            src={heroImageUrl}
            alt={show.title}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              borderRadius: isMobile ? 0 : 16
            }}
          />
        </div>
      )}

      {/* Show Info */}
      <div
        style={{
          background: '#fff',
          borderRadius: isMobile ? 0 : 16,
          padding: isMobile ? 24 : 40,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
        }}
      >
        <h1
          style={{
            margin: '0 0 24px',
            fontSize: isMobile ? 28 : 42,
            fontWeight: 700,
            color: '#0f172a'
          }}
        >
          {show.title}
        </h1>

        {/* Show Details */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            marginBottom: 32,
            paddingBottom: 32,
            borderBottom: '2px solid #e5e7eb'
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Sala</div>
            <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>
              {venueLabelMap[show.venue_type] || 'Teatro Español Pigüé'}
            </div>
          </div>

          {sessions.length > 0 && (
            <div>
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>
                {sessions.length === 1 ? 'Fecha y Hora' : 'Fechas y Horarios'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sessions.map(session => {
                  const date = new Date(session.starts_at);
                  const dateStr = date.toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'long'
                  });
                  const timeStr = date.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  });
                  return (
                    <div key={session.id} style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>
                      {dateStr} - {timeStr}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pricing && (() => {
            const priceCount = [pricing.platea_general, pricing.palcos_bajos, pricing.palcos_altos, pricing.pullman, pricing.general].filter(Boolean).length;
            const isGeneralAdmission = (show.venue_type === 'el_tablado' || show.venue_type === 'las_gemelas');
            
            return (
              <div>
                <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 12 }}>
                  {isGeneralAdmission ? 'Precio' : 'Precios según ubicación'}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isGeneralAdmission ? '1fr' : (isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'),
                    gap: 12
                  }}
                >
                  {pricing.platea_general && (
                    <div
                      style={{
                        padding: 12,
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#64748b' }}>Platea General</div>
                      <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
                        ${Number(pricing.platea_general).toLocaleString('es-AR')}
                      </div>
                    </div>
                  )}
                  {pricing.palcos_bajos && (
                    <div
                      style={{
                        padding: 12,
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#64748b' }}>Palcos Bajos{!palcosIndividualSeats && ' (x4 localidades)'}</div>
                      <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
                        ${Number(pricing.palcos_bajos).toLocaleString('es-AR')}
                      </div>
                    </div>
                  )}
                  {pricing.palcos_altos && (
                    <div
                      style={{
                        padding: 12,
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#64748b' }}>Palcos Altos{!palcosIndividualSeats && ' (x2 localidades)'}</div>
                      <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
                        ${Number(pricing.palcos_altos).toLocaleString('es-AR')}
                      </div>
                    </div>
                  )}
                  {pricing.pullman && (
                    <div
                      style={{
                        padding: 12,
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#64748b' }}>Pullman (ubicación libre)</div>
                      <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
                        ${Number(pricing.pullman).toLocaleString('es-AR')}
                      </div>
                    </div>
                  )}
                  {pricing.general && (
                    <div
                      style={{
                        padding: 12,
                        background: '#f8fafc',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <div style={{ fontSize: 12, color: '#64748b' }}>Entrada General</div>
                      <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
                        ${Number(pricing.general).toLocaleString('es-AR')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Buy Button - only show if show is not finished */}
        {show.show_status === 'finalizado' ? (
          <div
            style={{
              width: '100%',
              padding: isMobile ? '16px' : '18px',
              background: '#f1f5f9',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontSize: isMobile ? 16 : 18,
              fontWeight: 600,
              textAlign: 'center',
              marginBottom: 32
            }}
          >
            🎭 Este espectáculo ha finalizado
          </div>
        ) : show.external_sale && show.external_sale_link ? (
          <button
            onClick={() => {
              // Use location.href for more reliable navigation on mobile
              window.location.href = show.external_sale_link;
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: isMobile ? '16px' : '18px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: isMobile ? 16 : 18,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(59, 130, 246, 0.4)',
              marginBottom: 32,
              textAlign: 'center',
              textDecoration: 'none',
              boxSizing: 'border-box'
            }}
          >
            🔗 COMPRAR EN SITIO EXTERNO
          </button>
        ) : (
          <button
            onClick={() => {
              window.scrollTo(0, 0);
              navigate(`/detalle/${id}`);
            }}
            style={{
              width: '100%',
              padding: isMobile ? '16px' : '18px',
              background: '#f97316',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: isMobile ? 16 : 18,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(249, 115, 22, 0.4)',
              marginBottom: 32
            }}
          >
            COMPRAR ENTRADAS
          </button>
        )}

        {/* Show Description */}
        {show.description && (
          <div>
            <h2
              style={{
                margin: '0 0 16px',
                fontSize: isMobile ? 20 : 24,
                fontWeight: 700,
                color: '#0f172a'
              }}
            >
              Sobre el espectáculo
            </h2>
            <div
              style={{
                fontSize: 16,
                lineHeight: 1.7,
                color: '#475569',
                whiteSpace: 'pre-wrap'
              }}
            >
              {show.description}
            </div>
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: 32,
            padding: '12px 24px',
            background: '#fff',
            color: '#64748b',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          ← Volver al inicio
        </button>
      </div>
    </div>
  );
}
