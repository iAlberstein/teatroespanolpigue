import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getShowImageUrl } from '../lib/media';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, formatTime } from '../lib/dateFormatter.js';
import logoAteneo from '../assets/images/logo_ateneo.png';

const AUTOPLAY_INTERVAL = 4000;

export default function Home() {
  const [shows, setShows] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const navigate = useNavigate();
  const touchStartRef = useRef(null);
  const autoplayRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    const isAdmin = user?.role === 'admin';
    // Solo mostrar shows activos en el carrousel (no finalizados)
    const params = new URLSearchParams();
    if (isAdmin) params.append('admin', 'true');
    params.append('status', 'active');
    
    apiFetch(`/api/shows?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setShows(data || []);
        setCurrentIndex(0);
      })
      .catch((err) => {
        console.error('[HOME] Error fetching shows:', err);
        setShows([]);
      });
  }, [user]);

  // Inject JSON-LD structured data for all active shows (SEO - correct timezone for Google)
  useEffect(() => {
    if (shows.length === 0) return;
    // Fetch JSON-LD for each show and inject all into head
    Promise.all(
      shows.map(show => 
        apiFetch(`/api/seo/show/${show.id}`)
          .then(r => r.json())
          .then(d => d.jsonLd)
          .catch(() => null)
      )
    ).then(results => {
      const allEvents = results.filter(Boolean).flat();
      if (allEvents.length > 0) {
        const existingScript = document.querySelector('script[data-seo-jsonld-home]');
        if (existingScript) existingScript.remove();
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-seo-jsonld-home', 'true');
        script.textContent = JSON.stringify(allEvents);
        document.head.appendChild(script);
      }
    });
    return () => {
      const script = document.querySelector('script[data-seo-jsonld-home]');
      if (script) script.remove();
    };
  }, [shows]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (shows.length <= 1 || isPaused) return;
    autoplayRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % shows.length);
    }, AUTOPLAY_INTERVAL);
    return () => clearInterval(autoplayRef.current);
  }, [shows.length, isPaused]);

  const currentShow = shows[currentIndex] || null;

  const getShowSessions = (show) => {
    if (!show) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessions = Array.isArray(show.sessions) && show.sessions.length > 0
      ? show.sessions.filter(s => new Date(s.starts_at) >= today)
      : [];
    if (sessions.length > 0) {
      return sessions.map(s => ({
        date: formatDate(s.starts_at),
        time: formatTime(s.starts_at)
      }));
    }
    const fallback = show.first_session?.starts_at || show.date;
    if (!fallback) return [{ date: 'Fecha a confirmar', time: '' }];
    return [{
      date: formatDate(fallback),
      time: formatTime(fallback)
    }];
  };

  const getMinPrice = (show) => {
    if (!show) return null;
    // Usar min_price calculado desde sesiones (prioridad)
    if (show.min_price !== null && show.min_price !== undefined) {
      return show.min_price;
    }
    // Fallback a pricing_json del show
    let pricing = show.pricing_json;
    if (typeof pricing === 'string') {
      try {
        pricing = JSON.parse(pricing);
      } catch {
        return null;
      }
    }
    if (!pricing) return null;
    const prices = Object.values(pricing).filter(p => typeof p === 'number' && p > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  };

  const handleSelect = (index) => {
    setCurrentIndex(index);
    setIsPaused(true);
  };

  const handleNavigate = (showId) => {
    navigate(`/info/${showId}`);
  };

  const handleScrollToFooter = () => {
    const footer = document.querySelector('footer');
    if (footer) {
      footer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleTouchStart = (event) => {
    touchStartRef.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStartRef.current == null) return;
    const deltaX = event.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        setCurrentIndex((prev) => (prev + 1) % shows.length);
      } else {
        setCurrentIndex((prev) => (prev - 1 + shows.length) % shows.length);
      }
    }
    touchStartRef.current = null;
  };

  const heroImage = currentShow ? getShowImageUrl(currentShow, isMobile ? 'principal_mobile' : 'principal_web') : null;
  const heroSynopsis = useMemo(() => {
    if (!currentShow?.description) {
      return 'Conocé la magia del Teatro Español Pigüé. Nuevas experiencias todas las semanas.';
    }
    const trimmed = currentShow.description.trim();
    return trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
  }, [currentShow]);

  const venueLabelMap = {
    sala_principal: 'Sala Principal',
    el_tablado: 'El Tablado',
    las_gemelas: 'Nueva sala'
  };

  const ctaButtonStyle = {
    padding: '12px 24px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.4)',
    color: '#fff',
    background: 'transparent',
    textDecoration: 'none',
    fontWeight: 600,
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    minWidth: 180
  };

  return (
    <div
      style={{
        width: '100%',
        margin: 0,
        padding: 0,
        boxSizing: 'border-box'
      }}
    >
      {currentShow ? (
        <>
          <section
            style={{
              position: 'relative',
              width: '100%',
              overflow: 'hidden',
              margin: 0,
              padding: 0,
              backgroundColor: '#000',
              cursor: isMobile ? 'pointer' : 'default'
            }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={isMobile ? () => handleNavigate(currentShow.id) : undefined}
          >
            <img
              src={heroImage}
              alt={currentShow.title}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                objectFit: 'contain'
              }}
            />

            <div
              style={{
                position: 'absolute',
                bottom: isMobile ? 20 : 40,
                left: '50%',
                transform: 'translateX(-50%)',
                width: isMobile ? '90%' : 'auto',
                maxWidth: isMobile ? '90%' : '80%',
                background: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(8px)',
                padding: isMobile ? '10px 12px' : '12px 20px',
                borderRadius: 8,
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isMobile ? 8 : 16,
                color: '#0f172a',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                flexWrap: 'nowrap',
                overflow: 'hidden'
              }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: isMobile ? 8 : 16,
                flexWrap: 'nowrap'
              }}>
                <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {venueLabelMap[currentShow.venue_type] || 'Teatro Español Pigüé'}
                </span>
                <span style={{ width: 1, height: isMobile ? 16 : 20, background: '#64748b', flexShrink: 0 }}></span>
                {(() => {
                  const sessionList = getShowSessions(currentShow);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: isMobile ? 'center' : 'flex-start' }}>
                      {sessionList.map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.date}</span>
                          {s.time && (
                            <>
                              <span style={{ fontSize: isMobile ? 11 : 13, color: '#64748b' }}>·</span>
                              <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.time}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {(() => {
                  const minPrice = getMinPrice(currentShow);
                  return minPrice ? (
                    <>
                      <span style={{ width: 1, height: isMobile ? 16 : 20, background: '#64748b', flexShrink: 0 }}></span>
                      <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Desde ${minPrice.toLocaleString('es-AR')}</span>
                    </>
                  ) : null;
                })()}
                {!isMobile && (
                  <>
                    <span style={{ width: 1, height: 20, background: '#64748b', flexShrink: 0 }}></span>
                    <button
                      onClick={() => handleNavigate(currentShow.id)}
                      style={{
                        border: 'none',
                        borderRadius: 6,
                        padding: '10px 20px',
                        background: '#000000',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      VER MÁS
                    </button>
                  </>
                )}
              </div>
              {isMobile && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleNavigate(currentShow.id); }}
                  style={{
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 16px',
                    background: '#000000',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Ver más
                </button>
              )}
            </div>

            {shows.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentIndex((prev) => (prev - 1 + shows.length) % shows.length)}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: isMobile ? 8 : 24,
                    transform: 'translateY(-50%)',
                    width: isMobile ? 36 : 48,
                    height: isMobile ? 36 : 48,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: '#fff',
                    fontSize: isMobile ? 20 : 28,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 3,
                    backdropFilter: 'blur(4px)'
                  }}
                  aria-label="Anterior"
                >
                  ‹
                </button>
                <button
                  onClick={() => setCurrentIndex((prev) => (prev + 1) % shows.length)}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: isMobile ? 8 : 24,
                    transform: 'translateY(-50%)',
                    width: isMobile ? 36 : 48,
                    height: isMobile ? 36 : 48,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(0, 0, 0, 0.5)',
                    color: '#fff',
                    fontSize: isMobile ? 20 : 28,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 3,
                    backdropFilter: 'blur(4px)'
                  }}
                  aria-label="Siguiente"
                >
                  ›
                </button>
              </>
            )}
          </section>

          {shows.length > 1 && (
            <div
              style={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                background: 'transparent',
                padding: isMobile ? '16px 12px' : '20px 32px',
                display: 'grid',
                gridTemplateColumns: isMobile 
                  ? 'repeat(4, 1fr)' 
                  : 'repeat(auto-fit, minmax(144px, max-content))',
                justifyContent: 'center',
                gap: isMobile ? 8 : 12,
                margin: 0,
                overflow: 'hidden'
              }}
            >
              {shows.map((show, index) => {
                const thumb = getShowImageUrl(show, 'secundaria_web');
                return (
                  <button
                    key={show.id}
                    onClick={() => handleSelect(index)}
                    style={{
                      width: '100%',
                      maxWidth: isMobile ? 'none' : 144,
                      aspectRatio: '144/70',
                      borderRadius: 6,
                      border: index === currentIndex ? '3px solid #f97316' : '3px solid transparent',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      background: '#1e293b',
                      padding: 0,
                      opacity: index === currentIndex ? 1 : 0.5,
                      transition: 'all 0.3s',
                      transform: index === currentIndex ? 'scale(1.05)' : 'scale(1)'
                    }}
                    aria-label={`Ver ${show.title}`}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={show.title}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#94a3b8',
                          fontSize: 11,
                          padding: 8,
                          textAlign: 'center'
                        }}
                      >
                        {show.title}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            margin: '80px auto',
            padding: '40px 32px',
            background: '#0f172a',
            color: '#fff',
            borderRadius: 20,
            maxWidth: 640,
            textAlign: 'center',
            boxShadow: '0 15px 40px rgba(15, 23, 42, 0.35)'
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 32, marginBottom: 16 }}>Estamos realizando tareas de mantenimiento</h2>
          <p style={{ marginBottom: 24, fontSize: 18, lineHeight: 1.5 }}>Volvé pronto para descubrir nuevos espectáculos.</p>
          <p style={{ marginBottom: 0, fontSize: 16, lineHeight: 1.6 }}>
            Mientras tanto, te invitamos a recorrer nuestro sitio para conocer nuestra historia, descubrir las salas y enterarte de nuevas iniciativas.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate('/conocenos')}
              style={ctaButtonStyle}
            >
              Conocenos
            </button>
            <button
              type="button"
              onClick={() => navigate('/salas')}
              style={ctaButtonStyle}
            >
              Explorar salas
            </button>
            <button
              type="button"
              onClick={() => navigate('/register')}
              style={ctaButtonStyle}
            >
              Crear usuario
            </button>
            <button
              type="button"
              onClick={handleScrollToFooter}
              style={ctaButtonStyle}
            >
              Ver más
            </button>
          </div>
        </div>
      )}

      {/* Ateneo welcome row */}
      <div style={{
        width: '100%',
        background: '#fff',
        padding: isMobile ? '32px 16px' : '48px 32px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr',
          alignItems: 'center',
          gap: isMobile ? 24 : 40
        }}>
          <div style={{ textAlign: isMobile ? 'center' : 'left' }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 700, color: '#1e293b' }}>¡Te damos la bienvenida!</h2>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img src={logoAteneo} alt="Ateneo" style={{ height: isMobile ? 70 : 90, width: 'auto' }} />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: isMobile ? 'center' : 'flex-end', flexWrap: 'wrap' }}>
            <Link to="/ateneo/sobre" style={{
              padding: '10px 20px',
              background: '#000000',
              color: '#fff',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}>Sobre el Ateneo</Link>
            <Link to="/ateneo" style={{
              padding: '10px 20px',
              background: '#f3f4f6',
              color: '#374151',
              borderRadius: 6,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 600,
              border: '1px solid #d1d5db',
              whiteSpace: 'nowrap'
            }}>Inscribirme a clases</Link>
          </div>
        </div>
      </div>

    </div>
  );
}

