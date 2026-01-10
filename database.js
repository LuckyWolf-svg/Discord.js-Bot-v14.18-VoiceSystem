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
        initializeUserInfoDB();
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
            is_locked BOOLEAN DEFAULT 0,
            is_hidden BOOLEAN DEFAULT 0,
            muted_users TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы:', err.message);
        }
    });
}

export function initializeUserInfoDB() {
    // Таблица с информацией о пользователях
    db.run(`
        CREATE TABLE IF NOT EXISTS user_info (
            user_id TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 0,
            warns INTEGER DEFAULT 0,
            last_warn_time DATETIME,
            warn_expiry_time DATETIME,
            mute_end_time DATETIME,
            mute_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы user_info:', err.message);
        } else {
            console.log('✅ Таблица user_info готова');
            // Добавляем недостающие колонки, если они есть
            addMissingColumns();
        }
    });
    
    // Таблица истории варнов
    db.run(`
        CREATE TABLE IF NOT EXISTS warn_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            moderator_id TEXT NOT NULL,
            warn_count INTEGER DEFAULT 1,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы warn_history:', err.message);
        }
    });
    
    // Таблица истории мутов
    db.run(`
        CREATE TABLE IF NOT EXISTS mute_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            moderator_id TEXT NOT NULL,
            duration_minutes INTEGER,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Ошибка создания таблицы mute_history:', err.message);
        }
    });
}

// Функция для добавления недостающих колонок
function addMissingColumns() {
    const columnsToAdd = [
        { name: 'warn_expiry_time', type: 'DATETIME' }
    ];
    
    columnsToAdd.forEach(column => {
        db.run(`ALTER TABLE user_info ADD COLUMN ${column.name} ${column.type}`, (err) => {
            if (err) {
                // Колонка уже существует, это нормально
                if (!err.message.includes('duplicate column name')) {
                    console.log(`Колонка ${column.name} уже существует или ошибка:`, err.message);
                }
            } else {
                console.log(`✅ Добавлена колонка ${column.name}`);
            }
        });
    });
}

// ============ USER INFO FUNCTIONS ============

export function getUserInfo(userId) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM user_info 
            WHERE user_id = ?
        `, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                if (row) {
                    resolve(row);
                } else {
                    // Создаем запись, если пользователя нет в базе
                    db.run(`
                        INSERT INTO user_info (user_id, balance, warns) 
                        VALUES (?, 0, 0)
                    `, [userId], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ 
                                user_id: userId, 
                                balance: 0,
                                warns: 0,
                                last_warn_time: null,
                                warn_expiry_time: null,
                                mute_end_time: null,
                                mute_reason: null
                            });
                        }
                    });
                }
            }
        });
    });
}

export function updateUserBalance(userId, amount) {
    return new Promise((resolve, reject) => {
        getUserInfo(userId)
            .then(user => {
                const newBalance = user.balance + amount;
                
                db.run(`
                    UPDATE user_info 
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
        getUserInfo(userId)
            .then(() => {
                db.run(`
                    UPDATE user_info 
                    SET balance = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE user_id = ?
                `, [amount, userId], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ user_id: userId, balance: amount });
                    }
                });
            })
            .catch(reject);
    });
}

// ============ WARN SYSTEM FUNCTIONS ============

export function addWarn(userId, moderatorId, warnCount = 1, reason = '') {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            // Получаем текущую информацию о пользователе
            db.get(`SELECT warns FROM user_info WHERE user_id = ?`, [userId], (err, row) => {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }
                
                const currentWarns = row ? row.warns : 0;
                const newWarns = currentWarns + warnCount;
                const now = new Date();
                const expiryTime = new Date(now.getTime() + 12 * 60 * 60 * 1000); // +12 часов
                
                // Обновляем warns и время истечения
                db.run(`
                    UPDATE user_info 
                    SET warns = ?, 
                        last_warn_time = ?, 
                        warn_expiry_time = ?, 
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `, [newWarns, now.toISOString(), expiryTime.toISOString(), userId], function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                    
                    // Если строка не была обновлена (пользователя нет), создаем новую
                    if (this.changes === 0) {
                        db.run(`
                            INSERT INTO user_info 
                            (user_id, warns, last_warn_time, warn_expiry_time, updated_at)
                            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                        `, [userId, newWarns, now.toISOString(), expiryTime.toISOString()], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }
                            
                            // Добавляем запись в историю варнов
                            db.run(`
                                INSERT INTO warn_history 
                                (user_id, moderator_id, warn_count, reason)
                                VALUES (?, ?, ?, ?)
                            `, [userId, moderatorId, warnCount, reason], function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve({ 
                                            user_id: userId, 
                                            warns: newWarns,
                                            total_added: warnCount,
                                            warn_expiry_time: expiryTime.toISOString()
                                        });
                                    }
                                });
                            });
                        });
                    } else {
                        // Добавляем запись в историю варнов
                        db.run(`
                            INSERT INTO warn_history 
                            (user_id, moderator_id, warn_count, reason)
                            VALUES (?, ?, ?, ?)
                        `, [userId, moderatorId, warnCount, reason], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }
                            
                            db.run('COMMIT', (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({ 
                                        user_id: userId, 
                                        warns: newWarns,
                                        total_added: warnCount,
                                        warn_expiry_time: expiryTime.toISOString()
                                    });
                                }
                            });
                        });
                    }
                });
            });
        });
    });
}

export function removeWarns(userId, warnCount = null) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            getUserInfo(userId)
                .then(user => {
                    const currentWarns = user.warns;
                    let newWarns;
                    
                    if (warnCount === null || warnCount >= currentWarns) {
                        newWarns = 0;
                    } else {
                        newWarns = currentWarns - warnCount;
                    }
                    
                    // Обновляем количество варнов
                    db.run(`
                        UPDATE user_info 
                        SET warns = ?, 
                            warn_expiry_time = CASE 
                                WHEN ? > 0 THEN warn_expiry_time 
                                ELSE NULL 
                            END,
                            updated_at = CURRENT_TIMESTAMP 
                        WHERE user_id = ?
                    `, [newWarns, newWarns, userId], function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        // Удаляем историю варнов если варны сняты полностью
                        if (newWarns === 0) {
                            db.run(`DELETE FROM warn_history WHERE user_id = ?`, [userId], function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }
                                
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve({ 
                                            user_id: userId, 
                                            old_warns: currentWarns,
                                            new_warns: newWarns,
                                            removed: currentWarns - newWarns
                                        });
                                    }
                                });
                            });
                        } else {
                            db.run('COMMIT', (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({ 
                                        user_id: userId, 
                                        old_warns: currentWarns,
                                        new_warns: newWarns,
                                        removed: currentWarns - newWarns
                                    });
                                }
                            });
                        }
                    });
                })
                .catch(err => {
                    db.run('ROLLBACK');
                    reject(err);
                });
        });
    });
}

export function clearExpiredWarns() {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        
        db.run(`
            UPDATE user_info 
            SET warns = 0, 
                last_warn_time = NULL, 
                warn_expiry_time = NULL, 
                updated_at = CURRENT_TIMESTAMP
            WHERE warn_expiry_time IS NOT NULL 
            AND warn_expiry_time < ?
            AND warns > 0
        `, [now], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ cleared: this.changes });
            }
        });
    });
}

export function getWarnHistory(userId, limit = 10) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM warn_history 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `, [userId, limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// ============ MUTE SYSTEM FUNCTIONS ============

export function addMute(userId, moderatorId, durationMinutes, reason = '') {
    return new Promise((resolve, reject) => {
        const muteEndTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            db.run(`
                UPDATE user_info 
                SET mute_end_time = ?, mute_reason = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `, [muteEndTime, reason, userId], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }
                
                // Если строка не была обновлена (пользователя нет), создаем новую
                if (this.changes === 0) {
                    db.run(`
                        INSERT INTO user_info 
                        (user_id, mute_end_time, mute_reason, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    `, [userId, muteEndTime, reason], function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        // Добавляем запись в историю мутов
                        db.run(`
                            INSERT INTO mute_history 
                            (user_id, moderator_id, duration_minutes, reason)
                            VALUES (?, ?, ?, ?)
                        `, [userId, moderatorId, durationMinutes, reason], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }
                            
                            db.run('COMMIT', (err) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({ 
                                        user_id: userId, 
                                        mute_end_time: muteEndTime,
                                        duration_minutes: durationMinutes,
                                        reason: reason
                                    });
                                }
                            });
                        });
                    });
                } else {
                    // Добавляем запись в историю мутов
                    db.run(`
                        INSERT INTO mute_history 
                        (user_id, moderator_id, duration_minutes, reason)
                        VALUES (?, ?, ?, ?)
                    `, [userId, moderatorId, durationMinutes, reason], function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        
                        db.run('COMMIT', (err) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({ 
                                    user_id: userId, 
                                    mute_end_time: muteEndTime,
                                    duration_minutes: durationMinutes,
                                    reason: reason
                                });
                            }
                        });
                    });
                }
            });
        });
    });
}

export function removeMute(userId) {
    return new Promise((resolve, reject) => {
        db.run(`
            UPDATE user_info 
            SET mute_end_time = NULL, mute_reason = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `, [userId], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve({ user_id: userId, unmuted: true });
            }
        });
    });
}

export function checkAndRemoveExpiredMutes() {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        
        db.all(`
            SELECT user_id FROM user_info 
            WHERE mute_end_time IS NOT NULL 
            AND mute_end_time < ?
        `, [now], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const userIds = rows.map(row => row.user_id);
            
            if (userIds.length === 0) {
                resolve({ unmuted_users: [] });
                return;
            }
            
            // Удаляем все просроченные муты
            const placeholders = userIds.map(() => '?').join(',');
            db.run(`
                UPDATE user_info 
                SET mute_end_time = NULL, mute_reason = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE user_id IN (${placeholders})
            `, userIds, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        unmuted_users: userIds,
                        count: userIds.length
                    });
                }
            });
        });
    });
}

export function getMutedUsers() {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        
        db.all(`
            SELECT user_id, mute_end_time, mute_reason 
            FROM user_info 
            WHERE mute_end_time IS NOT NULL 
            AND mute_end_time > ?
            ORDER BY mute_end_time ASC
        `, [now], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

export function getWarnExpiryTime(userId) {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT warn_expiry_time FROM user_info 
            WHERE user_id = ?
        `, [userId], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row ? row.warn_expiry_time : null);
            }
        });
    });
}

// ============ CHANNEL SETTINGS FUNCTIONS ============

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

// ============ COMPATIBILITY FUNCTIONS ============

// Для совместимости со старым кодом
export function getUserBalance(userId) {
    return getUserInfo(userId).then(user => ({
        user_id: user.user_id,
        balance: user.balance
    }));
}

// Для совместимости со старым кодом (альтернативное название)
export function initializeEconomyDB() {
    return initializeUserInfoDB();
}
