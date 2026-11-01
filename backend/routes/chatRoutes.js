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

module.exports = router;
