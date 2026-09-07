-- Migración 038: Agregar columna clasificacion a shows
-- Permite almacenar la clasificación del espectáculo (ej: ATP, SAM 13, SAM 16, SAM 18)

ALTER TABLE shows
  ADD COLUMN clasificacion VARCHAR(20) NULL;
