export const countSeatUnits = (items = []) => {
  if (!Array.isArray(items)) return 0;

  return items.reduce((total, item) => {
    if (!item || typeof item !== 'object') return total;

    const type = (item.type || '').toLowerCase();
    switch (type) {
      case 'butaca':
        return total + 1;
      case 'palco': {
        if (item.quantity && Number(item.quantity) > 0) {
          return total + Number(item.quantity);
        }
        const seatCode = String(item.seat_code || '');
        if (/^pb/i.test(seatCode)) {
          return total + 4;
        }
        if (/^pa/i.test(seatCode)) {
          return total + 2;
        }
        // Default to 4 seats for palcos when label is unknown
        return total + 4;
      }
      case 'pullman':
      case 'general': {
        const quantity = Number(item.quantity) || 1;
        return total + Math.max(0, quantity);
      }
      default: {
        // Fallback: if quantity specified, use it, otherwise assume 1
        if (item.quantity && Number(item.quantity) > 0) {
          return total + Number(item.quantity);
        }
        return total + 1;
      }
    }
  }, 0);
};
