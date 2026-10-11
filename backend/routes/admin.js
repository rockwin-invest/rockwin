const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.use(auth);
router.use(requireRole(['super_admin', 'operations', 'auditor', 'support', 'compliance']));

// Investors
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id/portfolio', requireRole(['super_admin', 'operations']), adminController.updatePortfolio);
router.put('/users/:id/status', adminController.updateStatus);
router.put('/users/:id/freeze', adminController.freezeUser);
router.post('/broadcast-sms', requireRole(['super_admin', 'operations']), adminController.broadcastSms);

// Fund management
router.put('/fund/yield', requireRole(['super_admin', 'operations']), adminController.setYieldRate);
router.post('/fund/run-accrual', requireRole(['super_admin', 'operations']), adminController.runAccrual);
router.get('/fund/stats', adminController.getFundStats);
router.get('/fund/performance', adminController.getFundPerformance);

// Audit
router.get('/audit-log', requireRole(['super_admin', 'auditor']), adminController.getAuditLog);

module.exports = router;
