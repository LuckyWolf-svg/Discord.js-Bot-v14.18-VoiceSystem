import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err.message);
    } else {
        console.log('Подключение к SQLite установлено');
        initializeDB();
        initializeEconomyDB(); // Вызываем инициализацию экономики
    }
});

function initializeDB() {
    db.run(`
        CREATE TABLE IF NOT EXISTS user_channel_settings (
            user_id TEXT PRIMARY KEY,
            channel_id TEXT,
            channel_name TEXT,
            user_limit INTEGER DEFAULT 0,
            banned_users TEXT DEFAULT '[]',
            is_locked BOOLEAN DEFAULT 0,          -- Закрыта ли комната
            is_hidden BOOLEAN DEFAULT 0,          -- Скрыта ли комната
            muted_users TEXT DEFAULT '[]',        -- Заглушенные пользователи
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы:', err.message);
        }
    });
}

// Функция инициализации экономики - ДОБАВЛЯЕМ export
export function initializeEconomyDB() {
    db.run(`
        CREATE TABLE IF NOT EXISTS user_balance (
            user_id TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы баланса:', err.message);
        } else {
            //console.log('Таблица баланса готова');
        }
    });
}

// Остальной код остается без изменений...
export function getUserBalance(userId) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM user_balance 
            WHERE user_id = ?
        `, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                if (row) {
                    resolve(row);
                } else {
                    // Создаем запись если пользователя нет в базе
                    db.run(`
                        INSERT INTO user_balance (user_id, balance) 
                        VALUES (?, 0)
                    `, [userId], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ user_id: userId, balance: 0 });
                        }
                    });
                }
            }
        });
    });
}

export function updateUserBalance(userId, amount) {
    return new Promise((resolve, reject) => {
        // Сначала получаем текущий баланс
        getUserBalance(userId)
            .then(user => {
                const newBalance = user.balance + amount;
                
                db.run(`
                    UPDATE user_balance 
                    SET balance = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE user_id = ?
                `, [newBalance, userId], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ user_id: userId, balance: newBalance });
                    }
                });
            })
            .catch(reject);
    });
}

export function setUserBalance(userId, amount) {
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT OR REPLACE INTO user_balance 
            (user_id, balance, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [userId, amount], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ user_id: userId, balance: amount });
            }
        });
    });
}

// СУЩЕСТВУЮЩИЙ ФУНКЦИОНАЛ
export async function validateBannedUsers(guild, bannedUsers) {
    if (!bannedUsers || bannedUsers.length === 0) {
        return [];
    }
    
    const validUsers = [];
    
    for (const userId of bannedUsers) {
        try {
            await guild.members.fetch(userId);
            validUsers.push(userId);
        } catch (error) {
            console.log(`Пользователь ${userId} не найден на сервере, исключаем из бана`);
        }
    }
    
    return validUsers;
}

export async function saveChannelSettings(guild, userId, settings) {
    return new Promise((resolve, reject) => {
        if (!settings) {
            reject(new Error('Settings object is undefined'));
            return;
        }
        
        const { 
            channel_id, 
            channel_name, 
            user_limit, 
            banned_users = [], 
            muted_users = [],
            is_locked = false,
            is_hidden = false 
        } = settings;
        
        Promise.all([
            validateBannedUsers(guild, banned_users),
            validateBannedUsers(guild, muted_users)
        ]).then(([validBannedUsers, validMutedUsers]) => {
            const bannedUsersJSON = JSON.stringify(validBannedUsers);
            const mutedUsersJSON = JSON.stringify(validMutedUsers);
            
            db.run(`
                INSERT OR REPLACE INTO user_channel_settings 
                (user_id, channel_id, channel_name, user_limit, banned_users, muted_users, is_locked, is_hidden, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [userId, channel_id, channel_name, user_limit, bannedUsersJSON, mutedUsersJSON, is_locked ? 1 : 0, is_hidden ? 1 : 0], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        }).catch(reject);
    });
}

export function getChannelSettings(userId) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM user_channel_settings 
            WHERE user_id = ?
        `, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                if (row) {
                    try {
                        row.banned_users = JSON.parse(row.banned_users || '[]');
                        row.muted_users = JSON.parse(row.muted_users || '[]');
                        row.is_locked = Boolean(row.is_locked);
                        row.is_hidden = Boolean(row.is_hidden);
                    } catch {
                        row.banned_users = [];
                        row.muted_users = [];
                        row.is_locked = false;
                        row.is_hidden = false;
                    }
                    resolve(row);
                } else {
                    resolve(null);
                }
            }
        });
    });
}

export function getUserByChannelId(channelId) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT user_id FROM user_channel_settings 
            WHERE channel_id = ?
        `, [channelId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row ? row.user_id : null);
            }
        });
    });
}

export function deleteChannelSettings(userId) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM user_channel_settings WHERE user_id = ?`, [userId], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

export function updateChannelId(userId, channelId) {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE user_channel_settings 
            SET channel_id = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE user_id = ?
        `, [channelId, userId], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}
