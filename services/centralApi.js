const crypto = require('crypto');
const { config, usarDatosFalsos } = require('./config');
const mock = require('./mockCentral');

function error(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

// Convierte los errores de Laravel a un solo mensaje legible
function mensajeDeError(datos, status) {
  if (datos && datos.errors) {
    return Object.values(datos.errors).flat().join(' ');
  }
  return (datos && (datos.error || datos.message)) || `Error ${status} del Banco Central`;
}

async function llamar(metodo, ruta, body) {
  const url = `${config.centralUrl}${ruta}`;
  console.log(`[CENTRAL] ${metodo} ${url}`);

  let res;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-KEY': config.apiKey
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000)
    });
  } catch (e) {
    throw error(503, `No se pudo conectar con el Banco Central (${e.message})`);
  }

  const texto = await res.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    throw error(502, `El Banco Central respondió algo que no es JSON (HTTP ${res.status})`);
  }

  console.log(`[CENTRAL] <- ${res.status}`);
  if (!res.ok) throw error(res.status, mensajeDeError(datos, res.status));
  return datos;
}

// Traduce la cuenta del formato del Banco Central al formato de las pantallas
function adaptarCuenta(c) {
  return {
    numero_cuenta: c.numero_cuenta,
    titular: c.nombre_titular ?? c.titular,
    saldo: Number(c.saldo_global ?? c.saldo),
    estado: c.estado
  };
}

// Exige una respuesta válida de una ruta protegida, sin aceptar un 404 genérico.
async function getNodo() {
  if (usarDatosFalsos()) return mock.getNodo();
  const datos = await llamar('GET', '/transactions?page=1');
  if (!Array.isArray(datos) && !Array.isArray(datos?.data)) throw error(502, 'Respuesta de conexión inválida del Banco Central');
  return { nombre: 'Sucursal (API Key válida)', tipo: 'sucursal' };
}

async function crearCuenta({ titular, saldo_inicial, idempotency_key = crypto.randomUUID() }) {
  if (usarDatosFalsos()) return mock.crearCuenta({ titular, saldo_inicial, idempotency_key });
  // La identidad del intento se conserva incluso si Render reinicia el proceso.
  // El Central mantiene la cuenta y el depósito; no se usa una caché en memoria.
  const sucursal = crypto.createHash('sha256').update(config.apiKey).digest('hex').slice(0, 16);
  const claveCentral = `sucursal:${sucursal}:${idempotency_key}`;
  const digest = crypto.createHash('sha256').update(claveCentral).digest('hex').slice(0, 16);
  const numero = BigInt(`0x${digest}`).toString().padStart(20, '0');
  try {
    const datos = await llamar('POST', '/accounts', { numero_cuenta: numero, nombre_titular: titular, saldo_inicial, idempotency_key: claveCentral });
    return { ...adaptarCuenta(datos.account), reintentada: false };
  } catch (original) {
    if (![422, 500, 503].includes(original.status)) throw original;
    let cuenta;
    try { cuenta = await getCuenta(numero); }
    catch { throw original; }
    const movimientos = await transaccionesCentrales(numero);
    const apertura = movimientos.find(t => t.idempotency_key === claveCentral && t.tipo === 'deposito' && t.cuenta_destino === numero);
    const saldoOriginal = apertura ? Number(apertura.monto) : 0;
    if (cuenta.titular !== titular || saldoOriginal !== saldo_inicial) throw error(409, 'La clave de idempotencia ya se utilizó con otros datos');
    return { ...cuenta, reintentada: true };
  }
}

async function getCuenta(numero) {
  if (usarDatosFalsos()) return mock.getCuenta(numero);
  const datos = await llamar('GET', `/accounts/${encodeURIComponent(numero)}`);
  return adaptarCuenta(datos);
}

function adaptarTransaccion(t) {
  return {
    tipo: t.tipo ?? t.type,
    monto: Number(t.monto ?? t.amount),
    cuenta_origen: t.cuenta_origen ?? null,
    cuenta_destino: t.cuenta_destino ?? null,
    created_at: t.created_at ?? t.timestamp
  };
}

async function transaccionesCentrales(cuenta) {
  const todas = [];
  let pagina = 1;
  while (true) {
    const params = new URLSearchParams({ page: pagina });
    if (cuenta) params.set('cuenta', cuenta);
    const datos = await llamar('GET', `/transactions?${params}`);
    const lista = Array.isArray(datos) ? datos : datos?.data;
    if (!Array.isArray(lista)) throw error(502, 'Historial inválido del Banco Central');
    todas.push(...lista);
    if (Array.isArray(datos) || !datos.next_page_url) break;
    let siguiente;
    try { siguiente = Number(new URL(datos.next_page_url, config.centralUrl).searchParams.get('page')); }
    catch { throw error(502, 'Paginación inválida del Banco Central'); }
    if (!Number.isSafeInteger(siguiente) || siguiente !== pagina + 1 || (datos.last_page && siguiente > datos.last_page)) throw error(502, 'Paginación inválida del Banco Central');
    pagina = siguiente;
  }
  return todas;
}

// El reporte solo se calcula después de obtener el historial completo.
async function getTransacciones(cuenta) {
  if (usarDatosFalsos()) return mock.getTransacciones(cuenta);
  try {
    return (await transaccionesCentrales(cuenta)).map(adaptarTransaccion);
  } catch (e) {
    if (e.status === 404 || e.status === 405) {
      throw error(501, 'El Banco Central todavía no tiene la ruta de historial (GET /transactions).');
    }
    throw e;
  }
}

module.exports = { getNodo, crearCuenta, getCuenta, getTransacciones };
