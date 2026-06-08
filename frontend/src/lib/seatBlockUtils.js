import matrix from '../components/SalaPrincipalMatrix.js';

// Extract all unique PB (Palcos Bajos) codes from matrix
function extractPBCodes() {
  const codes = new Set();
  matrix.forEach(row => {
    row.forEach(cell => {
      if (cell.startsWith('PB ')) codes.add(cell);
    });
  });
  return [...codes].sort((a, b) => {
    const na = parseInt(a.replace('PB ', ''));
    const nb = parseInt(b.replace('PB ', ''));
    return na - nb;
  });
}

// Extract all unique PA (Palcos Altos) codes from matrix
function extractPACodes() {
  const codes = new Set();
  matrix.forEach(row => {
    row.forEach(cell => {
      if (cell.startsWith('PA ')) codes.add(cell);
    });
  });
  return [...codes].sort((a, b) => {
    const na = parseInt(a.replace('PA ', ''));
    const nb = parseInt(b.replace('PA ', ''));
    return na - nb;
  });
}

// Get platea seat codes from a specific column range
function getPlateaSeatsInRange(colStart, colEnd) {
  const rows = 'ABCDEFGHIJKLM';
  const seats = [];
  matrix.forEach(row => {
    let rowLetter = null;
    // Find row letter in this row
    for (const cell of row) {
      if (cell.length === 1 && rows.includes(cell)) {
        rowLetter = cell;
        break;
      }
    }
    if (!rowLetter) return;
    
    for (let c = colStart; c <= colEnd && c < row.length; c++) {
      const cell = row[c];
      if (cell && !isNaN(cell) && !cell.startsWith('PB') && !cell.startsWith('PA') && cell !== 'XX' && cell !== 'ESC' && cell !== 'PULL' && !cell.startsWith('STEP') && cell.length <= 2) {
        seats.push(`${rowLetter}${cell}`);
      }
    }
  });
  return seats;
}

// PB Izquierda = left section platea seats (columns 7-13)
export function getPBIzquierdaSeats() {
  return getPlateaSeatsInRange(7, 13);
}

// PB Centro = center section platea seats (columns 14-23)  
export function getPBCentroSeats() {
  return getPlateaSeatsInRange(14, 23);
}

// PB Derecha = right section platea seats (columns 24-30)
export function getPBDerechaSeats() {
  return getPlateaSeatsInRange(24, 30);
}

// Get all Palcos Bajos codes
export function getPalcosBajos() {
  return extractPBCodes();
}

// Get all Palcos Altos codes
export function getPalcosAltos() {
  return extractPACodes();
}

// Filter available seats (remove sold and blocked)
export function filterAvailableSeats(seats, soldSet, blockedSet) {
  return seats.filter(code => {
    const sold = soldSet instanceof Set ? soldSet : new Set(soldSet || []);
    const blocked = blockedSet instanceof Set ? blockedSet : new Set(blockedSet || []);
    return !sold.has(code) && !blocked.has(code);
  });
}

// Filter available palcos (remove sold and blocked)
export function filterAvailablePalcos(palcos, soldSet, blockedSet) {
  return palcos.filter(code => {
    const sold = soldSet instanceof Set ? soldSet : new Set(soldSet || []);
    const blocked = blockedSet instanceof Set ? blockedSet : new Set(blockedSet || []);
    return !sold.has(code) && !blocked.has(code);
  });
}

// Filter to get only blocked seats
export function filterBlockedSeats(seats, blockedSet) {
  const blocked = blockedSet instanceof Set ? blockedSet : new Set(blockedSet || []);
  return seats.filter(code => blocked.has(code));
}

// Filter to get only blocked palcos
export function filterBlockedPalcos(palcos, blockedSet) {
  const blocked = blockedSet instanceof Set ? blockedSet : new Set(blockedSet || []);
  return palcos.filter(code => blocked.has(code));
}

// Get all row letters present in the matrix
export function getAllRows() {
  const rows = 'ABCDEFGHIJKLM';
  const found = new Set();
  matrix.forEach(row => {
    row.forEach(cell => {
      if (cell.length === 1 && rows.includes(cell)) {
        found.add(cell);
      }
    });
  });
  return [...found].sort();
}

// Get all seat codes for a specific row
export function getRowSeats(rowLetter) {
  const seats = [];
  matrix.forEach(row => {
    // Check if this matrix row contains the target letter
    let hasLetter = false;
    for (const cell of row) {
      if (cell === rowLetter) { hasLetter = true; break; }
    }
    if (!hasLetter) return;
    
    for (const cell of row) {
      if (cell && !isNaN(cell) && cell !== 'XX' && !cell.startsWith('PB') && !cell.startsWith('PA') && cell !== 'ESC' && cell !== 'PULL' && !cell.startsWith('STEP') && cell.length <= 2) {
        seats.push(`${rowLetter}${cell}`);
      }
    }
  });
  return seats;
}
