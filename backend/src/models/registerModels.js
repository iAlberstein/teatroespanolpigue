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
    role: { type: DataTypes.ENUM('admin','boleteria','productor','espectador','premium','alumno_ateneo','docente_ateneo'), allowNull: false, defaultValue: 'espectador' },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    provincia: { type: DataTypes.STRING, allowNull: true },
    localidad: { type: DataTypes.STRING, allowNull: true },
    reset_token: { type: DataTypes.STRING, allowNull: true },
    reset_token_expiry: { type: DataTypes.DATE, allowNull: true }
  });

  const Show = sequelize.define('shows', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    duration_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
    image_url: { type: DataTypes.STRING, allowNull: true },
    image_principal_web: { type: DataTypes.STRING, allowNull: true },
    image_secundaria_web: { type: DataTypes.STRING, allowNull: true },
    image_principal_mobile: { type: DataTypes.STRING, allowNull: true },
    venue_type: { 
      type: DataTypes.ENUM('sala_principal', 'el_tablado', 'las_gemelas'), 
      allowNull: false, 
      defaultValue: 'sala_principal',
      comment: 'Tipo de sala: sala_principal (asientos numerados), el_tablado o las_gemelas (entradas generales)'
    },
    general_capacity: { 
      type: DataTypes.INTEGER, 
      allowNull: true,
      comment: 'Capacidad total para salas con entradas generales (el_tablado, las_gemelas). NULL para sala_principal.'
    },
    is_visible: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Si es false, el show solo es visible para admins'
    },
    external_sale: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Si es true, redirige a link externo en vez del sistema interno'
    },
    external_sale_link: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'URL de la plataforma externa de venta de entradas'
    },
    palcos_individual_seats: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Si es true, los palcos se venden con butacas individuales (no muestra xN localidades)'
    },
    pricing_json: { 
      type: DataTypes.JSON, 
      allowNull: false, 
      defaultValue: {},
      get() {
        const rawValue = this.getDataValue('pricing_json');
        if (typeof rawValue === 'string') {
          try {
            return JSON.parse(rawValue);
          } catch (e) {
            return {};
          }
        }
        return rawValue || {};
      }
    },
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
      comment: 'Pricing for this session. If null, inherits from show. Format: { platea_general, palcos_bajos, palcos_altos, pullman }',
      get() {
        const rawValue = this.getDataValue('pricing_json');
        if (typeof rawValue === 'string') {
          try {
            return JSON.parse(rawValue);
          } catch (e) {
            return null;
          }
        }
        return rawValue;
      }
    },
    capacity_override: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Override default capacity (154) for this session'
    },
    palcos_individual_seats: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null,
      comment: 'Override show setting for individual palco seats. NULL = inherit from show'
    }
  });

  const Reservation = sequelize.define('reservations', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    sale_id: { type: DataTypes.UUID, allowNull: true },
    items: { 
      type: DataTypes.JSON, 
      allowNull: false,
      get() {
        const rawValue = this.getDataValue('items');
        // Si es string, parsearlo
        if (typeof rawValue === 'string') {
          try {
            return JSON.parse(rawValue);
          } catch (e) {
            console.error('[MODEL] Error parsing items JSON:', e);
            return [];
          }
        }
        return rawValue || [];
      }
    },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM('active','expired','confirmed','canceled'), defaultValue: 'active' },
    service_items: { type: DataTypes.TEXT, allowNull: true }
  });

  const Ticket = sequelize.define('tickets', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    sale_id: { type: DataTypes.UUID, allowNull: true },
    user_id: { type: DataTypes.UUID, allowNull: true },
    seat_code: { type: DataTypes.STRING, allowNull: true },
    section: { type: DataTypes.STRING, allowNull: false },
    type: { 
      type: DataTypes.ENUM('butaca','palco','pullman','general','service'), 
      allowNull: false,
      comment: 'Tipo de entrada: butaca (asiento numerado), palco (box), pullman (sin asiento numerado sala principal), general (entrada general para el_tablado/las_gemelas), service (servicio asociado al show)'
    },
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
    alias: { type: DataTypes.STRING, allowNull: true },
    show_id: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.ENUM('percentage','fixed','internal'), allowNull: false },
    value: { type: DataTypes.DECIMAL(10,6), allowNull: true },
    min_seats: { type: DataTypes.INTEGER, allowNull: true },
    max_seats: { type: DataTypes.INTEGER, allowNull: true },
    require_even: { type: DataTypes.BOOLEAN, defaultValue: false },
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
    payment_method: { type: DataTypes.ENUM('efectivo','tarjeta','qr','mp','cash','card','transfer','courtesy'), allowNull: false },
    payment_status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'approved' },
    discount_id: { type: DataTypes.UUID, allowNull: true },
    total_amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
    customer_name: { type: DataTypes.STRING, allowNull: true },
    customer_email: { type: DataTypes.STRING, allowNull: true },
    customer_phone: { type: DataTypes.STRING, allowNull: true },
    customer_dni: { type: DataTypes.STRING, allowNull: true },
    customer_provincia: { type: DataTypes.STRING, allowNull: true },
    customer_localidad: { type: DataTypes.STRING, allowNull: true },
    sold_by: { type: DataTypes.UUID, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    container_qr_code: { type: DataTypes.TEXT, allowNull: true },
    container_qr_data: { type: DataTypes.TEXT, allowNull: true },
    validated_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_capacity: { type: DataTypes.INTEGER, defaultValue: 0 },
    billing_status: { type: DataTypes.ENUM('pending', 'invoiced'), defaultValue: 'pending' },
    invoiced_at: { type: DataTypes.DATE, allowNull: true },
    invoiced_by: { type: DataTypes.UUID, allowNull: true },
    service_items: { type: DataTypes.JSON, allowNull: true }
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

  // Billing associations
  Sale.belongsTo(User, { foreignKey: 'invoiced_by', as: 'invoiced_by_user' });
  User.hasMany(Sale, { foreignKey: 'invoiced_by', as: 'invoiced_sales' });

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

  // Newsletter subscribers
  const NewsletterSubscriber = sequelize.define('newsletter_subscribers', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    active: { type: DataTypes.BOOLEAN, defaultValue: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // System settings (key-value store for configuration)
  const SystemSettings = sequelize.define('system_settings', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    value: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Seat blocks (admin blocking functionality)
  const SeatBlock = sequelize.define('seat_blocks', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    seat_code: { type: DataTypes.STRING(20), allowNull: false },
    block_type: { 
      type: DataTypes.ENUM('butaca', 'palco', 'general'), 
      allowNull: false, 
      defaultValue: 'butaca' 
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    blocked_by: { type: DataTypes.UUID, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'blocked_at',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['session_id', 'seat_code', 'block_type'] }
    ]
  });

  // SeatBlock associations
  Session.hasMany(SeatBlock, { foreignKey: 'session_id', as: 'seat_blocks' });
  SeatBlock.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });
  
  User.hasMany(SeatBlock, { foreignKey: 'blocked_by', as: 'blocked_seats' });
  SeatBlock.belongsTo(User, { foreignKey: 'blocked_by', as: 'blocker' });

  // =====================================================
  // SISTEMA MULTI-ROL
  // =====================================================

  const Role = sequelize.define('roles', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    modulo: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'global' }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  const UserRole = sequelize.define('user_roles', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    role_id: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['user_id', 'role_id'] }
    ]
  });

  // Asociaciones User <-> Role (muchos a muchos)
  User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id', as: 'roles' });
  Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id', as: 'users' });
  
  User.hasMany(UserRole, { foreignKey: 'user_id', as: 'userRoles' });
  UserRole.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
  UserRole.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

  // =====================================================
  // ATENEO - Sistema Académico
  // =====================================================

  const AteneoConfig = sequelize.define('ateneo_config', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clave: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    valor: { type: DataTypes.TEXT, allowNull: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  const AteneoClase = sequelize.define('ateneo_clases', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    nombre: { type: DataTypes.STRING(255), allowNull: false },
    slug: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    docente_id: { type: DataTypes.UUID, allowNull: true },
    cupo: { type: DataTypes.INTEGER, defaultValue: 20 },
    horario: { type: DataTypes.STRING(255), allowNull: true },
    ubicacion: { type: DataTypes.STRING(255), allowNull: true },
    costo_matricula: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    costo_cuota: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    estado: { type: DataTypes.ENUM('activa', 'suspendida', 'finalizada'), defaultValue: 'activa' },
    ciclo: { type: DataTypes.STRING(20), defaultValue: '2026' },
    fecha_inicio: { type: DataTypes.DATEONLY, allowNull: true },
    fecha_fin: { type: DataTypes.DATEONLY, allowNull: true },
    imagen_url: { type: DataTypes.STRING(500), allowNull: true },
    imagen_actividad_url: { type: DataTypes.STRING(500), allowNull: true },
    imagen_docente_url: { type: DataTypes.STRING(500), allowNull: true },
    bio_docente: { type: DataTypes.TEXT, allowNull: true },
    nombre_docente: { type: DataTypes.STRING(255), allowNull: true },
    requisitos: { type: DataTypes.TEXT, allowNull: true },
    visible: { type: DataTypes.BOOLEAN, defaultValue: true },
    color: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null },
    matricula_bonificada: { type: DataTypes.BOOLEAN, defaultValue: false },
    cuota_unica: { type: DataTypes.BOOLEAN, defaultValue: false },
    taller_corto: { type: DataTypes.BOOLEAN, defaultValue: false },
    orden: { type: DataTypes.INTEGER, defaultValue: 0 }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  const AteneoClaseHorario = sequelize.define('ateneo_clase_horarios', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clase_id: { type: DataTypes.INTEGER, allowNull: false },
    dia_semana: { type: DataTypes.ENUM('Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo'), allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: true },
    hora_inicio: { type: DataTypes.TIME, allowNull: false },
    hora_fin: { type: DataTypes.TIME, allowNull: false }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  const AteneoClaseDocente = sequelize.define('ateneo_clase_docentes', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clase_id: { type: DataTypes.INTEGER, allowNull: false },
    docente_id: { type: DataTypes.UUID, allowNull: false }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  const AteneoAlumno = sequelize.define('ateneo_alumnos', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING(255), allowNull: true },
    dni: { type: DataTypes.STRING(15), allowNull: true },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    fecha_nacimiento: { type: DataTypes.DATEONLY, allowNull: true },
    direccion: { type: DataTypes.TEXT, allowNull: true },
    contacto_emergencia: { type: DataTypes.STRING(255), allowNull: true },
    telefono_emergencia: { type: DataTypes.STRING(30), allowNull: true },
    estado_academico: { type: DataTypes.ENUM('pendiente', 'activo', 'deuda', 'suspendido', 'egresado'), defaultValue: 'pendiente' },
    estado_forzado: { type: DataTypes.BOOLEAN, defaultValue: false },
    fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: true },
    observaciones_admin: { type: DataTypes.TEXT, allowNull: true },
    es_menor: { type: DataTypes.BOOLEAN, defaultValue: false },
    nombre_menor: { type: DataTypes.STRING(255), allowNull: true },
    apellido_menor: { type: DataTypes.STRING(255), allowNull: true },
    dni_menor: { type: DataTypes.STRING(15), allowNull: true },
    fecha_nacimiento_menor: { type: DataTypes.DATEONLY, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  const AteneoInscripcion = sequelize.define('ateneo_inscripciones', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    alumno_id: { type: DataTypes.INTEGER, allowNull: false },
    clase_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha_inscripcion: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    estado: { type: DataTypes.ENUM('pendiente', 'confirmada', 'baja'), defaultValue: 'pendiente' },
    motivo_baja: { type: DataTypes.TEXT, allowNull: true },
    seguimiento: { type: DataTypes.TEXT, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['alumno_id', 'clase_id'] }
    ]
  });

  const AteneoPago = sequelize.define('ateneo_pagos', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    alumno_id: { type: DataTypes.INTEGER, allowNull: false },
    clase_id: { type: DataTypes.INTEGER, allowNull: true },
    inscripcion_id: { type: DataTypes.INTEGER, allowNull: true },
    tipo: { type: DataTypes.ENUM('matricula', 'cuota'), allowNull: false },
    periodo: { type: DataTypes.STRING(10), allowNull: true },
    monto_original: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    monto_final: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    estado: { type: DataTypes.ENUM('pendiente', 'pagado', 'vencido'), defaultValue: 'pendiente' },
    fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: true },
    fecha_pago: { type: DataTypes.DATE, allowNull: true },
    origen: { type: DataTypes.ENUM('pasarela', 'efectivo', 'transferencia', 'otro'), defaultValue: 'pasarela' },
    referencia_pasarela: { type: DataTypes.STRING(255), allowNull: true },
    registrado_por: { type: DataTypes.UUID, allowNull: true },
    notas: { type: DataTypes.TEXT, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  const AteneoBeca = sequelize.define('ateneo_becas', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    alumno_id: { type: DataTypes.INTEGER, allowNull: false },
    clase_id: { type: DataTypes.INTEGER, allowNull: true },
    tipo: { type: DataTypes.ENUM('porcentaje', 'monto_fijo', 'exencion_matricula'), allowNull: false },
    valor: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
    fecha_fin: { type: DataTypes.DATEONLY, allowNull: true },
    activa: { type: DataTypes.BOOLEAN, defaultValue: true },
    otorgada_por: { type: DataTypes.UUID, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  const AteneoAsistencia = sequelize.define('ateneo_asistencia', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    alumno_id: { type: DataTypes.INTEGER, allowNull: false },
    clase_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    presente: { type: DataTypes.BOOLEAN, defaultValue: false },
    observaciones: { type: DataTypes.TEXT, allowNull: true },
    registrado_por: { type: DataTypes.UUID, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['alumno_id', 'clase_id', 'fecha'] }
    ]
  });

  const AteneoEstadoLog = sequelize.define('ateneo_estado_log', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    alumno_id: { type: DataTypes.INTEGER, allowNull: false },
    estado_anterior: { type: DataTypes.ENUM('pendiente', 'activo', 'deuda', 'suspendido', 'egresado'), allowNull: true },
    estado_nuevo: { type: DataTypes.ENUM('pendiente', 'activo', 'deuda', 'suspendido', 'egresado'), allowNull: false },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    automatico: { type: DataTypes.BOOLEAN, defaultValue: true },
    cambiado_por: { type: DataTypes.UUID, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  const AteneoFeriado = sequelize.define('ateneo_feriados', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fecha: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    descripcion: { type: DataTypes.STRING(255), allowNull: false },
    creado_por: { type: DataTypes.UUID, allowNull: true }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // AteneoFeriado -> User
  User.hasMany(AteneoFeriado, { foreignKey: 'creado_por', as: 'feriados_creados' });
  AteneoFeriado.belongsTo(User, { foreignKey: 'creado_por', as: 'creador' });

  // =====================================================
  // ATENEO - Asociaciones
  // =====================================================

  // AteneoClase -> User (docente)
  User.hasMany(AteneoClase, { foreignKey: 'docente_id', as: 'clases_docente' });
  AteneoClase.belongsTo(User, { foreignKey: 'docente_id', as: 'docente' });

  // AteneoClase <-> User (docentes many-to-many)
  AteneoClase.belongsToMany(User, { through: AteneoClaseDocente, foreignKey: 'clase_id', otherKey: 'docente_id', as: 'docentes' });
  User.belongsToMany(AteneoClase, { through: AteneoClaseDocente, foreignKey: 'docente_id', otherKey: 'clase_id', as: 'clases_como_docente' });
  AteneoClaseDocente.belongsTo(AteneoClase, { foreignKey: 'clase_id', as: 'clase' });
  AteneoClaseDocente.belongsTo(User, { foreignKey: 'docente_id', as: 'docente' });

  // AteneoClase -> AteneoClaseHorario (múltiples horarios)
  AteneoClase.hasMany(AteneoClaseHorario, { foreignKey: 'clase_id', as: 'horarios' });
  AteneoClaseHorario.belongsTo(AteneoClase, { foreignKey: 'clase_id', as: 'clase' });

  // AteneoAlumno -> User
  User.hasOne(AteneoAlumno, { foreignKey: 'user_id', as: 'perfil_alumno' });
  AteneoAlumno.belongsTo(User, { foreignKey: 'user_id', as: 'usuario' });

  // AteneoInscripcion -> AteneoAlumno, AteneoClase
  AteneoAlumno.hasMany(AteneoInscripcion, { foreignKey: 'alumno_id', as: 'inscripciones' });
  AteneoInscripcion.belongsTo(AteneoAlumno, { foreignKey: 'alumno_id', as: 'alumno' });
  AteneoClase.hasMany(AteneoInscripcion, { foreignKey: 'clase_id', as: 'inscripciones' });
  AteneoInscripcion.belongsTo(AteneoClase, { foreignKey: 'clase_id', as: 'clase' });

  // AteneoPago -> AteneoAlumno, AteneoClase, AteneoInscripcion, User
  AteneoAlumno.hasMany(AteneoPago, { foreignKey: 'alumno_id', as: 'pagos' });
  AteneoPago.belongsTo(AteneoAlumno, { foreignKey: 'alumno_id', as: 'alumno' });
  AteneoClase.hasMany(AteneoPago, { foreignKey: 'clase_id', as: 'pagos' });
  AteneoPago.belongsTo(AteneoClase, { foreignKey: 'clase_id', as: 'clase' });
  AteneoInscripcion.hasMany(AteneoPago, { foreignKey: 'inscripcion_id', as: 'pagos' });
  AteneoPago.belongsTo(AteneoInscripcion, { foreignKey: 'inscripcion_id', as: 'inscripcion' });
  User.hasMany(AteneoPago, { foreignKey: 'registrado_por', as: 'pagos_registrados' });
  AteneoPago.belongsTo(User, { foreignKey: 'registrado_por', as: 'registrador' });

  // AteneoBeca -> AteneoAlumno, AteneoClase, User
  AteneoAlumno.hasMany(AteneoBeca, { foreignKey: 'alumno_id', as: 'becas' });
  AteneoBeca.belongsTo(AteneoAlumno, { foreignKey: 'alumno_id', as: 'alumno' });
  AteneoClase.hasMany(AteneoBeca, { foreignKey: 'clase_id', as: 'becas' });
  AteneoBeca.belongsTo(AteneoClase, { foreignKey: 'clase_id', as: 'clase' });
  User.hasMany(AteneoBeca, { foreignKey: 'otorgada_por', as: 'becas_otorgadas' });
  AteneoBeca.belongsTo(User, { foreignKey: 'otorgada_por', as: 'otorgante' });

  // AteneoAsistencia -> AteneoAlumno, AteneoClase, User
  AteneoAlumno.hasMany(AteneoAsistencia, { foreignKey: 'alumno_id', as: 'asistencias' });
  AteneoAsistencia.belongsTo(AteneoAlumno, { foreignKey: 'alumno_id', as: 'alumno' });
  AteneoClase.hasMany(AteneoAsistencia, { foreignKey: 'clase_id', as: 'asistencias' });
  AteneoAsistencia.belongsTo(AteneoClase, { foreignKey: 'clase_id', as: 'clase' });
  User.hasMany(AteneoAsistencia, { foreignKey: 'registrado_por', as: 'asistencias_registradas' });
  AteneoAsistencia.belongsTo(User, { foreignKey: 'registrado_por', as: 'registrador' });

  // AteneoEstadoLog -> AteneoAlumno, User
  AteneoAlumno.hasMany(AteneoEstadoLog, { foreignKey: 'alumno_id', as: 'historial_estados' });
  AteneoEstadoLog.belongsTo(AteneoAlumno, { foreignKey: 'alumno_id', as: 'alumno' });
  User.hasMany(AteneoEstadoLog, { foreignKey: 'cambiado_por', as: 'cambios_estado' });
  AteneoEstadoLog.belongsTo(User, { foreignKey: 'cambiado_por', as: 'responsable' });

  // =====================================================
  // SERVICIOS ASOCIADOS A SHOWS
  // =====================================================

  const ShowService = sequelize.define('show_services', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    show_id: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    include_in_bordereaux: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'Si true, el servicio se incluye en el bordereaux' }
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Show.hasMany(ShowService, { foreignKey: 'show_id', as: 'services' });
  ShowService.belongsTo(Show, { foreignKey: 'show_id', as: 'show' });

  return { 
    User, Show, Session, Reservation, Ticket, Discount, Sale, CashRegisterShift, Validation, 
    Bordereaux, ActivityLog, Producer, ShowProducer, NewsletterSubscriber, SystemSettings, SeatBlock,
    // Multi-rol
    Role, UserRole,
    // Ateneo models
    AteneoConfig, AteneoClase, AteneoClaseHorario, AteneoClaseDocente, AteneoAlumno, AteneoInscripcion, AteneoPago, AteneoBeca, AteneoAsistencia, AteneoEstadoLog,
    // Show services
    ShowService
  };
}
