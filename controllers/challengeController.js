const Challenge = require('../models/challengeModel');
const Solve = require('../models/solveModel');
const User = require('../models/userModel');

exports.getChallenges = async (req, res) => {
    try {
        const challenges = await Challenge.getAll(true);
        const solvedChallenges = await Solve.getUserSolves(req.session.user.id);
        const solvedIds = solvedChallenges.map(s => s.id);
        
        // Group by category
        const categorized = {};
        challenges.forEach(challenge => {
            if (!categorized[challenge.category]) {
                categorized[challenge.category] = [];
            }
            categorized[challenge.category].push({
                ...challenge,
                solved: solvedIds.includes(challenge.id)
            });
        });

        res.render('challenge/challenges', {
            title: 'Challenges - VIVY CTF',
            activePage: 'challenges',
            categories: categorized,
            solvedCount: solvedChallenges.length
        });
    } catch (error) {
        console.error('Challenges error:', error);
        req.flash('error', 'Error loading challenges');
        res.redirect('/');
    }
};

exports.getChallenge = async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        
        if (!challenge) {
            req.flash('error', 'Challenge not found');
            return res.redirect('/challenges');
        }

        const solved = await Solve.checkUserSolved(req.session.user.id, challenge.id);
        const solves = await Solve.getChallengeSolves(challenge.id);

        res.render('challenge/details', {
            title: `${challenge.title} - VIVY CTF`,
            activePage: 'challenges',
            challenge: challenge,
            solved: solved,
            solves: solves
        });
    } catch (error) {
        console.error('Challenge detail error:', error);
        req.flash('error', 'Error loading challenge');
        res.redirect('/challenges');
    }
};

exports.submitFlag = async (req, res) => {
    try {
        const { flag } = req.body;
        const challengeId = req.params.id;

        if (!flag) {
            return res.status(400).json({ error: 'Flag is required' });
        }

        const challenge = await Challenge.findById(challengeId);
        
        if (!challenge) {
            return res.status(404).json({ error: 'Challenge not found' });
        }

        // Check if already solved
        const alreadySolved = await Solve.checkUserSolved(req.session.user.id, challengeId);
        if (alreadySolved) {
            return res.status(400).json({ error: 'You already solved this challenge' });
        }

        // Check flag (case insensitive)
        if (challenge.flag.toLowerCase().trim() !== flag.toLowerCase().trim()) {
            return res.status(400).json({ error: 'Incorrect flag' });
        }

        // Record solve
        await Solve.create(req.session.user.id, challengeId, req.session.user.team_id);

        // Update user stats
        const stats = await User.getStats(req.session.user.id);
        req.session.user.stats = stats;

        // Check if first blood
        const solves = await Solve.getChallengeSolves(challengeId);
        const isFirstBlood = solves.length === 1;

        res.json({
            success: true,
            message: 'Correct flag!',
            firstBlood: isFirstBlood,
            points: challenge.points
        });
    } catch (error) {
        console.error('Flag submission error:', error);
        res.status(500).json({ error: 'Error submitting flag' });
    }
};