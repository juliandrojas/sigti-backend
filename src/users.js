import { config } from './config.js';

function headers() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('La configuración de Supabase no está completa.');
  }
  const result = {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`
  };
  if (config.supabaseAuthSchema !== 'public') result['Accept-Profile'] = config.supabaseAuthSchema;
  return result;
}

async function getRows(table, parameters) {
  const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);

  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`No fue posible consultar ${table}.`);
  return response.json();
}

async function hydrateUser(user) {
  if (!user) return null;
  const roles = await getRows('roles', { id: `eq.${user.role_id}`, select: 'name', limit: '1' });
  if (!roles[0]) return null;
  return { ...user, passwordHash: user.password, role: String(roles[0].name).toUpperCase() };
}

export async function findUserByUsername(username) {
  const users = await getRows('usuarios', {
    username: `eq.${username.trim().toLowerCase()}`,
    select: 'id,name,lastname,username,password,role_id',
    limit: '1'
  });
  return hydrateUser(users[0]);
}

export async function findUserById(id) {
  const users = await getRows('usuarios', {
    id: `eq.${id}`,
    select: 'id,name,lastname,username,password,role_id',
    limit: '1'
  });
  return hydrateUser(users[0]);
}

export async function listUsers() {
  const users = await getRows('usuarios', {
    select: 'id,name,lastname,username',
    order: 'name.asc,lastname.asc'
  });
  return users.map((user) => ({
    id: user.id,
    name: [user.name, user.lastname].filter(Boolean).join(' '),
    username: user.username
  }));
}

export function publicUser(user) {
  return {
    id: user.id,
    name: [user.name, user.lastname].filter(Boolean).join(' '),
    username: user.username,
    role: user.role
  };
}
