-- Migration: Add color column to seat_pricing table
-- Allows defining custom colors for pricing rules

ALTER TABLE seat_pricing 
ADD COLUMN color VARCHAR(7) NULL COMMENT 'Hex color code (e.g., #10b981) for visual identification';
