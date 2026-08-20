-- Bordereaux: contrato como lista de ítems (título/parte, % o monto fijo, descripción)
-- y posibilidad de tener una configuración de contrato distinta por función/fecha
-- (útil para shows con múltiples sesiones / packs, ej: 10/30/60 en una fecha y 30/70 en otra).
--
-- Compatibilidad: los bordereaux existentes NO se tocan (contract_items queda NULL en ellos).
-- El backend interpreta contract_items = NULL/vacío como "usar el esquema viejo de 2 filas"
-- (contract_theater_percentage / contract_user_percentage), por lo que los bordereaux ya
-- cerrados siguen mostrándose exactamente igual que hoy. Los bordereaux 'provisional'
-- se migran aparte con backend/src/scripts/migrateBordereauxContractItems.js.

-- Nota: se dejan ambas columnas NULL-ables sin DEFAULT de expresión (JSON_OBJECT()) para
-- mantener compatibilidad con versiones de MySQL/MariaDB anteriores a 8.0.13. El backend
-- (Bordereaux.js / bordereaux.js) trata NULL como "sin overrides" ({}) en tiempo de lectura.
ALTER TABLE bordereaux
  ADD COLUMN contract_items JSON NULL COMMENT 'Lista de items de contrato: [{title, mode: percentage|fixed, percentage, fixedAmount, description, settle}]' AFTER contract_user_percentage,
  ADD COLUMN session_contract_overrides JSON NULL COMMENT 'Override de contract_items por session_id: { "<session_id>": [...items] }' AFTER contract_items;
