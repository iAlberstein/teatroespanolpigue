const containerStyle = {
  width: '100%',
  marginBottom: 24,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)'
};

const innerWrapperStyle = (isWideLayout) => ({
  display: 'flex',
  flexDirection: isWideLayout ? 'row' : 'column',
  gap: isWideLayout ? 0 : 12,
  width: '100%',
  alignItems: 'stretch'
});

const sectorItemStyle = (isWideLayout, idx, lastIdx) => ({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: isWideLayout ? 10 : 12,
  borderLeft: isWideLayout && idx > 0 ? '1px solid #d1d5db' : 'none',
  paddingLeft: isWideLayout && idx > 0 ? 16 : 0,
  paddingRight: isWideLayout && idx < lastIdx ? 16 : 0,
  flex: isWideLayout ? '1 1 0%' : '1 1 auto',
  minWidth: 0
});

const badgeStyle = (badgeColor, badgeText, isWideLayout) => ({
  background: badgeColor,
  color: badgeText,
  padding: isWideLayout ? '6px 12px' : '6px 10px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  minWidth: isWideLayout ? 92 : 82,
  minHeight: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center'
});

const titleStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: '#111827',
  whiteSpace: 'pre-line'
};

const infoStyle = {
  fontSize: 11,
  color: '#6b7280',
  whiteSpace: 'pre-line'
};

const priceStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: '#111827',
  whiteSpace: 'nowrap'
};

const seatStatusContainerStyle = (isWideLayout) => ({
  marginTop: 18,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8
});

const seatStatusRowStyle = (isWideLayout) => ({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: isWideLayout ? 10 : 8,
  flexWrap: 'nowrap',
  width: '100%'
});

const seatChipStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 6px',
  borderRadius: 6,
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  whiteSpace: 'nowrap'
};

const chipIconStyle = (color, textColor) => ({
  background: color,
  color: textColor,
  width: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600
});

const BoxOfficeReferences = ({ isWideLayout, pricing, formatCurrency }) => {
  const sectorItems = [
    {
      id: 'platea_general',
      badge: 'Platea',
      badgeColor: '#a8d8a8',
      badgeText: '#1f2937',
      title: 'Platea General',
      info: 'Planta baja'
    },
    {
      id: 'palcos_bajos',
      badge: 'PB',
      badgeColor: '#8fbc8f',
      badgeText: '#1f2937',
      title: 'Palcos Bajos\n4 localidades',
      info: 'Planta baja'
    },
    {
      id: 'palcos_altos',
      badge: 'PA',
      badgeColor: '#6b8e6b',
      badgeText: '#ffffff',
      title: 'Palcos Altos\n2 localidades',
      info: '1° piso por escalera'
    },
    {
      id: 'pullman',
      badge: 'Pullman',
      badgeColor: '#c0c0c0',
      badgeText: '#1f2937',
      title: 'Pullman',
      info: '2° piso por escalera\nSin ubicación fija'
    }
  ];

  const seatStatuses = [
    { label: 'Seleccionada', color: '#ffd700', textColor: '#1f2937' },
    { label: 'Reservada', color: '#9370db', textColor: '#ffffff' },
    { label: 'Vendida', color: '#808080', textColor: '#ffffff' }
  ];

  return (
    <div style={{ ...containerStyle, padding: isWideLayout ? 24 : 18 }}>
      <div style={innerWrapperStyle(isWideLayout)}>
        {sectorItems.map((sector, idx) => (
          <div key={sector.id} style={sectorItemStyle(isWideLayout, idx, sectorItems.length - 1)}>
            <span style={badgeStyle(sector.badgeColor, sector.badgeText, isWideLayout)}>{sector.badge}</span>
            <div style={{ flex: '1 1 auto' }}>
              <div style={titleStyle}>{sector.title}</div>
              <div style={infoStyle}>{sector.info}</div>
            </div>
            <div style={priceStyle}>
              {formatCurrency ? formatCurrency(pricing?.[sector.id]) : pricing?.[sector.id]}
            </div>
          </div>
        ))}
      </div>

      <div style={seatStatusContainerStyle(isWideLayout)}>
        <span
          style={{
            fontSize: isWideLayout ? 12 : 11,
            fontWeight: 600,
            color: '#111827',
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}
        >
          Estado de butacas
        </span>
        <div style={seatStatusRowStyle(isWideLayout)}>
          {seatStatuses.map((status) => (
            <div key={status.label} style={seatChipStyle}>
              <span style={chipIconStyle(status.color, status.textColor)}>•</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>{status.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BoxOfficeReferences;
