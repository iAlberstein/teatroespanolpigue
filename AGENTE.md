# AGENTE.md - Reglas de persistencia para el código de Teatro Español Pigüé

> Este archivo es la **fuente de verdad** para que cualquier agente IA (o desarrollador) que toque el repo no invente estructuras, nombres, formatos ni flujos. Antes de modificar cualquier archivo, leé las secciones relevantes. Si hay duda, consultá este documento antes de suponer.

## 1. Identidad del proyecto

- **Nombre**: Sistema de ticketing del Teatro Español Pigüé.
- **Dominio de producción**: `https://www.teatropigue.com.ar` (NO `nuevositio.teatropigue.com.ar`, ese subdominio fue migrado y redirige 301).
- **Repositorio**: `newTEP` (monorepo con `backend/` y `frontend/`).
- **Stack**: Node.js + Express + Sequelize + MySQL (backend), React 18 + Vite (frontend), Socket.IO (realtime), Nginx + PM2 (producción).

## 2. Arquitectura de alto nivel

### Backend (`/backend`)

- **Punto de entrada**: `backend/src/index.js`.
- **Rutas API**: `backend/src/routes/`. Se montan en `/api` vía `backend/src/routes/index.js`.
- **Modelos**: `backend/src/models/registerModels.js` define TODOS los modelos Sequelize y sus asociaciones.
- **Lógica compartida**: `backend/src/lib/`. Aquí viven helpers, email, QR, formatting, etc.
- **Middleware**: `backend/src/middleware/auth.js` (JWT + roles), `activityLogger.js` (auditoría).
- **Scripts**: `backend/src/scripts/` (seeds, migraciones ad-hoc, utilidades).
- **Migraciones SQL**: `backend/migrations/` (archivos numerados). Son la fuente de verdad del schema.

### Frontend (`/frontend`)

- **Punto de entrada**: `frontend/src/main.jsx` → `frontend/src/App.jsx`.
- **Páginas**: `frontend/src/pages/`.
- **Componentes**: `frontend/src/components/`.
- **Contextos**: `frontend/src/contexts/` (solo `AuthContext.jsx`).
- **Helpers**: `frontend/src/lib/`.
- **Estilos**: `frontend/src/styles/theme.js` (sistema de diseño). No usamos CSS-in-JS complejo; usamos objetos `style` con el theme.

## 3. Convenciones de nombres

### Backend

- **Tablas**: plural, `snake_case` (ej: `users`, `sales`, `cash_register_shifts`, `ateneo_clases`).
- **Modelos Sequelize**: `PascalCase` singular, mapeados a tabla plural en `registerModels.js`.
- **Columnas**: `snake_case`.
- **Variables de entorno**: `UPPER_SNAKE_CASE`.
- **Funciones**: `camelCase`.
- **Archivos de rutas**: `camelCase.js` (ej: `cashRegister.js`, `activityLogs.js`).
- **Endpoints**: `kebab-case` (ej: `/general-admission-availability`).
- **Constantes mágicas**: **NO hardcodear**. Usar variables de entorno o constantes nombradas en `lib/`.

### Frontend

- **Componentes React**: `PascalCase.jsx`.
- **Páginas**: `PascalCase.jsx`.
- **Helpers**: `camelCase.js`.
- **Imports**: usar extensión `.jsx` en imports de archivos JSX (ej: `import Home from './pages/Home.jsx';`).
- **Rutas de React Router**: públicas en español sin tildes (ej: `/conocenos`, `/trabaja-con-nosotros`, `/accesibilidad/hipoacusicos`).
- **Rutas ocultas**: `/aportes` no aparece en navbar ni footer.
- **Hooks**: `useCamelCase`.

## 4. Backend: reglas estrictas

### 4.1. Modelos y base de datos

- **Todos los modelos van en `backend/src/models/registerModels.js`**. No crear modelos en archivos separados salvo los que ya existen (`Bordereaux.js`, `ActivityLog.js`, `Producer.js`, `ShowProducer.js`).
- **Nunca modificar el schema directamente en producción sin migración SQL**. Cada cambio de schema debe tener su archivo `.sql` numerado en `backend/migrations/`.
- **IDs**: `users`, `shows`, `sessions`, `tickets`, `sales`, etc. usan `UUID` (`DataTypes.UUID`). Los modelos de Ateneo y Aportes usan `INTEGER` autoincremental.
- **Campos JSON**: Sequelize en MySQL devuelve strings a veces. Cada campo JSON debe tener un getter `get()` que parsee si es string. Ver `pricing_json` en `Show` y `Session` como ejemplo.
- **Asociaciones**: definirlas en `registerModels.js` después de crear todos los modelos. Usar `as` consistente.
- **ENUMs**: los valores se definen en minúscula y en inglés cuando son internos (`butaca`, `palco`, `pullman`, `general`, `service`). Los estados de Aportes/Ateneo pueden estar en español (`pendiente`, `pagado`, etc.).

### 4.2. Autenticación y roles

- **JWT**: `backend/src/middleware/auth.js`.
- **Roles legacy**: campo `users.role` (ENUM con `admin`, `boleteria`, `productor`, `espectador`, `premium`, `alumno_ateneo`, `docente_ateneo`).
- **Sistema multi-rol**: tablas `roles` y `user_roles`. El middleware carga `req.user.roles[]` desde la DB.
- **`requireRole` usa REST parameters, NUNCA arrays**:
  - ✅ `requireRole('admin', 'boleteria')`
  - ❌ `requireRole(['admin', 'boleteria'])` (crea array anidado)
- **Helpers disponibles**: `hasRole(user, 'admin')`, `hasAnyRole(user, 'admin', 'boleteria')`.
- **En el frontend**: usar `hasRole(...)` de `AuthContext`, NO comparar `user.role === 'admin'` directamente. El legacy `user.role` puede quedar desfasado del multi-rol.

### 4.3. Pagos y descuentos

- **Tipos de descuento** (`discounts.type`):
  - `percentage`: porcentaje regular.
  - `fixed`: monto fijo.
  - `internal`: cortesía (tratada como 100% en el cálculo). **En producción las cortesías reales son `percentage` con `value = 100.00`.**
- **Límite de uso**: `usage_limit` = cantidad de **tickets** individuales que puede descontar. `used_count` se incrementa por cantidad de tickets, no por transacción. El frontend recibe `remaining_uses`.
- **Medios de pago** (`sales.payment_method`):
  - `mp`: MercadoPago (online). `total_amount` INCLUYE el cargo por servicio.
  - `card`: SiPago (online). `total_amount` NO incluye cargo por servicio.
  - `cash`, `qr`, `transfer`, `efectivo`, `tarjeta`, `courtesy`: no incluyen cargo por servicio.
- **Al calcular ingreso neto**: solo dividir por `serviceFeeDivisor` cuando `payment_method === 'mp'`.
- **Bordereaux**: usa `ticket.price` (precio base), siempre correcto sin importar el medio de pago.
- **MercadoPago**: `payments.js` usa el SDK `mercadopago`. El token viene de `process.env.MP_ACCESS_TOKEN` o `MERCADOPAGO_ACCESS_TOKEN`. El webhook se valida con `MP_WEBHOOK_SECRET`.
- **SiPago**: `backend/src/lib/sipago.js`.

### 4.4. Fechas, horarios y timezone

- **Timezone obligatoria**: `process.env.TZ = 'America/Argentina/Buenos_Aires'` en `backend/src/index.js`.
- **Formato de fechas en UI**: siempre `DD/MM/AAAA`.
- **Formato de horas en UI**: siempre `HH:MM` (24 horas). **Nunca AM/PM.**
- **Helper de fechas backend**: `backend/src/lib/dateFormatter.js` (`formatDate`, `formatTime`, `formatDateTime`, `formatDateLong`).
- **Para formatear en UI**: usar `dateFormatter.js` o `toLocaleDateString('es-AR', ...)` con `hour12: false`.
- **Campos de fecha en DB**: `starts_at`/`ends_at` son `DATETIME`. `fecha_nacimiento` etc. son `DATEONLY`.

### 4.5. QR y tickets

- **QR individual**: `backend/src/lib/qr.js` → `generateTicketQR(ticket)`.
- **QR contenedor**: `backend/src/lib/qrGenerator.js` → `generateContainerQR(saleId, items)`.
- **Validación de QR**: `POST /api/tickets/validate` (o `validate-tickets` en algunos README; verificar la ruta real en `tickets.js`).
- **Palcos**: `PB` = Palco Bajo (4 personas), `PA` = Palco Alto (2 personas). Para validación parcial se usa `capacity` y `capacity_validated`.
- **Pullman**: sin asiento numerado, capacidad basada en `capacity`.
- **Entradas generales**: `type = 'general'` para salas `el_tablado` / `las_gemelas`. No tienen `seat_code`.

### 4.6. Email

- **Servicio principal**: `backend/src/lib/emailService.js` (`sendPurchaseConfirmation`).
- **Email de Ateneo**: `backend/src/lib/ateneoEmailService.js`.
- **Email de Aportes**: `backend/src/lib/aportesEmailService.js`.
- **Configuración**: variables `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`. También se aceptan prefijos `TICKETS_EMAIL_*` para compatibilidad.
- **Nunca loguear contraseñas ni tokens completos.**

### 4.7. Variables de entorno críticas

```env
# Servidor
PORT=4000
CORS_ORIGIN=http://localhost:5173

# DB
DB_HOST=localhost
DB_PORT=3306
DB_NAME=tep
DB_USER=...
DB_PASSWORD=...

# Auth
JWT_SECRET=...
JWT_EXPIRES_IN=7d

# MercadoPago
MP_ACCESS_TOKEN=...
MERCADOPAGO_ACCESS_TOKEN=...  # preferencia actual para aportes
MP_WEBHOOK_SECRET=...
BASE_URL=https://www.teatropigue.com.ar
FRONTEND_URL=https://www.teatropigue.com.ar
APP_URL=https://www.teatropigue.com.ar

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=...
EMAIL_PASS=...
EMAIL_FROM=...
ADMIN_NOTIFICATION_EMAILS=...

# SiPago
SIPAGO_API_KEY=...
SIPAGO_SECRET=...
```

- **Backend carga `.env.local` en desarrollo y `.env` en producción** (`backend/src/index.js:12`).

## 5. Frontend: reglas estrictas

### 5.1. API client

- **Usar `apiFetch` y `apiAuthFetch` de `frontend/src/lib/api.js` para TODAS las llamadas a `/api/...`.**
- **No usar `fetch` directamente** excepto para casos muy especiales (ej: `SponsorsMarquee` en `App.jsx` usa `fetch` para `/api/sponsors` porque ya es un caso aislado; aun así, preferir `apiFetch`).
- **JWT**: se envía en header `Authorization: Bearer <token>`. No usamos cookies (`credentials: 'omit'`).
- **URL de API**: `VITE_API_URL` en `frontend/.env`. En producción debe ser `https://www.teatropigue.com.ar` (sin `/api`).
- **Socket.IO**: usar `getSocketURL()` de `api.js` para obtener la URL base.

### 5.2. Autenticación en frontend

- **Contexto**: `AuthContext.jsx` expone `user`, `token`, `isAuthenticated`, `hasRole(...)`.
- **Rutas protegidas**: `ProtectedRoute.jsx` recibe `allowedRoles` como array.
- **Siempre usar `hasRole(...)` para chequeos de rol**. No confiar en `user.role` solo.

### 5.3. Estilo y diseño

- **Usar `theme` de `frontend/src/styles/theme.js`**. No hardcodear colores excepto en casos justificados.
- **Paleta**:
  - Primary: `#A78BFA`
  - Accent: `#FCA5A5`
  - Background: `#FAFAFA`
  - Surface: `#FFFFFF`
  - Text Primary: `#1F2937`
- **Espaciado**: múltiplos de 4px (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`).
- **Responsive**: `window.innerWidth < 768` es el criterio común para móvil. Preferir usar `useState` + `resize` listener cuando sea necesario.
- **Botones**: existen `components/ui/Button.jsx` y `components/ui/Card.jsx`. Evaluar si conviene usarlos antes de crear botones inline.

### 5.4. Formato de fechas en frontend

- **Siempre `DD/MM/AAAA` y `HH:MM` (24h).**
- **Nunca MM/DD/YYYY ni AM/PM.**
- Componente `DateInput.jsx` para inputs de fecha con formato argentino.

### 5.5. Flujos específicos

- **Guest checkout**: `GuestCheckoutModal.jsx`, `GuestCheckoutForm.jsx`, `LocationSelector.jsx`. El DNI vincula ventas a usuarios existentes. Si no existe, la venta se guarda como guest.
- **Aportes Solidarios**: `/aportes`, `/aportes/success`, `/aportes/pending`, `/aportes/failure`. Monto fijo `$5.000`. DNI es el código de referido. Regla: 4 aportes = 5 tickets (1 gratis).
- **Ateneo**: módulo bajo `/ateneo`. Roles `admin_ateneo`, `docente_ateneo`, `alumno_ateneo`. Rutas en `frontend/src/pages/ateneo/`.
- **Salas sin numerar**: `venue_type` en `shows` (`sala_principal`, `el_tablado`, `las_gemelas`). Usar `GeneralAdmissionSelection.jsx` para compra.

### 5.6. Rutas de la app

- `/` Home
- `/agenda` Cartelera
- `/detalle/:id` Selección de asientos/compra
- `/info/:id` Información del show
- `/perfil` Perfil de usuario
- `/login`, `/register`, `/recuperar-contrasena`, `/restablecer-contrasena`
- `/boleteria` (rol boleteria/admin)
- `/validar` (rol boleteria/admin)
- `/admin` (rol admin/boleteria/productor)
- `/activity-logs` (admin)
- `/ateneo`, `/ateneo/sobre`, `/ateneo/admin`, `/ateneo/docente`, `/ateneo/alumno`, `/ateneo/perfil`
- `/aportes`, `/aportes/success`, `/aportes/pending`, `/aportes/failure`
- `/sipago/success`, `/sipago/failure`

> **Nota**: existen componentes `MpSuccess.jsx`, `MpPending.jsx`, `MpFailure.jsx` pero actualmente NO están registrados en `App.jsx`. Si se necesita activar el flujo de retorno MP en el frontend, registrar las rutas explícitamente.

## 6. Migraciones y despliegue

- **Migraciones**: archivos numerados en `backend/migrations/`. En producción se ejecutan con `node src/scripts/runProductionMigrationComplete.js` o manualmente con `mysql`.
- **Backup antes de migrar**: `mysqldump -u dbTEP -p dbTEP > deploy-files/backup_YYYYMMDD_HHMMSS.sql`.
- **Build frontend**: `VITE_API_URL=https://www.teatropigue.com.ar npm run build`.
- **Deploy frontend**: `zip -r ../deploy-files/frontend-deploy.zip dist/`, subir, descomprimir y copiar `dist/index.html` + `dist/assets/*` a la raíz del servidor.
- **Deploy backend**: `zip -r ../deploy-files/backend-deploy.zip . -x "node_modules/*" -x ".git/*"`, subir, descomprimir en `backend/`, `npm install --production`, `pm2 restart tep-backend`.
- **Puerto backend en producción**: `4001` (PM2 `tep-backend`).
- **Nginx**: sirve estáticos desde `/home/teatropigue/htdocs/www.teatropigue.com.ar/`. Proxy `/api` y `/media` al backend.
- **Limpieza de dist**: antes de build, eliminar `frontend/dist` y el zip viejo para evitar bundles acumulados.

## 7. Cosas que NUNCA hacer

- **NO hardcodear URLs de producción** (salvo en `api.js` como fallback documentado).
- **NO hardcodear montos, capacidades, porcentajes ni tokens.**
- **NO usar `requireRole(['admin'])`** (arrays anidados).
- **NO usar `user.role === 'admin'` en frontend sin respaldo de `hasRole()`.
- **NO usar fechas en MM/DD/YYYY ni horas en AM/PM.**
- **NO crear modelos fuera de `registerModels.js`.**
- **NO modificar schema en producción sin migración SQL.**
- **NO loguear tokens, contraseñas, datos de tarjetas ni QR data completos.**
- **NO usar `console.log` en producción** para datos sensibles. Los logs de debug son aceptables en desarrollo.
- **NO asumir que un campo JSON viene como objeto**: siempre usar getter con parseo de string.
- **NO asumir que el rol legacy es la única fuente de roles.**
- **NO crear endpoints de pago sin validar webhooks/firmas.**
- **NO asumir que `total_amount` es siempre el precio base: para MP incluye service fee.**

## 8. Checklist antes de entregar un cambio

- [ ] ¿Se usó `apiFetch`/`apiAuthFetch` para llamadas a API?
- [ ] ¿Se usó `hasRole()` en lugar de `user.role`?
- [ ] ¿Se usó `requireRole('rol1', 'rol2')` en backend (sin arrays)?
- [ ] ¿Las fechas/horas se muestran en `DD/MM/AAAA` y `HH:MM` 24h?
- [ ] ¿Se agregó migración SQL si cambió el schema?
- [ ] ¿Se actualizó `registerModels.js` si se agregó un modelo?
- [ ] ¿Se registró la nueva ruta en `backend/src/routes/index.js`?
- [ ] ¿Se registró la nueva página/ruta en `frontend/src/App.jsx`?
- [ ] ¿Se usó el `theme` para colores/espaciado en frontend?
- [ ] ¿No hay constantes mágicas sin nombre?
- [ ] ¿Se validaron entradas y se manejaron errores con mensajes en español para el usuario?
- [ ] ¿Se probó el flujo en desarrollo (backend + frontend)?
- [ ] ¿Se actualizó este AGENTE.md si el cambio introduce una nueva regla o patrón?

## 9. Archivos que deben conocerse siempre

- `backend/src/index.js` - servidor, CORS, Socket.IO, dotenv.
- `backend/src/routes/index.js` - registro de rutas API.
- `backend/src/models/registerModels.js` - TODOS los modelos.
- `backend/src/middleware/auth.js` - autenticación y roles.
- `backend/src/lib/api.js` NO existe; usar `frontend/src/lib/api.js` en frontend.
- `frontend/src/App.jsx` - router y layout.
- `frontend/src/contexts/AuthContext.jsx` - auth y roles.
- `frontend/src/lib/api.js` - cliente HTTP.
- `frontend/src/styles/theme.js` - sistema de diseño.
- `README.md` - arquitectura general.
- `DESPLIEGUE.md` - proceso de deploy.
- `MEJORAS.md` - deuda técnica y mejoras planificadas.

---

**Última regla de oro**: si vas a agregar algo nuevo, primero mirá si ya existe un patrón similar en el código y seguilo. La consistencia es más importante que la elegancia personal.
