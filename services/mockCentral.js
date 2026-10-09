// Banco Central falso: se usa mientras no haya CENTRAL_URL y CENTRAL_API_KEY.
// Los datos viven en memoria y se borran al reiniciar el servidor.

const cuentas = [];
const transacciones = [];
let siguienteNumero = 1001;

function error(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}

function getNodo() {
  return { nombre: 'Sucursal (modo prueba)', tipo: 'sucursal', efectivo_disponible: 100000 };
}

function crearCuenta({ titular, saldo_inicial }) {
  const cuenta = {
    numero_cuenta: String(siguienteNumero++),
    titular,
    saldo: Number(saldo_inicial),
    estado: 'activa',
    created_at: new Date().toISOString()
  };
  cuentas.push(cuenta);
  transacciones.push({
    id: transacciones.length + 1,
    cuenta_origen: null,
    cuenta_destino: cuenta.numero_cuenta,
    monto: cuenta.saldo,
    tipo: 'apertura',
    created_at: cuenta.created_at
  });
  return cuenta;
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
