const User = require('../models/User');
const Transaction = require('../models/Transaction');
const InterestAccrual = require('../models/InterestAccrual');
const FundPerformance = require('../models/FundPerformance');
const TaxLiability = require('../models/TaxLiability');
const emailService = require('./emailService');
const navService = require('./navService');

const WHT_RATE = 0.15;

// ============================================================
// ACCRUE FOR ONE USER
// ============================================================
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
        description: 'Daily interest credit',
        reference: 'Daily accrual',
        accrualDate: new Date()
    });

    // Fire-and-forget — don't await so a slow email provider doesn't stall accrual.
    // Default is OFF — the user opts in from Settings. At scale, sending an email
    // per user per day hits Resend rate limits and hurts sending reputation.
    if (user.interestAlertsEnabled === true && user.email) {
        emailService
            .sendInterestCreditEmail(user, netInterest, user.portfolioValue)
            .catch((e) => console.warn('[ACCRUAL] Interest email failed for ' + user.email + ':', e.message));
    }

    return { grossInterest, taxWithheld, netInterest, unitsCredited };
};

// ============================================================
// RUN DAILY ACCRUAL FOR ALL ACTIVE USERS
// ============================================================
exports.runDailyAccrual = async () => {
    const start = Date.now();
    console.log('[ACCRUAL] Starting daily interest accrual');

    try {
        const annualYield = await navService.getCurrentYield();
        const currentNav = await navService.getCurrentNav();
        const nextNav = navService.computeNextNav(currentNav, annualYield);

        const users = await User.find({ status: 'active', unitsHeld: { $gt: 0 } });

        let totalGross = 0;
        let totalTax = 0;
        let totalNet = 0;
        let successCount = 0;
        let errorCount = 0;

        for (const user of users) {
            try {
                const result = await exports.accrueForUser(user, currentNav, annualYield);
                if (result) {
                    totalGross += result.grossInterest;
                    totalTax += result.taxWithheld;
                    totalNet += result.netInterest;
                    successCount++;
                }
            } catch (err) {
                console.error('[ACCRUAL] Failed for ' + user.accountNumber + ':', err.message);
                errorCount++;
            }
        }

        const aumAgg = await User.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: null, total: { $sum: '$portfolioValue' }, units: { $sum: '$unitsHeld' } } }
        ]);

        const aum = (aumAgg[0] && aumAgg[0].total) || 0;
        const totalUnitsOutstanding = (aumAgg[0] && aumAgg[0].units) || 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Fund performance snapshot
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

        // Tax liability accumulator — one document per day.
        // Summing this over a date range gives the amount owed to KRA for any period.
        await TaxLiability.findOneAndUpdate(
            { date: today },
            {
                $inc: {
                    grossInterest: totalGross,
                    taxWithheld: totalTax,
                    netInterest: totalNet,
                    usersAccrued: successCount
                }
            },
            { upsert: true, new: true }
        );

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(
            '[ACCRUAL] Complete in ' + elapsed + 's — ' +
            successCount + ' users credited, ' +
            'KES ' + totalNet.toFixed(2) + ' net, ' +
            'KES ' + totalTax.toFixed(2) + ' withheld, ' +
            errorCount + ' errors'
        );

        return {
            successCount,
            errorCount,
            totalGross,
            totalTax,
            totalNet,
            totalInterest: totalNet, // kept for backward compatibility
            elapsed
        };
    } catch (err) {
        console.error('[ACCRUAL] Fatal error:', err);
        throw err;
    }
};