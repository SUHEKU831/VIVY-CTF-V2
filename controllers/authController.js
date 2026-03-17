const User = require('../models/userModel');
const Team = require('../models/teamModel');
const Solve = require('../models/solveModel');

exports.getLogin = (req, res) => {
    res.render('auth/login', { 
        title: 'Login - VIVY CTF',
        activePage: 'login'
    });
};

exports.postLogin = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            req.flash('error', 'Please provide username and password');
            return res.redirect('/login');
        }

        const user = await User.findByUsername(username);
        
        if (!user) {
            req.flash('error', 'Invalid username or password');
            return res.redirect('/login');
        }

        const isValid = await User.validatePassword(user, password);
        
        if (!isValid) {
            req.flash('error', 'Invalid username or password');
            return res.redirect('/login');
        }

        // Get user stats
        const stats = await User.getStats(user.id);
        
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            team_id: user.team_id,
            stats: stats
        };

        req.flash('success', `Welcome back, ${user.username}!`);
        
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/challenges');
        }
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'An error occurred during login');
        res.redirect('/login');
    }
};

exports.getRegister = (req, res) => {
    res.render('auth/register', { 
        title: 'Register - VIVY CTF',
        activePage: 'register'
    });
};

exports.postRegister = async (req, res) => {
    try {
        const { username, email, password, confirm_password } = req.body;

        // Validation
        if (!username || !email || !password || !confirm_password) {
            req.flash('error', 'All fields are required');
            return res.redirect('/register');
        }

        if (password !== confirm_password) {
            req.flash('error', 'Passwords do not match');
            return res.redirect('/register');
        }

        if (password.length < 6) {
            req.flash('error', 'Password must be at least 6 characters');
            return res.redirect('/register');
        }

        // Check if user exists
        const existingUser = await User.findByUsername(username);
        if (existingUser) {
            req.flash('error', 'Username already taken');
            return res.redirect('/register');
        }

        // Create user
        const userId = await User.create(username, email, password);
        
        req.flash('success', 'Registration successful! Please login.');
        res.redirect('/login');
    } catch (error) {
        console.error('Registration error:', error);
        req.flash('error', 'An error occurred during registration');
        res.redirect('/register');
    }
};

exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
};

exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        const solves = await Solve.getUserSolves(req.session.user.id);
        
        let team = null;
        if (user.team_id) {
            team = await Team.findById(user.team_id);
        }

        res.render('auth/profile', {
            title: 'Profile - VIVY CTF',
            activePage: 'profile',
            user: user,
            team: team,
            solves: solves
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error', 'Error loading profile');
        res.redirect('/');
    }
};