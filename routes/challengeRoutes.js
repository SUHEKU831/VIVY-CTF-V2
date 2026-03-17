const express = require('express');
const router = express.Router();
const challengeController = require('../controllers/challengeController');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, challengeController.getChallenges);
router.get('/:id', isAuthenticated, challengeController.getChallenge);
router.post('/:id/submit', isAuthenticated, challengeController.submitFlag);

module.exports = router;