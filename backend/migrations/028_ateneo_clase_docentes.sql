-- Many-to-many relationship: clases <-> docentes
CREATE TABLE IF NOT EXISTS ateneo_clase_docentes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clase_id INT NOT NULL,
  docente_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (clase_id) REFERENCES ateneo_clases(id) ON DELETE CASCADE,
  FOREIGN KEY (docente_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_clase_docente (clase_id, docente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Migrate existing docente_id data to the new join table
INSERT IGNORE INTO ateneo_clase_docentes (clase_id, docente_id)
SELECT id, docente_id FROM ateneo_clases WHERE docente_id IS NOT NULL;
