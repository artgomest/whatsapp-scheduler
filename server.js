const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { connectToWhatsApp, getGroups, sendMessage, getStatus } = require('./whatsapp');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do Frontend
const distPath = path.resolve(__dirname, 'frontend', 'dist');
if (fs.existsSync(distPath)) {
    console.log('✅ Pasta dist encontrada em:', distPath);
    console.log('📂 Arquivos no dist:', fs.readdirSync(distPath));
    if (fs.existsSync(path.join(distPath, 'assets'))) {
        console.log('📂 Arquivos no dist/assets:', fs.readdirSync(path.join(distPath, 'assets')));
    }
    app.use(express.static(distPath));
} else {
    console.warn('⚠️ ATENÇÃO: Pasta dist NÃO encontrada em:', distPath);
}

// Configuração do Multer para uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// API: Obter Status do WhatsApp
app.get('/api/status', (req, res) => {
    res.json(getStatus());
});

// API: Forçar Reconexão / Novo QR Code
app.post('/api/reconnect', async (req, res) => {
    try {
        await connectToWhatsApp();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao reiniciar conexão' });
    }
});

// API: Listar Grupos
app.get('/api/groups', async (req, res) => {
    try {
        const groups = await getGroups();
        res.json(groups);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar grupos' });
    }
});

// API: Agendar Mensagem
app.post('/api/schedule', upload.fields([{ name: 'media' }, { name: 'file' }]), async (req, res) => {
    const { group_jid, message, scheduled_time, media_type } = req.body;
    
    let file_path = null;
    if (req.files) {
        if (req.files['media']) file_path = req.files['media'][0].path;
        else if (req.files['file']) file_path = req.files['file'][0].path;
    }

    try {
        await db.run(
            "INSERT INTO schedules (group_jid, message, file_path, file_type, scheduled_time) VALUES (?, ?, ?, ?, ?)",
            [group_jid, message, file_path, media_type, scheduled_time]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao salvar agendamento' });
    }
});

// API: Listar Agendamentos
app.get('/api/schedules', async (req, res) => {
    try {
        const rows = await db.all("SELECT * FROM schedules ORDER BY scheduled_time DESC");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar agendamentos' });
    }
});

// Rota para deletar agendamento
app.delete('/api/schedule/:id', async (req, res) => {
    try {
        await db.run("DELETE FROM schedules WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao deletar' });
    }
});

// Rota para qualquer outra coisa devolver o index.html (SPA support)
// Mas APENAS se não for um pedido de arquivo (que tenha ponto no nome como .js, .css)
app.get('*', (req, res) => {
    if (req.path.includes('.')) {
        return res.status(404).send('Arquivo não encontrado');
    }
    res.sendFile(path.join(distPath, 'index.html'));
});

// Inicializar Servidor e WhatsApp
async function startApp() {
    await db.init();
    await connectToWhatsApp();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });

    // Scheduler Worker (every minute)
    cron.schedule('* * * * *', async () => {
        console.log('Checking for scheduled messages...');
        
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
                await sendMessage(task.group_jid, task.message, task.file_path, task.file_type);
                await db.run("UPDATE schedules SET status = 'sent' WHERE id = ?", [task.id]);
            } catch (error) {
                console.error(`Failed to send to ${task.group_jid}:`, error);
                await db.run("UPDATE schedules SET status = 'failed', error_message = ? WHERE id = ?", [error.message, task.id]);
            }
        }
    });
}

startApp();
