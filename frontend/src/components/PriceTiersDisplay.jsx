/**
 * Component to display price tiers/sections with visual distinction
 * Shows different prices for different zones (rows, palcos) with color coding
 */

function formatPrice(price) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

function getPriceTierColor(section, index, totalInSection) {
  // Base colors for each section type
  const baseColors = {
    platea: { r: 168, g: 216, b: 168 },      // Light green (#a8d8a8)
    palcos_bajos: { r: 143, g: 188, b: 143 }, // Darker green (#8fbc8f)
    palcos_altos: { r: 107, g: 142, b: 107 }, // Even darker (#6b8e6b)
    pullman: { r: 192, g: 192, b: 192 }       // Gray (#c0c0c0)
  };
  
  const base = baseColors[section] || baseColors.platea;
  
  // If only one tier in this section, use base color
  if (totalInSection <= 1) {
    return `rgb(${base.r}, ${base.g}, ${base.b})`;
  }
  
  // For multiple tiers, shift towards blue based on index
  // First tier (index 0) = more green, last tier = more blue
  const factor = index / (totalInSection - 1); // 0 to 1
  
  // Interpolate towards blue (add blue, reduce green)
  const r = Math.round(base.r - (factor * 30));  // Slightly reduce red
  const g = Math.round(base.g - (factor * 60));  // Reduce green more
  const b = Math.round(base.b + (factor * 40));  // Add blue
  
  return `rgb(${r}, ${g}, ${b})`;
}

export default function PriceTiersDisplay({ tiers, className = '' }) {
  if (!tiers || tiers.length === 0) return null;
  
  // Group tiers by section
  const grouped = tiers.reduce((acc, tier) => {
    if (!acc[tier.section]) acc[tier.section] = [];
    acc[tier.section].push(tier);
    return acc;
  }, {});
  
  // Section display order and labels
  const sectionConfig = {
    platea: { label: 'Platea General', order: 1 },
    palcos_bajos: { label: 'Palcos Bajos', order: 2 },
    palcos_altos: { label: 'Palcos Altos', order: 3 },
    pullman: { label: 'Pullman', order: 4 }
  };
  
  const sortedSections = Object.keys(grouped).sort((a, b) => 
    (sectionConfig[a]?.order || 99) - (sectionConfig[b]?.order || 99)
  );
  
  return (
    <div className={`price-tiers-display ${className}`} style={{ marginBottom: '16px' }}>
      <div style={{ 
        fontSize: '14px', 
        fontWeight: 600, 
        color: '#374151',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        Precios por ubicación
      </div>
      
      {sortedSections.map(section => {
        const sectionTiers = grouped[section];
        const config = sectionConfig[section] || { label: section };
        
        return (
          <div key={section} style={{ marginBottom: '12px' }}>
            <div style={{ 
              fontSize: '13px', 
              fontWeight: 500, 
              color: '#4b5563',
              marginBottom: '6px'
            }}>
              {config.label}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sectionTiers.map((tier, index) => {
                const color = getPriceTierColor(section, index, sectionTiers.length);
                
                return (
                  <div 
                    key={`${tier.section}-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: color,
                      borderRadius: '6px',
                      border: '1px solid rgba(0,0,0,0.1)',
                      gap: '12px'
                    }}
                  >
                    {/* Color indicator */}
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '3px',
                      backgroundColor: color,
                      border: '1px solid rgba(0,0,0,0.2)',
                      flexShrink: 0
                    }} />
                    
                    {/* Label */}
                    <div style={{ 
                      flex: 1,
                      fontSize: '13px',
                      color: '#1f2937',
                      fontWeight: tier.type === 'base' ? 400 : 500
                    }}>
                      {tier.label}
                    </div>
                    
                    {/* Price */}
                    <div style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#111827'
                    }}>
                      {formatPrice(tier.price)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
