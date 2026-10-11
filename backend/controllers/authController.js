const User = require('../models/User');
const jwt = require('jsonwebtoken');
const emailService = require('../services/emailService');

const otpStore = new Map();

// ============================================================
// SIGNUP
// ============================================================
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

        // Send welcome email (non-blocking)
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

// ============================================================
// LOGIN
// ============================================================
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

// ============================================================
// FORGOT PASSWORD — sends OTP via email
// ============================================================
exports.forgotPassword = async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const user = await User.findOne({ phoneNumber });
        if (!user) {
            // Don't reveal if user exists
            return res.json({ message: 'If the number is registered, a reset code has been sent.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 15 * 60 * 1000;
        otpStore.set(phoneNumber, { otp, expires });

        // Send OTP via email
        try {
            await emailService.sendEmail(
                user.email,
                'RockWin Investment — Password Reset Code',
                `
                <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">
                    <h1 style="color: #006d32; font-size: 24px; margin-bottom: 8px;">Password Reset</h1>
                    <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ${user.fullName.split(' ')[0]},</p>
                    <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">
                        You requested a password reset for your RockWin Investment account.
                    </p>
                    <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Your 6-digit reset code is:</p>
                    <div style="background: #e8f5ee; padding: 24px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <div style="color: #006d32; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: monospace;">
                            ${otp}
                        </div>
                    </div>
                    <p style="color: #4a5a72; font-size: 14px; line-height: 1.6;">
                        This code is valid for <strong>15 minutes</strong>. If you didn't request this, you can safely ignore this email.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e8ecf0; margin: 32px 0;">
                    <p style="color: #8a9bb0; font-size: 12px;">
                        RockWin Investment · CMA Licensed · I&M Trustee · Deloitte Audited
                    </p>
                </div>
                `
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

// ============================================================
// RESET PASSWORD — verifies OTP + sends confirmation email
// ============================================================
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

        // Confirmation email
        try {
            await emailService.sendEmail(
                user.email,
                'RockWin Investment — Password Changed',
                `
                <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">
                    <h1 style="color: #006d32; font-size: 24px; margin-bottom: 8px;">Password Changed</h1>
                    <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ${user.fullName.split(' ')[0]},</p>
                    <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">
                        Your RockWin Investment account password has been changed successfully.
                    </p>
                    <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">
                        If you didn't do this, contact us immediately at
                        <a href="mailto:support@rockwin.co.ke" style="color: #006d32;">support@rockwin.co.ke</a>.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e8ecf0; margin: 32px 0;">
                    <p style="color: #8a9bb0; font-size: 12px;">
                        RockWin Investment · CMA Licensed · I&M Trustee · Deloitte Audited
                    </p>
                </div>
                `
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

// ============================================================
// LOGOUT
// ============================================================
exports.logout = (req, res) => {
    res.json({ message: 'Logged out successfully.' });
};

// ============================================================
// VERIFY OTP
// ============================================================
exports.verifyOtp = (req, res) => {
    const { phoneNumber, otp } = req.query;
    const stored = otpStore.get(phoneNumber);
    if (stored && stored.otp === otp && Date.now() <= stored.expires) {
        return res.json({ valid: true });
    }
    res.json({ valid: false });
};