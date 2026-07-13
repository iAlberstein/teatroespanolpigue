# MEJORAS.md - Análisis de inconsistencias y propuestas de limpieza

> Este documento es el resultado de una revisión estructural del repo `newTEP`. Contiene inconsistencias detectadas, código duplicado, archivos potencialmente innecesarios y recomendaciones ordenadas por impacto. No es un plan de acción inmediato: cada ítem debe evaluarse antes de ejecutarse.

## 1. Resumen ejecutivo

El proyecto es funcional y tiene una arquitectura clara, pero acumuló deuda técnica por desarrollo iterativo rápido. Los principales focos de limpieza son:

1. **Código duplicado** en servicios de email y utilidades de asientos/QR.
2. **Código muerto** en páginas de retorno de MercadoPago y scripts de migración antiguos.
3. **Inconsistencias de roles** entre el sistema legacy (`users.role`) y el multi-rol (`roles`/`user_roles`).
4. **Constantes mágicas** y URLs hardcodeadas esparcidas.
5. **Directorios y archivos temporales** que no deberían estar en el repo.
6. **Mejoras de robustez** en manejo de errores, logging y validaciones.

## 2. Inconsistencias críticas

### 2.1. Doble sistema de roles (legacy vs multi-rol)

- **Problema**: `users.role` sigue existiendo como ENUM y muchos lugares del frontend lo usan directamente. El backend ya cargó `roles`/`user_roles` en `auth.js`.
- **Impacto**: un usuario con `users.role = 'espectador'` pero con rol `admin` en `user_roles` puede ser bloqueado en el frontend.
- **Lugares detectados**:
  - `frontend/src/App.jsx:406-427` usa `user?.role === 'boleteria'`, `user?.role === 'admin'` para mostrar/ocultar links.
  - `frontend/src/pages/Admin.jsx:43-54` usa `user.role` para decidir acceso y sección inicial.
  - `frontend/src/components/admin/Reports.jsx` (9 matches de `user.role`).
  - `frontend/src/components/admin/BordereauxModal.jsx`, `ActivityLogs.jsx`, `Users.jsx`, etc.
- **Recomendación**: migrar todas las comparaciones de `user.role` a `hasRole(...)` del `AuthContext`. Evaluar si se puede eliminar `users.role` o al menos no depender de él en el frontend.

### 2.2. Múltiples servicios de email con lógica duplicada

- **Problema**: hay cuatro servicios de email que hacen cosas similares:
  - `backend/src/lib/emailService.js` (principal, compras)
  - `backend/src/lib/emailer.js` (plantilla antigua con PDF)
  - `backend/src/lib/ateneoEmailService.js` (Ateneo)
  - `backend/src/lib/aportesEmailService.js` (Aportes)
- **Impacto**: duplicación de configuración SMTP, de transporters, de plantillas base. Cambiar el SMTP requiere tocar varios archivos.
- **Recomendación**:
  - Crear un `backend/src/lib/email/sendEmail.js` único con transporter, reintentos y logueo.
  - `emailService.js`, `ateneoEmailService.js` y `aportesEmailService.js` solo deberían generar el HTML y llamar al send común.
  - Evaluar si `emailer.js` todavía se usa; si no, eliminarlo.

### 2.3. Dos librerías de QR

- **Problema**: `backend/src/lib/qr.js` (QR individual) y `backend/src/lib/qrGenerator.js` (contenedor + individual legacy) coexisten.
- **Impacto**: riesgo de usar la función incorrecta. `generateIndividualQR` en `qrGenerator.js` parece no usarse (el QR individual real se genera en `qr.js`).
- **Recomendación**:
  - Consolidar todo en `backend/src/lib/qr.js`.
  - Renombrar funciones a `generateTicketQR` (individual) y `generateSaleContainerQR` (contenedor).
  - Eliminar `qrGenerator.js` si `generateIndividualQR` no tiene consumidores.

### 2.4. Formato de fechas inconsistente en frontend ✅ COMPLETADO

- **Problema**: había ~238 usos de `new Date()`, `toLocaleDateString` y `toLocaleTimeString` en el frontend. Aunque la mayoría usaba `'es-AR'`, no siempre se forzaba `hour12: false` y en algunos lugares se usaba `new Date()` sin manejo de timezone.
- **Impacto**: riesgo de mostrar horas AM/PM o fechas desfasadas en ciertos navegadores/horarios.
- **Solución aplicada**:
  - Se creó el helper `frontend/src/lib/dateFormatter.js` con funciones centralizadas (`formatDate`, `formatTime`, `formatDateTime`, `formatDateLong`, `formatDateShort`, `formatDateTimeCompact`, `formatMonthYear`, `formatDateISO`).
  - Se reemplazó el formateo de fechas/horas en las páginas y componentes principales: `Detalle.jsx`, `SipagoSuccess.jsx`, `MpSuccess.jsx`, `Perfil.jsx`, `Agenda.jsx`, `Boleteria.jsx`, `Validador.jsx`, `Home.jsx`, `ShowInfo.jsx`, `Cartelera.jsx`, `Reports.jsx`, `Billing.jsx`, `Dashboard.jsx`, `BordereauxModal.jsx`, `TicketViewModal.jsx`, `SessionManager.jsx`, `BoxOfficeSessionPicker.jsx`, `ShowList.jsx`, `ActivityLogs.jsx`, `UserTicketsModal.jsx`, `ComparisonReport.jsx`, `TrendsCharts.jsx`, `RendicionPDF.jsx`, `AportesAdmin.jsx`, y el módulo Ateneo (`AteneoAdmin.jsx`, `AteneoAlumno.jsx`, `AteneoDocente.jsx`).
  - El helper utiliza `hour12: false` y `timeZone: 'America/Argentina/Buenos_Aires'` para garantizar formato `DD/MM/AAAA` y hora 24hs en todos los casos.
  - Las fechas provenientes de strings `YYYY-MM-DD` se tratan como local para evitar desface de día.

### 2.5. Capacidades y porcentajes hardcodeados

- **Problema**: constantes mágicas en el código.
- **Lugares detectados**:
  - `backend/src/index.js:181` usa `capacity || 92` como fallback para Pullman sin justificar el 92.
  - `backend/src/lib/emailService.js` asume `serviceFeePercent = 10` en el email (ver `MpSuccess.jsx` también lo asume).
  - `frontend/src/pages/MpSuccess.jsx:21` tiene `serviceFeePercent = 10` hardcodeado.
  - `backend/src/models/registerModels.js:112` `capacity_override` default 154.
  - `frontend/src/pages/Aportes.jsx` y `backend/src/routes/aportes.js` asumen monto de aporte $5.000.
- **Recomendación**: extraer a variables de entorno o a un archivo de configuración central (`backend/src/lib/config.js` / `frontend/src/lib/config.js`).

### 2.6. Páginas de retorno de MercadoPago sin uso

- **Problema**: existen `frontend/src/pages/MpSuccess.jsx`, `MpPending.jsx`, `MpFailure.jsx` pero no están registradas en `frontend/src/App.jsx`. El flujo actual probablemente redirige a `/perfil` o `/detalle`.
- **Impacto**: código muerto que confunde. README dice que existen esas rutas pero no están activas.
- **Recomendación**:
  - Decidir si se usa el retorno MP en el frontend o si se maneja todo por webhook.
  - Si se usa, registrar las rutas en `App.jsx`.
  - Si no se usa, eliminar los componentes o marcarlos como legacy en un comentario.

## 3. Código duplicado

### 3.1. `formatSeatLocation` en frontend y backend

- `frontend/src/lib/seatFormatter.js` y `backend/src/lib/seatFormatter.js` tienen funciones casi idénticas con pequeñas diferencias (ej: "Butaca" vs "Asiento").
- **Recomendación**: unificar la lógica. El backend puede enviar `location` ya formateada y el frontend solo mostrarla. Mantener un solo `formatSeatLocation` canónico en backend.

### 3.2. Configuración de transporter SMTP

- `emailService.js`, `emailer.js`, `ateneoEmailService.js`, `aportesEmailService.js` y `notifications.js` repiten la lógica de leer `EMAIL_*` y `TICKETS_EMAIL_*`.
- **Recomendación**: un helper `getEmailConfig()` / `createTransporter()` compartido.

### 3.3. Navbar duplicada (Teatro y Ateneo)

- `frontend/src/App.jsx` contiene dos componentes grandes: `Navbar()` y `AteneoNavbar()`. Comparten mucha lógica (menú hamburguesa, click outside, estilos).
- **Recomendación**: crear un `BaseNavbar` parametrizado y dos instancias livianas.

### 3.4. Funciones de cálculo de descuentos

- `frontend/src/components/admin/Discounts.jsx`, `frontend/src/pages/Detalle.jsx`, `backend/src/routes/discounts.js` y `backend/src/routes/payments.js` contienen lógica similar de aplicar porcentaje/fijo/cortesía.
- **Recomendación**: centralizar en `backend/src/lib/pricing.js` (existe `seatPricing.js` pero no cubre descuentos generales) y exponer un endpoint `/api/pricing/calculate` que el frontend consuma.

## 4. Archivos y directorios potencialmente innecesarios

### 4.1. `backend_temp_extract/`

- Es una copia parcial del backend con migraciones antiguas, `.env`, `package.json`, etc.
- **Recomendación**: eliminar si es solo un backup temporal. Si se necesita conservar, moverlo fuera del repo (ej: a un gist o al directorio personal del usuario) porque confunde con el backend real.

### 4.2. `deploy-files/*.zip`

- Son zips de deploy que se regeneran en cada release. Acumulan versiones viejas (`backend-aportes.zip`, `frontend-localidades-fix.zip`, etc.).
- **Recomendación**:
  - No versionar los zips en git (agregar a `.gitignore`).
  - Mantener solo el último par `backend-deploy.zip` / `frontend-deploy.zip` si es necesario, o eliminarlos del repo y generarlos localmente solo al deployar.

### 4.3. `backend/src/lib/emailer.js`

- Versión antigua del servicio de email. Parece no tener consumidores actuales (los imports son de `emailService.js` y los específicos de Ateneo/Aportes).
- **Recomendación**: verificar que ninguna ruta lo importe; si es así, eliminar.

### 4.4. `backend/src/lib/qrGenerator.js`

- `generateIndividualQR` parece no usarse. `generateContainerQR` es el único posible consumidor.
- **Recomendación**: consolidar con `qr.js` y eliminar.

### 4.5. Scripts de migración antiguos

- `backend/src/scripts/add-missing-columns.js`, `fixQRColumn.js`, `alterQrColumns.js`, `runMigration015.js`, `runProductionMigration.js`, `runProductionMigrationComplete.js`, `migrateSalesQRContainer.js`, etc.
- Muchos son scripts de una sola ejecución que ya corrieron en producción.
- **Recomendación**: moverlos a `backend/src/scripts/archive/` o documentar cuáles son de un solo uso. Mantener activos solo `seed.js`, `reseed.js`, `runMigration.js`, `sendReminders.js`, `checkDatabase.js` y los de utilidad recurrente.

### 4.6. `frontend/src/pages/Cartelera.jsx`

- Parece no estar registrado en `App.jsx` (la cartelera pública es `/agenda` → `Agenda.jsx`).
- **Recomendación**: confirmar si se usa; si no, eliminar.

### 4.7. `frontend/src/components/ui/Button.jsx` y `Card.jsx`

- Son componentes de UI reutilizables pero se usan en muy pocos lugares (4 matches en todo el frontend). El resto del código crea botones inline con `theme`.
- **Recomendación**: decidir si se adoptan como estándar (reemplazando botones inline) o se eliminan para no tener dos patrones. Usarlos consistentemente reduce duplicación de estilos.

### 4.8. `docs/mp.md`

- Es un documento de contexto para otro proyecto (Next.js, App Router, `db/message.db`). No aplica a este repo.
- **Recomendación**: eliminar o moverlo a una carpeta de docs de terceros para no confundir.

## 5. Problemas de robustez y seguridad

### 5.1. Validaciones de entrada inconsistentes

- Algunos endpoints validan campos manualmente con regex sueltos; otros no validan DNI/telefono/email.
- **Recomendación**: crear un `backend/src/lib/validators.js` con funciones reutilizables (`validateDNI`, `validateEmail`, `validatePhone`, `validateCUIT` si aplica). Usarlo en `auth.js`, `users.js`, Ateneo y Aportes.

### 5.2. Logging excesivo en producción

- Hay 780+ `console.log/error/warn` en el backend. Muchos podrían filtrar datos o ruido.
- **Recomendación**:
  - Usar un logger con niveles (o al menos centralizar en `backend/src/lib/logger.js`).
  - Convertir logs de debug en `console.log` condicionales a `NODE_ENV !== 'production'`.
  - Nunca loguear `req.body` de pagos ni tokens.

### 5.3. JWT secret fallback inseguro

- `backend/src/middleware/auth.js:4` y `backend/src/routes/auth.js:11` tienen `JWT_SECRET = process.env.JWT_SECRET || 'iStein2513'`.
- **Recomendación**: lanzar error si no está definido en producción. El fallback solo debe existir en tests/development.

### 5.4. Manejo de errores en el frontend

- Muchos `catch` solo hacen `console.error` y no muestran feedback al usuario.
- **Recomendación**: estandarizar un helper `frontend/src/lib/handleError.js` que muestre mensajes amigables y loguee detalles.

### 5.5. `credentials: 'omit'` en CORS y fetch

- Es correcto porque no usamos cookies, pero hay que asegurarse de que ningún endpoint nuevo dependa de cookies/session.

## 6. Optimizaciones sugeridas

### 6.1. Centralizar configuración

- Crear `backend/src/lib/config.js` con:
  - service fee %
  - capacidades default
  - monto de aporte
  - URLs del site
  - timeouts
- Crear `frontend/src/lib/config.js` con mirrors de lo que necesite el frontend.
- Esto elimina constantes mágicas y facilita cambios de negocio.

### 6.2. Unificar lógica de precios

- Extraer `calculateTotal()` en backend que reciba tickets, descuento, service fee y servicios, y devuelva subtotal, descuento, fee, total. Usarla en pagos y en email.
- El frontend puede consumirla o duplicarla solo si es imprescindible para UX offline.

### 6.3. Normalizar nombres de variables de entorno

- Actualmente hay `MP_ACCESS_TOKEN`, `MERCADOPAGO_ACCESS_TOKEN`, `EMAIL_*`, `TICKETS_EMAIL_*`.
- **Recomendación**: elegir un prefijo único. `TICKETS_*` es ambiguo. Preferir `EMAIL_*` para todo email y `MP_ACCESS_TOKEN` para MercadoPago. Deprecar `TICKETS_EMAIL_*` con un warning.

### 6.4. Refactor de `App.jsx`

- Es un archivo muy grande (~1100 líneas) con dos navbars, footer, sponsors, lógica de routing y estilos inline.
- **Recomendación**: separar en `components/layout/Navbar.jsx`, `AteneoNavbar.jsx`, `Footer.jsx`, `SponsorsMarquee.jsx`, `AppRoutes.jsx`.

### 6.5. Refactor de `frontend/src/pages/Boleteria.jsx`

- 168KB y 168.286 líneas? (realmente es un archivo enorme). Contiene toda la lógica de venta presencial.
- **Recomendación**: separar en subcomponentes: `BoxOfficeSaleFlow`, `PaymentSelector`, `CustomerSearch`, `TicketSummary`, etc.

### 6.6. Tests

- No hay tests unitarios ni de integración.
- **Recomendación mínima**:
  - Agregar `vitest` o `jest` en el backend.
  - Tests de regresión para `seatFormatter.js`, `dateFormatter.js`, cálculo de descuentos y validación de QR.
  - Tests en frontend para `AuthContext` y `apiFetch`.

### 6.7. TypeScript gradual

- El backend y frontend son JavaScript. Dado el crecimiento del proyecto, considerar migrar a TypeScript por partes, empezando por `lib/` y `models/`. Esto reduciría errores de inventar propiedades.

## 7. Migraciones y schema

### 7.1. Migraciones numeradas inconsistentes

- Hay saltos en la numeración (faltan `001`, `002`, `005`, `006`, etc.) y algunas migraciones comparten número (`014`, `015`, `016`).
- **Recomendación**: mantener un orden cronológico claro. Si hay migraciones viejas de un solo uso, moverlas a `migrations/archive/` y dejar en `migrations/` solo las que se aplican al crear un entorno desde cero.

### 7.2. `PRODUCTION_MIGRATION_2024_12.sql` y `PRODUCTION_MIGRATION_COMPLETE.sql`

- Son scripts grandes con varios cambios. Si ya se aplicaron, deberían estar versionados como archivos pequeños numerados o documentados como "ya aplicado".
- **Recomendación**: separar en migraciones pequeñas y numeradas para futuros cambios.

### 7.3. Campos legacy

- `shows.sala`, `shows.date`, `shows.time` están marcados como legacy en `registerModels.js`.
- **Recomendación**: verificar si todavía tienen datos. Si no, eliminarlos en una migración futura.

## 8. Orden de prioridad sugerido

### Alto impacto / bajo esfuerzo

1. Eliminar `backend_temp_extract/` y zips viejos de `deploy-files/`.
2. Eliminar `docs/mp.md` si no aplica.
3. Reemplazar `user.role` por `hasRole()` en `App.jsx` y `Admin.jsx`.
4. Centralizar `formatSeatLocation` en backend.
5. Crear `frontend/src/lib/dateFormatter.js` y forzar `hour12: false`.

### Alto impacto / medio esfuerzo

6. Unificar servicios de email en un send común.
7. Consolidar `qr.js` y `qrGenerator.js`.
8. Extraer constantes mágicas a `config.js`.
9. Decidir qué hacer con `MpSuccess/MpPending/MpFailure` y `Cartelera.jsx`.
10. Mejorar validaciones con `validators.js`.

### Alto impacto / alto esfuerzo

11. Refactor de `App.jsx` y `Boleteria.jsx`.
12. Migración progresiva a TypeScript.
13. Agregar tests de regresión.
14. Revisar y limpiar todos los scripts de migración de un solo uso.

## 9. Notas para futuros agentes

- Antes de hacer una mejora, verificar que no se esté rompiendo un flujo en producción (ej: los scripts de migración de un solo uso no deben volver a ejecutarse).
- Cada refactor grande debe ir en su propio branch y con PR, no en el branch principal directamente.
- Si se elimina un archivo, actualizar `AGENTE.md` y `README.md` si lo referencian.
- No aplicar "limpieza agresiva" sin antes hacer backup de la base de datos y probar en un entorno de staging.

---

**Nota**: este documento debe actualizarse a medida que se resuelvan los ítems. Marcar como [HECHO] los que ya se completaron.
