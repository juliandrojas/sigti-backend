-- Añade el pad mouse como periférico válido para el stock y el levantamiento físico.

ALTER TABLE test.peripheral_stock
  DROP CONSTRAINT IF EXISTS peripheral_stock_item_type_check;

ALTER TABLE test.peripheral_stock
  ADD CONSTRAINT peripheral_stock_item_type_check
  CHECK (item_type IN ('mouse', 'keyboard', 'charge', 'cooling_base', 'mouse_pad'));

ALTER TABLE test.equipment_peripheral_counts
  DROP CONSTRAINT IF EXISTS equipment_peripheral_counts_item_type_check;

ALTER TABLE test.equipment_peripheral_counts
  ADD CONSTRAINT equipment_peripheral_counts_item_type_check
  CHECK (item_type IN ('mouse', 'keyboard', 'charge', 'cooling_base', 'mouse_pad'));
