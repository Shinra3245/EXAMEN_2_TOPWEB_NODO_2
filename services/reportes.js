function validarCuentaNueva(body, { formulario = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Se requiere un objeto con los datos de la cuenta' };
  const { titular, saldo_inicial, idempotency_key } = body;
  if (typeof titular !== 'string' || !titular.trim()) return { error: 'El nombre del titular debe ser un texto no vacío' };
  const nombre = titular.trim();
  if ([...nombre].length > 255) return { error: 'El nombre del titular admite hasta 255 caracteres' };
  const saldoValido = typeof saldo_inicial === 'number' || (formulario && typeof saldo_inicial === 'string');
  if (!saldoValido || !/^\d+(?:\.\d{1,2})?$/.test(String(saldo_inicial))) return { error: 'El saldo inicial debe ser un número mayor o igual a 0, con hasta dos decimales' };
  const saldo = Number(saldo_inicial);
  if (!Number.isFinite(saldo) || saldo > 9999999999999.99) return { error: 'El saldo inicial excede el máximo permitido' };
  if (idempotency_key !== undefined && (typeof idempotency_key !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(idempotency_key))) return { error: 'La clave de idempotencia debe contener entre 1 y 128 letras, números, puntos, guiones o dos puntos' };
  return { datos: { titular: nombre, saldo_inicial: saldo, idempotency_key } };
}

function resumen(transacciones) {
  const porTipo = {};
  let total = 0;
  for (const t of transacciones) {
    const monto = Math.round(Number(t.monto) * 100);
    if (!Number.isSafeInteger(monto) || monto < 0) throw Object.assign(new Error('Importe inválido en el historial del Banco Central'), { status: 502 });
    porTipo[t.tipo] = porTipo[t.tipo] || { operaciones: 0, monto: 0 };
    porTipo[t.tipo].operaciones++;
    porTipo[t.tipo].monto += monto;
    total += monto;
    if (!Number.isSafeInteger(total)) throw Object.assign(new Error('El total excede la precisión admitida por el reporte'), { status: 502 });
  }
  for (const detalle of Object.values(porTipo)) detalle.monto /= 100;
  return { operaciones: transacciones.length, monto_total: total / 100, por_tipo: porTipo };
}

module.exports = { validarCuentaNueva, resumen };
