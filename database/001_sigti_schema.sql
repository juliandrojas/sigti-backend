-- SIGTI - Estructura inicial para PostgreSQL / pgAdmin 4
-- Este script no elimina tablas ni registros existentes.
-- Ejecútalo desde Query Tool sobre la base de datos destino.

BEGIN;

CREATE TABLE IF NOT EXISTS public.roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  lastname TEXT,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.tickets (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.maintenances (
  id SERIAL PRIMARY KEY,
  company VARCHAR(100) NOT NULL DEFAULT 'Petrocasinos'
    CHECK (company IN ('Petrocasinos', 'Cosecharte')),
  last_maintenance DATE NOT NULL DEFAULT CURRENT_DATE,
  equipment_code VARCHAR(20) NOT NULL,
  ip_address VARCHAR(45),
  area VARCHAR(150) NOT NULL,
  responsible VARCHAR(255) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(150) NOT NULL,
  serial_number VARCHAR(150) NOT NULL,
  equipment_type VARCHAR(50) NOT NULL
    CHECK (equipment_type IN ('Portátil', 'Torre', 'Todo en uno')),
  processor_model VARCHAR(150) NOT NULL,
  processor_detail VARCHAR(255),
  ram VARCHAR(20) NOT NULL,
  os VARCHAR(100) NOT NULL,
  hdd_size VARCHAR(20),
  ssd_size VARCHAR(20),
  is_nvme BOOLEAN NOT NULL DEFAULT FALSE,
  nvme_size VARCHAR(20),
  screen_size VARCHAR(30) NOT NULL,
  antivirus VARCHAR(30) NOT NULL DEFAULT 'Sophos'
    CHECK (antivirus IN ('Sophos', 'Defender')),
  has_glpi BOOLEAN NOT NULL DEFAULT FALSE,
  observations TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Compatibilidad con una tabla maintenances creada antes del formulario actual.
ALTER TABLE public.maintenances ADD COLUMN IF NOT EXISTS company VARCHAR(100) DEFAULT 'Petrocasinos';
ALTER TABLE public.maintenances ADD COLUMN IF NOT EXISTS is_nvme BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.maintenances ADD COLUMN IF NOT EXISTS antivirus VARCHAR(30) DEFAULT 'Sophos';

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'component',
  brand VARCHAR(100),
  reference VARCHAR(150),
  model VARCHAR(150),
  serial_number VARCHAR(150),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  condition VARCHAR(30) NOT NULL DEFAULT 'good',
  location VARCHAR(150) NOT NULL DEFAULT 'bodega',
  status VARCHAR(30) NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.inventory_loans (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  requested_by VARCHAR(255) NOT NULL,
  position VARCHAR(150),
  start_datetime TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_return_datetime TIMESTAMP WITHOUT TIME ZONE,
  actual_return_datetime TIMESTAMP WITHOUT TIME ZONE,
  pickup_signature TEXT,
  return_signature TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'returned', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_technician_id ON public.tickets(technician_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_maintenances_equipment_code ON public.maintenances(equipment_code);
CREATE INDEX IF NOT EXISTS idx_inventory_loans_item_id ON public.inventory_loans(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_loans_status ON public.inventory_loans(status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
CREATE TRIGGER trg_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_items_updated_at ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.roles (name)
VALUES ('sistemas'), ('usuario')
ON CONFLICT (name) DO NOTHING;

COMMIT;
