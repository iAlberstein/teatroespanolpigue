import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getShowImageUrl } from '../lib/media';
import { formatTime, formatDateLong } from '../lib/dateFormatter.js';

export default function ShowInfo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectError, setSelectError] = useState(false);
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
        setShow(data);
      })
      .catch(err => {
        console.error('[ShowInfo] Error loading show:', err);
      });

    apiFetch(`/api/shows/${id}/sessions`)
      .then(res => res.json())
      .then(sessions => {
        setSessions(sessions);
        // Auto-select if only one session
        if (sessions.length === 1) {
          setSelectedSessionId(sessions[0].id);
        }
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
  const isPack = !!show.pack_enabled;
  const hasMultipleSessions = sessions.length > 1;

  const navigateToSession = (sessionId) => {
    window.scrollTo(0, 0);
    if (sessionId) {
      navigate(`/detalle/${id}?sesion=${sessionId}`);
    } else {
      navigate(`/detalle/${id}`);
    }
  };

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

          {show.clasificacion && (
            <div>
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Clasificación</div>
              <div style={{ fontSize: 16, color: '#0f172a', fontWeight: 600 }}>
                {show.clasificacion}
              </div>
            </div>
          )}

          {/* Session Cards */}
          {sessions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginBottom: 12 }}>
                {sessions.length === 1 ? 'Función' : 'Funciones'}
              </div>

              {hasMultipleSessions && !selectedSessionId && !isPack && (
                <div style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500, marginBottom: 12, fontStyle: 'italic' }}>
                  Seleccionar una
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sessions.map(session => {
                  const longDateStr = formatDateLong(session.starts_at);
                  const timeStr = formatTime(session.starts_at);
                  const isSoldOut = !!session.is_sold_out;
                  const isSelected = selectedSessionId === session.id;

                  // Capitalize first letter of long date
                  const displayText = longDateStr
                    ? longDateStr.charAt(0).toUpperCase() + longDateStr.slice(1) + ' a las ' + timeStr
                    : '';

                  // Pack: plain text dates, no cards
                  if (isPack) {
                    return (
                      <div key={session.id} style={{ fontSize: 15, color: '#374151', padding: '4px 0' }}>
                        {displayText}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={session.id}
                      onClick={() => {
                        if (!isSoldOut) {
                          setSelectedSessionId(isSelected ? null : session.id);
                          setSelectError(false);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        background: isSelected ? '#000000' : (isSoldOut ? '#f3f4f6' : '#ffffff'),
                        border: `2px solid ${isSoldOut ? '#d1d5db' : '#000000'}`,
                        borderRadius: 12,
                        cursor: isSoldOut ? 'default' : 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 600, color: isSelected ? '#ffffff' : (isSoldOut ? '#9ca3af' : '#0f172a') }}>
                        {displayText}
                      </div>

                      {isSoldOut && (
                        <div style={{
                          background: '#ef4444',
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 800,
                          letterSpacing: '0.5px',
                          padding: '6px 14px',
                          borderRadius: 999,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap'
                        }}>
                          LOCALIDADES AGOTADAS
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Error message when no session selected */}
              {selectError && (
                <div style={{ marginTop: 12, fontSize: 14, color: '#ef4444', fontWeight: 600 }}>
                  Debés seleccionar una función para continuar
                </div>
              )}
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
              window.location.href = show.external_sale_link;
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: isMobile ? '16px' : '18px',
              background: '#000000',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: isMobile ? 16 : 18,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 32,
              textAlign: 'center',
              textDecoration: 'none',
              boxSizing: 'border-box'
            }}
          >
            🔗 COMPRAR EN SITIO EXTERNO
          </button>
        ) : sessions.length > 0 && !isPack ? (
          <button
            onClick={() => {
              if (!selectedSessionId) {
                setSelectError(true);
                return;
              }
              navigateToSession(selectedSessionId);
            }}
            style={{
              width: '100%',
              padding: isMobile ? '16px' : '18px',
              background: selectedSessionId ? '#000000' : '#d1d5db',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: isMobile ? 16 : 18,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 32
            }}
          >
            COMPRAR ENTRADAS
          </button>
        ) : isPack ? (
          <button
            onClick={() => navigateToSession(sessions[0]?.id)}
            style={{
              width: '100%',
              padding: isMobile ? '16px' : '18px',
              background: '#000000',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: isMobile ? 16 : 18,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 32
            }}
          >
            COMPRAR ENTRADAS
          </button>
        ) : null}

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
