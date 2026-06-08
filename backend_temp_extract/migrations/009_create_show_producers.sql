-- Migration: Create show_producers table (many-to-many relationship)
-- Date: 2025-11-11
-- Description: Tabla de relación entre shows y usuarios con rol productor

CREATE TABLE IF NOT EXISTS show_producers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  show_id VARCHAR(36) NOT NULL,
  producer_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE,
  FOREIGN KEY (producer_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_show_producer (show_id, producer_id),
  INDEX idx_show_producers_show (show_id),
  INDEX idx_show_producers_producer (producer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
