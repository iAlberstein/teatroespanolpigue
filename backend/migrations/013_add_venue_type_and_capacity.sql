-- Add venue type and general capacity to shows table

-- Add venue_type column with enum
ALTER TABLE shows 
ADD COLUMN venue_type ENUM('sala_principal', 'el_tablado', 'las_gemelas') 
NOT NULL DEFAULT 'sala_principal'
COMMENT 'Tipo de sala: sala_principal (asientos numerados), el_tablado o las_gemelas (entradas generales)';

-- Add general_capacity column for general admission venues
ALTER TABLE shows 
ADD COLUMN general_capacity INT NULL
COMMENT 'Capacidad total para salas con entradas generales (el_tablado, las_gemelas). NULL para sala_principal.';

-- Add index for venue_type for faster filtering
CREATE INDEX idx_shows_venue_type ON shows(venue_type);
