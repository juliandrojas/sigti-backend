import 'dotenv/config';
import fs from 'node:fs';
import xlsx from 'xlsx';
import { config } from '../src/config.js';

const dryRun = !process.argv.includes('--apply');
const filePath = process.env.MAINTENANCE_CSV_PATH ?? process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const excludedCodes = new Set(['EF0658']);
const dateOverrides = new Map([
  ['EF138', '2026-09-15'],
  ['EF0845', '2026-09-17']
]);

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function trim(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function parseDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? '20' + match[3] : match[3];
  return year + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
}

function assetType(value) {
  const types = {
    portatil: 'Portátil',
    torre: 'Torre',
    aio: 'Todo en Uno'
  };
  return types[normalize(value)] ?? null;
}

function antivirus(value) {
  return normalize(value) === 'defender' ? 'Defender' : 'Sophos';
}

function glpi(value) {
  return ['true', 'si', 'sí'].includes(normalize(value));
}

function headers(method = 'GET', extra = {}) {
  const schemaHeader = method === 'GET' ? 'Accept-Profile' : 'Content-Profile';
  return {
    apikey: config.supabaseServiceRoleKey,
    Authorization: 'Bearer ' + config.supabaseServiceRoleKey,
    [schemaHeader]: config.supabaseMaintenanceSchema,
    ...extra
  };
}

async function request(path, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(config.supabaseUrl + '/rest/v1/' + path, {
    method,
    headers: headers(method, {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    }),
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) {
    throw new Error('Supabase respondió HTTP ' + response.status + ': ' + (await response.text()).slice(0, 500));
  }
  return response.status === 204 ? null : response.json();
}

function readRows() {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Indica la ruta del CSV en MAINTENANCE_CSV_PATH o como primer argumento.');
  }

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

function mapRows(rows) {
  const codes = new Set();
  const issues = [];
  const equipment = [];

  for (const row of rows) {
    const equipmentCode = trim(row['Codigo Equipo'])?.toUpperCase();
    if (!equipmentCode || excludedCodes.has(equipmentCode)) continue;

    if (!/^EF\d{3,4}$/.test(equipmentCode)) {
      issues.push(equipmentCode + ': el código no cumple el formato EF seguido de 3 o 4 dígitos.');
      continue;
    }
    if (codes.has(equipmentCode)) {
      issues.push(equipmentCode + ': código repetido en el archivo.');
      continue;
    }
    codes.add(equipmentCode);

    const type = assetType(row['Tipo de Equipo']);
    const maintenanceDate = dateOverrides.get(equipmentCode) ?? parseDate(row['Ult Mantenimiento']);
    const nvmeSize = trim(row.NVME);
    const ssdSize = trim(row.SSD) ?? nvmeSize;
    const data = {
      company: 'Petrocasinos',
      equipment_code: equipmentCode,
      full_equipment_code: 'P' + (type === 'Portátil' ? 'PO' : 'PC') + equipmentCode,
      ip_address: trim(row.IP),
      area: trim(row.Area),
      responsible: trim(row.Usuario),
      brand: trim(row['Marca equipo']),
      model: trim(row['Modelo equipo']),
      serial_number: trim(row['Serial equipo']),
      equipment_type: type,
      processor_model: trim(row.Procesador),
      ram: trim(row.RAM),
      os: trim(row.SO),
      hdd_size: trim(row.HDD),
      ssd_size: ssdSize,
      is_nvme: Boolean(nvmeSize),
      screen_size: trim(row['Tallaño Pantalla'] ?? row['TallaÃ±o Pantalla']),
      antivirus: antivirus(row.Antivirus),
      glpi: glpi(row.GLPI),
      observations: trim(row.Observaciones),
      last_maintenance: maintenanceDate
    };

    const required = ['area', 'responsible', 'brand', 'model', 'serial_number', 'equipment_type', 'processor_model', 'ram', 'os', 'screen_size', 'last_maintenance'];
    const missing = required.filter((field) => !data[field]);
    if (missing.length) {
      issues.push(equipmentCode + ': faltan ' + missing.join(', ') + '.');
      continue;
    }
    equipment.push(data);
  }

  if (issues.length) throw new Error('Se encontraron filas inválidas:\n- ' + issues.join('\n- '));
  return equipment;
}

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias.');
}

const equipment = mapRows(readRows());
const [sites, technicians, existingEquipment] = await Promise.all([
  request('sites?select=id&company=eq.Petrocasinos&name=eq.Principal&active=eq.true'),
  request('usuarios?select=id,name,lastname&username=eq.julian.rojas'),
  request('maintenances?select=equipment_code')
]);
const siteId = sites[0]?.id;
const technician = technicians[0];
if (!siteId) throw new Error('No se encontró la sede Principal de Petrocasinos en el esquema test.');
if (!technician) throw new Error('No se encontró el usuario julian.rojas en el esquema test.');

const existingCodes = new Set(existingEquipment.map((item) => String(item.equipment_code).toUpperCase()));
const toImport = equipment.filter((item) => !existingCodes.has(item.equipment_code));
const skippedExisting = equipment.filter((item) => existingCodes.has(item.equipment_code));

console.log('Equipos preparados: ' + equipment.length);
console.log('Omitidos por decisión: ' + [...excludedCodes].join(', '));
console.log('Ya existentes: ' + (skippedExisting.length || 'ninguno'));
console.log('Por importar: ' + toImport.length);
console.log('Técnico histórico: ' + [technician.name, technician.lastname].filter(Boolean).join(' '));
console.log('Códigos: ' + toImport.map((item) => item.equipment_code).join(', '));

if (dryRun) {
  console.log('Simulación completada; no se insertó información. Ejecuta con --apply para confirmar la carga.');
} else {
  let inserted = 0;
  for (const item of toImport) {
    const [maintenance] = await request('maintenances', {
      method: 'POST',
      prefer: 'return=representation',
      body: { ...item, site_id: siteId }
    });

    try {
      await request('maintenance_records', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          maintenance_id: maintenance.id,
          maintenance_date: item.last_maintenance,
          maintenance_type: 'Preventivo',
          technician_id: technician.id,
          description: 'Mantenimiento preventivo histórico importado desde la hoja principal.',
          observations: item.observations
        }
      });
      inserted += 1;
    } catch (error) {
      await request('maintenances?id=eq.' + encodeURIComponent(maintenance.id), { method: 'DELETE' });
      throw error;
    }
  }

  console.log('Importación completada: ' + inserted + ' equipos y ' + inserted + ' registros históricos creados.');
}
