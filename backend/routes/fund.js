const express = require('express');
const router = express.Router();
const fundController = require('../controllers/fundController');

router.get('/info', fundController.getPublicFundInfo);
router.get('/history', fundController.getFundHistory);
router.get('/calculator', fundController.getCalculator);

module.exports = router;
