const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { randomUUID } = require('node:crypto');

// Central aislado en loopback: ninguna prueba usa Supabase ni las claves reales.
const cuentas = new Map();
const movimientos = [];
let adicionales = [];
let movimientosCajero = [];
let modo = 'normal';
let falloDespuesDeGuardar = false;
let centralServer, sucursalServer, url;
const central = express();
central.use(express.json());
central.use((req, res, next) => req.get('X-API-KEY') === 'clave-falsa-para-tests' ? next() : res.status(401).json({ error: 'Invalid API Key' }));
central.post('/api/accounts', (req, res) => {
  const b = req.body;
  if (cuentas.has(b.numero_cuenta) || movimientos.some(t => t.idempotency_key === b.idempotency_key)) return res.status(422).json({ errors: { numero_cuenta: ['Cuenta ya registrada'] } });
  const cuenta = { numero_cuenta: b.numero_cuenta, nombre_titular: b.nombre_titular, saldo_global: b.saldo_inicial.toFixed(2), estado: 'activa' };
  cuentas.set(b.numero_cuenta, cuenta);
  if (b.saldo_inicial > 0) movimientos.push({ tipo: 'deposito', monto: b.saldo_inicial.toFixed(2), cuenta_origen: null, cuenta_destino: b.numero_cuenta, idempotency_key: b.idempotency_key, created_at: '2026-10-09T23:00:00Z' });
  if (falloDespuesDeGuardar) { falloDespuesDeGuardar = false; return res.status(500).json({ message: 'Respuesta perdida después del commit' }); }
  res.status(201).json({ account: cuenta });
});
central.get('/api/accounts/:numero', (req, res) => cuentas.has(req.params.numero) ? res.json(cuentas.get(req.params.numero)) : res.status(404).json({ message: 'Cuenta no encontrada' }));
central.get('/api/accounts/:numero/transactions', (req, res) => {
  if (modo === '401') return res.status(401).json({ error: 'Invalid API Key' });
  if (modo === '503') return res.status(503).json({ message: 'Central no disponible' });
  if (!cuentas.has(req.params.numero)) return res.status(404).json({ message: 'Cuenta no encontrada en esta sucursal.' });
  if (modo === 'malformado') return res.json({ data: 'respuesta inválida' });
  const lista = [...movimientos, ...adicionales, ...movimientosCajero].filter(t => t.cuenta_destino === req.params.numero || t.cuenta_origen === req.params.numero);
  const page = Number(req.query.page || 1), last = Math.max(1, Math.ceil(lista.length / 50));
  const next = modo === 'bucle' ? page : page < last ? page + 1 : null;
  res.json({ data: lista.slice((page - 1) * 50, page * 50).map(t => ({ nodo_id: 'branch-test', nodo_nombre: 'Sucursal de prueba', nodo_tipo: 'sucursal', ...t })), current_page: page, last_page: last, next_page_url: next ? `/api/accounts/${encodeURIComponent(req.params.numero)}/transactions?page=${next}` : null });
});
central.get('/api/transactions', (req, res) => {
  if (modo === '404') return res.status(404).json({ message: 'Ruta inexistente' });
  if (modo === '401') return res.status(401).json({ error: 'Invalid API Key' });
  if (modo === '503') return res.status(503).json({ message: 'Central no disponible' });
  if (modo === 'malformado') return res.json({ data: 'respuesta inválida' });
  const lista = [...movimientos, ...adicionales].filter(t => !req.query.cuenta || t.cuenta_destino === req.query.cuenta || t.cuenta_origen === req.query.cuenta);
  const page = Number(req.query.page || 1), last = Math.max(1, Math.ceil(lista.length / 50));
  const next = modo === 'bucle' ? page : page < last ? page + 1 : null;
  res.json({ data: lista.slice((page - 1) * 50, page * 50), current_page: page, last_page: last, next_page_url: next ? `/api/transactions?page=${next}` : null });
});

async function listen(app) { return new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); }); }
before(async () => {
  centralServer = await listen(central);
  process.env.BANCO_CENTRAL_URL = `http://127.0.0.1:${centralServer.address().port}/api`;
  process.env.BANCO_CENTRAL_API_KEY = 'clave-falsa-para-tests';
  process.env.NODE_ENV = 'test';
  const { createApp } = require('../app');
  sucursalServer = await listen(createApp());
  url = `http://127.0.0.1:${sucursalServer.address().port}`;
});
after(async () => {
  await Promise.all([centralServer, sucursalServer].map(server => new Promise(resolve => server.close(resolve))));
});
async function request(path, body, headers = {}) {
  const res = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: () => JSON.parse(text) };
}

test('Conexión requiere respuesta autenticada real', async () => {
  const r = await request('/api/estado'); assert.equal(r.status, 200); assert.equal(r.json().modo_prueba, false);
});
for (const [name, value] of [['numérico',123],['objeto',{}],['array',['Nombre']],['nulo',null],['vacío',' ']]) {
  test(`Titular ${name}: 400, sin apertura y servidor operativo`, async () => {
    const count = cuentas.size;
    assert.equal((await request('/api/cuentas', { titular: value, saldo_inicial: 1000 })).status, 400);
    assert.equal(cuentas.size, count); assert.equal((await request('/healthz')).status, 200);
  });
}
for (const [name, value] of [['nulo',null],['vacío',''],['booleano',false],['array',[]],['objeto',{}],['string','1000'],['negativo',-1],['tres decimales',1.001],['fuera de rango',1e14]]) {
  test(`Saldo ${name}: 400 sin crear una cuenta`, async () => {
    const count = cuentas.size;
    assert.equal((await request('/api/cuentas', { titular: 'Prueba', saldo_inicial: value })).status, 400);
    assert.equal(cuentas.size, count);
  });
}
test('Nombre demasiado largo y saldo ausente: 400', async () => {
  assert.equal((await request('/api/cuentas', { titular: 'A'.repeat(256), saldo_inicial: 1000 })).status, 400);
  assert.equal((await request('/api/cuentas', { titular: 'Sin saldo' })).status, 400);
});
test('Apertura, reintento, conflicto y saldo actual sin doble depósito', async () => {
  const b = { titular: 'Reintento', saldo_inicial: 1000, idempotency_key: randomUUID() };
  const first = await request('/api/cuentas', b); assert.equal(first.status, 201);
  const numero = first.json().numero_cuenta;
  const replay = await request('/api/cuentas', b); assert.equal(replay.status, 200); assert.equal(replay.json().numero_cuenta, numero);
  assert.equal(movimientos.filter(t => t.cuenta_destino === numero).length, 1);
  assert.equal((await request('/api/cuentas', { ...b, saldo_inicial: 1200 })).status, 409);
  assert.equal((await request('/api/cuentas', { ...b, titular: 'Otro cliente' })).status, 409);
  cuentas.get(numero).saldo_global = '700.00';
  const changed = await request('/api/cuentas', b); assert.equal(changed.status, 200); assert.equal(changed.json().saldo, 700);
  assert.equal((await request('/api/reportes?cuenta=' + numero)).json().monto_total, 1000);
});
test('Apertura sin clave sigue siendo compatible', async () => {
  const r = await request('/api/cuentas', { titular: 'Cliente compatible', saldo_inicial: 50.25 });
  assert.equal(r.status, 201); assert.equal(r.json().saldo, 50.25);
});
test('Idempotency-Key en header y discrepancia con cuerpo', async () => {
  const key = randomUUID(), b = { titular: 'Header', saldo_inicial: 100 };
  const first = await request('/api/cuentas', b, { 'Idempotency-Key': key });
  const replay = await request('/api/cuentas', b, { 'Idempotency-Key': key });
  assert.equal(first.status, 201); assert.equal(replay.status, 200); assert.equal(first.json().numero_cuenta, replay.json().numero_cuenta);
  assert.equal((await request('/api/cuentas', { ...b, idempotency_key: 'diferente' }, { 'Idempotency-Key': key })).status, 400);
});
test('Clave de idempotencia vacía o inválida: 400 sin apertura', async () => {
  const b = { titular: 'Clave inválida', saldo_inicial: 1000 }, count = cuentas.size;
  assert.equal((await request('/api/cuentas', b, { 'Idempotency-Key': '' })).status, 400);
  assert.equal((await request('/api/cuentas', b, { 'Idempotency-Key': 'con espacios' })).status, 400);
  assert.equal((await request('/api/cuentas', { ...b, idempotency_key: {} })).status, 400);
  assert.equal(cuentas.size, count);
});
test('Aperturas simultáneas con misma clave crean una sola cuenta', async () => {
  const b = { titular: 'Simultáneo', saldo_inicial: 1000, idempotency_key: randomUUID() };
  const results = await Promise.all([request('/api/cuentas', b), request('/api/cuentas', b)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200,201]);
  assert.equal(results[0].json().numero_cuenta, results[1].json().numero_cuenta);
});
test('Recupera apertura confirmada aunque el primer POST respondió 500', async () => {
  falloDespuesDeGuardar = true;
  const b = { titular: 'Respuesta perdida', saldo_inicial: 10, idempotency_key: randomUUID() };
  const r = await request('/api/cuentas', b); assert.equal(r.status, 200);
  assert.equal((await request('/api/cuentas', b)).json().numero_cuenta, r.json().numero_cuenta);
  assert.equal(movimientos.filter(t => t.cuenta_destino === r.json().numero_cuenta).length, 1);
});
test('Cuenta con cero se reintenta y no registra un depósito ficticio', async () => {
  const b = { titular: 'Cero', saldo_inicial: 0, idempotency_key: randomUUID() };
  const first = await request('/api/cuentas', b), replay = await request('/api/cuentas', b);
  assert.equal(first.status, 201); assert.equal(replay.status, 200);
  assert.equal(first.json().numero_cuenta, replay.json().numero_cuenta);
  assert.equal((await request('/api/transacciones?cuenta=' + first.json().numero_cuenta)).json().length, 0);
  assert.equal((await request('/api/cuentas', { ...b, saldo_inicial: 1 })).status, 409);
});
test('Formulario conserva el intento y valida entradas repetidas sin error fatal', async () => {
  const page = await request('/cuentas/nueva');
  const key = /name="idempotency_key" value="([^"]+)"/.exec(page.text)[1];
  const fields = new URLSearchParams({ titular: 'Formulario', saldo_inicial: '1000', idempotency_key: key }).toString();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const first = await request('/cuentas', fields, headers), replay = await request('/cuentas', fields, headers);
  assert.equal(first.status, 200); assert.equal(replay.status, 200);
  const number = /Número de cuenta: <strong>([^<]+)<\/strong>/.exec(first.text)[1];
  assert.ok(replay.text.includes(number)); assert.equal(movimientos.filter(t => t.cuenta_destino === number).length, 1);
  assert.equal((await request('/cuentas', 'titular=A&titular=B&saldo_inicial=1000', headers)).status, 400);
  const invalid = await request('/cuentas', new URLSearchParams({ titular: 'Formulario', saldo_inicial: '', idempotency_key: key }).toString(), headers);
  assert.equal(invalid.status, 400); assert.ok(invalid.text.includes(`value="${key}"`));
});
test('Historial y reporte incluyen más de 1,000 movimientos', async () => {
  adicionales = Array.from({ length: 1051 }, () => ({ tipo: 'deposito', monto: '0.10', cuenta_origen: null, cuenta_destino: 'mas-de-20-paginas', created_at: '2026-10-09T23:00:00Z' }));
  try {
    const history = await request('/api/transacciones?cuenta=mas-de-20-paginas');
    assert.equal(history.status, 200); assert.equal(history.json().length, 1051);
    const report = (await request('/api/reportes?cuenta=mas-de-20-paginas')).json();
    assert.equal(report.operaciones, 1051); assert.equal(report.monto_total, 105.1); assert.equal(report.por_tipo.deposito.monto, 105.1);
  } finally { adicionales = []; }
});
test('Historial completo incluye cajero y saldo actual; el reporte local conserva solo la apertura', async () => {
  const apertura = await request('/api/cuentas', { titular: 'Cliente historial', saldo_inicial: 1000 });
  const numero = apertura.json().numero_cuenta;
  cuentas.get(numero).saldo_global = '3000.90';
  movimientosCajero = [
    ...['300.90','1000.00','1000.00'].map(monto => ({ tipo: 'deposito', monto, cuenta_origen: null, cuenta_destino: numero })),
    ...Array.from({ length: 3 }, () => ({ tipo: 'retiro', monto: '100.00', cuenta_origen: numero, cuenta_destino: null }))
  ].map(t => ({ ...t, nodo_id: 'atm-test', nodo_nombre: 'Cajero prueba', nodo_tipo: 'cajero', created_at: '2026-10-10T02:56:00Z' }));
  try {
    const completo = await request(`/api/cuentas/${numero}/transacciones`);
    assert.equal(completo.status, 200); assert.equal(completo.json().length, 7);
    assert.equal(completo.json().filter(t => t.nodo.tipo === 'cajero').length, 6);
    assert.equal((await request('/api/transacciones?cuenta=' + numero)).json().length, 1);
    assert.equal((await request('/api/reportes?cuenta=' + numero)).json().monto_total, 1000);
    const page = await request('/historial?cuenta=' + numero);
    assert.equal(page.status, 200);
    for (const text of ['Historial completo de la cuenta','Saldo actual de la cuenta','$3,000.90','$3,600.90','Cajero prueba','Ciudad de México']) assert.ok(page.text.includes(text), text);
    assert.ok(page.text.includes('9/10/2026')); assert.ok(!page.text.includes('10/10/2026'));
    const local = await request(`/historial?cuenta=${numero}&alcance=local`);
    assert.equal(local.status, 200); assert.ok(local.text.includes('Historial local de la sucursal'));
    assert.ok(local.text.includes('$1,000.00')); assert.ok(!local.text.includes('Cajero prueba'));
    const cuenta = await request('/cuentas/buscar?numero=' + numero);
    assert.ok(cuenta.text.includes('$3,000.90')); assert.ok(cuenta.text.includes('alcance=cuenta'));
  } finally { movimientosCajero = []; }
});
test('Historial completo recorre todas las páginas de más de 1,000 movimientos', async () => {
  const numero = 'cuenta-historial-paginado';
  cuentas.set(numero, { numero_cuenta: numero, nombre_titular: 'Paginación', saldo_global: '105.10', estado: 'activa' });
  adicionales = Array.from({ length: 1051 }, () => ({ tipo: 'deposito', monto: '0.10', cuenta_origen: null, cuenta_destino: numero, created_at: '2026-10-09T23:00:00Z' }));
  try {
    const history = await request(`/api/cuentas/${numero}/transacciones`);
    assert.equal(history.status, 200); assert.equal(history.json().length, 1051);
  } finally { adicionales = []; cuentas.delete(numero); }
});
test('Cuenta inexistente en historial completo devuelve 404 sin mostrar reporte vacío', async () => {
  assert.equal((await request('/api/cuentas/inexistente/transacciones')).status, 404);
  const page = await request('/historial?cuenta=inexistente');
  assert.equal(page.status, 404); assert.ok(page.text.includes('Cuenta no encontrada'));
  assert.ok(!page.text.includes('Suma de importes de los movimientos'));
});
test('Cuenta existente sin movimientos muestra saldo y reporte cero', async () => {
  const opening = await request('/api/cuentas', { titular: 'Sin movimientos', saldo_inicial: 0 });
  const numero = opening.json().numero_cuenta;
  const history = await request(`/api/cuentas/${numero}/transacciones`);
  assert.equal(history.status, 200); assert.deepEqual(history.json(), []);
  const page = await request('/historial?cuenta=' + numero);
  assert.equal(page.status, 200); assert.ok(page.text.includes('$0.00')); assert.ok(page.text.includes('No hay transacciones.'));
});
test('Historial completo no muestra totales parciales ante fallo o paginación inválida', async () => {
  const opening = await request('/api/cuentas', { titular: 'Fallo historial', saldo_inicial: 1000 });
  const numero = opening.json().numero_cuenta;
  try {
    for (const [value, expected] of [['503',503],['401',401],['malformado',502],['bucle',502]]) {
      modo = value;
      const page = await request('/historial?cuenta=' + numero);
      assert.equal(page.status, expected); assert.ok(!page.text.includes('Suma de importes de los movimientos'));
    }
  } finally { modo = 'normal'; }
});
test('Historial valida alcance y requiere cuenta para la consulta completa', async () => {
  for (const path of ['/historial?alcance=cuenta','/historial?cuenta=%20&alcance=cuenta','/historial?alcance=invalido','/historial?alcance[x]=cuenta','/historial?alcance=cuenta&alcance=local']) {
    assert.equal((await request(path)).status, 400);
  }
});
test('Historial completo escapa nombres de nodos al presentar movimientos', async () => {
  const opening = await request('/api/cuentas', { titular: 'Escapado', saldo_inicial: 0 });
  const numero = opening.json().numero_cuenta;
  movimientosCajero = [{ tipo: 'deposito', monto: '1.00', cuenta_destino: numero, created_at: '2026-10-09T23:00:00Z', nodo_nombre: '<script>alert(1)</script>', nodo_tipo: 'cajero' }];
  try {
    const page = await request('/historial?cuenta=' + numero);
    assert.equal(page.status, 200); assert.ok(page.text.includes('&lt;script&gt;')); assert.ok(!page.text.includes('<script>alert(1)</script>'));
  } finally { movimientosCajero = []; }
});
for (const [value, expected] of [['404',404],['401',401],['503',503],['malformado',502]]) {
  test(`Conexión rechaza Central ${value}`, async () => {
    modo = value;
    try { const r = await request('/api/estado'); assert.equal(r.status, expected); assert.equal(r.json().conectado, undefined); }
    finally { modo = 'normal'; }
  });
}
test('Paginación circular genera error en lugar de totales parciales', async () => {
  modo = 'bucle';
  try { assert.equal((await request('/api/reportes')).status, 502); }
  finally { modo = 'normal'; }
});
test('Filtros con objetos o arrays devuelven 400', async () => {
  for (const path of ['/api/transacciones?cuenta[x]=1','/api/reportes?cuenta[x]=1','/historial?cuenta[x]=1','/cuentas/buscar?numero[x]=1']) assert.equal((await request(path)).status, 400);
});
test('Errores async inesperados llegan al middleware de Express 4', async () => {
  const app = express();
  app.get('/error', require('../middlewares/asyncRoute')(async () => { throw new Error('Error aislado'); }));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await listen(app);
  try { const r = await fetch(`http://127.0.0.1:${server.address().port}/error`); assert.equal(r.status, 500); assert.equal((await r.json()).error, 'Error aislado'); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
test('Cuenta inexistente, historial vacío y documentación', async () => {
  assert.equal((await request('/api/cuentas/inexistente')).status, 404);
  assert.deepEqual((await request('/api/transacciones?cuenta=inexistente')).json(), []);
  assert.equal((await request('/api/reportes?cuenta=inexistente')).json().monto_total, 0);
  assert.equal((await request('/docs/')).status, 200);
});
test('Producción sin credenciales devuelve 503 y no activa simulaciones', async () => {
  const { config } = require('../services/config');
  const original = config.apiKey;
  config.apiKey = ''; process.env.NODE_ENV = 'production';
  try { assert.equal((await request('/api/estado')).status, 503); assert.equal((await request('/healthz')).status, 200); }
  finally { config.apiKey = original; process.env.NODE_ENV = 'test'; }
});
test('Contrato OpenAPI documenta reintentos, errores y validación', () => {
  const fs = require('node:fs'), YAML = require('yaml');
  const doc = YAML.parse(fs.readFileSync(require('node:path').join(__dirname, '../docs/openapi.yaml'), 'utf8'));
  const opening = doc.paths['/cuentas'].post;
  for (const status of ['200','201','400','409','422','503']) assert.ok(opening.responses[status]);
  assert.equal(doc.components.schemas.CuentaNueva.properties.saldo_inicial.multipleOf, 0.01);
  assert.ok(doc.paths['/healthz'].get);
});
test('El reintento recupera la misma cuenta después de reiniciar el proceso', async () => {
  const { spawn } = require('node:child_process');
  const { once } = require('node:events');
  async function worker() {
    const child = spawn(process.execPath, ['-e', "const server=require('./app').createApp().listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));"], {
      cwd: require('node:path').join(__dirname, '..'), env: { ...process.env }, stdio: ['ignore','ignore','pipe','ipc']
    });
    const ready = await new Promise((resolve, reject) => {
      child.once('message', resolve); child.once('error', reject);
      child.once('exit', code => reject(new Error(`El proceso terminó antes de iniciar: ${code}`)));
    });
    return { url: `http://127.0.0.1:${ready.port}`, async stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } };
  }
  const body = { titular: 'Reinicio real', saldo_inicial: 1000, idempotency_key: randomUUID() };
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let numero;
  const first = await worker();
  try { const r = await fetch(first.url + '/api/cuentas', options); assert.equal(r.status, 201); numero = (await r.json()).numero_cuenta; }
  finally { await first.stop(); }
  const restarted = await worker();
  try { const r = await fetch(restarted.url + '/api/cuentas', options); assert.equal(r.status, 200); assert.equal((await r.json()).numero_cuenta, numero); }
  finally { await restarted.stop(); }
  assert.equal(movimientos.filter(t => t.cuenta_destino === numero).length, 1);
});
