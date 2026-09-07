-- Migración 037: Restricción de cupones a Platea Baja con rango de filas
-- Permite que un cupón sea válido únicamente para butacas de platea baja
-- dentro de un rango de filas (A-M). Opcional por cupón.

ALTER TABLE discounts
  ADD COLUMN platea_baja_only TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN row_start CHAR(1) NULL,
  ADD COLUMN row_end CHAR(1) NULL;
