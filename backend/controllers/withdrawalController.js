const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const AuditLog = require('../models/AuditLog');
const navService = require('../services/navService');
const emailService = require('../services/emailService');

const MIN_REDEMPTION = 1000;
const MIN_REMAINING_BALANCE = 0; // set to 1000 if you want a floor

// ============================================================
// USER: request a withdrawal
// ============================================================
exports.requestWithdrawal = async (req, res) => {
    try {
        const { amount, destination, account, accountName } = req.body;

        if (!amount || amount < MIN_REDEMPTION) {
            return res.status(400).json({ error: 'Minimum redemption is KES ' + MIN_REDEMPTION + '.' });
        }
        if (!['mpesa', 'bank'].includes(destination)) {
            return res.status(400).json({ error: 'Invalid destination.' });
        }
        if (!account || account.length < 5) {
            return res.status(400).json({ error: 'Please provide a valid destination account.' });
        }

        const nav = await navService.getCurrentNav();
        const amountNum = Number(amount);
        const unitsToRedeem = amountNum / nav;

        // Atomic check-and-debit: only succeeds if user has enough units
        const updatedUser = await User.findOneAndUpdate(
            { _id: req.user.id, unitsHeld: { $gte: unitsToRedeem } },
            { $inc: { unitsHeld: -unitsToRedeem } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(400).json({ error: 'Insufficient balance for this redemption.' });
        }

        // Recompute portfolio value from the new unit count
        updatedUser.portfolioValue = updatedUser.unitsHeld * nav;
        await updatedUser.save();

        // Unique reference
        let reference;
        let unique = false;
        while (!unique) {
            reference = Withdrawal.generateReference();
            const exists = await Withdrawal.findOne({ reference });
            if (!exists) unique = true;
        }

        // Create the withdrawal record
        const withdrawal = await Withdrawal.create({
            userId: updatedUser._id,
            accountNumber: updatedUser.accountNumber,
            reference,
            amount: amountNum,
            destination,
            destinationAccount: account,
            destinationName: accountName || null,
            unitsRedeemed: unitsToRedeem,
            navAtRequest: nav,
            portfolioAfter: updatedUser.portfolioValue,
            status: 'pending'
        });

        // Ledger entry — appears as a debit while admin reviews
        await Transaction.create({
            userId: updatedUser._id,
            accountNumber: updatedUser.accountNumber,
            type: 'redemption',
            amount: amountNum,
            unitsAffected: -unitsToRedeem,
            navAtTransaction: nav,
            portfolioAfter: updatedUser.portfolioValue,
            description: 'Redemption to ' + destination.toUpperCase() + ' (pending approval)',
            reference
        });

        // Audit log
        await AuditLog.create({
            adminId: updatedUser._id,
            adminName: 'System (User Request)',
            adminRole: 'user',
            action: 'Withdrawal Request',
            details: updatedUser.fullName + ' requested KES ' + amountNum.toFixed(2) +
                     ' to ' + destination.toUpperCase() + ' — Ref ' + reference,
            targetUserId: updatedUser._id,
            ipAddress: req.ip || 'unknown'
        });

        // Email confirmation to user
        if (updatedUser.email && updatedUser.emailAlertsEnabled !== false) {
            try {
                await emailService.sendEmail(
                    updatedUser.email,
                    'Redemption request received — ' + reference,
                    '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                    '<h1 style="color: #006d32; font-size: 24px;">Redemption request received</h1>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Hi ' + (updatedUser.fullName || 'Investor').split(' ')[0] + ',</p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">We received your redemption request for <strong>KES ' + amountNum.toFixed(2) + '</strong> to your ' + destination.toUpperCase() + ' account.</p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Reference: <strong>' + reference + '</strong></p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Funds are typically disbursed within 24–48 hours. We\'ll email you once the transfer is complete.</p>' +
                    '</div>'
                );
            } catch (e) {
                console.warn('Withdrawal request email failed:', e.message);
            }
        }

        console.log('[WITHDRAWAL] Request ' + reference + ' — KES ' + amountNum + ' for ' + updatedUser.accountNumber);

        res.status(201).json({
            message: 'Redemption request submitted.',
            withdrawalId: withdrawal._id,
            reference,
            amount: amountNum,
            destination,
            status: withdrawal.status
        });
    } catch (error) {
        console.error('Request withdrawal error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// USER: list own withdrawals
// ============================================================
exports.getMyWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ userId: req.user.id })
            .sort({ requestedAt: -1 })
            .limit(50);
        res.json({ withdrawals });
    } catch (error) {
        console.error('Get my withdrawals error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// USER: cancel a pending request
// ============================================================
exports.cancelWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;

        // Only allow cancel if still pending
        const withdrawal = await Withdrawal.findOneAndUpdate(
            { _id: id, userId: req.user.id, status: 'pending' },
            { $set: { status: 'cancelled', reviewedAt: new Date() } },
            { new: true }
        );

        if (!withdrawal) {
            return res.status(400).json({ error: 'Request cannot be cancelled.' });
        }

        // Restore units to the user
        const user = await User.findById(req.user.id);
        if (user) {
            user.unitsHeld = (user.unitsHeld || 0) + withdrawal.unitsRedeemed;
            user.portfolioValue = user.unitsHeld * withdrawal.navAtRequest;
            await user.save();
        }

        res.json({ message: 'Redemption request cancelled.', withdrawal });
    } catch (error) {
        console.error('Cancel withdrawal error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADMIN: list pending
// ============================================================
exports.getPendingWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({ status: { $in: ['pending', 'approved'] } })
            .sort({ requestedAt: 1 })
            .limit(100)
            .populate('userId', 'fullName phoneNumber accountNumber email portfolioValue');

        res.json({
            withdrawals,
            pendingCount: withdrawals.filter(w => w.status === 'pending').length,
            approvedCount: withdrawals.filter(w => w.status === 'approved').length
        });
    } catch (error) {
        console.error('Get pending withdrawals error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADMIN: full history
// ============================================================
exports.getAllWithdrawals = async (req, res) => {
    try {
        const withdrawals = await Withdrawal.find({})
            .sort({ requestedAt: -1 })
            .limit(200)
            .populate('userId', 'fullName accountNumber')
            .populate('reviewedBy', 'fullName');
        res.json({ withdrawals });
    } catch (error) {
        console.error('Get all withdrawals error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADMIN: approve (units already debited; nothing moves yet)
// ============================================================
exports.approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { note } = req.body || {};

        const withdrawal = await Withdrawal.findOneAndUpdate(
            { _id: id, status: 'pending' },
            {
                $set: {
                    status: 'approved',
                    reviewedBy: req.user._id,
                    reviewedAt: new Date(),
                    reviewNote: note || null
                }
            },
            { new: true }
        );

        if (!withdrawal) {
            return res.status(400).json({ error: 'Request not found or already processed.' });
        }

        await AuditLog.create({
            adminId: req.user._id,
            adminName: req.user.fullName,
            adminRole: req.user.role,
            action: 'Withdrawal Approved',
            details: 'Approved ' + withdrawal.reference + ' — KES ' + withdrawal.amount.toFixed(2) +
                     ' to ' + withdrawal.destination.toUpperCase() + ': ' + withdrawal.destinationAccount +
                     (note ? ' — Note: ' + note : ''),
            targetUserId: withdrawal.userId,
            ipAddress: req.ip || 'unknown'
        });

        res.json({ message: 'Withdrawal approved. Send the funds manually, then mark it as paid.', withdrawal });
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADMIN: reject (restore user's units)
// ============================================================
exports.rejectWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body || {};

        const withdrawal = await Withdrawal.findOneAndUpdate(
            { _id: id, status: { $in: ['pending', 'approved'] } },
            {
                $set: {
                    status: 'rejected',
                    reviewedBy: req.user._id,
                    reviewedAt: new Date(),
                    rejectionReason: reason || 'No reason provided'
                }
            },
            { new: true }
        );

        if (!withdrawal) {
            return res.status(400).json({ error: 'Request not found or already processed.' });
        }

        // Restore units
        const user = await User.findById(withdrawal.userId);
        if (user) {
            user.unitsHeld = (user.unitsHeld || 0) + withdrawal.unitsRedeemed;
            user.portfolioValue = user.unitsHeld * withdrawal.navAtRequest;
            await user.save();

            // Refund entry on the ledger
            await Transaction.create({
                userId: user._id,
                accountNumber: user.accountNumber,
                type: 'deposit',
                amount: withdrawal.amount,
                unitsAffected: withdrawal.unitsRedeemed,
                navAtTransaction: withdrawal.navAtRequest,
                portfolioAfter: user.portfolioValue,
                description: 'Redemption request rejected — refund',
                reference: withdrawal.reference
            });

            if (user.email && user.emailAlertsEnabled !== false) {
                try {
                    await emailService.sendEmail(
                        user.email,
                        'Redemption request declined — ' + withdrawal.reference,
                        '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                        '<h1 style="color: #8A3A2E; font-size: 24px;">Redemption declined</h1>' +
                        '<p style="color: #4a5a72; font-size: 15px;">Hi ' + (user.fullName || 'Investor').split(' ')[0] + ',</p>' +
                        '<p style="color: #4a5a72; font-size: 15px;">Your redemption request of KES ' + withdrawal.amount.toFixed(2) + ' could not be processed.</p>' +
                        '<p style="color: #4a5a72; font-size: 15px;"><strong>Reason:</strong> ' + (reason || 'Not specified') + '</p>' +
                        '<p style="color: #4a5a72; font-size: 15px;">The full amount has been returned to your portfolio. Contact support@rockwin.co.ke if you have questions.</p>' +
                        '</div>'
                    );
                } catch (e) {
                    console.warn('Rejection email failed:', e.message);
                }
            }
        }

        await AuditLog.create({
            adminId: req.user._id,
            adminName: req.user.fullName,
            adminRole: req.user.role,
            action: 'Withdrawal Rejected',
            details: 'Rejected ' + withdrawal.reference + ' (KES ' + withdrawal.amount.toFixed(2) +
                     ') — Reason: ' + (reason || 'Not specified'),
            targetUserId: withdrawal.userId,
            ipAddress: req.ip || 'unknown'
        });

        res.json({ message: 'Withdrawal rejected. Units restored.', withdrawal });
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADMIN: mark as paid (after sending money manually)
// ============================================================
exports.markPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const { paidReference, note } = req.body || {};

        if (!paidReference) {
            return res.status(400).json({ error: 'Please enter the M-PESA or bank confirmation code.' });
        }

        const withdrawal = await Withdrawal.findOneAndUpdate(
            { _id: id, status: 'approved' },
            {
                $set: {
                    status: 'paid',
                    paidAt: new Date(),
                    paidReference,
                    reviewNote: note || null
                }
            },
            { new: true }
        );

        if (!withdrawal) {
            return res.status(400).json({ error: 'Request must be approved first.' });
        }

        // Update the original redemption Transaction so the description no longer says "pending"
        await Transaction.findOneAndUpdate(
            { reference: withdrawal.reference, type: 'redemption' },
            {
                $set: {
                    description: 'Redemption to ' + withdrawal.destination.toUpperCase() +
                                 ' — ' + paidReference
                }
            }
        );

        await AuditLog.create({
            adminId: req.user._id,
            adminName: req.user.fullName,
            adminRole: req.user.role,
            action: 'Withdrawal Paid',
            details: 'Paid ' + withdrawal.reference + ' — KES ' + withdrawal.amount.toFixed(2) +
                     ' via ' + withdrawal.destination.toUpperCase() + ' — Code: ' + paidReference,
            targetUserId: withdrawal.userId,
            ipAddress: req.ip || 'unknown'
        });

        // Notify user
        const user = await User.findById(withdrawal.userId);
        if (user && user.email && user.emailAlertsEnabled !== false) {
            try {
                await emailService.sendEmail(
                    user.email,
                    'Redemption complete — KES ' + withdrawal.amount.toFixed(2),
                    '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                    '<h1 style="color: #006d32; font-size: 24px;">Redemption complete</h1>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Hi ' + (user.fullName || 'Investor').split(' ')[0] + ',</p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Your redemption of <strong>KES ' + withdrawal.amount.toFixed(2) + '</strong> has been sent to your ' + withdrawal.destination.toUpperCase() + ' account.</p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Reference: <strong>' + paidReference + '</strong></p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Thank you for saving with RockWin Investment.</p>' +
                    '</div>'
                );
            } catch (e) {
                console.warn('Paid email failed:', e.message);
            }
        }

        res.json({ message: 'Marked as paid.', withdrawal });
    } catch (error) {
        console.error('Mark paid error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};