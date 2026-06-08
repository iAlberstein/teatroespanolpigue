-- Migration: Create seat_blocks table for admin blocking functionality
-- This allows admin to block seats without creating actual sales/tickets
-- Blocked seats appear as sold to regular users but as blocked (red) to admin

CREATE TABLE IF NOT EXISTS seat_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  seat_code VARCHAR(20) NOT NULL,
  block_type ENUM('butaca', 'palco', 'general') NOT NULL DEFAULT 'butaca',
  quantity INT NOT NULL DEFAULT 1,
  blocked_by INT NOT NULL,
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE CASCADE,
  
  -- Unique constraint: same seat can't be blocked twice for same session
  UNIQUE KEY unique_block (session_id, seat_code, block_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index for quick lookups by session
CREATE INDEX idx_seat_blocks_session ON seat_blocks(session_id);
