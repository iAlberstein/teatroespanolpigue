# 🚀 Guía de Despliegue - Teatro Español Pigüé

**Sistema de Venta de Entradas**

---

## 📋 Información del Servidor

| Dato | Valor |
|------|-------|
| **SSH** | `root@66.97.42.246` puerto `5089` |
| **Dominio** | `https://www.teatropigue.com.ar` |
| **Directorio** | `/home/teatropigue/htdocs/www.teatropigue.com.ar/` |
| **Site User** | `teatropigue` |
| **PM2 Backend** | `tep-backend` (puerto 4001) |
| **Base de datos** | MySQL `newTEP` en `127.0.0.1:3306` |

**Estructura del servidor:**
```
/home/teatropigue/htdocs/www.teatropigue.com.ar/
├── index.html        # Frontend (copiado de dist/)
├── assets/           # Assets del frontend (copiado de dist/)
├── media/            # Imágenes, sponsors, shows (servido por Nginx)
├── favicon.png       # Favicon del sitio
├── backend/          # API Node.js + Express
├── deploy-files/     # Archivos ZIP para despliegue
└── dist/             # Build del frontend (temporal)
```

> **Nota:** Nginx sirve archivos desde la raíz, NO desde `dist/`. Por eso copiamos `index.html` y `assets/` a la raíz.

> **Nota para trabajo con Cascade:** Cuando estés trabajando con el asistente (Cascade), los comandos de despliegue de este archivo se ejecutan habitualmente **desde la propia IA** usando la terminal integrada, siempre con tu confirmación previa. Si preferís hacerlo manualmente, podés copiar y ejecutar exactamente los mismos comandos desde tu terminal local.

---

## ⚠️ ERROR COMÚN - ¡LEER ANTES DE DESPLEGAR!

> **🚨 IMPORTANTE:** El frontend DEBE compilarse con la variable `VITE_API_URL` apuntando a producción.
> 
> Si ejecutás `npm run build` sin la variable, el frontend intentará conectarse a `localhost:4000` y verás errores CORS en producción.
>
> **Comando CORRECTO:**
> ```bash
> VITE_API_URL=https://www.teatropigue.com.ar npm run build
> ```
>
> **Comando INCORRECTO (no usar):**
> ```bash
> npm run build  # ❌ Esto apunta a localhost!
> ```

---

## 🎨 Despliegue de Frontend (Solo cambios de UI)

### Paso 1: Build local

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/frontend

# ⚠️ IMPORTANTE: Incluir VITE_API_URL para producción
VITE_API_URL=https://www.teatropigue.com.ar npm run build
```

### Paso 2: Crear ZIP

```bash
zip -r ../deploy-files/frontend-deploy.zip dist/
```

### Paso 3: Subir al servidor

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/deploy-files

scp -P 5089 frontend-deploy.zip root@66.97.42.246:/home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files/
```

### Paso 4: Descomprimir y copiar

```bash
ssh -p 5089 root@66.97.42.246 "cd /home/teatropigue/htdocs/www.teatropigue.com.ar && unzip -o deploy-files/frontend-deploy.zip && cp dist/index.html ./ && cp -rf dist/assets ./"
```

### Verificar

1. Abrir https://www.teatropigue.com.ar
2. Limpiar caché del navegador (Ctrl+Shift+R)
3. Verificar cambios visibles

---

## 🔧 Despliegue de Backend (Cambios en API)

### Paso 1: Crear ZIP

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/backend

zip -r ../deploy-files/backend-deploy.zip . -x "node_modules/*" -x ".git/*"
```

### Paso 2: Subir al servidor

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/deploy-files

scp -P 5089 backend-deploy.zip root@66.97.42.246:/home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files/
```

### Paso 3: Descomprimir e instalar

```bash
ssh -p 5089 root@66.97.42.246

cd /home/teatropigue/htdocs/www.teatropigue.com.ar/backend
unzip -o ../deploy-files/backend-deploy.zip
npm install --production
pm2 restart tep-backend
```

### Paso 4: Verificar logs

```bash
pm2 logs tep-backend --lines 50
```

**Buscar:**
- ✅ `API running on :4001`
- ✅ `[STARTUP] Loaded X sold tickets`
- ❌ Sin errores

---

## 🗄️ Migración de Base de Datos

**⚠️ Solo si hay cambios de schema**

### Backup previo

```bash
ssh -p 5089 root@66.97.42.246

cd /home/teatropigue/htdocs/www.teatropigue.com.ar
mysqldump -u newTEP -p newTEP > deploy-files/backup_$(date +%Y%m%d_%H%M%S).sql
```

### Ejecutar migración

```bash
cd backend
node src/scripts/runProductionMigrationComplete.js
```

---

## 🚀 Despliegue Completo (Frontend + Backend)

### Comandos rápidos (copiar y pegar)

**1. Build y ZIP frontend:**
```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/frontend && VITE_API_URL=https://www.teatropigue.com.ar npm run build && zip -r ../deploy-files/frontend-deploy.zip dist/
```

**2. ZIP backend:**
```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/backend && zip -r ../deploy-files/backend-deploy.zip . -x "node_modules/*" -x ".git/*"
```

**3. Subir ambos:**
```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/deploy-files && scp -P 5089 frontend-deploy.zip backend-deploy.zip root@66.97.42.246:/home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files/
```

**4. Desplegar en servidor:**
```bash
ssh -p 5089 root@66.97.42.246 "cd /home/teatropigue/htdocs/www.teatropigue.com.ar && unzip -o deploy-files/frontend-deploy.zip && cp dist/index.html ./ && cp -rf dist/assets ./ && cd backend && unzip -o ../deploy-files/backend-deploy.zip && npm install --production && pm2 restart tep-backend"
```

---

## 🧪 Verificación Post-Despliegue

1. Abrir https://www.teatropigue.com.ar
2. Limpiar caché (Ctrl+Shift+R)
3. Verificar cambios visibles
4. Probar login si hubo cambios de auth
5. Revisar consola (F12) por errores

---

## 🔍 Monitoreo y Comandos Útiles

```bash
# Conectarse al servidor
ssh -p 5089 root@66.97.42.246

# Ver logs en tiempo real
pm2 logs tep-backend

# Ver últimas N líneas
pm2 logs tep-backend --lines 100

# Estado del proceso
pm2 status

# Reiniciar backend
pm2 restart tep-backend

# Ver espacio en disco
df -h
```

---

## 🚨 Rollback

### Restaurar base de datos
```bash
cd /home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files
mysql -u newTEP -p newTEP < backup_[FECHA].sql
pm2 restart tep-backend
```

---

## 📌 Notas Importantes

- **Frontend:** Nginx sirve desde la raíz, NO desde `dist/`. Siempre copiar `index.html` y `assets/` a la raíz.
- **Backend:** El `.env` ya está configurado en el servidor. No se incluye en el ZIP.
- **Caché:** Después de desplegar, limpiar caché del navegador para ver cambios.
- **Password SSH:** Se pedirá al ejecutar `scp` y `ssh`.

---

**Última actualización:** Junio 2026

---

## 📝 Notas de Migración (Mayo/Junio 2026)

Se completó la migración del dominio `www.nuevositio.teatropigue.com.ar` al dominio principal `www.teatropigue.com.ar`.

### Cambios realizados:
- **Dominio:** `www.nuevositio.teatropigue.com.ar` → `www.teatropigue.com.ar`
- **Site User:** `teatropigue-www-nuevositio` → `teatropigue`
- **Puerto Backend:** `4000` → `4001`
- **Directorio:** `/home/teatropigue-www-nuevositio/...` → `/home/teatropigue/...`
- **SSL:** Certificado Let's Encrypt emitido para el nuevo dominio
- **DNS:** Registros A actualizados en DonWeb/Ferozo
