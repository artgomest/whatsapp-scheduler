const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');

let sock = null;
let qrCode = null;
let connectionStatus = 'disconnected';

async function connectToWhatsApp(onQR) {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info'));
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCode = qr;
            if (onQR) onQR(qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ? 
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            
            connectionStatus = 'disconnected';
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            
            if (shouldReconnect) {
                connectToWhatsApp(onQR);
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCode = null;
            console.log('opened connection');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    return sock;
}

const getSock = () => sock;
const getStatus = () => ({ status: connectionStatus, qr: qrCode });

async function getGroups() {
    if (!sock) return [];
    try {
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({
            jid: g.id,
            name: g.subject
        }));
    } catch (e) {
        console.error('Error fetching groups:', e);
        return [];
    }
}

async function sendMessage(jid, text, mediaPath = null, mediaType = 'text') {
    if (!sock) throw new Error('WhatsApp not connected');

    if (mediaPath && fs.existsSync(mediaPath)) {
        const content = fs.readFileSync(mediaPath);
        if (mediaType === 'image') {
            await sock.sendMessage(jid, { image: content, caption: text });
        } else if (mediaType === 'video') {
            await sock.sendMessage(jid, { video: content, caption: text });
        }
    } else {
        await sock.sendMessage(jid, { text });
    }
}

module.exports = { connectToWhatsApp, getSock, getStatus, getGroups, sendMessage };
