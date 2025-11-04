-- Fix qr_code column to support large base64 images
-- The QR codes are ~1400+ characters as base64 data URLs

ALTER TABLE tickets 
  MODIFY COLUMN qr_code TEXT NULL;

SELECT 'Column qr_code updated to TEXT successfully!' AS status;
