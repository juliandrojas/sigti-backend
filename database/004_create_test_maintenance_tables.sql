-- SIGTI - Copia de pruebas para el módulo de mantenimientos
-- Las tablas se crean dentro del esquema test y no modifican public.

CREATE TABLE IF NOT EXISTS test.maintenances
(LIKE public.maintenances INCLUDING ALL);

CREATE TABLE IF NOT EXISTS test.maintenance_records
(LIKE public.maintenance_records INCLUDING ALL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_records_maintenance_id_fkey'
      AND conrelid = 'test.maintenance_records'::regclass
  ) THEN
    ALTER TABLE test.maintenance_records
      ADD CONSTRAINT maintenance_records_maintenance_id_fkey
      FOREIGN KEY (maintenance_id)
      REFERENCES test.maintenances(id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE test.maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE test.maintenance_records ENABLE ROW LEVEL SECURITY;
