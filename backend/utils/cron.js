const cron = require('node-cron');
const interestService = require('../services/interestService');
const User = require('../models/User');
const smsService = require('../services/smsService');
const Goal = require('../models/Goal');

function startDailyAccrual() {
    cron.schedule('0 3 * * *', async () => {
        console.log('⏰ Cron: daily interest accrual');
        try {
            await interestService.runDailyAccrual();
        } catch (err) {
            console.error('❌ Cron accrual failed:', err);
        }
    });
    console.log('✅ Daily accrual cron scheduled (6:00 AM EAT)');
}

function startMonthlyAutoInvest() {
    cron.schedule('30 3 1 * *', async () => {
        console.log('⏰ Cron: monthly goal auto-invest');
        try {
            const goals = await Goal.find({ autoInvest: true, completed: false, monthlyTarget: { $gt: 0 } });
            for (const goal of goals) {
                const user = await User.findById(goal.userId);
                if (!user || user.status !== 'active') continue;
                const amount = goal.monthlyTarget;
                if (user.portfolioValue < amount) continue;
                goal.saved += amount;
                if (goal.saved >= goal.target) {
                    goal.completed = true;
                    goal.completedAt = new Date();
                    try {
                        await smsService.sendSMS(user.phoneNumber, '🎉 RockWin: You completed your "' + goal.name + '" goal!');
                    } catch (e) { /* ignore */ }
                }
                await goal.save();
            }
            console.log('✅ Auto-invest complete for ' + goals.length + ' goals');
        } catch (err) {
            console.error('❌ Auto-invest failed:', err);
        }
    });
    console.log('✅ Monthly auto-invest cron scheduled (1st @ 6:30 AM EAT)');
}

function startCronJobs() {
    startDailyAccrual();
    startMonthlyAutoInvest();
}

module.exports = { startCronJobs };
