const central = require('../services/centralApi');
const { config, usarDatosFalsos } = require('../services/config');
const { validarCuentaNueva, resumen } = require('../services/reportes');
const { randomUUID } = require('crypto');

function valoresFormulario(body = {}) {
  return {
    titular: typeof body?.titular === 'string' ? body.titular : '',
    saldo_inicial: typeof body?.saldo_inicial === 'string' ? body.saldo_inicial : '',
    idempotency_key: typeof body?.idempotency_key === 'string' ? body.idempotency_key : randomUUID()
  };
}

async function inicio(req, res) {
  let nodo = null;
  let errorConexion = null;
  try {
    nodo = await central.getNodo();
  } catch (e) {
    errorConexion = e.message;
  }
  res.render('inicio', { titulo: 'Inicio', nodo, errorConexion, modoPrueba: usarDatosFalsos() });
}

function ocultarLlave(llave) {
  if (!llave) return 'No configurada';
  return `${llave.slice(0, 4)}••••••••${llave.slice(-4)}`;
}

function verConfig(req, res) {
  res.render('config', { titulo: 'Conexión', config, llaveOculta: ocultarLlave(config.apiKey), mensaje: null, error: null, modoPrueba: usarDatosFalsos() });
}

async function probarConexion(req, res) {
  let mensaje = null;
  let error = null;
  try {
    const nodo = await central.getNodo();
    mensaje = usarDatosFalsos()
      ? 'Sin URL o API Key en el servidor: trabajando con datos de prueba.'
      : `Conexión exitosa con el Banco Central: ${nodo.nombre}.`;
  } catch (e) {
    error = e.message;
  }
  res.render('config', { titulo: 'Conexión', config, llaveOculta: ocultarLlave(config.apiKey), mensaje, error, modoPrueba: usarDatosFalsos() });
}

function formNuevaCuenta(req, res) {
  res.render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta: null, error: null, valores: { idempotency_key: randomUUID() }, modoPrueba: usarDatosFalsos() });
}

async function crearCuenta(req, res) {
  try {
    const { datos, error } = validarCuentaNueva(req.body, { formulario: true });
    if (error) return res.status(400).render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta: null, error, valores: valoresFormulario(req.body), modoPrueba: usarDatosFalsos() });
    const cuenta = await central.crearCuenta(datos);
    res.render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta, error: null, valores: { idempotency_key: randomUUID() }, modoPrueba: usarDatosFalsos() });
  } catch (e) {
    res.status(e.status || 500).render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta: null, error: e.message, valores: valoresFormulario(req.body), modoPrueba: usarDatosFalsos() });
  }
}

async function buscarCuenta(req, res) {
  if (req.query.numero !== undefined && typeof req.query.numero !== 'string') return res.status(400).render('error', { titulo: 'Error', mensaje: 'El número de cuenta debe ser un texto', status: 400 });
  const numero = (req.query.numero || '').trim();
  let cuenta = null;
  let error = null;
  if (numero) {
    try {
      cuenta = await central.getCuenta(numero);
    } catch (e) {
      error = e.message;
    }
  }
  res.render('buscar-cuenta', { titulo: 'Consultar cuenta', numero, cuenta, error, modoPrueba: usarDatosFalsos() });
}

async function historial(req, res) {
  if (req.query.cuenta !== undefined && typeof req.query.cuenta !== 'string') return res.status(400).render('error', { titulo: 'Error', mensaje: 'El filtro cuenta debe ser un texto', status: 400 });
  const cuenta = (req.query.cuenta || '').trim();
  let transacciones = [];
  let error = null;
  try {
    transacciones = await central.getTransacciones(cuenta || undefined);
  } catch (e) {
    error = e.message;
  }
  res.render('historial', { titulo: 'Historial y reporte', cuenta, transacciones, reporte: resumen(transacciones), error, modoPrueba: usarDatosFalsos() });
}

module.exports = { inicio, verConfig, probarConexion, formNuevaCuenta, crearCuenta, buscarCuenta, historial };
