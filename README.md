# teatroespanolpigue
# Teatro Español Pigüé

Este repositorio contiene el desarrollo del sistema de gestión de cartelera y venta de entradas para el **Teatro Español Pigüé**.

## Descripción

El proyecto consiste en una plataforma web para:

- Gestión de espectáculos (crear, modificar, eliminar)
- Venta de entradas full e-ticket (web y boletería)
- Gestión de usuarios con roles: Administrador, Boletería, Productores y Espectadores/Premium
- Control de acceso mediante QR y PWA para escaneo
- Integración con Mercado Pago y WhatsApp Business API
- Reportes y dashboards de venta
- Manejo de descuentos, entradas de cortesía y para personas con discapacidad
- Layout dinámico de salas numeradas y sin numerar con actualización en tiempo real usando WebSockets

## Estructura inicial del repositorio

Teatro-Español-Pigue/
│
├─ docs/ # Documentación en Markdown
│ ├─ prd.md # Product Requirements Document
│ └─ benchmark.md # Benchmark comparativo de ticketing
│
├─ frontend/ # Código de la aplicación React
├─ backend/ # API y lógica de negocio (Node.js / Express / MySQL)
├─ scripts/ # Scripts de setup, DB y utilidades
├─ .gitignore
└─ README.md


## Stack tecnológico

- Frontend: React + Vite (con Tailwind y librerías adicionales según necesidad)
- Backend: Node.js + Express
- Base de datos: MySQL
- Realtime: WebSockets para disponibilidad de butacas
- Pagos: Mercado Pago API
- Envío de entradas: Email + WhatsApp Business API
- Autenticación: Email/Password + OAuth (Gmail / Apple ID)
- Infraestructura: Servidor en Argentina, con posibilidad de escalar a nube

## Recomendaciones de trabajo

- Se recomienda crear un branch por cada funcionalidad (`feature/<nombre>`) y realizar pull requests hacia `main` solo con código probado.
- Mantener la documentación `docs/` actualizada con cualquier cambio significativo.
- Usar convenciones de commits tipo `feat:`, `fix:`, `chore:` para facilitar seguimiento.

## Notas Finales

Este documento servirá como **guía de desarrollo** para Claude y como base de control para las iteraciones de producto.  
Toda nueva feature deberá tener un ticket asociado con referencia a su historia de usuario correspondiente.
