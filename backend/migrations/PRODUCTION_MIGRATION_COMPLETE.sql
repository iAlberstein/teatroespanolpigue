-- ============================================================================
-- MIGRACIÓN COMPLETA PARA PRODUCCIÓN - Teatro Español Pigüé
-- ============================================================================
-- Esta migración incluye TODOS los cambios necesarios para el sistema completo
-- Incluye: Salas sin numerar, Guest checkout, Variantes de imágenes
-- ============================================================================

-- 1. AGREGAR CAMPOS DE TIPO DE SALA Y CAPACIDAD A SHOWS
-- ============================================================================
ALTER TABLE shows 
ADD COLUMN IF NOT EXISTS venue_type ENUM('sala_principal', 'el_tablado', 'las_gemelas') 
NOT NULL DEFAULT 'sala_principal'
COMMENT 'Tipo de sala: sala_principal (asientos numerados), el_tablado o las_gemelas (entradas generales)';

ALTER TABLE shows 
ADD COLUMN IF NOT EXISTS general_capacity INT NULL
COMMENT 'Capacidad total para salas con entradas generales (el_tablado, las_gemelas). NULL para sala_principal.';

CREATE INDEX IF NOT EXISTS idx_shows_venue_type ON shows(venue_type);

-- 2. AGREGAR VARIANTES DE IMÁGENES A SHOWS
-- ============================================================================
ALTER TABLE shows
ADD COLUMN IF NOT EXISTS image_principal_web VARCHAR(255) NULL AFTER image_url,
ADD COLUMN IF NOT EXISTS image_secundaria_web VARCHAR(255) NULL AFTER image_principal_web,
ADD COLUMN IF NOT EXISTS image_principal_mobile VARCHAR(255) NULL AFTER image_secundaria_web;

-- 3. AGREGAR SALE_ID A RESERVATIONS
-- ============================================================================
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS sale_id CHAR(36) NULL AFTER user_id;

CREATE INDEX IF NOT EXISTS idx_reservations_sale_id ON reservations(sale_id);

-- 4. AGREGAR TIPO 'GENERAL' A TICKETS
-- ============================================================================
ALTER TABLE tickets 
MODIFY COLUMN type ENUM('butaca', 'palco', 'pullman', 'general') NOT NULL
COMMENT 'Tipo de entrada: butaca (asiento numerado), palco (box), pullman (sin asiento sala principal), general (entrada general el_tablado/las_gemelas)';

-- 5. AGREGAR DNI A USERS (GUEST CHECKOUT)
-- ============================================================================
-- Verificar si la columna dni existe antes de agregarla
SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'dni';

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname) > 0,
  "SELECT 'Column dni already exists' AS msg",
  "ALTER TABLE users ADD COLUMN dni VARCHAR(255) UNIQUE DEFAULT NULL AFTER phone"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Crear índice en DNI si no existe
SET @indexname = 'idx_users_dni';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND INDEX_NAME=@indexname) > 0,
  "SELECT 'Index idx_users_dni already exists' AS msg",
  "CREATE INDEX idx_users_dni ON users(dni)"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 6. AGREGAR CAMPOS DE UBICACIÓN A USERS (GUEST CHECKOUT)
-- ============================================================================
SET @columnname1 = 'provincia';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname1) > 0,
  "SELECT 'Column provincia already exists' AS msg",
  "ALTER TABLE users ADD COLUMN provincia VARCHAR(255) NULL AFTER dni"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname2 = 'localidad';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname2) > 0,
  "SELECT 'Column localidad already exists' AS msg",
  "ALTER TABLE users ADD COLUMN localidad VARCHAR(255) NULL AFTER provincia"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 7. AGREGAR CAMPOS DE UBICACIÓN A SALES (GUEST CHECKOUT)
-- ============================================================================
SET @tablename = 'sales';
SET @columnname1 = 'customer_provincia';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname1) > 0,
  "SELECT 'Column customer_provincia already exists' AS msg",
  "ALTER TABLE sales ADD COLUMN customer_provincia VARCHAR(255) NULL AFTER customer_dni"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname2 = 'customer_localidad';
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME=@tablename AND COLUMN_NAME=@columnname2) > 0,
  "SELECT 'Column customer_localidad already exists' AS msg",
  "ALTER TABLE sales ADD COLUMN customer_localidad VARCHAR(255) NULL AFTER customer_provincia"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================================
SELECT 'Migración completada exitosamente' AS status;

-- Para verificar manualmente, ejecutar:
-- SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'shows' AND COLUMN_NAME IN ('venue_type', 'general_capacity', 'image_principal_web', 'image_secundaria_web', 'image_principal_mobile');
-- SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME IN ('dni', 'provincia', 'localidad');
-- SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales' AND COLUMN_NAME IN ('customer_provincia', 'customer_localidad');
-- SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tickets' AND COLUMN_NAME = 'type';
-- SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'reservations' AND COLUMN_NAME = 'sale_id';

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
-- 1. Esta migración es IDEMPOTENTE: puede ejecutarse múltiples veces sin errores
-- 2. Usa IF NOT EXISTS y verificaciones condicionales para evitar errores
-- 3. Todos los valores por defecto están configurados correctamente
-- 4. Los índices se crean automáticamente si no existen
-- ============================================================================
