import { DataTypes } from 'sequelize';

export default function registerModels(sequelize) {
  const User = sequelize.define('users', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('admin','boleteria','productor','espectador','premium'), allowNull: false, defaultValue: 'espectador' }
  });

  const Show = sequelize.define('shows', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    sala: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    time: { type: DataTypes.STRING, allowNull: false },
    pricing_json: { type: DataTypes.JSON, allowNull: false }
  });

  const Session = sequelize.define('sessions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    show_id: { type: DataTypes.UUID, allowNull: false },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    ends_at: { type: DataTypes.DATE, allowNull: false }
  });

  const Reservation = sequelize.define('reservations', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    items: { type: DataTypes.JSON, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM('active','expired','confirmed','canceled'), defaultValue: 'active' }
  });

  const Ticket = sequelize.define('tickets', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    seat_code: { type: DataTypes.STRING, allowNull: true },
    section: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('butaca','palco','pullman'), allowNull: false },
    qr_code: { type: DataTypes.STRING, allowNull: true, unique: true },
    qr_data: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('available','reserved','sold','validated','blocked'), defaultValue: 'available' },
    validated_at: { type: DataTypes.DATE, allowNull: true },
    validated_by: { type: DataTypes.UUID, allowNull: true }
  });

  const Discount = sequelize.define('discounts', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    code: { type: DataTypes.STRING, allowNull: false },
    show_id: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.ENUM('percentage','fixed','internal'), allowNull: false },
    value: { type: DataTypes.DECIMAL(10,2), allowNull: true },
    usage_limit: { type: DataTypes.INTEGER, defaultValue: 1 },
    used_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  });

  const Sale = sequelize.define('sales', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    cashier_id: { type: DataTypes.UUID, allowNull: true },
    payment_method: { type: DataTypes.ENUM('efectivo','tarjeta','qr','mp','cash','card','transfer'), allowNull: false },
    payment_status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'approved' },
    discount_id: { type: DataTypes.UUID, allowNull: true },
    total_amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    customer_name: { type: DataTypes.STRING, allowNull: true },
    customer_email: { type: DataTypes.STRING, allowNull: true },
    customer_phone: { type: DataTypes.STRING, allowNull: true },
    sold_by: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true }
  });

  const Validation = sequelize.define('validations', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: { type: DataTypes.UUID, allowNull: false },
    validated_by: { type: DataTypes.UUID, allowNull: false },
    device_info: { type: DataTypes.JSON, allowNull: true },
    ip_address: { type: DataTypes.STRING, allowNull: true },
    validation_type: { type: DataTypes.ENUM('qr_scan','manual'), defaultValue: 'qr_scan' }
  });

  // Associations
  Show.hasMany(Session, { foreignKey: 'show_id', as: 'sessions' });
  Session.belongsTo(Show, { foreignKey: 'show_id', as: 'show' });

  Session.hasMany(Ticket, { foreignKey: 'session_id' });
  Ticket.belongsTo(Session, { foreignKey: 'session_id' });

  User.hasMany(Ticket, { foreignKey: 'user_id' });
  Ticket.belongsTo(User, { foreignKey: 'user_id' });

  Session.hasMany(Reservation, { foreignKey: 'session_id' });
  Reservation.belongsTo(Session, { foreignKey: 'session_id' });

  User.hasMany(Reservation, { foreignKey: 'user_id' });
  Reservation.belongsTo(User, { foreignKey: 'user_id' });

  Session.hasMany(Sale, { foreignKey: 'session_id' });
  Sale.belongsTo(Session, { foreignKey: 'session_id' });

  Discount.hasMany(Sale, { foreignKey: 'discount_id' });
  Sale.belongsTo(Discount, { foreignKey: 'discount_id' });

  Ticket.hasMany(Validation, { foreignKey: 'ticket_id' });
  Validation.belongsTo(Ticket, { foreignKey: 'ticket_id' });

  User.hasMany(Validation, { foreignKey: 'validated_by' });
  Validation.belongsTo(User, { foreignKey: 'validated_by', as: 'validator' });

  return { User, Show, Session, Reservation, Ticket, Discount, Sale, Validation };
}
