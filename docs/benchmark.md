# 🎟️ Benchmark de Plataformas de Ticketing  
**Proyecto:** Teatro Español Pigüé  
**Fecha:** Octubre 2025  
**Responsable:** Product Manager – ChatGPT  

---

## 🧭 Objetivo del Benchmark
Identificar las fortalezas, debilidades y oportunidades de las principales plataformas de venta de entradas en Argentina y el exterior, con el fin de diseñar un sistema propio para el **Teatro Español Pigüé** que supere en usabilidad, control y flexibilidad a las soluciones existentes.

---

## 🧩 Plataformas Analizadas

| Plataforma | País | Características destacadas | Oportunidades detectadas |
|-------------|------|-----------------------------|----------------------------|
| **Plateanet** | 🇦🇷 Argentina | Amplia presencia nacional. Mapa de asientos en salas grandes. Integración con salas y productores. | Limitada personalización de interfaz. Costos altos por servicio. No orientada a gestión de salas pequeñas o independientes. |
| **EntradaUno** | 🇦🇷 Argentina | Gestión de entradas, QR, informes de ventas. API para integraciones. | Interfaz desactualizada. No permite branding completo. Experiencia móvil mejorable. |
| **Passline** | 🇦🇷 Argentina | Buena experiencia de usuario. Procesos automáticos de confirmación y envío de tickets. | Dependencia total de su infraestructura y dominio. Escaso control de datos por parte del teatro. |
| **TicketHoy** | 🇦🇷 Argentina | Potente backoffice, reportes y roles avanzados. Integración con redes sociales. | Interfaz confusa para administradores. No adaptable al branding completo del teatro. |
| **Eventbrite** | 🌎 Internacional | Interfaz intuitiva, fácil creación de eventos. Excelente experiencia móvil. | Enfocada en eventos simples, no en salas con asientos numerados. Comisión en USD. |
| **Vivaticket** | 🇮🇹 Internacional | Sistema profesional para teatros y arenas. Permite múltiples salas, reportes, y mapas 3D. | Costos muy altos. Complejidad de implementación para un solo teatro. |
| **TickAnt** | 🇦🇷 Argentina | Plataforma más pequeña, flexible en integración. Ofrece API JSON y ventas embebidas. | Poco conocida, sin soporte para branding personalizado ni QR offline. |

---

## 💡 Insights clave

1. **El control de datos** (usuarios, ventas, reportes) es el principal diferencial frente a plataformas de terceros.  
2. Los **costos por servicio** limitan la rentabilidad de las salas independientes.  
3. La **personalización visual y de experiencia** (branding propio, diseño coherente con la identidad del teatro) es escasa en casi todas las opciones.  
4. La **integración con boletería física** (apertura y cierre de caja, cortesías, descuentos manuales) es un punto débil en la mayoría de las plataformas.  
5. Los **métodos de pago locales** (como Mercado Pago) y la **entrega de tickets por WhatsApp o email** son esenciales para el público argentino.

---

## 🏆 Oportunidad para el Teatro Español Pigüé

Desarrollar un sistema de ticketing **propio**, moderno y adaptado al contexto local, que:
- Elimine intermediarios y comisiones externas.  
- Brinde autonomía total en gestión de cartelera, boletería y reportes.  
- Permita aplicar el branding institucional en todas las etapas (desde la compra hasta el e-ticket).  
- Combine venta online + presencial bajo una misma base de datos.  
- Soporte QR dinámico y verificación offline.  

---

## 🔍 Referencias Técnicas y de Diseño

- **Repositorios de inspiración:**
  - [Open Event Frontend (FOSSASIA)](https://github.com/fossasia/open-event-frontend)
  - [Ticketing System - Node.js Sample](https://github.com/atikurrahmanshishir/nodejs-ticket-booking)
  - [React Seat Booking Example](https://github.com/kannan-arumugam/react-seat-booking)

- **Buenas prácticas detectadas:**
  - UX Mobile First.
  - Autenticación basada en JWT y roles.
  - Mapas de butacas SVG interactivos.
  - Generación y validación de QR con librerías como `qrcode` y `jsQR`.
  - Integración de pagos con SDK oficial de Mercado Pago.

---

## 📈 Conclusión

El nuevo sistema del **Teatro Español Pigüé** debe aspirar a combinar:
- La **solidez operativa** de Plateanet o TicketHoy.  
- La **usabilidad moderna** de Eventbrite.  
- Y la **flexibilidad total de datos y branding** de una plataforma desarrollada in-house.

Esto permitirá una gestión completa de la experiencia artística, administrativa y comercial, asegurando sostenibilidad económica y autonomía tecnológica del teatro.
