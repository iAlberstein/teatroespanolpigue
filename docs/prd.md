# 🧾 Product Requirements Document (PRD)
**Proyecto:** Teatro Español Pigüé  
**Versión:** 1.0  
**Fecha:** Octubre 2025  
**Product Manager:** ChatGPT  
**Ingeniero de Software Senior:** Claude  
**Repositorio:** GitHub (arquitectura React + Node.js + MySQL)

---

## 🎯 Objetivo General

Desarrollar una plataforma web de ticketing y gestión integral de espectáculos para el **Teatro Español Pigüé**, que unifique la venta online, boletería física, control de accesos, administración de salas y comunicación con los espectadores.

---

## 🧱 Arquitectura

- **Frontend:** React  
- **Backend:** Node.js (Express)  
- **Base de datos:** MySQL  
- **Hosting:** AWS o Render (a definir)  
- **Pasarela de pago:** Mercado Pago  
- **Correo electrónico:** Nodemailer o SendGrid  
- **Gestión de QR:** Librería `qrcode` (generación) + `jsQR` (lectura)  
- **Repositorio:** GitHub con branches por feature (`feature/*`) y PRs antes del merge a `main`.

---

## 👥 Roles de Usuario

| Rol | Descripción | Permisos |
|------|--------------|----------|
| **Administrador** | Control total del sistema. | Crear/modificar/eliminar espectáculos, gestionar roles, ver reportes, asignar descuentos, ver caja total. |
| **Boletería** | Personal de venta presencial. | Abrir/cerrar caja, emitir tickets, aplicar descuentos, generar cortesías, enviar entradas. |
| **Productor** | Creador o gestor de un espectáculo. | Cargar y modificar shows propios, ver sus reportes de ventas. |
| **Usuario** | Público general. | Crear cuenta, comprar entradas, recibir e-tickets, acceder a su historial. |

---

## 🧩 Módulos del Sistema

### 1. Gestión de Espectáculos
- Crear, editar y eliminar espectáculos.  
- Campos: `id_show`, `nombre`, `descripción`, `imagen`, `fecha`, `hora`, `sala`, `precio`, `link_entradas`, `cupos_discapacidad`, `códigos_descuento`.  
- Carga de imágenes: `image` (afiche principal) + `banner` (para versión desktop).  
- Definición de **sala**:  
  - Sala Principal → localidades numeradas (mapa SVG).  
  - Salón de las Gemelas / Foyer / Sala Off → sin numerar.

### 2. Sistema de Boletería
- Login con rol de boletería.  
- Apertura y cierre de caja.  
- Venta presencial con selección de butacas o cantidad.  
- Aplicación de descuentos manuales (%).  
- Emisión de entradas de cortesía y por discapacidad (con cupo).  
- Envío de entradas por correo o WhatsApp.  
- Generación automática de e-ticket con QR único.

### 3. Venta Online
- Visualización pública de cartelera.  
- Selección de espectáculo, sala y asientos.  
- Pasarela de pago con Mercado Pago.  
- Confirmación de pago → envío automático de e-ticket.  
- Validación QR al ingresar al evento.

### 4. Autenticación y Roles
- Registro e inicio de sesión con email y contraseña.  
- JWT para persistencia de sesión.  
- Middleware de autorización según rol.  
- Panel de perfil personalizado (usuario, boletería, admin, productor).

### 5. Reportes y Estadísticas
- Ventas totales y por espectáculo.  
- Informe de caja diaria (boletería).  
- Descuentos aplicados y entradas de cortesía.  
- Descarga en CSV o PDF.

### 6. Sistema de Comunicación
- Envío de confirmaciones por correo electrónico.  
- Integración opcional con API de WhatsApp Business.  
- Plantillas visuales con branding institucional.

### 7. Control de Accesos
- Escaneo de QR con cámara del dispositivo o lector externo.  
- Validación online u offline.  
- Registro de entradas validadas (fecha, hora, dispositivo).  

---

## 🧭 Historias de Usuario (Resumen)

| ID | Rol | Historia | Criterios de Aceptación |
|----|-----|-----------|--------------------------|
| US-01 | Admin | Crear un espectáculo nuevo | Todos los campos requeridos deben completarse correctamente. |
| US-02 | Boletería | Vender entradas y enviar por mail | Debe registrar la venta y descontar del cupo disponible. |
| US-03 | Usuario | Comprar entradas online | Debe recibir confirmación por correo y QR válido. |
| US-04 | Productor | Ver reportes de su show | Solo puede acceder a sus espectáculos. |
| US-05 | Admin | Ver reportes globales | Mostrar ventas, descuentos y cortesías por fecha. |

---

## 🧮 Priorización MVP (Primera Fase)

| Prioridad | Módulo | Descripción |
|------------|---------|--------------|
| 🔥 Alta | Autenticación y roles | Base del sistema de permisos. |
| 🔥 Alta | Gestión de espectáculos | CRUD de shows y salas. |
| 🔥 Alta | Venta online + pasarela de pago | Flujo completo de compra y envío de entradas. |
| ⚙️ Media | Sistema de boletería | Venta presencial y control de caja. |
| ⚙️ Media | QR y validación | Generación y escaneo en accesos. |
| 💬 Baja | Comunicaciones (WhatsApp) | Se agrega luego de la versión estable. |
| 📊 Baja | Reportes detallados y analíticas | A implementar tras las pruebas de flujo. |

---

## 🧩 Integración con Branding
- Paleta de colores y tipografía del Teatro Español Pigüé.  
- Logos, banners e íconos personalizados.  
- Diseño limpio y accesible, Mobile First.  
- Layouts adaptables según tipo de sala.

---

## 🧠 Roadmap Técnico (Claude)

1. Configurar repositorio GitHub y estructura base (React + Node.js + MySQL).  
2. Implementar autenticación y sistema de roles (JWT).  
3. Crear módulo CRUD de espectáculos.  
4. Integrar Mercado Pago y flujo de compra online.  
5. Generar e-tickets con QR.  
6. Sistema de boletería y control de caja.  
7. Reportes y dashboard admin.  
8. Integración visual con branding.

---

## ✅ Criterios de Aceptación Global

- Toda transacción queda registrada en base de datos.  
- Las rutas protegidas verifican JWT y rol.  
- Los QR son únicos e intransferibles.  
- Las entradas se envían automáticamente al correo del usuario.  
- El sistema se ejecuta sin errores críticos en entorno local y remoto.

---

## 📦 Futuras Extensiones

- Integración con redes sociales (promoción de eventos).  
- Módulo de donaciones y membresías.  
- Panel de estadísticas con gráficas interactivas.  
- API pública para desarrollos externos.

---

## ✍️ Notas Finales
Este documento servirá como **guía de desarrollo** para Claude y como base de control para las iteraciones de producto.  
Toda nueva feature deberá tener un ticket asociado con referencia a su historia de usuario correspondiente.
