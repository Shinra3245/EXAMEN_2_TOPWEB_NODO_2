const router = require('express').Router();
const c = require('../controllers/webController');
const asyncRoute = require('../middlewares/asyncRoute');

router.get('/', asyncRoute(c.inicio));
router.get('/config', asyncRoute(c.verConfig));
router.post('/config', asyncRoute(c.probarConexion));
router.get('/cuentas/nueva', asyncRoute(c.formNuevaCuenta));
router.post('/cuentas', asyncRoute(c.crearCuenta));
router.get('/cuentas/buscar', asyncRoute(c.buscarCuenta));
router.get('/historial', asyncRoute(c.historial));

module.exports = router;
