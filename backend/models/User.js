const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    idNumber: { type: String, required: true, unique: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    password: { type: String, required: true },
    accountNumber: { type: String, required: true, unique: true },

    nextOfKin: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relationship: { type: String, required: true }
    },

    kraPin: { type: String, trim: true, default: null },
    kraConsent: { type: Boolean, default: true },

    unitsHeld: { type: Number, default: 0, min: 0 },
    averageBuyPrice: { type: Number, default: 0, min: 0 },
    portfolioValue: { type: Number, default: 0, min: 0 },
    ytdInterestEarned: { type: Number, default: 0, min: 0 },
    lifetimeInterestEarned: { type: Number, default: 0, min: 0 },
    lastInterestAccrualDate: { type: Date, default: null },

    status: { type: String, enum: ['active', 'suspended', 'pending'], default: 'pending' },
    risk: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },

    // Admin access level. Default 'user' for everyone who signs up.
    // Elevated manually by an admin via the promote-admin script or Atlas.
    role: {
        type: String,
        enum: ['user', 'super_admin', 'operations', 'auditor', 'support', 'compliance'],
        default: 'user'
    },

    // Notification preferences — read by interestService, authController, paymentController
    emailAlertsEnabled: { type: Boolean, default: true },
    interestAlertsEnabled: { type: Boolean, default: false },  // opt-in, see interestService
    loginAlertsEnabled: { type: Boolean, default: true },
    marketingEnabled: { type: Boolean, default: false },
    emailStatementsEnabled: { type: Boolean, default: false },

    // Legacy — SMS was retired from the platform; kept for compatibility with existing documents
    smsEnabled: { type: Boolean, default: false },

    lastLogin: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

UserSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.password);
};

UserSchema.statics.generateAccountNumber = function() {
    const random = Math.floor(100000 + Math.random() * 900000);
    return 'RW-' + random;
};

module.exports = mongoose.model('User', UserSchema);