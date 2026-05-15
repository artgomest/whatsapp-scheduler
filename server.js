const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { connectToWhatsApp, getGroups, sendMessage, getStatus } = require('./whatsapp');

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
    // Pega os dados tentando vários nomes possíveis (Instagram vs WhatsApp)
    const group_jid = req.body.group_jid || req.body.waGroupJid;
    const message = req.body.message || req.body.waCaption || req.body.caption;
    const scheduled_time = req.body.scheduled_time || (req.body.date && req.body.time ? `${req.body.date}T${req.body.time}` : null);
    const media_type = req.body.media_type || req.body.file_type || 'image';
    const media_url = req.body.media_url || req.body.file_url || null;

    console.log(`[DEBUG API] Recebido: Group=${group_jid}, Time=${scheduled_time}, Msg=${message?.substring(0, 20)}...`);
    
    let final_url = media_url;
    try {
        if (!final_url && req.files && req.files.length > 0) {
            console.log(`[API] Convertendo arquivo vindo do Insta para base64...`);
            const file = req.files[0];
            const base64Data = file.buffer.toString('base64');
            final_url = `data:${file.mimetype};base64,${base64Data}`;
        }

        if (!group_jid || !scheduled_time) {
            throw new Error('Faltam informações obrigatórias: group_jid ou scheduled_time');
        }

        const firestoreDb = firebase.db;
        if (!firestoreDb) throw new Error('Firebase Firestore não está disponível');
        
        await firestoreDb.collection('schedules').add({
            group_jid,
            message,
            file_path: final_url,
            file_type: media_type,
            scheduled_time,
            status: 'pending',
            created_at: new Date().toISOString()
        });
        
        console.log(`✅ [API] Agendamento salvo no Firebase com sucesso!`);
        res.json({ success: true, url: final_url });
    } catch (error) {
        console.error('❌ [API] ERRO NO AGENDAMENTO:', error.message);
        res.status(500).json({ error: 'Erro ao processar agendamento', details: error.message });
    }
});

// API: Listar Agendamentos
app.get('/api/schedules', async (req, res) => {
    try {
        const firestoreDb = firebase.db;
        if (!firestoreDb) throw new Error('Firebase Firestore não está disponível');

        const snapshot = await firestoreDb.collection('schedules').orderBy('scheduled_time', 'desc').get();
        const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(rows);
    } catch (error) {
        console.error('Erro ao buscar agendamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar agendamentos', details: error.message });
    }
});

// Rota para deletar agendamento
app.delete('/api/schedule/:id', async (req, res) => {
    try {
        const firestoreDb = firebase.db;
        if (!firestoreDb) throw new Error('Firebase Firestore não está disponível');

        await firestoreDb.collection('schedules').doc(req.params.id).delete();
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
    await connectToWhatsApp();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });

    // Scheduler Worker (every minute)
    cron.schedule('* * * * *', async () => {
        console.log('Checking for scheduled messages...');
        
        const firestoreDb = firebase.db;
        if (!firestoreDb) {
            console.error('[Scheduler] Firebase DB não disponível.');
            return;
        }

        // Ajuste para Fuso Horário de Brasília (GMT-3)
        const now = new Date();
        const brasilTime = new Date(now.getTime() - (3 * 60 * 60 * 1000)); 
        const localISO = brasilTime.toISOString().slice(0, 16); 

        console.log(`[Scheduler] Horário Brasília: ${localISO}`);
        
        try {
            const snapshot = await firestoreDb.collection('schedules')
                .where('status', '==', 'pending')
                .where('scheduled_time', '<=', localISO)
                .get();

            const pending = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            for (const task of pending) {
                try {
                    console.log(`Sending scheduled message to ${task.group_jid}`);
                    await sendMessage(task.group_jid, task.message, task.file_path, task.file_type);
                    await firestoreDb.collection('schedules').doc(task.id).update({ status: 'sent' });
                } catch (error) {
                    console.error(`Failed to send to ${task.group_jid}:`, error);
                    await firestoreDb.collection('schedules').doc(task.id).update({ status: 'failed', error_message: error.message });
                }
            }
        } catch (error) {
            console.error('[Scheduler] Erro ao processar fila:', error);
        }
    });
}

startApp();
