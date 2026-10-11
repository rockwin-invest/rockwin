const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

/**
 * Send a transactional email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 */
exports.sendEmail = async (to, subject, html) => {
    try {
        // Skip if API key is a placeholder
        if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === '123') {
            console.log(`📧 [DEV] Email to ${to}: ${subject}`);
            return { success: true, dev: true };
        }

        const { data, error } = await resend.emails.send({
            from: `RockWin Investment <${FROM}>`,
            to: [to],
            subject: subject,
            html: html
        });

        if (error) {
            console.error('❌ Email send failed:', error.message);
            return { success: false, error: error.message };
        }

        console.log(`📧 Email sent to ${to} — ID: ${data.id}`);
        return { success: true, id: data.id };
    } catch (err) {
        console.error('❌ Email service error:', err.message);
        return { success: false, error: err.message };
    }
};

/**
 * Welcome email for new signups
 */
exports.sendWelcomeEmail = async (user) => {
    const html = `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">
            <h1 style="color: #006d32; font-size: 28px; margin-bottom: 8px;">Welcome to RockWin Investment</h1>
            <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ${user.fullName.split(' ')[0]},</p>
            <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">
                Your investment account has been created successfully. Here are your details:
            </p>
            <div style="background: #f4f6fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <table style="width: 100%; font-size: 14px;">
                    <tr>
                        <td style="color: #8a9bb0; padding: 4px 0;">Account Number</td>
                        <td style="text-align: right; font-weight: 600; font-family: monospace;">${user.accountNumber}</td>
                    </tr>
                    <tr>
                        <td style="color: #8a9bb0; padding: 4px 0;">Email</td>
                        <td style="text-align: right; font-weight: 600;">${user.email}</td>
                    </tr>
                    <tr>
                        <td style="color: #8a9bb0; padding: 4px 0;">Status</td>
                        <td style="text-align: right; font-weight: 600; color: #e67e22;">Pending KYC</td>
                    </tr>
                </table>
            </div>
            <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">
                <strong>Next steps:</strong> Complete your KYC verification to activate your account and start investing.
            </p>
            <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">
                Start from just <strong>KES 1,000</strong> — no lock-in, earn up to <strong>14.2% p.a.</strong>
            </p>
            <a href="https://rockwin-invest.github.io/rockwin/login.html" 
               style="display: inline-block; background: #006d32; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
                Sign In to Your Account
            </a>
            <hr style="border: none; border-top: 1px solid #e8ecf0; margin: 32px 0;">
            <p style="color: #8a9bb0; font-size: 12px; line-height: 1.6;">
                RockWin Investment Ltd · CMA Licensed · I&M Trustee · Deloitte Audited<br>
                If you didn't create this account, contact support@rockwin.co.ke
            </p>
        </div>
    `;

    return exports.sendEmail(user.email, 'Welcome to RockWin Investment — Account Created', html);
};

/**
 * Interest credit notification
 */
exports.sendInterestCreditEmail = async (user, interestAmount, newPortfolioValue) => {
    const html = `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">
            <h1 style="color: #006d32; font-size: 24px; margin-bottom: 8px;">💰 Interest Credited</h1>
            <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ${user.fullName.split(' ')[0]},</p>
            <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">
                Daily interest has been credited to your portfolio.
            </p>
            <div style="background: #e8f5ee; padding: 24px; border-radius: 8px; margin: 20px 0; text-align: center;">
                <div style="color: #4a5a72; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Interest Earned</div>
                <div style="color: #006d32; font-size: 32px; font-weight: 700; margin: 4px 0;">
                    KES ${interestAmount.toFixed(2)}
                </div>
                <div style="color: #4a5a72; font-size: 13px;">
                    New portfolio value: <strong>KES ${newPortfolioValue.toFixed(2)}</strong>
                </div>
            </div>
            <a href="https://rockwin-invest.github.io/rockwin/dashboard.html" 
               style="display: inline-block; background: #006d32; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                View Portfolio
            </a>
            <hr style="border: none; border-top: 1px solid #e8ecf0; margin: 32px 0;">
            <p style="color: #8a9bb0; font-size: 12px;">
                RockWin Investment · CMA Licensed · I&M Trustee · Deloitte Audited
            </p>
        </div>
    `;

    return exports.sendEmail(user.email, `Interest Credited: KES ${interestAmount.toFixed(2)}`, html);
};

/**
 * Admin broadcast email
 */
exports.sendBroadcastEmail = async (user, subject, message) => {
    const html = `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #0b1c30;">
            <h1 style="color: #006d32; font-size: 24px; margin-bottom: 8px;">${subject}</h1>
            <p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ${user.fullName.split(' ')[0]},</p>
            <div style="color: #4a5a72; font-size: 15px; line-height: 1.6; white-space: pre-line;">
                ${message}
            </div>
            <hr style="border: none; border-top: 1px solid #e8ecf0; margin: 32px 0;">
            <p style="color: #8a9bb0; font-size: 12px;">
                RockWin Investment · CMA Licensed · I&M Trustee · Deloitte Audited
            </p>
        </div>
    `;

    return exports.sendEmail(user.email, subject, html);
};