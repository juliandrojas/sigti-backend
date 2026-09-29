-- Normaliza variantes de nombre para que Bienestar se agrupe como una sola área.
-- Migración de datos para el esquema utilizado actualmente por SIGTI.

UPDATE test.maintenances
SET area = 'Bienestar'
WHERE LOWER(BTRIM(area)) = 'bienestar'
  AND area IS DISTINCT FROM 'Bienestar';
