const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { useFirebaseAuthState } = require('./firebaseAuth');
const P = require('pino');

let sock = null;
let status = 'disconnected';
let qr = null;

const getStatus = () => ({ status, qr });

async function connectToWhatsApp() {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`);

    // Usando nosso novo sistema de autenticação via Firebase
    const { state, saveCreds } = await useFirebaseAuthState('main_session');

    sock = makeWASocket({
        version,
        logger: P({ level: 'info' }), // Ativando logs informativos
        printQRInTerminal: true, // Mostra o QR no terminal do Render também como backup
        auth: state,
        browser: ["IBF Scheduler", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr: newQr } = update;
        
        if (newQr) {
            qr = newQr;
            status = 'disconnected';
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            status = 'disconnected';
            qr = null;
            if (shouldReconnect) {
                console.log('Conexão fechada, tentando reconectar...');
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Conectado com Sucesso via Firebase!');
            status = 'connected';
            qr = null;
        }
    });

    return sock;
}

async function getGroups() {
    if (!sock || status !== 'connected') return [];
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({
            jid: g.id,
            name: g.subject
        }));
    } catch (e) {
        console.error('Erro ao buscar grupos:', e);
        return [];
    }
}

async function sendMessage(jid, text, mediaPath, mediaType) {
    if (!sock || status !== 'connected') throw new Error('WhatsApp não conectado');
    
    if (mediaPath) {
        const options = mediaType === 'video' ? { video: { url: mediaPath }, caption: text } : { image: { url: mediaPath }, caption: text };
        return await sock.sendMessage(jid, options);
    } else {
        return await sock.sendMessage(jid, { text });
    }
}

module.exports = { connectToWhatsApp, getStatus, getGroups, sendMessage };
