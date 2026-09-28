import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import xlsx from 'xlsx';
import { config } from '../src/config.js';

const dryRun = process.argv.includes('--dry-run');
const temporaryPassword = 'Petrocasinos2026';
const emailDomain = 'petrocasinos.com';

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizedText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseEmployee(fullName, area) {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;

  const hasSecondLastName = parts.length >= 3;
  const secondLastName = hasSecondLastName ? parts.at(-1) : '';
  const firstLastName = hasSecondLastName ? parts.at(-2) : parts.at(-1);
  const givenNames = hasSecondLastName ? parts.slice(0, -2) : parts.slice(0, -1);
  const firstName = givenNames[0];
  if (!firstName || !firstLastName) return null;

  return {
    name: givenNames.join(' '),
    lastname: `${firstLastName} ${secondLastName}`,
    firstName,
    firstLastName,
    secondLastName,
    area: String(area ?? '').trim()
  };
}

function userBase(employee) {
  return `${normalize(employee.firstName)}.${normalize(employee.firstLastName)}`;
}

function createCredentials(employee, usernames, emails) {
  const base = userBase(employee);
  const secondLastName = normalize(employee.secondLastName);
  const fallback = secondLastName ? `${base}.${secondLastName.at(0)}${secondLastName}` : base;
  const candidates = fallback === base ? [base] : [base, fallback];

  for (const candidate of candidates) {
    const email = `${candidate}@${emailDomain}`;
    if (!usernames.has(candidate) && !emails.has(email)) {
      usernames.add(candidate);
      emails.add(email);
      return { username: candidate, email };
    }
  }

  let suffix = 2;
  while (usernames.has(`${fallback}${suffix}`) || emails.has(`${fallback}${suffix}@${emailDomain}`)) suffix += 1;
  const username = `${fallback}${suffix}`;
  const email = `${username}@${emailDomain}`;
  usernames.add(username);
  emails.add(email);
  return { username, email };
}

function readEmployees(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error('No se encontró EMPLOYEES_XLSX_PATH.');
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headerIndex = rows.findIndex((row) => normalizedText(row[0]) === 'nombre completo' && normalizedText(row[1]) === 'area');
  if (headerIndex < 0) throw new Error('No se encontraron las columnas Nombre completo y Área.');

  const seenEmployees = new Set();
  const skipped = [];
  const employees = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const employee = parseEmployee(row[0], row[1]);
    const key = `${normalizedText(row[0])}|${normalizedText(row[1])}`;
    if (!employee || seenEmployees.has(key)) {
      skipped.push(String(row[0] ?? '').trim());
      continue;
    }
    seenEmployees.add(key);
    employees.push(employee);
  }
  return { employees, skipped };
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    ...extra
  };
}

async function getJson(path) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, { headers: supabaseHeaders() });
  if (!response.ok) throw new Error(`Supabase respondió HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function insertBatch(users) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/usuarios`, {
    method: 'POST',
    headers: supabaseHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(users)
  });
  if (!response.ok) throw new Error(`Supabase respondió HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias.');
}

const [{ employees, skipped }, roles, existingUsers] = await Promise.all([
  Promise.resolve(readEmployees(process.env.EMPLOYEES_XLSX_PATH)),
  getJson('roles?select=id,name'),
  getJson('usuarios?select=username,email')
]);

const roleByName = new Map(roles.map((role) => [normalizedText(role.name), role.id]));
const systemsRoleId = roleByName.get('sistemas');
const userRoleId = roleByName.get('usuario');
if (!systemsRoleId || !userRoleId) throw new Error('No se encontraron los roles Sistemas y Usuario.');

const usernames = new Set(existingUsers.map((user) => normalizedText(user.username)));
const emails = new Set(existingUsers.map((user) => normalizedText(user.email)));
const passwordHash = await bcrypt.hash(temporaryPassword, 12);
const usersToInsert = employees.map((employee) => {
  const credentials = createCredentials(employee, usernames, emails);
  return {
    name: employee.name,
    lastname: employee.lastname,
    ...credentials,
    password: passwordHash,
    role_id: normalizedText(employee.area) === 'sistemas' ? systemsRoleId : userRoleId
  };
});

const systemsCount = usersToInsert.filter((user) => user.role_id === systemsRoleId).length;
console.log(`Filas válidas: ${employees.length}`);
console.log(`Filas omitidas: ${skipped.length}`);
console.log(`Rol SISTEMAS: ${systemsCount}`);
console.log(`Rol USUARIO: ${usersToInsert.length - systemsCount}`);
console.log(`Usuarios existentes antes de importar: ${existingUsers.length}`);

if (dryRun) {
  console.log('Simulación completada; no se insertaron usuarios.');
  process.exit(0);
}

let inserted = 0;
for (let index = 0; index < usersToInsert.length; index += 25) {
  const insertedRows = await insertBatch(usersToInsert.slice(index, index + 25));
  inserted += insertedRows.length;
}
console.log(`Importación completada: ${inserted} usuarios insertados.`);
