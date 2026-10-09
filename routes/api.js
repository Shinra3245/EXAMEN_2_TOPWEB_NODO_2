const router = require('express').Router();
const c = require('../controllers/apiController');

router.get('/estado', c.estado);
router.post('/cuentas', c.crearCuenta);
router.get('/cuentas/:numero', c.getCuenta);
router.get('/transacciones', c.getTransacciones);
router.get('/reportes', c.getReporte);

module.exports = router;
