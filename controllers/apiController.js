const central = require('../services/centralApi');
const { usarDatosFalsos } = require('../services/config');
const { validarCuentaNueva, resumen } = require('../services/reportes');

async function estado(req, res, next) {
  try {
    const nodo = await central.getNodo();
    res.json({ conectado: true, modo_prueba: usarDatosFalsos(), nodo });
  } catch (e) {
    next(e);
  }
}

async function crearCuenta(req, res, next) {
  try {
    const headerKey = req.get('Idempotency-Key');
    if (headerKey !== undefined && req.body?.idempotency_key !== undefined && headerKey !== req.body.idempotency_key) return res.status(400).json({ error: 'La clave de idempotencia del header y del cuerpo deben coincidir' });
    const body = headerKey !== undefined && req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? { ...req.body, idempotency_key: headerKey } : req.body;
    const { datos, error } = validarCuentaNueva(body);
    if (error) return res.status(400).json({ error });
    const cuenta = await central.crearCuenta(datos);
    res.status(cuenta.reintentada ? 200 : 201).json(cuenta);
  } catch (e) {
    next(e);
  }
}

async function getCuenta(req, res, next) {
  try {
    res.json(await central.getCuenta(req.params.numero));
  } catch (e) {
    next(e);
  }
}

async function getTransacciones(req, res, next) {
  try {
    if (req.query.cuenta !== undefined && typeof req.query.cuenta !== 'string') return res.status(400).json({ error: 'El filtro cuenta debe ser un texto' });
    res.json(await central.getTransacciones(req.query.cuenta));
  } catch (e) {
    next(e);
  }
}

async function getTransaccionesCuenta(req, res, next) {
  try {
    res.json(await central.getTransaccionesCuenta(req.params.numero));
  } catch (e) {
    next(e);
  }
}

async function getReporte(req, res, next) {
  try {
    if (req.query.cuenta !== undefined && typeof req.query.cuenta !== 'string') return res.status(400).json({ error: 'El filtro cuenta debe ser un texto' });
    const transacciones = await central.getTransacciones(req.query.cuenta);
    res.json(resumen(transacciones));
  } catch (e) {
    next(e);
  }
}

module.exports = { estado, crearCuenta, getCuenta, getTransacciones, getTransaccionesCuenta, getReporte };
