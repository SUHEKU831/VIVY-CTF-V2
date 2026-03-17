const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/auth');

router.get('/dashboard', isAdmin, adminController.getDashboard);
router.get('/challenges', isAdmin, adminController.getChallenges);
router.get('/challenges/add', isAdmin, adminController.getAddChallenge);
router.post('/challenges/add', isAdmin, adminController.postAddChallenge);
router.get('/challenges/edit/:id', isAdmin, adminController.getEditChallenge);
router.post('/challenges/edit/:id', isAdmin, adminController.postEditChallenge);
router.post('/challenges/delete/:id', isAdmin, adminController.deleteChallenge);
router.post('/challenges/toggle/:id', isAdmin, adminController.toggleVisibility);
router.get('/users', isAdmin, adminController.getUsers);
router.get('/teams', isAdmin, adminController.getTeams);

module.exports = router;