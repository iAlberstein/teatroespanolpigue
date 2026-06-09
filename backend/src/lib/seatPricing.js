import sequelize from '../config/database.js';

/**
 * Calculate the price for a specific seat based on pricing rules
 * Priority order:
 * 1. Session-specific seat pricing (highest priority)
 * 2. Show-level seat pricing
 * 3. Session-specific row pricing
 * 4. Show-level row pricing
 * 5. Session-specific row range pricing
 * 6. Show-level row range pricing
 * 7. Base pricing from session/show pricing_json (fallback)
 */
export async function getSeatPrice(sessionId, showId, seatCode, basePricing = {}) {
  const { seat_pricing: SeatPricing } = sequelize.models;
  
  // Extract row letter from seat code (e.g., "A7" -> "A", "PB19" -> null)
  const rowLetter = /^[A-M]\d+$/.test(seatCode) ? seatCode[0] : null;
  const isPalcoBajo = /^PB\d+$/i.test(seatCode);
  const isPalcoAlto = /^PA\d+$/i.test(seatCode);
  const palcoNumber = isPalcoBajo || isPalcoAlto ? parseInt(seatCode.substring(2)) : null;

  // Build query conditions
  const conditions = [];
  
  // 1. Exact seat code match
  conditions.push({ seat_code: seatCode });
  
  // 2. Row letter match (for butacas only)
  if (rowLetter) {
    conditions.push({ 
      row_letter: rowLetter,
      seat_code: null // Row-specific rules don't have seat_code
    });
  }
  
  // 3. Row range match (for butacas only)
  if (rowLetter) {
    conditions.push({
      row_from: { [sequelize.Sequelize.Op.lte]: rowLetter },
      row_to: { [sequelize.Sequelize.Op.gte]: rowLetter },
      seat_code: null,
      row_letter: null
    });
  }
  
  // 4. Palco-specific rules
  if (palcoNumber !== null) {
    conditions.push({
      is_palco_alto: isPalcoAlto,
      palco_from: { [sequelize.Sequelize.Op.lte]: palcoNumber },
      palco_to: { [sequelize.Sequelize.Op.gte]: palcoNumber },
      seat_code: null
    });
  }

  // Search for pricing rules - session first, then show
  const whereClause = {
    [sequelize.Sequelize.Op.or]: conditions,
    [sequelize.Sequelize.Op.and]: [
      {
        [sequelize.Sequelize.Op.or]: [
          { session_id: sessionId },
          { show_id: showId }
        ]
      }
    ]
  };

  const pricingRules = await SeatPricing.findAll({
    where: whereClause,
    order: [
      ['session_id', 'DESC'], // Session-specific first (not null = higher priority)
      ['priority', 'DESC'],   // Higher priority first
      ['created_at', 'ASC']  // Older rules first for same priority
    ]
  });

  // Find the best matching rule
  for (const rule of pricingRules) {
    // Check if this rule applies
    if (rule.seat_code && rule.seat_code === seatCode) {
      return { price: parseFloat(rule.price), source: 'seat', rule };
    }
    
    if (rule.row_letter && rule.row_letter === rowLetter && !rule.seat_code) {
      return { price: parseFloat(rule.price), source: 'row', rule };
    }
    
    if (rule.row_from && rule.row_to && rowLetter) {
      if (rowLetter >= rule.row_from && rowLetter <= rule.row_to) {
        return { price: parseFloat(rule.price), source: 'row_range', rule };
      }
    }
    
    if (rule.palco_from !== null && rule.palco_to !== null && palcoNumber !== null) {
      if (rule.is_palco_alto === isPalcoAlto && 
          palcoNumber >= rule.palco_from && 
          palcoNumber <= rule.palco_to) {
        return { price: parseFloat(rule.price), source: 'palco_range', rule };
      }
    }
  }

  // Fallback to base pricing
  let basePrice = 0;
  if (isPalcoBajo) basePrice = basePricing.palcos_bajos || 0;
  else if (isPalcoAlto) basePrice = basePricing.palcos_altos || 0;
  else basePrice = basePricing.platea_general || 0;
  
  return { price: basePrice, source: 'base', rule: null };
}

/**
 * Get all pricing rules for a show or session
 */
export async function getPricingRules(showId, sessionId = null) {
  const { seat_pricing: SeatPricing } = sequelize.models;
  
  const where = {};
  if (sessionId) {
    where.session_id = sessionId;
  } else if (showId) {
    where.show_id = showId;
    where.session_id = null; // Only show-level rules
  }
  
  return await SeatPricing.findAll({
    where,
    order: [['priority', 'DESC'], ['created_at', 'ASC']]
  });
}

/**
 * Group pricing rules by type for display
 */
export function groupPricingRulesForDisplay(rules) {
  const grouped = {
    platea_rows: [],      // Row-based pricing for platea
    platea_ranges: [],    // Row range pricing
    palcos_bajos: [],     // Palco bajo pricing
    palcos_altos: []      // Palco alto pricing
  };

  for (const rule of rules) {
    if (rule.row_letter) {
      grouped.platea_rows.push({
        id: rule.id,
        row: rule.row_letter,
        price: rule.price,
        label: rule.label || `Fila ${rule.row_letter}`
      });
    } else if (rule.row_from && rule.row_to) {
      grouped.platea_ranges.push({
        id: rule.id,
        from: rule.row_from,
        to: rule.row_to,
        price: rule.price,
        label: rule.label || `Filas ${rule.row_from} a ${rule.row_to}`
      });
    } else if (rule.palco_from !== null && rule.palco_to !== null) {
      const entry = {
        id: rule.id,
        from: rule.palco_from,
        to: rule.palco_to,
        price: rule.price,
        label: rule.label || `${rule.is_palco_alto ? 'PA' : 'PB'} ${rule.palco_from} a ${rule.palco_to}`
      };
      if (rule.is_palco_alto) {
        grouped.palcos_altos.push(entry);
      } else {
        grouped.palcos_bajos.push(entry);
      }
    }
  }

  return grouped;
}

/**
 * Get price tiers for display in the UI
 * Returns structured data for showing different price zones
 */
export async function getPriceTiers(sessionId, showId, basePricing) {
  const rules = await getPricingRules(showId, sessionId);
  const grouped = groupPricingRulesForDisplay(rules);
  
  const tiers = [];
  
  // Platea pricing tiers
  if (grouped.platea_ranges.length > 0) {
    for (const range of grouped.platea_ranges) {
      tiers.push({
        section: 'platea',
        type: 'range',
        label: range.label,
        price: range.price,
        rows: { from: range.from, to: range.to }
      });
    }
  } else if (grouped.platea_rows.length > 0) {
    // Group consecutive rows with same price
    const rowPrices = {};
    for (const r of grouped.platea_rows) {
      rowPrices[r.row] = parseFloat(r.price);
    }
    
    // Fill in base price for rows not specified
    const basePlatea = parseFloat(basePricing.platea_general || 0);
    for (const row of 'ABCDEFGHIJKLM'.split('')) {
      if (!rowPrices[row]) {
        rowPrices[row] = basePlatea;
      }
    }
    
    // Group into ranges
    let currentPrice = null;
    let rangeStart = null;
    const rows = 'ABCDEFGHIJKLM'.split('');
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const price = rowPrices[row];
      
      if (price !== currentPrice) {
        if (currentPrice !== null) {
          tiers.push({
            section: 'platea',
            type: 'range',
            label: `Filas ${rangeStart} a ${rows[i-1]}`,
            price: currentPrice,
            rows: { from: rangeStart, to: rows[i-1] }
          });
        }
        currentPrice = price;
        rangeStart = row;
      }
    }
    
    // Add last range
    if (currentPrice !== null && rangeStart) {
      tiers.push({
        section: 'platea',
        type: 'range',
        label: `Filas ${rangeStart} a ${rows[rows.length - 1]}`,
        price: currentPrice,
        rows: { from: rangeStart, to: rows[rows.length - 1] }
      });
    }
  }
  
  // Palcos bajos
  if (grouped.palcos_bajos.length > 0) {
    for (const range of grouped.palcos_bajos) {
      tiers.push({
        section: 'palcos_bajos',
        type: 'range',
        label: range.label,
        price: range.price,
        palcos: { from: range.from, to: range.to }
      });
    }
  }
  
  // Palcos altos
  if (grouped.palcos_altos.length > 0) {
    for (const range of grouped.palcos_altos) {
      tiers.push({
        section: 'palcos_altos',
        type: 'range',
        label: range.label,
        price: range.price,
        palcos: { from: range.from, to: range.to }
      });
    }
  }
  
  return tiers;
}
