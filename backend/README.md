# TEP Backend

## Requisitos
- Node.js 18+
- MySQL 8+ (DB: `tep`)

## Configuración
1. Copiar `.env.example` a `.env` y ajustar credenciales
2. Crear DB `tep` en MySQL

## Scripts
- `npm run dev`: inicia servidor con nodemon en `:4000`
- `npm start`: inicia servidor en producción

## Endpoints base
- `GET /health`
- `GET /api/users`
- `GET /api/shows`
- `GET /api/sessions`
- `POST /api/reservations` (crea reserva 10min)
- `DELETE /api/reservations/:id` (cancela)

## Sockets (estructura inicial)
- `join_session` -> unirse a sala de sesión
- `seat_select` -> emite `seat_selected`
- `seat_release` -> emite `seat_released`
