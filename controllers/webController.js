const central = require('../services/centralApi');
const { config, usarDatosFalsos } = require('../services/config');
const { validarCuentaNueva, resumen } = require('../services/reportes');

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
  res.render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta: null, error: null, valores: {}, modoPrueba: usarDatosFalsos() });
}

async function crearCuenta(req, res) {
  const { datos, error } = validarCuentaNueva(req.body);
  if (error) {
    return res.status(400).render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta: null, error, valores: req.body, modoPrueba: usarDatosFalsos() });
  }
  try {
    const cuenta = await central.crearCuenta(datos);
    res.render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta, error: null, valores: {}, modoPrueba: usarDatosFalsos() });
  } catch (e) {
    res.status(e.status || 500).render('nueva-cuenta', { titulo: 'Nueva cuenta', cuenta: null, error: e.message, valores: req.body, modoPrueba: usarDatosFalsos() });
  }
}

async function buscarCuenta(req, res) {
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
