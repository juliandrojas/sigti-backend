-- Unifica RRHH y sus variantes en el área oficial RECURSOS HUMANOS.
-- Migración de datos irreversible: conserva los registros y corrige únicamente el nombre.

UPDATE test.maintenances
SET area = 'RECURSOS HUMANOS'
WHERE LOWER(BTRIM(area)) IN ('rrhh', 'recursos humanos')
  AND area IS DISTINCT FROM 'RECURSOS HUMANOS';
