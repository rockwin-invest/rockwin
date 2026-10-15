const emailService = require('../services/emailService');

const SUPPORT_EMAIL = 'info@rockwininvestment.com';
const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;
const VALID_TOPICS = [
    'Account enquiry',
    'Deposit issue',
    'Redemption issue',
    'KYC verification',
    'Technical problem',
    'Other'
];

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

exports.submitContactForm = async (req, res) => {
    try {
        const { name, email, phone, topic, message, website } = req.body || {};

        // Honeypot — real users never see this field. Bots fill it.
        // Silently accept so the bot thinks it succeeded.
        if (website && String(website).trim().length > 0) {
            console.warn('[CONTACT] Honeypot triggered from IP', req.ip);
            return res.json({ success: true, message: 'Message sent.' });
        }

        // Validation
        if (!name || String(name).trim().length < 2) {
            return res.status(400).json({ error: 'Please enter your name.' });
        }
        if (String(name).trim().length > MAX_NAME_LENGTH) {
            return res.status(400).json({ error: 'Name is too long.' });
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        if (!message || String(message).trim().length < 10) {
            return res.status(400).json({ error: 'Please write a message (at least 10 characters).' });
        }
        if (String(message).trim().length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({ error: 'Message is too long (max 2000 characters).' });
        }

        const cleanName = String(name).trim();
        const cleanEmail = String(email).trim().toLowerCase();
        const cleanPhone = phone ? String(phone).trim() : '';
        const cleanTopic = VALID_TOPICS.indexOf(topic) !== -1 ? topic : 'Other';
        const cleanMessage = String(message).trim();

        const subject = '[Contact] ' + cleanTopic + ' — ' + cleanName;

        const bodyHtml =
            '<p style="color: #4A534D; font-size: 15px; line-height: 1.65; margin: 0 0 14px;">A new message was submitted via the contact form on rockwininvestment.com.</p>' +
            '<div style="background: #F5F1E8; padding: 18px 20px; border-radius: 8px; margin: 20px 0;">' +
                '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">' +
                    '<tr><td style="color: #8A9089; padding: 5px 0; font-size: 13px;">Name</td>' +
                        '<td style="color: #0F1A14; text-align: right; font-weight: 500;">' + escapeHtml(cleanName) + '</td></tr>' +
                    '<tr><td style="color: #8A9089; padding: 5px 0; font-size: 13px;">Email</td>' +
                        '<td style="color: #0F1A14; text-align: right; font-weight: 500;">' + escapeHtml(cleanEmail) + '</td></tr>' +
                    (cleanPhone
                        ? '<tr><td style="color: #8A9089; padding: 5px 0; font-size: 13px;">Phone</td>' +
                          '<td style="color: #0F1A14; text-align: right; font-weight: 500;">' + escapeHtml(cleanPhone) + '</td></tr>'
                        : '') +
                    '<tr><td style="color: #8A9089; padding: 5px 0; font-size: 13px;">Topic</td>' +
                        '<td style="color: #0F1A14; text-align: right; font-weight: 500;">' + escapeHtml(cleanTopic) + '</td></tr>' +
                '</table>' +
            '</div>' +
            '<div style="color: #0F1A14; font-size: 15px; line-height: 1.65; white-space: pre-line; padding: 12px 0;">' +
                escapeHtml(cleanMessage) +
            '</div>' +
            '<div style="border-top: 1px solid #E8E3D6; margin-top: 20px; padding-top: 14px; font-size: 12px; color: #8A9089;">' +
                'Reply directly to this email to respond to ' + escapeHtml(cleanName) + ' at ' + escapeHtml(cleanEmail) + '.' +
            '</div>';

        const wrapped =
            '<div style="background: #F5F1E8; padding: 40px 20px; font-family: Inter, -apple-system, sans-serif;">' +
              '<div style="max-width: 600px; margin: 0 auto;">' +
                '<div style="margin-bottom: 28px;">' +
                  '<span style="display: inline-block; width: 26px; height: 26px; background: #1B4332; color: #F5F1E8; border-radius: 5px; text-align: center; line-height: 26px; font-weight: 700; font-size: 14px; vertical-align: middle;">R</span>' +
                  '<span style="color: #0F1A14; font-weight: 600; font-size: 15px; margin-left: 8px; vertical-align: middle;">RockWin Investment</span>' +
                '</div>' +
                '<div style="background: #FFFFFF; border: 1px solid #E8E3D6; border-radius: 10px; padding: 32px 28px;">' +
                  '<h1 style="color: #0F1A14; font-size: 22px; font-weight: 500; margin: 0 0 20px;">New contact form submission</h1>' +
                  bodyHtml +
                '</div>' +
              '</div>' +
            '</div>';

        await emailService.sendEmail(SUPPORT_EMAIL, subject, wrapped, { replyTo: cleanEmail });

        console.log('[CONTACT] Message from ' + cleanEmail + ' — topic: ' + cleanTopic);

        res.json({ success: true, message: 'Message sent. We\'ll reply within 1 business day.' });
    } catch (error) {
        console.error('[CONTACT] Submit error:', error);
        res.status(500).json({ error: 'Could not send your message. Please try WhatsApp instead.' });
    }
};