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

// El Banco Central todavía no tiene GET /node.
// Se prueba la conexión consultando una cuenta inexistente:
// 404 = la API Key es válida, 401 = la API Key es inválida.
async function getNodo() {
  if (usarDatosFalsos()) return mock.getNodo();
  try {
    await llamar('GET', '/accounts/prueba-conexion');
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  return { nombre: 'Sucursal (API Key válida)', tipo: 'sucursal' };
}

async function crearCuenta({ titular, saldo_inicial }) {
  if (usarDatosFalsos()) return mock.crearCuenta({ titular, saldo_inicial });
  const datos = await llamar('POST', '/accounts', {
    numero_cuenta: String(Date.now()).slice(-10),
    nombre_titular: titular,
    saldo_inicial,
    idempotency_key: crypto.randomUUID()
  });
  return adaptarCuenta(datos.account);
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

// El Banco Central responde paginado (Laravel paginate): se recorren todas las páginas.
async function getTransacciones(cuenta) {
  if (usarDatosFalsos()) return mock.getTransacciones(cuenta);
  const todas = [];
  let pagina = 1;
  try {
    while (pagina <= 20) {
      const params = new URLSearchParams({ page: pagina });
      if (cuenta) params.set('cuenta', cuenta);
      const datos = await llamar('GET', `/transactions?${params}`);
      const lista = Array.isArray(datos) ? datos : (datos.data || []);
      todas.push(...lista.map(adaptarTransaccion));
      if (Array.isArray(datos) || !datos.next_page_url) break;
      pagina++;
    }
  } catch (e) {
    if (e.status === 404 || e.status === 405) {
      throw error(501, 'El Banco Central todavía no tiene la ruta de historial (GET /transactions).');
    }
    throw e;
  }
  return todas;
}

module.exports = { getNodo, crearCuenta, getCuenta, getTransacciones };
