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
| **Base de datos** | MySQL `dbTEP` en `127.0.0.1:3306` |

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

> **Nota para trabajo con Cascade:** Cascade ejecuta los comandos paso a paso y espera a que cada uno termine antes de avanzar. Los comandos que modifican archivos, suben artefactos o actúan sobre producción requieren tu aprobación. Cuando SSH solicite credenciales, ingresalas en la terminal; nunca deben guardarse en este documento ni en el repositorio.

---

## ✅ Checklist Previo al Despliegue

Antes de compilar o subir cualquier cosa:

- [ ] Revisar `git status --short`: confirmar explícitamente que todos los cambios pendientes deben incluirse, porque el ZIP publica el estado completo de `backend/` y el build completo de `frontend/`.
- [ ] Commits pusheados y código probado en desarrollo local.
- [ ] `frontend/.env` y `backend/.env` locales **NO** contienen URLs de producción (no commitear `.env`).
- [ ] Si hay cambios de schema, la migración SQL está en `backend/migrations/` y `registerModels.js` está actualizado.
- [ ] Si se eliminó un archivo, se actualizó `AGENTE.md` y `README.md` si lo referenciaban.
- [ ] `backend_temp_extract/` y `deploy-files/*.zip` viejos se ignoran en git (ver [Notas de versionado](#-notas-de-versionado)).
- [ ] `frontend/dist` limpio antes del build para evitar bundles acumulados.
- [ ] `deploy-files/frontend-deploy.zip` y `deploy-files/backend-deploy.zip` viejos eliminados antes de recrear.

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

### Paso 1: Limpieza de builds anteriores

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP

# Eliminar dist y zip viejo para evitar bundles acumulados
rm -rf frontend/dist
rm -f deploy-files/frontend-deploy.zip
```

### Paso 2: Build local

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/frontend

# ⚠️ IMPORTANTE: Incluir VITE_API_URL para producción
VITE_API_URL=https://www.teatropigue.com.ar npm run build
```

### Paso 3: Crear ZIP

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/frontend

zip -r ../deploy-files/frontend-deploy.zip dist/
```

### Paso 4: Subir al servidor

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/deploy-files

scp -P 5089 frontend-deploy.zip root@66.97.42.246:/home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files/
```

### Paso 5: Descomprimir, copiar y ajustar permisos

```bash
ssh -p 5089 root@66.97.42.246 "cd /home/teatropigue/htdocs/www.teatropigue.com.ar && \
  rm -rf dist assets && \
  mkdir assets && \
  unzip -o deploy-files/frontend-deploy.zip && \
  cp dist/index.html ./ && \
  cp -rf dist/assets/* assets/ && \
  chown -R teatropigue:teatropigue index.html assets && \
  rm -rf dist"
```

### Verificar

1. Abrir https://www.teatropigue.com.ar
2. Limpiar caché del navegador (`Ctrl+Shift+R` o `Cmd+Shift+R`)
3. Verificar cambios visibles
4. Revisar consola (F12) por errores de red o CORS

---

## 🔧 Despliegue de Backend (Cambios en API)

### Paso 1: Limpieza de ZIP anterior

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP

rm -f deploy-files/backend-deploy.zip
```

### Paso 2: Crear ZIP

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/backend

zip -r ../deploy-files/backend-deploy.zip . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x ".env*" \
  -x "*.log"
```

### Paso 3: Subir al servidor

```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/deploy-files

scp -P 5089 backend-deploy.zip root@66.97.42.246:/home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files/
```

### Paso 4: Descomprimir, instalar y reiniciar

```bash
ssh -p 5089 root@66.97.42.246 "cd /home/teatropigue/htdocs/www.teatropigue.com.ar/backend && \
  unzip -o ../deploy-files/backend-deploy.zip && \
  npm install --omit=dev && \
  chown -R teatropigue:teatropigue . && \
  pm2 restart tep-backend"
```

### Paso 5: Verificar logs

```bash
ssh -p 5089 root@66.97.42.246 "pm2 logs tep-backend --lines 50 --nostream"
```

**Buscar:**
- ✅ `API running on :4001`
- ✅ `[STARTUP] Loaded X sold tickets`
- ❌ Sin errores

### Paso 6: Health check

```bash
curl -s https://www.teatropigue.com.ar/api/health | head -c 200
```

Si no existe `/api/health`, verificar con endpoints públicos existentes:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://www.teatropigue.com.ar/api/shows
curl -s -o /dev/null -w "%{http_code}\n" https://www.teatropigue.com.ar/api/sessions
```

Ambos deben devolver `200`. No usar `/api/sessions/upcoming`: esa ruta no existe.

---

## 🗄️ Migración de Base de Datos

**⚠️ Solo si hay cambios de schema**

### Backup previo (obligatorio)

```bash
ssh -p 5089 root@66.97.42.246

cd /home/teatropigue/htdocs/www.teatropigue.com.ar
mysqldump -u dbTEP -p dbTEP > deploy-files/backup_$(date +%Y%m%d_%H%M%S).sql
```

### Ejecutar migración

Preferir migraciones numeradas en `backend/migrations/` y ejecutarlas con el runner estándar:

```bash
cd /home/teatropigue/htdocs/www.teatropigue.com.ar/backend
node src/scripts/runMigration.js
```

> **Nota:** `runProductionMigrationComplete.js` y similares son scripts de una sola ejecución. No volver a correrlos salvo indicación explícita. Las nuevas migraciones deben ir como archivos `.sql` numerados en `backend/migrations/`.

### Verificar migración

```bash
mysql -u dbTEP -p dbTEP -e "SHOW TABLES;"
```

---

## 🚀 Despliegue Completo (Frontend + Backend)

### Opción A: Script automatizado local

Copiar y guardar como `deploy.sh` en la raíz del repo (no versionar):

```bash
#!/bin/bash
set -e

REPO="/Users/brunoalberstein/Documents/GitHub/newTEP"
SERVER="root@66.97.42.246"
PORT="5089"
REMOTE_DIR="/home/teatropigue/htdocs/www.teatropigue.com.ar"

# 1. Limpieza
rm -rf "$REPO/frontend/dist"
rm -f "$REPO/deploy-files/frontend-deploy.zip"
rm -f "$REPO/deploy-files/backend-deploy.zip"

# 2. Frontend build
cd "$REPO/frontend"
VITE_API_URL=https://www.teatropigue.com.ar npm run build
zip -r ../deploy-files/frontend-deploy.zip dist/

# 3. Backend zip
cd "$REPO/backend"
zip -r ../deploy-files/backend-deploy.zip . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x ".env*" \
  -x "*.log"

# 4. Subir
cd "$REPO/deploy-files"
scp -P "$PORT" frontend-deploy.zip backend-deploy.zip "$SERVER:$REMOTE_DIR/deploy-files/"

# 5. Desplegar en servidor
ssh -p "$PORT" "$SERVER" "cd $REMOTE_DIR && \
  rm -rf dist assets && \
  mkdir assets && \
  unzip -o deploy-files/frontend-deploy.zip && \
  cp dist/index.html ./ && \
  cp -rf dist/assets/* assets/ && \
  rm -rf dist && \
  cd backend && \
  unzip -o ../deploy-files/backend-deploy.zip && \
  npm install --omit=dev && \
  chown -R teatropigue:teatropigue . && \
  pm2 restart tep-backend"

# 6. Health check
sleep 3
curl -s -o /dev/null -w "GET /api/shows: %{http_code}\n" https://www.teatropigue.com.ar/api/shows
curl -s -o /dev/null -w "GET /api/sessions: %{http_code}\n" https://www.teatropigue.com.ar/api/sessions

echo "✅ Despliegue completo finalizado"
```

Ejecutar:

```bash
chmod +x /Users/brunoalberstein/Documents/GitHub/newTEP/deploy.sh
/Users/brunoalberstein/Documents/GitHub/newTEP/deploy.sh
```

### Opción B: Comandos manuales (copiar y pegar)

**1. Limpieza, build y ZIP frontend:**
```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP && \
  rm -rf frontend/dist deploy-files/frontend-deploy.zip && \
  cd frontend && \
  VITE_API_URL=https://www.teatropigue.com.ar npm run build && \
  zip -r ../deploy-files/frontend-deploy.zip dist/
```

**2. Limpieza y ZIP backend:**
```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP && \
  rm -f deploy-files/backend-deploy.zip && \
  cd backend && \
  zip -r ../deploy-files/backend-deploy.zip . \
    -x "node_modules/*" \
    -x ".git/*" \
    -x ".env*" \
    -x "*.log"
```

**3. Subir ambos:**
```bash
cd /Users/brunoalberstein/Documents/GitHub/newTEP/deploy-files && \
  scp -P 5089 frontend-deploy.zip backend-deploy.zip \
    root@66.97.42.246:/home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files/
```

**4. Desplegar en servidor:**
```bash
ssh -p 5089 root@66.97.42.246 "cd /home/teatropigue/htdocs/www.teatropigue.com.ar && \
  rm -rf dist assets && \
  mkdir assets && \
  unzip -o deploy-files/frontend-deploy.zip && \
  cp dist/index.html ./ && \
  cp -rf dist/assets/* assets/ && \
  rm -rf dist && \
  cd backend && \
  unzip -o ../deploy-files/backend-deploy.zip && \
  npm install --omit=dev && \
  chown -R teatropigue:teatropigue . && \
  pm2 restart tep-backend"
```

---

## 🧪 Verificación Post-Despliegue

1. Abrir https://www.teatropigue.com.ar
2. Limpiar caché (`Ctrl+Shift+R` / `Cmd+Shift+R`)
3. Verificar cambios visibles
4. Probar login si hubo cambios de auth
5. Revisar consola (F12) por errores
6. Health check del backend:
   ```bash
   curl -s -o /dev/null -w "GET /api/shows: %{http_code}\n" https://www.teatropigue.com.ar/api/shows
   curl -s -o /dev/null -w "GET /api/sessions: %{http_code}\n" https://www.teatropigue.com.ar/api/sessions
   ```
7. Revisar logs:
   ```bash
   ssh -p 5089 root@66.97.42.246 "pm2 logs tep-backend --lines 100 --nostream"
   ```

---

## 🔍 Monitoreo y Comandos Útiles

```bash
# Conectarse al servidor
ssh -p 5089 root@66.97.42.246

# Ver logs en tiempo real
pm2 logs tep-backend

# Ver últimas N líneas (sin seguir)
pm2 logs tep-backend --lines 100 --nostream

# Estado del proceso
pm2 status

# Reiniciar backend
pm2 restart tep-backend

# Recargar Nginx (si se tocó la config)
nginx -t && systemctl reload nginx

# Ver espacio en disco
df -h

# Ver uso de disco del backend
sudo du -sh /home/teatropigue/htdocs/www.teatropigue.com.ar/backend
```

---

## 🚨 Rollback

### Rollback de base de datos
```bash
cd /home/teatropigue/htdocs/www.teatropigue.com.ar/deploy-files
mysql -u dbTEP -p dbTEP < backup_[FECHA].sql
pm2 restart tep-backend
```

### Rollback de frontend

Si el deploy anterior dejó un `frontend-deploy.zip` anterior en `deploy-files/`, se puede restaurar:

```bash
ssh -p 5089 root@66.97.42.246 "cd /home/teatropigue/htdocs/www.teatropigue.com.ar && \
  unzip -o deploy-files/frontend-deploy.zip.anterior && \
  cp dist/index.html ./ && \
  cp -rf dist/assets/* assets/ && \
  rm -rf dist"
```

> **Recomendación:** antes de desplegar, renombrar el `frontend-deploy.zip` anterior a `frontend-deploy.zip.anterior` para poder volver rápido.

### Rollback de backend

```bash
ssh -p 5089 root@66.97.42.246 "cd /home/teatropigue/htdocs/www.teatropigue.com.ar/backend && \
  unzip -o ../deploy-files/backend-deploy.zip.anterior && \
  npm install --omit=dev && \
  pm2 restart tep-backend"
```

---

## 📌 Notas de Versionado

- **No versionar en git:** `frontend/dist`, `deploy-files/*.zip`, `backend_temp_extract/`, logs locales ni archivos `.env`.
- **Agregar a `.gitignore`:**
  ```gitignore
  frontend/dist
  deploy-files/*.zip
  backend_temp_extract/
  backend/*.log
  ```
- **Backend:** El `.env` ya está configurado en el servidor. No se incluye en el ZIP.
- **Caché:** Después de desplegar, limpiar caché del navegador para ver cambios.
- **Password SSH:** Se pedirá al ejecutar `scp` y `ssh`.
- **Cambios de Nginx:** Si se modifica `/etc/nginx/sites-enabled/www.teatropigue.com.ar.conf`, ejecutar `nginx -t && systemctl reload nginx`.

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

---

**Última actualización:** Junio 2026
