const express = require('express');
const controller = require('../controllers/adminAuthController');
const requireAdminSession = require('../middleware/requireAdminSession');
const { adminLoginRateLimit } = require('../middleware/adminLoginRateLimit');

const router = express.Router();

// Admin Panel sign-in for the single env-configured admin account. There is
// deliberately no registration route: the account exists only in backend/.env.

// POST /api/admin/auth/login with { email, password }
router.post('/login', adminLoginRateLimit, controller.login);
// GET /api/admin/auth/me
router.get('/me', requireAdminSession, controller.me);
// POST /api/admin/auth/logout
router.post('/logout', controller.logout);

module.exports = router;
