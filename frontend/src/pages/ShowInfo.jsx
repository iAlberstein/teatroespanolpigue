import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getShowImageUrl } from '../lib/media';
import { formatDate, formatTime } from '../lib/dateFormatter.js';

export default function ShowInfo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionPricing, setSessionPricing] = useState({}); // Map sessionId -> pricing rules
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [flippedCardId, setFlippedCardId] = useState(null); // Which card is flipped
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
        
        // Load pricing rules for each session
        const pricingPromises = sessions.map(session => 
          apiFetch(`/api/seat-pricing/rules?sessionId=${session.id}`)
            .then(res => res.json())
            .then(data => ({ sessionId: session.id, rules: data.rules || [] }))
            .catch(() => ({ sessionId: session.id, rules: [] }))
        );
        
        Promise.all(pricingPromises).then(results => {
          const pricingMap = {};
          results.forEach(({ sessionId, rules }) => {
            pricingMap[sessionId] = rules;
          });
          setSessionPricing(pricingMap);
          
          // Select first session by default
          if (sessions.length > 0 && !selectedSessionId) {
            setSelectedSessionId(sessions[0].id);
          }
          
          // Auto-flip if only one session
          if (sessions.length === 1) {
            setFlippedCardId(sessions[0].id);
          }
        });
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

          {show.duration_minutes && (
            <div>
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Duración</div>
              <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>
                {show.duration_minutes} minutos
              </div>
            </div>
          )}

          {/* Session Cards with Flip Animation */}
          {sessions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 12 }}>
                {sessions.length === 1 ? 'Función' : 'Funciones'}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sessions.map(session => {
                  const dateStr = formatDate(session.starts_at);
                  const timeStr = formatTime(session.starts_at);

                  const isFlipped = flippedCardId === session.id;
                  const seatPricing = sessionPricing[session.id] || [];
                  const isSoldOut = !!session.is_sold_out;
                  
                  return (
                    <div
                      key={session.id}
                      onClick={() => !isSoldOut && setFlippedCardId(isFlipped ? null : session.id)}
                      style={{
                        position: 'relative',
                        height: isFlipped ? 'auto' : 80,
                        cursor: isSoldOut ? 'default' : 'pointer',
                        perspective: '1000px'
                      }}
                    >
                      {/* Card Container with Flip Animation */}
                      <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        transformStyle: 'preserve-3d',
                        transition: 'transform 0.6s',
                        transform: isFlipped ? 'rotateX(180deg)' : 'rotateX(0deg)'
                      }}>
                        {/* Front of card (always visible initially) */}
                        <div style={{
                          position: isFlipped ? 'absolute' : 'relative',
                          width: '100%',
                          height: '100%',
                          backfaceVisibility: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px 20px',
                          background: isSoldOut
                            ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                            : 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                          borderRadius: 12,
                          boxShadow: isSoldOut
                            ? '0 4px 6px -1px rgba(100, 116, 139, 0.2)'
                            : '0 4px 6px -1px rgba(139, 92, 246, 0.2)',
                          transform: isFlipped ? 'rotateX(180deg)' : 'rotateX(0deg)',
                          overflow: 'hidden'
                        }}>
                          <div>
                            <div style={{ fontSize: 18, color: '#ffffff', fontWeight: 700 }}>
                              {timeStr}
                            </div>
                            <div style={{ fontSize: 14, color: isSoldOut ? '#e2e8f0' : '#ede9fe', marginTop: 2 }}>
                              {dateStr}
                            </div>
                          </div>
                          {isSoldOut ? (
                            <div style={{
                              background: '#ef4444',
                              color: '#ffffff',
                              fontSize: 12,
                              fontWeight: 800,
                              letterSpacing: '0.5px',
                              padding: '6px 14px',
                              borderRadius: 999,
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                              boxShadow: '0 2px 8px rgba(239,68,68,0.4)'
                            }}>
                              LOCALIDADES AGOTADAS
                            </div>
                          ) : (
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8
                          }}>
                            <div style={{ 
                              fontSize: 13, 
                              color: '#ffffff', 
                              fontWeight: 700,
                              letterSpacing: '0.5px'
                            }}>
                              VER PRECIOS
                            </div>
                            <div style={{ fontSize: 20, color: '#ffffff' }}>
                              →
                            </div>
                          </div>
                          )}
                        </div>
                        
                        {/* Back of card (pricing info) */}
                        {isFlipped && (
                          <div style={{
                            width: '100%',
                            background: '#f8fafc',
                            borderRadius: 12,
                            border: '1px solid #e5e7eb',
                            padding: 16,
                            transform: 'rotateX(180deg)'
                          }}>
                            {/* Header */}
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 12,
                              paddingBottom: 12,
                              borderBottom: '1px solid #e5e7eb'
                            }}>
                              <div>
                                <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 700 }}>
                                  {dateStr} - {timeStr}
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                  Precios según ubicación
                                </div>
                              </div>
                              <div style={{
                                fontSize: 12,
                                color: '#8b5cf6',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}>
                                ← Volver
                              </div>
                            </div>
                            
                            {/* Pricing Display for this session */}
                            <SessionPricingDisplay 
                              session={session} 
                              seatPricing={seatPricing}
                              pricing={pricing}
                              palcosIndividualSeats={palcosIndividualSeats}
                              venueType={show.venue_type}
                              isMobile={isMobile}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
              // If a card is flipped, navigate to that specific session
              const targetSession = flippedCardId || sessions[0]?.id;
              if (targetSession) {
                navigate(`/detalle/${id}?sesion=${targetSession}`);
              } else {
                navigate(`/detalle/${id}`);
              }
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

// Component to display pricing for a specific session
function SessionPricingDisplay({ seatPricing, pricing, palcosIndividualSeats, venueType, isMobile }) {
  const isGeneralAdmission = (venueType === 'el_tablado' || venueType === 'las_gemelas');
  
  if (!pricing && seatPricing.length === 0) {
    return (
      <div style={{ fontSize: 14, color: '#64748b', textAlign: 'center', padding: 20 }}>
        Información de precios no disponible
      </div>
    );
  }
  
  // Group seat pricing by section
  const tiersBySection = {
    platea: seatPricing.filter(p => p.row_from && p.row_to),
    palcos_bajos: seatPricing.filter(p => p.palco_from !== null && p.palco_from !== undefined && !p.is_palco_alto),
    palcos_altos: seatPricing.filter(p => p.palco_from !== null && p.palco_from !== undefined && p.is_palco_alto),
    pullman: []
  };
  
  // Base colors for each section
  const baseColors = {
    platea: '#a8d8a8',
    palcos_bajos: '#8fbc8f',
    palcos_altos: '#6b8e6b',
    pullman: '#c0c0c0'
  };

  // Sector configuration — 3 separate fields: title, localidades, location
  const sectorConfig = {
    platea: { 
      badge: 'Platea', 
      title: 'Platea General',
      localidades: null,
      location: 'Planta baja',
      hasPricing: pricing?.platea_general || tiersBySection.platea.length > 0
    },
    palcos_bajos: { 
      badge: 'PB', 
      title: 'Palcos Bajos',
      localidades: !palcosIndividualSeats ? '4 localidades' : null,
      location: 'Planta baja',
      hasPricing: pricing?.palcos_bajos || tiersBySection.palcos_bajos.length > 0
    },
    palcos_altos: { 
      badge: 'PA', 
      title: 'Palcos Altos',
      localidades: !palcosIndividualSeats ? '2 localidades' : null,
      location: '1° piso por escalera',
      hasPricing: pricing?.palcos_altos || tiersBySection.palcos_altos.length > 0
    },
    pullman: { 
      badge: 'Pullman', 
      title: 'Pullman',
      localidades: null,
      location: '2° piso por escalera\nSin ubicación fija',
      hasPricing: pricing?.pullman
    }
  };
  
  // Section order
  const sectionOrder = ['platea', 'palcos_bajos', 'palcos_altos', 'pullman'];
  
  // Render a single price row — always 3 lines: name, localidades, location
  const renderPriceRow = (badge, badgeColor, title, localidades, location, price, isPA = false) => (
    <div key={`${badge}-${title}`} style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 8,
      padding: '8px 0',
      borderBottom: '1px solid #f1f5f9'
    }}>
      <span style={{
        background: badgeColor,
        color: isPA ? '#ffffff' : '#1f2937',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        minWidth: 50,
        textAlign: 'center',
        flexShrink: 0
      }}>{badge}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{title}</div>
        {localidades && <div style={{ fontSize: 11, color: '#94a3b8' }}>{localidades}</div>}
        {location && location.split('\n').map((line, i) => (
          <div key={i} style={{ fontSize: 11, color: '#94a3b8' }}>{line}</div>
        ))}
      </div>
      <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 700, whiteSpace: 'nowrap' }}>
        ${Number(price).toLocaleString('es-AR')}
      </div>
    </div>
  );
  
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isGeneralAdmission ? '1fr' : (isMobile ? '1fr' : 'repeat(2, 1fr)'),
      gap: 12
    }}>
      {sectionOrder.map(section => {
        const config = sectorConfig[section];
        const sectionTiers = tiersBySection[section] || [];
        const isPA = section === 'palcos_altos';
        const isPalco = section === 'palcos_bajos' || section === 'palcos_altos';
        
        if (!config.hasPricing) return null;

        const basePrice = pricing?.[
          section === 'platea' ? 'platea_general' :
          section === 'palcos_bajos' ? 'palcos_bajos' :
          section === 'palcos_altos' ? 'palcos_altos' : 'pullman'
        ];
        
        return (
          <div key={section} style={{
            padding: 12,
            background: '#ffffff',
            borderRadius: 8,
            border: '1px solid #e5e7eb'
          }}>
            {/* For palcos: always show base row with 3 lines, then tiers as sub-rows */}
            {isPalco ? (
              <>
                {basePrice && renderPriceRow(
                  config.badge, baseColors[section],
                  config.title, config.localidades, config.location,
                  basePrice, isPA
                )}
                {sectionTiers.map((tier) => renderPriceRow(
                  config.badge,
                  tier.color || baseColors[section],
                  section === 'palcos_bajos'
                    ? `PB ${tier.palco_from} a ${tier.palco_to}`
                    : `PA ${tier.palco_from} a ${tier.palco_to}`,
                  config.localidades, config.location,
                  tier.price, isPA
                ))}
              </>
            ) : section === 'platea' ? (
              <>
                {basePrice && renderPriceRow(
                  config.badge, baseColors[section],
                  config.title, config.localidades, config.location,
                  basePrice
                )}
                {sectionTiers.map(tier => renderPriceRow(
                  config.badge,
                  tier.color || baseColors[section],
                  `Filas ${tier.row_from} a ${tier.row_to}`,
                  config.localidades, config.location,
                  tier.price
                ))}
              </>
            ) : (
              /* Pullman */
              basePrice && renderPriceRow(config.badge, baseColors[section], config.title, config.localidades, config.location, basePrice)
            )}
          </div>
        );
      })}
      
      {/* General Admission */}
      {pricing?.general && (
        <div style={{
          padding: 12,
          background: '#ffffff',
          borderRadius: 8,
          border: '1px solid #e5e7eb'
        }}>
          {renderPriceRow('General', '#94a3b8', 'Entrada General', 'Sin ubicación fija', pricing.general)}
        </div>
      )}
    </div>
  );
}
