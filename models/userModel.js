const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {

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

    static async validatePassword(user, password) {
        return bcrypt.compare(password, user.password);
    }

    static async getStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                'SELECT COUNT(*) as solves FROM solves WHERE user_id = ?',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row || { solves: 0 });
                }
            );
        });
    }
}

module.exports = User;
