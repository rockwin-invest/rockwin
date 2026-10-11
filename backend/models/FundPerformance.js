const mongoose = require('mongoose');

const FundPerformanceSchema = new mongoose.Schema({
    date: { type: Date, required: true, unique: true },
    navPerUnit: { type: Number, required: true },
    dailyYieldRate: { type: Number, required: true },
    annualYieldRate: { type: Number, required: true },
    aum: { type: Number, default: 0 },
    activeInvestors: { type: Number, default: 0 },
    totalUnitsOutstanding: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FundPerformance', FundPerformanceSchema);
