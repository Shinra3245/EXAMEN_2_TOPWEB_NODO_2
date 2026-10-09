const config = {
  centralUrl: (process.env.BANCO_CENTRAL_URL || '').replace(/\/$/, ''),
  apiKey: process.env.BANCO_CENTRAL_API_KEY || ''
};

function usarDatosFalsos() {
  const incompleto = !config.centralUrl || !config.apiKey;
  if (incompleto && process.env.NODE_ENV === 'production') throw Object.assign(new Error('Configurar BANCO_CENTRAL_URL y BANCO_CENTRAL_API_KEY en el servidor'), { status: 503 });
  return incompleto;
}

module.exports = { config, usarDatosFalsos };
