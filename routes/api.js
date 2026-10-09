const router = require('express').Router();
const c = require('../controllers/apiController');
const asyncRoute = require('../middlewares/asyncRoute');

router.get('/estado', asyncRoute(c.estado));
router.post('/cuentas', asyncRoute(c.crearCuenta));
router.get('/cuentas/:numero', asyncRoute(c.getCuenta));
router.get('/transacciones', asyncRoute(c.getTransacciones));
router.get('/reportes', asyncRoute(c.getReporte));

module.exports = router;
