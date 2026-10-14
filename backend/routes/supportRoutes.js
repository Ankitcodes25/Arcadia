const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/supportReportController');
const rateLimits = require('../middleware/rateLimit');

const router = express.Router();

// Help & Support is only reachable while signed in, and every report is tied
// to the account that filed it.
router.use(authMiddleware);

// POST /api/v1/support/reports with { category, subject, description }
router.post('/reports', ...rateLimits.supportReport, controller.createReport);

module.exports = router;
