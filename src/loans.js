import { config } from './config.js';

function headers(method, prefer) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('La configuración de Supabase no está completa.');
  }

  const result = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: 'Bearer ' + config.supabaseServiceRoleKey,
    'Content-Type': 'application/json'
  };

  if (method === 'GET') result['Accept-Profile'] = config.supabaseMaintenanceSchema;
  else result['Content-Profile'] = config.supabaseMaintenanceSchema;
  if (prefer) result.Prefer = prefer;
  return result;
}

async function request(table, options = {}) {
  const url = new URL('/rest/v1/' + table, config.supabaseUrl);
  for (const [key, value] of Object.entries(options.parameters ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: headers(options.method ?? 'GET', options.prefer),
    body: options.payload ? JSON.stringify(options.payload) : undefined
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error('No fue posible procesar el stock de periféricos: ' + detail);
  }

  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export function listPeripheralStock() {
  return request('peripheral_stock', {
    parameters: {
      select: 'id,item_type,brand,reference,model,location,quantity_total,quantity_available,quantity_assigned,quantity_cleaning,quantity_damaged,quantity_retired,status,notes,created_at',
      order: 'item_type.asc,brand.asc,reference.asc'
    }
  });
}

export async function createPeripheralStock(data) {
  const rows = await request('peripheral_stock', {
    method: 'POST',
    prefer: 'return=representation',
    payload: {
      item_type: data.itemType,
      brand: data.brand || null,
      reference: data.reference || null,
      model: data.model || null,
      location: data.location,
      quantity_total: data.quantity,
      quantity_available: data.quantity,
      notes: data.notes || null
    }
  });
  return rows[0];
}

export async function listActiveAssignments() {
  const [assignments, users, equipment, items, stock] = await Promise.all([
    request('assignments', { parameters: { select: 'id,employee_id,equipment_id,delivered_at,delivery_notes', status: 'eq.active', order: 'delivered_at.desc' } }),
    request('usuarios', { parameters: { select: 'id,name,lastname' } }),
    request('maintenances', { parameters: { select: 'id,full_equipment_code,brand,model,equipment_type,area' } }),
    request('assignment_items', { parameters: { select: 'id,assignment_id,peripheral_stock_id,quantity_delivered' } }),
    request('peripheral_stock', { parameters: { select: 'id,item_type' } })
  ]);
  const usersById = new Map(users.map((user) => [String(user.id), [user.name, user.lastname].filter(Boolean).join(' ')]));
  const equipmentById = new Map(equipment.map((item) => [String(item.id), item]));
  const stockById = new Map(stock.map((item) => [String(item.id), item.item_type]));
  return assignments.map((assignment) => ({
    ...assignment,
    employee_name: usersById.get(String(assignment.employee_id)) ?? 'No definido',
    equipment: equipmentById.get(String(assignment.equipment_id)) ?? null,
    items: items.filter((item) => String(item.assignment_id) === String(assignment.id)).map((item) => ({
      id: item.id,
      item_type: stockById.get(String(item.peripheral_stock_id)) ?? 'periférico',
      quantity: item.quantity_delivered
    }))
  }));
}

export async function getActiveAssignmentByEquipment(equipmentId) {
  const assignments = await request('assignments', {
    parameters: {
      select: 'id,employee_id,equipment_id,delivered_at,delivery_notes',
      equipment_id: `eq.${encodeURIComponent(equipmentId)}`,
      status: 'eq.active',
      limit: '1'
    }
  });
  const assignment = assignments[0];
  if (!assignment) return null;

  const [users, items, stock] = await Promise.all([
    request('usuarios', { parameters: { select: 'id,name,lastname', id: `eq.${encodeURIComponent(assignment.employee_id)}`, limit: '1' } }),
    request('assignment_items', { parameters: { select: 'id,assignment_id,peripheral_stock_id,quantity_delivered', assignment_id: `eq.${encodeURIComponent(assignment.id)}` } }),
    request('peripheral_stock', { parameters: { select: 'id,item_type,brand,reference,model' } })
  ]);
  const stockById = new Map(stock.map((item) => [String(item.id), item]));
  const employee = users[0];

  return {
    ...assignment,
    employee_name: employee ? [employee.name, employee.lastname].filter(Boolean).join(' ') : 'No definido',
    items: items.map((item) => {
      const peripheral = stockById.get(String(item.peripheral_stock_id));
      return {
        id: item.id,
        quantity: item.quantity_delivered,
        item_type: peripheral?.item_type ?? 'periférico',
        label: [peripheral?.brand, peripheral?.reference, peripheral?.model].filter(Boolean).join(' ') || null
      };
    })
  };
}

export async function returnAssignment({ assignmentId, receivedBy, items, notes }) {
  const url = new URL('/rest/v1/rpc/return_assignment', config.supabaseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: headers('POST'),
    body: JSON.stringify({
      p_assignment_id: Number(assignmentId),
      p_received_by: Number(receivedBy),
      p_items: items.map((item) => ({
        assignment_item_id: Number(item.assignmentItemId),
        condition: item.condition
      })),
      p_notes: notes || null
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error('No fue posible registrar la devolución: ' + body);
  }

  return body ? JSON.parse(body) : null;
}

export async function listAssignmentOptions() {
  const [users, equipment, activeAssignments, stock] = await Promise.all([
    request('usuarios', { parameters: { select: 'id,name,lastname', order: 'name.asc,lastname.asc' } }),
    request('maintenances', { parameters: { select: 'id,full_equipment_code,equipment_code,brand,model,equipment_type,responsible', order: 'full_equipment_code.asc' } }),
    request('assignments', { parameters: { select: 'employee_id,equipment_id', status: 'eq.active' } }),
    request('peripheral_stock', { parameters: { select: 'id,item_type,brand,reference,model,location,quantity_available', quantity_available: 'gt.0', status: 'eq.active', order: 'item_type.asc,brand.asc,reference.asc' } })
  ]);
  const assignedEmployees = new Set(activeAssignments.map((assignment) => String(assignment.employee_id)));
  const assignedEquipment = new Set(activeAssignments.map((assignment) => String(assignment.equipment_id)));
  const isUnassigned = (responsible) => {
    const value = String(responsible ?? '').trim().toLocaleLowerCase('es-CO');
    return value === '' || value === 'sin asignar' || value === 'no asignado' || value === 'disponible';
  };

  return {
    users: users.map((user) => ({ id: user.id, name: [user.name, user.lastname].filter(Boolean).join(' ') })),
    employees: users
      .filter((user) => !assignedEmployees.has(String(user.id)))
      .map((user) => ({ id: user.id, name: [user.name, user.lastname].filter(Boolean).join(' ') })),
    equipment: equipment.filter((item) => !assignedEquipment.has(String(item.id)) && isUnassigned(item.responsible)),
    stock
  };
}

export async function createAssignment({ employeeId, equipmentId, assignedBy, stockIds, notes }) {
  const url = new URL('/rest/v1/rpc/create_assignment', config.supabaseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: headers('POST'),
    body: JSON.stringify({
      p_employee_id: Number(employeeId),
      p_equipment_id: Number(equipmentId),
      p_assigned_by: Number(assignedBy),
      p_stock_ids: stockIds.map(Number),
      p_notes: notes || null
    })
  });

  const body = await response.text();
  if (!response.ok) throw new Error('No fue posible asignar el kit: ' + body);
  return body ? JSON.parse(body) : null;
}
