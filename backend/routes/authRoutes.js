const express = require('express');
const controller = require('../controllers/authController');
const accountController = require('../controllers/accountAuthController');
const googleController = require('../controllers/googleAuthController');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimits = require('../middleware/rateLimit');

const router = express.Router();

router.post('/register', ...rateLimits.register, controller.register);
router.post('/login', ...rateLimits.login, controller.login);
router.post('/refresh', ...rateLimits.refresh, controller.refresh);
router.post('/logout', ...rateLimits.logout, controller.logout);
router.post('/logout-all', authMiddleware, ...rateLimits.logoutAll, controller.logoutAll);
router.post('/forgot-password', ...rateLimits.forgotPassword, accountController.forgotPassword);
router.post('/reset-password', ...rateLimits.resetPassword, accountController.resetPassword);
router.get('/google', ...rateLimits.googleStart, googleController.start);
router.get('/google/callback', ...rateLimits.googleCallback, googleController.callback);
router.post('/google/exchange', ...rateLimits.googleExchange, googleController.exchange);
router.get('/me', authMiddleware, controller.me);

module.exports = router;
