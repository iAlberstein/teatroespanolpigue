# Propuesta de Implementación: Venta Pack Multi-Función

## 1. Resumen ejecutivo

Permitir que un espectador compre entradas para **1, 2 o 3 funciones** de un mismo show en una sola compra, con un **precio por entrada que depende de cuántas funciones la incluyan** y con **un solo cargo por servicio** para todo el pack.

### Regla de negocio clave
- Si el cliente compra 2 entradas en la función A y 4 en la función B, solo 2 entradas de la función B pueden cobrarse al **precio de 2 funciones**; las 2 restantes se cobran al **precio de 1 función**.
- El criterio es **profundidad de stack**: una entrada en la posición `k` de una función se empareja con las entradas en la posición `k` de las otras funciones. La cantidad de funciones que tienen al menos `k` entradas determina el precio de esa entrada.

## 2. Objetivos

1. Soportar la compra de packs de 1/2/3 funciones dentro de un mismo show.
2. Aplicar precios diferenciales por entrada, respetando las cantidades desiguales por función.
3. Cobrar el **cargo por servicio una sola vez** sobre el total del pack.
4. Generar **una venta y un email de confirmación por función** (cada uno con su QR de función).
5. Reflejar en el **bordereaux** las variantes de precio (`$20.000` vs `$18.000`) como filas separadas.
6. Mantener el flujo de compra simple intacto para shows no pack.

## 3. Contexto y estado actual

La arquitectura actual es **sesión-centric**:

- `Show` define `venue_type` y `pricing_json`.
- `Session` representa cada función.
- `Reservation` guarda los items seleccionados para **una** función.
- `Sale` se crea por cada `Reservation` confirmada.
- `Ticket` se crea por cada entrada vendida.
- `payments.js` maneja `sipago-intent`, `sipago-webhook`, `sipago-confirm`, `free-emission`.
- `Detalle.jsx` tiene `calculatePrices()` para un único carrito por sesión.
- `bordereaux.js` agrupa tickets por `ubicación | precio efectivo | canal | código de descuento`.

### Archivos relevantes
- `backend/src/routes/payments.js`
- `backend/src/routes/reservations.js`
- `backend/src/routes/sessions.js`
- `backend/src/routes/shows.js`
- `backend/src/models/registerModels.js`
- `backend/src/lib/emailService.js`
- `backend/src/lib/seatPricing.js`
- `backend/src/routes/bordereaux.js`
- `frontend/src/pages/Detalle.jsx`
- `frontend/src/components/SeatSelection.jsx`
- `frontend/src/components/admin/ShowForm.jsx`
- `frontend/src/components/admin/BordereauxModal.jsx`

## 4. Decisiones de diseño y supuestos

| Decisión | Valor elegido | Motivo |
|----------|---------------|--------|
| Precio por pack | **Por profundidad de stack** (no un precio plano por pack) | Responde a la duda de cantidades desiguales por función. |
| Emparejamiento por sección | Sí | Una platea no se empareja con un palco de otra función. |
| Ordenamiento dentro de cada función | **Mayor precio primero** | Aprovecha el descuento multi-función en las entradas más caras. |
| Pack pricing | **Por sección** (`platea_general`, `palcos_bajos`, `palcos_altos`, `pullman`, `general`) | Simple y cubre el ejemplo `$20.000 / $18.000` en platea general. |
| Palcos | Precio **por palco** (no por persona) | Consistente con `Ticket.price` y `Ticket.capacity` actuales. |
| Cargo por servicio | **Una vez** sobre `(subtotal tickets - descuento cupón + servicios)` | Requisito explícito. |
| Cupones de descuento | Aplican **después** del precio pack, sobre el total del pack | Mantiene separados los conceptos de precio pack y descuento promocional. |
| Servicios adicionales | **A nivel pack** (opcional) | Simplifica la lógica. Se pueden agregar por sesión en una versión futura. |
| Emails | **Un email por función** con resumen del pack en cada uno | Cada función tiene su QR. El cliente ve el total pack y el subtotal de esa función. |
| Pagos | **Una única orden Sipago** por el total del pack | No se cobra por sesión. |

## 5. Esquema de base de datos

### Nuevas columnas en `shows`
```sql
ALTER TABLE shows ADD COLUMN pack_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shows ADD COLUMN pack_pricing_json JSON NULL;
ALTER TABLE shows ADD COLUMN pack_max_sessions INT NOT NULL DEFAULT 3;
```

`pack_pricing_json` ejemplo:
```json
{
  "1": {
    "platea_general": 20000,
    "palcos_bajos": 80000,
    "palcos_altos": 60000,
    "pullman": 15000,
    "general": 15000
  },
  "2": {
    "platea_general": 18000,
    "palcos_bajos": 72000,
    "palcos_altos": 54000,
    "pullman": 13500,
    "general": 13500
  },
  "3": {
    "platea_general": 16000,
    "palcos_bajos": 64000,
    "palcos_altos": 48000,
    "pullman": 12000,
    "general": 12000
  }
}
```

### Nuevas columnas en `reservations`
```sql
ALTER TABLE reservations ADD COLUMN pack_id VARCHAR(36) NULL;
```
`pack_id` es un UUID generado por el frontend o backend para agrupar las reservas de cada sesión. Se setea en el momento del checkout (`sipago-pack-intent`).

### Nuevas columnas en `sales`
```sql
ALTER TABLE sales ADD COLUMN pack_sale_id UUID NULL;
```
Permite vincular cada venta hija (por función) con la venta pack padre.

### Nueva tabla `pack_sales`
```sql
CREATE TABLE pack_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id),
  discount_id UUID NULL REFERENCES discounts(id),
  payment_method VARCHAR(50) NOT NULL,
  payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  service_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  service_fee_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  services_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  service_items JSON NULL,
  customer_name VARCHAR(255) NULL,
  customer_email VARCHAR(255) NULL,
  customer_phone VARCHAR(255) NULL,
  customer_dni VARCHAR(255) NULL,
  customer_provincia VARCHAR(255) NULL,
  customer_localidad VARCHAR(255) NULL,
  sipago_order_id VARCHAR(255) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## 6. Algoritmo de precios por profundidad de stack

### Definición
Para cada `Ticket` se determina su **profundidad**: el número de funciones del pack que tienen al menos la misma cantidad de entradas en la misma sección, ordenadas de mayor a menor precio.

### Pseudocódigo
```text
function computePackTicketPrices(itemsBySession, packPricing):
  // itemsBySession: { sessionId: [item] }
  // item: { type, section, seat_code, price, quantity, unit_price, capacity }

  slotsBySection = groupBySection(itemsBySession)
  result = []

  for (section, sessionSlots) in slotsBySection:
    maxCount = max(sessionSlots.map(s => s.length))

    for k from 0 to maxCount - 1:
      depth = 0
      for session in sessionSlots:
        if session.length > k:
          depth += 1

      priceForDepth = packPricing[min(depth, packMaxSessions)][section]

      for session in sessionSlots:
        if session.length > k:
          slot = session[k]
          slot.finalPrice = priceForDepth
          result.push(slot)

  return result
```

### Ejemplo 1: 2 funciones, 2 y 4 entradas
- Función A: 2 entradas platea.
- Función B: 4 entradas platea.

| Posición | Funciones con ≥ posición | Profundidad | Precio |
|----------|--------------------------|-------------|--------|
| 1 | A, B | 2 | `$18.000` |
| 2 | A, B | 2 | `$18.000` |
| 3 | B | 1 | `$20.000` |
| 4 | B | 1 | `$20.000` |

Resultado: 4 entradas a `$18.000`, 2 entradas a `$20.000`.

### Ejemplo 2: 3 funciones, 5, 3 y 2 entradas
- Función A: 5 entradas.
- Función B: 3 entradas.
- Función C: 2 entradas.

| Posición | Funciones con ≥ posición | Profundidad | Precio |
|----------|--------------------------|-------------|--------|
| 1 | A, B, C | 3 | `$16.000` |
| 2 | A, B, C | 3 | `$16.000` |
| 3 | A, B | 2 | `$18.000` |
| 4 | A | 1 | `$20.000` |
| 5 | A | 1 | `$20.000` |

Resultado:
- Función A: 2 a `$16.000`, 1 a `$18.000`, 2 a `$20.000`.
- Función B: 2 a `$16.000`, 1 a `$18.000`.
- Función C: 2 a `$16.000`.

### Tratamiento de tipos de ticket

| Tipo | Slot de emparejamiento | `Ticket.price` |
|------|------------------------|----------------|
| `butaca` | 1 asiento = 1 slot | Precio del pack para `platea_general` |
| `palco` | 1 palco = 1 slot | Precio del pack para `palcos_bajos`/`palcos_altos` (precio por palco) |
| `pullman` | `quantity` slots de 1 persona | Precio por persona según profundidad |
| `general` | `quantity` slots de 1 persona | Precio por persona según profundidad |

## 7. Cambios en el backend

### 7.1. Modelos (`backend/src/models/registerModels.js`)

Agregar al modelo `Show`:
- `pack_enabled`
- `pack_pricing_json`
- `pack_max_sessions`

Agregar al modelo `Reservation`:
- `pack_id`

Agregar al modelo `Sale`:
- `pack_sale_id`

Crear nuevo modelo `PackSale` mapeado a la tabla `pack_sales`.

### 7.2. Shows (`backend/src/routes/shows.js`)

`POST /` y `PUT /:id` deben aceptar `pack_enabled`, `pack_pricing_json`, `pack_max_sessions`.

Validación:
- Si `pack_enabled` es true, `pack_pricing_json` debe tener claves para `1` a `pack_max_sessions`.
- Para `sala_principal` las secciones son `platea_general`, `palcos_bajos`, `palcos_altos`, `pullman`.
- Para `el_tablado`/`las_gemelas` la sección es `general`.

### 7.3. Sessions (`backend/src/routes/sessions.js`)

`GET /api/sessions/:id/availability` aceptar query param `pack_size`.

Si `pack_size` está presente:
- Usar `show.pack_pricing_json[pack_size]` como `basePricing` para `getSeatPrice` y `getPriceTiers`.
- Esto permite que `SeatSelection` muestre precios aproximados del pack.

**Nota:** el precio final no se conoce hasta el checkout, porque depende de las otras funciones seleccionadas.

### 7.4. Reservations (`backend/src/routes/reservations.js`)

- `POST /api/reservations` y `PUT /api/reservations/:id` aceptar `pack_id` opcional (se setea en el intent).
- `GET /api/reservations?pack_id=:packId` para obtener todas las reservas de un pack.

### 7.5. Payments (`backend/src/routes/payments.js`)

#### Nueva función `computePackTicketPrices(itemsBySession, packPricing, packMaxSessions)`
- Implementa el algoritmo de stack-depth.
- Devuelve un array de tickets con `session_id`, `finalPrice`, `section`, `seat_code`, `type`, `capacity`, `quantity`.

#### `POST /api/payments/sipago-pack-intent`
```json
{
  "reservation_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "discount_id": "uuid-desc",
  "service_items": [{"service_id": "x", "name": "Cava", "price": 5000, "quantity": 1}],
  "customer_name": "...",
  "customer_email": "...",
  "customer_phone": "...",
  "customer_dni": "...",
  "customer_provincia": "...",
  "customer_localidad": "..."
}
```

Pasos:
1. Validar que todas las reservas existan, estén `active` y no vencidas.
2. Generar `pack_id` si no se envió.
3. Asignar `pack_id` a cada reserva.
4. Calcular `computePackTicketPrices` para todas las sesiones.
5. Calcular `subtotal` = suma de `finalPrice`.
6. Si hay `discount_id`, aplicar `computeDiscountAmount` sobre los tickets con `finalPrice`.
7. Calcular `servicesSubtotal`.
8. `serviceFeeAmount = round((subtotal - discountAmount + servicesSubtotal) * fee / 100)`.
9. `total = subtotal - discountAmount + serviceFeeAmount + servicesSubtotal`.
10. Guardar `pack_sales` con `payment_status: 'pending'`.
11. Extender `expires_at` de todas las reservas del pack.
12. Crear orden Sipago con `total` en centavos y `webhookUrl` que incluya `pack_id`.

Respuesta:
```json
{
  "checkout_url": "https://...",
  "pack_id": "uuid-pack"
}
```

#### `POST /api/payments/sipago-pack-webhook`
- Recibe `pack_id` en query params.
- Busca `pack_sales` y todas las reservas con ese `pack_id`.
- Si el estado no es `SUCCESS`, responde 200.
- Verifica `pack_sales.payment_status !== 'approved'`.
- Para cada reserva:
  1. Verificar que no haya doble venta (butacas/palcos no vendidos, reserva no confirmada).
  2. Crear `Sale` hija con `session_id`, `pack_sale_id`, `user_id`, `payment_method`, `total_amount` = subtotal de la función, `discount_id` (del pack), `service_items` (null o vacío).
  3. Crear `Ticket` por cada entrada usando `finalPrice`.
  4. Generar `container_qr` y QR individual por ticket.
  5. Marcar `reservation.status = 'confirmed'` y `reservation.sale_id`.
  6. Emitir eventos WebSocket para la sesión.
- Actualizar `discount.used_count` una sola vez con el total de tickets descontados.
- Actualizar `pack_sales.payment_status = 'approved'`.
- Enviar **un email por función** usando `sendPurchaseConfirmation` con `packInfo`.

#### `POST /api/payments/sipago-pack-confirm`
- Endpoint de fallback para el frontend.
- Lógica idéntica al webhook, pero llamado por `SipagoSuccess`.
- Debe ser idempotente.

#### `POST /api/payments/free-pack-emission`
- Para packs con `total === 0` (cortesía 100% o similar).
- Similar al webhook, crea `pack_sales` con `payment_method = 'courtesy'`, ventas hijas y tickets.
- No llama a Sipago.

## 8. Cambios en el frontend

### 8.1. ShowForm (`frontend/src/components/admin/ShowForm.jsx`)

Agregar sección **"Pack multi-función"**:
- Toggle `pack_enabled`.
- Si está activo, mostrar `pack_max_sessions` (default 3).
- Mostrar bloques de precios para `1`, `2` y `3` funciones con campos según `venue_type`:
  - `sala_principal`: `platea_general`, `palcos_bajos`, `palcos_altos`, `pullman`.
  - `el_tablado` / `las_gemelas`: `general`.
- Validar que todos los precios sean > 0.

### 8.2. Detalle.jsx (`frontend/src/pages/Detalle.jsx`)

Nuevo estado:
```js
const [packEnabled, setPackEnabled] = useState(false);
const [packSize, setPackSize] = useState(null); // 1, 2, 3
const [packStep, setPackStep] = useState(0);
const [packSelections, setPackSelections] = useState({}); // { sessionId: selection }
const [packReservations, setPackReservations] = useState({}); // { sessionId: reservationId }
```

Flujo UI:
1. Si `show.pack_enabled` es `true`, mostrar botones: `1 función`, `2 funciones`, `3 funciones`.
2. Para cada paso, mostrar selector de sesión y luego `SeatSelection`.
3. El carrito acumula todas las funciones.
4. `calculatePrices` debe recalcular usando `computePackTicketPrices` en el frontend.
5. Botón "Pagar" al finalizar todas las funciones.

### 8.3. SeatSelection (`frontend/src/components/SeatSelection.jsx`)

Nuevas props:
- `initialSelection`: para restaurar la selección cuando se vuelve a una función ya elegida.
- `pricingOverride`: para usar `pack_pricing_json[packSize]` como `basePricing`.
- `packMode`: booleano para indicar que el precio final es aproximado.

Ajustes:
- Usar `initialSelection` al montar el componente.
- Si `pricingOverride` está presente, usarlo en lugar de `data.pricing` de `/availability`.
- No resetear selección al cambiar de sesión si hay `initialSelection`.

### 8.4. Cálculo de precios en el frontend

```js
function calculatePackPrices(packSelections, packPricing, packMaxSessions) {
  const itemsBySession = buildItemsBySession(packSelections);
  const pricedTickets = computePackTicketPrices(itemsBySession, packPricing, packMaxSessions);
  const subtotal = pricedTickets.reduce((sum, t) => sum + t.finalPrice, 0);
  // aplicar descuento, servicios, cargo por servicio
}
```

**Nota:** el frontend debe reimplementar la lógica de stack-depth para mostrar el total correcto antes de pagar. El backend la recalcula al crear el intent.

### 8.5. Página de éxito Sipago

La URL de éxito incluirá `pack_id`:
```
/sipago/success?pack_id=uuid-pack
```

`SipagoSuccess` debe llamar a `POST /api/payments/sipago-pack-confirm` con `pack_id` y mostrar el resumen del pack.

## 9. Emails

### `backend/src/lib/emailService.js`

Extender `sendPurchaseConfirmation` con el parámetro opcional `packInfo`:
```js
{
  packSubtotal: 100000,
  packDiscountAmount: 10000,
  packServiceFeeAmount: 9000,
  packServiceFeePercent: 10,
  packServicesSubtotal: 5000,
  packTotalAmount: 104000,
  packSize: 3
}
```

### Envío por función
Para cada `Sale` hija:
- `sendPurchaseConfirmation` recibe los tickets de esa función.
- `subtotal` = suma de `Ticket.price` de la función.
- `totalAmount` = subtotal (sin servicio pack) o subtotal + proporción del servicio.
- Sección "Resumen de tu pack" en el email con `packInfo`.
- Un email por función permite un QR por función.

### Alternativa a evaluar
Se puede evaluar si conviene asignar `serviceFeeAmount` proporcionalmente a cada función para que cada email cierre por sí solo, o dejar el `serviceFeeAmount` en 0 en el email de la función y mostrar el `packTotalAmount` en el resumen.

## 10. Bordereaux

### Cómo se reflejan las variantes de precio
- `Ticket.price` almacena el precio real de la entrada (`$20.000` o `$18.000`).
- `bordereaux.js` agrupa con la clave:
  ```js
  `${location}|${effectivePrice.toFixed(2)}|${channel}|${discountCode || 'none'}`
  ```
- Si dos entradas de `platea_general` tienen `ticket.price` `$20.000` y `$18.000`, aparecen como **dos filas distintas**.

### Si se aplica un cupón adicional
- `bordereaux.js` calcula `discountMultiplier = netPaid / saleSubtotal`.
- Multiplica `ticket.price` por ese factor.
- Las variantes siguen separadas (`$20.000 * 0.9` y `$18.000 * 0.9` son `$18.000` y `$16.200`, por ejemplo).
- Si se quiere mostrar el **precio de lista** y el **precio con descuento** como columnas separadas, habría que agregar `list_price` al ticket o al bordereaux.

### Diagrama de agrupación
```
platea_general | $20.000 | online | none -> 4 entradas
platea_general | $18.000 | online | none -> 2 entradas
```

## 11. Retrocompatibilidad

- `pack_enabled` default `false`.
- `pack_pricing_json` y `pack_max_sessions` default `3`.
- `reservations.pack_id` y `sales.pack_sale_id` nullable.
- Endpoints existentes (`sipago-intent`, `sipago-webhook`, `sipago-confirm`, `free-emission`) no se modifican.
- Se agregan endpoints nuevos con prefijo `pack`.
- `bordereaux.js` no requiere cambios para ver variantes; opcionalmente se le puede agregar `list_price`.

## 12. Plan de implementación

### Fase 1: Base de datos
1. Crear migración con las columnas y tabla nuevas.
2. Actualizar `registerModels.js`.

### Fase 2: Backend
1. `shows.js`: aceptar y validar `pack_enabled`, `pack_pricing_json`, `pack_max_sessions`.
2. `sessions.js`: soportar `pack_size` en availability.
3. `reservations.js`: aceptar `pack_id` y consulta por pack.
4. `payments.js`:
   - `computePackTicketPrices`.
   - `sipago-pack-intent`.
   - `sipago-pack-webhook`.
   - `sipago-pack-confirm`.
   - `free-pack-emission`.
5. `emailService.js`: extender `sendPurchaseConfirmation` con `packInfo`.

### Fase 3: Frontend
1. `ShowForm.jsx`: UI de pack.
2. `SeatSelection.jsx`: props `initialSelection` y `pricingOverride`.
3. `Detalle.jsx`: flujo multi-función y `calculatePackPrices`.
4. `SipagoSuccess.jsx`: confirmación de pack.

### Fase 4: Pruebas
1. Compra simple sigue funcionando.
2. Pack de 1 función con precios pack.
3. Pack de 2 funciones con cantidades iguales.
4. Pack de 2 funciones con 2 y 4 entradas.
5. Pack de 3 funciones con cantidades desiguales.
6. Bordereaux muestra variantes de precio.
7. Cupón de descuento aplicado sobre pack.
8. Emisión gratuita de pack.
9. Webhook duplicado (idempotencia).

### Fase 5: Despliegue
1. Ejecutar migraciones en staging.
2. Desplegar backend y frontend.
3. Probar con un show no visible.
4. Habilitar `pack_enabled` en producción para un show de prueba.
5. Monitorear logs de `payments.js` y `bordereaux.js`.

## 13. Casos borde y consideraciones

| Caso | Tratamiento |
|------|-------------|
| El usuario cambia de pack de 2 a 3 funciones | Cancelar reservas anteriores y reiniciar selección. |
| Una reserva del pack expira | Mostrar error y pedir reselección de esa función. |
| El usuario selecciona la misma sesión dos veces | Bloquear en el frontend. |
| Una butaca se vende mientras el usuario elige otra función | WebSocket actualiza la grilla; se invalida la selección. |
| `pack_pricing_json` no tiene clave para una profundidad | Fallback a `pack_pricing_json[1]` o al máximo disponible. |
| Cupón con `usage_limit` menor que el total de tickets | Aplicar descuento solo a las entradas más caras (lógica existente). |
| Pack total `$0` | Usar `free-pack-emission`. |
| Webhook y confirm duplicados | Verificar `pack_sales.payment_status` y `reservation.status`. |
| `pack_sales` pendiente abandonado | Cron de limpieza opcional; `reservations` expiran automáticamente. |
| Palcos mixtos (PB y PA) en el pack | Emparejar por sección (`palcos_bajos` vs `palcos_altos`) por separado. |

## 14. Alternativas a evaluar

### 14.1. Precios por asiento con `seat_pricing`
Actualmente el pack pricing es por sección. Si el show usa `seat_pricing` para filas específicas, se puede extender:
```
finalPrice = baseSeatPrice * (packPricing[depth][section] / packPricing[1][section])
```
Esto mantiene el diferencial por fila y aplica el descuento multi-función proporcionalmente.

### 14.2. Servicios por función
En lugar de servicios a nivel pack, permitir elegir servicios por cada función. Implica cambiar `reservations` para guardar `service_items` por sesión y repartir el `servicesSubtotal` en cada `Sale` hija.

### 14.3. Asignación del cargo por servicio en emails
- **Opción A**: Cada email de función muestra su proporción del cargo por servicio. El total del email cierra.
- **Opción B**: El cargo por servicio aparece solo en el resumen del pack, y cada email de función muestra solo el subtotal de esa función.

### 14.4. Tabla `pack_sales` vs extender `sales`
Opción descartada: reutilizar `sales` con `session_id` null como venta padre. Se descartó porque `session_id` es `NOT NULL` y muchas consultas asumen que toda `Sale` tiene sesión. Una tabla separada es más limpia.

### 14.5. Emparejamiento por asiento exacto
Actualmente el emparejamiento es por cantidad y sección. Otra opción sería emparejar por código de asiento idéntico entre funciones (ej. A5 en función 1 con A5 en función 2). Esto requiere que el usuario elija el mismo asiento en cada función, lo cual es más restrictivo pero más explícito.

## 15. Preguntas abiertas

1. ¿El pack pricing es por sección o necesita respetar reglas de `seat_pricing` por fila/asiento?
2. ¿Los servicios adicionales se venden por pack o por función?
3. ¿Cómo se quiere mostrar el cargo por servicio en los emails de cada función?
4. ¿Se permite que un pack incluya funciones de diferentes shows? (Se asume que no.)
5. ¿El pack de 1 función reemplaza a la compra simple o es solo una opción más dentro del pack?
6. ¿Se quiere que el usuario elija exactamente el mismo asiento para todas las funciones o puede elegir asientos diferentes?

## 16. Referencias de código

- `backend/src/routes/payments.js` (webhook e intent actuales)
- `backend/src/routes/reservations.js` (CRUD de reservas)
- `backend/src/routes/sessions.js` (availability y precios)
- `backend/src/routes/shows.js` (creación/edición de shows)
- `backend/src/models/registerModels.js` (modelos de datos)
- `backend/src/lib/emailService.js` (emails de confirmación)
- `backend/src/lib/seatPricing.js` (precios por asiento)
- `backend/src/routes/bordereaux.js` (reporte de liquidación)
- `frontend/src/pages/Detalle.jsx` (carrito y pago)
- `frontend/src/components/SeatSelection.jsx` (selector de butacas)
- `frontend/src/components/admin/ShowForm.jsx` (formulario de show)
- `frontend/src/components/admin/BordereauxModal.jsx` (visualización de bordereaux)
