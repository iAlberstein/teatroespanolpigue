-- ============================================================================
-- SISTEMA DE APORTES SOLIDARIOS - BONO CONTRIBUCIÓN $5.000
-- ============================================================================
-- Ejecutar en producción: mysql -u usuario -p base_de_datos < 031_create_aportes_system.sql

-- Tabla principal de aportes (cada bono comprado genera un registro)
CREATE TABLE IF NOT EXISTS aportes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_aporte INT NOT NULL UNIQUE,
    dni VARCHAR(15) NOT NULL,
    email VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    apellido VARCHAR(255) NOT NULL,
    telefono VARCHAR(30) NOT NULL,
    provincia VARCHAR(100) NOT NULL,
    localidad VARCHAR(100) NOT NULL,
    monto DECIMAL(10,2) NOT NULL DEFAULT 5000.00,
    payment_method ENUM('mercadopago', 'transferencia', 'efectivo') NOT NULL DEFAULT 'mercadopago',
    payment_status ENUM('pending', 'approved', 'rejected', 'refunded') NOT NULL DEFAULT 'pending',
    mp_order_id VARCHAR(255) NULL,
    mp_payment_id VARCHAR(255) NULL,
    transfer_receipt_url VARCHAR(500) NULL,
    transfer_receipt_verified BOOLEAN DEFAULT FALSE,
    transfer_receipt_verified_at DATETIME NULL,
    transfer_receipt_verified_by VARCHAR(255) NULL,
    referido_dni VARCHAR(15) NULL,
    referido_bonus_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_dni (dni),
    INDEX idx_email (email),
    INDEX idx_numero_aporte (numero_aporte),
    INDEX idx_referido_dni (referido_dni),
    INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de referidos (registro de quién refirió a quién)
CREATE TABLE IF NOT EXISTS aportes_referidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    aportante_dni VARCHAR(15) NOT NULL,
    referido_dni VARCHAR(15) NOT NULL,
    aporte_id INT NOT NULL,
    bonus_extra_aportes INT NOT NULL DEFAULT 1,
    notificacion_enviada BOOLEAN DEFAULT FALSE,
    notificacion_enviada_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_referido_por_aporte (aporte_id, referido_dni),
    INDEX idx_aportante (aportante_dni),
    INDEX idx_referido (referido_dni),
    FOREIGN KEY (aporte_id) REFERENCES aportes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de bonos extra otorgados por referidos
CREATE TABLE IF NOT EXISTS aportes_bonus (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dni VARCHAR(15) NOT NULL,
    tipo ENUM('referido_otorga', 'referido_recibe') NOT NULL,
    aporte_id INT NOT NULL,
    referido_id INT NULL,
    cantidad INT NOT NULL DEFAULT 1,
    utilizados INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dni (dni),
    INDEX idx_tipo (tipo),
    FOREIGN KEY (aporte_id) REFERENCES aportes(id) ON DELETE CASCADE,
    FOREIGN KEY (referido_id) REFERENCES aportes_referidos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de configuración del sistema de aportes
CREATE TABLE IF NOT EXISTS aportes_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT NOT NULL,
    descripcion TEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar configuración por defecto
INSERT INTO aportes_config (clave, valor, descripcion) VALUES
('monto_aporte', '5000', 'Monto del bono de aporte solidario en pesos argentinos'),
('bonus_por_referido', '1', 'Cantidad de aportes extra que recibe quien refiere'),
('bonus_al_referido', '1', 'Cantidad de aportes extra que recibe quien usa un código de referido'),
('min_aportes_para_descuento', '4', 'Cantidad mínima de aportes para obtener un descuento extra en compras'),
('aportes_descuento_extra', '5', 'Cuántos tickets valen cuando se juntan los aportes mínimos (ej: 4 aportes = 5 tickets)'),
('estado_sistema', 'activo', 'Estado del sistema: activo, pausado, cerrado'),
('fecha_cierre_sorteo', NULL, 'Fecha de cierre del sorteo final (formato YYYY-MM-DD)')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);

-- ============================================================================
-- VISTAS ÚTILES PARA ADMINISTRACIÓN
-- ============================================================================

-- Vista de resumen por aportante
CREATE OR REPLACE VIEW v_aportantes_resumen AS
SELECT 
    a.dni,
    a.email,
    CONCAT(a.nombre, ' ', a.apellido) AS nombre_completo,
    a.telefono,
    a.provincia,
    a.localidad,
    COUNT(DISTINCT a2.id) AS total_aportes,
    SUM(CASE WHEN a2.payment_status = 'approved' THEN a2.monto ELSE 0 END) AS total_aportado,
    COUNT(DISTINCT ar.id) AS referidos_realizados,
    COUNT(DISTINCT ab.id) AS bonus_extra_recibidos,
    COALESCE(SUM(DISTINCT ab.cantidad), 0) AS total_bonus_recibidos,
    MAX(a2.created_at) AS ultimo_aporte
FROM aportes a
LEFT JOIN aportes a2 ON a.dni = a2.dni AND a2.payment_status = 'approved'
LEFT JOIN aportes_referidos ar ON a.dni = ar.aportante_dni
LEFT JOIN aportes_bonus ab ON a.dni = ab.dni
WHERE a.payment_status = 'approved'
GROUP BY a.dni, a.email, a.nombre, a.apellido, a.telefono, a.provincia, a.localidad;

-- Vista de todos los números de aporte activos para sorteo
CREATE OR REPLACE VIEW v_numeros_sorteo AS
SELECT 
    a.numero_aporte,
    a.dni,
    a.email,
    CONCAT(a.nombre, ' ', a.apellido) AS nombre_completo,
    a.telefono,
    a.provincia,
    a.localidad,
    a.created_at AS fecha_aporte
FROM aportes a
WHERE a.payment_status = 'approved'
ORDER BY a.numero_aporte;

-- ============================================================================
-- EJEMPLOS DE CONSULTAS ÚTILES
-- ============================================================================

-- Ver todos los aportes aprobados con sus números:
-- SELECT * FROM aportes WHERE payment_status = 'approved' ORDER BY numero_aporte;

-- Ver aportes pendientes de verificación de transferencia:
-- SELECT * FROM aportes WHERE payment_method = 'transferencia' AND transfer_receipt_verified = FALSE;

-- Ver todos los referidos de una persona:
-- SELECT * FROM aportes_referidos WHERE aportante_dni = '12345678';

-- Ver cuántos números de sorteo tiene cada persona (aportes + bonus):
-- SELECT dni, COUNT(*) AS chances_sorteo FROM v_numeros_sorteo GROUP BY dni;
