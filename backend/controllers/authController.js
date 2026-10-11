const User = require('../models/User');
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
                '<p style="color: #4a5a72; font-size: 15px;">If you didn\'t do this, contact support@rockwin.co.ke immediately.</p>' +
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

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters.' });
        }
        if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            return res.status(400).json({ error: 'New password must include an uppercase letter and a number.' });
        }
        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'New password must differ from current password.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        user.password = newPassword;
        await user.save();

        try {
            await emailService.sendEmail(
                user.email,
                'RockWin Investment — Password Changed',
                '<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">' +
                '<h1 style="color: #006d32; font-size: 24px;">Password Changed</h1>' +
                '<p style="color: #4a5a72; font-size: 15px;">Hi ' + (user.fullName || 'Investor').split(' ')[0] + ',</p>' +
                '<p style="color: #4a5a72; font-size: 15px;">Your RockWin Investment password was changed from your account settings.</p>' +
                '<p style="color: #4a5a72; font-size: 15px;">If you didn\'t do this, contact support@rockwin.co.ke immediately.</p>' +
                '</div>'
            );
        } catch (e) {
            console.warn('Password change email failed:', e.message);
        }

        res.json({ message: 'Password updated successfully.' });
    } catch (error) {
        console.error('Change password error:', error);
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