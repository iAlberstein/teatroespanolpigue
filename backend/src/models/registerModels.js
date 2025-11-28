import { DataTypes } from 'sequelize';
import defineBordereauxModel from './Bordereaux.js';
import defineActivityLogModel from './ActivityLog.js';
import defineProducerModel from './Producer.js';
import defineShowProducerModel from './ShowProducer.js';

export default function registerModels(sequelize) {
  const User = sequelize.define('users', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    dni: { type: DataTypes.STRING, allowNull: true, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.ENUM('admin','boleteria','productor','espectador','premium'), allowNull: false, defaultValue: 'espectador' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  });

  const Show = sequelize.define('shows', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    duration_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
    image_url: { type: DataTypes.STRING, allowNull: true },
    pricing_json: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    // Legacy fields (mantener para compatibilidad con datos existentes)
    sala: { type: DataTypes.STRING, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: true },
    time: { type: DataTypes.STRING, allowNull: true }
  });

  const Session = sequelize.define('sessions', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    show_id: { type: DataTypes.UUID, allowNull: false },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    ends_at: { type: DataTypes.DATE, allowNull: false },
    pricing_json: { 
      type: DataTypes.JSON, 
      allowNull: true,
      comment: 'Pricing for this session. If null, inherits from show. Format: { platea_general, palcos_bajos, palcos_altos, pullman }' 
    },
    capacity_override: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Override default capacity (154) for this session'
    }
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
    sale_id: { type: DataTypes.UUID, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: true },
    seat_code: { type: DataTypes.STRING, allowNull: true },
    section: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.ENUM('butaca','palco','pullman'), allowNull: false },
    price: { type: DataTypes.DECIMAL(10,2), allowNull: false, defaultValue: 0 },
    qr_code: { type: DataTypes.TEXT, allowNull: true },
    qr_data: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.ENUM('available','reserved','sold','validated','blocked'), defaultValue: 'available' },
    validated_at: { type: DataTypes.DATE, allowNull: true },
    validated_by: { type: DataTypes.UUID, allowNull: true },
    capacity: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
    capacity_validated: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 }
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
    cash_register_shift_id: { type: DataTypes.UUID, allowNull: true },
    payment_method: { type: DataTypes.ENUM('efectivo','tarjeta','qr','mp','cash','card','transfer'), allowNull: false },
    payment_status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'approved' },
    discount_id: { type: DataTypes.UUID, allowNull: true },
    total_amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    customer_name: { type: DataTypes.STRING, allowNull: true },
    customer_email: { type: DataTypes.STRING, allowNull: true },
    customer_phone: { type: DataTypes.STRING, allowNull: true },
    customer_dni: { type: DataTypes.STRING, allowNull: true },
    sold_by: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    container_qr_code: { type: DataTypes.TEXT, allowNull: true },
    container_qr_data: { type: DataTypes.TEXT, allowNull: true },
    validated_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_capacity: { type: DataTypes.INTEGER, defaultValue: 0 }
  });

  const CashRegisterShift = sequelize.define('cash_register_shifts', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    status: { type: DataTypes.ENUM('open', 'closed'), defaultValue: 'open' },
    opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    opening_note: { type: DataTypes.TEXT, allowNull: true },
    closing_note: { type: DataTypes.TEXT, allowNull: true },
    cash_adjustments_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    cash_adjustments_note: { type: DataTypes.TEXT, allowNull: true },
    opening_bill_20000: { type: DataTypes.INTEGER, defaultValue: 0 },
    opening_bill_10000: { type: DataTypes.INTEGER, defaultValue: 0 },
    opening_bill_2000: { type: DataTypes.INTEGER, defaultValue: 0 },
    opening_bill_1000: { type: DataTypes.INTEGER, defaultValue: 0 },
    opening_bill_500: { type: DataTypes.INTEGER, defaultValue: 0 },
    closing_bill_20000: { type: DataTypes.INTEGER, defaultValue: 0 },
    closing_bill_10000: { type: DataTypes.INTEGER, defaultValue: 0 },
    closing_bill_2000: { type: DataTypes.INTEGER, defaultValue: 0 },
    closing_bill_1000: { type: DataTypes.INTEGER, defaultValue: 0 },
    closing_bill_500: { type: DataTypes.INTEGER, defaultValue: 0 },
    opening_total_cash: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    closing_total_cash: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    cash_sales_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    cash_sales_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    non_cash_sales_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    discrepancy_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    last_sale_at: { type: DataTypes.DATE, allowNull: true },
    closing_summary: { type: DataTypes.JSON, allowNull: true }
  });

  const Validation = sequelize.define('validations', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: { type: DataTypes.UUID, allowNull: false },
    validated_by: { type: DataTypes.UUID, allowNull: false },
    device_info: { type: DataTypes.JSON, allowNull: true },
    ip_address: { type: DataTypes.STRING, allowNull: true },
    validation_type: { type: DataTypes.ENUM('qr_scan','manual'), defaultValue: 'qr_scan' }
  });

  // Definir modelo Bordereaux
  const Bordereaux = defineBordereauxModel(sequelize);

  // Definir modelo ActivityLog
  const ActivityLog = defineActivityLogModel(sequelize);

  // Definir modelo Producer
  const Producer = defineProducerModel(sequelize);

  // Definir modelo ShowProducer
  const ShowProducer = defineShowProducerModel(sequelize);

  // Associations
  Show.hasMany(Session, { foreignKey: 'show_id', as: 'sessions' });
  Session.belongsTo(Show, { foreignKey: 'show_id', as: 'show' });

  Session.hasMany(Ticket, { foreignKey: 'session_id' });
  Ticket.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

  User.hasMany(Ticket, { foreignKey: 'user_id' });
  Ticket.belongsTo(User, { foreignKey: 'user_id' });

  Session.hasMany(Reservation, { foreignKey: 'session_id' });
  Reservation.belongsTo(Session, { foreignKey: 'session_id' });

  User.hasMany(Reservation, { foreignKey: 'user_id' });
  Reservation.belongsTo(User, { foreignKey: 'user_id' });

  Session.hasMany(Sale, { foreignKey: 'session_id' });
  Sale.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

  User.hasMany(Sale, { foreignKey: 'user_id', as: 'purchases' });
  Sale.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  User.hasMany(Sale, { foreignKey: 'cashier_id', as: 'cashier_sales' });
  Sale.belongsTo(User, { foreignKey: 'cashier_id', as: 'cashier' });

  User.hasMany(Sale, { foreignKey: 'sold_by', as: 'seller_sales' });
  Sale.belongsTo(User, { foreignKey: 'sold_by', as: 'seller' });

  User.hasMany(CashRegisterShift, { foreignKey: 'user_id', as: 'cash_register_shifts' });
  CashRegisterShift.belongsTo(User, { foreignKey: 'user_id', as: 'cashier' });

  CashRegisterShift.hasMany(Sale, { foreignKey: 'cash_register_shift_id', as: 'sales' });
  Sale.belongsTo(CashRegisterShift, { foreignKey: 'cash_register_shift_id', as: 'cash_register_shift' });

  Sale.hasMany(Ticket, { foreignKey: 'sale_id', as: 'tickets' });
  Ticket.belongsTo(Sale, { foreignKey: 'sale_id', as: 'sale' });

  Show.hasMany(Discount, { foreignKey: 'show_id', as: 'discounts' });
  Discount.belongsTo(Show, { foreignKey: 'show_id', as: 'show' });

  Discount.hasMany(Sale, { foreignKey: 'discount_id' });
  Sale.belongsTo(Discount, { foreignKey: 'discount_id', as: 'discount' });

  Ticket.hasMany(Validation, { foreignKey: 'ticket_id' });
  Validation.belongsTo(Ticket, { foreignKey: 'ticket_id' });

  User.hasMany(Validation, { foreignKey: 'validated_by' });
  Validation.belongsTo(User, { foreignKey: 'validated_by', as: 'validator' });

  Show.hasOne(Bordereaux, { foreignKey: 'show_id', as: 'bordereaux' });
  Bordereaux.belongsTo(Show, { foreignKey: 'show_id', as: 'show' });

  User.hasMany(Bordereaux, { foreignKey: 'closed_by', as: 'closed_bordereaux' });
  Bordereaux.belongsTo(User, { foreignKey: 'closed_by', as: 'closer' });

  User.hasMany(ActivityLog, { foreignKey: 'user_id', as: 'activity_logs' });
  ActivityLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

  // NOTA: Producer ya no se usa como modelo separado.
  // Los productores son usuarios con role='productor' en la tabla users.
  // La tabla show_producers relaciona shows con users (producer_id -> users.id)
  
  // Mantener modelos Producer y ShowProducer definidos pero sin asociaciones
  // ya que show_producers ahora apunta directamente a users

  return { User, Show, Session, Reservation, Ticket, Discount, Sale, CashRegisterShift, Validation, Bordereaux, ActivityLog, Producer, ShowProducer };
}
