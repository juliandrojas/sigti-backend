import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';

let server;
let apiUrl;
const originalFetch = global.fetch;
const passwordHash = bcrypt.hashSync('Petrocasinos2026', 10);

function mockedSupabaseFetch(input, init) {
  const url = String(input);
  if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);

  const endpoint = new URL(url);
  if (endpoint.pathname.endsWith('/maintenance_records') && init?.method !== 'POST') {
    assert.equal(init.headers['Accept-Profile'], 'test');
    return Promise.resolve(new Response(JSON.stringify([{
      id: 88,
      maintenance_id: 77,
      maintenance_date: '2026-09-24',
      next_maintenance_date: '2027-03-24',
      maintenance_type: 'Inicial',
      technician_id: 1,
      description: 'Registro inicial'
    }, {
      id: 89,
      maintenance_id: 77,
      maintenance_date: '2026-08-01',
      next_maintenance_date: '2026-09-20',
      maintenance_type: 'Preventivo',
      technician_id: 1,
      description: 'Registro antiguo que no debe contarse'
    }, {
      id: 90,
      maintenance_id: 78,
      maintenance_date: '2026-03-20',
      next_maintenance_date: '2026-09-20',
      maintenance_type: 'Preventivo',
      technician_id: 1,
      description: 'Mantenimiento vencido'
    }, {
      id: 91,
      maintenance_id: 79,
      maintenance_date: '2026-03-24',
      next_maintenance_date: '2026-10-15',
      maintenance_type: 'Preventivo',
      technician_id: 1,
      description: 'Mantenimiento próximo'
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (endpoint.pathname.endsWith('/maintenances') && init?.method !== 'POST' && init?.method !== 'PATCH' && !init?.headers?.Prefer) {
    assert.equal(init.headers['Accept-Profile'], 'test');
    return Promise.resolve(new Response(JSON.stringify([{
      id: 77, full_equipment_code: 'PPOEF9999', equipment_code: 'EF9999', company: 'Petrocasinos',
      brand: 'Dell', model: 'Prueba', serial_number: 'TEST-001', equipment_type: 'Portátil', glpi: true
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (endpoint.pathname.endsWith('/sites')) {
    assert.equal(init.headers['Accept-Profile'], 'test');
    return Promise.resolve(new Response(JSON.stringify([{ id: 1, company: 'Petrocasinos', name: 'Principal' }]), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    }));
  }
  if (init?.method === 'POST' && endpoint.pathname.endsWith('/maintenances')) {
    assert.equal(init.headers['Content-Profile'], 'test');
    const payload = JSON.parse(init.body);
    assert.equal(payload.site_id, 1);
    assert.equal(payload.equipment_code, 'EF9999');
    assert.equal(payload.full_equipment_code, 'PPOEF9999');
    assert.equal(payload.glpi, true);
    return Promise.resolve(new Response(JSON.stringify([{
      id: 77,
      last_maintenance: '2026-09-24'
    }]), { status: 201, headers: { 'Content-Type': 'application/json' } }));
  }
  if (init?.method === 'POST' && endpoint.pathname.endsWith('/maintenance_records')) {
    assert.equal(init.headers['Content-Profile'], 'test');
    const payload = JSON.parse(init.body);
    assert.equal(payload.technician_id, 1);
    return Promise.resolve(new Response(JSON.stringify([{
      id: 88,
      next_maintenance_date: '2027-03-24',
      technician_id: payload.technician_id
    }]), { status: 201, headers: { 'Content-Type': 'application/json' } }));
  }
  if (endpoint.pathname.endsWith('/usuarios')) {
    assert.equal(init.headers['Accept-Profile'], 'test');
    return Promise.resolve(new Response(JSON.stringify([{
      id: 1,
      name: 'Usuario de Prueba',
      username: 'usuario.prueba',
      password: passwordHash,
      role_id: 1
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (endpoint.pathname.endsWith('/roles')) {
    assert.equal(init.headers['Accept-Profile'], 'test');
    return Promise.resolve(new Response(JSON.stringify([{ name: 'SISTEMAS' }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  if (init?.method === 'PATCH' && endpoint.pathname.endsWith('/maintenances')) {
    assert.equal(init.headers['Content-Profile'], 'test');
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (['peripheral_stock', 'tickets', 'maintenances', 'assignments'].some((table) => endpoint.pathname.endsWith(`/${table}`))) {
    const totals = { peripheral_stock: 8, tickets: 5, maintenances: 6, assignments: 2 };
    const table = endpoint.pathname.split('/').at(-1);
    if (table === 'maintenances') assert.equal(init.headers['Accept-Profile'], 'test');
    return Promise.resolve(new Response('[]', {
      status: 200,
      headers: { 'Content-Range': `0-0/${totals[table]}`, 'Content-Type': 'application/json' }
    }));
  }
  return Promise.reject(new Error(`Solicitud no esperada: ${url}`));
}

test.before(async () => {
  global.fetch = mockedSupabaseFetch;
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  apiUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(() => {
  global.fetch = originalFetch;
  server.close();
});

test('inicia sesión con la cuenta inicial y permite consultar el perfil', async () => {
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'usuario.prueba', password: 'Petrocasinos2026' })
  });
  const loginBody = await loginResponse.json();

  assert.equal(loginResponse.status, 200);
  assert.equal(loginBody.user.role, 'SISTEMAS');
  assert.ok(loginBody.token);

  const meResponse = await fetch(`${apiUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${loginBody.token}` }
  });
  assert.equal(meResponse.status, 200);
  assert.equal((await meResponse.json()).user.username, 'usuario.prueba');
});

test('rechaza credenciales inválidas', async () => {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'usuario.prueba', password: 'incorrecta' })
  });

  assert.equal(response.status, 401);
});

test('entrega las métricas únicamente al rol sistemas', async () => {
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'usuario.prueba', password: 'Petrocasinos2026' })
  });
  const { token } = await loginResponse.json();
  const metricsResponse = await fetch(`${apiUrl}/dashboard/systems`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(metricsResponse.status, 200);
  const metrics = (await metricsResponse.json()).metrics;
  assert.deepEqual({ inventoryItems: metrics.inventoryItems, tickets: metrics.tickets, maintenances: metrics.maintenances, activeLoans: metrics.activeLoans }, {
    inventoryItems: 8, tickets: 5, maintenances: 6, activeLoans: 2
  });
  assert.equal(metrics.stats.maintenancesThisMonth, 1);
  assert.deepEqual({
    overdue: metrics.stats.overdueMaintenances,
    dueSoon: metrics.stats.dueSoonMaintenances,
    upToDate: metrics.stats.upToDateMaintenances
  }, {
    overdue: 1,
    dueSoon: 1,
    upToDate: 1
  });
  assert.deepEqual(metrics.stats.computerByType, [
    { label: 'Portátil', value: 1 },
    { label: 'Torre', value: 0 },
    { label: 'Todo en Uno', value: 0 }
  ]);
});

test('consulta las sedes activas según la empresa', async () => {
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'usuario.prueba', password: 'Petrocasinos2026' })
  });
  const { token } = await loginResponse.json();
  const response = await fetch(`${apiUrl}/sites?company=Petrocasinos`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).sites, [{ id: 1, company: 'Petrocasinos', name: 'Principal' }]);
});

test('consulta el historial global de mantenimientos', async () => {
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'usuario.prueba', password: 'Petrocasinos2026' })
  });
  const { token } = await loginResponse.json();
  const response = await fetch(`${apiUrl}/maintenance-records`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.records[0].equipment.full_equipment_code, 'PPOEF9999');
  assert.equal(body.records[0].technician_name, 'Usuario de Prueba');
});

test('guarda un mantenimiento usando el técnico de la sesión', async () => {
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'usuario.prueba', password: 'Petrocasinos2026' })
  });
  const { token } = await loginResponse.json();

  const response = await fetch(`${apiUrl}/maintenances`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Petrocasinos', siteId: 1, equipmentCode: 'EF9999', ipAddress: '', area: 'Sistemas',
      responsible: 'Equipo de prueba', brand: 'Dell', model: 'Prueba', serialNumber: 'TEST-001',
      assetType: 'Portátil', processor: 'i5', ram: '8 GB', operatingSystem: 'WIN 11 Pro',
      hdd: 'No aplica', ssd: '500 GB', isNvme: true, screenSize: '14 pulgadas',
      antivirus: 'Sophos', glpi: true, observations: 'Registro de prueba'
    })
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.technician.name, 'Usuario de Prueba');
  assert.equal(body.record.technician_id, 1);
  assert.equal(body.record.next_maintenance_date, '2027-03-24');
});

test('edita un equipo sin crear un nuevo mantenimiento', async () => {
  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'usuario.prueba', password: 'Petrocasinos2026' })
  });
  const { token } = await loginResponse.json();
  const response = await fetch(`${apiUrl}/maintenances/77`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Petrocasinos', siteId: 1, equipmentCode: 'EF9999', ipAddress: '', area: 'Sistemas',
      responsible: 'Equipo actualizado', brand: 'Dell', model: 'Prueba', serialNumber: 'TEST-001',
      assetType: 'Portátil', processor: 'i5', ram: '8 GB', operatingSystem: 'WIN 11 Pro',
      hdd: 'No aplica', ssd: '500 GB', isNvme: true, screenSize: '14 pulgadas',
      antivirus: 'Sophos', glpi: true, observations: 'Equipo editado'
    })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.maintenance.full_equipment_code, 'PPOEF9999');
});
