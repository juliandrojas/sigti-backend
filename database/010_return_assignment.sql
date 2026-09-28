-- Corrige y reemplaza la función de devolución de kits.
-- Ejecutar una vez en el SQL Editor de Supabase, dentro del esquema test.
-- Es una migración hacia adelante: no borra préstamos, periféricos ni historial.

CREATE OR REPLACE FUNCTION test.return_assignment(
  p_assignment_id INTEGER,
  p_received_by INTEGER,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $return_assignment$
DECLARE
  current_item RECORD;
  input_item JSONB;
  item_condition TEXT;
  returned_quantity INTEGER;
BEGIN
  PERFORM 1
  FROM test.assignments
  WHERE id = p_assignment_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El préstamo no existe o ya fue devuelto.';
  END IF;

  FOR current_item IN
    SELECT id, peripheral_stock_id, quantity_delivered
    FROM test.assignment_items
    WHERE assignment_id = p_assignment_id
    FOR UPDATE
  LOOP
    SELECT value INTO input_item
    FROM jsonb_array_elements(p_items)
    WHERE (value ->> 'assignment_item_id')::INTEGER = current_item.id;

    IF input_item IS NULL THEN
      RAISE EXCEPTION 'Falta el estado de uno de los periféricos asignados.';
    END IF;

    item_condition := input_item ->> 'condition';
    IF item_condition NOT IN ('good', 'cleaning', 'damaged', 'missing') THEN
      RAISE EXCEPTION 'El estado de devolución no es válido.';
    END IF;

    returned_quantity := current_item.quantity_delivered;

    UPDATE test.assignment_items
    SET quantity_returned = returned_quantity,
        return_condition = item_condition,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = current_item.id;

    UPDATE test.peripheral_stock
    SET quantity_assigned = quantity_assigned - returned_quantity,
        quantity_available = quantity_available
          + CASE WHEN item_condition = 'good' THEN returned_quantity ELSE 0 END,
        quantity_cleaning = quantity_cleaning
          + CASE WHEN item_condition = 'cleaning' THEN returned_quantity ELSE 0 END,
        quantity_damaged = quantity_damaged
          + CASE WHEN item_condition = 'damaged' THEN returned_quantity ELSE 0 END,
        quantity_retired = quantity_retired
          + CASE WHEN item_condition = 'missing' THEN returned_quantity ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = current_item.peripheral_stock_id
      AND quantity_assigned >= returned_quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El stock asignado del periférico no es suficiente para registrar la devolución.';
    END IF;

    INSERT INTO test.peripheral_stock_movements (
      peripheral_stock_id,
      assignment_id,
      movement_type,
      quantity,
      notes,
      recorded_by
    ) VALUES (
      current_item.peripheral_stock_id,
      p_assignment_id,
      CASE item_condition
        WHEN 'good' THEN 'return_good'
        WHEN 'cleaning' THEN 'send_to_cleaning'
        WHEN 'damaged' THEN 'damaged'
        ELSE 'retired'
      END,
      returned_quantity,
      CASE item_condition
        WHEN 'missing' THEN 'Periférico no devuelto (faltante).'
        ELSE NULL
      END,
      p_received_by
    );
  END LOOP;

  UPDATE test.assignments
  SET status = 'returned',
      returned_at = CURRENT_TIMESTAMP,
      received_by = p_received_by,
      return_notes = NULLIF(TRIM(p_notes), ''),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'id', p_assignment_id,
    'status', 'returned'
  );
END;
$return_assignment$;

GRANT EXECUTE ON FUNCTION test.return_assignment(INTEGER, INTEGER, JSONB, TEXT) TO service_role;
