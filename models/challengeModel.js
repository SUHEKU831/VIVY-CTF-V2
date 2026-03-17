const db = require('../config/database');

class Challenge {
    static async create(challengeData) {
        const { title, description, category, points, flag, file_path, visible } = challengeData;
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO challenges (title, description, category, points, flag, file_path, visible) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [title, description, category, points, flag, file_path, visible ? 1 : 0],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static async getAll(visibleOnly = true) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM challenges';
            if (visibleOnly) {
                query += ' WHERE visible = 1';
            }
            query += ' ORDER BY points ASC, created_at DESC';
            
            db.all(query, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async findById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM challenges WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async update(id, challengeData) {
        const { title, description, category, points, flag, file_path, visible } = challengeData;
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE challenges 
                 SET title = ?, description = ?, category = ?, points = ?, 
                     flag = ?, file_path = ?, visible = ?
                 WHERE id = ?`,
                [title, description, category, points, flag, file_path, visible ? 1 : 0, id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static async delete(id) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM challenges WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async toggleVisibility(id) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE challenges SET visible = NOT visible WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    static async getCategories() {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT DISTINCT category FROM challenges ORDER BY category',
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => row.category));
                }
            );
        });
    }
}

module.exports = Challenge;