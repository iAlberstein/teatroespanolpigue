#!/bin/bash
set -e

SERVER="root@66.97.42.246"
PORT="5089"
REMOTE_DIR="/home/teatropigue/htdocs/www.teatropigue.com.ar"
REPO="/Users/brunoalberstein/Documents/GitHub/newTEP"

echo "==> Subiendo ZIPs al servidor..."
cd "$REPO/deploy-files"
scp -P "$PORT" frontend-deploy.zip backend-deploy.zip "$SERVER:$REMOTE_DIR/deploy-files/"

echo "==> Desplegando en el servidor..."
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

echo "==> Verificando backend..."
sleep 3
ssh -p "$PORT" "$SERVER" "pm2 logs tep-backend --lines 30 --nostream"

echo "==> Health check..."
curl -s -o /dev/null -w "GET /api/shows: %{http_code}\n" https://www.teatropigue.com.ar/api/shows
curl -s -o /dev/null -w "GET /api/sessions: %{http_code}\n" https://www.teatropigue.com.ar/api/sessions

echo "==> Listo."
