-- Migration: Create seat_pricing table for location-based pricing
-- Allows defining special prices for specific seats, rows, or row ranges

CREATE TABLE IF NOT EXISTS seat_pricing (
  id INT AUTO_INCREMENT PRIMARY KEY,
  show_id CHAR(36) NULL,
  session_id CHAR(36) NULL,
  seat_code VARCHAR(20) NULL,
  row_letter CHAR(1) NULL,
  row_from CHAR(1) NULL,
  row_to CHAR(1) NULL,
  palco_numbers VARCHAR(255) NULL,
  palco_from INT NULL,
  palco_to INT NULL,
  is_palco_alto BOOLEAN DEFAULT FALSE,
  price DECIMAL(10,2) NOT NULL,
  priority INT DEFAULT 0,
  label VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- At least one of show_id or session_id must be set
  CONSTRAINT chk_show_or_session CHECK (show_id IS NOT NULL OR session_id IS NOT NULL),
  
  -- Price must be positive
  CONSTRAINT chk_positive_price CHECK (price > 0),
  
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for quick lookups by show
CREATE INDEX idx_seat_pricing_show ON seat_pricing(show_id);

-- Index for quick lookups by session
CREATE INDEX idx_seat_pricing_session ON seat_pricing(session_id);

-- Index for seat code lookups
CREATE INDEX idx_seat_pricing_seat ON seat_pricing(seat_code);

-- Index for row lookups
CREATE INDEX idx_seat_pricing_row ON seat_pricing(row_letter);
