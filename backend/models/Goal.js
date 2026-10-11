const mongoose = require('mongoose');

const GoalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    icon: { type: String, default: '🚨' },
    name: { type: String, required: true, trim: true },
    target: { type: Number, required: true, min: 1000 },
    saved: { type: Number, default: 0, min: 0 },
    deadline: { type: Date, required: true },
    monthlyTarget: { type: Number, default: 0, min: 0 },
    autoInvest: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

GoalSchema.index({ userId: 1, completed: 1 });

module.exports = mongoose.model('Goal', GoalSchema);
