const FundPerformance = require('../models/FundPerformance');

const INITIAL_NAV = 100.00;
const DEFAULT_YIELD = 0.142;

exports.getCurrentNav = async () => {
    const latest = await FundPerformance.findOne().sort({ date: -1 });
    if (latest) return latest.navPerUnit;
    return INITIAL_NAV;
};

exports.getCurrentYield = async () => {
    const latest = await FundPerformance.findOne().sort({ date: -1 });
    if (latest) return latest.annualYieldRate;
    return DEFAULT_YIELD;
};

exports.getFundPerformance = async (limit = 90) => {
    return FundPerformance.find().sort({ date: -1 }).limit(limit);
};

exports.computeNextNav = (currentNav, annualYield) => {
    const dailyRate = annualYield / 365;
    return currentNav * (1 + dailyRate);
};

exports.INITIAL_NAV = INITIAL_NAV;
exports.DEFAULT_YIELD = DEFAULT_YIELD;
