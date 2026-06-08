# Contexto de integración Mercado Pago (Checkout Pro)

Quiero que actúes como un desarrollador que ya conoce este repo y me ayude a mantener/ajustar la integración de Mercado Pago Checkout Pro. A continuación te doy el contexto clave del proyecto:

- **Stack**
- **Framework**: Next.js (App Router).
- **SDK**: `mercadopago` usando `MercadoPagoConfig`, `Preference` y `Payment`.
- **Runtime**: `nodejs` en rutas y páginas que interactúan con MP.
- **Persistencia**: archivo JSON local `db/message.db`.

- **Variables de entorno**
- `MP_ACCESS_TOKEN`: Token de acceso del vendedor. Requerido para el SDK.
- `APP_URL`: Base URL pública del sitio, usada en `back_urls` (default local: `http://localhost:3000`).
- Algunas rutas cargan env con `@next/env` y fuerzan IPv4 con `setDefaultResultOrder("ipv4first")`.

- **Configuración del SDK**
- Archivo: `src/api.ts`
- Exporta `mercadopago = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN!, options: { timeout: 5000 } })`.

- **Flujo de Checkout Pro (redirect)**
1. En la home (`src/app/page.tsx`) el usuario escribe un mensaje y hace submit.
2. El server action llama `api.message.submit(text)` que:
   - Crea una preferencia con `Preference(mercadopago).create(...)`.
   - Ítem fijo “Mensaje de muro” (precio 100), `metadata: { text }`.
   - `back_urls`: `${APP_URL}/success|/failure|/pending`.
   - `auto_return: "approved"`.
   - Usa `idempotencyKey`.
   - Devuelve `init_point` y se hace `redirect(init_point)` a Checkout Pro.
3. Al volver por éxito (`src/app/success/page.tsx`):
   - Lee `payment_id`, `status`, `preference_id` de `searchParams`.
   - Si `status === "approved"` y hay `preference_id`, obtiene la preferencia vía SDK y extrae `metadata.text`.
   - Guarda el mensaje en `db/message.db` y hace `revalidatePath("/")`.

- **Webhook de notificaciones (opcional, también guarda mensaje)**
- Ruta: `src/app/api/mercadopago/route.ts` (POST).
- Recibe `{ data: { id: string } }`, hace `Payment(mercadopago).get({ id })`.
- Si `payment.status === "approved"`, guarda `payment.metadata.text` en `db` y `revalidatePath("/")`.
- Responde `200` siempre para confirmar recepción.

- **Rutas utilitarias**
- `src/app/api/env-check/route.ts`: expone presencia de `MP_ACCESS_TOKEN` y `APP_URL` (enmascara token).
- `src/app/api/mp-test/route.ts`: endpoint de diagnóstico que:
  - Carga env si falta.
  - Hace `GET https://api.mercadopago.com/users/me` con el token.
  - Intenta crear una preferencia de prueba vía SDK.
  - Devuelve ambos resultados en JSON.

- **Archivos clave**
- `src/api.ts` (config SDK + lógica de crear preferencia y persistir mensajes).
- `src/app/page.tsx` (form y server action).
- `src/app/success/page.tsx` (manejo de retorno y guardado por preferencia).
- `src/app/api/mercadopago/route.ts` (webhook de notificaciones).
- `src/app/api/env-check/route.ts`, `src/app/api/mp-test/route.ts` (diagnóstico).
- `db/message.db` (persistencia local).

- **Buenas prácticas ya aplicadas**
- No se loguea el token completo (solo prefijo).
- `idempotencyKey` para crear preferencias.
- `revalidatePath("/")` tras guardar datos.

- **Qué espero que hagas**
- Entender y respetar este flujo de Checkout Pro por redirección.
- Cualquier cambio debe seguir usando el SDK y `MP_ACCESS_TOKEN` desde env.
- Si ajustas montos, items o `back_urls`, mantener `APP_URL` y `auto_return: "approved"`.
- Si propones mejoras de robustez, mantén logs mínimos y nunca expongas el token.
- Si agregas pruebas, puedes usar `/api/env-check` y `/api/mp-test`.

- **Preguntas frecuentes a resolver aquí**
- Dónde cambiar monto/ítems: en `src/api.ts`, dentro de `api.message.submit(...)`.
- Dónde ajustar retorno: `back_urls` en `api.message.submit(...)` y lectura en `success/page.tsx`.
- Dónde manejar notificaciones: `src/app/api/mercadopago/route.ts` (webhook).
