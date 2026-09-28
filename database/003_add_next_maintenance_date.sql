-- SIGTI - Próxima fecha de mantenimiento
-- La fecha se calcula automáticamente seis meses después del mantenimiento.

ALTER TABLE public.maintenance_records
  ADD COLUMN IF NOT EXISTS next_maintenance_date DATE
  GENERATED ALWAYS AS ((maintenance_date + INTERVAL '6 months')::DATE) STORED;
