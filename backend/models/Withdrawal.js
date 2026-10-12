const mongoose = require('mongoose');

const WithdrawalSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    accountNumber: { type: String, required: true },
    reference: { type: String, required: true, unique: true },

    amount: { type: Number, required: true, min: 1000 },

    destination: {
        type: String,
        enum: ['mpesa', 'bank'],
        required: true
    },
    destinationAccount: { type: String, required: true },
    destinationName: { type: String, default: null }, // for bank transfers

    // Locked at request time
    unitsRedeemed: { type: Number, required: true },
    navAtRequest: { type: Number, required: true },
    portfolioAfter: { type: Number, required: true },

    status: {
        type: String,
        enum: ['pending', 'approved', 'paid', 'rejected', 'cancelled'],
        default: 'pending'
    },

    requestedAt: { type: Date, default: Date.now },

    // Admin actions
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: null },
    rejectionReason: { type: String, default: null },

    // Payout confirmation
    paidAt: { type: Date, default: null },
    paidReference: { type: String, default: null } // M-PESA code entered by admin
});

WithdrawalSchema.index({ userId: 1, status: 1 });
WithdrawalSchema.index({ status: 1, requestedAt: -1 });

WithdrawalSchema.statics.generateReference = function () {
    const ts = Date.now().toString().slice(-6);
    const rand = Math.floor(100000 + Math.random() * 900000);
    return 'WDR-' + ts + '-' + rand;
};

module.exports = mongoose.model('Withdrawal', WithdrawalSchema);