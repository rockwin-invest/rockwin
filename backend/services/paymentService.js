const axios = require('axios');

const ACTIVE_GATEWAY = process.env.PAYMENT_GATEWAY || 'mock';

// MOCK GATEWAY
const mockGateway = {
    initiateSTKPush: async ({ phoneNumber, amount, reference }) => {
        const checkoutRequestId = 'MOCK-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const merchantRequestId = 'MOCK-MERCH-' + Date.now();
        console.log('[MOCK] STK Push:', phoneNumber, 'KES', amount, 'Ref:', reference);
        return {
            success: true,
            checkoutRequestId,
            merchantRequestId,
            customerMessage: 'Success. Check your phone for the M-Pesa prompt.',
            gateway: 'mock',
            raw: { mock: true, initiatedAt: new Date().toISOString() }
        };
    },
    simulateCompletion: () => {
        const succeeded = Math.random() > 0.10;
        if (succeeded) {
            return {
                status: 'completed',
                gatewayReceipt: 'MOCK-RCPT-' + Math.floor(Math.random() * 1000000),
                raw: { mock: true, completedAt: new Date().toISOString() }
            };
        }
        return {
            status: 'failed',
            failureReason: 'Insufficient funds (mock)',
            raw: { mock: true, failedAt: new Date().toISOString() }
        };
    }
};

// TUMA GATEWAY
const tumaGateway = {
    initiateSTKPush: async ({ phoneNumber, amount, reference }) => {
        const url = process.env.TUMA_API_URL || 'https://api.tuma.co.ke/payment/stk-push';
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
        const response = await axios.post(url, {
            phone_number: cleanPhone,
            amount: amount,
            account_reference: reference,
            transaction_desc: 'RockWin Deposit',
            callback_url: process.env.PAYMENT_CALLBACK_URL
        }, {
            headers: {
                'Authorization': 'Bearer ' + process.env.TUMA_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 20000
        });
        const data = response.data || {};
        return {
            success: true,
            checkoutRequestId: data.CheckoutRequestID || data.checkout_request_id,
            merchantRequestId: data.MerchantRequestID || data.merchant_request_id,
            customerMessage: data.CustomerMessage || 'Check your phone.',
            gateway: 'tuma',
            raw: data
        };
    }
};

// DARAJA GATEWAY
const darajaGateway = {
    getAccessToken: async () => {
        const auth = Buffer.from(
            process.env.DARAJA_CONSUMER_KEY + ':' + process.env.DARAJA_CONSUMER_SECRET
        ).toString('base64');
        const url = process.env.DARAJA_ENV === 'production'
            ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
            : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
        const response = await axios.get(url, { headers: { 'Authorization': 'Basic ' + auth } });
        return response.data.access_token;
    },
    initiateSTKPush: async ({ phoneNumber, amount, reference }) => {
        const token = await darajaGateway.getAccessToken();
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        const password = Buffer.from(
            process.env.DARAJA_SHORTCODE + process.env.DARAJA_PASSKEY + timestamp
        ).toString('base64');
        const url = process.env.DARAJA_ENV === 'production'
            ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
            : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
        const response = await axios.post(url, {
            BusinessShortCode: process.env.DARAJA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.floor(amount),
            PartyA: phoneNumber.replace(/[^0-9]/g, ''),
            PartyB: process.env.DARAJA_SHORTCODE,
            PhoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
            CallBackURL: process.env.PAYMENT_CALLBACK_URL,
            AccountReference: reference,
            TransactionDesc: 'RockWin Investment'
        }, { headers: { 'Authorization': 'Bearer ' + token } });
        const data = response.data || {};
        return {
            success: true,
            checkoutRequestId: data.CheckoutRequestID,
            merchantRequestId: data.MerchantRequestID,
            customerMessage: data.CustomerMessage || 'Check your phone.',
            gateway: 'daraja',
            raw: data
        };
    }
};

function getGateway() {
    if (ACTIVE_GATEWAY === 'tuma') return tumaGateway;
    if (ACTIVE_GATEWAY === 'daraja') return darajaGateway;
    return mockGateway;
}

exports.initiateSTKPush = async (params) => {
    const gateway = getGateway();
    try {
        return await gateway.initiateSTKPush(params);
    } catch (err) {
        console.error('[PAYMENT] STK Push error:', err.message);
        throw err;
    }
};

exports.simulateMockCompletion = (paymentRequest) => mockGateway.simulateCompletion(paymentRequest);
exports.ACTIVE_GATEWAY = ACTIVE_GATEWAY;
exports.verifyWebhook = (req) => true;