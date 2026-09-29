-- Normaliza todos los nombres de área a mayúsculas.
-- Migración de datos irreversible: conserva el nombre, cambia únicamente su formato.

UPDATE test.maintenances
SET area = UPPER(BTRIM(area))
WHERE area IS DISTINCT FROM UPPER(BTRIM(area));
