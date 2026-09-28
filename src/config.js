import 'dotenv/config';

const localFrontendUrls = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://sigti-petrocasinos.vercel.app'
];

const configuredFrontendUrls = String(process.env.FRONTEND_URL ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  frontendUrls: [...new Set([...localFrontendUrls, ...configuredFrontendUrls])],
  jwtSecret: process.env.JWT_SECRET ?? 'desarrollo-no-usar-en-produccion',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseAuthSchema: process.env.SUPABASE_AUTH_SCHEMA ?? 'public',
  supabaseMaintenanceSchema: process.env.SUPABASE_MAINTENANCE_SCHEMA ?? 'public'
};
