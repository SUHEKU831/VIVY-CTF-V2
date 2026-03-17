const Challenge = require('../models/challengeModel');
const User = require('../models/userModel');
const Team = require('../models/teamModel');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');

exports.getDashboard = async (req, res) => {
    try {
        // Get statistics
        const stats = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM teams) as total_teams,
                    (SELECT COUNT(*) FROM challenges) as total_challenges,
                    (SELECT COUNT(*) FROM challenges WHERE visible = 1) as visible_challenges,
                    (SELECT COUNT(*) FROM solves) as total_solves
            `, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Recent activity
        const recentSolves = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    s.created_at,
                    u.username,
                    c.title as challenge_title,
                    c.points
                FROM solves s
                JOIN users u ON s.user_id = u.id
                JOIN challenges c ON s.challenge_id = c.id
                ORDER BY s.created_at DESC
                LIMIT 10
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('admin/dashboard', {
            title: 'Admin Dashboard - VIVY CTF',
            activePage: 'admin',
            stats: stats,
            recentSolves: recentSolves
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        req.flash('error', 'Error loading dashboard');
        res.redirect('/');
    }
};

exports.getChallenges = async (req, res) => {
    try {
        const challenges = await Challenge.getAll(false);
        res.render('admin/challenges', {
            title: 'Manage Challenges - VIVY CTF',
            activePage: 'admin',
            challenges: challenges
        });
    } catch (error) {
        console.error('Admin challenges error:', error);
        req.flash('error', 'Error loading challenges');
        res.redirect('/admin/dashboard');
    }
};

exports.getAddChallenge = (req, res) => {
    res.render('admin/addChallenge', {
        title: 'Add Challenge - VIVY CTF',
        activePage: 'admin'
    });
};

exports.postAddChallenge = async (req, res) => {
    try {
        const { title, description, category, points, flag, visible } = req.body;
        
        if (!title || !description || !category || !points || !flag) {
            req.flash('error', 'All fields are required');
            return res.redirect('/admin/challenges/add');
        }

        let filePath = null;
        
        // Handle file upload
        if (req.files && req.files.challenge_file) {
            const file = req.files.challenge_file;
            const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const uploadPath = path.join(__dirname, '../public/challenges', fileName);
            
            await file.mv(uploadPath);
            filePath = `/challenges/${fileName}`;
        }

        await Challenge.create({
            title,
            description,
            category,
            points: parseInt(points),
            flag,
            file_path: filePath,
            visible: visible === 'on'
        });

        req.flash('success', 'Challenge added successfully');
        res.redirect('/admin/challenges');
    } catch (error) {
        console.error('Add challenge error:', error);
        req.flash('error', 'Error adding challenge');
        res.redirect('/admin/challenges/add');
    }
};

exports.getEditChallenge = async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        
        if (!challenge) {
            req.flash('error', 'Challenge not found');
            return res.redirect('/admin/challenges');
        }

        res.render('admin/editChallenge', {
            title: 'Edit Challenge - VIVY CTF',
            activePage: 'admin',
            challenge: challenge
        });
    } catch (error) {
        console.error('Edit challenge error:', error);
        req.flash('error', 'Error loading challenge');
        res.redirect('/admin/challenges');
    }
};

exports.postEditChallenge = async (req, res) => {
    try {
        const { title, description, category, points, flag, visible } = req.body;
        const challengeId = req.params.id;

        const challenge = await Challenge.findById(challengeId);
        if (!challenge) {
            req.flash('error', 'Challenge not found');
            return res.redirect('/admin/challenges');
        }

        let filePath = challenge.file_path;

        // Handle file upload
        if (req.files && req.files.challenge_file) {
            // Delete old file if exists
            if (challenge.file_path) {
                const oldPath = path.join(__dirname, '../public', challenge.file_path);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            const file = req.files.challenge_file;
            const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const uploadPath = path.join(__dirname, '../public/challenges', fileName);
            
            await file.mv(uploadPath);
            filePath = `/challenges/${fileName}`;
        }

        await Challenge.update(challengeId, {
            title,
            description,
            category,
            points: parseInt(points),
            flag,
            file_path: filePath,
            visible: visible === 'on'
        });

        req.flash('success', 'Challenge updated successfully');
        res.redirect('/admin/challenges');
    } catch (error) {
        console.error('Update challenge error:', error);
        req.flash('error', 'Error updating challenge');
        res.redirect(`/admin/challenges/edit/${req.params.id}`);
    }
};

exports.deleteChallenge = async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        
        if (challenge && challenge.file_path) {
            const filePath = path.join(__dirname, '../public', challenge.file_path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await Challenge.delete(req.params.id);
        
        req.flash('success', 'Challenge deleted successfully');
        res.redirect('/admin/challenges');
    } catch (error) {
        console.error('Delete challenge error:', error);
        req.flash('error', 'Error deleting challenge');
        res.redirect('/admin/challenges');
    }
};

exports.toggleVisibility = async (req, res) => {
    try {
        await Challenge.toggleVisibility(req.params.id);
        req.flash('success', 'Challenge visibility toggled');
        res.redirect('/admin/challenges');
    } catch (error) {
        console.error('Toggle visibility error:', error);
        req.flash('error', 'Error toggling visibility');
        res.redirect('/admin/challenges');
    }
};

exports.getUsers = async (req, res) => {
    try {
        const users = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    u.*,
                    t.name as team_name,
                    COUNT(s.id) as solve_count
                FROM users u
                LEFT JOIN teams t ON u.team_id = t.id
                LEFT JOIN solves s ON u.id = s.user_id
                GROUP BY u.id
                ORDER BY u.created_at DESC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('admin/users', {
            title: 'Manage Users - VIVY CTF',
            activePage: 'admin',
            users: users
        });
    } catch (error) {
        console.error('Admin users error:', error);
        req.flash('error', 'Error loading users');
        res.redirect('/admin/dashboard');
    }
};

exports.getTeams = async (req, res) => {
    try {
        const teams = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    COUNT(DISTINCT u.id) as member_count,
                    COUNT(DISTINCT s.challenge_id) as solve_count
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                LEFT JOIN solves s ON u.id = s.user_id
                GROUP BY t.id
                ORDER BY t.created_at DESC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('admin/teams', {
            title: 'Manage Teams - VIVY CTF',
            activePage: 'admin',
            teams: teams
        });
    } catch (error) {
        console.error('Admin teams error:', error);
        req.flash('error', 'Error loading teams');
        res.redirect('/admin/dashboard');
    }
};