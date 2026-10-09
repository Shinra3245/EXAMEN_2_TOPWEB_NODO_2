require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');

const logger = require('./middlewares/logger');
const errorHandler = require('./middlewares/errorHandler');
const webRoutes = require('./routes/web');
const apiRoutes = require('./routes/api');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(logger);
  app.use((req, res, next) => {
    res.locals.ruta = req.path;
    next();
  });

  const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, 'docs', 'openapi.yaml'), 'utf8'));
  app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'sucursal-nodo2', commit: process.env.RENDER_GIT_COMMIT || null, branch: process.env.RENDER_GIT_BRANCH || null }));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  app.use('/api', apiRoutes);
  app.use('/', webRoutes);

  app.use(errorHandler);

  return app;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  createApp().listen(PORT, () => console.log(`Sucursal escuchando en http://localhost:${PORT}`));
}

module.exports = { createApp };
