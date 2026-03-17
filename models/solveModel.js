const db = require('../config/database');

class Solve {
    static async create(userId, challengeId, teamId = null) {
        return new Promise((resolve, reject) => {
            db.run(
                'INSERT OR IGNORE INTO solves (user_id, challenge_id, team_id) VALUES (?, ?, ?)',
                [userId, challengeId, teamId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static async checkUserSolved(userId, challengeId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM solves WHERE user_id = ? AND challenge_id = ?',
                [userId, challengeId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    static async getChallengeSolves(challengeId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    s.created_at,
                    u.username,
                    u.id as user_id,
                    t.name as team_name
                FROM solves s
                JOIN users u ON s.user_id = u.id
                LEFT JOIN teams t ON u.team_id = t.id
                WHERE s.challenge_id = ?
                ORDER BY s.created_at ASC
            `, [challengeId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getUserSolves(userId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    c.*,
                    s.created_at as solved_at
                FROM solves s
                JOIN challenges c ON s.challenge_id = c.id
                WHERE s.user_id = ?
                ORDER BY s.created_at DESC
            `, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getFirstBloods() {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    c.id as challenge_id,
                    c.title,
                    u.username,
                    s.created_at
                FROM challenges c
                JOIN solves s ON c.id = s.challenge_id
                JOIN users u ON s.user_id = u.id
                WHERE s.created_at = (
                    SELECT MIN(created_at)
                    FROM solves
                    WHERE challenge_id = c.id
                )
                GROUP BY c.id
                ORDER BY s.created_at ASC
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = Solve;