/**
 * Utility functions for mapping seat prices to colors
 * Used to visually distinguish different price zones in the seating chart
 */

// Base colors for each section type (same as in PriceTiersDisplay)
const baseColors = {
  platea: { r: 168, g: 216, b: 168, hex: '#a8d8a8' },      // Light green
  palcos_bajos: { r: 143, g: 188, b: 143, hex: '#8fbc8f' }, // Darker green
  palcos_altos: { r: 107, g: 142, b: 107, hex: '#6b8e6b' }, // Even darker
  pullman: { r: 192, g: 192, b: 192, hex: '#c0c0c0' }       // Gray
};

/**
 * Get color for a seat based on its section and price tier index
 * @param {string} section - 'platea', 'palcos_bajos', 'palcos_altos', 'pullman'
 * @param {number} tierIndex - Index of this price within the section (0 = base/highest)
 * @param {number} totalTiers - Total number of price tiers in this section
 * @returns {string} RGB color string
 */
export function getSeatColor(section, tierIndex = 0, totalTiers = 1) {
  const base = baseColors[section] || baseColors.platea;
  
  // If only one tier, return base color
  if (totalTiers <= 1) {
    return `rgb(${base.r}, ${base.g}, ${base.b})`;
  }
  
  // Calculate factor (0 = first/highest price, 1 = lowest price)
  const factor = tierIndex / (totalTiers - 1);
  
  // Shift towards blue: reduce green, add blue, slightly reduce red
  const r = Math.round(base.r - (factor * 30));
  const g = Math.round(base.g - (factor * 60));
  const b = Math.round(base.b + (factor * 40));
  
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Get border color for a seat (slightly darker than fill)
 */
export function getSeatBorderColor(section, tierIndex = 0, totalTiers = 1) {
  const base = baseColors[section] || baseColors.platea;
  
  const factor = totalTiers > 1 ? tierIndex / (totalTiers - 1) : 0;
  
  // Darker version of the fill color
  const r = Math.round(base.r - (factor * 30) - 30);
  const g = Math.round(base.g - (factor * 60) - 30);
  const b = Math.round(base.b + (factor * 40) - 30);
  
  return `rgb(${Math.max(0, r)}, ${Math.max(0, g)}, ${Math.max(0, b)})`;
}

/**
 * Get the price tier index for a specific seat based on price tiers configuration
 * @param {string} seatCode - Seat code (e.g., "A7", "PB19")
 * @param {Array} priceTiers - Array of price tier objects from API
 * @returns {Object} { tierIndex, totalTiers, price, section }
 */
export function getSeatPriceTier(seatCode, priceTiers) {
  if (!priceTiers || priceTiers.length === 0) {
    return { tierIndex: 0, totalTiers: 1, price: null, section: null };
  }
  
  // Determine section from seat code
  let section = 'platea';
  let rowLetter = null;
  let palcoNumber = null;
  let isPalcoAlto = false;
  
  if (/^PB\d+$/i.test(seatCode)) {
    section = 'palcos_bajos';
    palcoNumber = parseInt(seatCode.substring(2));
  } else if (/^PA\d+$/i.test(seatCode)) {
    section = 'palcos_altos';
    palcoNumber = parseInt(seatCode.substring(2));
    isPalcoAlto = true;
  } else if (/^[A-M]\d+$/.test(seatCode)) {
    section = 'platea';
    rowLetter = seatCode[0];
  }
  
  // Filter tiers for this section
  const sectionTiers = priceTiers.filter(t => t.section === section);
  
  if (sectionTiers.length === 0) {
    return { tierIndex: 0, totalTiers: 1, price: null, section };
  }
  
  // Sort by price descending (highest first = tier 0)
  const sortedTiers = [...sectionTiers].sort((a, b) => b.price - a.price);
  
  // Find matching tier for this seat
  for (let i = 0; i < sortedTiers.length; i++) {
    const tier = sortedTiers[i];
    
    // Check if this tier applies to this seat
    if (section === 'platea' && rowLetter && tier.rows) {
      const rowCode = rowLetter.charCodeAt(0);
      const fromCode = tier.rows.from.charCodeAt(0);
      const toCode = tier.rows.to.charCodeAt(0);
      
      if (rowCode >= fromCode && rowCode <= toCode) {
        return { 
          tierIndex: i, 
          totalTiers: sortedTiers.length, 
          price: tier.price, 
          section,
          label: tier.label
        };
      }
    }
    
    if ((section === 'palcos_bajos' || section === 'palcos_altos') && 
        palcoNumber !== null && tier.palcos) {
      if (palcoNumber >= tier.palcos.from && palcoNumber <= tier.palcos.to) {
        return { 
          tierIndex: i, 
          totalTiers: sortedTiers.length, 
          price: tier.price, 
          section,
          label: tier.label
        };
      }
    }
  }
  
  // Default to last tier (lowest price) if no match
  const lastTier = sortedTiers[sortedTiers.length - 1];
  return { 
    tierIndex: sortedTiers.length - 1, 
    totalTiers: sortedTiers.length, 
    price: lastTier.price, 
    section,
    label: lastTier.label
  };
}

/**
 * Get all available colors for a section (for legend/display)
 */
export function getSectionColors(section, tierCount) {
  const colors = [];
  for (let i = 0; i < tierCount; i++) {
    colors.push({
      fill: getSeatColor(section, i, tierCount),
      border: getSeatBorderColor(section, i, tierCount),
      tierIndex: i
    });
  }
  return colors;
}
