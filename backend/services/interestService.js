const User = require('../models/User');
const Transaction = require('../models/Transaction');
const InterestAccrual = require('../models/InterestAccrual');
const FundPerformance = require('../models/FundPerformance');
const smsService = require('./smsService');
const navService = require('./navService');

const WHT_RATE = 0.15;

exports.accrueForUser = async (user, navPerUnit, annualYield) => {
    if (user.status !== 'active' || user.unitsHeld <= 0) return null;

    const portfolioBefore = user.unitsHeld * navPerUnit;
    const dailyRate = annualYield / 365;

    const grossInterest = portfolioBefore * dailyRate;
    const taxWithheld = grossInterest * WHT_RATE;
    const netInterest = grossInterest - taxWithheld;
    const unitsCredited = netInterest / navPerUnit;

    user.unitsHeld += unitsCredited;
    user.portfolioValue = user.unitsHeld * navPerUnit;
    user.ytdInterestEarned = (user.ytdInterestEarned || 0) + netInterest;
    user.lifetimeInterestEarned = (user.lifetimeInterestEarned || 0) + netInterest;
    user.lastInterestAccrualDate = new Date();
    await user.save();

    await InterestAccrual.create({
        userId: user._id,
        accrualDate: new Date(),
        portfolioBefore,
        interestAmount: grossInterest,
        taxWithheld,
        netInterest,
        unitsCredited,
        navPerUnit,
        annualYieldRate: annualYield
    });

    await Transaction.create({
        userId: user._id,
        accountNumber: user.accountNumber,
        type: 'interest',
        amount: netInterest,
        unitsAffected: unitsCredited,
        navAtTransaction: navPerUnit,
        portfolioAfter: user.portfolioValue,
        description: 'Daily Interest Credit',
        reference: 'Daily accrual',
        accrualDate: new Date()
    });

    if (user.interestAlertsEnabled && user.smsEnabled) {
        try {
            await smsService.sendSMS(
                user.phoneNumber,
                'RockWin: KES ' + netInterest.toFixed(2) + ' interest credited. Portfolio: KES ' + user.portfolioValue.toFixed(2)
            );
        } catch (e) {
            console.warn('SMS failed:', e.message);
        }
    }

    return { netInterest, unitsCredited };
};

exports.runDailyAccrual = async () => {
    const start = Date.now();
    console.log('🔄 Starting daily interest accrual...');

    try {
        const annualYield = await navService.getCurrentYield();
        const currentNav = await navService.getCurrentNav();
        const nextNav = navService.computeNextNav(currentNav, annualYield);

        const users = await User.find({ status: 'active', unitsHeld: { $gt: 0 } });

        let totalInterest = 0;
        let successCount = 0;
        let errorCount = 0;

        for (const user of users) {
            try {
                const result = await exports.accrueForUser(user, currentNav, annualYield);
                if (result) {
                    totalInterest += result.netInterest;
                    successCount++;
                }
            } catch (err) {
                console.error('Failed for ' + user.accountNumber + ':', err.message);
                errorCount++;
            }
        }

        const aumAgg = await User.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: null, total: { $sum: '$portfolioValue' }, units: { $sum: '$unitsHeld' } } }
        ]);

        const aum = aumAgg[0]?.total || 0;
        const totalUnitsOutstanding = aumAgg[0]?.units || 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await FundPerformance.findOneAndUpdate(
            { date: today },
            {
                date: today,
                navPerUnit: nextNav,
                dailyYieldRate: annualYield / 365,
                annualYieldRate: annualYield,
                aum,
                activeInvestors: successCount,
                totalUnitsOutstanding
            },
            { upsert: true, new: true }
        );

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log('✅ Accrual complete in ' + elapsed + 's — ' + successCount + ' users, KES ' + totalInterest.toFixed(2) + ' credited, ' + errorCount + ' errors');

        return { successCount, errorCount, totalInterest, elapsed };
    } catch (err) {
        console.error('❌ Accrual error:', err);
        throw err;
    }
};
