const cron = require('node-cron');
const interestService = require('../services/interestService');

// ============================================================
// DAILY INTEREST ACCRUAL
// Fires at 03:00 UTC = 06:00 EAT.
// Render runs in UTC, so this is the wall-clock time Kenyan
// investors expect the daily credit to land.
// ============================================================
function startDailyAccrual() {
    cron.schedule('0 3 * * *', async () => {
        console.log('[CRON] Daily interest accrual starting');
        try {
            await interestService.runDailyAccrual();
        } catch (err) {
            console.error('[CRON] Accrual failed:', err);
        }
    }, {
        timezone: 'UTC'
    });
    console.log('[CRON] Daily accrual scheduled — 06:00 EAT');
}

// ============================================================
// START
// ============================================================
function startCronJobs() {
    startDailyAccrual();
}

module.exports = { startCronJobs };