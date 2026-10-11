const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentRequest = require('../models/PaymentRequest');
const AuditLog = require('../models/AuditLog');
const paymentService = require('../services/paymentService');
const navService = require('../services/navService');
const emailService = require('../services/emailService');

const MIN_DEPOSIT = 100;
const MOCK_AUTO_COMPLETE_AFTER_MS = 12 * 1000; // 12 seconds

// ============================================================
// INITIATE DEPOSIT (called by dashboard)
// ============================================================
exports.initiateDeposit = async (req, res) => {
    try {
        const { amount, phoneNumber } = req.body;

        if (!amount || amount < MIN_DEPOSIT) {
            return res.status(400).json({ error: 'Minimum deposit is KES ' + MIN_DEPOSIT + '.' });
        }

        // Normalize phone number
        let cleanPhone = (phoneNumber || req.user.phoneNumber || '').replace(/\s/g, '');
        if (!cleanPhone.startsWith('+')) {
            cleanPhone = cleanPhone.startsWith('254') ? '+' + cleanPhone : '+254' + cleanPhone.replace(/^0/, '');
        }

        // Generate unique reference
        let reference;
        let isUnique = false;
        while (!isUnique) {
            reference = PaymentRequest.generateReference();
            const exists = await PaymentRequest.findOne({ reference });
            if (!exists) isUnique = true;
        }

        // Create PaymentRequest
        const paymentRequest = new PaymentRequest({
            userId: req.user.id,
            accountNumber: req.user.accountNumber,
            phoneNumber: cleanPhone,
            amount: Number(amount),
            reference,
            gateway: paymentService.ACTIVE_GATEWAY,
            status: 'pending'
        });

        // Call gateway
        try {
            const result = await paymentService.initiateSTKPush({
                phoneNumber: cleanPhone,
                amount: Number(amount),
                reference
            });

            paymentRequest.checkoutRequestId = result.checkoutRequestId;
            paymentRequest.merchantRequestId = result.merchantRequestId;
            paymentRequest.gatewayResponse = result.raw || {};
            await paymentRequest.save();

            console.log('[PAYMENT] Deposit initiated for ' + req.user.accountNumber + ' — Ref: ' + reference);

            res.status(201).json({
                message: 'Payment prompt sent. Check your phone.',
                paymentId: paymentRequest._id,
                reference,
                amount: paymentRequest.amount,
                phoneNumber: cleanPhone,
                gateway: paymentService.ACTIVE_GATEWAY,
                expiresIn: 90
            });
        } catch (gatewayErr) {
            paymentRequest.status = 'failed';
            paymentRequest.failureReason = 'Gateway error: ' + gatewayErr.message;
            paymentRequest.resolutionSource = 'auto';
            paymentRequest.resolutionReason = 'Gateway dispatch failed';
            await paymentRequest.save();
            console.error('[PAYMENT] Gateway error:', gatewayErr.message);
            return res.status(502).json({ error: 'Payment gateway unavailable. Try again.' });
        }
    } catch (error) {
        console.error('Initiate deposit error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// POLL STATUS (called by dashboard every few seconds)
// ============================================================
exports.getPaymentStatus = async (req, res) => {
    try {
        const { paymentId } = req.params;

        let paymentRequest = await PaymentRequest.findOne({
            _id: paymentId,
            userId: req.user.id
        });

        if (!paymentRequest) {
            return res.status(404).json({ error: 'Payment not found.' });
        }

        // In mock mode: auto-complete after N seconds to simulate customer action
        if (paymentRequest.status === 'pending' &&
            paymentRequest.gateway === 'mock' &&
            Date.now() - new Date(paymentRequest.createdAt).getTime() > MOCK_AUTO_COMPLETE_AFTER_MS) {

            const result = paymentService.simulateMockCompletion(paymentRequest);
            if (result.status === 'completed') {
                paymentRequest = await completePayment(
                    paymentRequest,
                    result.gatewayReceipt,
                    result.raw,
                    { source: 'auto' }
                );
            } else {
                paymentRequest.status = 'failed';
                paymentRequest.failureReason = result.failureReason;
                paymentRequest.gatewayResponse = result.raw || {};
                paymentRequest.resolutionSource = 'auto';
                paymentRequest.resolutionReason = result.failureReason || null;
                await paymentRequest.save();
            }
        }

        // Timeout after 2 minutes
        if (paymentRequest.status === 'pending' &&
            Date.now() - new Date(paymentRequest.createdAt).getTime() > 120 * 1000) {
            paymentRequest.status = 'timeout';
            paymentRequest.failureReason = 'No response from customer';
            paymentRequest.resolutionSource = 'timeout';
            paymentRequest.resolutionReason = 'No response from customer';
            await paymentRequest.save();
        }

        res.json({
            paymentId: paymentRequest._id,
            reference: paymentRequest.reference,
            amount: paymentRequest.amount,
            status: paymentRequest.status,
            gatewayReceipt: paymentRequest.gatewayReceipt,
            failureReason: paymentRequest.failureReason,
            unitsCredited: paymentRequest.unitsCredited,
            portfolioAfter: paymentRequest.portfolioAfter,
            completedAt: paymentRequest.completedAt
        });
    } catch (error) {
        console.error('Get payment status error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// INTERNAL: Complete a payment (credit the user)
// Idempotent via atomic status flip — safe to call concurrently
// ============================================================
async function completePayment(paymentRequest, gatewayReceipt, rawData, context) {
    context = context || {};

    // ATOMIC LOCK: only one caller can flip pending → completed.
    // Any concurrent caller (mock timer, admin click, webhook) sees null and bails.
    const locked = await PaymentRequest.findOneAndUpdate(
        { _id: paymentRequest._id, status: 'pending' },
        {
            $set: {
                status: 'completed',
                completedAt: new Date(),
                gatewayReceipt: gatewayReceipt || 'N/A',
                resolutionSource: context.source || 'auto',
                resolvedBy: context.adminId || null,
                resolutionReason: context.reason || null
            }
        },
        { new: true }
    );

    if (!locked) {
        console.log('[PAYMENT] Already resolved — skipping credit:', paymentRequest.reference);
        // Return the current persisted state so the caller has fresh data
        return await PaymentRequest.findById(paymentRequest._id);
    }

    // From here on, we own this payment. Credit the user.
    const user = await User.findById(locked.userId);
    if (!user) {
        locked.status = 'failed';
        locked.failureReason = 'User not found';
        await locked.save();
        return locked;
    }

    const currentNav = await navService.getCurrentNav();
    const unitsToCredit = locked.amount / currentNav;

    user.unitsHeld = (user.unitsHeld || 0) + unitsToCredit;
    user.portfolioValue = user.unitsHeld * currentNav;
    await user.save();

    // Attach credit metadata to the payment record
    locked.navAtDeposit = currentNav;
    locked.unitsCredited = unitsToCredit;
    locked.portfolioAfter = user.portfolioValue;
    if (rawData) locked.gatewayResponse = rawData;
    await locked.save();

    // Transaction record
    await Transaction.create({
        userId: user._id,
        accountNumber: user.accountNumber,
        type: 'deposit',
        amount: locked.amount,
        unitsAffected: unitsToCredit,
        navAtTransaction: currentNav,
        portfolioAfter: user.portfolioValue,
        description: 'Deposit via ' + locked.gateway.toUpperCase(),
        reference: locked.reference
    });

    // Audit log — distinguish admin-triggered from system-triggered
    const source = context.source || 'auto';
    const isAdmin = source === 'admin_manual';
    await AuditLog.create({
        adminId: isAdmin ? context.adminId : user._id,
        adminName: isAdmin ? context.adminName : (source === 'webhook' ? 'System (Webhook)' : 'System (Auto)'),
        adminRole: isAdmin ? context.adminRole : 'operations',
        action: isAdmin ? 'Manual Deposit Confirm' : 'Auto Deposit',
        details: user.fullName + ': KES ' + locked.amount.toFixed(2) +
                 ' credited — Ref ' + locked.reference +
                 (isAdmin && context.reason ? ' — Reason: ' + context.reason : ''),
        targetUserId: user._id,
        ipAddress: isAdmin ? (context.ip || 'unknown') : 'system'
    });

    // Confirmation email
    if (user.email) {
        try {
            await emailService.sendDepositConfirmationEmail(user, locked.amount, user.portfolioValue);
        } catch (e) {
            console.warn('Deposit email failed:', e.message);
        }
    }

    console.log('[PAYMENT] ✅ Completed ' + locked.reference + ' — KES ' + locked.amount +
        ' for ' + user.accountNumber + ' (+ ' + unitsToCredit.toFixed(4) + ' units) [' + source + ']');

    return locked;
}

// ============================================================
// WEBHOOK — receives callback from Tuma/Daraja
// ============================================================
exports.webhook = async (req, res) => {
    try {
        // Always respond 200 immediately (gateways retry on non-200)
        res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

        const body = req.body || {};
        console.log('[WEBHOOK] Received:', JSON.stringify(body).slice(0, 500));

        // Verify signature (currently pass-through)
        if (!paymentService.verifyWebhook(req)) {
            console.warn('[WEBHOOK] Signature verification failed');
            return;
        }

        // Extract identifiers — depends on gateway
        let checkoutRequestId = null;
        let resultCode = null;
        let receipt = null;
        let failReason = null;

        // Tuma / Daraja style
        if (body.Body && body.Body.stkCallback) {
            const cb = body.Body.stkCallback;
            checkoutRequestId = cb.CheckoutRequestID;
            resultCode = cb.ResultCode;
            if (cb.CallbackMetadata && cb.CallbackMetadata.Item) {
                cb.CallbackMetadata.Item.forEach(function (item) {
                    if (item.Name === 'MpesaReceiptNumber') receipt = item.Value;
                });
            }
            failReason = cb.ResultDesc;
        } else if (body.checkout_request_id) {
            // Tuma flat style
            checkoutRequestId = body.checkout_request_id;
            resultCode = body.status === 'success' ? 0 : 1;
            receipt = body.receipt || body.mpesa_receipt;
            failReason = body.message;
        } else if (body.reference) {
            // Custom gateways that send our own reference
            const paymentRequest = await PaymentRequest.findOne({ reference: body.reference });
            if (paymentRequest && body.status === 'success') {
                await completePayment(paymentRequest, body.receipt, body, { source: 'webhook' });
            }
            return;
        }

        if (!checkoutRequestId) {
            console.warn('[WEBHOOK] No checkoutRequestId found in payload');
            return;
        }

        // Find the payment
        const paymentRequest = await PaymentRequest.findOne({ checkoutRequestId });
        if (!paymentRequest) {
            console.warn('[WEBHOOK] No PaymentRequest for checkoutRequestId:', checkoutRequestId);
            return;
        }

        // Handle result
        if (resultCode === 0 || resultCode === '0') {
            await completePayment(paymentRequest, receipt || 'N/A', body, { source: 'webhook' });
        } else {
            paymentRequest.status = 'failed';
            paymentRequest.failureReason = failReason || 'Payment cancelled by user';
            paymentRequest.gatewayResponse = body;
            paymentRequest.resolutionSource = 'webhook';
            paymentRequest.resolutionReason = failReason || 'Payment cancelled by user';
            await paymentRequest.save();
            console.log('[WEBHOOK] Payment failed:', paymentRequest.reference, failReason);
        }
    } catch (error) {
        console.error('[WEBHOOK] Error:', error);
        // Response already sent above
    }
};

// ============================================================
// ADMIN: Get pending payments
// ============================================================
exports.getPendingPayments = async (req, res) => {
    try {
        const payments = await PaymentRequest.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('userId', 'fullName phoneNumber accountNumber email');

        const recentCompleted = await PaymentRequest.find({ status: 'completed' })
            .sort({ completedAt: -1 })
            .limit(20)
            .populate('userId', 'fullName phoneNumber accountNumber');

        res.json({
            pending: payments,
            recentCompleted: recentCompleted,
            pendingCount: payments.length
        });
    } catch (error) {
        console.error('Get pending payments error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// DEV: Manually trigger a mock payment completion
// (only works when gateway is mock; user-scoped)
// ============================================================
exports.mockConfirm = async (req, res) => {
    try {
        const { paymentId } = req.params;

        if (paymentService.ACTIVE_GATEWAY !== 'mock') {
            return res.status(400).json({ error: 'Mock endpoint only works when PAYMENT_GATEWAY=mock' });
        }

        const paymentRequest = await PaymentRequest.findById(paymentId);
        if (!paymentRequest) {
            return res.status(404).json({ error: 'Payment not found.' });
        }

        if (paymentRequest.status !== 'pending') {
            return res.status(400).json({ error: 'Payment already ' + paymentRequest.status });
        }

        const completed = await completePayment(
            paymentRequest,
            'MOCK-MANUAL-' + Date.now(),
            { manual: true, confirmedAt: new Date() },
            { source: 'mock_manual' }
        );

        res.json({
            message: 'Payment manually confirmed.',
            paymentId: completed._id,
            status: completed.status,
            unitsCredited: completed.unitsCredited
        });
    } catch (error) {
        console.error('Mock confirm error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADMIN: Manually confirm a pending payment (credits the user)
// For edge cases where the gateway callback was missed.
// ============================================================
exports.confirmPaymentManually = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { reason } = req.body || {};

        const paymentRequest = await PaymentRequest.findById(paymentId);
        if (!paymentRequest) {
            return res.status(404).json({ error: 'Payment not found.' });
        }
        if (paymentRequest.status !== 'pending') {
            return res.status(409).json({ error: 'Payment already ' + paymentRequest.status + '.' });
        }

        const completed = await completePayment(
            paymentRequest,
            'ADMIN-MANUAL-' + Date.now(),
            {
                manual: true,
                confirmedBy: req.user._id,
                confirmedAt: new Date(),
                reason: reason || null
            },
            {
                source: 'admin_manual',
                adminId: req.user._id,
                adminName: req.user.fullName,
                adminRole: req.user.role,
                reason: reason || null,
                ip: req.ip
            }
        );

        if (completed.status !== 'completed') {
            // completePayment failed somewhere after the lock (e.g. user missing)
            return res.status(500).json({
                error: 'Payment could not be completed: ' + (completed.failureReason || 'unknown error')
            });
        }

        res.json({
            message: 'Payment confirmed and user credited.',
            paymentId: completed._id,
            reference: completed.reference,
            status: completed.status,
            unitsCredited: completed.unitsCredited
        });
    } catch (error) {
        console.error('Confirm payment manually error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADMIN: Manually fail a pending payment (no credit)
// ============================================================
exports.failPaymentManually = async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { reason } = req.body || {};

        const paymentRequest = await PaymentRequest.findById(paymentId);
        if (!paymentRequest) {
            return res.status(404).json({ error: 'Payment not found.' });
        }
        if (paymentRequest.status !== 'pending') {
            return res.status(409).json({ error: 'Payment already ' + paymentRequest.status + '.' });
        }

        // Atomic flip so a concurrent mock/webhook can't complete it after we fail it
        const updated = await PaymentRequest.findOneAndUpdate(
            { _id: paymentId, status: 'pending' },
            {
                $set: {
                    status: 'failed',
                    failureReason: reason || 'Marked failed by admin',
                    resolutionSource: 'admin_manual',
                    resolvedBy: req.user._id,
                    resolutionReason: reason || null,
                    gatewayResponse: {
                        manual: true,
                        failedBy: req.user._id,
                        failedAt: new Date(),
                        reason: reason || null
                    }
                }
            },
            { new: true }
        );

        if (!updated) {
            return res.status(409).json({
                error: 'Payment was resolved concurrently. Refresh and try again.'
            });
        }

        await AuditLog.create({
            adminId: req.user._id,
            adminName: req.user.fullName,
            adminRole: req.user.role,
            action: 'Manual Deposit Fail',
            details: 'Marked ' + updated.reference + ' (KES ' + updated.amount.toFixed(2) +
                     ') as failed' + (reason ? ' — Reason: ' + reason : ''),
            targetUserId: updated.userId,
            ipAddress: req.ip || 'unknown'
        });

        res.json({
            message: 'Payment marked as failed.',
            paymentId: updated._id,
            reference: updated.reference,
            status: updated.status
        });
    } catch (error) {
        console.error('Fail payment manually error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};