const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, 'backend');

function writeFile(relativePath, content) {
    const fullPath = path.join(BASE, relativePath);
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ ${relativePath} — ${fs.statSync(fullPath).size} bytes`);
}

console.log('🚀 RockWin — Adding missing email triggers\n');

// ============================================================
// 1. emailService.js — ADD new email templates
// ============================================================
writeFile('services/emailService.js', `const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

function wrapEmail(title, bodyHtml) {
    return '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
        '<h1 style="color: #006d32; font-size: 24px; margin-bottom: 8px;">' + title + '</h1>' +
        bodyHtml +
        '<hr style="border: none; border-top: 1px solid #e8ecf0; margin: 32px 0;">' +
        '<p style="color: #8a9bb0; font-size: 12px;">RockWin Investment · CMA Licensed · I&M Trustee · Deloitte Audited</p>' +
        '</div>';
}

function detailsBox(rows) {
    let html = '<div style="background: #f4f6fa; padding: 20px; border-radius: 8px; margin: 20px 0;"><table style="width: 100%; font-size: 14px;">';
    rows.forEach(function(row) {
        html += '<tr><td style="color: #8a9bb0; padding: 4px 0;">' + row.label + '</td><td style="text-align: right; font-weight: 600;">' + row.value + '</td></tr>';
    });
    html += '</table></div>';
    return html;
}

function ctaButton(text, url) {
    return '<a href="' + url + '" style="display: inline-block; background: #006d32; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">' + text + '</a>';
}

// Base send function
exports.sendEmail = async (to, subject, html) => {
    try {
        if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === '123') {
            console.log('📧 [DEV] Email to ' + to + ': ' + subject);
            return { success: true, dev: true };
        }

        const { data, error } = await resend.emails.send({
            from: 'RockWin Investment <' + FROM + '>',
            to: [to],
            subject: subject,
            html: html
        });

        if (error) {
            console.error('❌ Email send failed:', error.message);
            return { success: false, error: error.message };
        }

        console.log('📧 Email sent to ' + to + ' — ID: ' + data.id);
        return { success: true, id: data.id };
    } catch (err) {
        console.error('❌ Email service error:', err.message);
        return { success: false, error: err.message };
    }
};

// Welcome email (signup)
exports.sendWelcomeEmail = async (user) => {
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Your investment account has been created successfully.</p>' +
        detailsBox([
            { label: 'Account Number', value: user.accountNumber },
            { label: 'Email', value: user.email },
            { label: 'Status', value: 'Pending KYC' }
        ]) +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;"><strong>Next steps:</strong> Complete your KYC verification to activate your account.</p>' +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Start from just <strong>KES 1,000</strong> — no lock-in, earn up to <strong>14.2% p.a.</strong></p>' +
        ctaButton('Sign In to Your Account', 'https://rockwin-invest.github.io/rockwin/login.html');

    return exports.sendEmail(user.email, 'Welcome to RockWin Investment — Account Created', wrapEmail('Welcome to RockWin Investment', body));
};

// Login notification
exports.sendLoginNotificationEmail = async (user, meta) => {
    const when = new Date().toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">We noticed a new sign-in to your RockWin Investment account.</p>' +
        detailsBox([
            { label: 'Time', value: when },
            { label: 'Device', value: (meta.device || 'Unknown') },
            { label: 'IP Address', value: (meta.ip || 'Unknown') }
        ]) +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">If this wasn\\'t you, secure your account immediately by changing your password.</p>' +
        ctaButton('Secure My Account', 'https://rockwin-invest.github.io/rockwin/forgot-password.html');

    return exports.sendEmail(user.email, 'RockWin Investment — New Sign-In Detected', wrapEmail('New Sign-In', body));
};

// Deposit confirmation
exports.sendDepositConfirmationEmail = async (user, amount, newValue) => {
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Great news — your deposit has been confirmed and invested.</p>' +
        '<div style="background: #e8f5ee; padding: 24px; border-radius: 8px; margin: 20px 0; text-align: center;">' +
        '<div style="color: #4a5a72; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Deposit Confirmed</div>' +
        '<div style="color: #006d32; font-size: 32px; font-weight: 700;">KES ' + amount.toFixed(2) + '</div>' +
        '<div style="color: #4a5a72; font-size: 13px;">New portfolio: <strong>KES ' + newValue.toFixed(2) + '</strong></div>' +
        '</div>' +
        ctaButton('View Portfolio', 'https://rockwin-invest.github.io/rockwin/dashboard.html');

    return exports.sendEmail(user.email, 'RockWin Investment — Deposit Confirmed: KES ' + amount.toFixed(2), wrapEmail('Deposit Confirmed', body));
};

// Withdrawal confirmation
exports.sendWithdrawalConfirmationEmail = async (user, amount, newValue) => {
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Your redemption request has been processed.</p>' +
        '<div style="background: #fff4e6; padding: 24px; border-radius: 8px; margin: 20px 0; text-align: center;">' +
        '<div style="color: #4a5a72; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Withdrawal Processed</div>' +
        '<div style="color: #e67e22; font-size: 32px; font-weight: 700;">KES ' + amount.toFixed(2) + '</div>' +
        '<div style="color: #4a5a72; font-size: 13px;">Remaining portfolio: <strong>KES ' + newValue.toFixed(2) + '</strong></div>' +
        '</div>' +
        '<p style="color: #4a5a72; font-size: 14px; line-height: 1.6;">Funds will reflect in your M-PESA or bank account within 24 hours.</p>' +
        ctaButton('View Portfolio', 'https://rockwin-invest.github.io/rockwin/dashboard.html');

    return exports.sendEmail(user.email, 'RockWin Investment — Withdrawal Processed: KES ' + amount.toFixed(2), wrapEmail('Withdrawal Processed', body));
};

// Interest credit
exports.sendInterestCreditEmail = async (user, interestAmount, newPortfolioValue) => {
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Daily interest has been credited to your portfolio.</p>' +
        '<div style="background: #e8f5ee; padding: 24px; border-radius: 8px; margin: 20px 0; text-align: center;">' +
        '<div style="color: #4a5a72; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Interest Earned</div>' +
        '<div style="color: #006d32; font-size: 32px; font-weight: 700;">KES ' + interestAmount.toFixed(2) + '</div>' +
        '<div style="color: #4a5a72; font-size: 13px;">New portfolio: <strong>KES ' + newPortfolioValue.toFixed(2) + '</strong></div>' +
        '</div>' +
        ctaButton('View Portfolio', 'https://rockwin-invest.github.io/rockwin/dashboard.html');

    return exports.sendEmail(user.email, 'Interest Credited: KES ' + interestAmount.toFixed(2), wrapEmail('Interest Credited', body));
};

// Admin broadcast
exports.sendBroadcastEmail = async (user, subject, message) => {
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
        '<div style="color: #4a5a72; font-size: 15px; line-height: 1.6; white-space: pre-line;">' + message + '</div>';

    return exports.sendEmail(user.email, subject, wrapEmail(subject, body));
};
`);

// ============================================================
// 2. models/User.js — default interestAlertsEnabled to TRUE
// ============================================================
writeFile('models/User.js', `const mongoose = require('mongoose');
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

    smsEnabled: { type: Boolean, default: true },
    interestAlertsEnabled: { type: Boolean, default: true },
    loginAlertsEnabled: { type: Boolean, default: true },
    emailStatementsEnabled: { type: Boolean, default: false },
    autoInvestEnabled: { type: Boolean, default: true },
    reinvestInterest: { type: Boolean, default: true },

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
`);

// ============================================================
// 3. interestService.js — send interest emails by default
// ============================================================
writeFile('services/interestService.js', `const User = require('../models/User');
const Transaction = require('../models/Transaction');
const InterestAccrual = require('../models/InterestAccrual');
const FundPerformance = require('../models/FundPerformance');
const emailService = require('./emailService');
const navService = require('./navService');

const WHT_RATE = 0.15;

exports.accrueForUser = async (user, navPerUnit, annualYield) => {
    if (user.status !== 'active' || user.unitsHeld <= 0) return null;

    const portfolioBefore = user.unitsHeld * navPerUnit;
    const dailyRate = annualYield / 365;
    const grossInterest = portfolioBefore * dailyRate;
    const taxWithheld = grossInterest * WHT_RATE;
    const netInterest = grossInterest - taxWithheld;
    const unitsCredited = netInterest / navPerUnit;

    user.unitsHeld += unitsCredited;
    user.portfolioValue = user.unitsHeld * navPerUnit;
    user.ytdInterestEarned = (user.ytdInterestEarned || 0) + netInterest;
    user.lifetimeInterestEarned = (user.lifetimeInterestEarned || 0) + netInterest;
    user.lastInterestAccrualDate = new Date();
    await user.save();

    await InterestAccrual.create({
        userId: user._id,
        accrualDate: new Date(),
        portfolioBefore,
        interestAmount: grossInterest,
        taxWithheld,
        netInterest,
        unitsCredited,
        navPerUnit,
        annualYieldRate: annualYield
    });

    await Transaction.create({
        userId: user._id,
        accountNumber: user.accountNumber,
        type: 'interest',
        amount: netInterest,
        unitsAffected: unitsCredited,
        navAtTransaction: navPerUnit,
        portfolioAfter: user.portfolioValue,
        description: 'Daily Interest Credit',
        reference: 'Daily accrual',
        accrualDate: new Date()
    });

    // Send interest email — default ON (user can disable in settings)
    if (user.interestAlertsEnabled !== false && user.email) {
        try {
            await emailService.sendInterestCreditEmail(user, netInterest, user.portfolioValue);
        } catch (e) {
            console.warn('Interest email failed for ' + user.email + ':', e.message);
        }
    }

    return { netInterest, unitsCredited };
};

exports.runDailyAccrual = async () => {
    const start = Date.now();
    console.log('🔄 Starting daily interest accrual...');

    try {
        const annualYield = await navService.getCurrentYield();
        const currentNav = await navService.getCurrentNav();
        const nextNav = navService.computeNextNav(currentNav, annualYield);

        const users = await User.find({ status: 'active', unitsHeld: { $gt: 0 } });

        let totalInterest = 0;
        let successCount = 0;
        let errorCount = 0;

        for (const user of users) {
            try {
                const result = await exports.accrueForUser(user, currentNav, annualYield);
                if (result) {
                    totalInterest += result.netInterest;
                    successCount++;
                }
            } catch (err) {
                console.error('Failed for ' + user.accountNumber + ':', err.message);
                errorCount++;
            }
        }

        const aumAgg = await User.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: null, total: { $sum: '$portfolioValue' }, units: { $sum: '$unitsHeld' } } }
        ]);

        const aum = aumAgg[0] && aumAgg[0].total || 0;
        const totalUnitsOutstanding = aumAgg[0] && aumAgg[0].units || 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await FundPerformance.findOneAndUpdate(
            { date: today },
            {
                date: today,
                navPerUnit: nextNav,
                dailyYieldRate: annualYield / 365,
                annualYieldRate: annualYield,
                aum,
                activeInvestors: successCount,
                totalUnitsOutstanding
            },
            { upsert: true, new: true }
        );

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log('✅ Accrual complete in ' + elapsed + 's — ' + successCount + ' users, KES ' + totalInterest.toFixed(2) + ' credited, ' + errorCount + ' errors');

        return { successCount, errorCount, totalInterest, elapsed };
    } catch (err) {
        console.error('❌ Accrual error:', err);
        throw err;
    }
};
`);

// ============================================================
// 4. authController.js — ADD login notification email
// ============================================================
writeFile('controllers/authController.js', `const User = require('../models/User');
const jwt = require('jsonwebtoken');
const emailService = require('../services/emailService');

const otpStore = new Map();

exports.signup = async (req, res) => {
    try {
        const { fullName, phoneNumber, email, idNumber, dateOfBirth, password, nextOfKin } = req.body;

        const existing = await User.findOne({
            $or: [{ phoneNumber }, { idNumber }, { email }]
        });
        if (existing) {
            return res.status(400).json({ error: 'Phone, email, or ID already registered.' });
        }

        let accountNumber;
        let isUnique = false;
        while (!isUnique) {
            accountNumber = User.generateAccountNumber();
            const exists = await User.findOne({ accountNumber });
            if (!exists) isUnique = true;
        }

        const user = new User({
            fullName,
            phoneNumber,
            email,
            idNumber,
            dateOfBirth: new Date(dateOfBirth),
            password,
            accountNumber,
            nextOfKin: nextOfKin || { name: 'Not provided', phone: phoneNumber, relationship: 'Self' },
            status: 'pending',
            unitsHeld: 0,
            portfolioValue: 0,
            ytdInterestEarned: 0,
            lifetimeInterestEarned: 0
        });

        await user.save();

        try {
            await emailService.sendWelcomeEmail(user);
        } catch (e) {
            console.warn('Welcome email failed:', e.message);
        }

        const token = jwt.sign(
            { id: user._id, phone: user.phoneNumber, role: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.status(201).json({
            message: 'Account created successfully.',
            accountNumber,
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
                email: user.email,
                accountNumber: user.accountNumber,
                status: user.status,
                portfolioValue: 0,
                unitsHeld: 0
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error during signup.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { phoneNumber, password } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

        if (user.status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended. Contact support.' });
        }

        user.lastLogin = new Date();
        await user.save();

        // Send login notification email (default ON)
        if (user.loginAlertsEnabled !== false && user.email) {
            try {
                await emailService.sendLoginNotificationEmail(user, {
                    ip: req.ip || 'Unknown',
                    device: (req.headers['user-agent'] || 'Unknown').substring(0, 80)
                });
            } catch (e) {
                console.warn('Login notification email failed:', e.message);
            }
        }

        const token = jwt.sign(
            { id: user._id, phone: user.phoneNumber, role: 'user' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.json({
            message: 'Login successful.',
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                phoneNumber: user.phoneNumber,
                email: user.email,
                accountNumber: user.accountNumber,
                portfolioValue: user.portfolioValue || 0,
                unitsHeld: user.unitsHeld || 0,
                status: user.status
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login.' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            return res.json({ message: 'If the number is registered, a reset code has been sent.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 15 * 60 * 1000;
        otpStore.set(phoneNumber, { otp, expires });

        try {
            await emailService.sendEmail(
                user.email,
                'RockWin Investment — Password Reset Code',
                '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                '<h1 style="color: #006d32; font-size: 24px;">Password Reset</h1>' +
                '<p style="color: #4a5a72; font-size: 15px;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
                '<p style="color: #4a5a72; font-size: 15px;">Your 6-digit reset code is:</p>' +
                '<div style="background: #e8f5ee; padding: 24px; border-radius: 8px; margin: 20px 0; text-align: center;">' +
                '<div style="color: #006d32; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: monospace;">' + otp + '</div>' +
                '</div>' +
                '<p style="color: #4a5a72; font-size: 14px;">Valid for <strong>15 minutes</strong>.</p>' +
                '</div>'
            );
        } catch (e) {
            console.warn('OTP email failed:', e.message);
        }

        res.json({ message: 'Reset code sent successfully.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { phoneNumber, otp, newPassword } = req.body;
        const stored = otpStore.get(phoneNumber);
        if (!stored || stored.otp !== otp || Date.now() > stored.expires) {
            return res.status(400).json({ error: 'Invalid or expired reset code.' });
        }

        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        user.password = newPassword;
        await user.save();
        otpStore.delete(phoneNumber);

        try {
            await emailService.sendEmail(
                user.email,
                'RockWin Investment — Password Changed',
                '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                '<h1 style="color: #006d32; font-size: 24px;">Password Changed</h1>' +
                '<p style="color: #4a5a72; font-size: 15px;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
                '<p style="color: #4a5a72; font-size: 15px;">Your RockWin Investment password has been changed successfully.</p>' +
                '<p style="color: #4a5a72; font-size: 15px;">If you didn\\'t do this, contact support@rockwin.co.ke immediately.</p>' +
                '</div>'
            );
        } catch (e) {
            console.warn('Confirmation email failed:', e.message);
        }

        res.json({ message: 'Password reset successful.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.logout = (req, res) => {
    res.json({ message: 'Logged out successfully.' });
};

exports.verifyOtp = (req, res) => {
    const { phoneNumber, otp } = req.query;
    const stored = otpStore.get(phoneNumber);
    if (stored && stored.otp === otp && Date.now() <= stored.expires) {
        return res.json({ valid: true });
    }
    res.json({ valid: false });
};
`);

// ============================================================
// 5. adminController.js — specific deposit/withdrawal emails
// ============================================================
writeFile('controllers/adminController.js', `const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const FundPerformance = require('../models/FundPerformance');
const InterestAccrual = require('../models/InterestAccrual');
const emailService = require('../services/emailService');
const navService = require('../services/navService');
const interestService = require('../services/interestService');

exports.getUsers = async (req, res) => {
    try {
        const { search, status, risk, limit = 50, page = 1 } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: 'i' } },
                { phoneNumber: { $regex: search } },
                { email: { $regex: search, $options: 'i' } },
                { idNumber: { $regex: search } },
                { accountNumber: { $regex: search, $options: 'i' } }
            ];
        }
        if (status) query.status = status;
        if (risk) query.risk = risk;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const users = await User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
        const total = await User.countDocuments(query);

        res.json({
            users,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });
        const transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);
        const accruals = await InterestAccrual.find({ userId: user._id }).sort({ accrualDate: -1 }).limit(10);
        res.json({ user, transactions, accruals });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.updatePortfolio = async (req, res) => {
    try {
        const { id } = req.params;
        const { adjustmentType, adjustmentAmount, reason, sendEmail } = req.body;
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: 'Investor not found.' });

        const currentNav = await navService.getCurrentNav();
        let unitsDelta = 0;
        let txType = 'adjustment';

        if (adjustmentType === 'credit') {
            unitsDelta = adjustmentAmount / currentNav;
            user.unitsHeld += unitsDelta;
            txType = 'deposit';
        } else if (adjustmentType === 'debit') {
            const unitsToRemove = Math.min(adjustmentAmount / currentNav, user.unitsHeld);
            unitsDelta = -unitsToRemove;
            user.unitsHeld = Math.max(0, user.unitsHeld - unitsToRemove);
            txType = 'redemption';
        } else if (adjustmentType === 'interest') {
            unitsDelta = adjustmentAmount / currentNav;
            user.unitsHeld += unitsDelta;
            txType = 'interest';
            user.ytdInterestEarned = (user.ytdInterestEarned || 0) + adjustmentAmount;
            user.lifetimeInterestEarned = (user.lifetimeInterestEarned || 0) + adjustmentAmount;
        } else if (adjustmentType === 'override') {
            user.unitsHeld = adjustmentAmount / currentNav;
            unitsDelta = user.unitsHeld;
        } else {
            return res.status(400).json({ error: 'Invalid adjustment type.' });
        }

        user.portfolioValue = user.unitsHeld * currentNav;
        await user.save();

        await Transaction.create({
            userId: user._id, accountNumber: user.accountNumber, type: txType,
            amount: adjustmentAmount || Math.abs(unitsDelta * currentNav),
            unitsAffected: unitsDelta, navAtTransaction: currentNav,
            portfolioAfter: user.portfolioValue, description: reason || 'Admin ' + adjustmentType,
            reference: 'ADMIN-' + Date.now()
        });

        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Portfolio Update',
            details: user.fullName + ': ' + adjustmentType + ' KES ' + adjustmentAmount + ' → New: KES ' + user.portfolioValue.toFixed(2),
            targetUserId: user._id, ipAddress: req.ip
        });

        // Send specific email based on adjustment type
        if (sendEmail !== false && user.email) {
            try {
                if (adjustmentType === 'credit') {
                    await emailService.sendDepositConfirmationEmail(user, adjustmentAmount, user.portfolioValue);
                } else if (adjustmentType === 'debit') {
                    await emailService.sendWithdrawalConfirmationEmail(user, adjustmentAmount, user.portfolioValue);
                } else if (adjustmentType === 'interest') {
                    await emailService.sendInterestCreditEmail(user, adjustmentAmount, user.portfolioValue);
                } else {
                    await emailService.sendEmail(
                        user.email,
                        'RockWin Investment — Portfolio Adjusted',
                        '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                        '<h1 style="color: #006d32; font-size: 24px;">Portfolio Adjusted</h1>' +
                        '<p style="color: #4a5a72; font-size: 15px;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
                        '<p style="color: #4a5a72; font-size: 15px;">Your portfolio has been adjusted to <strong>KES ' + user.portfolioValue.toFixed(2) + '</strong>.</p>' +
                        '</div>'
                    );
                }
            } catch (e) {
                console.warn('Portfolio email failed:', e.message);
            }
        }

        res.json({
            message: 'Portfolio updated.',
            user: { id: user._id, fullName: user.fullName, accountNumber: user.accountNumber, portfolioValue: user.portfolioValue, unitsHeld: user.unitsHeld }
        });
    } catch (error) {
        console.error('Update portfolio error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.setYieldRate = async (req, res) => {
    try {
        const { newYield, reason } = req.body;
        const yieldDecimal = parseFloat(newYield) / 100;
        if (isNaN(yieldDecimal) || yieldDecimal < 0 || yieldDecimal > 0.30) {
            return res.status(400).json({ error: 'Yield must be between 0% and 30%.' });
        }
        const currentNav = await navService.getCurrentNav();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await FundPerformance.findOneAndUpdate(
            { date: today },
            { date: today, navPerUnit: currentNav, dailyYieldRate: yieldDecimal / 365, annualYieldRate: yieldDecimal },
            { upsert: true, new: true }
        );
        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Set Yield Rate',
            details: 'Yield → ' + newYield + '% p.a. Reason: ' + (reason || 'Not provided'), ipAddress: req.ip
        });
        res.json({ message: 'Yield rate updated.', yield: newYield + '% p.a.' });
    } catch (error) {
        console.error('Set yield error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.runAccrual = async (req, res) => {
    try {
        const result = await interestService.runDailyAccrual();
        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Run Interest Accrual',
            details: result.successCount + ' investors, KES ' + result.totalInterest.toFixed(2), ipAddress: req.ip
        });
        res.json({ message: 'Accrual complete.', ...result });
    } catch (error) {
        console.error('Run accrual error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getFundStats = async (req, res) => {
    try {
        const totalInvestors = await User.countDocuments();
        const activeInvestors = await User.countDocuments({ status: 'active' });
        const suspendedAccounts = await User.countDocuments({ status: 'suspended' });
        const pendingKyc = await User.countDocuments({ status: 'pending' });
        const aumAgg = await User.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: null, aum: { $sum: '$portfolioValue' }, units: { $sum: '$unitsHeld' } } }
        ]);
        const aum = aumAgg[0] && aumAgg[0].aum || 0;
        const totalUnits = aumAgg[0] && aumAgg[0].units || 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayInterest = await InterestAccrual.aggregate([
            { $match: { accrualDate: { $gte: today } } },
            { $group: { _id: null, total: { $sum: '$netInterest' }, tax: { $sum: '$taxWithheld' } } }
        ]);
        const currentYield = await navService.getCurrentYield();
        const currentNav = await navService.getCurrentNav();
        res.json({
            totalInvestors, activeInvestors, suspendedAccounts, pendingKyc,
            totalAUM: aum, totalUnitsOutstanding: totalUnits,
            currentYield: currentYield * 100, currentNav,
            todayInterestCredited: todayInterest[0] && todayInterest[0].total || 0,
            todayTaxWithheld: todayInterest[0] && todayInterest[0].tax || 0
        });
    } catch (error) {
        console.error('Get fund stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getFundPerformance = async (req, res) => {
    try {
        const history = await navService.getFundPerformance(90);
        res.json({ history });
    } catch (error) {
        console.error('Get fund performance error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (['active', 'suspended', 'pending'].indexOf(status) === -1) {
            return res.status(400).json({ error: 'Invalid status.' });
        }
        const user = await User.findByIdAndUpdate(id, { status }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });
        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Status Change',
            details: user.fullName + ': Status → ' + status, targetUserId: user._id, ipAddress: req.ip
        });
        res.json({ message: 'Status updated.', user });
    } catch (error) {
        console.error('Update status error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.freezeUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findByIdAndUpdate(id, { status: 'suspended' }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'Investor not found.' });
        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Account Freeze',
            details: user.fullName + ': Frozen by ' + req.user.role, targetUserId: user._id, ipAddress: req.ip
        });
        if (user.email) {
            try {
                await emailService.sendEmail(
                    user.email,
                    'RockWin Investment — Account Suspended',
                    '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                    '<h1 style="color: #b00020; font-size: 24px;">Account Suspended</h1>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Hi ' + user.fullName.split(' ')[0] + ',</p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Your RockWin Investment account (' + user.accountNumber + ') has been suspended.</p>' +
                    '<p style="color: #4a5a72; font-size: 15px;">Contact us at <a href="mailto:support@rockwin.co.ke" style="color: #006d32;">support@rockwin.co.ke</a>.</p>' +
                    '</div>'
                );
            } catch (e) { console.warn('Suspension email failed:', e.message); }
        }
        res.json({ message: 'Account frozen.', user });
    } catch (error) {
        console.error('Freeze user error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.broadcastEmail = async (req, res) => {
    try {
        const { recipients, subject, message, targetAll } = req.body;
        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required.' });
        }
        let users = [];
        if (targetAll) {
            users = await User.find({ status: 'active' }).select('fullName email');
        } else if (recipients && recipients.length > 0) {
            users = await User.find({ email: { $in: recipients } }).select('fullName email');
        } else {
            return res.status(400).json({ error: 'No recipients specified.' });
        }
        const results = [];
        for (const user of users) {
            try {
                const result = await emailService.sendBroadcastEmail(user, subject, message);
                results.push({ email: user.email, success: result.success });
            } catch (e) {
                results.push({ email: user.email, success: false, error: e.message });
            }
        }
        await AuditLog.create({
            adminId: req.user.id, adminName: req.user.fullName || 'Admin',
            adminRole: req.user.role || 'operations', action: 'Email Broadcast',
            details: 'Sent to ' + users.length + ' investors: "' + subject + '"', ipAddress: req.ip
        });
        res.json({ message: 'Broadcast sent.', total: users.length, results });
    } catch (error) {
        console.error('Broadcast email error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getAuditLog = async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const logs = await AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
            .populate('targetUserId', 'fullName phoneNumber accountNumber');
        const total = await AuditLog.countDocuments();
        res.json({ logs, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
    } catch (error) {
        console.error('Get audit log error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ status: 'active' });
        const suspendedUsers = await User.countDocuments({ status: 'suspended' });
        const pendingUsers = await User.countDocuments({ status: 'pending' });
        const aumAgg = await User.aggregate([{ $group: { _id: null, total: { $sum: '$portfolioValue' } } }]);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDeposits = await Transaction.countDocuments({ type: 'deposit', createdAt: { $gte: today } });
        const todayWithdrawals = await Transaction.countDocuments({ type: 'redemption', createdAt: { $gte: today } });
        const newAccountsToday = await User.countDocuments({ createdAt: { $gte: today } });
        const highRisk = await User.countDocuments({ risk: 'high' });
        res.json({
            totalUsers, activeUsers, suspendedUsers, pendingUsers,
            totalBalance: aumAgg[0] && aumAgg[0].total || 0,
            todayDeposits, todayWithdrawals, newAccountsToday, highRisk
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};
`);

console.log('\n🎉 All email triggers added!\n');
console.log('New email events now supported:');
console.log('  ✅ Signup → Welcome email');
console.log('  ✅ Login → New sign-in notification');
console.log('  ✅ Deposit (admin credit) → Deposit Confirmed email');
console.log('  ✅ Withdrawal (admin debit) → Withdrawal Processed email');
console.log('  ✅ Interest credit → Sent by default to all users');
console.log('  ✅ Password reset → OTP email');
console.log('  ✅ Account freeze → Suspension email');
console.log('  ✅ Broadcast → Custom emails\n');
console.log('Next steps:');
console.log('  1. Restart server: cd backend && npm start');
console.log('  2. Push to GitHub: git add . && git commit -m "Add all email triggers" && git push origin main');