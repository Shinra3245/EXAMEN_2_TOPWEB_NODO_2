// Express 4 necesita reenviar también los errores de las funciones async.
module.exports = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res, next)).catch(next);
