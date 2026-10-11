const axios = require('axios');

/**
 * Send SMS using Africa's Talking or Mobilesasa API
 * @param {string} to - Recipient phone number (e.g., +254712345678)
 * @param {string} message - SMS message content
 * @returns {Promise<boolean>} - Success status
 */
exports.sendSMS = async (to, message) => {
  try {
    // Skip if in development and SMS is disabled
    if (process.env.NODE_ENV === 'development' && !process.env.SMS_API_KEY) {
      console.log(`📲 [DEV] SMS to ${to}: ${message}`);
      return true;
    }

    const payload = {
      username: process.env.SMS_USERNAME,
      to: to,
      message: message,
      from: process.env.SMS_SENDER_ID || 'EquinBank'
    };

    const response = await axios.post(
      process.env.SMS_API_URL || 'https://api.africastalking.com/version1/messaging',
      new URLSearchParams(payload),
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': process.env.SMS_API_KEY
        },
        timeout: 10000
      }
    );

    console.log(`📲 SMS sent to ${to}: ${message.substring(0, 30)}...`);
    return true;
  } catch (error) {
    console.error('❌ SMS sending failed:', error.response?.data || error.message);
    // Don't throw — allow the app to continue
    return false;
  }
};