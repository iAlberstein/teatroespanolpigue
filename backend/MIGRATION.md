# Migración de Base de Datos

## Campos agregados recientemente

Esta migración agrega los siguientes campos a la base de datos:

1. **`customer_dni`** en tabla `sales` - Para guardar DNI del cliente en ventas
2. **`active`** en tabla `users` - Para activar/desactivar usuarios

## Cómo ejecutar la migración

Desde la carpeta `backend`:

```bash
node add-missing-columns.js
```

Este script:
- Agrega las columnas faltantes si no existen
- Marca todos los usuarios existentes como activos por defecto
- Es seguro ejecutarlo múltiples veces (no duplica columnas)

## Después de la migración

Una vez ejecutado el script:
- Reiniciar el servidor backend
- Los reportes volverán a cargar correctamente
- El panel de gestión de usuarios funcionará correctamente

## Troubleshooting

Si hay errores al ejecutar el script:
1. Verificar que la conexión a la base de datos esté configurada correctamente
2. Asegurarse de tener permisos para modificar la estructura de la base de datos
3. Si ya existen las columnas, el script mostrará advertencias pero no fallará
