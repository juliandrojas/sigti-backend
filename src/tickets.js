import { config } from './config.js';

function headers(method, prefer) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('La configuración de Supabase no está completa.');
  }
  const result = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    'Content-Type': 'application/json',
    [method === 'GET' ? 'Accept-Profile' : 'Content-Profile']: config.supabaseMaintenanceSchema
  };
  if (prefer) result.Prefer = prefer;
  return result;
}

async function request(table, options = {}) {
  const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
  for (const [key, value] of Object.entries(options.parameters ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: headers(options.method ?? 'GET', options.prefer),
    body: options.payload ? JSON.stringify(options.payload) : undefined
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`No fue posible procesar las solicitudes: ${body}`);
  return body ? JSON.parse(body) : null;
}

export async function listTickets(userId = null) {
  const [tickets, users] = await Promise.all([
    request('tickets', {
      parameters: {
        select: 'id,title,description,priority,status,user_id,technician_id,created_at,updated_at',
        ...(userId ? { user_id: `eq.${encodeURIComponent(userId)}` } : {}),
        order: 'created_at.desc'
      }
    }),
    request('usuarios', { parameters: { select: 'id,name,lastname' } })
  ]);
  const usersById = new Map(users.map((user) => [String(user.id), [user.name, user.lastname].filter(Boolean).join(' ')]));
  return tickets.map((ticket) => ({
    ...ticket,
    requester_name: usersById.get(String(ticket.user_id)) ?? 'Usuario no definido',
    technician_name: usersById.get(String(ticket.technician_id)) ?? null
  }));
}

export function createTicket({ userId, title, description, priority }) {
  return request('tickets', {
    method: 'POST',
    prefer: 'return=representation',
    payload: {
      title,
      description: description || null,
      priority,
      status: 'open',
      user_id: Number(userId)
    }
  }).then((rows) => rows[0]);
}
