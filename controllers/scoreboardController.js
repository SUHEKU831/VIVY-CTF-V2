const db = require('../config/database');
const Solve = require('../models/solveModel');

exports.getScoreboard = (req, res) => {
    res.render('scoreboard/scoreboard', {
        title: 'Scoreboard - VIVY CTF',
        activePage: 'scoreboard'
    });
};

exports.getScoreboardData = async (req, res) => {
    try {
        // Get team scores
        const teams = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.id,
                    t.name,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as total_points,
                    MAX(s.created_at) as last_solve
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                GROUP BY t.id
                HAVING total_points > 0
                ORDER BY total_points DESC, last_solve ASC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get individual scores
        const users = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    u.id,
                    u.username,
                    t.name as team_name,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as total_points,
                    MAX(s.created_at) as last_solve
                FROM users u
                LEFT JOIN teams t ON u.team_id = t.id
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                GROUP BY u.id
                HAVING total_points > 0
                ORDER BY total_points DESC, last_solve ASC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get challenge stats
        const challenges = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    c.id,
                    c.title,
                    c.category,
                    c.points,
                    COUNT(s.id) as solves
                FROM challenges c
                LEFT JOIN solves s ON c.id = s.challenge_id
                WHERE c.visible = 1
                GROUP BY c.id
                ORDER BY c.points ASC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Get first bloods
        const firstBloods = await Solve.getFirstBloods();

        res.json({
            teams: teams,
            users: users,
            challenges: challenges,
            firstBloods: firstBloods
        });
    } catch (error) {
        console.error('Scoreboard data error:', error);
        res.status(500).json({ error: 'Error loading scoreboard data' });
    }
};

exports.getChallengeSolves = async (req, res) => {
    try {
        const solves = await Solve.getChallengeSolves(req.params.id);
        res.json(solves);
    } catch (error) {
        console.error('Challenge solves error:', error);
        res.status(500).json({ error: 'Error loading solves' });
    }
};