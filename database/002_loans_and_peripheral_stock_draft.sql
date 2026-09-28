-- BORRADOR PARA REVISIÓN: no ejecutar todavía en Supabase.
-- Alcance: préstamos de equipos EF y stock de mouse, teclados y bases refrigerantes.
-- Este diseño usa test.maintenances como el catálogo de equipos individuales.

CREATE SCHEMA IF NOT EXISTS test;

CREATE TABLE test.peripheral_stock (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR(30) NOT NULL
    CHECK (item_type IN ('mouse', 'charge', 'keyboard', 'cooling_base')),
  brand VARCHAR(100),
  reference VARCHAR(150),
  model VARCHAR(150),
  location VARCHAR(150) NOT NULL DEFAULT 'Área de Sistemas',
  quantity_total INTEGER NOT NULL DEFAULT 0 CHECK (quantity_total >= 0),
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_assigned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_assigned >= 0),
  quantity_cleaning INTEGER NOT NULL DEFAULT 0 CHECK (quantity_cleaning >= 0),
  quantity_damaged INTEGER NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
  quantity_retired INTEGER NOT NULL DEFAULT 0 CHECK (quantity_retired >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT peripheral_stock_quantity_balance CHECK (
    quantity_total = quantity_available
      + quantity_assigned
      + quantity_cleaning
      + quantity_damaged
      + quantity_retired
  )
);

CREATE TABLE test.assignments (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES test.usuarios(id) ON DELETE RESTRICT,
  equipment_id INTEGER NOT NULL REFERENCES test.maintenances(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'returned', 'cancelled')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMPTZ,
  assigned_by INTEGER NOT NULL REFERENCES test.usuarios(id) ON DELETE RESTRICT,
  received_by INTEGER REFERENCES test.usuarios(id) ON DELETE RESTRICT,
  delivery_notes TEXT,
  return_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assignment_return_date CHECK (
    (status IN ('draft', 'active') AND returned_at IS NULL)
    OR (status IN ('returned', 'cancelled') AND returned_at IS NOT NULL)
  )
);

CREATE TABLE test.assignment_items (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES test.assignments(id) ON DELETE RESTRICT,
  peripheral_stock_id INTEGER NOT NULL REFERENCES test.peripheral_stock(id) ON DELETE RESTRICT,
  quantity_delivered INTEGER NOT NULL DEFAULT 1 CHECK (quantity_delivered > 0),
  quantity_returned INTEGER NOT NULL DEFAULT 0
    CHECK (quantity_returned >= 0 AND quantity_returned <= quantity_delivered),
  return_condition VARCHAR(20)
    CHECK (return_condition IN ('good', 'cleaning', 'damaged', 'missing')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT assignment_item_unique_per_stock UNIQUE (assignment_id, peripheral_stock_id),
  CONSTRAINT assignment_item_return_data CHECK (
    (quantity_returned = 0 AND return_condition IS NULL)
    OR (quantity_returned > 0 AND return_condition IS NOT NULL)
  )
);

CREATE TABLE test.peripheral_stock_movements (
  id SERIAL PRIMARY KEY,
  peripheral_stock_id INTEGER NOT NULL REFERENCES test.peripheral_stock(id) ON DELETE RESTRICT,
  assignment_id INTEGER REFERENCES test.assignments(id) ON DELETE RESTRICT,
  movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN (
    'entry', 'assignment', 'return_good', 'send_to_cleaning',
    'cleaning_completed', 'damaged', 'retired', 'adjustment'
  )),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  recorded_by INTEGER NOT NULL REFERENCES test.usuarios(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un empleado y un equipo EF solo pueden tener una asignación activa a la vez.
CREATE UNIQUE INDEX assignments_active_employee_unique
  ON test.assignments (employee_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX assignments_active_equipment_unique
  ON test.assignments (equipment_id)
  WHERE status = 'active';

CREATE INDEX assignment_items_assignment_idx
  ON test.assignment_items (assignment_id);

CREATE INDEX peripheral_stock_movements_stock_idx
  ON test.peripheral_stock_movements (peripheral_stock_id, created_at DESC);

CREATE INDEX peripheral_stock_movements_assignment_idx
  ON test.peripheral_stock_movements (assignment_id);

-- Una base refrigerante solo puede estar en el kit de un portátil.
CREATE OR REPLACE FUNCTION test.validate_cooling_base_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_item_type VARCHAR(30);
  current_equipment_type VARCHAR(50);
BEGIN
  SELECT stock.item_type, equipment.equipment_type
  INTO current_item_type, current_equipment_type
  FROM test.assignments assignment
  JOIN test.peripheral_stock stock ON stock.id = NEW.peripheral_stock_id
  JOIN test.maintenances equipment ON equipment.id = assignment.equipment_id
  WHERE assignment.id = NEW.assignment_id;

  IF current_item_type = 'cooling_base' AND current_equipment_type <> 'Portátil' THEN
    RAISE EXCEPTION 'Una base refrigerante solo se puede asignar con un portátil.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_cooling_base_assignment_trigger
BEFORE INSERT OR UPDATE OF assignment_id, peripheral_stock_id
ON test.assignment_items
FOR EACH ROW
EXECUTE FUNCTION test.validate_cooling_base_assignment();

-- Una asignación se crea primero como borrador. Solo se activa al tener
-- el equipo EF, un mouse y un teclado registrados en assignment_items.
CREATE OR REPLACE FUNCTION test.validate_assignment_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_mouse BOOLEAN;
  has_keyboard BOOLEAN;
BEGIN
  IF NEW.status <> 'active' OR OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT
    BOOL_OR(stock.item_type = 'mouse'),
    BOOL_OR(stock.item_type = 'keyboard')
  INTO has_mouse, has_keyboard
  FROM test.assignment_items item
  JOIN test.peripheral_stock stock ON stock.id = item.peripheral_stock_id
  WHERE item.assignment_id = NEW.id
    AND item.quantity_delivered > 0;

  IF COALESCE(has_mouse, FALSE) = FALSE OR COALESCE(has_keyboard, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Una asignación activa requiere, como mínimo, un mouse y un teclado.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_assignment_activation_trigger
BEFORE UPDATE OF status
ON test.assignments
FOR EACH ROW
EXECUTE FUNCTION test.validate_assignment_activation();

-- Regla de aplicación para la siguiente etapa:
-- Cada entrega, devolución o ajuste debe actualizar peripheral_stock y crear
-- su peripheral_stock_movements correspondiente en una misma transacción.
