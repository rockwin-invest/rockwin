const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    accountNumber: { type: String, required: true },
    type: { type: String, enum: ['deposit', 'redemption', 'interest', 'adjustment'], required: true },
    amount: { type: Number, required: true, min: 0 },
    unitsAffected: { type: Number, default: 0 },
    navAtTransaction: { type: Number, default: 0 },
    portfolioAfter: { type: Number, required: true },
    description: { type: String, required: true },
    reference: { type: String, trim: true },
    accrualDate: { type: Date },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
