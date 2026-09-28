import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { requireAuth, signToken } from './auth.js';
import { findUserById, findUserByUsername, listUsers, publicUser } from './users.js';
import { getSystemMetrics } from './dashboard.js';
import { createMaintenance, createMaintenanceRecord, listMaintenanceHistory, listMaintenanceRecords, listMaintenances, listSites, updateMaintenance, updateMaintenanceResponsible } from './maintenances.js';
import { createAssignment, createPeripheralStock, getActiveAssignmentByEquipment, listActiveAssignments, listAssignmentOptions, listPeripheralStock, returnAssignment } from './loans.js';
import { listEquipmentPeripheralCounts, listPhysicalPeripheralSummary, saveEquipmentPeripheralCounts } from './peripherals.js';

const credentialsSchema = z.object({
  username: z.string().trim().min(3, 'El nombre de usuario debe tener al menos 3 caracteres.'),
  password: z.string().min(1, 'Ingresa tu contraseña.')
});

const maintenanceSchema = z.object({
  company: z.enum(['Petrocasinos', 'Cosecharte']),
  siteId: z.number().int().positive(),
  equipmentCode: z.string().trim().regex(/^EF\d{3,4}$/, 'El código debe tener el formato EF seguido de 3 o 4 dígitos.'),
  ipAddress: z.string().trim().max(45).optional().default(''),
  area: z.string().trim().min(1),
  responsible: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1),
  assetType: z.enum(['Portátil', 'Torre', 'Todo en Uno']),
  processor: z.string().trim().min(1),
  ram: z.string().trim().min(1),
  operatingSystem: z.string().trim().min(1),
  hdd: z.string().trim().optional().default('No aplica'),
  ssd: z.string().trim().optional().default('No aplica'),
  isNvme: z.boolean().default(false),
  screenSize: z.string().trim().min(1),
  antivirus: z.enum(['Sophos', 'Defender']),
  glpi: z.boolean(),
  observations: z.string().trim().max(5000).optional().default('')
});

const maintenanceRecordSchema = z.object({
  maintenanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD.'),
  maintenanceType: z.string().trim().min(1).max(30),
  description: z.string().trim().min(1).max(5000),
  actionsTaken: z.string().trim().max(5000).optional().default(''),
  observations: z.string().trim().max(5000).optional().default('')
});

const peripheralStockSchema = z.object({
  itemType: z.enum(['mouse', 'keyboard', 'charge', 'cooling_base']),
  brand: z.string().trim().max(100).optional().default(''),
  reference: z.string().trim().max(150).optional().default(''),
  model: z.string().trim().max(150).optional().default(''),
  location: z.string().trim().min(1, 'Selecciona una ubicación.').max(150),
  quantity: z.number().int().positive('La cantidad debe ser mayor que cero.'),
  notes: z.string().trim().max(5000).optional().default('')
});

const assignmentReturnSchema = z.object({
  items: z.array(z.object({
    assignmentItemId: z.number().int().positive(),
    condition: z.enum(['good', 'cleaning', 'damaged', 'missing'])
  })).min(1, 'Indica el estado de los periféricos que se devuelven.'),
  notes: z.string().trim().max(5000).optional().default('')
});

const assignmentSchema = z.object({
  employeeId: z.number().int().positive(),
  equipmentId: z.number().int().positive(),
  mouseStockId: z.number().int().positive(),
  keyboardStockId: z.number().int().positive(),
  coolingBaseStockId: z.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(5000).optional().default('')
});

const physicalPeripheralSchema = z.object({
  items: z.array(z.object({
    itemType: z.enum(['mouse', 'keyboard', 'charge', 'cooling_base']),
    quantity: z.number().int().nonnegative()
  })).length(4),
  notes: z.string().trim().max(5000).optional().default('')
});

export const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || config.frontendUrls.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no autorizado por CORS.'));
  }
}));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  supabaseConfigured: Boolean(config.supabaseUrl && config.supabaseServiceRoleKey),
  authSchema: config.supabaseAuthSchema,
  maintenanceSchema: config.supabaseMaintenanceSchema
}));

app.post('/api/auth/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  const user = await findUserByUsername(parsed.data.username);
  const validPassword = user && await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!validPassword || !['SISTEMAS', 'USUARIO'].includes(user.role)) {
    return res.status(401).json({ message: 'Nombre de usuario o contraseña incorrectos.' });
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await findUserById(req.auth.sub);
  if (!user) return res.status(401).json({ message: 'Usuario no encontrado.' });
  return res.json({ user: publicUser(user) });
});

app.get('/api/users', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar usuarios.' });
  }
  return res.json({ users: await listUsers() });
});

app.get('/api/dashboard/systems', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'No tienes acceso a las métricas de Sistemas.' });
  }
  return res.json({ metrics: await getSystemMetrics() });
});

app.get('/api/sites', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar sedes.' });
  }
  const company = String(req.query.company ?? '');
  if (!['Petrocasinos', 'Cosecharte'].includes(company)) {
    return res.status(400).json({ message: 'La empresa no es válida.' });
  }
  return res.json({ sites: await listSites(company) });
});

app.get('/api/maintenances', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar mantenimientos.' });
  }
  return res.json({ maintenances: await listMaintenances() });
});

app.get('/api/peripheral-stock', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar el stock de periféricos.' });
  }
  return res.json({ stock: await listPeripheralStock() });
});

app.post('/api/peripheral-stock', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede registrar periféricos.' });
  }
  const parsed = peripheralStockSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  return res.status(201).json({ stockItem: await createPeripheralStock({ ...parsed.data, location: 'Sistemas' }) });
});

app.get('/api/maintenances/:id/peripherals', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar el levantamiento físico.' });
  return res.json({ peripherals: await listEquipmentPeripheralCounts(req.params.id) });
});

app.put('/api/maintenances/:id/peripherals', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') return res.status(403).json({ message: 'Solo el rol de Sistemas puede registrar el levantamiento físico.' });
  const parsed = physicalPeripheralSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  const technician = await findUserById(req.auth.sub);
  if (!technician) return res.status(401).json({ message: 'El usuario de la sesión no existe.' });
  return res.json({ peripherals: await saveEquipmentPeripheralCounts({ equipmentId: req.params.id, countedBy: technician.id, items: parsed.data.items, notes: parsed.data.notes }) });
});

app.get('/api/physical-peripherals/summary', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar el levantamiento físico.' });
  return res.json({ summary: await listPhysicalPeripheralSummary() });
});

app.get('/api/assignments', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar préstamos.' });
  }
  return res.json({ assignments: await listActiveAssignments() });
});

app.get('/api/assignment-options', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede preparar asignaciones.' });
  }
  return res.json(await listAssignmentOptions());
});

app.post('/api/assignments', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede asignar kits.' });
  }
  const parsed = assignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });

  const technician = await findUserById(req.auth.sub);
  if (!technician) return res.status(401).json({ message: 'El usuario de la sesión no existe.' });

  const stockIds = [
    parsed.data.mouseStockId,
    parsed.data.keyboardStockId,
    parsed.data.coolingBaseStockId
  ].filter(Boolean);
  if (new Set(stockIds).size !== stockIds.length) {
    return res.status(400).json({ message: 'Cada periférico del kit debe ser distinto.' });
  }

  const assignment = await createAssignment({
    employeeId: parsed.data.employeeId,
    equipmentId: parsed.data.equipmentId,
    assignedBy: technician.id,
    stockIds,
    notes: parsed.data.notes
  });
  const employee = await findUserById(parsed.data.employeeId);
  if (!employee) return res.status(400).json({ message: 'El empleado seleccionado no existe.' });
  await updateMaintenanceResponsible(parsed.data.equipmentId, [employee.name, employee.lastname].filter(Boolean).join(' '));
  return res.status(201).json({ assignment });
});

app.post('/api/assignments/:id/return', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede registrar devoluciones.' });
  }
  const parsed = assignmentReturnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });

  const technician = await findUserById(req.auth.sub);
  if (!technician) return res.status(401).json({ message: 'El usuario de la sesión no existe.' });

  const assignment = await returnAssignment({
    assignmentId: req.params.id,
    receivedBy: technician.id,
    items: parsed.data.items,
    notes: parsed.data.notes
  });
  return res.json({ assignment });
});

app.get('/api/maintenance-records', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar registros de mantenimiento.' });
  }
  return res.json({ records: await listMaintenanceRecords() });
});

app.patch('/api/maintenances/:id', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede editar equipos.' });
  }
  const parsed = maintenanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });

  const companyPrefix = parsed.data.company === 'Petrocasinos' ? 'P' : 'C';
  const equipmentTypePrefix = parsed.data.assetType === 'Portátil' ? 'PO' : 'PC';
  const fullEquipmentCode = `${companyPrefix}${equipmentTypePrefix}${parsed.data.equipmentCode}`;
  const data = {
    company: parsed.data.company,
    site_id: parsed.data.siteId,
    equipment_code: parsed.data.equipmentCode,
    full_equipment_code: fullEquipmentCode,
    ip_address: parsed.data.ipAddress || null,
    area: parsed.data.area,
    responsible: parsed.data.responsible,
    brand: parsed.data.brand,
    model: parsed.data.model,
    serial_number: parsed.data.serialNumber,
    equipment_type: parsed.data.assetType,
    processor_model: parsed.data.processor,
    ram: parsed.data.ram,
    os: parsed.data.operatingSystem,
    hdd_size: parsed.data.hdd === 'No aplica' ? null : parsed.data.hdd,
    ssd_size: parsed.data.ssd === 'No aplica' ? null : parsed.data.ssd,
    is_nvme: parsed.data.isNvme,
    screen_size: parsed.data.screenSize,
    antivirus: parsed.data.antivirus,
    glpi: parsed.data.glpi,
    observations: parsed.data.observations || null
  };
  return res.json({ maintenance: await updateMaintenance(req.params.id, data) });
});

app.get('/api/maintenances/:id/history', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar el historial.' });
  }
  return res.json({ history: await listMaintenanceHistory(req.params.id) });
});

app.get('/api/maintenances/:id/assignment', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede consultar asignaciones.' });
  }
  return res.json({ assignment: await getActiveAssignmentByEquipment(req.params.id) });
});

app.post('/api/maintenances/:id/records', requireAuth, async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede registrar mantenimientos.' });
  }

  const parsed = maintenanceRecordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  const technician = await findUserById(req.auth.sub);
  if (!technician) return res.status(401).json({ message: 'El técnico de la sesión no existe.' });

  const record = await createMaintenanceRecord({
    maintenanceId: req.params.id,
    technicianId: technician.id,
    data: {
      maintenance_date: parsed.data.maintenanceDate,
      maintenance_type: parsed.data.maintenanceType,
      description: parsed.data.description,
      actions_taken: parsed.data.actionsTaken,
      observations: parsed.data.observations
    }
  });

  return res.status(201).json({ record, technician: publicUser(technician) });
});

const saveMaintenance = async (req, res) => {
  if (req.auth.role !== 'SISTEMAS') {
    return res.status(403).json({ message: 'Solo el rol de Sistemas puede registrar mantenimientos.' });
  }

  const parsed = maintenanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }

  const technician = await findUserById(req.auth.sub);
  if (!technician) return res.status(401).json({ message: 'El técnico de la sesión no existe.' });

  const companyPrefix = parsed.data.company === 'Petrocasinos' ? 'P' : 'C';
  const equipmentTypePrefix = parsed.data.assetType === 'Portátil' ? 'PO' : 'PC';
  const fullEquipmentCode = `${companyPrefix}${equipmentTypePrefix}${parsed.data.equipmentCode}`;

  const data = {
    company: parsed.data.company,
    site_id: parsed.data.siteId,
    equipment_code: parsed.data.equipmentCode,
    full_equipment_code: fullEquipmentCode,
    ip_address: parsed.data.ipAddress || null,
    area: parsed.data.area,
    responsible: parsed.data.responsible,
    brand: parsed.data.brand,
    model: parsed.data.model,
    serial_number: parsed.data.serialNumber,
    equipment_type: parsed.data.assetType,
    processor_model: parsed.data.processor,
    ram: parsed.data.ram,
    os: parsed.data.operatingSystem,
    hdd_size: parsed.data.hdd === 'No aplica' ? null : parsed.data.hdd,
    ssd_size: parsed.data.ssd === 'No aplica' ? null : parsed.data.ssd,
    is_nvme: parsed.data.isNvme,
    screen_size: parsed.data.screenSize,
    antivirus: parsed.data.antivirus,
    glpi: parsed.data.glpi,
    observations: parsed.data.observations || null
  };

  const saved = await createMaintenance({ data, technicianId: technician.id });
  return res.status(201).json({ ...saved, technician: publicUser(technician) });
};

// Mantener ambos nombres durante la transición entre compilaciones del frontend.
app.post(['/api/maintenances', '/api/maintenance'], requireAuth, saveMaintenance);

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error instanceof Error && error.message.includes('PGRST202')) {
    const isAssignmentFunction = error.message.includes('create_assignment');
    return res.status(503).json({
      message: isAssignmentFunction
        ? 'La asignación de kits aún no está habilitada en Supabase. Ejecuta una vez el script database/004_create_assignment_function.sql en el SQL Editor y vuelve a intentarlo.'
        : 'La devolución aún no está habilitada en Supabase. Ejecuta una vez el script database/010_return_assignment.sql en el SQL Editor y vuelve a intentarlo.'
    });
  }
  res.status(500).json({ message: 'Ocurrió un error inesperado.' });
});
