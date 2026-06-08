-- Migración: Actualizar modelo de shows para nueva arquitectura
-- Ejecutar en MySQL Workbench o desde la terminal

USE tep;

-- Hacer campos legacy opcionales
ALTER TABLE `shows` 
  MODIFY COLUMN `sala` VARCHAR(255) NULL,
  MODIFY COLUMN `date` DATE NULL,
  MODIFY COLUMN `time` VARCHAR(255) NULL;

-- Agregar nuevos campos si no existen
ALTER TABLE `shows` 
  ADD COLUMN IF NOT EXISTS `description` TEXT NULL AFTER `title`,
  ADD COLUMN IF NOT EXISTS `duration_minutes` INT NOT NULL DEFAULT 120 AFTER `description`,
  ADD COLUMN IF NOT EXISTS `image_url` VARCHAR(255) NULL AFTER `duration_minutes`;

-- Actualizar pricing_json para permitir NULL con default
ALTER TABLE `shows` 
  MODIFY COLUMN `pricing_json` JSON NULL DEFAULT (JSON_OBJECT());

-- Verificar la estructura
DESCRIBE `shows`;

SELECT 'Migración completada exitosamente!' AS status;
