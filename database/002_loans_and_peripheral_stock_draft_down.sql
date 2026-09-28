-- BORRADOR DE REVERSIÓN.
-- Úsalo únicamente antes de cargar datos reales de préstamos.
-- En producción, una reversión con datos debe ser una nueva migración preservando historial.

DROP TRIGGER IF EXISTS validate_cooling_base_assignment_trigger ON test.assignment_items;
DROP TRIGGER IF EXISTS validate_assignment_activation_trigger ON test.assignments;
DROP FUNCTION IF EXISTS test.validate_cooling_base_assignment();
DROP FUNCTION IF EXISTS test.validate_assignment_activation();
DROP TABLE IF EXISTS test.peripheral_stock_movements;
DROP TABLE IF EXISTS test.assignment_items;
DROP TABLE IF EXISTS test.assignments;
DROP TABLE IF EXISTS test.peripheral_stock;
