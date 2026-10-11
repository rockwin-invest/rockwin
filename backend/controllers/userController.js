const User = require('../models/User');
const Transaction = require('../models/Transaction');
const InterestAccrual = require('../models/InterestAccrual');
const Goal = require('../models/Goal');
const navService = require('../services/navService');

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const currentNav = await navService.getCurrentNav();
        const currentYield = await navService.getCurrentYield();
        res.json({
            fullName: user.fullName,
            phoneNumber: user.phoneNumber,
            email: user.email,
            accountNumber: user.accountNumber,
            portfolioValue: user.unitsHeld * currentNav,
            unitsHeld: user.unitsHeld,
            navPerUnit: currentNav,
            annualYield: currentYield * 100,
            ytdInterestEarned: user.ytdInterestEarned,
            lifetimeInterestEarned: user.lifetimeInterestEarned,
            status: user.status,
            kraConsent: user.kraConsent,
            nextOfKin: user.nextOfKin,
            smsEnabled: user.smsEnabled,
            interestAlertsEnabled: user.interestAlertsEnabled,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getLedger = async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100);
        const formatted = transactions.map(t => ({
            description: t.description,
            amount: (t.type === 'interest' || t.type === 'deposit' || t.type === 'adjustment')
                ? '+ KES ' + t.amount.toFixed(2)
                : '- KES ' + t.amount.toFixed(2),
            rawAmount: t.amount,
            type: (t.type === 'interest' || t.type === 'deposit' || t.type === 'adjustment') ? 'credit' : 'debit',
            category: t.type,
            balanceAfter: t.portfolioAfter,
            unitsAffected: t.unitsAffected,
            navAtTransaction: t.navAtTransaction,
            date: t.createdAt,
            reference: t.reference,
            status: t.status
        }));
        res.json(formatted);
    } catch (error) {
        console.error('Get ledger error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getInterestHistory = async (req, res) => {
    try {
        const accruals = await InterestAccrual.find({ userId: req.user.id }).sort({ accrualDate: -1 }).limit(90);
        res.json(accruals);
    } catch (error) {
        console.error('Get interest history error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthAgg = await InterestAccrual.aggregate([
            { $match: { userId: user._id, accrualDate: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: '$netInterest' } } }
        ]);
        const todayAgg = await InterestAccrual.aggregate([
            { $match: { userId: user._id, accrualDate: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$netInterest' } } }
        ]);
        const currentYield = await navService.getCurrentYield();
        res.json({
            interestToday: todayAgg[0] ? todayAgg[0].total : 0,
            interestThisMonth: monthAgg[0] ? monthAgg[0].total : 0,
            interestYTD: user.ytdInterestEarned || 0,
            lifetimeInterest: user.lifetimeInterestEarned || 0,
            currentYield: currentYield * 100,
            unitsHeld: user.unitsHeld,
            portfolioValue: user.portfolioValue
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.updateSmsPreference = async (req, res) => {
    try {
        const { enabled, interestAlerts, emailStatements } = req.body;
        const updates = {};
        if (typeof enabled === 'boolean') updates.smsEnabled = enabled;
        if (typeof interestAlerts === 'boolean') updates.interestAlertsEnabled = interestAlerts;
        if (typeof emailStatements === 'boolean') updates.emailStatementsEnabled = emailStatements;
        const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
        res.json({
            message: 'Preferences updated.',
            smsEnabled: user.smsEnabled,
            interestAlertsEnabled: user.interestAlertsEnabled,
            emailStatementsEnabled: user.emailStatementsEnabled
        });
    } catch (error) {
        console.error('Update preference error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const { fullName, email, phoneNumber } = req.body;
        const updates = {};
        if (fullName) updates.fullName = fullName;
        if (email) updates.email = email;
        if (phoneNumber) updates.phoneNumber = phoneNumber;
        const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true }).select('-password');
        res.json({ message: 'Profile updated.', user });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getGoals = async (req, res) => {
    try {
        const goals = await Goal.find({ userId: req.user.id }).sort({ completed: 1, createdAt: -1 });
        res.json({ goals });
    } catch (error) {
        console.error('Get goals error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.createGoal = async (req, res) => {
    try {
        const { icon, name, target, saved, deadline, monthly, autoInvest } = req.body;
        if (!name || !target || target < 1000) {
            return res.status(400).json({ error: 'Minimum target is KES 1,000.' });
        }
        const goal = await Goal.create({
            userId: req.user.id,
            icon: icon || '🚨',
            name,
            target,
            saved: saved || 0,
            deadline: new Date(deadline),
            monthlyTarget: monthly || 0,
            autoInvest: autoInvest || false
        });
        res.status(201).json({ message: 'Goal created.', goal });
    } catch (error) {
        console.error('Create goal error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.updateGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const goal = await Goal.findOneAndUpdate({ _id: id, userId: req.user.id }, req.body, { new: true });
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });
        if (goal.saved >= goal.target && !goal.completed) {
            goal.completed = true;
            goal.completedAt = new Date();
            await goal.save();
        }
        res.json({ message: 'Goal updated.', goal });
    } catch (error) {
        console.error('Update goal error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.contributeToGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        if (!amount || amount < 100) {
            return res.status(400).json({ error: 'Minimum contribution is KES 100.' });
        }
        const goal = await Goal.findOne({ _id: id, userId: req.user.id });
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });
        goal.saved += amount;
        if (goal.saved >= goal.target) {
            goal.completed = true;
            goal.completedAt = new Date();
        }
        await goal.save();
        res.json({ message: 'Contribution added.', goal });
    } catch (error) {
        console.error('Contribute error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.toggleGoalAutoInvest = async (req, res) => {
    try {
        const { id } = req.params;
        const { enabled, monthly } = req.body;
        const updates = { autoInvest: enabled };
        if (enabled && monthly) updates.monthlyTarget = monthly;
        const goal = await Goal.findOneAndUpdate({ _id: id, userId: req.user.id }, updates, { new: true });
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });
        res.json({ message: 'Auto-invest updated.', goal });
    } catch (error) {
        console.error('Toggle auto-invest error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.deleteGoal = async (req, res) => {
    try {
        const { id } = req.params;
        const goal = await Goal.findOneAndDelete({ _id: id, userId: req.user.id });
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });
        res.json({ message: 'Goal deleted.' });
    } catch (error) {
        console.error('Delete goal error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};
