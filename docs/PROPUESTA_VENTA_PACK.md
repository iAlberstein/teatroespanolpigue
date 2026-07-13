# Propuesta de Implementación: Venta Pack Multi-Función

> **Estado de snapshot Git**: Antes de modificar este documento se realizó un commit con el mensaje `Foto previa a refactor de propuesta de pack de funciones`. Cualquier refactor posterior puede revertirse a ese punto.

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
| Servicios adicionales | **Por función** | Decisión del cliente: los servicios se eligen y facturan por cada función del pack. |
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

> **Convención de AGENTE.md**: Todos los campos JSON deben tener un getter en `registerModels.js` que parsee strings si Sequelize devuelve string.

### Nuevas columnas en `reservations`
```sql
ALTER TABLE reservations ADD COLUMN pack_id UUID NULL;
```
`pack_id` es un UUID generado por el frontend o backend para agrupar las reservas de cada sesión. Se setea en el momento del checkout (`sipago-pack-intent`).

> **Índice recomendado**: `CREATE INDEX reservations_pack_id_idx ON reservations(pack_id);`

### Nuevas columnas en `sales`
```sql
ALTER TABLE sales ADD COLUMN pack_sale_id UUID NULL;
```
Permite vincular cada venta hija (por función) con la venta pack padre.

### Nueva tabla `pack_sales`
```sql
CREATE TABLE pack_sales (
  id UUID PRIMARY KEY DEFAULT (UUID()),
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
  updated_at TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
);

CREATE INDEX sales_pack_sale_id_idx ON sales(pack_sale_id);
```

> **Corrección crítica**: Se usaba `gen_random_uuid()` (PostgreSQL). MySQL requiere `UUID()`. Además, todos los campos JSON (`service_items`, `metadata`) deben tener getter en el modelo Sequelize.

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

### Precisión y redondeo
- Todos los precios del pack se manejan como centavos en el backend (`Math.round`) y como enteros en el frontend. No usar floats para operaciones críticas de pago.
- `finalPrice` de cada slot se guarda en el item de reserva como entero.

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
- **Expiración coordinada**: cada vez que se actualiza cualquier reserva que pertenezca a un `pack_id`, extender `expires_at` de **todas** las reservas del pack al menos 10 minutos más. Esto evita que la primera función expire mientras el usuario elige la tercera.
- `PUT /api/reservations/:id/keepalive` opcional: endpoint para que el frontend extienda la expiración del pack mientras el usuario está en la UI sin avanzar al pago.

### 7.5. Payments (`backend/src/routes/payments.js`)

#### Nueva función `computePackTicketPrices(itemsBySession, packPricing, packMaxSessions)`
- Extraer a `backend/src/lib/packPricing.js` para poder importarla en tests y rutas.
- Implementa el algoritmo de stack-depth.
- Devuelve un array de tickets con `session_id`, `finalPrice`, `section`, `seat_code`, `type`, `capacity`, `quantity`.

#### `POST /api/payments/pack-preview`
- Recibe `{ reservation_ids: [...] }`.
- Devuelve el desglose exacto del pack sin crear `pack_sales` ni orden de pago.
- El frontend lo usa para mostrar el total en tiempo real sin reimplementar el algoritmo.
- Respuesta:
  ```json
  {
    "pack_id": null,
    "priced_tickets": [...],
    "subtotal": 200000,
    "discount_amount": 0,
    "services_subtotal": 0,
    "service_fee_amount": 20000,
    "service_fee_percent": 10,
    "total_amount": 220000
  }
  ```

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

> **Nota sobre `service_items`**: por decisión del cliente, los servicios se venden **por función**. Cada reserva del pack puede tener su propio `service_items`. En el intent se recibe `service_items` por reserva o se agrupan desde las reservas existentes. `pack_sales` guarda el `services_subtotal` total, y cada venta hija recibe la parte que le corresponde.

Pasos:
1. Validar que todas las reservas existan, estén `active` y no vencidas.
2. Validar que el `pack_size` (cantidad de reservas) sea <= `show.pack_max_sessions`.
3. Generar `pack_id` si no se envió.
4. Asignar `pack_id` a cada reserva.
5. Calcular `computePackTicketPrices` para todas las sesiones.
6. Calcular `subtotal` = suma de `finalPrice`.
7. Calcular `servicesSubtotal` sumando `service_items` de todas las reservas del pack.
8. Si hay `discount_id`, aplicar `computeDiscountAmount` sobre los tickets con `finalPrice`.
9. `serviceFeeAmount = round((subtotal - discountAmount + servicesSubtotal) * fee / 100)`.
10. `total = subtotal - discountAmount + serviceFeeAmount + servicesSubtotal`.
11. Guardar `pack_sales` con `payment_status: 'pending'`, incluyendo `customer_*`, `service_items` (resumen consolidado), `discount_id` y `metadata`.
12. Extender `expires_at` de todas las reservas del pack.
13. Crear orden Sipago con `total` en centavos y `webhookUrl` que incluya solo `pack_id` y el secret de webhook. **NO incluir `customer_*`, `service_items` ni `discount_id` en la URL.** Sipago ya demostró que puede strippear o truncar query params.

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
- Ejecutar dentro de una transacción Sequelize para evitar ventas parciales.
- Para cada reserva:
  1. Si `reservation.status === 'confirmed'` y `reservation.sale_id` existe, saltar (idempotencia por reserva).
  2. Verificar que no haya doble venta (butacas/palcos no vendidos, reserva no confirmada).
  3. Crear `Sale` hija con `session_id`, `pack_sale_id`, `user_id`, `payment_method`.
     - `subtotal` = suma de `Ticket.price` de la función.
     - `service_items` = los servicios que correspondan a esa función (tomados de `reservation.service_items`).
     - `services_subtotal` = suma de los servicios de esa función.
     - `discount_amount` = parte proporcional del descuento del pack asignada a esta función (basado en `subtotal / packSubtotal`).
     - `service_fee_amount` = `round((subtotal - discount_amount + services_subtotal) * fee / 100)`.
     - `total_amount` = `subtotal - discount_amount + service_fee_amount + services_subtotal`. Esto mantiene la coherencia con el requisito de que cada email de función cierre por sí solo, y es compatible con `bordereaux.js` siempre que los tickets tengan `ticket.price` correcto.
     - `discount_id` = id del descuento del pack.
  4. Crear `Ticket` por cada entrada usando `finalPrice`.
  5. Generar QR individual por ticket.
  6. Marcar `reservation.status = 'confirmed'` y `reservation.sale_id`.
  7. Emitir eventos WebSocket para la sesión.
- Actualizar `discount.used_count` una sola vez con el total de tickets descontados.
- Actualizar `pack_sales.payment_status = 'approved'`.
- Enviar **un email por función** usando `sendPurchaseConfirmation` con `packInfo`.
- Si ocurre un error inesperado, hacer rollback de la transacción.

#### `POST /api/payments/sipago-pack-confirm`
- Endpoint de fallback para el frontend.
- Lógica idéntica al webhook, pero llamado por `SipagoSuccess`.
- Debe ser idempotente.
- Extraer la lógica compartida del webhook y el confirm a un helper interno (`processPackPayment`) para evitar duplicar código.

#### `POST /api/payments/free-pack-emission`
- Para packs con `total === 0` (cortesía 100% o similar).
- Similar al webhook, crea `pack_sales` con `payment_method = 'courtesy'`, ventas hijas y tickets.
- No llama a Sipago.
- Requiere `discount_id` que haga el total cero, o validar que `total_amount === 0` por precios pack y permitir la emisión igual.

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

> **Advertencia técnica**: `Detalle.jsx` actualmente maneja un único `selectedSession` y `reservation`. Antes de agregar la lógica de packs se recomienda refactorizar el estado y la lógica de pago a un custom hook (`useCheckout`) para evitar duplicar código y reducir la complejidad del componente.

Nuevo estado:
```js
const [packEnabled, setPackEnabled] = useState(false);
const [packSize, setPackSize] = useState(null); // 1, 2, 3
const [packStep, setPackStep] = useState(0);
const [packSelections, setPackSelections] = useState({}); // { sessionId: selection }
const [packReservations, setPackReservations] = useState({}); // { sessionId: reservationId }
const [packBreakdown, setPackBreakdown] = useState(null); // resultado de /pack-preview
```

Flujo UI:
1. Si `show.pack_enabled` es `true`, mostrar botones: `1 función`, `2 funciones`, `3 funciones`.
2. Para cada paso, mostrar selector de sesión y luego `SeatSelection`.
3. El carrito acumula todas las funciones.
4. **No reimplementar `computePackTicketPrices` en el frontend.** Cada vez que cambia `packSelections`, llamar a `POST /api/payments/pack-preview` y mostrar el desglose devuelto.
5. Botón "Pagar" al finalizar todas las funciones. Al pagar se llama a `sipago-pack-intent` con los `reservation_ids` ya sincronizados.

> **Nota**: si se decide finalmente mantener un cálculo local en el frontend por UX, debe venir de un módulo JS puro (`frontend/src/lib/packPricing.js`) que sea copia exacta del helper del backend, incluyendo tests comparativos. La versión autoritativa es `/pack-preview`.

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
async function fetchPackPreview(reservationIds, discountId) {
  const res = await apiFetch('/api/payments/pack-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservation_ids: reservationIds, discount_id: discountId })
  });
  return await res.json();
}
```

- `packBreakdown` se actualiza desde el endpoint `/pack-preview`.
- El total mostrado, el descuento y el cargo por servicio siempre vienen del backend.
- Los `service_items` se manejan por reserva (por función), por lo que el preview ya los lee de las reservas.
- **Opcional**: tener un helper local `computePackTicketPrices` en `frontend/src/lib/packPricing.js` para actualizaciones inmediatas, pero nunca usarlo para el monto final de pago.

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
- `serviceFeeAmount` = proporción del cargo por servicio correspondiente a esa función, calculada en la venta hija.
- `totalAmount` = subtotal de la función - descuento proporcional + service fee de la función + servicios de la función.
- Sección "Resumen de tu pack" en el email con `packInfo`.
- Un email por función permite un QR por función.

### Decisión sobre el cargo por servicio en emails
- **Opción A (elegida)**: cada email de función muestra su proporción del cargo por servicio y el total del email cierra. El cliente confirmó esta opción.
- **Opción B (descartada)**: el cargo por servicio aparece solo en el resumen del pack. Se descarta porque el cliente quiere ver el cargo por servicio por función.

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
- `netPaid` para ventas `card` es `sale.total_amount` directamente (no se divide por `serviceFeeDivisor`, a diferencia de `mp`).
- Dado que las ventas hijas `card` incluirán el service fee proporcional (Opción A elegida), `netPaid` será `saleSubtotal - descuento + service_fee_proporcional + servicios`. Por lo tanto `discountMultiplier` será ligeramente mayor que el factor de descuento puro. Esto es aceptable porque el bordereaux muestra precio efectivo realmente pagado.
- Las variantes pack siguen separadas (`$20.000 * 0.9` y `$18.000 * 0.9` son `$18.000` y `$16.200`, por ejemplo).
- Si se quiere mostrar el **precio de lista** y el **precio con descuento** como columnas separadas, habría que agregar `list_price` al ticket o al bordereaux.

> **Nota**: si en el futuro se decide que las ventas hijas `card` no incluyan service fee (para ajustarse estrictamente a `AGENTE.md:89`), el bordereaux seguirá siendo correcto porque usa `ticket.price`. Solo cambiaría el `discountMultiplier` mostrado.

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
1. `shows.js`: aceptar y validar `pack_enabled`, `pack_pricing_json`, `pack_max_sessions`. Validar monotonía descendente de precios (`precio[1] >= precio[2] >= precio[3]`).
2. `sessions.js`: soportar `pack_size` en availability.
3. `reservations.js`: aceptar `pack_id`, consulta por pack, y expiración coordinada.
4. `payments.js`:
   - Crear `backend/src/lib/packPricing.js` con `computePackTicketPrices` y tests.
   - `pack-preview`.
   - `sipago-pack-intent`.
   - `sipago-pack-webhook` con transacción e idempotencia por reserva.
   - `sipago-pack-confirm` reutilizando helper.
   - `free-pack-emission`.
5. `emailService.js`: extender `sendPurchaseConfirmation` con `packInfo`.

### Fase 3: Frontend
1. `ShowForm.jsx`: UI de pack.
2. `SeatSelection.jsx`: props `initialSelection` y `pricingOverride`.
3. `Detalle.jsx`: flujo multi-función y `calculatePackPrices`.
4. `SipagoSuccess.jsx`: confirmación de pack.

### Fase 4: Pruebas
1. Compra simple sigue funcionando.
2. Pack de 2 funciones con cantidades iguales.
3. Pack de 2 funciones con 2 y 4 entradas.
4. Pack de 3 funciones con cantidades desiguales.
5. Bordereaux muestra variantes de precio.
6. Cupón de descuento aplicado sobre pack.
7. Emisión gratuita de pack con cupón 100%.
8. Webhook duplicado (idempotencia).
9. Confirm duplicado desde `SipagoSuccess`.
10. Fallo parcial del webhook y reintento (simular crash a mitad de transacción).
11. Servicios por función en pack.
12. Salas sin numerar (`general`) en pack.

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
| Una reserva del pack expira | Extender expiración de todas las reservas del pack al actualizar cualquiera. Si ya expiró, pedir reselección. |
| El usuario selecciona la misma sesión dos veces | Bloquear en el frontend. |
| Una butaca se vende mientras el usuario elige otra función | WebSocket actualiza la grilla; se invalida la selección. |
| `pack_pricing_json` no tiene clave para una profundidad | Fallback a `pack_pricing_json[min(depth, maxDisponible)]`. Nunca dejar `finalPrice` en undefined. |
| Cupón con `usage_limit` menor que el total de tickets | Aplicar descuento solo a las entradas más caras (lógica existente). El descuento se aplica sobre `finalPrice` del pack. |
| Pack total `$0` | Usar `free-pack-emission`. Si no hay cupón, permitir creación igual (la razón del total cero es precio pack o cortesía). |
| Webhook y confirm duplicados | Verificar `pack_sales.payment_status` y `reservation.status` antes de crear ventas/tickets. |
| `pack_sales` pendiente abandonado | Cron de limpieza opcional; `reservations` expiran automáticamente. |
| Palcos mixtos (PB y PA) en el pack | Emparejar por sección (`palcos_bajos` vs `palcos_altos`) por separado. |
| Venta parcial del pack (webhook cae a mitad) | Usar transacción Sequelize; el reintento debe saltar reservas ya confirmadas. |
| Salas sin numerar (`el_tablado`/`las_gemelas`) | Aplicar `section: 'general'`. La cantidad de slots es la cantidad de entradas generales seleccionadas por función. |
| `palcos_individual_seats = true` | Si el show/sesión vende palcos por butaca individual, el slot de emparejamiento es cada butaca, no el palco completo. |

## 14. Alternativas a evaluar

### 14.1. Precios por asiento con `seat_pricing`
Actualmente el pack pricing es por sección. Si el show usa `seat_pricing` para filas específicas, se puede extender:
```
finalPrice = baseSeatPrice * (packPricing[depth][section] / packPricing[1][section])
```
Esto mantiene el diferencial por fila y aplica el descuento multi-función proporcionalmente.

### 14.2. Servicios por función
**Elegida.** Los servicios se venden por función. Cada reserva del pack lleva su `service_items`, y cada venta hija se factura con su parte. `pack_sales.service_items` puede ser un resumen consolidado.

### 14.3. Asignación del cargo por servicio en emails
**Opción A elegida.** Cada email de función muestra su proporción del cargo por servicio y el total del email cierra.

### 14.4. Tabla `pack_sales` vs extender `sales`
Opción descartada: reutilizar `sales` con `session_id` null como venta padre. Se descartó porque `session_id` es `NOT NULL` y muchas consultas asumen que toda `Sale` tiene sesión. Una tabla separada es más limpia.

### 14.5. Emparejamiento por asiento exacto
Actualmente el emparejamiento es por cantidad y sección. Otra opción sería emparejar por código de asiento idéntico entre funciones (ej. A5 en función 1 con A5 en función 2). Esto requiere que el usuario elija el mismo asiento en cada función, lo cual es más restrictivo pero más explícito.

## 15. Decisiones del negocio ya resueltas

| # | Pregunta | Decisión |
|---|----------|----------|
| 1 | ¿Pack pricing por sección o por `seat_pricing` por fila/asiento? | Por sección en primera instancia. |
| 2 | ¿Servicios por pack o por función? | **Por función.** Cada reserva del pack puede tener `service_items`. |
| 3 | ¿Cargo por servicio en emails? | **Por función.** Cada email muestra su proporción y el total cierra. |
| 4 | ¿Funciones de diferentes shows en un pack? | **No.** Todas del mismo `show_id`. |
| 5 | ¿Pack de 1 función reemplaza a compra simple? | **No.** Si se compra 1 sola función se usa el flujo regular. |
| 6 | ¿Asiento idéntico en todas las funciones? | **No.** El usuario elige asientos/ubicaciones diferentes. | 

## 16. Notas críticas para la IA implementadora

1. **MySQL, no PostgreSQL**: usar `UUID()` en lugar de `gen_random_uuid()`. Los campos `pack_id` y `pack_sale_id` deben ser `UUID`.
2. **JSON getters**: en `registerModels.js`, agregar getter para `pack_pricing_json`, `service_items` y `metadata` de `pack_sales`, igual que `pricing_json`.
3. **No reimplementar el algoritmo en frontend**: usar `POST /api/payments/pack-preview` como fuente autoritativa del desglose.
4. **Transacciones**: el webhook y el confirm del pack deben ejecutarse dentro de `sequelize.transaction()`.
5. **Idempotencia por reserva**: verificar `reservation.status === 'confirmed'` y `reservation.sale_id` antes de crear cada venta hija, no solo `pack_sales.payment_status`.
6. **Service fee por función (Opción A)**: cada venta hija debe calcular su proporción de descuento y service fee. `total_amount` de cada hija cierra por sí solo.
7. **Servicios por función**: `service_items` se guardan en cada `Reservation` (o se reciben por reserva en el intent), y cada `Sale` hija recibe su parte.
8. **URL del webhook**: incluir solo `pack_id` y secret. Los datos del cliente y servicios deben leerse de `pack_sales`.
9. **Expiración coordinada**: tocar una reserva del pack extiende todas las demás.
10. **Tests del algoritmo**: agregar tests unitarios para los ejemplos de las secciones 6.1 y 6.2.
11. **Despliegue**: ejecutar migración, reiniciar PM2, y limpiar `frontend/dist` antes de build (ver `DESPLIEGUE.md`).
12. **Palcos individuales**: si `show.palcos_individual_seats` o `session.palcos_individual_seats` es `true`, cada butaca de palco es un slot, no el palco completo.

## 17. Referencias de código

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
