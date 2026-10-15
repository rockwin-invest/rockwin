const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const contactController = require('../controllers/contactController');

// Prevent spam — 5 submissions per IP per hour
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many messages sent. Please try again later or contact us on WhatsApp.' }
});

router.post('/', contactLimiter, contactController.submitContactForm);

module.exports = router;