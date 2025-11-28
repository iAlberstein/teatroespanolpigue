# Teatro Español Pigüé – Plataforma de Ticketing

Este repositorio contiene el sistema completo de gestión de cartelera, venta de entradas y administración operativa del **Teatro Español Pigüé**.

Incluye:

- **Venta online** y en **boletería** con full e‑ticket.
- **Control de acceso por QR** con lector web/PWA.
- **Gestión de espectáculos y funciones**.
- **Reportes, bordereaux y caja** para administración.
- **Gestión de descuentos, cortesías y accesibilidad**.
- **Soporte para productores**, con reportes filtrados por show.
- **Integración con Mercado Pago** y envío de emails de confirmación.

## Arquitectura general

- **Frontend**: React 18 + Vite, SPA consumiendo la API en `/api`.
- **Backend**: Node.js + Express + Sequelize sobre MySQL.
- **Realtime**: Socket.IO para:
  - bloqueo/hold de butacas y palcos en tiempo real,
  - estado de Pullman,
  - actualización de asientos vendidos.
- **Pagos**: SDK oficial de Mercado Pago (preferencias, webhooks).
- **Email**: Nodemailer (SMTP) para envío de comprobantes y tickets.
- **Autenticación**:
  - JWT (`/api/auth/login`, `/api/auth/register`, `/api/auth/me`).
  - Roles: `admin`, `boleteria`, `productor`, `espectador`, `premium`.

## Estructura del repositorio

```text
newTEP/
├─ frontend/           # Aplicación React (SPA pública + paneles internos)
│  └─ src/
│     ├─ pages/        # Páginas principales (Cartelera, Perfil, Boletería, Admin, etc.)
│     ├─ components/   # Componentes UI (mapa de sala, modales, reportes, etc.)
│     ├─ contexts/     # AuthContext, etc.
│     └─ lib/          # cliente API, helpers
│
├─ backend/            # API REST + lógica de negocio
│  └─ src/
│     ├─ routes/       # Rutas HTTP (auth, shows, sessions, tickets, payments, reports, caja, etc.)
│     ├─ lib/          # configuración Sequelize, helpers (QR, email, formateadores)
│     ├─ models/       # Modelos Sequelize (users, shows, sessions, tickets, sales, discounts…)
│     └─ scripts/      # scripts de seed/migraciones/utilidades
│
└─ README.md
```

## Stack tecnológico

- **Frontend**
  - React 18 + Vite.
  - React Router DOM.
  - html5-qrcode (lector QR en navegador).
  - chart.js + react-chartjs-2 (gráficos de reportes).
  - socket.io-client (realtime).
- **Backend**
  - Express.
  - Sequelize + mysql2.
  - Mercado Pago SDK (`mercadopago`).
  - Socket.IO (servidor).
  - Day.js (fechas).
  - PDFKit (bordereaux en PDF).
  - Nodemailer (emails).
- **Infraestructura**
  - MySQL como base de datos.
  - Variables de entorno (.env) para URLs, credenciales y claves.

---

## Frontend: páginas y rutas

### Rutas públicas

- `/` – **Home** (landing simple).
- `/cartelera` – **Cartelera**: lista de espectáculos y funciones disponibles.
- `/cartelera/:id` – **Detalle de espectáculo**:
  - muestra funciones futuras,
  - mapa de sala numerada / palcos / pullman,
  - selección de ubicaciones y comienzo del flujo de compra online.
- `/login` – Login de usuario.
- `/register` – Registro de nuevo espectador.
- `/mp/success`, `/mp/pending`, `/mp/failure` – páginas de retorno de Mercado Pago.

### Rutas protegidas (requieren JWT)

- `/perfil` – **Perfil de espectador/premium**:
  - listado de compras y entradas,
  - visualización de QRs individuales y contenedores,
  - estados de validación (total y parcial),
  - reenvío de entradas por email / compartir.
- `/validar` (roles: `boleteria`, `admin`) – **Validador de entradas**:
  - lector QR con `html5-qrcode`,
  - validación contra `/api/tickets/validate`,
  - soporta palcos y pullman (validación parcial por capacidad).
- `/boleteria` (roles: `boleteria`, `admin`) – **Panel de Boletería**:
  - búsqueda rápida de clientes (`/api/users/search-quick`),
  - selección de función y mapa de sala en tiempo real,
  - venta presencial con distintos medios de pago,
  - aplicación de descuentos internos, cortesías, discapacidad,
  - impresión/envío de tickets,
  - interacción con la caja (`/api/cash-register`).
- `/admin` (roles: `admin`, `boleteria`, `productor`) – **Panel de Administración / Productor**:
  - **Admin**:
    - gestión de shows y funciones,
    - reportes generales e individuales,
    - bordereaux,
    - descuentos,
    - usuarios,
    - notificaciones.
  - **Boletería**: acceso a reportes operativos.
  - **Productor**: vista de reportes limitada a sus shows.
- `/activity-logs` (rol: `admin`) – exploración de logs de actividad de la app.

---

## Backend: módulos y endpoints principales

Las rutas HTTP se montan bajo `/api` en `src/routes/index.js`:

- `/api/auth`
- `/api/users`
- `/api/shows`
- `/api/sessions`
- `/api/reservations`
- `/api/payments`
- `/api/tickets`
- `/api/share`
- `/api/reports`
- `/api/bordereaux`
- `/api/discounts`
- `/api/activity-logs`
- `/api/notifications`
- `/api/producers`
- `/api/cash-register`

### Autenticación (`/api/auth`)

- `POST /api/auth/register` – registro de usuario (por defecto `espectador`).
- `POST /api/auth/login` – login email/password, devuelve JWT y datos básicos de usuario.
- `GET /api/auth/me` – devuelve usuario actual a partir del token.

Los tokens incluyen `userId`, `email`, `role`, `name` y se consumen desde el `AuthContext` del frontend.

### Usuarios (`/api/users`)

- `GET /api/users/search-quick` – búsqueda rápida para boletería (nombre, email, DNI, teléfono).
- `GET /api/users` – listado paginado con filtros (rol, activo, search).
- `GET /api/users/:id` – detalle de usuario.
- `PUT /api/users/:id` – actualización de datos de contacto (admin / boletería).
- Endpoints auxiliares para creación masiva y actualización.

Se usan principalmente en:

- Panel de **Usuarios** en `/admin`.
- Buscador de clientes en `/boleteria`.

### Espectáculos y funciones

**Shows (`/api/shows`):**

- `GET /api/shows` – lista de shows ordenados por fecha/hora, incluyendo productores asociados.
- `GET /api/shows/:id/sessions` – funciones futuras de un show.
- `POST /api/shows` – crear show (rol `admin`).
- `PUT /api/shows/:id` – actualizar show (rol `admin`).

**Sessions (`/api/sessions`):**

- `GET /api/sessions` – listado de funciones con show asociado.
- `GET /api/sessions/:id/availability` – estado de disponibilidad en tiempo real:
  - butacas y palcos en hold,
  - vendidos,
  - estado de Pullman,
  - precios actuales (por sesión o por show).
- `POST /api/sessions` – crear nueva función (rol `admin`).

Estas rutas alimentan:

- Cartelera pública.
- Selección de asientos en Cartelera y Boletería.
- Vista de analytics y reportes.

### Reservas y compra online (`/api/reservations`, `/api/payments`)

**Reservas (`/api/reservations`):**

- `POST /api/reservations` – crea una reserva temporal para una sesión a partir de los items seleccionados:
  - valida que los asientos no estén ya vendidos ni retenidos por otro socket,
  - enriquece los items con precios según `pricing_json`,
  - expira automáticamente a los 10 minutos.
- `GET /api/reservations/:id` – recupera una reserva para el checkout.
- `PUT /api/reservations/:id` – actualiza items respetando holds y estado.

**Pagos (`/api/payments`):**

- `POST /api/payments/preference` – genera una **preferencia de Mercado Pago** para una reserva:
  - construye items (butacas, palcos, pullman),
  - aplica descuentos,
  - agrega cargo por servicio del 10% solo cuando corresponde,
  - configura URLs de retorno (`/mp/success|pending|failure`),
  - guarda la relación en DB (reservas/ventas).

El flujo online típico:

1. Usuario selecciona lugares en `/cartelera/:id`.
2. Frontend llama `POST /api/reservations` con `session_id` + items.
3. Frontend llama `POST /api/payments/preference` con `reservation_id` (y opcional `discount_id`).
4. Usuario es redirigido a Mercado Pago.
5. MP retorna a `/mp/success` / `/mp/failure` en el frontend.
6. El backend procesa la notificación/webhook de MP, confirma el pago, crea la **venta** y los **tickets**, y dispara el envío de email.

### Tickets y validación (`/api/tickets`, `/api/share`)

- `GET /api/tickets?sale_id=...` – tickets de una venta:
  - incluye `location` formateada, `type`, `section`, `status`,
  - `capacity` y `capacity_validated` para palcos/pullman,
  - `price` y campos de validación.
- `POST /api/tickets/validate` – validación de ticket a partir de QR:
  - decodifica `ticket_id`,
  - verifica coherencia del QR con los datos del ticket,
  - controla estado (vendido, ya validado, vencido, etc.),
  - registra validaciones (incluyendo validaciones parciales según capacidad).

**Share (`/api/share`)**: endpoints que devuelven HTML amigable para compartir una entrada individual (por ejemplo, link enviado por WhatsApp/Web).

### Caja y reintegros (`/api/cash-register`)

Módulo para gestionar la caja de boletería:

- `POST /api/cash-register/open` – apertura de caja con detalle de billetes (por usuario).
- `POST /api/cash-register/close` – cierre de caja, resúmenes y discrepancias.
- `GET /api/cash-register/current` – estado actual de la caja abierta.
- `GET /api/cash-register/shifts` – listado de turnos de caja.
- `POST /api/cash-register/refund` – **reintegro de ventas**:
  - acepta `sale_id`, motivo, email opcional,
  - soporta devoluciones **totales** o **parciales por ticket** (`ticket_ids`),
  - valida que los tickets a devolver no estén validados ni parcialmente validados,
  - recalcula importes y ajusta capacidad,
  - crea una venta negativa (o parcial) como snapshot,
  - envía email de confirmación al espectador,
  - actualiza reportes y caja.

Este módulo es utilizado desde:

- Boletería (apertura/cierre de caja).
- Reportes en `/admin` (modales de devolución).

### Reportes y bordereaux (`/api/reports`, `/api/bordereaux`)

**Reports (`/api/reports`):**

- `GET /api/reports/general` – reportes agregados de todos los shows:
  - ingresos totales, tickets, ocupación promedio, asistencia,
  - desglose por ubicación (platea, palcos bajos/altos, pullman),
  - detalle de ventas con filtros por fecha, vendedor, canal,
  - soporte para filtro por productor.
- `GET /api/reports/show/:show_id` – reporte detallado de un show:
  - métricas por función,
  - ocupación vs asistencia,
  - desglose por ubicación,
  - detalle de ventas.
- `GET /api/reports/export/csv` – exportación de detalle de ventas a CSV con filtros.

**Bordereaux (`/api/bordereaux`)**:

- `GET /api/bordereaux/show/:show_id` – genera y/o recupera los bordereaux de un show:
  - agrupa ventas por ubicación, precio, canal y descuento,
  - calcula cortesías,
  - puede generar un PDF con el detalle económico del show.

### Descuentos (`/api/discounts`)

- `GET /api/discounts` – listado de descuentos (admin).
- `POST /api/discounts` – creación (porcentaje, fijo, interno, por show).
- `PUT /api/discounts/:id` – actualización.
- `DELETE /api/discounts/:id` – eliminación.

Integrados tanto en:

- Flujo online (aplicación de códigos antes de Mercado Pago).
- Boletería (descuentos internos).

### Productores (`/api/producers`)

- `GET /api/producers` – lista de productores activos (para asignar a shows).
- CRUD básico de productores y asociación con shows.
- Panel específico de reportes para productores en `/admin` filtrando por `producer_id`.

### Notificaciones y Activity Logs

- `/api/notifications`:
  - `GET /status` – chequeo de configuración SMTP.
  - `POST /test-email` – envio de email de prueba usando la plantilla de confirmación de compra.
- `/api/activity-logs`:
  - listado paginado con filtros (usuario, acción, entidad, rango de fechas, búsqueda),
  - endpoints para obtener tipos de acción y entidad,
  - estadísticas agregadas (`/stats`).

---

## Flujos de negocio principales

### 1. Compra online

1. Usuario navega a `/cartelera` → elige show y función.
2. Selecciona butacas/palcos/pullman (Socket.IO asegura exclusividad temporal).
3. Frontend crea una **reserva** (`POST /api/reservations`).
4. Se genera una **preferencia de MP** (`POST /api/payments/preference`).
5. Usuario paga en Mercado Pago → vuelve a `/mp/success` o `/mp/failure`.
6. Backend recibe el resultado (notificación MP), crea la **venta** y los **tickets**, libera/actualiza estados de asiento y envía email de confirmación.

### 2. Venta en boletería

1. Usuario de rol `boleteria` accede a `/boleteria`.
2. Abre caja (`/api/cash-register/open`) si corresponde.
3. Busca o crea cliente (`/api/users/search-quick` / `/api/users`).
4. Selecciona función y lugares (misma lógica realtime que la web).
5. Confirma venta indicando medio de pago (efectivo, MP, tarjeta, transferencia, QR).
6. Se crean venta y tickets sin pasar por MP (según método),
   y se actualizan reportes y caja.

### 3. Validación de entradas

1. Control en puerta usa `/validar` en móvil/tablet.
2. Lector QR (`html5-qrcode`) decodifica `ticket_id`.
3. Frontend llama a `POST /api/tickets/validate` con el QR.
4. Backend:
   - verifica ticket y QR,
   - controla estado (vendido, ya validado),
   - para palcos/pullman incrementa `capacity_validated` y detecta validación parcial/total,
   - devuelve información para mostrar feedback visual (ok, ya usado, error, etc.).

### 4. Reintegros

1. En `/admin` → sección **Reportes**, se abre el detalle de ventas.
2. Para ventas de boletería no reintegradas aparece botón **Devolver**.
3. Modal carga tickets con `GET /api/tickets?sale_id=...`:
   - tickets ya validados o parcialmente validados aparecen bloqueados.
   - operador selecciona qué entradas devolver.
4. Al confirmar:
   - frontend llama a `POST /api/cash-register/refund` con `sale_id`, motivo, email y opcional `ticket_ids`.
   - backend calcula monto, crea venta negativa (total o parcial), actualiza disponibilidad y caja, y envía email.

### 5. Productores y reportes

- Admin asocia productores a shows.
- Productor entra a `/admin`:
  - ve banner de “Panel de Productor”.
  - ve solo reportes (`/api/reports`) filtrados por sus shows.
- Puede consultar:
  - KPIs de ingresos, ocupación, asistencia.
  - desglose por ubicación.
  - detalle de ventas (según permisos configurados).

---

## Configuración y variables de entorno

### Backend (`backend/.env`)

Ejemplo (no usar estos valores en producción):

```env
# Server
PORT=4000
CORS_ORIGIN=http://localhost:5173

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=tep
DB_USER=<DB_USER>
DB_PASSWORD=<DB_PASSWORD>

# Auth
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=7d

# Mercado Pago
MP_ACCESS_TOKEN=<MP_ACCESS_TOKEN>
BASE_URL=http://localhost:4000        # URL pública del backend
FRONTEND_URL=http://localhost:5173    # URL pública del frontend
MP_WEBHOOK_SECRET=<MP_WEBHOOK_SECRET>
APP_URL=http://localhost:5173         # Base para redirects de MP

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=<SMTP_USER>
EMAIL_PASS=<SMTP_PASS>
EMAIL_FROM="Teatro Español Pigüé" <no-reply@tudominio.com>
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:4000
```

Para testing en dispositivos móviles / Safari se puede usar ngrok:

- publicar backend: `ngrok http 4000` y usar esa URL en `VITE_API_URL`, `BASE_URL`, `FRONTEND_URL` y `APP_URL` según necesidad.

---

## Scripts útiles

### Backend

```bash
cd backend
npm install
npm run dev        # desarrollo (nodemon)
npm start          # producción
npm run seed       # seed inicial de datos
npm run reseed     # limpia y vuelve a sembrar datos
npm run migrate    # ejecuta migraciones
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # arranca Vite en http://localhost:5173
npm run build      # build de producción
npm run preview    # sirve el build localmente
```

---

## Roles y permisos (resumen)

- **admin**
  - Acceso completo: shows, funciones, boletería, admin, reportes, analytics, descuentos, usuarios, notificaciones, logs, caja.
- **boleteria**
  - Boletería, validación de tickets, reportes operativos, caja.
- **productor**
  - Acceso a `/admin` solo en sección **Reportes**, limitado a sus shows.
- **espectador / premium**
  - Cartelera pública, compra online, perfil con entradas y QRs.

---

## Notas de trabajo

- Se recomienda crear un branch por feature (`feature/<nombre>`) y PR hacia `main`.
- Documentar cambios relevantes en este README o en docs adicionales.
- Mantener consistencia en nombres de rutas y contratos de API para facilitar futuras generaciones de código.

Este README actúa como **referencia de arquitectura y flujos** para futuros desarrollos sobre el sistema de ticketing del Teatro Español Pigüé.

