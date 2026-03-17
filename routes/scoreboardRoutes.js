const express = require('express');
const router = express.Router();
const scoreboardController = require('../controllers/scoreboardController');

router.get('/', scoreboardController.getScoreboard);
router.get('/api/data', scoreboardController.getScoreboardData);
router.get('/challenge/:id/solves', scoreboardController.getChallengeSolves);

module.exports = router;