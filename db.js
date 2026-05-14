const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let dbConnection;

async function init() {
    dbConnection = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    await dbConnection.exec(`
        CREATE TABLE IF NOT EXISTS groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jid TEXT UNIQUE,
            name TEXT
        );

        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_jid TEXT,
            message TEXT,
            file_path TEXT,
            file_type TEXT, -- 'image', 'video', 'text'
            scheduled_time DATETIME,
            status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
            error_message TEXT
        );
    `);

    return dbConnection;
}

async function run(sql, params) {
    return dbConnection.run(sql, params);
}

async function all(sql, params) {
    return dbConnection.all(sql, params);
}

module.exports = { init, run, all };
