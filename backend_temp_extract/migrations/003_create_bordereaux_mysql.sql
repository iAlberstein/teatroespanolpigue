-- Migración para crear la tabla bordereaux en MySQL
-- Ejecutar en MySQL Workbench

CREATE TABLE IF NOT EXISTS bordereaux (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  show_id VARCHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'provisional',
  closed_at DATETIME NULL,
  closed_by VARCHAR(36) NULL,
  deductions_a JSON NOT NULL DEFAULT (JSON_ARRAY(
    JSON_OBJECT('name', 'Argentores', 'percentage', 0, 'description', 'del Bruto'),
    JSON_OBJECT('name', 'SADAIC', 'percentage', 0, 'description', 'del Bruto')
  )),
  contract_theater_percentage DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  contract_user_percentage DECIMAL(5,2) NOT NULL DEFAULT 80.00,
  deductions_b JSON NOT NULL DEFAULT (JSON_ARRAY()),
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE,
  FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para mejorar el rendimiento
CREATE INDEX idx_bordereaux_show_id ON bordereaux(show_id);
CREATE INDEX idx_bordereaux_status ON bordereaux(status);
CREATE INDEX idx_bordereaux_closed_at ON bordereaux(closed_at);
