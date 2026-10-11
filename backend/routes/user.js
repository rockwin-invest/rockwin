const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');

router.get('/profile', auth, userController.getProfile);
router.get('/ledger', auth, userController.getLedger);
router.get('/stats', auth, userController.getStats);
router.get('/interest-history', auth, userController.getInterestHistory);
router.put('/sms-preference', auth, userController.updateSmsPreference);
router.put('/profile', auth, userController.updateProfile);
router.post('/change-password', auth, authController.changePassword);

// Goals
router.get('/goals', auth, userController.getGoals);
router.post('/goals', auth, userController.createGoal);
router.put('/goals/:id', auth, userController.updateGoal);
router.put('/goals/:id/auto-invest', auth, userController.toggleGoalAutoInvest);
router.post('/goals/:id/contribute', auth, userController.contributeToGoal);
router.delete('/goals/:id', auth, userController.deleteGoal);

module.exports = router;