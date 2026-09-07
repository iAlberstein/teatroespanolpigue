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
    
    // A7 -> Platea Baja - Fila A - Butaca 7
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

/**
 * Valida que los items seleccionados cumplan la restricción de platea baja
 * con rango de filas (A-M).
 * @param {Array} items - items { type, seat_code, quantity }
 * @param {string} rowStart - letra de fila inicial (default 'A')
 * @param {string} rowEnd - letra de fila final (default 'M')
 * @returns {string|null} mensaje de error si no cumple, null si ok
 */
export function validatePlateaBajaRows(items, rowStart, rowEnd) {
  const rs = rowStart || 'A';
  const re = rowEnd || 'M';
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (!item) continue;
    if (item.type !== 'butaca') {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
    const seatCode = item.seat_code;
    if (!seatCode) {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
    const match = String(seatCode).match(/^([A-Z])(\d+)$/);
    if (!match) {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
    const rowLetter = match[1];
    if (rowLetter < rs || rowLetter > re) {
      return `El código aplicado solo es válido de la fila ${rs} a la fila ${re} de la platea baja`;
    }
  }
  return null;
}
