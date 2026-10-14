const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

// Every admin route requires a valid JWT and one of these roles
router.use(auth);
router.use(requireRole(['super_admin', 'operations', 'auditor', 'support', 'compliance']));

// ============================================================
// DASHBOARD
// ============================================================
router.get('/stats', adminController.getStats);

// ============================================================
// INVESTORS
// ============================================================
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id/portfolio', requireRole(['super_admin', 'operations']), adminController.updatePortfolio);
router.put('/users/:id/status', adminController.updateStatus);
router.put('/users/:id/freeze', adminController.freezeUser);

// ============================================================
// COMMUNICATIONS
// ============================================================
router.post('/broadcast-email', requireRole(['super_admin', 'operations']), adminController.broadcastEmail);

// ============================================================
// FUND OPERATIONS
// Canonical paths under /fund/*. Aliases at the bottom of the
// file accept the shorter paths the admin frontend calls.
// ============================================================
router.put('/fund/yield', requireRole(['super_admin', 'operations']), adminController.setYieldRate);
router.post('/fund/run-accrual', requireRole(['super_admin', 'operations']), adminController.runAccrual);
router.get('/fund/stats', adminController.getFundStats);
router.get('/fund/performance', adminController.getFundPerformance);

// ============================================================
// COMPLIANCE & AUDIT
// ============================================================
router.get('/audit-log', requireRole(['super_admin', 'auditor']), adminController.getAuditLog);
router.get('/tax-summary', adminController.getTaxSummary);

// ============================================================
// FRONTEND ALIASES
// admin.js calls these shorter paths. Kept here so we don't have
// to change the frontend every time the backend reorganises.
// ============================================================
router.post('/yield', requireRole(['super_admin', 'operations']), adminController.setYieldRate);
router.post('/run-accrual', requireRole(['super_admin', 'operations']), adminController.runAccrual);

module.exports = router;