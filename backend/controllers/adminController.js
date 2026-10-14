const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const FundPerformance = require('../models/FundPerformance');
const InterestAccrual = require('../models/InterestAccrual');
const TaxLiability = require('../models/TaxLiability');
const emailService = require('../services/emailService');
const navService = require('../services/navService');
const interestService = require('../services/interestService');

const SUPPORT_EMAIL = 'info@rockwininvestment.com';

// ============================================================
// LIST INVESTORS
// ============================================================
exports.getUsers = async (req, res) => {
    try {
        const { search, status, risk, limit = 50, page = 1 } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search } },
                { email: { $regex: search, $options: 'i' } },
                { idNumber: { $regex: search } },
                { accountNumber: { $regex: search, $options: 'i' } }
            ];
        }
        if (status) query.status = status;
        if (risk) query.risk = risk;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        const total = await User.countDocuments(query);

        res.json({
            users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// SINGLE INVESTOR DETAIL
// ============================================================
exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        const transactions = await Transaction.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .limit(10);
        const accruals = await InterestAccrual.find({ userId: user._id })
            .sort({ accrualDate: -1 })
            .limit(10);

        res.json({ user, transactions, accruals });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// ADJUST INVESTOR PORTFOLIO
// ============================================================
exports.updatePortfolio = async (req, res) => {
    try {
        const { id } = req.params;
        const { adjustmentType, adjustmentAmount, reason, sendEmail } = req.body;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        const currentNav = await navService.getCurrentNav();
        let unitsDelta = 0;
        let txType = 'adjustment';

        if (adjustmentType === 'credit') {
            unitsDelta = adjustmentAmount / currentNav;
            user.unitsHeld += unitsDelta;
            txType = 'deposit';
        } else if (adjustmentType === 'debit') {
            const unitsToRemove = Math.min(adjustmentAmount / currentNav, user.unitsHeld);
            unitsDelta = -unitsToRemove;
            user.unitsHeld = Math.max(0, user.unitsHeld - unitsToRemove);
            txType = 'redemption';
        } else if (adjustmentType === 'interest') {
            unitsDelta = adjustmentAmount / currentNav;
            user.unitsHeld += unitsDelta;
            txType = 'interest';
            user.ytdInterestEarned = (user.ytdInterestEarned || 0) + adjustmentAmount;
            user.lifetimeInterestEarned = (user.lifetimeInterestEarned || 0) + adjustmentAmount;
        } else if (adjustmentType === 'override') {
            user.unitsHeld = adjustmentAmount / currentNav;
            unitsDelta = user.unitsHeld;
        } else {
            return res.status(400).json({ error: 'Invalid adjustment type.' });
        }

        user.portfolioValue = user.unitsHeld * currentNav;
        await user.save();

        await Transaction.create({
            userId: user._id,
            accountNumber: user.accountNumber,
            type: txType,
            amount: adjustmentAmount || Math.abs(unitsDelta * currentNav),
            unitsAffected: unitsDelta,
            navAtTransaction: currentNav,
            portfolioAfter: user.portfolioValue,
            description: reason || 'Admin ' + adjustmentType,
            reference: 'ADMIN-' + Date.now()
        });

        await AuditLog.create({
            adminId: req.user.id,
            adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations',
            action: 'Portfolio Update',
            details: user.fullName + ': ' + adjustmentType + ' KES ' + adjustmentAmount + ' → New: KES ' + user.portfolioValue.toFixed(2),
            targetUserId: user._id,
            ipAddress: req.ip
        });

        if (sendEmail !== false && user.email) {
            try {
                if (adjustmentType === 'credit') {
                    await emailService.sendDepositConfirmationEmail(user, adjustmentAmount, user.portfolioValue);
                } else if (adjustmentType === 'debit') {
                    await emailService.sendWithdrawalConfirmationEmail(user, adjustmentAmount, user.portfolioValue);
                } else if (adjustmentType === 'interest') {
                    await emailService.sendInterestCreditEmail(user, adjustmentAmount, user.portfolioValue);
                } else {
                    await emailService.sendEmail(
                        user.email,
                        'RockWin Investment — Portfolio Adjusted',
                        '<div style="background: #F5F1E8; padding: 40px 20px; font-family: Inter, Arial, sans-serif;">' +
                        '<div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E8E3D6; border-radius: 10px; padding: 32px 28px;">' +
                        '<h1 style="color: #0F1A14; font-size: 22px; font-weight: 500; margin: 0 0 20px;">Portfolio adjusted</h1>' +
                        '<p style="color: #4A534D; font-size: 15px; line-height: 1.65;">Hi ' + (user.fullName || 'Investor').split(' ')[0] + ',</p>' +
                        '<p style="color: #4A534D; font-size: 15px; line-height: 1.65;">Your portfolio has been adjusted to <strong style="color: #0F1A14;">KES ' + user.portfolioValue.toFixed(2) + '</strong>.</p>' +
                        '<p style="color: #4A534D; font-size: 15px; line-height: 1.65;">If you have questions, reply to this email or contact ' + SUPPORT_EMAIL + '.</p>' +
                        '</div></div>'
                    );
                }
            } catch (e) {
                console.warn('Portfolio email failed:', e.message);
            }
        }

        res.json({
            message: 'Portfolio updated.',
            user: {
                id: user._id,
                fullName: user.fullName,
                accountNumber: user.accountNumber,
                portfolioValue: user.portfolioValue,
                unitsHeld: user.unitsHeld
            }
        });
    } catch (error) {
        console.error('Update portfolio error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// SET YIELD RATE
// Accepts either `newYield` (backend convention) or
// `annualYield` (frontend convention) so both work.
// ============================================================
exports.setYieldRate = async (req, res) => {
    try {
        const { reason } = req.body;
        const newYield = req.body.newYield !== undefined ? req.body.newYield : req.body.annualYield;

        if (newYield === undefined || newYield === null) {
            return res.status(400).json({ error: 'Yield value is required.' });
        }

        const yieldDecimal = parseFloat(newYield) / 100;
        if (isNaN(yieldDecimal) || yieldDecimal < 0 || yieldDecimal > 0.30) {
            return res.status(400).json({ error: 'Yield must be between 0% and 30%.' });
        }

        const currentNav = await navService.getCurrentNav();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await FundPerformance.findOneAndUpdate(
            { date: today },
            {
                date: today,
                navPerUnit: currentNav,
                dailyYieldRate: yieldDecimal / 365,
                annualYieldRate: yieldDecimal
            },
            { upsert: true, new: true }
        );

        await AuditLog.create({
            adminId: req.user.id,
            adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations',
            action: 'Set Yield Rate',
            details: 'Yield → ' + newYield + '% p.a. Reason: ' + (reason || 'Not provided'),
            ipAddress: req.ip
        });

        res.json({ message: 'Yield rate updated.', yield: newYield + '% p.a.' });
    } catch (error) {
        console.error('Set yield error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// RUN INTEREST ACCRUAL
// ============================================================
exports.runAccrual = async (req, res) => {
    try {
        const result = await interestService.runDailyAccrual();

        await AuditLog.create({
            adminId: req.user.id,
            adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations',
            action: 'Run Interest Accrual',
            details: result.successCount + ' investors, KES ' + result.totalNet.toFixed(2) + ' net, KES ' + result.totalTax.toFixed(2) + ' withheld',
            ipAddress: req.ip
        });

        res.json({ message: 'Accrual complete.', ...result });
    } catch (error) {
        console.error('Run accrual error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// FUND-LEVEL STATS (yield, AUM, units outstanding)
// ============================================================
exports.getFundStats = async (req, res) => {
    try {
        const totalInvestors = await User.countDocuments();
        const activeInvestors = await User.countDocuments({ status: 'active' });
        const suspendedAccounts = await User.countDocuments({ status: 'suspended' });
        const pendingKyc = await User.countDocuments({ status: 'pending' });

        const aumAgg = await User.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: null, aum: { $sum: '$portfolioValue' }, units: { $sum: '$unitsHeld' } } }
        ]);

        const aum = (aumAgg[0] && aumAgg[0].aum) || 0;
        const totalUnits = (aumAgg[0] && aumAgg[0].units) || 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayInterest = await InterestAccrual.aggregate([
            { $match: { accrualDate: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$netInterest' }, tax: { $sum: '$taxWithheld' } } }
        ]);

        const currentYield = await navService.getCurrentYield();
        const currentNav = await navService.getCurrentNav();

        res.json({
            totalInvestors,
            activeInvestors,
            suspendedAccounts,
            pendingKyc,
            totalAUM: aum,
            totalUnitsOutstanding: totalUnits,
            currentYield: currentYield * 100,
            currentNav,
            todayInterestCredited: (todayInterest[0] && todayInterest[0].total) || 0,
            todayTaxWithheld: (todayInterest[0] && todayInterest[0].tax) || 0
        });
    } catch (error) {
        console.error('Get fund stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// FUND PERFORMANCE HISTORY
// ============================================================
exports.getFundPerformance = async (req, res) => {
    try {
        const history = await navService.getFundPerformance(90);
        res.json({ history });
    } catch (error) {
        console.error('Get fund performance error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// DASHBOARD STATS — powers the top row of stat cards
// Returns all keys the frontend expects, including
// interestAccruedToday which was missing before.
// ============================================================
exports.getStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [totalUsers, activeUsers, suspendedUsers, pendingUsers, aumAgg, newAccountsToday, highRisk] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ status: 'active' }),
            User.countDocuments({ status: 'suspended' }),
            User.countDocuments({ status: 'pending' }),
            User.aggregate([{ $group: { _id: null, total: { $sum: '$portfolioValue' } } }]),
            User.countDocuments({ createdAt: { $gte: today } }),
            User.countDocuments({ risk: 'high' })
        ]);

        const totalBalance = (aumAgg[0] && aumAgg[0].total) || 0;

        // Today's transaction activity — grouped by type, sums amounts
        const txAgg = await Transaction.aggregate([
            { $match: { createdAt: { $gte: today } } },
            { $group: { _id: '$type', amount: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]);

        let todayDeposits = 0;
        let todayDepositsCount = 0;
        let todayWithdrawals = 0;
        let todayWithdrawalsCount = 0;
        let interestAccruedToday = 0;

        txAgg.forEach((row) => {
            if (row._id === 'deposit')     { todayDeposits = row.amount;      todayDepositsCount = row.count; }
            if (row._id === 'redemption')  { todayWithdrawals = row.amount;   todayWithdrawalsCount = row.count; }
            if (row._id === 'interest')    { interestAccruedToday = row.amount; }
        });

        res.json({
            totalUsers,
            activeUsers,
            suspendedUsers,
            pendingUsers,
            totalBalance,
            todayDeposits,
            todayDepositsCount,
            todayWithdrawals,
            todayWithdrawalsCount,
            interestAccruedToday,
            newAccountsToday,
            highRisk
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// UPDATE STATUS (active / suspended / pending)
// ============================================================
exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (['active', 'suspended', 'pending'].indexOf(status) === -1) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        const user = await User.findByIdAndUpdate(id, { status }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        await AuditLog.create({
            adminId: req.user.id,
            adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations',
            action: 'Status Change',
            details: user.fullName + ': Status → ' + status,
            targetUserId: user._id,
            ipAddress: req.ip
        });

        res.json({ message: 'Status updated.', user });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// FREEZE USER (shortcut for suspension)
// ============================================================
exports.freezeUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByIdAndUpdate(id, { status: 'suspended' }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        await AuditLog.create({
            adminId: req.user.id,
            adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations',
            action: 'Account Freeze',
            details: user.fullName + ': Frozen by ' + req.user.role,
            targetUserId: user._id,
            ipAddress: req.ip
        });

        if (user.email) {
            try {
                await emailService.sendEmail(
                    user.email,
                    'RockWin Investment — Account Suspended',
                    '<div style="background: #F5F1E8; padding: 40px 20px; font-family: Inter, Arial, sans-serif;">' +
                    '<div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E8E3D6; border-radius: 10px; padding: 32px 28px;">' +
                    '<h1 style="color: #8A3A2E; font-size: 22px; font-weight: 500; margin: 0 0 20px;">Account suspended</h1>' +
                    '<p style="color: #4A534D; font-size: 15px; line-height: 1.65;">Hi ' + (user.fullName || 'Investor').split(' ')[0] + ',</p>' +
                    '<p style="color: #4A534D; font-size: 15px; line-height: 1.65;">Your RockWin Investment account (' + user.accountNumber + ') has been suspended.</p>' +
                    '<p style="color: #4A534D; font-size: 15px; line-height: 1.65;">Contact us at <a href="mailto:' + SUPPORT_EMAIL + '" style="color: #1B4332;">' + SUPPORT_EMAIL + '</a> if you have questions.</p>' +
                    '</div></div>'
                );
            } catch (e) {
                console.warn('Suspension email failed:', e.message);
            }
        }

        res.json({ message: 'Account frozen.', user });
    } catch (error) {
        console.error('Freeze user error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// BROADCAST EMAIL
// Accepts either { recipients: [emails], targetAll: true }
// or { phone: "+254...", targetAll: false } for a single user.
// Subject defaults if not supplied.
// ============================================================
exports.broadcastEmail = async (req, res) => {
    try {
        const { recipients, phone, message, targetAll } = req.body;
        const subject = req.body.subject || 'RockWin Investment — Update';

        if (!message) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        let users = [];
        if (targetAll) {
            users = await User.find({ status: 'active' }).select('fullName email');
        } else if (phone) {
            users = await User.find({ phoneNumber: phone }).select('fullName email');
        } else if (recipients && recipients.length > 0) {
            users = await User.find({ email: { $in: recipients } }).select('fullName email');
        } else {
            return res.status(400).json({ error: 'No recipients specified.' });
        }

        if (!users.length) {
            return res.status(404).json({ error: 'No matching recipients found.' });
        }

        const results = [];
        for (const user of users) {
            try {
                const result = await emailService.sendBroadcastEmail(user, subject, message);
                results.push({ email: user.email, success: result.success });
            } catch (e) {
                results.push({ email: user.email, success: false, error: e.message });
            }
        }

        await AuditLog.create({
            adminId: req.user.id,
            adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations',
            action: 'Email Broadcast',
            details: 'Sent to ' + users.length + ' investors: "' + subject + '"',
            ipAddress: req.ip
        });

        res.json({
            message: 'Broadcast sent.',
            recipientCount: users.length,
            total: users.length,
            results
        });
    } catch (error) {
        console.error('Broadcast email error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// AUDIT LOG
// ============================================================
exports.getAuditLog = async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AuditLog.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('targetUserId', 'fullName phoneNumber accountNumber');

        const total = await AuditLog.countDocuments();

        res.json({
            logs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get audit log error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

// ============================================================
// TAX SUMMARY — sums the daily TaxLiability records
// ============================================================
exports.getTaxSummary = async (req, res) => {
    try {
        const { from, to } = req.query;
        const match = {};
        if (from || to) {
            match.date = {};
            if (from) match.date.$gte = new Date(from);
            if (to)   match.date.$lte = new Date(to);
        }

        const agg = await TaxLiability.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    grossInterest: { $sum: '$grossInterest' },
                    taxWithheld:   { $sum: '$taxWithheld' },
                    netInterest:   { $sum: '$netInterest' },
                    usersAccrued:  { $sum: '$usersAccrued' },
                    days:          { $sum: 1 }
                }
            }
        ]);

        res.json(agg[0] || { grossInterest: 0, taxWithheld: 0, netInterest: 0, usersAccrued: 0, days: 0 });
    } catch (error) {
        console.error('Tax summary error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};