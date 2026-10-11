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

const { startCronJobs } = require('./utils/cron');

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fund', fundRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'RockWin Investment',
        gateway: process.env.PAYMENT_GATEWAY || 'mock',
        timestamp: new Date().toISOString()
    });
});

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');
        console.log('💳 Payment gateway: ' + (process.env.PAYMENT_GATEWAY || 'mock'));
        startCronJobs();
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err.stack);
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