# Configuración del Sistema de Emails

## 📧 Variables de Entorno Necesarias

Agregar las siguientes variables al archivo `.env`:

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu-email@gmail.com
EMAIL_PASS=tu-app-password
EMAIL_FROM=Teatro Español de Pigüé <tu-email@gmail.com>

# Admin Notifications
ADMIN_NOTIFICATION_EMAILS=admin1@example.com,admin2@example.com
```

---

## 🔐 Configuración de Gmail (Recomendado)

### **1. Crear Contraseña de Aplicación**

1. Ir a [Cuenta de Google](https://myaccount.google.com/)
2. Ir a **Seguridad**
3. Activar **Verificación en 2 pasos** (si no está activada)
4. Buscar **Contraseñas de aplicaciones**
5. Seleccionar "Correo" y "Otro" (nombre: Teatro Español)
6. Copiar la contraseña de 16 caracteres generada
7. Usar esa contraseña en `EMAIL_PASS`

### **2. Configuración en .env**

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=teatro.espanol.pigue@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop
EMAIL_FROM=Teatro Español de Pigüé <teatro.espanol.pigue@gmail.com>
```

---

## 📮 Otros Proveedores SMTP

### **Outlook/Hotmail**
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

### **Yahoo**
```env
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
EMAIL_SECURE=false
```

### **SendGrid (Profesional)**
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=tu-sendgrid-api-key
```

### **Mailgun (Profesional)**
```env
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=postmaster@tu-dominio.mailgun.org
EMAIL_PASS=tu-mailgun-password
```

---

## ✉️ Tipos de Emails Enviados

### **1. Confirmación de Compra**
- **Cuándo:** Automáticamente después de una compra exitosa
- **Quién:** Cliente que compró (online o boletería)
- **Contenido:**
  - Detalles del show y función
  - Lista de entradas adquiridas
  - Total pagado
  - Botón para ver entradas en perfil
  - ID de compra

### **2. Recordatorio 24h Antes**
- **Cuándo:** Script ejecutado diariamente (cron)
- **Quién:** Clientes con función al día siguiente
- **Contenido:**
  - Recordatorio de fecha y hora
  - Cantidad de entradas
  - Recomendaciones (llegar 30min antes, traer DNI, etc.)
  - Botón para ver entradas

### **3. Notificación a Admin**
- **Cuándo:** Automáticamente después de cada venta
- **Quién:** Emails configurados en `ADMIN_NOTIFICATION_EMAILS`
- **Contenido:**
  - Canal de venta (Online/Boletería)
  - Show y función
  - Cliente
  - Cantidad de entradas
  - Total de venta

---

## 🤖 Automatización de Recordatorios

### **Configurar Cron Job (Linux/Mac)**

Editar crontab:
```bash
crontab -e
```

Agregar línea para ejecutar diariamente a las 10:00 AM:
```cron
0 10 * * * cd /path/to/backend && npm run send-reminders >> /var/log/teatro-reminders.log 2>&1
```

### **Manual (Para Testing)**

```bash
cd backend
npm run send-reminders
```

---

## 🧪 Testing

### **Verificar Configuración**

El sistema funciona en modo "log-only" si no hay credenciales SMTP configuradas.

```bash
# Sin configurar SMTP
# Los emails se mostrarán en consola pero no se enviarán

# Con SMTP configurado
# Los emails se enviarán realmente
```

### **Test de Email de Confirmación**

1. Realizar una compra de prueba (online o boletería)
2. Verificar que llegue el email al cliente
3. Verificar que llegue notificación a admins

### **Test de Recordatorios**

1. Crear una función que comience en exactamente 24 horas
2. Ejecutar: `npm run send-reminders`
3. Verificar que lleguen los emails

---

## ⚠️ Troubleshooting

### **Error: "Invalid login"**
- Verificar usuario y contraseña
- Si usás Gmail, asegurarse de usar contraseña de aplicación (no la contraseña normal)
- Verificar que verificación en 2 pasos esté activada

### **Error: "Connection timeout"**
- Verificar firewall/antivirus
- Intentar con otro puerto (465 con `EMAIL_SECURE=true`)
- Verificar conectividad: `telnet smtp.gmail.com 587`

### **Emails no llegan**
- Revisar carpeta de spam
- Verificar que `EMAIL_FROM` incluya el mismo email que `EMAIL_USER`
- Revisar logs del backend para errores

### **Emails llegan pero sin formato**
- Algunos clientes de email no soportan HTML
- El contenido es responsive y debería verse bien en la mayoría

---

## 📋 Checklist de Implementación

- [ ] Configurar variables SMTP en `.env`
- [ ] Obtener contraseña de aplicación (si usás Gmail)
- [ ] Configurar emails de admin en `ADMIN_NOTIFICATION_EMAILS`
- [ ] Reiniciar servidor backend
- [ ] Hacer compra de prueba
- [ ] Verificar recepción de emails
- [ ] Configurar cron job para recordatorios
- [ ] Probar script de recordatorios manualmente

---

## 🎨 Personalización

Los templates de email están en:
- `/backend/src/lib/emailService.js`

Para personalizar:
1. Editar el HTML en las funciones correspondientes
2. Mantener estructura responsive
3. Probar en diferentes clientes de email

---

**Nota:** Si no configurás SMTP, la aplicación funcionará normalmente pero los emails solo se mostrarán en logs del servidor (modo desarrollo).
