# 🧪 Testing en Safari y Móviles

## Problema Actual
Safari (desktop y móvil) y Chrome móvil no pueden conectarse al backend porque está hardcodeado a `http://localhost:4000`.

## Solución Temporal para Testing

### Opción 1: Usar tu IP Local (Misma Red WiFi)

#### 1. Encontrar tu IP local:
```bash
# En Mac:
ipconfig getifaddr en0
# o
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Ejemplo de resultado: `192.168.1.100`

#### 2. Actualizar el .env del frontend:
```bash
# /frontend/.env
VITE_API_URL=http://192.168.1.100:4000
```
**⚠️ Reemplazá `192.168.1.100` con TU IP real**

#### 3. Actualizar el .env del backend para permitir tu IP:
```bash
# /backend/.env
CORS_ORIGIN=http://localhost:5173,http://192.168.1.100:5173
```

#### 4. Reiniciar ambos servidores:
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

#### 5. Probar:
- **En tu computadora (Safari)**: `http://localhost:5173`
- **En tu celular**: `http://192.168.1.100:5173` (conectado a la misma WiFi)

---

### Opción 2: Usar ngrok (Recomendado para Testing Móvil Completo)

#### 1. Instalar ngrok:
```bash
brew install ngrok
# o descargar de https://ngrok.com/download
```

#### 2. Exponer el backend:
```bash
ngrok http 4000
```

Copiá la URL que te da (ej: `https://abc123.ngrok-free.app`)

#### 3. Actualizar frontend/.env:
```bash
VITE_API_URL=https://abc123.ngrok-free.app
```

#### 4. Actualizar backend/.env:
```bash
CORS_ORIGIN=http://localhost:5173,https://abc123.ngrok-free.app
```

#### 5. Reiniciar frontend:
```bash
cd frontend
npm run dev
```

#### 6. Probar desde cualquier dispositivo:
- Desktop: `http://localhost:5173`
- Móvil: `http://localhost:5173` (si estás en la misma máquina) o usa ngrok también para el frontend

---

## Verificar que Funciona

### 1. Abrir Developer Tools en Safari:
- Safari > Preferences > Advanced > Show Develop menu
- Develop > Show JavaScript Console

### 2. Verificar que NO hay errores de CORS:
❌ **Error anterior:**
```
Fetch API cannot load http://localhost:4000/api/auth/login due to access control checks
```

✅ **Debe funcionar sin errores**

### 3. Probar funcionalidades:
- [ ] Login funciona
- [ ] Cartelera se carga
- [ ] Puedo ver detalles de un show
- [ ] Puedo seleccionar butacas
- [ ] Puedo hacer una reserva

---

## Troubleshooting

### Safari dice "Can't connect to server"
- Verificá que el backend esté corriendo: `curl http://localhost:4000/health`
- Verificá tu IP: `ipconfig getifaddr en0`
- Verificá que el .env del frontend tenga la IP correcta
- Reiniciá ambos servidores

### Móvil no puede conectarse
- Asegurate que el celular esté en la misma red WiFi
- Verificá que no haya firewall bloqueando el puerto 4000
- En Mac: System Preferences > Security & Privacy > Firewall > Firewall Options... > permitir conexiones entrantes

### Socket.IO no conecta
- El socket también usa API_URL ahora, así que debería funcionar automáticamente
- Verificá en la consola del navegador si hay errores de WebSocket

---

## Para Producción

En producción vas a necesitar:
1. Un dominio real (ej: `api.teatroespanol.com`)
2. Certificados SSL (HTTPS)
3. Variables de entorno configuradas en el servidor
4. CORS configurado con tu dominio frontend

Por ahora, usa ngrok o IP local para testing! 🚀
