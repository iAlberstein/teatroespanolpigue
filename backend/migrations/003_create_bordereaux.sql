-- Migración para crear la tabla bordereaux
-- Ejecutar en PostgreSQL

CREATE TABLE IF NOT EXISTS bordereaux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'provisional',
  closed_at TIMESTAMP,
  closed_by UUID REFERENCES users(id),
  deductions_a JSONB NOT NULL DEFAULT '[
    {"name":"Argentores","percentage":0,"description":"del Bruto"},
    {"name":"SADAIC","percentage":0,"description":"del Bruto"}
  ]'::jsonb,
  contract_theater_percentage DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  contract_user_percentage DECIMAL(5,2) NOT NULL DEFAULT 80.00,
  deductions_b JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_bordereaux_show_id ON bordereaux(show_id);
CREATE INDEX IF NOT EXISTS idx_bordereaux_status ON bordereaux(status);

-- Comentarios
COMMENT ON TABLE bordereaux IS 'Tabla para almacenar los bordereaux de liquidación de shows';
COMMENT ON COLUMN bordereaux.status IS 'Estado del bordereaux: provisional o cerrado';
COMMENT ON COLUMN bordereaux.deductions_a IS 'Deducciones porcentuales del bruto (Argentores, SADAIC, etc.)';
COMMENT ON COLUMN bordereaux.deductions_b IS 'Deducciones adicionales con montos fijos';
