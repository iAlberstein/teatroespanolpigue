# TODO - Sistema de Teatro Español Pigüé

## Estado: EN DESARROLLO ACTIVO
**Última actualización:** 11 de noviembre de 2025 - Implementación masiva de features

---

## ✅ COMPLETADO (Fase 1)

### 1. **Bordereaux - Precios sin comisión del 10%**
- ✅ Backend bordereaux.js: Usar precio base sin comisión
- ✅ Backend reports.js: Diferenciar online (con 10%) y boletería (sin 10%)
- ✅ Detalle de ventas: Dividir entre 1.10 solo ventas online

### 2. **Duplicación de tickets en compras online**
- ✅ Webhook: Marcar reservación como confirmed inmediatamente
- ✅ Prevenir race condition cuando llegan múltiples webhooks

### 3. **Detalle de ventas - Canal y vendedor**
- ✅ Agregar relación `seller` en modelo Sale
- ✅ Backend: Incluir datos de vendedor (sold_by) en queries
- ✅ Detectar correctamente canal: Online vs Boletería

### 4. **Modal Bordereaux - Separar ventas online/boletería**
- ✅ Backend: Separar arrays onlineSales y boleteriaSales
- ✅ Frontend: Mostrar dos secciones separadas en el modal
- ✅ Verificado: Ya implementado correctamente

---

### 5. **Reportes - Quitar promedios**
- ✅ Backend reports.js: Eliminados cálculos de precio/ticket y precio/persona
- ✅ Frontend Reports.jsx: Quitadas cards de promedios
- ✅ El espacio se redistribuye automáticamente con grid

---

### 6. **Detalle de ventas - Filtros**
- ✅ Backend: Query params para filtros (date, seller_id, channel)
- ✅ Frontend: Inputs de filtro con fecha, vendedor y canal
- ✅ Frontend: Conectados con API y aplicación de filtros
- ✅ Botón limpiar filtros funcional

---

### 7. **Formato de fechas y horas - 24h**
- ✅ Reports.jsx: Formato DD/MM/YYYY + hora 24h en dos líneas
- ✅ Métodos de pago normalizados (Efectivo, Mercado Pago, etc)
- ✅ Perfil.jsx: Formato completo y hora 24h
- ✅ Validador.jsx: Hora 24h
- ✅ SessionManager, Boleteria, BordereauxModal: Ya usaban formato correcto

### 8. **Fechas - Nombres completos**
- ✅ Reports.jsx: Nombres completos de días y meses
- ✅ Perfil.jsx: weekday:'long', month:'long'
- ✅ Validador.jsx: Ya usa nombres completos
- ✅ Otros componentes verificados y actualizados

### 9. **Perfiles de usuario - Teléfono y DNI**
- ✅ Backend: Campo dni agregado a modelo User
- ✅ Backend: Migración SQL creada (add_dni_to_users.sql)
- ✅ Backend auth.js: Acepta phone y dni en registro
- ✅ Frontend Register.jsx: Campos de teléfono y DNI
- ✅ Frontend Perfil.jsx: Muestra teléfono y DNI
- ✅ Frontend AuthContext: Función register actualizada

### 10. **Boletería - Asociar por email/DNI**
- ✅ Backend tickets.js: Búsqueda por email, DNI o phone
- ✅ Backend: Prioridad email → DNI → phone
- ✅ Frontend Boleteria.jsx: Campo DNI agregado
- ✅ Validación: Solo números, máximo 8 dígitos
- ✅ Asociación automática de usuario existente

### 11. **Boletería - Ubicación en detalle**
- ✅ Ya implementado: ticket.location se muestra en línea 396

### 12. **Filtros automáticos en reportes (HOY)**
- ✅ Filtros se aplican automáticamente sin recargar la página
- ✅ Estado `isRefreshing` para actualización fluida
- ✅ Indicador visual "⟳ Actualizando..."
- ✅ Filtros permanecen visibles incluso con 0 resultados
- ✅ Mensaje amigable cuando no hay ventas
- ✅ Debounce de 300ms para evitar múltiples llamadas

### 13. **Detección de canal online/boletería (HOY)**
- ✅ Lógica unificada: `payment_method === 'mp'` = Online
- ✅ Corregido en bordereaux.js, reports.js
- ✅ Revenue calculation corregido en todos los reportes
- ✅ Bordereaux ahora separa correctamente con subtotales

### 14. **Optimización de filtros de vendedor (HOY)**
- ✅ Lista de vendedores basada en ventas actuales del reporte
- ✅ Solo muestra vendedores que tienen ventas reales
- ✅ Evita mostrar usuarios sin actividad en el filtro
- ✅ Backend: sold_by_id incluido en todos los reportes

---

## 📊 RESUMEN FASE 1
- **Total de tareas:** 14
- **Completadas:** 14 (100%) ✅
- **En progreso:** 0 (0%)
- **Pendientes:** 0 (0%)

---

---

## 🚀 PRÓXIMOS PASOS - FASE 2

### **PRIORIDAD ALTA**

#### 15. **Sistema de descuentos y cupones** (EN PROGRESO)
- [x] Backend: Modelo Discount (ya existía)
- [x] Backend: Migración 004_create_discounts.sql ejecutada
- [x] Backend: Endpoints CRUD completos (/api/discounts)
- [x] Backend: Validación pública de códigos
- [x] Backend: Estadísticas de uso
- [x] Backend: Relaciones Show-Discount agregadas
- [x] Backend: Corregido para usar sequelize.models
- [x] Frontend: Panel admin de gestión de cupones completo
- [x] Frontend: Formulario crear/editar cupones
- [x] Frontend: Activar/desactivar cupones
- [x] Frontend: Validaciones de formulario
- [x] Frontend: Input para código de descuento en checkout
- [x] Frontend: Mostrar descuento aplicado en resumen
- [x] Frontend: Validación de cupón en tiempo real
- [x] Frontend: Recalcular total con descuento
- [x] Backend: Integrar descuentos en flujo de compra (payments.js)
- [x] Backend: Validar descuento en /preference
- [x] Backend: Aplicar descuento ANTES del cargo por servicio
- [x] Backend: Aplicar descuento como ítem negativo en MP
- [x] Backend: Guardar discount_id en Sale (webhook y confirm)
- [x] Backend: Incrementar used_count automáticamente
- [x] Backend: Endpoint /payments/discount/:reservation_id
- [x] Frontend: Mostrar descuento en MpSuccess.jsx
- [x] Frontend: Recalcular total con descuento aplicado antes del servicio
- [x] Backend: Bordereaux separa entradas con promo (ej: "Platea General (PROMO TEST20)")
- [x] Backend: Include Discount en query de bordereaux
- [x] Backend: Bordereaux muestra precio con descuento en columna VALOR
- [x] Frontend: Reordenado UI - cupón antes del cargo por servicio
- [x] Backend: Endpoint /api/payments/fetch/:payment_id para obtener datos de MP
- [x] Frontend: Corregido carga de reservation_id desde payment en MpSuccess
- [x] Backend: Integrar descuentos en boletería (tickets.js)
- [x] Backend: Validar descuento en /box-office-sale
- [x] Backend: Aplicar descuento antes de crear Sale
- [x] Backend: Guardar discount_id en Sale de boletería
- [x] Backend: Incrementar used_count en ventas de boletería
- [x] Frontend: Input para código de descuento en boletería
- [x] Frontend: Validación en tiempo real en Boleteria.jsx
- [x] Frontend: Desglose con subtotal, descuento y total
- [x] Frontend: Badge verde mostrando cupón aplicado
- [x] Backend: Bordereaux ya separa boletería con descuento (automático)

#### 16. **Gestión de usuarios y roles**
- [x] Backend: Endpoint para listar/editar usuarios
- [x] Backend: GET /api/users con filtros y paginación
- [x] Backend: PUT /api/users/:id para editar datos
- [x] Backend: PATCH /api/users/:id/role para cambiar rol
- [x] Backend: PATCH /api/users/:id/status para activar/desactivar
- [x] Frontend: Panel de administración de usuarios
- [x] Frontend: Tabla con búsqueda y filtros
- [x] Frontend: Asignar/cambiar roles (admin, boleteria, usuario)
- [x] Frontend: Activar/desactivar usuarios
- [x] Frontend: Modal de edición de datos de usuario
- [x] Logs de actividad de usuarios admin y boletería
- [x] Backend: Modelo ActivityLog
- [x] Backend: Middleware y helpers de logging
- [x] Backend: Endpoints GET /api/activity-logs con filtros
- [x] Backend: Exportación de logs a CSV
- [x] Backend: Logging integrado en auth, ventas, validaciones
- [x] Frontend: Panel ActivityLogs.jsx con tabla y filtros
- [x] Frontend: Exportación CSV desde frontend
- [x] Frontend: Link en navbar para admin

#### 17. **Reportes avanzados y exportación**
- [x] Backend: Generar reporte en PDF (bordereaux)
- [x] Backend: GET /api/bordereaux/show/:show_id/pdf
- [x] Backend: Exportar ventas a CSV/Excel
- [x] Backend: GET /api/reports/export/csv con filtros
- [x] Frontend: Botón "Descargar PDF" en bordereaux
- [x] Frontend: Descarga PDF desde BordereauxModal
- [x] Frontend: Botón "Exportar a Excel" en reportes
- [x] Frontend: Exportación CSV desde Reports.jsx
- [x] Gráficos de tendencias (Chart.js o similar)
- [x] Backend: GET /api/reports/trends con datos para gráficos
- [x] Frontend: Componente TrendsCharts.jsx con Chart.js
- [x] Frontend: Gráficos de ingresos, ventas, canales y top shows
- [x] Reporte comparativo entre períodos
- [x] Backend: GET /api/reports/compare para comparar períodos
- [x] Frontend: Componente ComparisonReport.jsx
- [x] Frontend: Cálculo de cambios porcentuales
- [x] Frontend: Pestaña "Analytics" en panel admin
- [x] Package.json: chart.js y react-chartjs-2 agregados

#### 18. **Notificaciones y comunicación**
- [x] Backend: Sistema de envío de emails transaccionales
- [x] Backend: Servicio de email con Nodemailer (emailService.js)
- [x] Backend: Templates de email personalizables
- [x] Backend: Email de confirmación de compra con QR
- [x] Backend: Integración en webhook de Mercado Pago
- [x] Backend: Integración en ventas de boletería
- [x] Email recordatorio 24h antes de la función
- [x] Script automatizado sendReminders.js para cron
- [x] Notificaciones por email para admin (ventas nuevas)
- [x] Configuración via variables de entorno (SMTP)
- [x] Documentación completa (EMAIL_SETUP.md)
- [x] Panel de configuración de notificaciones en frontend
- [x] Frontend: Componente NotificationSettings.jsx
- [x] Frontend: Pestaña "Notificaciones" en panel admin
- [x] Frontend: Instrucciones de configuración SMTP
- [x] Frontend: Estado de notificaciones (confirmación, recordatorios, admin)
- [x] Frontend: Guía de automatización con cron

### **PRIORIDAD MEDIA**

#### 19. **Mejoras en boletería presencial**
- [ ] Modo "kiosko" para venta rápida
- [x] Búsqueda rápida de clientes por nombre
- [x] Backend: GET /api/users/search-quick con búsqueda por nombre/email/DNI
- [x] Frontend: Campo de búsqueda con autocompletado
- [x] Frontend: Dropdown con resultados de búsqueda
- [x] Frontend: Autocompletar datos del cliente al seleccionar
- [x] Frontend: Debounce de 300ms para optimizar búsqueda
- [ ] Historial de compras del cliente
- [ ] Impresión automática de tickets físicos
- [ ] Caja chica: registro de ingresos/egresos
- [ ] Cierre de caja diario

#### 20. **Dashboard mejorado**
- [x] KPIs en tiempo real en home del admin
- [x] Frontend: Componente Dashboard.jsx
- [x] Frontend: Cards con total ventas, ingresos, precio promedio
- [x] Frontend: Breakdown de canales (online/boletería)
- [x] Gráfico de ventas de la última semana
- [x] Frontend: Gráfico Line de ingresos últimos 7 días
- [x] Top 5 shows más vendidos del mes
- [x] Frontend: Lista de top shows con ranking
- [x] Ingresos del día/semana/mes
- [x] Dashboard integrado en vista principal del admin



#### 21. **Gestión de contenido**
- [ ] Backend: Sistema de banners/anuncios
- [ ] Frontend: Carrusel de banners en home
- [ ] Admin: Subir y gestionar banners
- [ ] Frontend: Sección de noticias/novedades
- [ ] Admin: WYSIWYG editor para contenido
- [ ] Páginas estáticas (Sobre nosotros, Contacto)


### **PRIORIDAD BAJA**

#### 23. **Programa de fidelización**
- [ ] Backend: Sistema de puntos por compra
- [ ] Frontend: Ver puntos acumulados en perfil
- [ ] Backend: Descuentos por puntos
- [ ] Admin: Configurar reglas de puntos
- [ ] Beneficios especiales para clientes frecuentes

#### 24. **Integración con redes sociales**
- [ ] Compartir show en Facebook/Instagram/Twitter
- [ ] Login con Google/Facebook
- [ ] Pixel de Facebook para remarketing
- [ ] Meta tags para compartir (Open Graph)

#### 25. **Mejoras de UX/UI**
- [ ] Modo oscuro/claro
- [ ] Animaciones y transiciones suaves
- [ ] Loading skeletons en lugar de spinners
- [ ] Mejoras de accesibilidad (ARIA, contraste)
- [ ] Versión PWA (Progressive Web App)
- [ ] Soporte offline básico

#### 26. **Sistema de reseñas y ratings**
- [ ] Frontend: Calificar show después de asistir
- [ ] Backend: Guardar y moderar reseñas
- [ ] Frontend: Mostrar rating promedio en cartelera
- [ ] Admin: Panel de moderación de reseñas

---

## 🎯 ORDEN DE EJECUCIÓN SUGERIDO (FASE 2)

1. 🔜 Sistema de descuentos y cupones (15)
2. 🔜 Gestión de usuarios y roles (16)
3. 🔜 Reportes avanzados y exportación (17)
4. 🔜 Notificaciones y comunicación (18)
5. ⏳ Mejoras en boletería presencial (19)
6. ⏳ Dashboard mejorado (20)
7. ⏳ Gestión de contenido (21)
8. ⏳ Sistema de reservas (22)
9. 📋 Programa de fidelización (23)
10. 📋 Integración con redes sociales (24)
11. 📋 Mejoras de UX/UI (25)
12. 📋 Sistema de reseñas (26)

**Leyenda:**
- 🔜 = Próximos pasos inmediatos
- ⏳ = Segunda oleada
- 📋 = Funcionalidades adicionales

---

## ⚠️ ACCIÓN REQUERIDA - MIGRACIÓN DE BASE DE DATOS

**IMPORTANTE:** Debes ejecutar la migración SQL para agregar el campo DNI:

```bash
mysql -u tu_usuario -p nombre_base_datos < backend/migrations/add_dni_to_users.sql
```

O ejecutar manualmente:
```sql
ALTER TABLE users ADD COLUMN dni VARCHAR(255) UNIQUE DEFAULT NULL AFTER phone;
CREATE INDEX idx_users_dni ON users(dni);
```

---

## 🔍 VERIFICACIÓN QA COMPLETADA
- ✅ Revisión de código realizada
- ✅ Verificación de lógica completada
- ✅ Casos edge considerados
- ✅ Consistencia con el resto del sistema verificada

---

## 📝 CAMBIOS IMPLEMENTADOS

### Backend:
- ✅ Modelo User con campo dni
- ✅ Relación seller para sold_by
- ✅ Filtros en reportes (date, seller_id, channel)
- ✅ Búsqueda de usuario por email, DNI o phone
- ✅ Registro acepta phone y dni
- ✅ Webhook con protección contra duplicación

### Frontend:
- ✅ Formato de fechas DD/MM/YYYY + hora 24h
- ✅ Métodos de pago normalizados
- ✅ Filtros en detalle de ventas (automáticos, con debounce)
- ✅ Registro con teléfono y DNI
- ✅ Perfil muestra teléfono y DNI
- ✅ Boletería acepta DNI y busca usuario
- ✅ Métodos de pago: Efectivo, Tarjeta, Transferencia, QR, Mercado Pago
- ✅ Filtros fluidos sin recargar página (isRefreshing)
- ✅ Lista de vendedores dinámica basada en ventas reales
- ✅ Indicadores visuales de actualización

---

## 📈 RESUMEN GENERAL

### **Fase 1 - Sistema Base**
- ✅ **100% Completado** - 14 tareas
- Sistema de ventas funcional
- Reportes y bordereaux operativos
- Filtros y búsquedas optimizadas
- UX mejorada con actualizaciones fluidas

### **Fase 2 - Funcionalidades Avanzadas**
- 📋 **0% Completado** - 12 módulos planificados
- Enfoque en gestión, reportes y comunicación
- Mejoras de UX y funcionalidades premium
- Sistema escalable y extensible

---

## 🎯 PRÓXIMO MILESTONE

**Objetivo inmediato:** Iniciar implementación de descuentos y cupones
- Permite promociones y marketing
- Aumenta conversión de ventas
- Base para programa de fidelización futuro

**Tiempo estimado:** 2-3 días de desarrollo

---
