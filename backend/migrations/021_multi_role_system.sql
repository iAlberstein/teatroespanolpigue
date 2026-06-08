-- =====================================================
-- MIGRACIÓN 021: Sistema Multi-Rol (MySQL/MariaDB)
-- Permite que un usuario tenga múltiples roles
-- =====================================================

-- 0. Limpiar tablas existentes (ejecutar si hay errores de estado inconsistente)
-- DESCOMENTAR solo si necesario:
-- DROP TABLE IF EXISTS newTEP.user_roles;
-- DROP TABLE IF EXISTS newTEP.roles;

-- 1. Crear tabla de roles
CREATE TABLE IF NOT EXISTS newTEP.roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  modulo VARCHAR(50) NOT NULL DEFAULT 'global',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_modulo (modulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Insertar roles predefinidos (INSERT IGNORE ignora duplicados)
INSERT IGNORE INTO newTEP.roles (nombre, descripcion, modulo) VALUES
  ('admin', 'Administrador global con acceso total', 'global'),
  ('boleteria', 'Operador de boletería para venta de entradas', 'teatro'),
  ('productor', 'Productor de espectáculos', 'teatro'),
  ('espectador', 'Usuario que compra entradas', 'teatro'),
  ('premium', 'Espectador con beneficios especiales', 'teatro'),
  ('admin_ateneo', 'Administrador del módulo Ateneo (gestión académica)', 'ateneo'),
  ('docente_ateneo', 'Docente del Ateneo (ver clases, cargar asistencia)', 'ateneo'),
  ('alumno_ateneo', 'Alumno inscripto en el Ateneo', 'ateneo');

-- 3. Crear tabla de relación usuario-roles
CREATE TABLE IF NOT EXISTS newTEP.user_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  role_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_role (user_id, role_id),
  INDEX idx_user_id (user_id),
  INDEX idx_role_id (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Eliminar constraint si existía por ejecuciones previas
ALTER TABLE newTEP.user_roles
  DROP FOREIGN KEY IF EXISTS fk_user_roles_role;

ALTER TABLE newTEP.user_roles
  ADD CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES newTEP.roles(id) ON DELETE CASCADE;

-- 5. Agregar FK a users (separado para debug)
ALTER TABLE newTEP.user_roles
  DROP FOREIGN KEY IF EXISTS fk_user_roles_user;

ALTER TABLE newTEP.user_roles
  ADD CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES newTEP.users(id) ON DELETE CASCADE;

-- 5. Migrar roles existentes de la columna users.role a user_roles
-- Esto preserva los roles actuales de cada usuario
INSERT IGNORE INTO newTEP.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM newTEP.users u
JOIN newTEP.roles r ON r.nombre COLLATE utf8mb4_general_ci = u.role COLLATE utf8mb4_general_ci
WHERE u.role IS NOT NULL;

-- 6. Agregar rol 'espectador' a todos los usuarios que no lo tienen
-- (para que todos puedan comprar entradas por defecto)
INSERT IGNORE INTO newTEP.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM newTEP.users u
CROSS JOIN newTEP.roles r
WHERE r.nombre COLLATE utf8mb4_general_ci = 'espectador'
  AND NOT EXISTS (
    SELECT 1 FROM newTEP.user_roles ur 
    WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

-- NOTA: El campo users.role se mantiene por compatibilidad temporal
-- pero será deprecado. El sistema usará user_roles para todas las
-- verificaciones de permisos.

-- 7. Vista útil para consultar roles de usuario (sintaxis MySQL)
CREATE OR REPLACE VIEW newTEP.v_user_roles AS
SELECT 
  u.id as user_id,
  u.name,
  u.email,
  GROUP_CONCAT(r.nombre ORDER BY r.nombre SEPARATOR ', ') as roles,
  GROUP_CONCAT(DISTINCT r.modulo ORDER BY r.modulo SEPARATOR ', ') as modulos
FROM newTEP.users u
LEFT JOIN newTEP.user_roles ur ON u.id = ur.user_id
LEFT JOIN newTEP.roles r ON ur.role_id = r.id
GROUP BY u.id, u.name, u.email;

-- NOTA: Las funciones helper (user_has_role, user_has_any_role) 
-- se manejan en el backend con Sequelize, no en MySQL.
