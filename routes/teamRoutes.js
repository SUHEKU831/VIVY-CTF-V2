const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const User = require('../models/userModel');
const Team = require('../models/teamModel');

// Middleware untuk cek authentication
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    req.flash('error', 'Please login to access this page');
    res.redirect('/login');
};

// Middleware untuk cek apakah user sudah dalam team
const isNotInTeam = (req, res, next) => {
    if (!req.session.user.team_id) {
        return next();
    }
    req.flash('error', 'You are already in a team');
    res.redirect('/teams');
};

// Middleware untuk cek apakah user dalam team
const isInTeam = (req, res, next) => {
    if (req.session.user.team_id) {
        return next();
    }
    req.flash('error', 'You are not in a team');
    res.redirect('/teams');
};

// Middleware untuk validasi input team
const validateTeamCreation = (req, res, next) => {
    const { name, password, confirm_password } = req.body;
    const errors = [];

    // Team name validation
    if (!name || name.trim().length < 3) {
        errors.push('Team name must be at least 3 characters');
    }
    if (name && name.trim().length > 50) {
        errors.push('Team name must be less than 50 characters');
    }
    if (name && !/^[a-zA-Z0-9\s_-]+$/.test(name)) {
        errors.push('Team name can only contain letters, numbers, spaces, underscores and hyphens');
    }

    // Password validation
    if (!password || password.length < 4) {
        errors.push('Team password must be at least 4 characters');
    }
    if (password && password.length > 100) {
        errors.push('Team password must be less than 100 characters');
    }

    // Confirm password
    if (password !== confirm_password) {
        errors.push('Passwords do not match');
    }

    if (errors.length > 0) {
        req.flash('error', errors);
        return res.redirect('/teams/create');
    }
    next();
};

const validateTeamJoin = (req, res, next) => {
    const { team_name, password } = req.body;
    const errors = [];

    if (!team_name || team_name.trim().length < 3) {
        errors.push('Please enter a valid team name');
    }
    if (!password || password.length < 4) {
        errors.push('Please enter the team password');
    }

    if (errors.length > 0) {
        req.flash('error', errors);
        return res.redirect('/teams');
    }
    next();
};

// ==================== TEAM ROUTES ====================

// @desc    Show team management page
// @route   GET /teams
router.get('/', isAuthenticated, async (req, res) => {
    try {
        // Jika user sudah dalam team, tampilkan halaman team
        if (req.session.user.team_id) {
            const team = await Team.findById(req.session.user.team_id);
            
            if (!team) {
                // Jika team tidak ditemukan (mungkin sudah dihapus), reset team_id user
                req.session.user.team_id = null;
                await User.updateTeam(req.session.user.id, null);
                return res.redirect('/teams/create');
            }

            const members = await Team.getMembers(team.id);
            const memberStats = await Team.getMemberStats(team.id);
            const teamStats = await Team.getTeamStats(team.id);
            const rank = await Team.getRank(team.id);
            const recentSolves = await Team.getRecentSolves(team.id);
            const joinRequests = await Team.getJoinRequests(team.id);
            
            // Cek apakah user adalah creator/leader
            const isLeader = team.creator_id === req.session.user.id;

            res.render('team/dashboard', {
                title: `${team.name} - Team Dashboard`,
                activePage: 'team',
                team: team,
                members: members,
                memberStats: memberStats,
                teamStats: teamStats,
                rank: rank,
                recentSolves: recentSolves,
                joinRequests: joinRequests,
                isLeader: isLeader,
                currentUser: req.session.user
            });
        } else {
            // Jika user belum dalam team, tampilkan halaman pilihan (create/join)
            const topTeams = await Team.getTopTeams(10);
            const recentTeams = await Team.getRecentTeams(5);
            
            res.render('team/select', {
                title: 'Join or Create Team',
                activePage: 'team',
                topTeams: topTeams,
                recentTeams: recentTeams
            });
        }
    } catch (error) {
        console.error('Team page error:', error);
        req.flash('error', 'Error loading team page');
        res.redirect('/');
    }
});

// @desc    Show create team form
// @route   GET /teams/create
router.get('/create', isAuthenticated, isNotInTeam, (req, res) => {
    res.render('team/create', {
        title: 'Create New Team',
        activePage: 'team',
        error: req.flash('error')
    });
});

// @desc    Process team creation
// @route   POST /teams/create
router.post('/create', isAuthenticated, isNotInTeam, validateTeamCreation, async (req, res) => {
    try {
        const { name, password, description, team_type } = req.body;
        
        // Cek apakah nama team sudah ada
        const existingTeam = await Team.findByName(name);
        if (existingTeam) {
            req.flash('error', 'Team name already exists');
            return res.redirect('/teams/create');
        }

        // Create team
        const teamId = await Team.create({
            name: name.trim(),
            password: password,
            description: description || '',
            type: team_type || 'open',
            creator_id: req.session.user.id,
            created_at: new Date().toISOString()
        });

        // Update user's team
        await User.updateTeam(req.session.user.id, teamId);
        
        // Update session
        req.session.user.team_id = teamId;
        req.session.user.team_name = name.trim();

        // Log activity
        console.log(`Team created: ${name} by user ${req.session.user.username}`);

        req.flash('success', `Team "${name}" created successfully! 🎉`);
        res.redirect('/teams');
    } catch (error) {
        console.error('Create team error:', error);
        req.flash('error', 'Error creating team. Please try again.');
        res.redirect('/teams/create');
    }
});

// @desc    Show join team form/options
// @route   GET /teams/join
router.get('/join', isAuthenticated, isNotInTeam, async (req, res) => {
    try {
        const { search } = req.query;
        let teams = [];

        if (search) {
            teams = await Team.searchTeams(search);
        } else {
            teams = await Team.getPublicTeams(20);
        }

        res.render('team/join', {
            title: 'Join a Team',
            activePage: 'team',
            teams: teams,
            search: search || ''
        });
    } catch (error) {
        console.error('Join team page error:', error);
        req.flash('error', 'Error loading teams');
        res.redirect('/teams');
    }
});

// @desc    Process team join request
// @route   POST /teams/join
router.post('/join', isAuthenticated, isNotInTeam, validateTeamJoin, async (req, res) => {
    try {
        const { team_name, password } = req.body;

        // Cari team
        const team = await Team.findByName(team_name);
        
        if (!team) {
            req.flash('error', 'Team not found');
            return res.redirect('/teams/join');
        }

        // Cek tipe team
        if (team.type === 'closed') {
            // Untuk team tertutup, buat join request
            const existingRequest = await Team.checkJoinRequest(team.id, req.session.user.id);
            
            if (existingRequest) {
                req.flash('error', 'You already have a pending join request for this team');
                return res.redirect('/teams');
            }

            await Team.createJoinRequest(team.id, req.session.user.id, password);
            
            req.flash('success', `Join request sent to team "${team.name}". Waiting for approval.`);
            return res.redirect('/teams');
        }

        // Untuk team terbuka, verifikasi password langsung
        const isValid = await Team.validatePassword(team, password);
        
        if (!isValid) {
            req.flash('error', 'Invalid team password');
            return res.redirect('/teams/join');
        }

        // Cek apakah team sudah penuh (max 5 members)
        const memberCount = await Team.getMemberCount(team.id);
        if (memberCount >= 5) {
            req.flash('error', 'Team is already full (maximum 5 members)');
            return res.redirect('/teams/join');
        }

        // Join team
        await User.updateTeam(req.session.user.id, team.id);
        req.session.user.team_id = team.id;
        req.session.user.team_name = team.name;

        // Log activity
        await Team.logActivity(team.id, req.session.user.id, 'join');

        req.flash('success', `Successfully joined team "${team.name}"!`);
        res.redirect('/teams');
    } catch (error) {
        console.error('Join team error:', error);
        req.flash('error', 'Error joining team');
        res.redirect('/teams/join');
    }
});

// @desc    Leave current team
// @route   POST /teams/leave
router.post('/leave', isAuthenticated, isInTeam, async (req, res) => {
    try {
        const teamId = req.session.user.team_id;
        const userId = req.session.user.id;

        // Cek apakah user adalah creator/leader
        const team = await Team.findById(teamId);
        
        if (team.creator_id === userId) {
            // Jika creator ingin leave, harus transfer kepemimpinan atau解散 team
            const memberCount = await Team.getMemberCount(teamId);
            
            if (memberCount > 1) {
                req.flash('error', 'As the team leader, you must transfer leadership before leaving');
                return res.redirect('/teams');
            } else {
                // Jika hanya creator sendiri, hapus team
                await Team.delete(teamId);
                req.flash('success', 'Team disbanded successfully');
            }
        }

        // Leave team
        await User.updateTeam(userId, null);
        await Team.logActivity(teamId, userId, 'leave');
        
        // Update session
        req.session.user.team_id = null;
        req.session.user.team_name = null;

        req.flash('success', 'You have left the team');
        res.redirect('/teams');
    } catch (error) {
        console.error('Leave team error:', error);
        req.flash('error', 'Error leaving team');
        res.redirect('/teams');
    }
});

// @desc    Kick member from team (leader only)
// @route   POST /teams/kick/:userId
router.post('/kick/:userId', isAuthenticated, isInTeam, async (req, res) => {
    try {
        const teamId = req.session.user.team_id;
        const leaderId = req.session.user.id;
        const memberId = parseInt(req.params.userId);

        // Cek apakah user adalah leader
        const team = await Team.findById(teamId);
        if (team.creator_id !== leaderId) {
            req.flash('error', 'Only team leader can kick members');
            return res.redirect('/teams');
        }

        // Cek apakah member ada di team
        const member = await User.findById(memberId);
        if (!member || member.team_id !== teamId) {
            req.flash('error', 'User is not in your team');
            return res.redirect('/teams');
        }

        // Cek agar leader tidak bisa kick diri sendiri
        if (memberId === leaderId) {
            req.flash('error', 'You cannot kick yourself');
            return res.redirect('/teams');
        }

        // Kick member
        await User.updateTeam(memberId, null);
        await Team.logActivity(teamId, memberId, 'kicked', leaderId);

        req.flash('success', `User ${member.username} has been kicked from the team`);
        res.redirect('/teams');
    } catch (error) {
        console.error('Kick member error:', error);
        req.flash('error', 'Error kicking member');
        res.redirect('/teams');
    }
});

// @desc    Transfer team leadership
// @route   POST /teams/transfer/:userId
router.post('/transfer/:userId', isAuthenticated, isInTeam, async (req, res) => {
    try {
        const teamId = req.session.user.team_id;
        const currentLeaderId = req.session.user.id;
        const newLeaderId = parseInt(req.params.userId);

        // Cek apakah user adalah leader
        const team = await Team.findById(teamId);
        if (team.creator_id !== currentLeaderId) {
            req.flash('error', 'Only team leader can transfer leadership');
            return res.redirect('/teams');
        }

        // Cek apakah member baru ada di team
        const newLeader = await User.findById(newLeaderId);
        if (!newLeader || newLeader.team_id !== teamId) {
            req.flash('error', 'User is not in your team');
            return res.redirect('/teams');
        }

        // Transfer leadership
        await Team.updateLeader(teamId, newLeaderId);
        await Team.logActivity(teamId, newLeaderId, 'became_leader', currentLeaderId);

        req.flash('success', `Team leadership transferred to ${newLeader.username}`);
        res.redirect('/teams');
    } catch (error) {
        console.error('Transfer leadership error:', error);
        req.flash('error', 'Error transferring leadership');
        res.redirect('/teams');
    }
});

// @desc    Update team settings (leader only)
// @route   POST /teams/update
router.post('/update', isAuthenticated, isInTeam, async (req, res) => {
    try {
        const teamId = req.session.user.team_id;
        const userId = req.session.user.id;
        const { name, description, type, password } = req.body;

        // Cek apakah user adalah leader
        const team = await Team.findById(teamId);
        if (team.creator_id !== userId) {
            req.flash('error', 'Only team leader can update team settings');
            return res.redirect('/teams');
        }

        // Update team
        await Team.update(teamId, {
            name: name || team.name,
            description: description,
            type: type || team.type,
            password: password || team.password
        });

        // Update session if team name changed
        if (name && name !== team.name) {
            req.session.user.team_name = name;
        }

        req.flash('success', 'Team settings updated successfully');
        res.redirect('/teams');
    } catch (error) {
        console.error('Update team error:', error);
        req.flash('error', 'Error updating team');
        res.redirect('/teams');
    }
});

// @desc    Handle join requests (leader only)
// @route   POST /teams/request/:requestId/:action
router.post('/request/:requestId/:action', isAuthenticated, isInTeam, async (req, res) => {
    try {
        const { requestId, action } = req.params;
        const teamId = req.session.user.team_id;
        const userId = req.session.user.id;

        // Cek apakah user adalah leader
        const team = await Team.findById(teamId);
        if (team.creator_id !== userId) {
            req.flash('error', 'Only team leader can handle join requests');
            return res.redirect('/teams');
        }

        // Get request details
        const request = await Team.getJoinRequestById(requestId);
        if (!request || request.team_id !== teamId) {
            req.flash('error', 'Join request not found');
            return res.redirect('/teams');
        }

        if (action === 'approve') {
            // Cek apakah team masih punya slot
            const memberCount = await Team.getMemberCount(teamId);
            if (memberCount >= 5) {
                req.flash('error', 'Team is full');
                await Team.rejectJoinRequest(requestId);
                return res.redirect('/teams');
            }

            // Approve and add user to team
            await User.updateTeam(request.user_id, teamId);
            await Team.approveJoinRequest(requestId);
            await Team.logActivity(teamId, request.user_id, 'joined', userId);
            
            req.flash('success', 'Join request approved');
        } else if (action === 'reject') {
            await Team.rejectJoinRequest(requestId);
            req.flash('success', 'Join request rejected');
        }

        res.redirect('/teams');
    } catch (error) {
        console.error('Handle join request error:', error);
        req.flash('error', 'Error handling join request');
        res.redirect('/teams');
    }
});

// @desc    Cancel join request
// @route   POST /teams/cancel-request/:teamId
router.post('/cancel-request/:teamId', isAuthenticated, isNotInTeam, async (req, res) => {
    try {
        const teamId = parseInt(req.params.teamId);
        const userId = req.session.user.id;

        await Team.cancelJoinRequest(teamId, userId);
        
        req.flash('success', 'Join request cancelled');
        res.redirect('/teams');
    } catch (error) {
        console.error('Cancel request error:', error);
        req.flash('error', 'Error cancelling request');
        res.redirect('/teams');
    }
});

// @desc    View public team profile
// @route   GET /teams/:id
router.get('/:id', async (req, res) => {
    try {
        const teamId = parseInt(req.params.id);
        const team = await Team.findById(teamId);
        
        if (!team) {
            req.flash('error', 'Team not found');
            return res.redirect('/scoreboard');
        }

        const members = await Team.getMembers(teamId);
        const memberStats = await Team.getMemberStats(teamId);
        const teamStats = await Team.getTeamStats(teamId);
        const recentSolves = await Team.getRecentSolves(teamId);
        const rank = await Team.getRank(teamId);

        // Cek apakah user sudah login
        let isMember = false;
        let joinRequested = false;
        
        if (req.session.user) {
            isMember = req.session.user.team_id === teamId;
            if (!isMember && !req.session.user.team_id) {
                joinRequested = await Team.checkJoinRequest(teamId, req.session.user.id);
            }
        }

        res.render('team/profile', {
            title: `${team.name} - Team Profile`,
            activePage: 'scoreboard',
            team: team,
            members: members,
            memberStats: memberStats,
            teamStats: teamStats,
            recentSolves: recentSolves,
            rank: rank,
            isMember: isMember,
            joinRequested: joinRequested,
            currentUser: req.session.user
        });
    } catch (error) {
        console.error('View team error:', error);
        req.flash('error', 'Error loading team profile');
        res.redirect('/scoreboard');
    }
});

// @desc    Get team activity feed (API)
// @route   GET /api/teams/:id/activity
router.get('/api/:id/activity', async (req, res) => {
    try {
        const teamId = parseInt(req.params.id);
        const activities = await Team.getActivityFeed(teamId, 50);
        
        res.json({
            success: true,
            activities: activities
        });
    } catch (error) {
        console.error('Team activity API error:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading team activity'
        });
    }
});

// @desc    Get team stats (API)
// @route   GET /api/teams/:id/stats
router.get('/api/:id/stats', async (req, res) => {
    try {
        const teamId = parseInt(req.params.id);
        
        const [teamStats, memberStats, rank] = await Promise.all([
            Team.getTeamStats(teamId),
            Team.getMemberStats(teamId),
            Team.getRank(teamId)
        ]);

        res.json({
            success: true,
            teamStats: teamStats,
            memberStats: memberStats,
            rank: rank
        });
    } catch (error) {
        console.error('Team stats API error:', error);
        res.status(500).json({
            success: false,
            error: 'Error loading team stats'
        });
    }
});

// @desc    Search teams (API)
// @route   GET /api/teams/search
router.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json({
                success: true,
                teams: []
            });
        }

        const teams = await Team.searchTeams(q);
        
        res.json({
            success: true,
            teams: teams.slice(0, 10) // Limit to 10 results
        });
    } catch (error) {
        console.error('Team search API error:', error);
        res.status(500).json({
            success: false,
            error: 'Error searching teams'
        });
    }
});

module.exports = router;