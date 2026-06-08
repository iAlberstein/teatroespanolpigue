# Configuración de Email

El sistema usa **nodemailer** para enviar emails con las entradas.

## Variables de entorno requeridas

Agregar estas variables en tu archivo `.env`:

```env
# Email configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu-email@gmail.com
EMAIL_PASS=tu-contraseña-de-aplicacion
EMAIL_FROM=Teatro Español Pigüé <tu-email@gmail.com>
```

## Configuración para Gmail

Si usás Gmail, necesitás crear una **contraseña de aplicación**:

1. Ir a tu cuenta de Google: https://myaccount.google.com/
2. Seguridad → Verificación en dos pasos (activar si no está)
3. Seguridad → Contraseñas de aplicaciones
4. Crear nueva contraseña para "Correo" / "Otra aplicación"
5. Usar esa contraseña en `EMAIL_PASS`

**⚠️ IMPORTANTE**: 
- NO uses tu contraseña de Gmail normal
- SIEMPRE usa una contraseña de aplicación
- NO subas el archivo `.env` a git

## Otros proveedores SMTP

### Outlook/Hotmail
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=tu-email@outlook.com
EMAIL_PASS=tu-contraseña
```

### SendGrid
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=tu-api-key-de-sendgrid
```

### Mailtrap (para testing)
```env
EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=tu-username
EMAIL_PASS=tu-password
```

## Testing

Una vez configurado, podés probar enviando entradas desde la página de éxito de compra.

El email incluye:
- Información del espectáculo (nombre, fecha, hora, sala)
- Lista de entradas con sus ubicaciones
- Códigos QR embebidos para cada entrada
- Subtotal, cargo por servicio (10%) y total pagado
- Instrucciones para el día del evento

## Troubleshooting

### Error: "Invalid login"
- Verificá que el email y contraseña sean correctos
- Si usás Gmail, asegurate de usar contraseña de aplicación

### Error: "Connection timeout"
- Verificá que el puerto sea correcto (587 para Gmail)
- Algunas redes bloquean el puerto 587, probá con puerto 465

### Los emails van a spam
- Configurá SPF y DKIM en tu dominio
- Usá un email del mismo dominio en `EMAIL_FROM`
- Considerá usar un servicio profesional como SendGrid o Mailgun
