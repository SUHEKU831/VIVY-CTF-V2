const Team = require('../models/teamModel');
const User = require('../models/userModel');
const bcrypt = require('bcryptjs');

exports.getTeam = async (req, res) => {
    try {
        if (!req.session.user.team_id) {
            return res.redirect('/teams/create');
        }

        const team = await Team.findById(req.session.user.team_id);
        const members = await Team.getMembers(req.session.user.team_id);
        const stats = await Team.getTeamStats(req.session.user.team_id);
        const rank = await Team.getRank(req.session.user.team_id);

        res.render('team/team', {
            title: 'My Team - VIVY CTF',
            activePage: 'team',
            team: team,
            members: members,
            stats: stats,
            rank: rank
        });
    } catch (error) {
        console.error('Team error:', error);
        req.flash('error', 'Error loading team');
        res.redirect('/');
    }
};

exports.getCreateTeam = (req, res) => {
    if (req.session.user.team_id) {
        return res.redirect('/teams');
    }
    
    res.render('team/create', {
        title: 'Create Team - VIVY CTF',
        activePage: 'team'
    });
};

exports.postCreateTeam = async (req, res) => {
    try {
        const { name, password, confirm_password } = req.body;

        if (!name || !password || !confirm_password) {
            req.flash('error', 'All fields are required');
            return res.redirect('/teams/create');
        }

        if (password !== confirm_password) {
            req.flash('error', 'Passwords do not match');
            return res.redirect('/teams/create');
        }

        if (password.length < 4) {
            req.flash('error', 'Team password must be at least 4 characters');
            return res.redirect('/teams/create');
        }

        // Check if team name exists
        const existingTeam = await Team.findByName(name);
        if (existingTeam) {
            req.flash('error', 'Team name already exists');
            return res.redirect('/teams/create');
        }

        // Create team
        const teamId = await Team.create(name, password, req.session.user.id);
        
        // Update user
        await User.updateTeam(req.session.user.id, teamId);
        
        // Update session
        req.session.user.team_id = teamId;

        req.flash('success', `Team "${name}" created successfully!`);
        res.redirect('/teams');
    } catch (error) {
        console.error('Create team error:', error);
        req.flash('error', 'Error creating team');
        res.redirect('/teams/create');
    }
};

exports.postJoinTeam = async (req, res) => {
    try {
        const { team_name, password } = req.body;

        if (!team_name || !password) {
            req.flash('error', 'Team name and password are required');
            return res.redirect('/teams');
        }

        const team = await Team.findByName(team_name);
        
        if (!team) {
            req.flash('error', 'Team not found');
            return res.redirect('/teams');
        }

        // Verify password
        const isValid = await bcrypt.compare(password, team.password);
        if (!isValid) {
            req.flash('error', 'Invalid team password');
            return res.redirect('/teams');
        }

        // Check if user is already in a team
        if (req.session.user.team_id) {
            req.flash('error', 'You are already in a team');
            return res.redirect('/teams');
        }

        // Join team
        await User.updateTeam(req.session.user.id, team.id);
        req.session.user.team_id = team.id;

        req.flash('success', `Joined team "${team_name}" successfully!`);
        res.redirect('/teams');
    } catch (error) {
        console.error('Join team error:', error);
        req.flash('error', 'Error joining team');
        res.redirect('/teams');
    }
};

exports.leaveTeam = async (req, res) => {
    try {
        if (!req.session.user.team_id) {
            return res.redirect('/teams');
        }

        await User.updateTeam(req.session.user.id, null);
        req.session.user.team_id = null;

        req.flash('success', 'Left team successfully');
        res.redirect('/teams');
    } catch (error) {
        console.error('Leave team error:', error);
        req.flash('error', 'Error leaving team');
        res.redirect('/teams');
    }
};

exports.getTeamDetails = async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        
        if (!team) {
            req.flash('error', 'Team not found');
            return res.redirect('/scoreboard');
        }

        const members = await Team.getMembers(team.id);
        const stats = await Team.getTeamStats(team.id);
        const rank = await Team.getRank(team.id);

        res.render('team/details', {
            title: `${team.name} - VIVY CTF`,
            activePage: 'scoreboard',
            team: team,
            members: members,
            stats: stats,
            rank: rank
        });
    } catch (error) {
        console.error('Team details error:', error);
        req.flash('error', 'Error loading team details');
        res.redirect('/scoreboard');
    }
};