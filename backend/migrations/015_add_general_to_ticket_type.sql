-- Add 'general' to ticket type ENUM
ALTER TABLE tickets 
MODIFY COLUMN type ENUM('butaca', 'palco', 'pullman', 'general') NOT NULL;
