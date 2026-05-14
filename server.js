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

app.use(cors({ origin: '*', methods: '*' })); // Liberação total
app.use(express.json());

// Log de Raio-X em todas as requisições
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        console.log(`[API] ${req.method} ${req.path} - ${new Date().toISOString()}`);
    }
    next();
});

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

const firebase = require('./firebase');

// Função para fazer upload para o Firebase Storage
async function uploadToFirebase(file) {
    const bucket = firebase.bucket;
    if (!bucket) throw new Error('Firebase Storage não disponível');

    const fileName = `uploads/${Date.now()}-${file.originalname}`;
    const fileUpload = bucket.file(fileName);

    await fileUpload.save(file.buffer, {
        metadata: { contentType: file.mimetype }
    });

    // Torna o arquivo público e pega o link
    await fileUpload.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
}

// Configuração do Multer (agora usando memória para subir direto pro Firebase)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// API: Obter Status do WhatsApp
app.get('/api/status', (req, res) => {
    const waStatus = getStatus();
    const { db } = require('./firebase');
    res.json({ 
        ...waStatus, 
        firebase_connected: !!db 
    });
});

// API: Forçar Reconexão / Novo QR Code
app.post('/api/reconnect', async (req, res) => {
    try {
        const { full } = req.body;
        if (full) {
            console.log('🧨 Realizando RESET TOTAL da sessão...');
            const { db: firestore } = require('./firebase');
            const snapshot = await firestore.collection('whatsapp_auth').get();
            const batch = firestore.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log('✅ Sessão apagada do Firebase.');
        }
        await connectToWhatsApp();
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao reconectar:', error);
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
app.post('/api/schedule', upload.any(), async (req, res) => {
    const { group_jid, message, scheduled_time, media_type, media_url, file_url } = req.body;
    
    let final_url = media_url || file_url || null; // Prioriza o link se já existir
    
    try {
        // Se não veio link, mas veio arquivo, faz o upload pro Storage
        if (!final_url && req.files && req.files.length > 0) {
            console.log(`[API] Fazendo upload do arquivo para o Firebase Storage...`);
            final_url = await uploadToFirebase(req.files[0]);
            console.log(`✅ [API] Upload concluído: ${final_url}`);
        }

        console.log(`[API] Recebido agendamento para: ${group_jid}, Mídia: ${media_type || 'link'}`);

        await db.run(
            "INSERT INTO schedules (group_jid, message, file_path, file_type, scheduled_time) VALUES (?, ?, ?, ?, ?)",
            [group_jid, message, final_url, media_type, scheduled_time]
        );
        res.json({ success: true, url: final_url });
    } catch (error) {
        console.error('❌ Erro no agendamento:', error.message);
        res.status(500).json({ error: 'Erro ao processar agendamento', details: error.message });
    }
});

// API: Listar Agendamentos
app.get('/api/schedules', async (req, res) => {
    try {
        const rows = await db.all("SELECT * FROM schedules ORDER BY scheduled_time DESC");
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar agendamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar agendamentos', details: error.message });
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
