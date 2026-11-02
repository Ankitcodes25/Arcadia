const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimits = require('../middleware/rateLimit');
const controller = require('../controllers/chatController');

const router = express.Router();

router.use(authMiddleware);

router.get('/conversations', ...rateLimits.chatRead, controller.listConversations);
router.get('/conversations/:friendId/messages', ...rateLimits.chatRead, controller.listMessages);
router.post('/conversations/:friendId/messages', ...rateLimits.chatSend, controller.sendMessage);
router.post('/conversations/:friendId/read', ...rateLimits.chatMutation, controller.markRead);

// Clear chat. `scope: "me"` hides history from the caller only; `scope: "both"`
// creates a request that deletes nothing until the other participant accepts.
router.get('/conversations/:friendId/clear', ...rateLimits.chatRead, controller.getClearState);
router.post('/conversations/:friendId/clear', ...rateLimits.chatMutation, controller.clearChat);
router.post('/clear-requests/:requestId/accept', ...rateLimits.chatMutation, controller.acceptClearRequest);
router.post('/clear-requests/:requestId/decline', ...rateLimits.chatMutation, controller.declineClearRequest);
router.post('/clear-requests/:requestId/acknowledge', ...rateLimits.chatMutation, controller.acknowledgeClearRequest);
router.delete('/clear-requests/:requestId', ...rateLimits.chatMutation, controller.cancelClearRequest);

module.exports = router;
