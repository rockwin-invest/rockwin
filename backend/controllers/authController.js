const User = require('../models/User');
const jwt = require('jsonwebtoken');
const smsService = require('../services/smsService');

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
            await smsService.sendSMS(
                phoneNumber,
                'Welcome to RockWin Investment! Your account ' + accountNumber + ' is ready. Complete your KYC to activate.'
            );
        } catch (e) { console.warn('Welcome SMS failed:', e.message); }

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
        if (!user) return res.json({ message: 'If the number is registered, an OTP has been sent.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 15 * 60 * 1000;
        otpStore.set(phoneNumber, { otp, expires });

        try {
            await smsService.sendSMS(phoneNumber, 'RockWin: Your password reset OTP is ' + otp + '. Valid for 15 minutes.');
        } catch (e) { console.warn('OTP SMS failed:', e.message); }

        res.json({ message: 'OTP sent successfully.' });
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
            return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }

        const user = await User.findOne({ phoneNumber });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        user.password = newPassword;
        await user.save();
        otpStore.delete(phoneNumber);

        try {
            await smsService.sendSMS(phoneNumber, 'RockWin: Your password has been changed successfully.');
        } catch (e) { console.warn('Confirmation SMS failed:', e.message); }

        res.json({ message: 'Password reset successful.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.logout = (req, res) => { res.json({ message: 'Logged out successfully.' }); };

exports.verifyOtp = (req, res) => {
    const { phoneNumber, otp } = req.query;
    const stored = otpStore.get(phoneNumber);
    if (stored && stored.otp === otp && Date.now() <= stored.expires) {
        return res.json({ valid: true });
    }
    res.json({ valid: false });
};
