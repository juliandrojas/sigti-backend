-- Elimina el registro obsoleto identificado en el inventario.
-- Se limita por todos sus datos visibles para no afectar otras bases refrigerantes.

DELETE FROM test.peripheral_stock
WHERE item_type = 'cooling_base'
  AND LOWER(BTRIM(COALESCE(brand, ''))) = 'cualquiera'
  AND LOWER(BTRIM(COALESCE(reference, ''))) = 'cualquiera'
  AND LOWER(BTRIM(COALESCE(model, ''))) = 'aaa'
  AND LOWER(BTRIM(COALESCE(location, ''))) = 'contabilidad'
  AND quantity_assigned = 0
  AND quantity_cleaning = 0
  AND quantity_damaged = 0
  AND quantity_retired = 0;
