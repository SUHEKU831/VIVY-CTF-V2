const express = require('express');
const router = express.Router();
const User = require('../models/userModel');

// ================= MIDDLEWARE =================

const isGuest = (req, res, next) => {
    if (!req.session.user) return next();
    req.flash('error', 'Already logged in');
    res.redirect('/');
};

const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please login first');
    res.redirect('/login');
};

// ================= LOGIN =================

router.get('/login', isGuest, (req, res) => {
    res.render('auth/login', { title: 'Login' });
});

router.post('/login', isGuest, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            req.flash('error', 'All fields are required');
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

        // session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role || 'user'
        };

        req.flash('success', `Welcome ${user.username}!`);
        res.redirect('/');

    } catch (err) {
        console.error(err);
        req.flash('error', 'Login error');
        res.redirect('/login');
    }
});

// ================= REGISTER =================

router.get('/register', isGuest, (req, res) => {
    res.render('auth/register', { title: 'Register' });
});

router.post('/register', isGuest, async (req, res) => {
    try {
        const { username, email, password, confirm_password } = req.body;

        if (!username || !email || !password) {
            req.flash('error', 'All fields are required');
            return res.redirect('/register');
        }

        if (password !== confirm_password) {
            req.flash('error', 'Passwords do not match');
            return res.redirect('/register');
        }

        const existingUser = await User.findByUsername(username);
        if (existingUser) {
            req.flash('error', 'Username already taken');
            return res.redirect('/register');
        }

        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            req.flash('error', 'Email already used');
            return res.redirect('/register');
        }

        await User.create(
            username.trim(),
            email.toLowerCase().trim(),
            password
        );

        req.flash('success', 'Register success, please login');
        res.redirect('/login');

    } catch (err) {
        console.error(err);
        req.flash('error', 'Register error');
        res.redirect('/register');
    }
});

// ================= LOGOUT =================

router.get('/logout', isAuthenticated, (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ================= PROFILE =================

router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        const stats = await User.getStats(user.id);

        res.render('auth/profile', {
            title: 'Profile',
            user,
            stats
        });

    } catch (err) {
        console.error(err);
        req.flash('error', 'Error loading profile');
        res.redirect('/');
    }
});

module.exports = router;
