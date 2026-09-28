import { config } from './config.js';

function headers(method, prefer) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('La configuración de Supabase no está completa.');
  }

  const result = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    'Content-Type': 'application/json'
  };

  if (method === 'GET') result['Accept-Profile'] = config.supabaseMaintenanceSchema;
  else result['Content-Profile'] = config.supabaseMaintenanceSchema;
  if (prefer) result.Prefer = prefer;
  return result;
}

async function insertRow(table, payload) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers('POST', 'return=representation'),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No fue posible guardar ${table}: ${detail}`);
  }
  return (await response.json())[0];
}

async function deleteRow(table, id) {
  await fetch(`${config.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers('DELETE', 'return=minimal')
  });
}

async function updateRow(table, filters, payload) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: headers('PATCH', 'return=minimal'),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No fue posible actualizar ${table}: ${detail}`);
  }
}

async function getRows(table, parameters) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

  const response = await fetch(url, { headers: headers('GET') });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No fue posible consultar ${table}: ${detail}`);
  }
  return response.json();
}

export async function listSites(company) {
  const sites = await getRows('sites', {
    select: 'id,company,name,city,active',
    company: `eq.${encodeURIComponent(company)}`,
    active: 'eq.true',
    order: 'id.asc'
  });
  return sites;
}

export async function listMaintenances() {
  const [maintenances, sites] = await Promise.all([
    getRows('maintenances', {
    select: 'id,company,site_id,equipment_code,full_equipment_code,ip_address,area,responsible,brand,model,serial_number,equipment_type,processor_model,ram,os,hdd_size,ssd_size,is_nvme,screen_size,antivirus,glpi,observations,last_maintenance,created_at',
    order: 'created_at.desc'
    }),
    getRows('sites', { select: 'id,name' })
  ]);
  const siteNames = new Map(sites.map((site) => [String(site.id), site.name]));
  return maintenances.map((maintenance) => ({
    ...maintenance,
    site_name: siteNames.get(String(maintenance.site_id)) ?? null
  }));
}

export async function updateMaintenance(id, data) {
  await updateRow('maintenances', { id: `eq.${encodeURIComponent(id)}` }, data);
  const rows = await getRows('maintenances', {
    select: 'id,company,site_id,equipment_code,full_equipment_code,ip_address,area,responsible,brand,model,serial_number,equipment_type,processor_model,ram,os,hdd_size,ssd_size,is_nvme,screen_size,antivirus,glpi,observations,last_maintenance,created_at',
    id: `eq.${encodeURIComponent(id)}`,
    limit: '1'
  });
  return rows[0];
}

export function updateMaintenanceResponsible(id, responsible) {
  return updateRow('maintenances', { id: `eq.${encodeURIComponent(id)}` }, { responsible });
}

export function listMaintenanceHistory(maintenanceId) {
  return getRows('maintenance_records', {
    select: 'id,maintenance_id,maintenance_date,next_maintenance_date,maintenance_type,technician_id,description,actions_taken,observations,created_at',
    maintenance_id: `eq.${encodeURIComponent(maintenanceId)}`,
    order: 'maintenance_date.desc'
  });
}

export async function listMaintenanceRecords() {
  const [records, maintenances, users] = await Promise.all([
    getRows('maintenance_records', {
      select: 'id,maintenance_id,maintenance_date,next_maintenance_date,maintenance_type,technician_id,description,actions_taken,observations,created_at',
      order: 'maintenance_date.desc,created_at.desc'
    }),
    getRows('maintenances', {
      select: 'id,full_equipment_code,equipment_code,company,brand,model,serial_number'
    }),
    getRows('usuarios', {
      select: 'id,name,lastname'
    })
  ]);
  const equipmentById = new Map(maintenances.map((item) => [String(item.id), item]));
  const usersById = new Map(users.map((user) => [String(user.id), [user.name, user.lastname].filter(Boolean).join(' ')]));
  return records.map((record) => ({
    ...record,
    equipment: equipmentById.get(String(record.maintenance_id)) ?? null,
    technician_name: usersById.get(String(record.technician_id)) ?? 'No definido'
  }));
}

export async function createMaintenanceRecord({ maintenanceId, data, technicianId }) {
  const record = await insertRow('maintenance_records', {
    maintenance_id: maintenanceId,
    maintenance_date: data.maintenance_date,
    maintenance_type: data.maintenance_type,
    technician_id: technicianId,
    description: data.description,
    actions_taken: data.actions_taken || null,
    observations: data.observations || null
  });

  try {
    await updateRow('maintenances', { id: `eq.${encodeURIComponent(maintenanceId)}` }, {
      last_maintenance: data.maintenance_date
    });
    return record;
  } catch (error) {
    await deleteRow('maintenance_records', record.id);
    throw error;
  }
}

export async function createMaintenance({ data, technicianId }) {
  const maintenance = await insertRow('maintenances', data);

  try {
    const record = await insertRow('maintenance_records', {
      maintenance_id: maintenance.id,
      maintenance_date: maintenance.last_maintenance,
      maintenance_type: 'Inicial',
      technician_id: technicianId,
      description: 'Registro inicial de la hoja de vida técnica del equipo.',
      observations: data.observations || null
    });
    return { maintenance, record };
  } catch (error) {
    await deleteRow('maintenances', maintenance.id);
    throw error;
  }
}
