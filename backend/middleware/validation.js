const Joi = require('joi');

const signupSchema = Joi.object({
    fullName: Joi.string().min(2).max(100).required().messages({
        'string.min': 'Full name must be at least 2 characters.'
    }),
    phoneNumber: Joi.string().pattern(/^\+254[0-9]{9}$/).required().messages({
        'string.pattern.base': 'Phone number must be in format +254XXXXXXXXX'
    }),
    email: Joi.string().email().required().messages({
        'string.email': 'Please enter a valid email address.'
    }),
    idNumber: Joi.string().min(5).max(20).required().messages({
        'string.min': 'ID number must be at least 5 characters.'
    }),
    dateOfBirth: Joi.date().iso().required().messages({
        'date.base': 'Please enter a valid date of birth.'
    }),
    password: Joi.string().min(6).required().messages({
        'string.min': 'Password must be at least 6 characters.'
    }),
    nextOfKin: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        phone: Joi.string().pattern(/^\+254[0-9]{9}$/).required(),
        relationship: Joi.string().min(2).max(50).required()
    }).required()
});

const loginSchema = Joi.object({
    phoneNumber: Joi.string().pattern(/^\+254[0-9]{9}$/).required(),
    password: Joi.string().required()
});

const forgotPasswordSchema = Joi.object({
    phoneNumber: Joi.string().pattern(/^\+254[0-9]{9}$/).required()
});

const resetPasswordSchema = Joi.object({
    phoneNumber: Joi.string().pattern(/^\+254[0-9]{9}$/).required(),
    otp: Joi.string().length(6).pattern(/^[0-9]{6}$/).required(),
    newPassword: Joi.string().min(6).required()
});

exports.validateSignup = (req, res, next) => {
    const { error } = signupSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    next();
};

exports.validateLogin = (req, res, next) => {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    next();
};

exports.validateForgotPassword = (req, res, next) => {
    const { error } = forgotPasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    next();
};

exports.validateResetPassword = (req, res, next) => {
    const { error } = resetPasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });
    next();
};
