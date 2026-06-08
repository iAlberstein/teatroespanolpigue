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
    
    // Contrato (porcentajes del neto 1)
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
