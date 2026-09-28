-- Registro explícito de si el equipo está registrado en GLPI.
-- Sin DEFAULT: el valor debe venir del checkbox del formulario.
ALTER TABLE IF EXISTS public.maintenances
  ADD COLUMN IF NOT EXISTS glpi BOOLEAN;

ALTER TABLE IF EXISTS test.maintenances
  ADD COLUMN IF NOT EXISTS glpi BOOLEAN;

COMMENT ON COLUMN public.maintenances.glpi IS
  'Indica si el equipo está registrado en GLPI; lo define el técnico.';

COMMENT ON COLUMN test.maintenances.glpi IS
  'Indica si el equipo está registrado en GLPI; lo define el técnico.';
