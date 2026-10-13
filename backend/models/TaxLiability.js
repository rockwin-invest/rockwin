const mongoose = require('mongoose');

const TaxLiabilitySchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        unique: true
    },
    grossInterest: { type: Number, default: 0 },
    taxWithheld:   { type: Number, default: 0 },
    netInterest:   { type: Number, default: 0 },
    usersAccrued:  { type: Number, default: 0 },

    // Remittance tracking — set by admin when the tax is paid to KRA
    remittedAt:        { type: Date, default: null },
    remittedReference: { type: String, default: null },
    remittedBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

TaxLiabilitySchema.index({ date: -1 });

module.exports = mongoose.model('TaxLiability', TaxLiabilitySchema);