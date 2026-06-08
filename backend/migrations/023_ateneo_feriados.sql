-- Tabla de feriados/días libres para el Ateneo
CREATE TABLE IF NOT EXISTS newTEP.ateneo_feriados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  creado_por CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE newTEP.ateneo_feriados
    ADD CONSTRAINT fk_feriados_creado FOREIGN KEY (creado_por) REFERENCES newTEP.users(id) ON DELETE SET NULL;
