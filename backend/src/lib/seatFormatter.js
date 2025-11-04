/**
 * Format seat location to human-readable format
 * @param {string} seatCode - Seat code like "A7", "PB14", "PA2"
 * @param {string} type - Seat type: 'butaca', 'palco', 'pullman'
 * @returns {string} - Formatted location
 */
export function formatSeatLocation(seatCode, type) {
  if (type === 'pullman') {
    return 'Ubicación libre';
  }
  
  if (type === 'palco') {
    if (!seatCode) return 'Palco';
    
    // PB14 -> Palco Bajo - 14
    // PA2 -> Palco Alto - 2
    if (seatCode.startsWith('PB')) {
      const number = seatCode.substring(2).trim();
      return `Palco Bajo - ${number}`;
    }
    if (seatCode.startsWith('PA')) {
      const number = seatCode.substring(2).trim();
      return `Palco Alto - ${number}`;
    }
    return `Palco - ${seatCode}`;
  }
  
  if (type === 'butaca') {
    if (!seatCode) return 'Butaca';
    
    // A7 -> Platea Baja - Butaca 7
    // Extract row (letter) and number
    const match = seatCode.match(/^([A-Z])(\d+)$/);
    if (match) {
      const [, row, number] = match;
      return `Platea Baja - Fila ${row} - Butaca ${number}`;
    }
    return `Butaca ${seatCode}`;
  }
  
  return seatCode;
}

/**
 * Get section name from seat type
 * @param {string} type - Seat type
 * @returns {string} - Section name
 */
export function getSectionName(type) {
  switch (type) {
    case 'butaca':
      return 'Platea Baja';
    case 'palco':
      return 'Palco';
    case 'pullman':
      return 'Pullman';
    default:
      return type;
  }
}
