-- Crear tabla para suscriptores del newsletter
-- Ejecutar en produccion: mysql -u usuario -p base_de_datos < 014_create_newsletter_subscribers.sql

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT TRUE,
    INDEX idx_email (email),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ejemplo de consultas utiles:
-- Ver todos los suscriptores activos: SELECT * FROM newsletter_subscribers WHERE active = TRUE ORDER BY created_at DESC;
-- Desactivar suscriptor: UPDATE newsletter_subscribers SET active = FALSE WHERE email = 'email@example.com';
-- Contar suscriptores: SELECT COUNT(*) FROM newsletter_subscribers WHERE active = TRUE;
