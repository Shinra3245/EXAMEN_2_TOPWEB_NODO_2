const router = require('express').Router();
const c = require('../controllers/webController');

router.get('/', c.inicio);
router.get('/config', c.verConfig);
router.post('/config', c.probarConexion);
router.get('/cuentas/nueva', c.formNuevaCuenta);
router.post('/cuentas', c.crearCuenta);
router.get('/cuentas/buscar', c.buscarCuenta);
router.get('/historial', c.historial);

module.exports = router;
