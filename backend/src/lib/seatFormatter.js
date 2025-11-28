/**
 * Sort tickets by section priority
 * Order: Platea General -> Palcos Bajos -> Palcos Altos -> Pullman
 */
export function sortTicketsBySection(tickets) {
  const sectionPriority = {
    'platea_general': 1,
    'platea_baja': 1,
    'palco_bajo': 2,
    'palcos_bajos': 2,
    'palco_alto': 3,
    'palcos_altos': 3,
    'pullman': 4
  };
  
  return tickets.sort((a, b) => {
    // Determinar prioridad basada en el tipo primero
    let priorityA = 5; // default
    let priorityB = 5;
    
    if (a.type === 'butaca') priorityA = 1;
    else if (a.type === 'palco') {
      if (a.seat_code?.startsWith('PB')) priorityA = 2;
      else if (a.seat_code?.startsWith('PA')) priorityA = 3;
    }
    else if (a.type === 'pullman') priorityA = 4;
    
    if (b.type === 'butaca') priorityB = 1;
    else if (b.type === 'palco') {
      if (b.seat_code?.startsWith('PB')) priorityB = 2;
      else if (b.seat_code?.startsWith('PA')) priorityB = 3;
    }
    else if (b.type === 'pullman') priorityB = 4;
    
    // Si tienen diferente prioridad, ordenar por prioridad
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Si tienen la misma prioridad, ordenar por seat_code
    const codeA = a.seat_code || '';
    const codeB = b.seat_code || '';
    return codeA.localeCompare(codeB);
  });
}

/**
 * Format seat location to human-readable format
 * @param {string} type - Seat type: 'butaca', 'palco', 'pullman'
 * @param {string} section - Section identifier
 * @param {string} seatCode - Seat code like "A7", "PB14", "PA2"
 * @param {number} capacity - Capacity for pullman tickets
 * @returns {string} - Formatted location
 */
export function formatSeatLocation(type, section, seatCode, capacity = 1) {
  if (type === 'pullman') {
    return `Pullman x ${capacity}`;
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
