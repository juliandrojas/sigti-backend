-- La columna has_glpi fue reemplazada por glpi.
ALTER TABLE IF EXISTS public.maintenances
  DROP COLUMN IF EXISTS has_glpi;

ALTER TABLE IF EXISTS test.maintenances
  DROP COLUMN IF EXISTS has_glpi;
