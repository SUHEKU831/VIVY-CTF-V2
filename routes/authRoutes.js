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
        res.redirect('/challenges');

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

module.exports = router;// ==================== ROUTES ====================

// @desc    Show login page
// @route   GET /login
router.get('/login', isGuest, (req, res) => {
    res.render('auth/login', { 
        title: 'Login - VIVY CTF V2'
        // activePage is automatically set by middleware to 'login'
        // user, success, error, currentTheme are from res.locals
        // layout: false // Remove this if you want to use the main layout
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
        title: 'Register - VIVY CTF V2'
        // activePage is automatically set by middleware to 'register'
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
            // activePage is automatically set by middleware to 'profile'
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
        title: 'Forgot Password - VIVY CTF V2'
        // activePage is automatically set by middleware to 'forgot-password'
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
            // activePage is automatically set by middleware to 'reset-password'
            token: token
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
