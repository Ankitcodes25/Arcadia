/*
 * Admin authentication routes — the ONLY routes this service exposes.
 *
 * There is deliberately no registration endpoint, no account management and
 * no player/report/moderation API here. The single admin account is created
 * through environment configuration, never through HTTP.
 */

const express = require('express');
const controller = require('../controllers/adminAuthController');
const requireAdminSession = require('../middleware/adminAuth');
const { createLoginRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

/* The resolver keys rate limits on the submitted email (the login identifier). */
const loginRateLimiter = createLoginRateLimiter((req) => req.body?.email);

router.post('/login', loginRateLimiter, controller.login);
router.get('/me', requireAdminSession, controller.me);
router.post('/logout', controller.logout);

module.exports = router;
