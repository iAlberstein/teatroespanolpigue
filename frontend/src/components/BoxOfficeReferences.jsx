const containerStyle = {
  width: '100%',
  marginBottom: 24,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)'
};

// Grid layout for sectors - each sector is a column
const sectorsGridStyle = (isWideLayout) => ({
  display: 'grid',
  gridTemplateColumns: isWideLayout ? 'repeat(4, 1fr)' : '1fr',
  gap: isWideLayout ? 16 : 12,
  width: '100%'
});

// Individual sector column
const sectorColumnStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8
};

// Single item row within a sector column
const sectorItemStyle = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  padding: '8px 0',
  borderBottom: '1px solid #f3f4f6'
};

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

const BoxOfficeReferences = ({ isWideLayout, pricing, formatCurrency, priceTiers = [] }) => {
  const sectorItems = [
    {
      id: 'platea_general',
      badge: 'Platea',
      badgeColor: '#a8d8a8',
      badgeText: '#1f2937',
      name: 'Platea General',
      localidades: null,
      location: 'Planta baja'
    },
    {
      id: 'palcos_bajos',
      badge: 'PB',
      badgeColor: '#8fbc8f',
      badgeText: '#1f2937',
      name: 'Palcos Bajos',
      localidades: '4 localidades',
      location: 'Planta baja'
    },
    {
      id: 'palcos_altos',
      badge: 'PA',
      badgeColor: '#6b8e6b',
      badgeText: '#ffffff',
      name: 'Palcos Altos',
      localidades: '2 localidades',
      location: '1° piso por escalera'
    },
    {
      id: 'pullman',
      badge: 'Pullman',
      badgeColor: '#c0c0c0',
      badgeText: '#1f2937',
      name: 'Pullman',
      localidades: null,
      location: '2° piso por escalera\nSin ubicación fija'
    }
  ];

  const seatStatuses = [
    { label: 'Seleccionada', color: '#ffd700', textColor: '#1f2937' },
    { label: 'Reservada', color: '#9370db', textColor: '#ffffff' },
    { label: 'Vendida', color: '#808080', textColor: '#ffffff' }
  ];

  // Group price tiers by section
  const tiersBySection = {
    platea: [],
    palcos_bajos: [],
    palcos_altos: [],
    pullman: []
  };
  
  if (priceTiers && priceTiers.length > 0) {
    priceTiers.forEach(tier => {
      if (tiersBySection[tier.section]) {
        tiersBySection[tier.section].push(tier);
      }
    });
  }
  
  // Map section IDs to base sector config
  const sectionToSectorId = {
    platea: 'platea_general',
    palcos_bajos: 'palcos_bajos',
    palcos_altos: 'palcos_altos',
    pullman: 'pullman'
  };
  
  // Section display order
  const sectionOrder = ['platea', 'palcos_bajos', 'palcos_altos', 'pullman'];

  // Render a single sector item — always 3 lines: name, localidades, location
  const renderSectorItem = (item) => (
    <div key={item.id} style={sectorItemStyle}>
      <span style={badgeStyle(item.badgeColor, item.badgeText, isWideLayout)}>{item.badge}</span>
      <div style={{ flex: '1 1 auto' }}>
        <div style={titleStyle}>{item.name}</div>
        {item.localidades && <div style={infoStyle}>{item.localidades}</div>}
        {item.location && item.location.split('\n').map((line, i) => (
          <div key={i} style={infoStyle}>{line}</div>
        ))}
      </div>
      <div style={priceStyle}>
        {formatCurrency ? formatCurrency(item.price) : item.price}
      </div>
    </div>
  );

  return (
    <div style={{ ...containerStyle, padding: isWideLayout ? 24 : 18 }}>
      {/* Sectors Grid - each column is a sector */}
      <div style={sectorsGridStyle(isWideLayout)}>
        {sectionOrder.map(section => {
          const sectorId = sectionToSectorId[section];
          const baseSector = sectorItems.find(s => s.id === sectorId);
          const sectionTiers = tiersBySection[section] || [];
          
          // Skip if no data for this section
          if (!baseSector && sectionTiers.length === 0) return null;
          
          return (
            <div key={section} style={sectorColumnStyle}>
              {/* Base price row — always shown with 3 lines */}
              {baseSector && renderSectorItem({
                ...baseSector,
                price: pricing?.[baseSector.id]
              })}
              
              {/* Tier rules — same 3-line format */}
              {sectionTiers.map(tier => {
                const sectionConfig = {
                  platea: { badge: 'Platea', badgeColor: '#a8d8a8', badgeText: '#1f2937', localidades: null, location: 'Planta baja' },
                  palcos_bajos: { badge: 'PB', badgeColor: '#8fbc8f', badgeText: '#1f2937', localidades: '4 localidades', location: 'Planta baja' },
                  palcos_altos: { badge: 'PA', badgeColor: '#6b8e6b', badgeText: '#ffffff', localidades: '2 localidades', location: '1° piso por escalera' },
                  pullman: { badge: 'Pullman', badgeColor: '#c0c0c0', badgeText: '#1f2937', localidades: null, location: '2° piso por escalera' }
                };
                const config = sectionConfig[section] || sectionConfig.platea;
                return renderSectorItem({
                  id: `${section}-${tier.label}`,
                  badge: config.badge,
                  badgeColor: tier.color || config.badgeColor,
                  badgeText: config.badgeText,
                  name: tier.label,
                  localidades: config.localidades,
                  location: config.location,
                  price: tier.price
                });
              })}
            </div>
          );
        })}
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
