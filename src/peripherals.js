import { config } from './config.js';

function headers(method, prefer) {
  const result = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: 'Bearer ' + config.supabaseServiceRoleKey,
    'Content-Type': 'application/json'
  };
  result[method === 'GET' ? 'Accept-Profile' : 'Content-Profile'] = config.supabaseMaintenanceSchema;
  if (prefer) result.Prefer = prefer;
  return result;
}

async function request(table, options = {}) {
  const url = new URL('/rest/v1/' + table, config.supabaseUrl);
  for (const [key, value] of Object.entries(options.parameters ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, { method: options.method ?? 'GET', headers: headers(options.method ?? 'GET', options.prefer), body: options.payload ? JSON.stringify(options.payload) : undefined });
  const body = await response.text();
  if (!response.ok) throw new Error('No fue posible procesar el levantamiento físico: ' + body);
  return body ? JSON.parse(body) : null;
}

export function listEquipmentPeripheralCounts(equipmentId) {
  return request('equipment_peripheral_counts', { parameters: { select: 'id,equipment_id,item_type,quantity,notes,counted_at,updated_at', equipment_id: `eq.${encodeURIComponent(equipmentId)}`, order: 'item_type.asc' } });
}

export async function listPhysicalPeripheralSummary() {
  const [counts, equipment] = await Promise.all([
    request('equipment_peripheral_counts', { parameters: { select: 'equipment_id,item_type,quantity' } }),
    request('maintenances', { parameters: { select: 'id,area' } })
  ]);
  const areaByEquipment = new Map(equipment.map((item) => [String(item.id), item.area || 'Área no definida']));
  const byArea = new Map();
  for (const count of counts) {
    const area = areaByEquipment.get(String(count.equipment_id)) ?? 'Área no definida';
    const current = byArea.get(area) ?? { area, total: 0, quantities: {} };
    current.total += count.quantity;
    current.quantities[count.item_type] = (current.quantities[count.item_type] ?? 0) + count.quantity;
    byArea.set(area, current);
  }
  return [...byArea.values()].sort((left, right) => left.area.localeCompare(right.area, 'es-CO'));
}

export async function saveEquipmentPeripheralCounts({ equipmentId, countedBy, items, notes }) {
  const equipment = (await request('maintenances', { parameters: { select: 'full_equipment_code,equipment_code', id: `eq.${encodeURIComponent(equipmentId)}`, limit: '1' } }))[0];
  const code = String(equipment?.full_equipment_code ?? equipment?.equipment_code ?? '').toUpperCase();
  const isPortableByCode = code.startsWith('PO') || code.slice(1, 3) === 'PO';
  await request('equipment_peripheral_counts', {
    method: 'DELETE',
    parameters: { equipment_id: `eq.${encodeURIComponent(equipmentId)}` }
  });
  const rows = items.filter((item) => item.quantity > 0 && (item.itemType !== 'charge' || isPortableByCode)).map((item) => ({ equipment_id: Number(equipmentId), item_type: item.itemType, quantity: item.quantity, notes: notes || null, counted_by: Number(countedBy) }));
  if (!rows.length) return [];
  return request('equipment_peripheral_counts', { method: 'POST', prefer: 'return=representation', payload: rows });
}
