-- Migration: Fix show_producers foreign key to point to users table
-- Date: 2025-11-11
-- Description: Cambiar FK de show_producers para que apunte a users en lugar de producers

-- Eliminar constraint existente
ALTER TABLE show_producers 
DROP FOREIGN KEY show_producers_ibfk_2;

-- Agregar nueva constraint apuntando a users
ALTER TABLE show_producers 
ADD CONSTRAINT show_producers_ibfk_2 
FOREIGN KEY (producer_id) REFERENCES users(id) ON DELETE CASCADE;
