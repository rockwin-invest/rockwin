const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

// Public webhook — no auth (gateway calls this)
router.post('/webhook', paymentController.webhook);

// Authenticated user routes
router.post('/deposit', auth, paymentController.initiateDeposit);
router.get('/status/:paymentId', auth, paymentController.getPaymentStatus);

// Dev: manually trigger mock completion (user-scoped)
router.post('/mock-confirm/:paymentId', auth, paymentController.mockConfirm);

// Admin: view pending payments (broad read access for audit/compliance)
router.get(
    '/admin/pending',
    auth,
    requireRole(['super_admin', 'operations', 'auditor', 'support', 'compliance']),
    paymentController.getPendingPayments
);

// Admin: manually resolve a pending payment — restricted (money movement)
router.post(
    '/admin/confirm/:paymentId',
    auth,
    requireRole(['super_admin', 'operations']),
    paymentController.confirmPaymentManually
);

router.post(
    '/admin/fail/:paymentId',
    auth,
    requireRole(['super_admin', 'operations']),
    paymentController.failPaymentManually
);

module.exports = router;