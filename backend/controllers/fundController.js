const User = require('../models/User');
const navService = require('../services/navService');

exports.getPublicFundInfo = async (req, res) => {
    try {
        const currentNav = await navService.getCurrentNav();
        const currentYield = await navService.getCurrentYield();

        const aumAgg = await User.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: null, aum: { $sum: '$portfolioValue' }, units: { $sum: '$unitsHeld' } } }
        ]);

        const activeInvestors = await User.countDocuments({ status: 'active' });

        res.json({
            navPerUnit: currentNav,
            annualYield: currentYield * 100,
            aum: aumAgg[0]?.aum || 0,
            totalUnitsOutstanding: aumAgg[0]?.units || 0,
            activeInvestors,
            lastUpdated: new Date()
        });
    } catch (error) {
        console.error('Get public fund info error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getFundHistory = async (req, res) => {
    try {
        const history = await navService.getFundPerformance(90);
        res.json({ history });
    } catch (error) {
        console.error('Get fund history error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getCalculator = async (req, res) => {
    try {
        const { amount, months } = req.query;
        const principal = parseFloat(amount) || 0;
        const term = parseInt(months) || 12;
        const annualYield = await navService.getCurrentYield();

        const years = term / 12;
        const interest = principal * annualYield * years;
        const total = principal + interest;

        res.json({
            principal,
            months: term,
            annualYield: annualYield * 100,
            interest,
            total
        });
    } catch (error) {
        console.error('Calculator error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};
