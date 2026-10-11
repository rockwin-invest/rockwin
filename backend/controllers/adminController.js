const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const FundPerformance = require('../models/FundPerformance');
const InterestAccrual = require('../models/InterestAccrual');
const smsService = require('../services/smsService');
const navService = require('../services/navService');
const interestService = require('../services/interestService');

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
        const users = await User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
        const total = await User.countDocuments(query);

        res.json({ users, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        const transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);
        const accruals = await InterestAccrual.find({ userId: user._id }).sort({ accrualDate: -1 }).limit(10);

        res.json({ user, transactions, accruals });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.updatePortfolio = async (req, res) => {
    try {
        const { id } = req.params;
        const { adjustmentType, adjustmentAmount, reason, sendSms } = req.body;

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

        if (sendSms !== false) {
            try {
                await smsService.sendSMS(user.phoneNumber, 'RockWin: Your portfolio is now KES ' + user.portfolioValue.toFixed(2) + '. Acc: ' + user.accountNumber);
            } catch (e) { console.warn('SMS failed:', e.message); }
        }

        res.json({ message: 'Portfolio updated.', user: { id: user._id, fullName: user.fullName, accountNumber: user.accountNumber, portfolioValue: user.portfolioValue, unitsHeld: user.unitsHeld } });
    } catch (error) {
        console.error('Update portfolio error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.setYieldRate = async (req, res) => {
    try {
        const { newYield, reason } = req.body;
        const yieldDecimal = parseFloat(newYield) / 100;
        if (isNaN(yieldDecimal) || yieldDecimal < 0 || yieldDecimal > 0.30) {
            return res.status(400).json({ error: 'Yield must be between 0% and 30%.' });
        }

        const currentNav = await navService.getCurrentNav();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await FundPerformance.findOneAndUpdate(
            { date: today },
            { date: today, navPerUnit: currentNav, dailyYieldRate: yieldDecimal / 365, annualYieldRate: yieldDecimal },
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

exports.runAccrual = async (req, res) => {
    try {
        const result = await interestService.runDailyAccrual();
        await AuditLog.create({
            adminId: req.user.id,
            adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations',
            action: 'Run Interest Accrual',
            details: result.successCount + ' investors, KES ' + result.totalInterest.toFixed(2) + ' credited',
            ipAddress: req.ip
        });
        res.json({ message: 'Accrual complete.', ...result });
    } catch (error) {
        console.error('Run accrual error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

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
        const aum = aumAgg[0]?.aum || 0;
        const totalUnits = aumAgg[0]?.units || 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayInterest = await InterestAccrual.aggregate([
            { $match: { accrualDate: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$netInterest' }, tax: { $sum: '$taxWithheld' } } }
        ]);

        const currentYield = await navService.getCurrentYield();
        const currentNav = await navService.getCurrentNav();

        res.json({
            totalInvestors, activeInvestors, suspendedAccounts, pendingKyc,
            totalAUM: aum, totalUnitsOutstanding: totalUnits,
            currentYield: currentYield * 100, currentNav,
            todayInterestCredited: todayInterest[0]?.total || 0,
            todayTaxWithheld: todayInterest[0]?.tax || 0
        });
    } catch (error) {
        console.error('Get fund stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getFundPerformance = async (req, res) => {
    try {
        const history = await navService.getFundPerformance(90);
        res.json({ history });
    } catch (error) {
        console.error('Get fund performance error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['active', 'suspended', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        const user = await User.findByIdAndUpdate(id, { status }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Status Change',
            details: user.fullName + ': Status → ' + status, targetUserId: user._id, ipAddress: req.ip
        });

        res.json({ message: 'Status updated.', user });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.freezeUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByIdAndUpdate(id, { status: 'suspended' }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Account Freeze',
            details: user.fullName + ': Frozen by ' + req.user.role, targetUserId: user._id, ipAddress: req.ip
        });

        try {
            await smsService.sendSMS(user.phoneNumber, 'RockWin: Your account has been suspended. Contact support.');
        } catch (e) { console.warn('SMS failed:', e.message); }

        res.json({ message: 'Account frozen.', user });
    } catch (error) {
        console.error('Freeze user error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.broadcastSms = async (req, res) => {
    try {
        const { recipients, message, targetAll } = req.body;
        let phoneNumbers = [];

        if (targetAll) {
            const users = await User.find({ status: 'active' });
            phoneNumbers = users.map(u => u.phoneNumber);
        } else if (recipients && recipients.length > 0) {
            phoneNumbers = recipients;
        } else {
            return res.status(400).json({ error: 'No recipients specified.' });
        }

        const results = [];
        for (const phone of phoneNumbers) {
            try {
                const result = await smsService.sendSMS(phone, message);
                results.push({ phone, success: result });
            } catch (e) {
                results.push({ phone, success: false, error: e.message });
            }
        }

        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'SMS Broadcast',
            details: 'Sent to ' + phoneNumbers.length + ' investors', ipAddress: req.ip
        });

        res.json({ message: 'Broadcast sent.', total: phoneNumbers.length, results });
    } catch (error) {
        console.error('Broadcast SMS error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getAuditLog = async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const logs = await AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
            .populate('targetUserId', 'fullName phoneNumber accountNumber');
        const total = await AuditLog.countDocuments();

        res.json({ logs, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error('Get audit log error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ status: 'active' });
        const suspendedUsers = await User.countDocuments({ status: 'suspended' });
        const pendingUsers = await User.countDocuments({ status: 'pending' });

        const aumAgg = await User.aggregate([
            { $group: { _id: null, total: { $sum: '$portfolioValue' } } }
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayDeposits = await Transaction.countDocuments({ type: 'deposit', createdAt: { $gte: today } });
        const todayWithdrawals = await Transaction.countDocuments({ type: 'redemption', createdAt: { $gte: today } });
        const newAccountsToday = await User.countDocuments({ createdAt: { $gte: today } });
        const highRisk = await User.countDocuments({ risk: 'high' });

        res.json({
            totalUsers, activeUsers, suspendedUsers, pendingUsers,
            totalBalance: aumAgg[0]?.total || 0,
            todayDeposits, todayWithdrawals, newAccountsToday, highRisk
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};
