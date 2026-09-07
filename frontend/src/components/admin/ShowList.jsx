import { useState, useEffect, useMemo } from 'react';
import { formatDateShort, formatTime } from '../../lib/dateFormatter.js';

const VENUE_LABELS = {
  sala_principal: 'Sala Principal',
  el_tablado: 'El Tablado',
  las_gemelas: 'Nueva Sala',
};

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

/**
 * Component to display a list of shows with admin actions
 */
export default function ShowList({ shows, onEdit, onDelete, onManageSessions, onCreateNew }) {
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [tab, setTab] = useState('activos'); // 'activos' | 'pasados'
  const [filterMonth, setFilterMonth] = useState(null); // null = todos, or 'YYYY-MM'
  const [filterVenue, setFilterVenue] = useState(null); // null = todas

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDelete = async (showId) => {
    if (deleteConfirm === showId) {
      await onDelete(showId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(showId);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  // Split shows into active / past using show_status from API
  const activeShows = useMemo(() => shows.filter(s => s.show_status !== 'finalizado'), [shows]);
  const pastShows = useMemo(() => shows.filter(s => s.show_status === 'finalizado'), [shows]);
  const currentShows = tab === 'activos' ? activeShows : pastShows;

  // Build unique months from sessions of currentShows
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    currentShows.forEach(show => {
      (show.sessions || []).forEach(s => {
        const d = new Date(s.starts_at);
        monthSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      });
    });
    return Array.from(monthSet).sort();
  }, [currentShows]);

  // Build unique venues from currentShows
  const availableVenues = useMemo(() => {
    const vSet = new Set();
    currentShows.forEach(s => { if (s.venue_type) vSet.add(s.venue_type); });
    return Array.from(vSet);
  }, [currentShows]);

  // Apply filters
  const filteredShows = useMemo(() => {
    return currentShows.filter(show => {
      // Venue filter
      if (filterVenue && show.venue_type !== filterVenue) return false;
      // Month filter: show must have at least one session in the selected month
      if (filterMonth) {
        const hasMonth = (show.sessions || []).some(s => {
          const d = new Date(s.starts_at);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return key === filterMonth;
        });
        if (!hasMonth) return false;
      }
      return true;
    });
  }, [currentShows, filterVenue, filterMonth]);

  // Reset filters when switching tabs
  const switchTab = (newTab) => {
    setTab(newTab);
    setFilterMonth(null);
    setFilterVenue(null);
  };

  const btnBase = (active) => ({
    padding: isMobile ? '6px 10px' : '7px 14px',
    border: active ? '2px solid #007bff' : '1px solid #dee2e6',
    borderRadius: 20,
    background: active ? '#007bff' : '#fff',
    color: active ? '#fff' : '#495057',
    fontSize: isMobile ? 11 : 13,
    fontWeight: active ? 700 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  });

  return (
    <div>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center', 
        marginBottom: 20,
        gap: isMobile ? 12 : 0
      }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24 }}>Espectáculos</h2>
        <button
          onClick={onCreateNew}
          style={{
            padding: isMobile ? '12px 16px' : '10px 20px',
            background: '#000000',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: isMobile ? 14 : 16,
            fontWeight: 600,
            cursor: 'pointer',
            width: isMobile ? '100%' : 'auto'
          }}
        >
          + Crear Espectáculo
        </button>
      </div>

      {/* Activos / Pasados tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #dee2e6' }}>
        {[
          { key: 'activos', label: `Próximos (${activeShows.length})` },
          { key: 'pasados', label: `Pasados (${pastShows.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            style={{
              padding: isMobile ? '8px 14px' : '10px 24px',
              background: 'none',
              border: 'none',
              borderBottom: tab === key ? '3px solid #007bff' : '3px solid transparent',
              color: tab === key ? '#007bff' : '#6c757d',
              fontWeight: tab === key ? 700 : 400,
              fontSize: isMobile ? 13 : 15,
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters toolbar */}
      {currentShows.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 20,
          padding: '12px 16px',
          background: '#f8f9fa',
          borderRadius: 8,
          border: '1px solid #e9ecef',
          alignItems: 'center',
        }}>
          {/* Venue filter */}
          {availableVenues.length > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#6c757d', fontWeight: 600, marginRight: 2 }}>Sala:</span>
              <button style={btnBase(!filterVenue)} onClick={() => setFilterVenue(null)}>Todas</button>
              {availableVenues.map(v => (
                <button key={v} style={btnBase(filterVenue === v)} onClick={() => setFilterVenue(filterVenue === v ? null : v)}>
                  {VENUE_LABELS[v] || v}
                </button>
              ))}
            </div>
          )}

          {/* Separator */}
          {availableVenues.length > 1 && availableMonths.length > 0 && (
            <div style={{ width: 1, height: 24, background: '#dee2e6', margin: '0 4px' }} />
          )}

          {/* Month filter */}
          {availableMonths.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#6c757d', fontWeight: 600, marginRight: 2 }}>Mes:</span>
              <button style={btnBase(!filterMonth)} onClick={() => setFilterMonth(null)}>Todos</button>
              {availableMonths.map(ym => {
                const [year, month] = ym.split('-');
                const label = `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
                return (
                  <button key={ym} style={btnBase(filterMonth === ym)} onClick={() => setFilterMonth(filterMonth === ym ? null : ym)}>
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Show list */}
      {filteredShows.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          background: '#f5f5f5',
          borderRadius: 8,
          color: '#666'
        }}>
          {shows.length === 0
            ? 'No hay espectáculos creados. Hacé click en "Crear Espectáculo" para empezar.'
            : 'No hay espectáculos que coincidan con los filtros seleccionados.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredShows.map(show => {
            // Next upcoming session for display
            const now = new Date();
            const upcomingSessions = (show.sessions || [])
              .filter(s => new Date(s.starts_at) >= now)
              .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
            const nextSession = upcomingSessions[0];
            const totalSessions = (show.sessions || []).length;

            return (
              <div
                key={show.id}
                style={{
                  padding: isMobile ? 12 : 20,
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  justifyContent: 'space-between',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? 12 : 0,
                  opacity: tab === 'pasados' ? 0.85 : 1,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: isMobile ? 16 : 18 }}>{show.title}</h3>
                    {tab === 'pasados' && (
                      <span style={{ fontSize: 11, background: '#6c757d', color: '#fff', borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>
                        Finalizado
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: isMobile ? 12 : 14, color: '#666' }}>
                    <div>
                      <strong>Sala:</strong> {VENUE_LABELS[show.venue_type] || 'N/A'}
                      {show.venue_type !== 'sala_principal' && show.general_capacity && (
                        <span> · {show.general_capacity} localidades</span>
                      )}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <strong>Duración:</strong> {show.duration_minutes} min
                      <span style={{ marginLeft: 12 }}>
                        <strong>Funciones:</strong> {totalSessions}
                      </span>
                    </div>
                    {nextSession && tab === 'activos' && (
                      <div style={{ marginTop: 4, color: '#28a745', fontWeight: 600 }}>
                        Próxima: {formatDateShort(nextSession.starts_at)} · {formatTime(nextSession.starts_at)}
                        {upcomingSessions.length > 1 && (
                          <span style={{ color: '#888', fontWeight: 400, marginLeft: 8 }}>
                            (+{upcomingSessions.length - 1} más)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: 8, 
                  alignItems: 'center',
                  flexWrap: isMobile ? 'wrap' : 'nowrap'
                }}>
                  <button
                    onClick={() => onManageSessions(show)}
                    style={{
                      padding: isMobile ? '10px 12px' : '8px 16px',
                      background: '#000000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: isMobile ? 12 : 14,
                      flex: isMobile ? '1 1 calc(50% - 4px)' : 'none'
                    }}
                  >
                    Sesiones
                  </button>
                  <button
                    onClick={() => onEdit(show)}
                    style={{
                      padding: isMobile ? '10px 12px' : '8px 16px',
                      background: '#000000',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: isMobile ? 12 : 14,
                      flex: isMobile ? '1 1 calc(50% - 4px)' : 'none'
                    }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(show.id)}
                    style={{
                      padding: isMobile ? '10px 12px' : '8px 16px',
                      background: deleteConfirm === show.id ? '#dc3545' : '#6c757d',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: isMobile ? 12 : 14,
                      flex: isMobile ? '1 1 100%' : 'none'
                    }}
                  >
                    {deleteConfirm === show.id ? 'Confirmar' : 'Eliminar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
