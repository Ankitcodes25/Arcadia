const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimits = require('../middleware/rateLimit');
const controller = require('../controllers/friendsController');

const router = express.Router();

router.use(authMiddleware);

// Read surfaces.
router.get('/', ...rateLimits.friendRead, controller.listFriends);
router.get('/requests', ...rateLimits.friendRead, controller.listRequests);
router.get('/summary', ...rateLimits.friendRead, controller.getSummary);
router.get('/search', ...rateLimits.friendSearch, controller.search);
router.get('/status/:userId', ...rateLimits.friendRead, controller.getRelationship);

// Lightweight authenticated presence heartbeat. It updates the existing
// refresh-session timestamp; there is no client-supplied online flag.
router.post('/presence/heartbeat', ...rateLimits.friendPresence, controller.heartbeat);

// Writes.
router.post('/requests', ...rateLimits.friendMutation, controller.sendRequest);
router.post('/requests/:requestId/accept', ...rateLimits.friendMutation, controller.acceptRequest);
router.post('/requests/:requestId/reject', ...rateLimits.friendMutation, controller.rejectRequest);
router.delete('/requests/:requestId', ...rateLimits.friendMutation, controller.cancelRequest);
router.post('/requests/:requestId/block', ...rateLimits.friendMutation, controller.blockRequestSender);
router.post('/blocks', ...rateLimits.friendMutation, controller.blockUser);
router.delete('/blocks/:userId', ...rateLimits.friendMutation, controller.unblockUser);

module.exports = router;
