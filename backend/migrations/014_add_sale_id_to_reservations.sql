-- Add sale_id column to reservations table
ALTER TABLE reservations 
ADD COLUMN sale_id CHAR(36) NULL AFTER user_id,
ADD INDEX idx_reservations_sale_id (sale_id);
