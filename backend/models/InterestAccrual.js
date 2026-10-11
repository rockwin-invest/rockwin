const mongoose = require('mongoose');

const InterestAccrualSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    accrualDate: { type: Date, required: true },
    portfolioBefore: { type: Number, required: true },
    interestAmount: { type: Number, required: true },
    taxWithheld: { type: Number, required: true },
    netInterest: { type: Number, required: true },
    unitsCredited: { type: Number, required: true },
    navPerUnit: { type: Number, required: true },
    annualYieldRate: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

InterestAccrualSchema.index({ userId: 1, accrualDate: -1 });
InterestAccrualSchema.index({ accrualDate: 1 });

module.exports = mongoose.model('InterestAccrual', InterestAccrualSchema);
