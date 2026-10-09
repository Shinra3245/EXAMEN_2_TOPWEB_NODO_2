const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { randomUUID } = require('node:crypto');

// Central aislado en loopback: ninguna prueba usa Supabase ni las claves reales.
const cuentas = new Map();
const movimientos = [];
let adicionales = [];
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
