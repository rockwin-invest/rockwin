const axios = require('axios');
const crypto = require('crypto');

const ACTIVE_GATEWAY = process.env.PAYMENT_GATEWAY || 'mock';

// ============================================================
// MOCK GATEWAY — development only
// ============================================================
const mockGateway = {
    initiateSTKPush: async ({ phoneNumber, amount, reference }) => {
        const checkoutRequestId = 'MOCK-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        const merchantRequestId = 'MOCK-MERCH-' + Date.now();
        console.log('[PAYMENT:mock] STK push to ' + phoneNumber + ' for KES ' + amount + ' — ' + reference);
        return {
            success: true,
            checkoutRequestId,
            merchantRequestId,
            customerMessage: 'Check your phone for the M-PESA prompt.',
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

// ============================================================
// TUMA GATEWAY — M-PESA STK push, settles to I&M account
//
// Flow per Tuma docs:
//   1. POST /auth/token with { email, api_key } → JWT, valid 24h
//   2. POST /payment/stk-push with { amount, phone, callback_url, description }
//      Authorization: Bearer <JWT>
//   3. Response: { success, data: { merchant_request_id, checkout_request_id, customer_message } }
//
// Notes:
//   - Tuma has no signed webhooks. We verify by shared secret in
//     the callback URL's query string (see verifyWebhook below).
//   - Tuma has no dedicated reference field, so we embed our
//     PAY-XXXXXX reference in the `description` for visibility on
//     the customer's M-PESA statement.
// ============================================================
const tumaGateway = {
    baseUrl: process.env.TUMA_API_URL || 'https://api.tuma.co.ke',

    // Cached JWT — reuse until near expiry
    _token: null,
    _tokenExpiresAt: 0,

       getAccessToken: async () => {
        // Reuse if we still have at least 5 minutes of life
        if (tumaGateway._token && Date.now() < tumaGateway._tokenExpiresAt - 5 * 60 * 1000) {
            return tumaGateway._token;
        }

        const email = process.env.TUMA_EMAIL;
        const apiKey = process.env.TUMA_API_KEY;

        if (!email || !apiKey) {
            throw new Error('Tuma credentials not configured (TUMA_EMAIL, TUMA_API_KEY)');
        }

        const response = await axios.post(
            tumaGateway.baseUrl + '/auth/token',
            { email, api_key: apiKey },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );

        const data = response.data || {};

        // Tuma's response shape has varied. Accept every known variant:
        //   { success, token, expires_in }
        //   { message, data: { token, expires_in } }
        //   { access_token }
        const token =
            data.token ||
            data.access_token ||
            (data.data && (data.data.token || data.data.access_token));

        const expiresIn =
            data.expires_in ||
            (data.data && data.data.expires_in) ||
            86400;

        if (!token) {
            // Log the actual response so we can see the shape if it changes again
            console.error('[PAYMENT:tuma] Auth response has no token. Raw body:',
                JSON.stringify(data).slice(0, 500));
            throw new Error('Tuma auth failed: ' + (data.message || data.error || 'no token in response'));
        }

        tumaGateway._token = token;
        tumaGateway._tokenExpiresAt = Date.now() + expiresIn * 1000;

        console.log('[PAYMENT:tuma] Auth token acquired, expires in ' + expiresIn + 's');
        return token;
    },
    initiateSTKPush: async ({ phoneNumber, amount, reference }) => {
        const token = await tumaGateway.getAccessToken();

        // Normalise to 2547XXXXXXXX — Tuma expects no leading +
        let cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
        if (cleanPhone.length === 9) cleanPhone = '254' + cleanPhone;

        // Tuma has no reference field; embed ours in the description
        const description = 'RockWin Investment ' + reference;

        const response = await axios.post(
            tumaGateway.baseUrl + '/payment/stk-push',
            {
                amount: Number(amount),
                phone: cleanPhone,
                callback_url: process.env.PAYMENT_CALLBACK_URL,
                description
            },
            {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                timeout: 25000
            }
        );

        const data = response.data || {};

        if (!data.success || !data.data) {
            throw new Error('Tuma rejected: ' + (data.message || 'unknown'));
        }

        return {
            success: true,
            checkoutRequestId: data.data.checkout_request_id,
            merchantRequestId: data.data.merchant_request_id,
            customerMessage: data.data.customer_message || 'Check your phone.',
            gateway: 'tuma',
            raw: data
        };
    }
};

// ============================================================
// DARAJA GATEWAY — Safaricom direct
// ============================================================
const darajaGateway = {
    getAccessToken: async () => {
        const auth = Buffer.from(
            process.env.DARAJA_CONSUMER_KEY + ':' + process.env.DARAJA_CONSUMER_SECRET
        ).toString('base64');

        const url = process.env.DARAJA_ENV === 'production'
            ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
            : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

        const response = await axios.get(url, {
            headers: { 'Authorization': 'Basic ' + auth },
            timeout: 15000
        });

        if (!response.data || !response.data.access_token) {
            throw new Error('Daraja auth failed: no access token returned');
        }

        return response.data.access_token;
    },

    initiateSTKPush: async ({ phoneNumber, amount, reference }) => {
        const token = await darajaGateway.getAccessToken();

        // Safaricom requires YYYYMMDDHHmmss in Kenya local time (EAT),
        // not UTC. toISOString() would be 3 hours behind.
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp =
            now.getFullYear() +
            pad(now.getMonth() + 1) +
            pad(now.getDate()) +
            pad(now.getHours()) +
            pad(now.getMinutes()) +
            pad(now.getSeconds());

        const password = Buffer.from(
            process.env.DARAJA_SHORTCODE + process.env.DARAJA_PASSKEY + timestamp
        ).toString('base64');

        const url = process.env.DARAJA_ENV === 'production'
            ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
            : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        const response = await axios.post(url, {
            BusinessShortCode: process.env.DARAJA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: Math.floor(amount),
            PartyA: cleanPhone,
            PartyB: process.env.DARAJA_SHORTCODE,
            PhoneNumber: cleanPhone,
            CallBackURL: process.env.PAYMENT_CALLBACK_URL,
            AccountReference: reference.slice(0, 12),
            TransactionDesc: 'RockWin Investment'
        }, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            timeout: 20000
        });

        const data = response.data || {};

        if (data.ResponseCode && data.ResponseCode !== '0') {
            throw new Error('Daraja rejected: ' + (data.ResponseDescription || data.errorMessage || 'unknown'));
        }

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

// ============================================================
// FLUTTERWAVE GATEWAY — M-PESA, bank transfer, card
// Scaffolded; activate by setting PAYMENT_GATEWAY=flutterwave
// ============================================================
const flutterwaveGateway = {
    baseUrl: 'https://api.flutterwave.com/v3',

    headers: () => ({
        'Authorization': 'Bearer ' + process.env.FLW_SECRET_KEY,
        'Content-Type': 'application/json'
    }),

    initiateSTKPush: async ({ phoneNumber, amount, reference, customer }) => {
        const cleanPhone = phoneNumber.replace(/^\+/, '').replace(/[^0-9]/g, '');

        const response = await axios.post(flutterwaveGateway.baseUrl + '/charges?type=mpesa', {
            phone_number: cleanPhone,
            amount: amount,
            currency: 'KES',
            tx_ref: reference,
            email: customer && customer.email ? customer.email : 'investor@rockwininvestment.com',
            fullname: customer && customer.fullName ? customer.fullName : 'RockWin Investor',
            redirect_url: (process.env.SITE_URL || 'https://rockwininvestment.com') + '/dashboard.html'
        }, {
            headers: flutterwaveGateway.headers(),
            timeout: 25000
        });

        const data = response.data || {};

        if (data.status !== 'success') {
            throw new Error('Flutterwave rejected: ' + (data.message || 'unknown'));
        }

        return {
            success: true,
            checkoutRequestId: data.data && (data.data.flw_ref || data.data.tx_ref),
            merchantRequestId: reference,
            customerMessage: data.data && data.data.processor_response
                ? data.data.processor_response
                : 'Check your phone.',
            gateway: 'flutterwave',
            raw: data
        };
    },

    initiateBankTransfer: async ({ amount, reference, customer }) => {
        const response = await axios.post(flutterwaveGateway.baseUrl + '/virtual-account-numbers', {
            email: customer && customer.email ? customer.email : 'investor@rockwininvestment.com',
            is_permanent: false,
            bvn: '',
            tx_ref: reference,
            phonenumber: customer && customer.phoneNumber ? customer.phoneNumber : '',
            firstname: customer && customer.fullName ? customer.fullName.split(' ')[0] : 'RockWin',
            lastname: customer && customer.fullName ? (customer.fullName.split(' ')[1] || 'Investor') : 'Investor',
            narration: 'RockWin Investment deposit'
        }, {
            headers: flutterwaveGateway.headers(),
            timeout: 25000
        });

        const data = response.data || {};

        if (data.status !== 'success') {
            throw new Error('Flutterwave rejected: ' + (data.message || 'unknown'));
        }

        return {
            success: true,
            gateway: 'flutterwave',
            virtualAccount: {
                accountNumber: data.data && data.data.account_number,
                bankName: data.data && data.data.bank_name,
                accountName: data.data && data.data.account_name,
                reference
            },
            raw: data
        };
    },

    initiateCardPayment: async ({ amount, reference, customer }) => {
        const siteUrl = process.env.SITE_URL || 'https://rockwininvestment.com';

        const response = await axios.post(flutterwaveGateway.baseUrl + '/payments', {
            tx_ref: reference,
            amount: amount,
            currency: 'KES',
            redirect_url: siteUrl + '/dashboard.html?payment=complete',
            payment_options: 'card',
            customer: {
                email: customer && customer.email ? customer.email : 'investor@rockwininvestment.com',
                phonenumber: customer && customer.phoneNumber ? customer.phoneNumber : '',
                name: customer && customer.fullName ? customer.fullName : 'RockWin Investor'
            },
            customizations: {
                title: 'RockWin Investment',
                description: 'Deposit to your money market fund account',
                logo: siteUrl + '/assets/logo.png'
            }
        }, {
            headers: flutterwaveGateway.headers(),
            timeout: 25000
        });

        const data = response.data || {};

        if (data.status !== 'success') {
            throw new Error('Flutterwave rejected: ' + (data.message || 'unknown'));
        }

        return {
            success: true,
            gateway: 'flutterwave',
            checkoutUrl: data.data && data.data.link,
            raw: data
        };
    }
};

// ============================================================
// GATEWAY SELECTION
// ============================================================
function getGateway() {
    if (ACTIVE_GATEWAY === 'flutterwave') return flutterwaveGateway;
    if (ACTIVE_GATEWAY === 'tuma') return tumaGateway;
    if (ACTIVE_GATEWAY === 'daraja') return darajaGateway;
    return mockGateway;
}

// ============================================================
// PUBLIC: initiate STK push
// ============================================================
exports.initiateSTKPush = async (params) => {
    const gateway = getGateway();
    try {
        return await gateway.initiateSTKPush(params);
    } catch (err) {
        console.error('[PAYMENT] STK push failed via ' + ACTIVE_GATEWAY + ':', err.message);
        throw err;
    }
};

// ============================================================
// PUBLIC: initiate bank transfer (Flutterwave only)
// ============================================================
exports.initiateBankTransfer = async (params) => {
    if (ACTIVE_GATEWAY !== 'flutterwave') {
        throw new Error('Bank transfer requires PAYMENT_GATEWAY=flutterwave');
    }
    return flutterwaveGateway.initiateBankTransfer(params);
};

// ============================================================
// PUBLIC: initiate card payment (Flutterwave only)
// ============================================================
exports.initiateCardPayment = async (params) => {
    if (ACTIVE_GATEWAY !== 'flutterwave') {
        throw new Error('Card payment requires PAYMENT_GATEWAY=flutterwave');
    }
    return flutterwaveGateway.initiateCardPayment(params);
};

// ============================================================
// PUBLIC: mock completion (dev only)
// ============================================================
exports.simulateMockCompletion = (paymentRequest) => mockGateway.simulateCompletion(paymentRequest);

// ============================================================
// WEBHOOK VERIFICATION
// ============================================================
// Signature strategy per gateway:
//   mock        → accept in dev only, reject in production
//   flutterwave → verif-hash header vs FLW_WEBHOOK_HASH
//   daraja      → shared secret in ?k= query string
//   tuma        → shared secret in ?k= query string (no signing per docs)
// ============================================================
exports.verifyWebhook = (req) => {
    const gateway = ACTIVE_GATEWAY;

    // Mock — no signature to check
    if (gateway === 'mock') {
        if (process.env.NODE_ENV === 'production') {
            console.error('[PAYMENT] Mock gateway active in production — refusing webhook');
            return false;
        }
        return true;
    }

    // Flutterwave — verif-hash header
    if (gateway === 'flutterwave') {
        const expected = process.env.FLW_WEBHOOK_HASH;
        if (!expected) {
            console.error('[PAYMENT] FLW_WEBHOOK_HASH not configured — rejecting webhook');
            return false;
        }
        const received = req.headers['verif-hash'];
        if (!received) {
            console.warn('[PAYMENT] Flutterwave webhook missing verif-hash');
            return false;
        }
        const a = Buffer.from(String(received));
        const b = Buffer.from(String(expected));
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    // Tuma — no signed webhooks per docs. Shared secret in ?k=.
    if (gateway === 'tuma') {
        const expected = process.env.TUMA_WEBHOOK_SECRET;
        if (!expected) {
            console.error('[PAYMENT] TUMA_WEBHOOK_SECRET not configured — rejecting webhook');
            return false;
        }
        const received = req.query && req.query.k;
        if (!received) {
            console.warn('[PAYMENT] Tuma webhook missing shared secret (?k=)');
            return false;
        }
        const a = Buffer.from(String(received));
        const b = Buffer.from(String(expected));
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    // Daraja — no signed webhooks. Shared secret in ?k=.
    if (gateway === 'daraja') {
        const expected = process.env.DARAJA_CALLBACK_SECRET;
        if (!expected) {
            console.error('[PAYMENT] DARAJA_CALLBACK_SECRET not configured — rejecting webhook');
            return false;
        }
        const received = req.query && req.query.k;
        if (!received) {
            console.warn('[PAYMENT] Daraja webhook missing shared secret');
            return false;
        }
        const a = Buffer.from(String(received));
        const b = Buffer.from(String(expected));
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    console.warn('[PAYMENT] Unknown gateway in verifyWebhook:', gateway);
    return false;
};

// ============================================================
// EXPORTS
// ============================================================
exports.ACTIVE_GATEWAY = ACTIVE_GATEWAY;