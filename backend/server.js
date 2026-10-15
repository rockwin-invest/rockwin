require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const fundRoutes = require('./routes/fund');
const paymentRoutes = require('./routes/payment');
const withdrawalRoutes = require('./routes/withdrawal');
const contactRoutes = require('./routes/contact');

const { startCronJobs } = require('./utils/cron');

const app = express();
app.set('trust proxy', 1);

// ============================================================
// SECURITY & PARSING
// ============================================================
app.use(helmet());

// CORS — restrict to known origins. Old code called cors() with no
// options, which allowed any origin. That's fine for a public read-only
// API but not for authenticated endpoints.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

app.use(cors({
    origin: function(origin, callback) {
        // No origin header → server-to-server or same-origin. Allow.
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
        // Postman, curl, and some mobile clients don't send a matching origin.
        // In non-production, allow all. In production, reject unknown origins.
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ============================================================
// RATE LIMITING — applies to all /api/* routes
// ============================================================
const limiter = rateLimit({
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW) || 15) * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// ============================================================
// ROUTES
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fund', fundRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/contact', contactRoutes);

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'RockWin Investment',
        gateway: process.env.PAYMENT_GATEWAY || 'mock',
        timestamp: new Date().toISOString()
    });
});

// ============================================================
// DATABASE + STARTUP
// ============================================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');
        console.log('💳 Payment gateway: ' + (process.env.PAYMENT_GATEWAY || 'mock'));
        startCronJobs();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        // Do not exit — Render will restart if the process dies, and a
        // temporary Atlas outage shouldn't take the whole service down.
    });

// ============================================================
// ERROR HANDLERS (must come after routes)
// ============================================================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err.stack);

    // CORS rejection from the middleware above
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'Origin not allowed.' });
    }

    res.status(500).json({ error: 'Internal server error.' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('🚀 RockWin Investment server running on port ' + PORT);
});

module.exports = app;