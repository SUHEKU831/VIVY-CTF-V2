exports.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }

    req.flash('error', 'Please login to access this page');

    // 🔥 handle API request
    if (req.originalUrl.startsWith('/api')) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    return res.redirect('/login');
};

exports.isGuest = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return next();
    }

    return res.redirect('/');
};

exports.isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }

    req.flash('error', 'Access denied. Admin only.');

    if (req.originalUrl.startsWith('/api')) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.redirect('/');
};
