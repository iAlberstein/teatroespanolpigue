# Migraciones de Base de Datos

## Ejecutar la migración de Bordereaux

Para crear la tabla `bordereaux` necesaria para el sistema de reportes, ejecuta:

### Opción 1: Usando psql directamente

```bash
psql -U tu_usuario -d tu_base_de_datos -f backend/migrations/003_create_bordereaux.sql
```

### Opción 2: Desde psql interactivo

```bash
# Conectarse a la base de datos
psql -U tu_usuario -d tu_base_de_datos

# Dentro de psql, ejecutar:
\i backend/migrations/003_create_bordereaux.sql
```

### Opción 3: Copiar y pegar en tu cliente SQL

Abre el archivo `003_create_bordereaux.sql` y copia el contenido en tu cliente SQL favorito (pgAdmin, DBeaver, etc.)

---

## Verificar que se creó correctamente

```sql
-- Verificar que existe la tabla
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'bordereaux';

-- Ver la estructura
\d bordereaux

-- Verificar que no hay datos (debería estar vacía)
SELECT COUNT(*) FROM bordereaux;
```

---

## ⚠️ Importante

- **Backup**: Siempre haz un backup de tu base de datos antes de ejecutar migraciones
- **Ambiente**: Ejecuta primero en desarrollo, luego en producción
- **Credenciales**: Asegúrate de tener los permisos necesarios para crear tablas

---

## Rollback (revertir)

Si necesitas eliminar la tabla:

```sql
DROP TABLE IF EXISTS bordereaux CASCADE;
```

**¡CUIDADO!** Esto eliminará todos los bordereaux creados.
