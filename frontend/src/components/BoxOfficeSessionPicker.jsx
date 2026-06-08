import { useState, useMemo } from 'react';
import { API_URL } from '../lib/api.js';

const venueLabelMap = {
  sala_principal: 'Sala Principal',
  el_tablado: 'El Tablado',
  las_gemelas: 'Nueva sala'
};

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const BoxOfficeSessionPicker = ({
  isWideLayout,
  shows,
  sessions,
  selectedShow,
  selectedSession,
  onSelectShow,
  onSelectSession
}) => {
  const [selectedVenue, setSelectedVenue] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('all');

  // Get unique venues and months from shows with today or future sessions
  const { venues, months } = useMemo(() => {
    const venueSet = new Set();
    const monthSet = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    shows.forEach(show => {
      if (show.venue_type) venueSet.add(show.venue_type);
      if (show.sessions) {
        show.sessions.forEach(session => {
          const date = new Date(session.starts_at);
          if (date >= today) {
            monthSet.add(date.getMonth());
          }
        });
      }
    });
    
    return {
      venues: Array.from(venueSet),
      months: Array.from(monthSet).sort((a, b) => a - b)
    };
  }, [shows]);

  // Filter shows based on selections
  const filteredShows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return shows.filter(show => {
      // Must have today or future sessions
      const hasTodayOrFutureSessions = show.sessions?.some(s => new Date(s.starts_at) >= today);
      if (!hasTodayOrFutureSessions) return false;
      
      // Filter by venue
      if (selectedVenue !== 'all' && show.venue_type !== selectedVenue) {
        return false;
      }
      
      // Filter by month
      if (selectedMonth !== 'all') {
        const hasMatchingSession = show.sessions?.some(session => {
          const date = new Date(session.starts_at);
          return date.getMonth() === parseInt(selectedMonth) && date >= today;
        });
        if (!hasMatchingSession) return false;
      }
      
      return true;
    });
  }, [shows, selectedVenue, selectedMonth]);

  const getNextSession = (show) => {
    if (!show.sessions || show.sessions.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrFutureSessions = show.sessions
      .filter(s => new Date(s.starts_at) >= today)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    return todayOrFutureSessions[0] || null;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

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

  const filterButtonStyle = (isActive) => ({
    padding: '8px 16px',
    background: isActive ? '#7c3aed' : '#ffffff',
    color: isActive ? '#ffffff' : '#6b7280',
    border: `1px solid ${isActive ? '#7c3aed' : '#d1d5db'}`,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s'
  });

  // If a show is selected, show session picker
  if (selectedShow) {
    const currentShow = shows.find(s => s.id === selectedShow);
    const showSessions = sessions.filter(s => s.show_id === selectedShow);
    
    return (
      <div style={{ marginBottom: 24 }}>
        {/* Back button and show info */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 16, 
          marginBottom: 16,
          padding: 16,
          background: '#f3f4f6',
          borderRadius: 12
        }}>
          <button
            onClick={() => {
              onSelectShow(null);
              onSelectSession(null);
            }}
            style={{
              padding: '8px 16px',
              background: '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600
            }}
          >
            ← Volver
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{currentShow?.title}</h3>
            <span style={{ fontSize: 13, color: '#6b7280' }}>
              {venueLabelMap[currentShow?.venue_type] || currentShow?.venue_type}
            </span>
          </div>
        </div>

        {/* Session selector */}
        <div>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 16 }}>
            Seleccionar Función:
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            {showSessions.map((session) => {
              const date = new Date(session.starts_at);
              const dateStr = date.toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              });
              const timeStr = date.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit'
              });
              const isSelected = selectedSession === session.id;

              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  style={{
                    padding: 16,
                    background: isSelected ? '#7c3aed' : '#ffffff',
                    color: isSelected ? '#ffffff' : '#111827',
                    border: `2px solid ${isSelected ? '#7c3aed' : '#e5e7eb'}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 15,
                    fontWeight: isSelected ? 600 : 400,
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ textTransform: 'capitalize' }}>{dateStr}</span>
                  <span style={{ marginLeft: 8, opacity: 0.8 }}>a las {timeStr}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Show cards grid with filters
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600 }}>Seleccionar Obra</h3>
      
      {/* Filters */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Venue filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Sala</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setSelectedVenue('all')} style={filterButtonStyle(selectedVenue === 'all')}>
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
        {months.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Mes</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setSelectedMonth('all')} style={filterButtonStyle(selectedMonth === 'all')}>
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
        )}
      </div>

      {/* Shows grid */}
      {filteredShows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
          No hay shows disponibles con los filtros seleccionados.
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isWideLayout ? 'repeat(3, 1fr)' : '1fr',
          gap: 12
        }}>
          {filteredShows.map(show => {
            const nextSession = getNextSession(show);
            const imageUrl = getShowImageUrl(show);
            
            return (
              <div
                key={show.id}
                onClick={() => onSelectShow(show.id)}
                style={{
                  background: '#ffffff',
                  borderRadius: 12,
                  border: '1px solid #e5e7eb',
                  overflow: 'hidden',
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr',
                  gap: 12,
                  padding: 12,
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  ':hover': { borderColor: '#7c3aed' }
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#7c3aed'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
              >
                {/* Image */}
                <div style={{
                  width: 80,
                  height: 65,
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#f3f4f6',
                  flexShrink: 0
                }}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={show.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#9ca3af',
                      fontSize: 11
                    }}>
                      Sin img
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <h4 style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#111827',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {show.title}
                  </h4>
                  {nextSession && (
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      {formatDate(nextSession.starts_at)} - {formatTime(nextSession.starts_at)}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>
                    {venueLabelMap[show.venue_type] || show.venue_type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BoxOfficeSessionPicker;
