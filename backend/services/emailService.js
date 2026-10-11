const { Resend } = require('resend');

const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// Lazy Resend client — instantiated only when actually sending.
// Prevents module-load crashes if RESEND_API_KEY is missing at startup.
let resendClient = null;
function getResendClient() {
    if (resendClient) return resendClient;
    const key = process.env.RESEND_API_KEY;
    if (!key || key === '123') return null;
    resendClient = new Resend(key);
    return resendClient;
}

function firstName(user) {
    return (user.fullName || 'Investor').split(' ')[0];
}

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
        const client = getResendClient();
        if (!client) {
            console.log('📧 [DEV] Email to ' + to + ': ' + subject);
            return { success: true, dev: true };
        }

        const { data, error } = await client.emails.send({
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
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + firstName(user) + ',</p>' +
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
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + firstName(user) + ',</p>' +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">We noticed a new sign-in to your RockWin Investment account.</p>' +
        detailsBox([
            { label: 'Time', value: when },
            { label: 'Device', value: (meta.device || 'Unknown') },
            { label: 'IP Address', value: (meta.ip || 'Unknown') }
        ]) +
        '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">If this wasn\'t you, secure your account immediately by changing your password.</p>' +
        ctaButton('Secure My Account', 'https://rockwin-invest.github.io/rockwin/forgot-password.html');

    return exports.sendEmail(user.email, 'RockWin Investment — New Sign-In Detected', wrapEmail('New Sign-In', body));
};

// Deposit confirmation
exports.sendDepositConfirmationEmail = async (user, amount, newValue) => {
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + firstName(user) + ',</p>' +
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
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + firstName(user) + ',</p>' +
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
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + firstName(user) + ',</p>' +
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
    const body = '<p style="color: #4a5a72; font-size: 15px; line-height: 1.6;">Hi ' + firstName(user) + ',</p>' +
        '<div style="color: #4a5a72; font-size: 15px; line-height: 1.6; white-space: pre-line;">' + message + '</div>';

    return exports.sendEmail(user.email, subject, wrapEmail(subject, body));
};