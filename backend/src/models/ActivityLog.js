import { DataTypes } from 'sequelize';

export default function(sequelize) {
  const ActivityLog = sequelize.define('activity_logs', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'login, logout, sale, show_create, show_update, session_create, discount_create, etc.'
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'user, show, session, sale, ticket, discount, bordereaux, etc.'
    },
    entity_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'ID of the entity affected'
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON string with additional details'
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['action_type'] },
      { fields: ['entity_type'] },
      { fields: ['created_at'] },
      { fields: ['user_id', 'action_type'] },
      { fields: ['entity_type', 'entity_id'] }
    ]
  });

  ActivityLog.associate = function(models) {
    ActivityLog.belongsTo(models.users, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return ActivityLog;
}
