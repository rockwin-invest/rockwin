const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

// User routes
router.post('/request', auth, withdrawalController.requestWithdrawal);
router.get('/mine', auth, withdrawalController.getMyWithdrawals);
router.post('/:id/cancel', auth, withdrawalController.cancelWithdrawal);

// Admin routes — reads open to all admin roles, writes restricted
const adminReadRoles = ['super_admin', 'operations', 'auditor', 'support', 'compliance'];
const adminWriteRoles = ['super_admin', 'operations'];

router.get('/admin/pending', auth, requireRole(adminReadRoles), withdrawalController.getPendingWithdrawals);
router.get('/admin/all', auth, requireRole(adminReadRoles), withdrawalController.getAllWithdrawals);
router.post('/admin/:id/approve', auth, requireRole(adminWriteRoles), withdrawalController.approveWithdrawal);
router.post('/admin/:id/reject', auth, requireRole(adminWriteRoles), withdrawalController.rejectWithdrawal);
router.post('/admin/:id/paid', auth, requireRole(adminWriteRoles), withdrawalController.markPaid);

module.exports = router;