// middleware/viewVariables.js
module.exports = (req, res, next) => {
    // Store the original render function
    const originalRender = res.render;
    
    // Override render to inject default variables
    res.render = function(view, options = {}, callback) {
        // Get theme from session or cookie with default 'dark'
        const currentTheme = req.session?.theme || req.cookies?.theme || 'dark';
        
        // Get flash messages
        const success_msg = req.flash ? req.flash('success') : [];
        const error_msg = req.flash ? req.flash('error') : [];
        
        // Default variables for all views
        const defaultOptions = {
            // Page metadata
            title: options.title || 'VIVY V2', // Default title
            activePage: req.path.split('/')[1] || 'home', // Extract from URL path
            currentTheme: currentTheme,
            
            // User data
            user: req.session?.user || null,
            
            // Flash messages
            success_msg: success_msg.length > 0 ? success_msg[0] : null,
            error_msg: error_msg.length > 0 ? error_msg[0] : null,
            
            // Additional useful variables
            isAuthenticated: !!req.session?.user,
            isAdmin: req.session?.user?.role === 'admin',
            currentPath: req.path
        };
        
        // Merge options (user-provided options override defaults)
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Call the original render with merged options
        originalRender.call(this, view, mergedOptions, callback);
    };
    
    next();
};
