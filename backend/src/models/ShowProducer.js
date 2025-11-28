import { DataTypes } from 'sequelize';

export default function (sequelize) {
  const ShowProducer = sequelize.define('show_producer', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
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
    producer_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'show_producers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true
  });

  return ShowProducer;
}
