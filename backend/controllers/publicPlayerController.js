const publicPlayerService = require('../services/publicPlayerService');

async function getProfile(req, res, next) {
  res.set('Cache-Control', 'no-store');
  try {
    const profile = await publicPlayerService.getPublicPlayerProfile({
      playerId: req.query.playerId,
      username: req.query.username,
      viewerId: req.user.id,
    });
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getProfile,
};
