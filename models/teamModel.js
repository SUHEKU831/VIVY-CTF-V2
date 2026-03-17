const db = require('../config/database');
const bcrypt = require('bcryptjs');

class Team {

    // ================= BASIC =================

    static async create(name, password, creatorId) {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            return new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO teams (name, password, creator_id) VALUES (?, ?, ?)',
                    [name, hashedPassword, creatorId],
                    function (err) {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    }
                );
            });
        } catch (err) {
            throw err;
        }
    }

    static async findById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM teams WHERE id = ?', [id], (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }

    static async findByName(name) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM teams WHERE name = ?', [name], (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }

    static async update(teamId, data) {
        try {
            const { name, description, type, password } = data;

            let hashedPassword = null;

            if (password) {
                hashedPassword = await bcrypt.hash(password, 10);
            }

            return new Promise((resolve, reject) => {
                db.run(
                    `UPDATE teams 
                     SET name = ?, 
                         description = ?, 
                         type = ?, 
                         password = COALESCE(?, password)
                     WHERE id = ?`,
                    [name, description, type || 'open', hashedPassword, teamId],
                    function (err) {
                        if (err) return reject(err);
                        resolve(this.changes);
                    }
                );
            });
        } catch (err) {
            throw err;
        }
    }

    static async delete(teamId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM teams WHERE id = ?', [teamId], function (err) {
                if (err) return reject(err);
                resolve(this.changes);
            });
        });
    }

    // ================= MEMBERS =================

    static async getMembers(teamId) {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT id, username, email FROM users WHERE team_id = ?',
                [teamId],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                }
            );
        });
    }

    static async getMemberCount(teamId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as count FROM users WHERE team_id = ?',
                [teamId],
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row ? row.count : 0);
                }
            );
        });
    }

    static async updateLeader(teamId, newLeaderId) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE teams SET creator_id = ? WHERE id = ?',
                [newLeaderId, teamId],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.changes);
                }
            );
        });
    }

    // ================= STATS =================

    static async getTeamStats(teamId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    u.username,
                    u.id as user_id,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as points
                FROM users u
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                WHERE u.team_id = ?
                GROUP BY u.id
            `, [teamId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    static async getMemberStats(teamId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    u.id,
                    u.username,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as points,
                    MAX(s.created_at) as last_solve
                FROM users u
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                WHERE u.team_id = ?
                GROUP BY u.id
                ORDER BY points DESC, last_solve ASC
            `, [teamId], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    static async getRecentSolves(teamId, limit = 10) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    s.created_at,
                    u.username,
                    c.title as challenge_name,
                    c.points,
                    c.category
                FROM solves s
                JOIN users u ON s.user_id = u.id
                JOIN challenges c ON s.challenge_id = c.id
                WHERE u.team_id = ?
                ORDER BY s.created_at DESC
                LIMIT ?
            `, [teamId, limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    static async getRank(teamId) {
        return new Promise((resolve, reject) => {
            db.get(`
                WITH team_scores AS (
                    SELECT 
                        t.id,
                        COALESCE(SUM(c.points), 0) as total_points
                    FROM teams t
                    LEFT JOIN users u ON t.id = u.team_id
                    LEFT JOIN solves s ON u.id = s.user_id
                    LEFT JOIN challenges c ON s.challenge_id = c.id
                    GROUP BY t.id
                )
                SELECT COUNT(*) + 1 as rank
                FROM team_scores
                WHERE total_points > (
                    SELECT total_points FROM team_scores WHERE id = ?
                )
            `, [teamId], (err, row) => {
                if (err) return reject(err);
                resolve(row ? row.rank : 1);
            });
        });
    }

    // ================= DISCOVERY =================

    static async getPublicTeams(limit = 20) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    COUNT(u.id) as member_count
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                GROUP BY t.id
                ORDER BY t.id DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    static async searchTeams(searchTerm) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    COUNT(u.id) as member_count
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                WHERE t.name LIKE ? OR t.description LIKE ?
                GROUP BY t.id
                ORDER BY t.id DESC
                LIMIT 20
            `, [`%${searchTerm}%`, `%${searchTerm}%`], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    static async getTopTeams(limit = 10) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.id,
                    t.name,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as total_points,
                    COUNT(DISTINCT u.id) as member_count
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                GROUP BY t.id
                ORDER BY total_points DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    static async getRecentTeams(limit = 5) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    COUNT(u.id) as member_count
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                GROUP BY t.id
                ORDER BY t.id DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) return reject(err);
                resolve(rows || []);
            });
        });
    }

    // ================= AUTH =================

    static async validatePassword(team, password) {
        if (!team || !team.password) return false;
        return bcrypt.compare(password, team.password);
    }
}

module.exports = Team;
    static async getTeamStats(teamId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    u.username,
                    u.id as user_id,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as points
                FROM users u
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                WHERE u.team_id = ?
                GROUP BY u.id
            `, [teamId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getMemberStats(teamId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    u.id,
                    u.username,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as points,
                    MAX(s.created_at) as last_solve
                FROM users u
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                WHERE u.team_id = ?
                GROUP BY u.id
                ORDER BY points DESC, last_solve ASC
            `, [teamId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getRecentSolves(teamId, limit = 10) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    s.created_at,
                    u.username,
                    c.title as challenge_name,
                    c.points,
                    c.category
                FROM solves s
                JOIN users u ON s.user_id = u.id
                JOIN challenges c ON s.challenge_id = c.id
                WHERE u.team_id = ?
                ORDER BY s.created_at DESC
                LIMIT ?
            `, [teamId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getRank(teamId) {
        return new Promise((resolve, reject) => {
            db.get(`
                WITH team_scores AS (
                    SELECT 
                        t.id,
                        COALESCE(SUM(c.points), 0) as total_points
                    FROM teams t
                    LEFT JOIN users u ON t.id = u.team_id
                    LEFT JOIN solves s ON u.id = s.user_id
                    LEFT JOIN challenges c ON s.challenge_id = c.id
                    GROUP BY t.id
                )
                SELECT COUNT(*) + 1 as rank
                FROM team_scores
                WHERE total_points > (
                    SELECT total_points FROM team_scores WHERE id = ?
                )
            `, [teamId], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.rank : 1);
            });
        });
    }

    // ================= DISCOVERY =================

    static async getPublicTeams(limit = 20) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    COUNT(u.id) as member_count,
                    u2.username as creator_name
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                LEFT JOIN users u2 ON t.creator_id = u2.id
                WHERE t.type = 'open' OR t.type IS NULL
                GROUP BY t.id
                ORDER BY t.created_at DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async searchTeams(searchTerm) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    COUNT(u.id) as member_count,
                    u2.username as creator_name
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                LEFT JOIN users u2 ON t.creator_id = u2.id
                WHERE t.name LIKE ? OR t.description LIKE ?
                GROUP BY t.id
                ORDER BY t.created_at DESC
                LIMIT 20
            `, [`%${searchTerm}%`, `%${searchTerm}%`], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getTopTeams(limit = 10) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.id,
                    t.name,
                    COUNT(DISTINCT s.challenge_id) as solves,
                    COALESCE(SUM(c.points), 0) as total_points,
                    COUNT(DISTINCT u.id) as member_count
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                LEFT JOIN solves s ON u.id = s.user_id
                LEFT JOIN challenges c ON s.challenge_id = c.id
                GROUP BY t.id
                HAVING total_points > 0
                ORDER BY total_points DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getRecentTeams(limit = 5) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    t.*,
                    COUNT(u.id) as member_count
                FROM teams t
                LEFT JOIN users u ON t.id = u.team_id
                GROUP BY t.id
                ORDER BY t.created_at DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ================= JOIN REQUEST =================

    static async createJoinRequest(teamId, userId, message = '') {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO join_requests (team_id, user_id, message, status, created_at)
                 VALUES (?, ?, ?, 'pending', datetime('now'))`,
                [teamId, userId, message],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static async getJoinRequests(teamId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT jr.*, u.username, u.email
                FROM join_requests jr
                JOIN users u ON jr.user_id = u.id
                WHERE jr.team_id = ? AND jr.status = 'pending'
            `, [teamId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async approveJoinRequest(requestId) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE join_requests SET status = 'approved' WHERE id = ?`,
                [requestId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static async rejectJoinRequest(requestId) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE join_requests SET status = 'rejected' WHERE id = ?`,
                [requestId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // ================= ACTIVITY =================

    static async logActivity(teamId, userId, action, performedBy = null) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO team_activity (team_id, user_id, action, performed_by, created_at)
                 VALUES (?, ?, ?, ?, datetime('now'))`,
                [teamId, userId, action, performedBy || userId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static async getActivityFeed(teamId, limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT ta.*, u1.username as user_name
                FROM team_activity ta
                JOIN users u1 ON ta.user_id = u1.id
                WHERE ta.team_id = ?
                ORDER BY ta.created_at DESC
                LIMIT ?
            `, [teamId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // ================= AUTH =================

    static async validatePassword(team, password) {
        return bcrypt.compare(password, team.password);
    }
}

module.exports = Team;
