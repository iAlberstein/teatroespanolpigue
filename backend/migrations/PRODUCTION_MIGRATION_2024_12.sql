-- ============================================================================
-- MIGRACIÓN CONSOLIDADA PARA PRODUCCIÓN - Diciembre 2024
-- ============================================================================
-- Esta migración incluye todos los cambios necesarios para el sistema de
-- entradas generales (El Tablado / Las Gemelas) y mejoras al sistema de ventas
-- ============================================================================

-- 1. AGREGAR CAMPOS DE TIPO DE SALA Y CAPACIDAD A SHOWS
-- ============================================================================
-- Permite definir si un show es en sala principal (asientos numerados) o
-- en salas de entrada general (el_tablado, las_gemelas)

ALTER TABLE shows 
ADD COLUMN IF NOT EXISTS venue_type ENUM('sala_principal', 'el_tablado', 'las_gemelas') 
NOT NULL DEFAULT 'sala_principal'
COMMENT 'Tipo de sala: sala_principal (asientos numerados), el_tablado o las_gemelas (entradas generales)';

ALTER TABLE shows 
ADD COLUMN IF NOT EXISTS general_capacity INT NULL
COMMENT 'Capacidad total para salas con entradas generales (el_tablado, las_gemelas). NULL para sala_principal.';

-- Índice para mejorar consultas por tipo de sala
CREATE INDEX IF NOT EXISTS idx_shows_venue_type ON shows(venue_type);


-- 2. AGREGAR SALE_ID A RESERVATIONS
-- ============================================================================
-- Permite vincular reservas con ventas para mejor trazabilidad

ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS sale_id CHAR(36) NULL AFTER user_id;

CREATE INDEX IF NOT EXISTS idx_reservations_sale_id ON reservations(sale_id);


-- 3. AGREGAR TIPO 'GENERAL' A TICKETS
-- ============================================================================
-- Permite crear tickets de entrada general para salas sin asientos numerados

-- Verificar si el tipo 'general' ya existe en el ENUM
-- Si no existe, modificar la columna para agregarlo
ALTER TABLE tickets 
MODIFY COLUMN type ENUM('butaca', 'palco', 'pullman', 'general') NOT NULL
COMMENT 'Tipo de entrada: butaca (asiento numerado), palco (box), pullman (sin asiento sala principal), general (entrada general el_tablado/las_gemelas)';


-- ============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- ============================================================================
-- Ejecutar estas consultas para verificar que la migración fue exitosa:

-- SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 'shows' 
-- AND COLUMN_NAME IN ('venue_type', 'general_capacity');

-- SELECT COLUMN_NAME, COLUMN_TYPE 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 'reservations' 
-- AND COLUMN_NAME = 'sale_id';

-- SELECT COLUMN_NAME, COLUMN_TYPE 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 'tickets' 
-- AND COLUMN_NAME = 'type';

-- ============================================================================
-- NOTAS IMPORTANTES
-- ============================================================================
-- 1. Esta migración es IDEMPOTENTE: puede ejecutarse múltiples veces sin errores
-- 2. Usa IF NOT EXISTS para evitar errores si las columnas ya existen
-- 3. Los shows existentes se marcarán como 'sala_principal' por defecto
-- 4. Las reservas existentes tendrán sale_id NULL (normal para reservas antiguas)
-- 5. Los tickets existentes mantendrán sus tipos actuales (butaca, palco, pullman)
-- ============================================================================
