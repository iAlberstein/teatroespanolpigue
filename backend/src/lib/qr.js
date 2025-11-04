import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * Generate a unique QR code for a ticket
 * @param {Object} ticket - Ticket object with id, session_id, user_id, type, seat_code
 * @returns {Promise<{qr_code: string, qr_data: string}>}
 */
export async function generateTicketQR(ticket) {
  // Create unique QR data with ticket info + random salt
  const salt = crypto.randomBytes(16).toString('hex');
  const qrData = JSON.stringify({
    ticket_id: ticket.id,
    session_id: ticket.session_id,
    user_id: ticket.user_id,
    type: ticket.type,
    seat_code: ticket.seat_code,
    salt,
    timestamp: new Date().toISOString()
  });

  // Generate QR code as base64 data URL
  const qrCodeDataURL = await QRCode.toDataURL(qrData, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    quality: 0.95,
    margin: 1,
    width: 300
  });

  return {
    qr_code: qrCodeDataURL, // base64 image for display
    qr_data: qrData // JSON string for validation
  };
}

/**
 * Validate QR data against a ticket
 * @param {string} scannedData - Raw QR data scanned
 * @param {Object} ticket - Ticket from database
 * @returns {boolean}
 */
export function validateQRData(scannedData, ticket) {
  try {
    const parsed = JSON.parse(scannedData);
    
    // Check all critical fields match
    return (
      parsed.ticket_id === ticket.id &&
      parsed.session_id === ticket.session_id &&
      parsed.user_id === ticket.user_id &&
      parsed.type === ticket.type &&
      parsed.seat_code === ticket.seat_code
    );
  } catch (error) {
    return false;
  }
}
