-- Deja el catálogo actual de periféricos sin existencias cargadas.
-- Conserva las filas para que puedan reutilizarse y no toca préstamos activos,
-- unidades en limpieza, dañadas o retiradas.

UPDATE test.peripheral_stock
SET quantity_total = 0,
    quantity_available = 0,
    updated_at = NOW()
WHERE quantity_total > 0
  AND quantity_assigned = 0
  AND quantity_cleaning = 0
  AND quantity_damaged = 0
  AND quantity_retired = 0;
