-- Crea una asignación de equipo y kit de periféricos en una sola transacción.
-- Ejecutar una vez en el SQL Editor de Supabase, dentro del esquema test.

CREATE OR REPLACE FUNCTION test.create_assignment(
  p_employee_id INTEGER,
  p_equipment_id INTEGER,
  p_assigned_by INTEGER,
  p_stock_ids INTEGER[],
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  new_assignment_id INTEGER;
  selected_equipment_type TEXT;
  has_mouse BOOLEAN;
  has_keyboard BOOLEAN;
  has_cooling_base BOOLEAN;
  stock_count INTEGER;
BEGIN
  IF COALESCE(cardinality(p_stock_ids), 0) < 2 THEN
    RAISE EXCEPTION 'El kit debe incluir un mouse y un teclado.';
  END IF;

  IF (SELECT COUNT(DISTINCT stock_id) FROM unnest(p_stock_ids) AS stock_id) <> cardinality(p_stock_ids) THEN
    RAISE EXCEPTION 'No se puede seleccionar el mismo periférico más de una vez.';
  END IF;

  SELECT equipment_type INTO selected_equipment_type
  FROM test.maintenances
  WHERE id = p_equipment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El equipo seleccionado no existe.';
  END IF;

  PERFORM 1 FROM test.usuarios WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El empleado seleccionado no existe.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM test.assignments
    WHERE status = 'active'
      AND (employee_id = p_employee_id OR equipment_id = p_equipment_id)
  ) THEN
    RAISE EXCEPTION 'El empleado o el equipo ya tiene un préstamo activo.';
  END IF;

  PERFORM 1
  FROM test.peripheral_stock
  WHERE id = ANY(p_stock_ids)
  FOR UPDATE;

  SELECT COUNT(*),
         BOOL_OR(item_type = 'mouse'),
         BOOL_OR(item_type = 'keyboard'),
         BOOL_OR(item_type = 'cooling_base')
  INTO stock_count, has_mouse, has_keyboard, has_cooling_base
  FROM test.peripheral_stock
  WHERE id = ANY(p_stock_ids)
    AND status = 'active'
    AND quantity_available >= 1;

  IF stock_count <> cardinality(p_stock_ids) THEN
    RAISE EXCEPTION 'Uno o más periféricos ya no están disponibles.';
  END IF;

  IF COALESCE(has_mouse, FALSE) = FALSE OR COALESCE(has_keyboard, FALSE) = FALSE THEN
    RAISE EXCEPTION 'El kit requiere un mouse y un teclado.';
  END IF;

  IF COALESCE(has_cooling_base, FALSE) = TRUE AND selected_equipment_type <> 'Portátil' THEN
    RAISE EXCEPTION 'La base refrigerante solo puede asignarse a un portátil.';
  END IF;

  INSERT INTO test.assignments (
    employee_id, equipment_id, status, assigned_by, delivery_notes
  ) VALUES (
    p_employee_id, p_equipment_id, 'draft', p_assigned_by, NULLIF(TRIM(p_notes), '')
  )
  RETURNING id INTO new_assignment_id;

  INSERT INTO test.assignment_items (
    assignment_id, peripheral_stock_id, quantity_delivered
  )
  SELECT new_assignment_id, stock_id, 1
  FROM unnest(p_stock_ids) AS stock_id;

  UPDATE test.peripheral_stock
  SET quantity_available = quantity_available - 1,
      quantity_assigned = quantity_assigned + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ANY(p_stock_ids);

  INSERT INTO test.peripheral_stock_movements (
    peripheral_stock_id, assignment_id, movement_type, quantity, recorded_by, notes
  )
  SELECT stock_id, new_assignment_id, 'assignment', 1, p_assigned_by, NULL
  FROM unnest(p_stock_ids) AS stock_id;

  UPDATE test.assignments
  SET status = 'active',
      updated_at = CURRENT_TIMESTAMP
  WHERE id = new_assignment_id;

  RETURN jsonb_build_object('id', new_assignment_id, 'status', 'active');
END;
$$;

GRANT EXECUTE ON FUNCTION test.create_assignment(INTEGER, INTEGER, INTEGER, INTEGER[], TEXT) TO service_role;
