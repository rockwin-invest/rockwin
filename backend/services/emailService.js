const { Resend } = require('resend');

const FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const SUPPORT_EMAIL = 'info@rockwininvestment.com';
const SITE_URL = process.env.SITE_URL || 'https://rockwininvestment.com';

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

// ============================================================
// EMAIL SHELL
// Paper background, white card, forest accents, contact footer
// ============================================================
function wrapEmail(title, bodyHtml) {
    return '' +
    '<div style="background: #F5F1E8; padding: 40px 20px; font-family: Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif;">' +
      '<div style="max-width: 600px; margin: 0 auto;">' +

        // Wordmark header
        '<div style="margin-bottom: 28px;">' +
          '<span style="display: inline-block; width: 26px; height: 26px; background: #1B4332; color: #F5F1E8; border-radius: 5px; text-align: center; line-height: 26px; font-weight: 700; font-size: 14px; font-family: Fraunces, Georgia, serif; vertical-align: middle;">R</span>' +
          '<span style="color: #0F1A14; font-weight: 600; font-size: 15px; margin-left: 8px; vertical-align: middle;">RockWin Investment</span>' +
        '</div>' +

        // Card
        '<div style="background: #FFFFFF; border: 1px solid #E8E3D6; border-radius: 10px; padding: 32px 28px;">' +
          '<h1 style="color: #0F1A14; font-family: Fraunces, Georgia, serif; font-size: 22px; font-weight: 500; margin: 0 0 20px; letter-spacing: -0.01em;">' + title + '</h1>' +
          bodyHtml +
        '</div>' +

        // Footer
        '<div style="margin-top: 28px; text-align: center; font-size: 12px; color: #8A9089; line-height: 1.6;">' +
          'RockWin Investment Ltd · CMA-licensed money market fund<br>' +
          'Trustee-held at I&amp;M Bank · Audited by Deloitte<br>' +
          '<a href="mailto:' + SUPPORT_EMAIL + '" style="color: #1B4332; text-decoration: none;">' + SUPPORT_EMAIL + '</a>' +
          ' · <a href="' + SITE_URL + '" style="color: #1B4332; text-decoration: none;">rockwininvestment.com</a>' +
        '</div>' +

      '</div>' +
    '</div>';
}

function detailsBox(rows) {
    let html = '<div style="background: #F5F1E8; padding: 18px 20px; border-radius: 8px; margin: 20px 0;"><table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
    rows.forEach(function(row) {
        html += '<tr>' +
            '<td style="color: #8A9089; padding: 5px 0; font-size: 13px;">' + row.label + '</td>' +
            '<td style="color: #0F1A14; text-align: right; font-weight: 500; padding: 5px 0;">' + row.value + '</td>' +
        '</tr>';
    });
    html += '</table></div>';
    return html;
}

function highlightBox(label, value, subline) {
    return '<div style="background: rgba(27, 67, 50, 0.06); border: 1px solid rgba(27, 67, 50, 0.12); padding: 24px 20px; border-radius: 8px; margin: 20px 0; text-align: center;">' +
        '<div style="color: #4A534D; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">' + label + '</div>' +
        '<div style="color: #1B4332; font-family: Fraunces, Georgia, serif; font-size: 30px; font-weight: 600; letter-spacing: -0.01em;">' + value + '</div>' +
        (subline ? '<div style="color: #4A534D; font-size: 13px; margin-top: 6px;">' + subline + '</div>' : '') +
    '</div>';
}

function ctaButton(text, url) {
    return '<div style="margin-top: 24px;">' +
        '<a href="' + url + '" style="display: inline-block; background: #1B4332; color: #F5F1E8; padding: 13px 28px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">' + text + '</a>' +
    '</div>';
}

function paragraph(text) {
    return '<p style="color: #4A534D; font-size: 15px; line-height: 1.65; margin: 0 0 14px;">' + text + '</p>';
}

// ============================================================
// BASE SEND
// ============================================================
exports.sendEmail = async (to, subject, html) => {
    try {
        const client = getResendClient();
        if (!client) {
            console.log('[EMAIL DEV] To: ' + to + ' | Subject: ' + subject);
            return { success: true, dev: true };
        }

        const { data, error } = await client.emails.send({
            from: 'RockWin Investment <' + FROM + '>',
            to: [to],
            reply_to: SUPPORT_EMAIL,
            subject: subject,
            html: html
        });

        if (error) {
            console.error('[EMAIL ERROR]', error.message);
            return { success: false, error: error.message };
        }

        console.log('[EMAIL SENT] To: ' + to + ' | ID: ' + data.id);
        return { success: true, id: data.id };
    } catch (err) {
        console.error('[EMAIL ERROR]', err.message);
        return { success: false, error: err.message };
    }
};

// ============================================================
// WELCOME (signup)
// ============================================================
exports.sendWelcomeEmail = async (user) => {
    const body =
        paragraph('Hi ' + firstName(user) + ',') +
        paragraph('Your RockWin Investment account has been created successfully.') +
        detailsBox([
            { label: 'Account number', value: user.accountNumber },
            { label: 'Email', value: user.email },
            { label: 'Status', value: 'Pending KYC' }
        ]) +
        paragraph('<strong style="color: #0F1A14;">Next step:</strong> complete your KYC verification to activate your account. This is required by the Capital Markets Authority and typically completes the same day.') +
        paragraph('You can start investing from <strong style="color: #0F1A14;">KES 1,000</strong>. Interest is credited to your portfolio every day.') +
        ctaButton('Sign in to your account', SITE_URL + '/login.html');

    return exports.sendEmail(
        user.email,
        'Welcome to RockWin Investment — Account Created',
        wrapEmail('Welcome to RockWin Investment', body)
    );
};

// ============================================================
// LOGIN NOTIFICATION
// ============================================================
exports.sendLoginNotificationEmail = async (user, meta) => {
    const when = new Date().toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
    const body =
        paragraph('Hi ' + firstName(user) + ',') +
        paragraph('We noticed a new sign-in to your RockWin Investment account.') +
        detailsBox([
            { label: 'Time', value: when },
            { label: 'Device', value: (meta.device || 'Unknown') },
            { label: 'IP address', value: (meta.ip || 'Unknown') }
        ]) +
        paragraph('If this wasn\'t you, secure your account by changing your password. If you need help, reply to this email or contact us on WhatsApp.') +
        ctaButton('Secure my account', SITE_URL + '/forgot-password.html');

    return exports.sendEmail(
        user.email,
        'RockWin Investment — New Sign-In Detected',
        wrapEmail('New sign-in detected', body)
    );
};

// ============================================================
// PASSWORD CHANGED
// ============================================================
exports.sendPasswordChangedEmail = async (user) => {
    const body =
        paragraph('Hi ' + firstName(user) + ',') +
        paragraph('Your RockWin Investment password was changed successfully.') +
        paragraph('If you made this change, no action is needed. If you did not, contact us immediately at <a href="mailto:' + SUPPORT_EMAIL + '" style="color: #1B4332;">' + SUPPORT_EMAIL + '</a> or reply to this email.');

    return exports.sendEmail(
        user.email,
        'RockWin Investment — Password Changed',
        wrapEmail('Password changed', body)
    );
};

// ============================================================
// DEPOSIT CONFIRMATION
// ============================================================
exports.sendDepositConfirmationEmail = async (user, amount, newValue) => {
    const body =
        paragraph('Hi ' + firstName(user) + ',') +
        paragraph('Your deposit has been confirmed and invested.') +
        highlightBox(
            'Deposit confirmed',
            'KES ' + amount.toFixed(2),
            'New portfolio value: <strong style="color: #0F1A14;">KES ' + newValue.toFixed(2) + '</strong>'
        ) +
        paragraph('Units have been credited to your portfolio at the current net asset value. Interest on this amount will begin accruing from tomorrow.') +
        ctaButton('View portfolio', SITE_URL + '/dashboard.html');

    return exports.sendEmail(
        user.email,
        'RockWin Investment — Deposit Confirmed: KES ' + amount.toFixed(2),
        wrapEmail('Deposit confirmed', body)
    );
};

// ============================================================
// WITHDRAWAL CONFIRMATION
// ============================================================
exports.sendWithdrawalConfirmationEmail = async (user, amount, newValue) => {
    const body =
        paragraph('Hi ' + firstName(user) + ',') +
        paragraph('Your redemption request has been processed and the funds are on their way.') +
        highlightBox(
            'Redemption processed',
            'KES ' + amount.toFixed(2),
            'Remaining portfolio value: <strong style="color: #0F1A14;">KES ' + newValue.toFixed(2) + '</strong>'
        ) +
        paragraph('Funds will reflect in your M-PESA or bank account within 24 hours. You will receive a separate confirmation with the transaction code once the transfer is complete.') +
        ctaButton('View portfolio', SITE_URL + '/dashboard.html');

    return exports.sendEmail(
        user.email,
        'RockWin Investment — Withdrawal Processed: KES ' + amount.toFixed(2),
        wrapEmail('Withdrawal processed', body)
    );
};

// ============================================================
// INTEREST CREDIT
// ============================================================
exports.sendInterestCreditEmail = async (user, interestAmount, newPortfolioValue) => {
    const body =
        paragraph('Hi ' + firstName(user) + ',') +
        paragraph('Daily interest has been credited to your portfolio.') +
        highlightBox(
            'Interest earned',
            'KES ' + interestAmount.toFixed(2),
            'New portfolio value: <strong style="color: #0F1A14;">KES ' + newPortfolioValue.toFixed(2) + '</strong>'
        ) +
        paragraph('Interest is credited as units, so it compounds automatically. You do not need to do anything to earn the compounded return.') +
        ctaButton('View portfolio', SITE_URL + '/dashboard.html');

    return exports.sendEmail(
        user.email,
        'Interest Credited: KES ' + interestAmount.toFixed(2),
        wrapEmail('Interest credited', body)
    );
};

// ============================================================
// ADMIN BROADCAST
// ============================================================
exports.sendBroadcastEmail = async (user, subject, message) => {
    const body =
        paragraph('Hi ' + firstName(user) + ',') +
        '<div style="color: #4A534D; font-size: 15px; line-height: 1.65; white-space: pre-line; margin-bottom: 14px;">' + message + '</div>' +
        paragraph('If you have questions, reply to this email or contact us on WhatsApp.');

    return exports.sendEmail(user.email, subject, wrapEmail(subject, body));
};