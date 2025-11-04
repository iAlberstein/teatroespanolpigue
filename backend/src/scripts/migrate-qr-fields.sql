-- Migration: Add QR and Validation fields to tickets table
-- Date: 2025-11-03

-- Add new columns to tickets table
ALTER TABLE tickets 
  ADD COLUMN qr_data TEXT NULL AFTER qr_code,
  ADD COLUMN validated_at DATETIME NULL AFTER status,
  ADD COLUMN validated_by CHAR(36) NULL AFTER validated_at;

-- Update status enum to include 'validated'
ALTER TABLE tickets 
  MODIFY COLUMN status ENUM('available','reserved','sold','validated','blocked') DEFAULT 'available';

-- Add unique constraint to qr_code if not exists
ALTER TABLE tickets 
  ADD UNIQUE KEY unique_qr_code (qr_code);

-- Create validations table
CREATE TABLE IF NOT EXISTS validations (
  id CHAR(36) PRIMARY KEY,
  ticket_id CHAR(36) NOT NULL,
  validated_by CHAR(36) NOT NULL,
  device_info JSON NULL,
  ip_address VARCHAR(45) NULL,
  validation_type ENUM('qr_scan','manual') DEFAULT 'qr_scan',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Success message
SELECT 'Migration completed successfully!' AS status;
