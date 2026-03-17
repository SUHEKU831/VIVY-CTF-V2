const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = process.env.DB_PATH || './database.sqlite';

// Auto create directory kalau perlu
const dir = require('path').dirname(dbPath);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to SQLite database:', dbPath);
    }
});

// 🔥 IMPORTANT (anti locked database)
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL;');

module.exports = db;