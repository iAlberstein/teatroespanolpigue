-- Migration: Add location fields to users and sales tables
-- Date: 2024-12-06
-- Description: Add provincia and localidad fields for guest checkout functionality

-- Add location fields to users table
-- Check if columns exist before adding
SET @dbname = DATABASE();
SET @tablename = "users";
SET @columnname1 = "provincia";
SET @columnname2 = "localidad";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname1) > 0,
  "SELECT 'Column provincia already exists' AS msg",
  "ALTER TABLE users ADD COLUMN provincia VARCHAR(255) NULL AFTER dni"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname2) > 0,
  "SELECT 'Column localidad already exists' AS msg",
  "ALTER TABLE users ADD COLUMN localidad VARCHAR(255) NULL AFTER provincia"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add location fields to sales table
SET @tablename = "sales";
SET @columnname1 = "customer_provincia";
SET @columnname2 = "customer_localidad";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname1) > 0,
  "SELECT 'Column customer_provincia already exists' AS msg",
  "ALTER TABLE sales ADD COLUMN customer_provincia VARCHAR(255) NULL AFTER customer_dni"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname2) > 0,
  "SELECT 'Column customer_localidad already exists' AS msg",
  "ALTER TABLE sales ADD COLUMN customer_localidad VARCHAR(255) NULL AFTER customer_provincia"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add index on dni for faster lookups (only if it doesn't exist)
SET @tablename = "users";
SET @indexname = "idx_users_dni";
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND INDEX_NAME=@indexname) > 0,
  "SELECT 'Index idx_users_dni already exists' AS msg",
  "CREATE INDEX idx_users_dni ON users(dni)"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Verify changes
SELECT 'Migration completed successfully' AS status;
