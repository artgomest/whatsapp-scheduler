const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function initDb() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jid TEXT UNIQUE,
            name TEXT
        );

        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_jid TEXT,
            message TEXT,
            media_path TEXT,
            media_type TEXT, -- 'image', 'video', 'text'
            scheduled_time DATETIME,
            status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
            error_message TEXT
        );
    `);

    return db;
}

module.exports = { initDb };
