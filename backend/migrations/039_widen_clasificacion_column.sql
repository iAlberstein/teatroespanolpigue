-- Migración 039: Ampliar columna clasificacion a VARCHAR(100)
-- La clasificacion ahora es un input de texto libre, no un select con opciones fijas

ALTER TABLE shows
  MODIFY COLUMN clasificacion VARCHAR(100) NULL;
