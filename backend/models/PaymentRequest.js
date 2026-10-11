const mongoose = require('mongoose');

const PaymentRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    accountNumber: { type: String, required: true },
    phoneNumber: { type: String, required: true },

    amount: { type: Number, required: true, min: 1 },
    reference: { type: String, required: true },

    // Gateway identifiers
    gateway: { type: String, enum: ['mock', 'tuma', 'daraja', 'im_bank'], default: 'mock' },
    checkoutRequestId: { type: String },
    merchantRequestId: { type: String },
    gatewayReceipt: { type: String }, // e.g. M-Pesa confirmation code

    // Status
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled', 'timeout'],
        default: 'pending'
    },
    failureReason: { type: String },

    // Units credited (filled when complete)
    navAtDeposit: { type: Number, default: 0 },
    unitsCredited: { type: Number, default: 0 },
    portfolioAfter: { type: Number, default: 0 },

    // How this payment was resolved — for admin reconciliation & audit trail
    resolutionSource: {
        type: String,
        enum: ['auto', 'webhook', 'admin_manual', 'mock_manual', 'user_cancelled', 'timeout', null],
        default: null
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    resolutionReason: { type: String, default: null },

    // Raw gateway data (for debugging/reconciliation)
    gatewayResponse: { type: mongoose.Schema.Types.Mixed },

    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

PaymentRequestSchema.index({ userId: 1, status: 1 });
PaymentRequestSchema.index({ reference: 1 }, { unique: true });
PaymentRequestSchema.index({ checkoutRequestId: 1 });
PaymentRequestSchema.index({ status: 1, createdAt: -1 });

PaymentRequestSchema.statics.generateReference = function () {
    const random = Math.floor(100000 + Math.random() * 900000);
    const ts = Date.now().toString().slice(-6);
    return 'PAY-' + ts + '-' + random;
};

module.exports = mongoose.model('PaymentRequest', PaymentRequestSchema);