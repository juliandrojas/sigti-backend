-- Código base (EF1234) y código completo generado (PPCEF1234).
-- Se mantiene nullable para no bloquear registros históricos existentes.
ALTER TABLE IF EXISTS public.maintenances
  ADD COLUMN IF NOT EXISTS full_equipment_code VARCHAR(20);

ALTER TABLE IF EXISTS test.maintenances
  ADD COLUMN IF NOT EXISTS full_equipment_code VARCHAR(20);

COMMENT ON COLUMN public.maintenances.equipment_code IS
  'Código base del equipo, por ejemplo EF1234.';

COMMENT ON COLUMN public.maintenances.full_equipment_code IS
  'Código completo generado por empresa y tipo, por ejemplo PPCEF1234.';

COMMENT ON COLUMN test.maintenances.equipment_code IS
  'Código base del equipo, por ejemplo EF1234.';

COMMENT ON COLUMN test.maintenances.full_equipment_code IS
  'Código completo generado por empresa y tipo, por ejemplo PPCEF1234.';

-- El backend accede al esquema test mediante la clave service_role.
GRANT USAGE ON SCHEMA test TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA test TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA test TO service_role;
