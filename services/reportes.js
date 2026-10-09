function validarCuentaNueva({ titular, saldo_inicial }) {
  const nombre = (titular || '').trim();
  const saldo = Number(saldo_inicial);
  if (!nombre) return { error: 'El nombre del titular es obligatorio' };
  if (Number.isNaN(saldo) || saldo < 0) return { error: 'El saldo inicial debe ser un número mayor o igual a 0' };
  return { datos: { titular: nombre, saldo_inicial: saldo } };
}

function resumen(transacciones) {
  const porTipo = {};
  let total = 0;
  for (const t of transacciones) {
    const monto = Number(t.monto) || 0;
    porTipo[t.tipo] = porTipo[t.tipo] || { operaciones: 0, monto: 0 };
    porTipo[t.tipo].operaciones++;
    porTipo[t.tipo].monto += monto;
    total += monto;
  }
  return { operaciones: transacciones.length, monto_total: total, por_tipo: porTipo };
}

module.exports = { validarCuentaNueva, resumen };
