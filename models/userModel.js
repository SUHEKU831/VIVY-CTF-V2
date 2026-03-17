const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {

    // ================= CREATE USER =================
    static async create(username, email, password) {
        const hashedPassword = await bcrypt.hash(password, 10);

        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                [username, email, hashedPassword],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    // ================= FIND =================
    static async findByUsername(username) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM users WHERE username = ?',
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    static async findByEmail(email) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM users WHERE email = ?',
                [email],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    static async findById(id) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM users WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // ================= PASSWORD =================
    static async validatePassword(user, password) {
        return bcrypt.compare(password, user.password);
    }

    static async updatePassword(userId, newPassword) {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET password = ? WHERE id = ?',
                [hashedPassword, userId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // ================= PROFILE =================
    static async updateEmail(userId, email) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET email = ? WHERE id = ?',
                [email, userId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    // ================= TEAM =================
    static async updateTeam(userId, teamId) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET team_id = ? WHERE id = ?',
                [teamId, userId],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // ================= STATS =================
    static async getStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(DISTINCT challenge_id) as solves,
                    COALESCE(SUM(challenges.points), 0) as total_points
                FROM solves 
                LEFT JOIN challenges ON solves.challenge_id = challenges.id
                WHERE solves.user_id = ?
            `, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row || { solves: 0, total_points: 0 });
            });
        });
    }
}

module.exports = User;
