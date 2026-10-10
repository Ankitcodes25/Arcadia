const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/accountProfileController');
const rateLimits = require('../middleware/rateLimit');

const router = express.Router();

// Public, non-enumerating availability lookup.
router.get('/username-availability', ...rateLimits.usernameAvailability, controller.checkUsernameAvailability);

// Every other account endpoint requires the existing access-token middleware.
router.use(authMiddleware);

// GET /api/v1/account/profile
router.get('/profile', controller.getProfile);
// GET /api/v1/account/settings
router.get('/settings', controller.getSettings);
// GET /api/v1/account/preferences
// Sound and privacy preferences. Distinct from /settings, which is the account
// profile read and stays read-only.
router.get('/preferences', ...rateLimits.preferences, controller.getPreferences);
// PATCH /api/v1/account/preferences
// A partial write: only the keys that were sent are validated and applied.
router.patch('/preferences', ...rateLimits.preferences, controller.updatePreferences);
// POST /api/v1/account/preferences/reset
// Writes the canonical defaults back and returns them. Preferences only:
// identity, XP and match history are outside this endpoint by design.
router.post('/preferences/reset', ...rateLimits.preferences, controller.resetPreferences);
// DELETE /api/v1/account
// Permanent account deletion. Requires the typed confirmation word plus
// password re-authentication (Google-only accounts: typed confirmation only).
router.delete('/', ...rateLimits.accountDeletion, controller.deleteAccount);
// GET /api/v1/account/matches
// The signed-in account's own completed matches. Read only: there is no route
// that creates a match, so a client cannot report a result.
router.get('/matches', controller.getMatchHistory);
// PATCH /api/v1/account/username
router.patch('/username', ...rateLimits.usernameChange, controller.setUsername);
// PATCH /api/v1/account/profile
router.patch('/profile', controller.updateProfile);
// PATCH /api/v1/account/avatar
router.patch('/avatar', controller.updateAvatar);
// POST /api/v1/account/change-password
router.post('/change-password', ...rateLimits.changePassword, controller.changePassword);
// GET /api/v1/account/sessions
router.get('/sessions', ...rateLimits.sessionManagement, controller.listSessions);
// POST /api/v1/account/sessions/logout-others
router.post('/sessions/logout-others', ...rateLimits.sessionManagement, controller.logoutOtherSessions);
// DELETE /api/v1/account/sessions/:sessionId
router.delete('/sessions/:sessionId', ...rateLimits.sessionManagement, controller.revokeSession);

module.exports = router;
