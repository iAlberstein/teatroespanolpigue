import { DataTypes } from 'sequelize';

export default function defineBordereauxModel(sequelize) {
  const Bordereaux = sequelize.define('bordereaux', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    show_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'shows',
        key: 'id'
      }
    },
    // Estado del bordereaux
    status: {
      type: DataTypes.ENUM('provisional', 'cerrado'),
      defaultValue: 'provisional',
      allowNull: false
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    closed_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    
    // Deducciones A (porcentajes del bruto)
    deductions_a: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [
        { name: 'Argentores', percentage: 0, description: 'del Bruto' },
        { name: 'SADAIC', percentage: 0, description: 'del Bruto' }
      ]
    },
    
    // Contrato (porcentajes del neto 2) - esquema legado, se mantiene por compatibilidad
    // con bordereaux ya cerrados que nunca se migraron a `contract_items`.
    contract_theater_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 30.00,
      allowNull: false
    },
    contract_user_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 70.00,
      allowNull: false
    },

    // Contrato como lista de items: [{ title, mode: 'percentage'|'fixed', percentage,
    // fixedAmount, description, settle }]. `settle: true` marca el/los items cuyo importe
    // se liquida en efectivo/transferencia (equivalente al "USUARIO" del esquema legado).
    // NULL/vacío => se usa el esquema legado (contract_theater_percentage/contract_user_percentage).
    contract_items: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [
        { title: 'Teatro', mode: 'percentage', percentage: 30, fixedAmount: 0, description: 'del Neto 2', settle: false },
        { title: 'Usuario', mode: 'percentage', percentage: 70, fixedAmount: 0, description: 'del Neto 2', settle: true }
      ],
      get() {
        const raw = this.getDataValue('contract_items');
        if (!raw) return null;
        if (typeof raw === 'string') {
          try { return JSON.parse(raw); } catch { return null; }
        }
        return raw;
      }
    },

    // Override de contract_items por función/fecha (session_id -> array de items),
    // para shows con múltiples sesiones (packs) donde cada fecha necesita una distribución
    // de contrato distinta (ej: 10/30/60 en una fecha, 30/70 en otra).
    session_contract_overrides: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      get() {
        const raw = this.getDataValue('session_contract_overrides');
        if (!raw) return {};
        if (typeof raw === 'string') {
          try { return JSON.parse(raw) || {}; } catch { return {}; }
        }
        return raw;
      }
    },
    
    // Deducciones B (items adicionales con montos fijos)
    deductions_b: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    
    // Nombre del autor (editable por admin)
    author_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    
    // Notas adicionales
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    timestamps: true,
    tableName: 'bordereaux',
    underscored: true
  });

  return Bordereaux;
}
