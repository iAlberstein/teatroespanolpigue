-- Agregar campo DNI a la tabla users
-- Fecha: 2025-11-10

ALTER TABLE users 
ADD COLUMN dni VARCHAR(255) UNIQUE DEFAULT NULL 
AFTER phone;

-- Índice para búsquedas rápidas por DNI
CREATE INDEX idx_users_dni ON users(dni);
