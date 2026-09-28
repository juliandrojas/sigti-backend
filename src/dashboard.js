import { config } from './config.js';

function headers(schema = 'public', countOnly = false) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('La configuración de Supabase no está completa.');
  }
  const result = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`
  };
  if (countOnly) {
    result.Prefer = 'count=exact';
    result.Range = '0-0';
  }
  if (schema !== 'public') result['Accept-Profile'] = schema;
  return result;
}

async function countRows(table, filters = {}, schema = 'public') {
  const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
  url.searchParams.set('select', 'id');
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value);

  const response = await fetch(url, { headers: headers(schema, true) });
  if (response.status === 404) return 0;
  if (!response.ok) throw new Error(`No fue posible consultar ${table}.`);
  const total = response.headers.get('content-range')?.split('/').at(-1);
  return Number(total ?? 0);
}

async function listRows(table, select, schema) {
  const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
  url.searchParams.set('select', select);
  const response = await fetch(url, { headers: headers(schema) });
  if (!response.ok) throw new Error(`No fue posible consultar ${table}.`);
  return response.json();
}

export async function getSystemMetrics() {
  const [inventoryItems, tickets, maintenances, activeLoans, equipment, records] = await Promise.all([
    countRows('peripheral_stock', {}, config.supabaseMaintenanceSchema),
    countRows('tickets'),
    countRows('maintenances', {}, config.supabaseMaintenanceSchema),
    countRows('assignments', { status: 'eq.active' }, config.supabaseMaintenanceSchema),
    listRows('maintenances', 'id,equipment_type,company,glpi', config.supabaseMaintenanceSchema),
    listRows('maintenance_records', 'id,maintenance_date,next_maintenance_date', config.supabaseMaintenanceSchema)
  ]);

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const today = now.toISOString().slice(0, 10);
  const thirtyDaysFromToday = new Date(now);
  thirtyDaysFromToday.setDate(thirtyDaysFromToday.getDate() + 30);
  const thirtyDayLimit = thirtyDaysFromToday.toISOString().slice(0, 10);
  const latestRecordByMaintenance = new Map();
  for (const record of records) {
    const latestRecord = latestRecordByMaintenance.get(record.maintenance_id);
    if (!latestRecord || record.maintenance_date > latestRecord.maintenance_date) {
      latestRecordByMaintenance.set(record.maintenance_id, record);
    }
  }
  const latestMaintenanceRecords = [...latestRecordByMaintenance.values()];
  const computerTypes = ['Portátil', 'Torre', 'Todo en Uno'];
  const computerTypeSet = new Set(computerTypes);
  const computerEquipment = equipment.filter((item) => computerTypeSet.has(item.equipment_type));
  const equipmentByType = Object.entries(equipment.reduce((counts, item) => {
    const type = item.equipment_type || 'Sin tipo';
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {})).map(([label, value]) => ({ label, value }));
  const equipmentByCompany = Object.entries(equipment.reduce((counts, item) => {
    const company = item.company || 'Sin empresa';
    counts[company] = (counts[company] ?? 0) + 1;
    return counts;
  }, {})).map(([label, value]) => ({ label, value }));

  return {
    inventoryItems, tickets, maintenances, activeLoans,
    stats: {
      maintenancesThisMonth: records.filter((record) => record.maintenance_date?.startsWith(currentMonth)).length,
      equipmentTotal: equipment.length,
      computerTotal: computerEquipment.length,
      computerByType: computerTypes.map((label) => ({
        label,
        value: equipmentByType.find((item) => item.label === label)?.value ?? 0
      })),
      equipmentByCompany,
      glpiRegistered: equipment.filter((item) => item.glpi === true).length,
      overdueMaintenances: latestMaintenanceRecords.filter((record) => record.next_maintenance_date < today).length,
      dueSoonMaintenances: latestMaintenanceRecords.filter((record) => (
        record.next_maintenance_date >= today && record.next_maintenance_date <= thirtyDayLimit
      )).length,
      upToDateMaintenances: latestMaintenanceRecords.filter((record) => record.next_maintenance_date > thirtyDayLimit).length
    }
  };
}
