import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../styles/theme.js';
import { API_URL } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext';
import { formatDateLong, formatTime } from '../lib/dateFormatter.js';

const venueLabelMap = {
  sala_principal: 'Sala Principal',
  el_tablado: 'El Tablado',
  las_gemelas: 'Nueva sala'
};

export default function Agenda() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [viewPastShows, setViewPastShows] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    const fetchShows = async () => {
      try {
        const isAdmin = user?.role === 'admin';
        const params = new URLSearchParams();
        if (isAdmin) params.append('admin', 'true');
        params.append('status', viewPastShows ? 'finished' : 'active');
        
        const res = await fetch(`${API_URL}/api/shows?${params.toString()}`);
        const data = await res.json();
        setShows(data || []);
      } catch (err) {
        console.error('Error fetching shows:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchShows();
  }, [user, viewPastShows]);

  // Get unique venues, months and years from shows
  const { venues, months, years } = useMemo(() => {
    const venueSet = new Set();
    const monthSet = new Set();
    const yearSet = new Set();
    const now = new Date();
    
    shows.forEach(show => {
      if (show.venue_type) venueSet.add(show.venue_type);
      if (show.sessions) {
        show.sessions.forEach(session => {
          const date = new Date(session.starts_at);
          // For past shows, include past dates; for active shows, include future dates
          if (viewPastShows ? date < now : date > now) {
            monthSet.add(date.getMonth());
            yearSet.add(date.getFullYear());
          }
        });
      }
    });
    
    return {
      venues: Array.from(venueSet),
      months: Array.from(monthSet).sort((a, b) => a - b),
      years: Array.from(yearSet).sort((a, b) => viewPastShows ? b - a : a - b)
    };
  }, [shows, viewPastShows]);

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Filter shows based on selections
  const filteredShows = useMemo(() => {
    return shows.filter(show => {
      // Filter by venue
      if (selectedVenue !== 'all' && show.venue_type !== selectedVenue) {
        return false;
      }
      
      // Filter by month/year - check if any session matches
      if (selectedMonth !== 'all' || selectedYear !== 'all') {
        const hasMatchingSession = show.sessions?.some(session => {
          const date = new Date(session.starts_at);
          const matchesMonth = selectedMonth === 'all' || date.getMonth() === parseInt(selectedMonth);
          const matchesYear = selectedYear === 'all' || date.getFullYear() === parseInt(selectedYear);
          return matchesMonth && matchesYear;
        });
        if (!hasMatchingSession) return false;
      }
      
      return true;
    });
  }, [shows, selectedVenue, selectedMonth, selectedYear]);

  // Get session date for a show (next for active, last for past)
  const getDisplaySession = (show) => {
    if (!show.sessions || show.sessions.length === 0) return null;
    const now = new Date();
    
    if (viewPastShows) {
      // For past shows, get the most recent session
      const pastSessions = show.sessions
        .filter(s => new Date(s.starts_at) < now)
        .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
      return pastSessions[0] || show.sessions[show.sessions.length - 1];
    } else {
      // For active shows, get the next future session
      const futureSessions = show.sessions
        .filter(s => new Date(s.starts_at) > now)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      return futureSessions[0] || null;
    }
  };
  
  // Alias for backward compatibility
  const getNextSession = getDisplaySession;

  const getShowImageUrl = (show) => {
    if (show.image_principal_mobile) {
      if (show.image_principal_mobile.startsWith('http')) return show.image_principal_mobile;
      return `${API_URL}${show.image_principal_mobile}`;
    }
    if (show.image_url) {
      if (show.image_url.startsWith('http')) return show.image_url;
      return `${API_URL}${show.image_url}`;
    }
    return null;
  };

  const buttonStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: theme.colors.primary,
    color: theme.colors.surface,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.small,
    fontWeight: theme.typography.semibold,
    cursor: 'pointer',
    transition: theme.transitions.fast,
  };

  const filterButtonStyle = (isActive) => ({
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    background: isActive ? theme.colors.primary : theme.colors.surface,
    color: isActive ? theme.colors.surface : theme.colors.textSecondary,
    border: `1px solid ${isActive ? theme.colors.primary : theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.small,
    fontWeight: theme.typography.medium,
    cursor: 'pointer',
    transition: theme.transitions.fast,
  });

  if (loading) {
    return (
      <div style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: '3px solid #e5e7eb',
          borderTop: `3px solid ${theme.colors.primary}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '1400px',
      margin: '0 auto',
      padding: isMobile ? theme.spacing.md : theme.spacing.xl
    }}>
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xl
      }}>
        <h1 style={{
          fontSize: isMobile ? theme.typography.h3 : theme.typography.h2,
          color: theme.colors.textPrimary,
          margin: 0,
          fontWeight: theme.typography.semibold
        }}>
          {viewPastShows ? 'Shows Pasados' : 'Agenda'}
        </h1>
        <button
          onClick={() => {
            setViewPastShows(!viewPastShows);
            setLoading(true);
          }}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            background: viewPastShows ? theme.colors.primary : 'transparent',
            color: viewPastShows ? theme.colors.surface : theme.colors.textSecondary,
            border: `1px solid ${viewPastShows ? theme.colors.primary : theme.colors.border}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.small,
            fontWeight: theme.typography.medium,
            cursor: 'pointer',
            transition: theme.transitions.fast,
          }}
        >
          {viewPastShows ? '← Volver a Agenda' : 'Ver shows pasados →'}
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xl,
        flexWrap: 'wrap'
      }}>
        {/* Venue filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          <span style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, fontWeight: theme.typography.medium }}>
            Sala
          </span>
          <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedVenue('all')}
              style={filterButtonStyle(selectedVenue === 'all')}
            >
              Todas
            </button>
            {venues.map(venue => (
              <button
                key={venue}
                onClick={() => setSelectedVenue(venue)}
                style={filterButtonStyle(selectedVenue === venue)}
              >
                {venueLabelMap[venue] || venue}
              </button>
            ))}
          </div>
        </div>

        {/* Month filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
          <span style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, fontWeight: theme.typography.medium }}>
            Mes
          </span>
          <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedMonth('all')}
              style={filterButtonStyle(selectedMonth === 'all')}
            >
              Todos
            </button>
            {months.map(month => (
              <button
                key={month}
                onClick={() => setSelectedMonth(month.toString())}
                style={filterButtonStyle(selectedMonth === month.toString())}
              >
                {monthNames[month]}
              </button>
            ))}
          </div>
        </div>

        {/* Year filter - only if multiple years */}
        {years.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            <span style={{ fontSize: theme.typography.small, color: theme.colors.textSecondary, fontWeight: theme.typography.medium }}>
              Ano
            </span>
            <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedYear('all')}
                style={filterButtonStyle(selectedYear === 'all')}
              >
                Todos
              </button>
              {years.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year.toString())}
                  style={filterButtonStyle(selectedYear === year.toString())}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Shows Grid */}
      {filteredShows.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: theme.spacing.xl,
          color: theme.colors.textSecondary
        }}>
          No hay eventos programados con los filtros seleccionados.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: theme.spacing.lg
        }}>
          {filteredShows.map(show => {
            const nextSession = getNextSession(show);
            const imageUrl = getShowImageUrl(show);
            
            return (
              <div
                key={show.id}
                style={{
                  background: theme.colors.surface,
                  borderRadius: theme.borderRadius.lg,
                  border: `1px solid ${theme.colors.border}`,
                  overflow: 'hidden',
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '100px 1fr auto' : '120px 1fr auto',
                  gap: theme.spacing.md,
                  padding: theme.spacing.md,
                  alignItems: 'center'
                }}
              >
                {/* Image */}
                <div style={{
                  width: isMobile ? 100 : 120,
                  height: isMobile ? 80 : 100,
                  borderRadius: theme.borderRadius.md,
                  overflow: 'hidden',
                  background: theme.colors.surfaceAlt,
                  flexShrink: 0
                }}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={show.title}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: theme.colors.textMuted,
                      fontSize: theme.typography.tiny
                    }}>
                      Sin imagen
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: theme.spacing.xs,
                  minWidth: 0
                }}>
                  <h3 style={{
                    fontSize: isMobile ? theme.typography.small : theme.typography.body,
                    fontWeight: theme.typography.semibold,
                    color: theme.colors.textPrimary,
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {show.title}
                  </h3>
                  {nextSession && (
                    <>
                      <span style={{
                        fontSize: theme.typography.tiny,
                        color: theme.colors.textSecondary,
                        textTransform: 'capitalize'
                      }}>
                        {formatDateLong(nextSession.starts_at)}
                      </span>
                      <span style={{
                        fontSize: theme.typography.tiny,
                        color: theme.colors.textSecondary
                      }}>
                        {formatTime(nextSession.starts_at)} hs
                      </span>
                    </>
                  )}
                  <span style={{
                    fontSize: theme.typography.tiny,
                    color: theme.colors.textMuted
                  }}>
                    {venueLabelMap[show.venue_type] || show.venue_type}
                  </span>
                </div>

                {/* Button */}
                <button
                  onClick={() => navigate(`/info/${show.id}`)}
                  style={{
                    ...buttonStyle,
                    whiteSpace: 'nowrap',
                    fontSize: isMobile ? theme.typography.tiny : theme.typography.small,
                    padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.md}`
                  }}
                >
                  VER MAS
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
