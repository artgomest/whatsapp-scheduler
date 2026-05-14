const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');
const { connectToWhatsApp, getStatus, getGroups, sendMessage } = require('./whatsapp');
const cron = require('node-cron');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

let db;

async function startServer() {
    db = await initDb();
    
    // Start WhatsApp connection
    connectToWhatsApp();

    // API Routes
    app.get('/api/status', (req, res) => {
        res.json(getStatus());
    });

    app.get('/api/groups', async (req, res) => {
        try {
            const groups = await getGroups();
            res.json(groups);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/schedule', upload.single('media'), async (req, res) => {
        const { group_jid, message, scheduled_time, media_type } = req.body;
        const media_path = req.file ? req.file.path : null;

        try {
            await db.run(
                `INSERT INTO schedules (group_jid, message, media_path, media_type, scheduled_time) 
                 VALUES (?, ?, ?, ?, ?)`,
                [group_jid, message, media_path, media_type, scheduled_time]
            );
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/schedules', async (req, res) => {
        const schedules = await db.all('SELECT * FROM schedules ORDER BY scheduled_time ASC');
        res.json(schedules);
    });

    app.delete('/api/schedule/:id', async (req, res) => {
        await db.run('DELETE FROM schedules WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    });

    // Scheduler Worker (every minute)
    cron.schedule('* * * * *', async () => {
        console.log('Running scheduler check...');
        
        // Obter data/hora atual no formato ISO mas ajustado para o local (YYYY-MM-DDTHH:mm)
        // Isso garante que bata com o formato vindo do <input type="datetime-local">
        const now = new Date();
        const localISO = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
                            .toISOString()
                            .slice(0, 16); 

        const pending = await db.all(
            "SELECT * FROM schedules WHERE status = 'pending' AND scheduled_time <= ?",
            [localISO]
        );

        for (const task of pending) {
            try {
                console.log(`Sending scheduled message to ${task.group_jid}`);
                await sendMessage(task.group_jid, task.message, task.media_path, task.media_type);
                await db.run("UPDATE schedules SET status = 'sent' WHERE id = ?", [task.id]);
            } catch (error) {
                console.error(`Failed to send message ${task.id}:`, error);
                await db.run(
                    "UPDATE schedules SET status = 'failed', error_message = ? WHERE id = ?",
                    [error.message, task.id]
                );
            }
        }
    });

    app.listen(port, () => {
        console.log(`Backend running at http://localhost:${port}`);
    });
}

startServer();
