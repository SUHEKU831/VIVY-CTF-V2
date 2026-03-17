const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const User = require('../models/userModel');

// Middleware untuk cek authentication
const isGuest = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return next();
    }
    req.flash('error', 'You are already logged in');
    res.redirect('/');
};

const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    req.flash('error', 'Please login to access this page');
    res.redirect('/login');
};

// Middleware untuk validasi input
const validateLogin = (req, res, next) => {
    const { username, password } = req.body;
    const errors = [];

    if (!username || username.trim().length < 3) {
        errors.push('Username must be at least 3 characters');
    }
    if (!password || password.length < 6) {
        errors.push('Password must be at least 6 characters');
    }

    if (errors.length > 0) {
        req.flash('error', errors.join(', '));
        return res.redirect('/login');
    }
    next();
};

const validateRegister = (req, res, next) => {
    const { username, email, password, confirm_password } = req.body;
    const errors = [];

    // Username validation
    if (!username || username.trim().length < 3) {
        errors.push('Username must be at least 3 characters');
    }
    if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
        errors.push('Username can only contain letters, numbers, and underscores');
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.push('Please enter a valid email address');
    }

    // Password validation
    if (!password || password.length < 6) {
        errors.push('Password must be at least 6 characters');
    }
    if (password && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (password && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    // Confirm password
    if (password !== confirm_password) {
        errors.push('Passwords do not match');
    }

    if (errors.length > 0) {
        req.flash('error', errors);
        return res.redirect('/register');
    }
    next();
};

// Rate limiting untuk login attempts
const loginAttempts = new Map();

const checkLoginAttempts = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: now };

    // Reset attempts after 15 minutes
    if (now - attempts.lastAttempt > 15 * 60 * 1000) {
        attempts.count = 0;
    }

    if (attempts.count >= 5) {
        req.flash('error', 'Too many login attempts. Please try again after 15 minutes.');
        return res.redirect('/login');
    }

    attempts.count++;
    attempts.lastAttempt = now;
    loginAttempts.set(ip, attempts);
    next();
};

// ==================== ROUTES ====================

// @desc    Show login page
// @route   GET /login
router.get('/login', isGuest, (req, res) => {
    res.render('auth/login', { 
        title: 'Login - VIVY CTF V2',
        activePage: 'login',
        layout: false
    });
});

// @desc    Process login
// @route   POST /login
router.post('/login', isGuest, validateLogin, checkLoginAttempts, async (req, res) => {
    try {
        const { username, password, remember } = req.body;
        
        // Find user by username or email
        const user = await User.findByUsername(username);
        
        if (!user) {
            req.flash('error', 'Invalid username or password');
            return res.redirect('/login');
        }

        // Check if account is locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            req.flash('error', 'Account is temporarily locked. Please try again later.');
            return res.redirect('/login');
        }

        // Validate password
        const isValid = await User.validatePassword(user, password);
        
        if (!isValid) {
            // Increment failed attempts
            await User.incrementFailedAttempts(user.id);
            
            // Lock account after 5 failed attempts
            if (user.failed_attempts >= 4) {
                const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
                await User.lockAccount(user.id, lockUntil);
                req.flash('error', 'Account locked due to too many failed attempts. Try again in 15 minutes.');
            } else {
                req.flash('error', 'Invalid username or password');
            }
            return res.redirect('/login');
        }

        // Reset failed attempts on successful login
        await User.resetFailedAttempts(user.id);

        // Get user stats
        const stats = await User.getStats(user.id);
        const team = user.team_id ? await require('../models/teamModel').findById(user.team_id) : null;
        
        // Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            team_id: user.team_id,
            team_name: team ? team.name : null,
            stats: stats,
            created_at: user.created_at
        };

        // Set session cookie max age based on remember me
        if (remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        } else {
            req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
        }

        // Log login activity
        console.log(`User ${user.username} logged in from IP: ${req.ip}`);

        req.flash('success', `Welcome back, ${user.username}! 👋`);
        
        // Redirect based on role
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else {
            res.redirect('/challenges');
        }
    } catch (error) {
        console.error('Login error:', error);
        req.flash('error', 'An error occurred during login. Please try again.');
        res.redirect('/login');
    }
});

// @desc    Show register page
// @route   GET /register
router.get('/register', isGuest, (req, res) => {
    res.render('auth/register', { 
        title: 'Register - VIVY CTF V2',
        activePage: 'register',
        layout: false
    });
});

// @desc    Process registration
// @route   POST /register
router.post('/register', isGuest, validateRegister, async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if username already exists
        const existingUser = await User.findByUsername(username);
        if (existingUser) {
            req.flash('error', 'Username already taken');
            return res.redirect('/register');
        }

        // Check if email already exists
        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
            req.flash('error', 'Email already registered');
            return res.redirect('/register');
        }

        // Create user
        const userId = await User.create({
            username: username.trim(),
            email: email.toLowerCase().trim(),
            password: password
        });

        // Send welcome email (if configured)
        // await sendWelcomeEmail(email, username);

        console.log(`New user registered: ${username} (ID: ${userId})`);

        req.flash('success', 'Registration successful! Please login to continue.');
        res.redirect('/login');
    } catch (error) {
        console.error('Registration error:', error);
        req.flash('error', 'An error occurred during registration. Please try again.');
        res.redirect('/register');
    }
});

// @desc    Logout user
// @route   GET /logout
router.get('/logout', isAuthenticated, (req, res) => {
    const username = req.session.user.username;
    
    // Destroy session
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        console.log(`User ${username} logged out`);
        res.redirect('/');
    });
});

// @desc    Show user profile
// @route   GET /profile
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const user = await User.findById(userId);
        const solves = await require('../models/solveModel').getUserSolves(userId);
        const stats = await User.getDetailedStats(userId);
        
        let team = null;
        let teamMembers = [];
        if (user.team_id) {
            team = await require('../models/teamModel').findById(user.team_id);
            teamMembers = await require('../models/teamModel').getMembers(user.team_id);
        }

        // Get recent activity
        const recentActivity = await User.getRecentActivity(userId);

        res.render('auth/profile', {
            title: 'My Profile - VIVY CTF V2',
            activePage: 'profile',
            user: user,
            team: team,
            teamMembers: teamMembers,
            solves: solves,
            stats: stats,
            recentActivity: recentActivity
        });
    } catch (error) {
        console.error('Profile error:', error);
        req.flash('error', 'Error loading profile');
        res.redirect('/');
    }
});

// @desc    Update profile
// @route   POST /profile/update
router.post('/profile/update', isAuthenticated, async (req, res) => {
    try {
        const { email, current_password, new_password } = req.body;
        const userId = req.session.user.id;

        const user = await User.findById(userId);

        // If changing password, verify current password
        if (new_password) {
            const isValid = await User.validatePassword(user, current_password);
            if (!isValid) {
                req.flash('error', 'Current password is incorrect');
                return res.redirect('/profile');
            }

            // Update password
            await User.updatePassword(userId, new_password);
            req.flash('success', 'Password updated successfully');
        }

        // Update email if changed
        if (email && email !== user.email) {
            const existingEmail = await User.findByEmail(email);
            if (existingEmail && existingEmail.id !== userId) {
                req.flash('error', 'Email already in use');
                return res.redirect('/profile');
            }
            await User.updateEmail(userId, email);
            req.session.user.email = email;
            req.flash('success', 'Profile updated successfully');
        }

        res.redirect('/profile');
    } catch (error) {
        console.error('Profile update error:', error);
        req.flash('error', 'Error updating profile');
        res.redirect('/profile');
    }
});

// @desc    Forgot password page
// @route   GET /forgot-password
router.get('/forgot-password', isGuest, (req, res) => {
    res.render('auth/forgot-password', {
        title: 'Forgot Password - VIVY CTF V2',
        activePage: 'forgot-password',
        layout: false
    });
});

// @desc    Process forgot password
// @route   POST /forgot-password
router.post('/forgot-password', isGuest, async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findByEmail(email);
        
        // Always show success message even if email doesn't exist (security)
        if (user) {
            // Generate reset token
            const resetToken = require('crypto').randomBytes(32).toString('hex');
            const resetExpires = new Date(Date.now() + 3600000); // 1 hour

            await User.setResetToken(user.id, resetToken, resetExpires);

            // Send reset email (implement this)
            // await sendPasswordResetEmail(email, resetToken);

            console.log(`Password reset requested for ${email}`);
        }

        req.flash('success', 'If your email is registered, you will receive a password reset link.');
        res.redirect('/login');
    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/forgot-password');
    }
});

// @desc    Reset password page
// @route   GET /reset-password/:token
router.get('/reset-password/:token', isGuest, async (req, res) => {
    try {
        const { token } = req.params;
        
        const user = await User.findByResetToken(token);
        
        if (!user || new Date(user.reset_expires) < new Date()) {
            req.flash('error', 'Invalid or expired reset token');
            return res.redirect('/forgot-password');
        }

        res.render('auth/reset-password', {
            title: 'Reset Password - VIVY CTF V2',
            activePage: 'reset-password',
            token: token,
            layout: false
        });
    } catch (error) {
        console.error('Reset password page error:', error);
        req.flash('error', 'An error occurred');
        res.redirect('/forgot-password');
    }
});

// @desc    Process reset password
// @route   POST /reset-password/:token
router.post('/reset-password/:token', isGuest, async (req, res) => {
    try {
        const { token } = req.params;
        const { password, confirm_password } = req.body;

        if (password !== confirm_password) {
            req.flash('error', 'Passwords do not match');
            return res.redirect(`/reset-password/${token}`);
        }

        if (password.length < 6) {
            req.flash('error', 'Password must be at least 6 characters');
            return res.redirect(`/reset-password/${token}`);
        }

        const user = await User.findByResetToken(token);
        
        if (!user || new Date(user.reset_expires) < new Date()) {
            req.flash('error', 'Invalid or expired reset token');
            return res.redirect('/forgot-password');
        }

        // Update password
        await User.updatePassword(user.id, password);
        await User.clearResetToken(user.id);

        req.flash('success', 'Password reset successful! Please login with your new password.');
        res.redirect('/login');
    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error', 'An error occurred');
        res.redirect('/forgot-password');
    }
});

// @desc    Verify email
// @route   GET /verify-email/:token
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        const user = await User.findByVerificationToken(token);
        
        if (!user) {
            req.flash('error', 'Invalid verification token');
            return res.redirect('/login');
        }

        await User.verifyEmail(user.id);

        req.flash('success', 'Email verified successfully! You can now login.');
        res.redirect('/login');
    } catch (error) {
        console.error('Email verification error:', error);
        req.flash('error', 'An error occurred');
        res.redirect('/');
    }
});

// @desc    Resend verification email
// @route   POST /resend-verification
router.post('/resend-verification', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id);
        
        if (user.email_verified) {
            req.flash('error', 'Email already verified');
            return res.redirect('/profile');
        }

        // Generate new verification token
        const verificationToken = require('crypto').randomBytes(32).toString('hex');
        await User.setVerificationToken(user.id, verificationToken);

        // Send verification email (implement this)
        // await sendVerificationEmail(user.email, verificationToken);

        req.flash('success', 'Verification email sent!');
        res.redirect('/profile');
    } catch (error) {
        console.error('Resend verification error:', error);
        req.flash('error', 'Error sending verification email');
        res.redirect('/profile');
    }
});

// @desc    Change theme preference
// @route   POST /change-theme
router.post('/change-theme', isAuthenticated, async (req, res) => {
    const { theme } = req.body;
    const validThemes = ['dark', 'hacker', 'neon'];
    
    if (validThemes.includes(theme)) {
        req.session.theme = theme;
        
        // Save theme preference to user settings
        await User.updateTheme(req.session.user.id, theme);
        
        console.log(`User ${req.session.user.username} changed theme to ${theme}`);
    }
    
    res.redirect('back');
});

// @desc    API endpoint untuk cek session
// @route   GET /api/check-session
router.get('/api/check-session', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ 
            authenticated: true, 
            user: {
                id: req.session.user.id,
                username: req.session.user.username,
                role: req.session.user.role
            }
        });
    } else {
        res.json({ authenticated: false });
    }
});

// @desc    API endpoint untuk logout
// @route   POST /api/logout
router.post('/api/logout', isAuthenticated, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

module.exports = router;