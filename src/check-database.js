import { config } from './config.js';

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error('La configuración de Supabase no está completa.');
}

const response = await fetch(`${config.supabaseUrl}/rest/v1/roles?select=id&limit=1`, {
  headers: {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`
  }
});

if (!response.ok) throw new Error(`Supabase respondió HTTP ${response.status}.`);
console.log('Conexión a Supabase confirmada.');
