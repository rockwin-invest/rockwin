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
// TUMA GATEWAY — settles to I&M account
// ============================================================
const tumaGateway = {
    initiateSTKPush: async ({ phoneNumber, amount, reference }) => {
        const url = process.env.TUMA_API_URL || 'https://api.tuma.co.ke/payment/stk-push';
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        const response = await axios.post(url, {
            phone_number: cleanPhone,
            amount: amount,
            account_reference: reference,
            transaction_desc: 'RockWin Investment deposit',
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

        // Safaricom requires the format YYYYMMDDHHmmss in Kenya local time.
        // Using toISOString() returns UTC, which is 3 hours behind EAT —
        // that produces timestamp mismatches in the sandbox. Build from local time instead.
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
            AccountReference: reference.slice(0, 12), // Safaricom limit
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
// and supplying FLW_SECRET_KEY + FLW_WEBHOOK_HASH.
// ============================================================
const flutterwaveGateway = {
    baseUrl: 'https://api.flutterwave.com/v3',

    headers: () => ({
        'Authorization': 'Bearer ' + process.env.FLW_SECRET_KEY,
        'Content-Type': 'application/json'
    }),

    // M-PESA STK push via Flutterwave's charge endpoint
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

    // Bank transfer — creates a virtual account for this specific payment
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

    // Card — creates a hosted checkout URL for redirection
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
// Every gateway that sends a webhook MUST be verified, or an
// attacker who learns the callback URL can POST a fake "success"
// and credit their own account. This is the single most important
// security check in the payment flow.
//
// In dev with the mock gateway, we log and accept — there is no
// webhook to verify. In production with a real gateway, we
// reject anything that doesn't carry the correct signature.
exports.verifyWebhook = (req) => {
    const gateway = ACTIVE_GATEWAY;

    // Mock gateway — no signature exists to check
    if (gateway === 'mock') {
        if (process.env.NODE_ENV === 'production') {
            console.error('[PAYMENT] Mock gateway active in production — refusing webhook');
            return false;
        }
        return true;
    }

    // Flutterwave — compares the `verif-hash` header against the
    // secret you configured in their dashboard.
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
        // Constant-time comparison to avoid timing attacks
        const a = Buffer.from(String(received));
        const b = Buffer.from(String(expected));
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    // Tuma — HMAC-SHA256 of the raw body against TUMA_WEBHOOK_SECRET.
    // Tuma sends the hex digest in the `x-tuma-signature` header.
    if (gateway === 'tuma') {
        const secret = process.env.TUMA_WEBHOOK_SECRET;
        if (!secret) {
            console.error('[PAYMENT] TUMA_WEBHOOK_SECRET not configured — rejecting webhook');
            return false;
        }
        const received = req.headers['x-tuma-signature'];
        if (!received) {
            console.warn('[PAYMENT] Tuma webhook missing x-tuma-signature');
            return false;
        }
        const raw = typeof req.rawBody === 'string'
            ? req.rawBody
            : JSON.stringify(req.body || {});
        const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');

        const a = Buffer.from(String(received));
        const b = Buffer.from(String(expected));
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    }

    // Daraja — Safaricom does not sign webhooks. The only available
    // protections are (a) keeping the callback URL secret and (b)
    // IP-whitelisting Safaricom's ranges at the proxy layer.
    // Until that IP whitelist is enforced at the load balancer,
    // treat the endpoint as untrusted and require an internal
    // shared secret to be present in the URL query string.
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