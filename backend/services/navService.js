const FundPerformance = require('../models/FundPerformance');

const INITIAL_NAV = 100.00;
const DEFAULT_YIELD = 0.1062; // decimal, not percent (0.1062 = 10.62%)

// ============================================================
// NAV PER UNIT
// ============================================================
// For a unit-crediting money market fund, NAV per unit stays
// constant. Interest is credited as new units, not by moving
// the NAV. `getCurrentNav()` therefore always returns the
// constant. The FundPerformance collection still records NAV
// on each day for historical audit, but the value does not change.
//
// IMPORTANT: If the fund ever moves to a growing-NAV model,
// interestService.accrueForUser must STOP crediting units, or
// interest will be counted twice — once as more units, once as
// a higher NAV.
exports.getCurrentNav = () => INITIAL_NAV;

// ============================================================
// YIELD
// ============================================================
// Reads the most recent yield from FundPerformance. Falls back
// to DEFAULT_YIELD if there's no record yet, or if the stored
// value is missing / out of range (a NaN yield would poison
// every user's interest calculation).
exports.getCurrentYield = async () => {
    const latest = await FundPerformance.findOne()
        .sort({ date: -1 })
        .select('annualYieldRate');

    const value = latest && latest.annualYieldRate;
    if (typeof value === 'number' && value > 0 && value < 1) {
        return value;
    }
    return DEFAULT_YIELD;
};

// ============================================================
// PERFORMANCE HISTORY
// ============================================================
exports.getFundPerformance = async (limit = 90) => {
    return FundPerformance.find().sort({ date: -1 }).limit(limit);
};

// ============================================================
// CONSTANTS
// ============================================================
exports.INITIAL_NAV = INITIAL_NAV;
exports.DEFAULT_YIELD = DEFAULT_YIELD;