-- =====================================================
-- ATENEO - Sistema Académico para Artes Escénicas
-- Migración inicial: todas las tablas del módulo
-- =====================================================

-- IMPORTANTE: Ejecutar primero para verificar charset de users.id:
-- SHOW CREATE TABLE newTEP.users;
-- La columna id debe ser CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin

-- Configuración del módulo
CREATE TABLE IF NOT EXISTS newTEP.ateneo_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar configuraciones por defecto
INSERT INTO newTEP.ateneo_config (clave, valor, descripcion) VALUES
    ('cuotas_vencidas_suspension', '3', 'Cantidad de cuotas vencidas para suspender alumno'),
    ('dias_aviso_vencimiento', '5', 'Días antes del vencimiento para enviar recordatorio'),
    ('ciclo_activo', '2026', 'Ciclo lectivo activo'),
    ('dia_vencimiento_cuota', '10', 'Día del mes en que vencen las cuotas')
ON DUPLICATE KEY UPDATE clave = clave;

-- Clases / Cursos
CREATE TABLE IF NOT EXISTS newTEP.ateneo_clases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    descripcion TEXT,
    docente_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    cupo INT DEFAULT 20,
    horario VARCHAR(255),
    ubicacion VARCHAR(255),
    costo_matricula DECIMAL(10,2) NOT NULL DEFAULT 0,
    costo_cuota DECIMAL(10,2) NOT NULL DEFAULT 0,
    estado ENUM('activa', 'suspendida', 'finalizada') DEFAULT 'activa',
    ciclo VARCHAR(20) DEFAULT '2026',
    fecha_inicio DATE,
    fecha_fin DATE,
    imagen_url VARCHAR(500),
    requisitos TEXT,
    visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_estado (estado),
    INDEX idx_ciclo (ciclo),
    INDEX idx_visible (visible),
    INDEX idx_docente (docente_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agregar FK después de crear la tabla (evita errores de orden)
ALTER TABLE newTEP.ateneo_clases
    DROP FOREIGN KEY IF EXISTS fk_clases_docente;

ALTER TABLE newTEP.ateneo_clases
    ADD CONSTRAINT fk_clases_docente FOREIGN KEY (docente_id) REFERENCES newTEP.users(id) ON DELETE SET NULL;

-- Perfil extendido de alumnos
CREATE TABLE IF NOT EXISTS newTEP.ateneo_alumnos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL UNIQUE,
    dni VARCHAR(15),
    telefono VARCHAR(30),
    fecha_nacimiento DATE,
    direccion TEXT,
    contacto_emergencia VARCHAR(255),
    telefono_emergencia VARCHAR(30),
    estado_academico ENUM('pendiente', 'activo', 'deuda', 'suspendido', 'egresado') DEFAULT 'pendiente',
    estado_forzado BOOLEAN DEFAULT FALSE,
    fecha_ingreso DATE,
    observaciones_admin TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_estado_academico (estado_academico),
    INDEX idx_dni (dni)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE newTEP.ateneo_alumnos
    DROP FOREIGN KEY IF EXISTS fk_alumnos_user;

ALTER TABLE newTEP.ateneo_alumnos
    ADD CONSTRAINT fk_alumnos_user FOREIGN KEY (user_id) REFERENCES newTEP.users(id) ON DELETE CASCADE;

-- Inscripciones a clases
CREATE TABLE IF NOT EXISTS newTEP.ateneo_inscripciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumno_id INT NOT NULL,
    clase_id INT NOT NULL,
    fecha_inscripcion DATETIME DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('pendiente', 'confirmada', 'baja') DEFAULT 'pendiente',
    motivo_baja TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_alumno_clase (alumno_id, clase_id),
    INDEX idx_estado (estado),
    INDEX idx_alumno (alumno_id),
    INDEX idx_clase (clase_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE newTEP.ateneo_inscripciones
    DROP FOREIGN KEY IF EXISTS fk_inscripciones_alumno,
    DROP FOREIGN KEY IF EXISTS fk_inscripciones_clase;

ALTER TABLE newTEP.ateneo_inscripciones
    ADD CONSTRAINT fk_inscripciones_alumno FOREIGN KEY (alumno_id) REFERENCES newTEP.ateneo_alumnos(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_inscripciones_clase FOREIGN KEY (clase_id) REFERENCES newTEP.ateneo_clases(id) ON DELETE CASCADE;

-- Pagos (matrícula y cuotas)
CREATE TABLE IF NOT EXISTS newTEP.ateneo_pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumno_id INT NOT NULL,
    clase_id INT,
    inscripcion_id INT,
    tipo ENUM('matricula', 'cuota') NOT NULL,
    periodo VARCHAR(10),
    monto_original DECIMAL(10,2) NOT NULL,
    monto_final DECIMAL(10,2) NOT NULL,
    estado ENUM('pendiente', 'pagado', 'vencido') DEFAULT 'pendiente',
    fecha_vencimiento DATE,
    fecha_pago DATETIME,
    origen ENUM('pasarela', 'efectivo', 'transferencia', 'otro') DEFAULT 'pasarela',
    referencia_pasarela VARCHAR(255),
    registrado_por CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alumno_estado (alumno_id, estado),
    INDEX idx_tipo (tipo),
    INDEX idx_estado (estado),
    INDEX idx_periodo (periodo),
    INDEX idx_fecha_vencimiento (fecha_vencimiento),
    INDEX idx_registrado (registrado_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE newTEP.ateneo_pagos
    DROP FOREIGN KEY IF EXISTS fk_pagos_alumno,
    DROP FOREIGN KEY IF EXISTS fk_pagos_clase,
    DROP FOREIGN KEY IF EXISTS fk_pagos_inscripcion,
    DROP FOREIGN KEY IF EXISTS fk_pagos_registrado;

ALTER TABLE newTEP.ateneo_pagos
    ADD CONSTRAINT fk_pagos_alumno FOREIGN KEY (alumno_id) REFERENCES newTEP.ateneo_alumnos(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_pagos_clase FOREIGN KEY (clase_id) REFERENCES newTEP.ateneo_clases(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_pagos_inscripcion FOREIGN KEY (inscripcion_id) REFERENCES newTEP.ateneo_inscripciones(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_pagos_registrado FOREIGN KEY (registrado_por) REFERENCES newTEP.users(id) ON DELETE SET NULL;

-- Becas y beneficios
CREATE TABLE IF NOT EXISTS newTEP.ateneo_becas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumno_id INT NOT NULL,
    clase_id INT,
    tipo ENUM('porcentaje', 'monto_fijo', 'exencion_matricula') NOT NULL,
    valor DECIMAL(10,2) NOT NULL DEFAULT 0,
    motivo TEXT,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    activa BOOLEAN DEFAULT TRUE,
    otorgada_por CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alumno (alumno_id),
    INDEX idx_activa (activa),
    INDEX idx_vigencia (fecha_inicio, fecha_fin),
    INDEX idx_otorgada (otorgada_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE newTEP.ateneo_becas
    DROP FOREIGN KEY IF EXISTS fk_becas_alumno,
    DROP FOREIGN KEY IF EXISTS fk_becas_clase,
    DROP FOREIGN KEY IF EXISTS fk_becas_otorgada;

ALTER TABLE newTEP.ateneo_becas
    ADD CONSTRAINT fk_becas_alumno FOREIGN KEY (alumno_id) REFERENCES newTEP.ateneo_alumnos(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_becas_clase FOREIGN KEY (clase_id) REFERENCES newTEP.ateneo_clases(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_becas_otorgada FOREIGN KEY (otorgada_por) REFERENCES newTEP.users(id) ON DELETE SET NULL;

-- Registro de asistencia
CREATE TABLE IF NOT EXISTS newTEP.ateneo_asistencia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumno_id INT NOT NULL,
    clase_id INT NOT NULL,
    fecha DATE NOT NULL,
    presente BOOLEAN DEFAULT FALSE,
    observaciones TEXT,
    registrado_por CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_alumno_clase_fecha (alumno_id, clase_id, fecha),
    INDEX idx_clase_fecha (clase_id, fecha),
    INDEX idx_registrado (registrado_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE newTEP.ateneo_asistencia
    DROP FOREIGN KEY IF EXISTS fk_asistencia_alumno,
    DROP FOREIGN KEY IF EXISTS fk_asistencia_clase,
    DROP FOREIGN KEY IF EXISTS fk_asistencia_registrado;

ALTER TABLE newTEP.ateneo_asistencia
    ADD CONSTRAINT fk_asistencia_alumno FOREIGN KEY (alumno_id) REFERENCES newTEP.ateneo_alumnos(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_asistencia_clase FOREIGN KEY (clase_id) REFERENCES newTEP.ateneo_clases(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_asistencia_registrado FOREIGN KEY (registrado_por) REFERENCES newTEP.users(id) ON DELETE SET NULL;

-- Log de cambios de estado académico (auditoría)
CREATE TABLE IF NOT EXISTS newTEP.ateneo_estado_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alumno_id INT NOT NULL,
    estado_anterior ENUM('pendiente', 'activo', 'deuda', 'suspendido', 'egresado'),
    estado_nuevo ENUM('pendiente', 'activo', 'deuda', 'suspendido', 'egresado') NOT NULL,
    motivo TEXT,
    automatico BOOLEAN DEFAULT TRUE,
    cambiado_por CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_alumno (alumno_id),
    INDEX idx_fecha (created_at),
    INDEX idx_cambiado (cambiado_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE newTEP.ateneo_estado_log
    DROP FOREIGN KEY IF EXISTS fk_estado_log_alumno,
    DROP FOREIGN KEY IF EXISTS fk_estado_log_cambiado;

ALTER TABLE newTEP.ateneo_estado_log
    ADD CONSTRAINT fk_estado_log_alumno FOREIGN KEY (alumno_id) REFERENCES newTEP.ateneo_alumnos(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_estado_log_cambiado FOREIGN KEY (cambiado_por) REFERENCES newTEP.users(id) ON DELETE SET NULL;

-- Agregar roles de Ateneo a la tabla users si no existen
-- Nota: Esto asume que la columna 'role' ya permite valores adicionales
-- Si usa ENUM, se debe modificar la columna primero

-- Verificar/modificar el ENUM de roles en users (ejecutar manualmente si es necesario)
-- ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'boleteria', 'user', 'productor', 'alumno_ateneo', 'docente_ateneo') DEFAULT 'user';
