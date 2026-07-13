-- Migration 032: Create muestras2026_inscripciones table
-- Registra inscripciones de instituciones al sorteo de fechas Muestras Fin de Año 2026

CREATE TABLE IF NOT EXISTS `muestras2026_inscripciones` (
  `id`              INT            NOT NULL AUTO_INCREMENT,
  `nombre_apellido` VARCHAR(255)   NOT NULL,
  `institucion`     VARCHAR(255)   NOT NULL,
  `localidad`       VARCHAR(255)   NOT NULL,
  `email`           VARCHAR(255)   NOT NULL,
  `telefono`        VARCHAR(50)    NOT NULL,
  `email_enviado`   TINYINT(1)     NOT NULL DEFAULT 0,
  `created_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_email` (`email`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
