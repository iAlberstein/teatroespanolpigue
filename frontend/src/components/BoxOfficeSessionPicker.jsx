const containerStyle = (isWideLayout) => ({
  display: 'flex',
  flexDirection: isWideLayout ? 'row' : 'column',
  gap: isWideLayout ? 16 : 12,
  marginBottom: 24
});

const fieldContainerStyle = { flex: '1 1 50%' };

const labelStyle = {
  display: 'block',
  marginBottom: 8,
  fontWeight: 600,
  fontSize: 18
};

const selectStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: '#f9fafb',
  fontSize: 16
};

const BoxOfficeSessionPicker = ({
  isWideLayout,
  shows,
  sessions,
  selectedShow,
  selectedSession,
  onSelectShow,
  onSelectSession
}) => {
  const handleShowChange = (event) => {
    onSelectShow(event.target.value || null);
  };

  const handleSessionChange = (event) => {
    onSelectSession(event.target.value || null);
  };

  return (
    <div style={containerStyle(isWideLayout)}>
      <div style={fieldContainerStyle}>
        <label style={labelStyle}>Seleccionar Obra:</label>
        <select value={selectedShow || ''} onChange={handleShowChange} style={selectStyle}>
          <option value="">Seleccionar obra...</option>
          {shows.map((show) => (
            <option key={show.id} value={show.id}>
              {show.title}
            </option>
          ))}
        </select>
      </div>

      {sessions.length > 0 && (
        <div style={fieldContainerStyle}>
          <label style={labelStyle}>Seleccionar Función:</label>
          <select value={selectedSession || ''} onChange={handleSessionChange} style={selectStyle}>
            <option value="">Seleccionar horario...</option>
            {sessions
              .filter((session) => session.show_id === selectedShow)
              .map((session) => {
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

                return (
                  <option key={session.id} value={session.id}>
                    {dateStr} a las {timeStr}
                  </option>
                );
              })}
          </select>
        </div>
      )}
    </div>
  );
};

export default BoxOfficeSessionPicker;
