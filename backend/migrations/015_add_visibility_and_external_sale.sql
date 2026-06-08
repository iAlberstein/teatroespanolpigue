-- Migration: Add visibility toggle and external sale fields to shows table
-- Date: 2026-01-16

-- Add is_visible field (default true - visible to all users)
ALTER TABLE shows ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE COMMENT 'If false, show is only visible to admin users';

-- Add external_sale field (default false - use internal sale system)
ALTER TABLE shows ADD COLUMN IF NOT EXISTS external_sale BOOLEAN DEFAULT FALSE COMMENT 'If true, redirect to external sale link instead of internal system';

-- Add external_sale_link field (URL for external sale platform)
ALTER TABLE shows ADD COLUMN IF NOT EXISTS external_sale_link VARCHAR(500) NULL COMMENT 'URL to external ticket sale platform';

-- Add index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_shows_is_visible ON shows(is_visible);
