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
  const { datos, error } = validarCuentaNueva(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const cuenta = await central.crearCuenta(datos);
    res.status(201).json(cuenta);
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
    res.json(await central.getTransacciones(req.query.cuenta));
  } catch (e) {
    next(e);
  }
}

async function getReporte(req, res, next) {
  try {
    const transacciones = await central.getTransacciones(req.query.cuenta);
    res.json(resumen(transacciones));
  } catch (e) {
    next(e);
  }
}

module.exports = { estado, crearCuenta, getCuenta, getTransacciones, getReporte };
