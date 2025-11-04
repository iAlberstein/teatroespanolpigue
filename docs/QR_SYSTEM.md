# Sistema de QR Codes y Validación de Entradas

## Resumen

El sistema genera códigos QR únicos para cada ticket vendido, permitiendo validar la entrada en el control de accesos del evento. Los QR codes contienen información encriptada del ticket y no pueden ser duplicados.

## Arquitectura

### Backend

#### Modelo de Datos

**Ticket** (actualizado):
```javascript
{
  id: UUID,
  session_id: UUID,
  user_id: UUID,
  seat_code: String,
  section: String,
  type: ENUM('butaca', 'palco', 'pullman'),
  qr_code: String (unique),        // Base64 data URL de la imagen
  qr_data: TEXT,                    // JSON con datos encriptados
  status: ENUM('sold', 'validated', 'blocked'),
  validated_at: Date,               // Cuándo se validó
  validated_by: UUID                // Quién lo validó
}
```

**Validation** (nuevo modelo):
```javascript
{
  id: UUID,
  ticket_id: UUID,
  validated_by: UUID,
  device_info: JSON,                // Info del dispositivo usado
  ip_address: String,
  validation_type: ENUM('qr_scan', 'manual'),
  createdAt: Date                   // Timestamp automático
}
```

#### Generación de QR Codes

Ubicación: `backend/src/lib/qr.js`

**Función `generateTicketQR(ticket)`**:
1. Crea un objeto JSON con datos del ticket + salt random
2. Genera imagen QR en base64 (300x300px, alta calidad)
3. Retorna `{ qr_code, qr_data }`

Estructura del QR:
```json
{
  "ticket_id": "uuid",
  "session_id": "uuid",
  "user_id": "uuid",
  "type": "butaca",
  "seat_code": "A1",
  "salt": "random-hex-string",
  "timestamp": "2025-11-03T12:00:00Z"
}
```

**Características de seguridad**:
- Salt único por ticket (evita duplicación)
- Timestamp de creación
- Todos los campos críticos del ticket
- QR de alta corrección de errores (nivel H)

#### Validación de Tickets

**Endpoint**: `POST /api/tickets/validate`

**Headers**:
```
Authorization: Bearer <jwt_token>
```

**Rol requerido**: `boleteria` o `admin`

**Body**:
```json
{
  "qr_data": "{\"ticket_id\":\"...\",\"session_id\":\"...\"}",
  "validation_type": "qr_scan" | "manual"
}
```

**Flujo de validación**:
1. Parsear QR data para obtener `ticket_id`
2. Buscar ticket en DB con relaciones (Session, Show)
3. Validar que QR data coincida con ticket (usando `validateQRData`)
4. Verificar status del ticket:
   - Si `validated`: retornar 409 "already_validated"
   - Si no es `sold`: retornar 400 "invalid_status"
5. Actualizar ticket:
   - `status` → `'validated'`
   - `validated_at` → now
   - `validated_by` → user_id del validador
6. Crear registro en `validations` table
7. Retornar éxito con datos del show/sesión

**Response exitosa**:
```json
{
  "success": true,
  "message": "Ticket validated successfully",
  "ticket": {
    "id": "uuid",
    "type": "butaca",
    "seat_code": "A1",
    "section": "platea",
    "status": "validated",
    "validated_at": "2025-11-03T12:30:00Z"
  },
  "show": {
    "title": "Show Name",
    "date": "2025-12-01",
    "time": "20:00"
  },
  "session": {
    "starts_at": "2025-12-01T20:00:00Z",
    "ends_at": "2025-12-01T22:00:00Z"
  },
  "time_warning": null | "Session starts in X hours" | "Session has already ended"
}
```

**Errores posibles**:
- `400 invalid_qr_format`: JSON malformado
- `400 invalid_qr_data`: Falta ticket_id
- `404 ticket_not_found`: Ticket no existe
- `400 qr_mismatch`: QR no coincide con ticket
- `409 already_validated`: Ticket ya validado
- `400 invalid_status`: Status del ticket incorrecto

#### Otros Endpoints

**GET `/api/tickets/:id`**
- Requiere autenticación
- El usuario solo puede ver sus propios tickets
- Admin/boleteria pueden ver todos

**GET `/api/tickets/:id/validations`**
- Requiere rol `admin` o `boleteria`
- Retorna historial de validaciones del ticket
- Incluye info del validador

### Frontend

#### Visualización de QR Codes

**Página**: `Perfil.jsx`

- Muestra todas las entradas del usuario en formato card
- Botón "📱 Ver QR" para cada ticket
- Modal fullscreen con:
  - Imagen del QR code (base64)
  - Info del ticket
  - Instrucciones para mostrar en acceso

**Estados visuales**:
- 🎟️ Comprada (azul)
- ✅ Validada (verde)
- 🚫 Bloqueada (gris)

#### Validación de Entradas

**Página**: `ValidateTicket.jsx`

- Accesible solo para `boleteria` y `admin`
- Formulario para pegar datos del QR
- Validación en tiempo real
- Feedback visual inmediato:
  - ✅ Verde: entrada válida
  - ⚠️ Amarillo: ya validada
  - ❌ Rojo: error/inválida

**Flujo de uso**:
1. Personal de boletería escanea QR con dispositivo
2. Copia el texto JSON del QR
3. Lo pega en el formulario de validación
4. Sistema valida y muestra resultado
5. Personal permite o niega el acceso

## Instalación y Configuración

### Backend

1. Instalar dependencia:
```bash
cd backend
npm install qrcode
```

2. Las nuevas columnas en `tickets` table se crean automáticamente al iniciar el server (Sequelize sync).

3. Crear usuario de boletería para testing:
```bash
npm run create-boleteria
```

Esto crea:
- Email: `boleteria@teatroespanol.com`
- Password: `boleteria123`
- Rol: `boleteria`

### Frontend

No requiere dependencias adicionales. Los cambios están en:
- `pages/Perfil.jsx`: Vista de tickets con QR
- `pages/ValidateTicket.jsx`: Validación de entradas
- `App.jsx`: Rutas protegidas

## Flujo Completo de Uso

### 1. Compra de Entrada

1. Usuario compra tickets en `/cartelera/:id`
2. Completa pago con Mercado Pago
3. Backend en webhook o `/confirm`:
   - Crea tickets en DB
   - Genera QR único para cada ticket
   - Guarda `qr_code` (imagen) y `qr_data` (JSON)
4. Tickets aparecen en `/perfil` del usuario

### 2. Acceso al Evento

Usuario:
1. Va a `/perfil`
2. Selecciona su entrada
3. Click en "📱 Ver QR"
4. Muestra el QR en pantalla

Personal de Boletería:
1. Escanea QR con dispositivo/app
2. Copia datos del QR
3. Accede a `/validar`
4. Pega datos y valida
5. Ve confirmación verde → permite acceso
6. O ve error/ya validado → niega acceso

### 3. Auditoría

Admin puede:
- Ver historial de validaciones: `GET /api/tickets/:id/validations`
- Ver quién validó cada ticket
- Ver timestamp y dispositivo usado

## Seguridad

### Prevención de Duplicados

- Cada QR tiene un `salt` único random
- El mismo ticket genera diferentes QR codes cada vez
- La validación compara campos críticos, no la imagen

### Prevención de Reuso

- Una vez validado, el ticket queda marcado con `status='validated'`
- Intentos posteriores retornan `409 already_validated`
- Se registra timestamp y validador en el ticket

### Validación de Datos

```javascript
function validateQRData(scannedData, ticket) {
  const parsed = JSON.parse(scannedData);
  return (
    parsed.ticket_id === ticket.id &&
    parsed.session_id === ticket.session_id &&
    parsed.user_id === ticket.user_id &&
    parsed.type === ticket.type &&
    parsed.seat_code === ticket.seat_code
  );
}
```

Todos los campos deben coincidir exactamente.

### Control de Acceso

- Validación solo disponible para roles `boleteria` y `admin`
- JWT obligatorio en todas las rutas de tickets
- Usuarios solo ven sus propios tickets
- Registro completo de cada validación (auditoría)

## Testing

### Crear Tickets de Prueba

1. Registrarse como usuario normal
2. Comprar entradas en cualquier show
3. Completar pago (usar tarjetas de prueba de MP)
4. Verificar que aparezcan en perfil con QR

### Validar Tickets

1. Crear usuario de boletería:
```bash
cd backend
npm run create-boleteria
```

2. Login con:
   - Email: `boleteria@teatroespanol.com`
   - Password: `boleteria123`

3. Acceder a `/validar` (link en navbar)

4. En otra ventana/dispositivo:
   - Login como el usuario que compró
   - Ir a `/perfil`
   - Click en "Ver QR" de un ticket
   - Click derecho en la imagen → "Inspeccionar elemento"
   - Buscar el atributo `src` de la `<img>`
   - Copiar solo la parte después de `data:image/png;base64,`
   - Decodificar en https://www.base64decode.org/ (o similar)
   - Copiar el JSON resultante

5. Volver a `/validar`
   - Pegar el JSON en el textarea
   - Click "Validar Entrada"
   - Verificar respuesta ✅

6. Intentar validar de nuevo
   - Debería mostrar ⚠️ "Ya validada"

### Casos de Prueba

| Caso | Esperado |
|------|----------|
| QR válido de ticket `sold` | ✅ Validación exitosa |
| QR válido de ticket ya `validated` | ⚠️ Already validated |
| QR con datos modificados | ❌ QR mismatch |
| QR de ticket inexistente | ❌ Ticket not found |
| QR malformado (JSON inválido) | ❌ Invalid QR format |
| Usuario sin rol validando | 🚫 403 Forbidden |

## Futuras Mejoras

### Escaneo Directo con Cámara

Integrar librería como `jsQR` o `html5-qrcode`:

```javascript
import { Html5QrcodeScanner } from "html5-qrcode";

const scanner = new Html5QrcodeScanner("reader", { 
  fps: 10, 
  qrbox: 250 
});

scanner.render((decodedText) => {
  // decodedText contiene el JSON del QR
  validateTicket(decodedText);
});
```

### QR Code en Email

Al confirmar compra, enviar email con:
- QR code embebido como imagen
- Link para ver ticket online
- Instrucciones de acceso

### Validación Offline

- Sincronizar lista de tickets válidos en dispositivo
- Validar sin conexión
- Sincronizar validaciones al reconectar

### Estadísticas

- Dashboard de validaciones por evento
- Gráficos de afluencia en tiempo real
- Detección de intentos de fraude

## Troubleshooting

### QR no se genera

**Síntoma**: Tickets creados pero `qr_code` es null

**Causa**: Error en librería qrcode

**Solución**:
```bash
cd backend
npm install qrcode
npm run dev
```

### QR no se muestra en perfil

**Síntoma**: Modal abre pero no hay imagen

**Causa**: `qr_code` no es base64 data URL válido

**Verificar**:
```sql
SELECT id, LEFT(qr_code, 30) FROM tickets WHERE qr_code IS NOT NULL LIMIT 1;
```

Debe empezar con `data:image/png;base64,`

### Validación falla siempre

**Síntoma**: Todos los QR retornan "QR mismatch"

**Causa**: Datos del QR no coinciden con ticket en DB

**Debug**:
```javascript
// En validateQRData, agregar logs:
console.log('Parsed:', parsed);
console.log('Ticket:', ticket);
```

Verificar que todos los campos coincidan.

## API Reference

Ver documentación completa de endpoints en `/docs/API.md` (próximamente).

## Soporte

Para issues o preguntas sobre el sistema de QR codes, contactar al equipo de desarrollo o abrir un issue en GitHub.
