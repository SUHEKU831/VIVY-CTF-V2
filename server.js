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

// ===== Railway Fix =====
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ===== Auto Folder =====
if (!fs.existsSync('public/challenges')) {
    fs.mkdirSync('public/challenges', { recursive: true });
}

// ===== Database =====
const db = require('./config/database');

// ===== Security =====
app.use(helmet({ contentSecurityPolicy: false }));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

// ===== Middleware =====
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 },
    createParentPath: true
}));

app.use(express.static('public'));
app.use('/challenges', express.static('public/challenges'));

// ===== Session =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret123',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

app.use(flash());

// ===== View =====
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ===== Global Vars =====
app.use((req, res, next) => {
    res.locals.user = req.session?.user || null;

    // ✅ INI YANG KURANG
    res.locals.currentTheme = req.session?.theme || 'dark';

    const success = req.flash('success');
    const error = req.flash('error');

    res.locals.success_msg = success[0] || null;
    res.locals.error_msg = error[0] || null;

    const p = req.path;

    if (p === '/') res.locals.activePage = 'home';
    else if (p.startsWith('/challenges')) res.locals.activePage = 'challenges';
    else if (p.startsWith('/scoreboard')) res.locals.activePage = 'scoreboard';
    else if (p.startsWith('/teams')) res.locals.activePage = 'team';
    else if (p.startsWith('/profile')) res.locals.activePage = 'profile';
    else if (p.startsWith('/admin')) res.locals.activePage = 'admin';
    else res.locals.activePage = 'home';

    next();
});

// ===== DATABASE INIT =====
db.serialize(() => {

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user',
        team_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        password TEXT,
        creator_id INTEGER,
        description TEXT,
        type TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        category TEXT,
        points INTEGER,
        flag TEXT,
        file_path TEXT,
        visible BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS solves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        challenge_id INTEGER,
        team_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS team_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER,
        user_id INTEGER,
        action TEXT,
        performed_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS join_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER,
        user_id INTEGER,
        message TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Default admin
    db.get("SELECT * FROM users WHERE role = 'admin'", async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('admin123', 10);
            db.run(
                "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
                ['admin', 'admin@ctf.local', hash, 'admin']
            );
            console.log('Admin created: admin / admin123');
        }
    });
});

// ===== SAFE ROUTES =====
function loadRoute(url, file) {
    try {
        app.use(url, require(file));
        console.log(`Loaded ${url}`);
    } catch (err) {
        console.error(`Error load ${file}:`, err.message);
    }
}

loadRoute('/', './routes/authRoutes');
loadRoute('/challenges', './routes/challengeRoutes');
loadRoute('/teams', './routes/teamRoutes');
loadRoute('/scoreboard', './routes/scoreboardRoutes');
loadRoute('/admin', './routes/adminRoutes');

// ===== HOME =====
app.get('/', (req, res) => {
    res.render('index', { title: 'VIVY CTF V2' });
});

// ===== API =====
app.get('/api/stats', (req, res) => {
    db.get(`
        SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM challenges) as challenges,
        (SELECT COUNT(*) FROM solves) as solves,
        (SELECT COUNT(*) FROM teams) as teams
    `, (err, data) => {
        if (err) return res.json({ success: false, error: err.message });
        res.json({ success: true, data });
    });
});

// ===== 404 =====
app.use((req, res) => {
    res.status(404).render('404', { title: 'Not Found' });
});

// ===== 500 =====
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);

    res.status(500).render('500', {
        title: 'Server Error',
        error: err.message || err.toString(),
        errorStack: err.stack || null,

        // ✅ FIX PENTING
        currentTheme: req.session?.theme || 'dark',
        user: req.session?.user || null
    });
});

// ===== GLOBAL ERROR =====
process.on('uncaughtException', err => console.error(err));
process.on('unhandledRejection', err => console.error(err));

// ===== START =====
app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
