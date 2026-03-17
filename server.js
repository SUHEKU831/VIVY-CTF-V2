const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const flash = require('connect-flash');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ================== FIX RAILWAY ==================
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Auto create folder (biar ga crash di Railway)
if (!fs.existsSync('public/challenges')) {
    fs.mkdirSync('public/challenges', { recursive: true });
}

// ================== DATABASE ==================
const db = require('./config/database');

// ================== SECURITY ==================
app.use(helmet({
    contentSecurityPolicy: false,
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// ================== MIDDLEWARE ==================
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 },
    createParentPath: true
}));

app.use(express.static('public'));
app.use('/challenges', express.static('public/challenges'));

// ================== SESSION ==================
if (!process.env.SESSION_SECRET) {
    console.warn("⚠️ SESSION_SECRET not set!");
}

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(flash());

// ================== VIEW ENGINE ==================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ================== GLOBAL VARIABLES ==================
app.use((req, res, next) => {
    // Set user
    res.locals.user = req.session.user || null;
    
    // Set flash messages - use the names expected by header.ejs
    const success = req.flash('success');
    const error = req.flash('error');
    
    res.locals.success_msg = success.length > 0 ? success[0] : null;
    res.locals.error_msg = error.length > 0 ? error[0] : null;
    
    // Set theme
    res.locals.currentTheme = req.session.theme || 'dark';
    
    // Set activePage based on the current route
    const path = req.path;
    if (path === '/') {
        res.locals.activePage = 'home';
    } else if (path.startsWith('/challenges')) {
        res.locals.activePage = 'challenges';
    } else if (path.startsWith('/scoreboard')) {
        res.locals.activePage = 'scoreboard';
    } else if (path.startsWith('/teams')) {
        res.locals.activePage = 'team';
    } else if (path.startsWith('/profile')) {
        res.locals.activePage = 'profile';
    } else if (path.startsWith('/admin')) {
        res.locals.activePage = 'admin';
    } else if (path.startsWith('/login')) {
        res.locals.activePage = 'login';
    } else if (path.startsWith('/register')) {
        res.locals.activePage = 'register';
    } else if (path.startsWith('/api')) {
        res.locals.activePage = 'api';
    } else if (path === '/404' || path.startsWith('/404')) {
        res.locals.activePage = '404';
    } else {
        res.locals.activePage = path.split('/')[1] || 'home';
    }
    
    next();
});

// ================== DATABASE INIT ==================
db.serialize(() => {

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        team_id INTEGER,
        failed_attempts INTEGER DEFAULT 0,
        locked_until TEXT,
        reset_token TEXT,
        reset_expires TEXT,
        theme_preference TEXT DEFAULT 'dark',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        creator_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        points INTEGER NOT NULL,
        flag TEXT NOT NULL,
        file_path TEXT,
        visible BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS solves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        challenge_id INTEGER NOT NULL,
        team_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (challenge_id) REFERENCES challenges(id),
        FOREIGN KEY (team_id) REFERENCES teams(id),
        UNIQUE(user_id, challenge_id)
    )`);

    // Create admin default
    db.get("SELECT * FROM users WHERE role = 'admin'", async (err, admin) => {
        if (!admin) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            db.run(
                "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
                ['admin', 'admin@vivy.ctf', hashedPassword, 'admin']
            );
            console.log('Admin created: admin / admin123');
        }
    });
});

// ================== ROUTES ==================
app.use('/', require('./routes/authRoutes'));
app.use('/challenges', require('./routes/challengeRoutes'));
app.use('/teams', require('./routes/teamRoutes'));
app.use('/scoreboard', require('./routes/scoreboardRoutes'));
app.use('/admin', require('./routes/adminRoutes'));

// ================== API ==================
app.get('/api/stats', (req, res) => {
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM challenges) as total_challenges,
            (SELECT COUNT(*) FROM solves) as total_solves,
            (SELECT COUNT(*) FROM teams) as total_teams
    `, (err, stats) => {
        if (err) return res.json({ success: false });
        res.json({ success: true, stats });
    });
});

app.get('/api/recent-activity', (req, res) => {
    db.all(`
        SELECT users.username, challenges.title, solves.created_at
        FROM solves
        JOIN users ON solves.user_id = users.id
        JOIN challenges ON solves.challenge_id = challenges.id
        ORDER BY solves.created_at DESC
        LIMIT 10
    `, (err, rows) => {
        if (err) return res.json({ success: false });

        const activities = rows.map(r => ({
            username: r.username,
            action: "solved",
            target: r.title,
            type: "solve",
            timestamp: r.created_at
        }));

        res.json({ success: true, activities });
    });
});

// ================== HOME ==================
app.get('/', (req, res) => {
    res.render('index', {
        title: 'VIVY CTF V2'
        // activePage is automatically set by middleware to 'home'
    });
});

// ================== THEME ==================
app.post('/theme', (req, res) => {
    const { theme } = req.body;
    const validThemes = ['dark', 'hacker', 'neon'];

    if (validThemes.includes(theme)) {
        req.session.theme = theme;
    }

    res.redirect('back');
});

// ================== HEALTH ==================
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// ================== ERROR HANDLER ==================
// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { 
        title: '404 Not Found - VIVY V2'
        // All other variables come from res.locals
    });
});

// 500 error handler
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err.stack);
    
    res.status(500).render('500', {
        title: 'Server Error - VIVY V2',
        error: process.env.NODE_ENV === 'development' ? err.message : {},
        errorStack: process.env.NODE_ENV === 'development' ? err.stack : null
        // user, success_msg, error_msg, currentTheme, activePage come from res.locals
    });
});

// ================== GLOBAL ERROR ==================
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION:', err);
});

// ================== START ==================
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
