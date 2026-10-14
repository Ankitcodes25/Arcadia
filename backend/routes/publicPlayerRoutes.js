const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimits = require('../middleware/rateLimit');
const controller = require('../controllers/publicPlayerController');

const router = express.Router();

router.use(authMiddleware);
router.get('/profile', ...rateLimits.playerProfile, controller.getProfile);

module.exports = router;
