-- Migration: Create discounts table if not exists
-- Date: 2025-11-10
-- Description: Ensure discounts table exists with all required fields

CREATE TABLE IF NOT EXISTS discounts (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(255) NOT NULL,
  show_id VARCHAR(36) DEFAULT NULL,
  type ENUM('percentage', 'fixed', 'internal') NOT NULL,
  value DECIMAL(10,2) DEFAULT NULL,
  usage_limit INT DEFAULT 1,
  used_count INT DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  
  INDEX idx_discount_code (code),
  INDEX idx_discount_show (show_id),
  INDEX idx_discount_active (active),
  
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verify that sales table has discount_id column
-- If not, add it
SET @dbname = DATABASE();
SET @tablename = "sales";
SET @columnname = "discount_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 1",
  CONCAT("ALTER TABLE ", @tablename, " ADD ", @columnname, " VARCHAR(36) DEFAULT NULL, ADD INDEX idx_sale_discount (", @columnname, "), ADD FOREIGN KEY (", @columnname, ") REFERENCES discounts(id) ON DELETE SET NULL;")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
