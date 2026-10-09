const config = {
  centralUrl: (process.env.BANCO_CENTRAL_URL || '').replace(/\/$/, ''),
  apiKey: process.env.BANCO_CENTRAL_API_KEY || ''
};

function usarDatosFalsos() {
  return !config.centralUrl || !config.apiKey;
}

module.exports = { config, usarDatosFalsos };
