const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const controller = require('../controllers/adminUserController');
const reportController = require('../controllers/supportReportController');
const rateLimits = require('../middleware/rateLimit');

const router = express.Router();

// Every admin endpoint requires a current access token and the current DB role.
router.use(authMiddleware, requireAdmin);

// GET /api/v1/admin/users?page=1&limit=20
router.get('/users', controller.listUsers);
// GET /api/v1/admin/users/:userId
router.get('/users/:userId', controller.getUserDetails);
// PATCH /api/v1/admin/users/:userId/status with { status: "ACTIVE" | "INACTIVE" }
router.patch('/users/:userId/status', ...rateLimits.adminMutation, controller.updateUserStatus);
// POST /api/v1/admin/users/:userId/logout-all
router.post('/users/:userId/logout-all', ...rateLimits.adminMutation, controller.logoutAllUserSessions);
// PATCH /api/v1/admin/users/:userId/role with { role: "USER" | "ADMIN" }
router.patch('/users/:userId/role', ...rateLimits.adminMutation, controller.updateUserRole);
// GET /api/v1/admin/reports?page=1&limit=20&status=OPEN|RESOLVED (newest first)
router.get('/reports', reportController.listReports);
// PATCH /api/v1/admin/reports/:reportId/status with { status: "OPEN" | "RESOLVED" }
router.patch('/reports/:reportId/status', ...rateLimits.adminMutation, reportController.updateReportStatus);

module.exports = router;
