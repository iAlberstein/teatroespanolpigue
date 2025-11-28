import { DataTypes } from 'sequelize';

export default function (sequelize) {
  const Producer = sequelize.define('producer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'producers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true
  });

  Producer.associate = (models) => {
    // Relación con User (un productor puede estar asociado a un usuario)
    Producer.belongsTo(models.users, {
      foreignKey: 'user_id',
      as: 'user'
    });

    // Relación many-to-many con Shows
    Producer.belongsToMany(models.shows, {
      through: 'show_producers',
      foreignKey: 'producer_id',
      otherKey: 'show_id',
      as: 'shows'
    });
  };

  return Producer;
}
