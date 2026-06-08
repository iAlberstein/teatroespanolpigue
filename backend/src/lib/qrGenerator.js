import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * Generate container QR code for a sale
 * @param {string} saleId - Sale UUID
 * @param {Array} items - Items array with type, seat_code, quantity
 * @returns {Promise<{qr_code: string, qr_data: string, total_capacity: number}>}
 */
export async function generateContainerQR(saleId, items) {
  // Calculate total capacity considering palco capacities
  let totalCapacity = 0;
  
  items.forEach(item => {
    if (item.type === 'butaca') {
      totalCapacity += 1;
    } else if (item.type === 'palco') {
      // Palcos Bajos (PB) = 4 personas, Palcos Altos (PA) = 2 personas
      const isPB = item.seat_code && /^PB/i.test(item.seat_code);
      totalCapacity += isPB ? 4 : 2;
    } else if (item.type === 'pullman') {
      totalCapacity += item.quantity || 1;
    }
  });

  // Generate unique QR data for container
  const random = crypto.randomBytes(4).toString('hex');
  const qrData = `CONTAINER:${saleId}:${random}`;
  
  // Generate QR code image as base64
  const qrCode = await QRCode.toDataURL(qrData, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 300,
    margin: 2
  });

  return {
    qr_code: qrCode,
    qr_data: qrData,
    total_capacity: totalCapacity
  };
}

/**
 * Generate individual QR code for a ticket
 * @param {string} ticketId - Ticket UUID
 * @param {string} seatCode - Seat code or identifier
 * @param {string} type - Ticket type
 * @returns {Promise<{qr_code: string, qr_data: string}>}
 */
export async function generateIndividualQR(ticketId, seatCode, type) {
  const random = crypto.randomBytes(3).toString('hex');
  const qrData = `TICKET:${ticketId}:${random}`;
  
  const qrCode = await QRCode.toDataURL(qrData, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 250,
    margin: 2
  });

  return {
    qr_code: qrCode,
    qr_data: qrData
  };
}

export default { generateContainerQR, generateIndividualQR };
