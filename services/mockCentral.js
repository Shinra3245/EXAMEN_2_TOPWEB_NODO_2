// Banco Central falso: se usa mientras no haya CENTRAL_URL y CENTRAL_API_KEY.
// Los datos viven en memoria y se borran al reiniciar el servidor.

const cuentas = [];
const transacciones = [];
let siguienteNumero = 1001;
const aperturas = new Map();

function error(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

function getNodo() {
  return { nombre: 'Sucursal (modo prueba)', tipo: 'sucursal', efectivo_disponible: 100000 };
}

function crearCuenta({ titular, saldo_inicial, idempotency_key }) {
  const previa = aperturas.get(idempotency_key);
  if (previa) {
    if (previa.titular !== titular || previa.saldo_inicial !== saldo_inicial) throw error(409, 'La clave de idempotencia ya se utilizó con otros datos');
    return { ...previa.cuenta, reintentada: true };
  }
  const cuenta = {
    numero_cuenta: String(siguienteNumero++),
    titular,
    saldo: Number(saldo_inicial),
    estado: 'activa',
    created_at: new Date().toISOString()
  };
  cuentas.push(cuenta);
  if (cuenta.saldo > 0) transacciones.push({
    id: transacciones.length + 1,
    cuenta_origen: null,
    cuenta_destino: cuenta.numero_cuenta,
    monto: cuenta.saldo,
    tipo: 'deposito',
    created_at: cuenta.created_at
  });
  aperturas.set(idempotency_key, { titular, saldo_inicial, cuenta });
  return { ...cuenta, reintentada: false };
}

function getCuenta(numero) {
  const cuenta = cuentas.find(c => c.numero_cuenta === String(numero));
  if (!cuenta) throw error(404, `La cuenta ${numero} no existe`);
  return cuenta;
}

function getTransacciones(cuenta) {
  const lista = cuenta
    ? transacciones.filter(t => t.cuenta_origen === cuenta || t.cuenta_destino === cuenta)
    : transacciones;
  return [...lista].reverse();
}

module.exports = { getNodo, crearCuenta, getCuenta, getTransacciones };
