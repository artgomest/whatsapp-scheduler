const { db } = require('./firebase');
const { proto, initAuthCreds } = require('@whiskeysockets/baileys');

const COLLECTION = 'whatsapp_auth';

// Ferramenta própria para converter dados do WhatsApp (substitui o BufferJSON)
const waReplacer = (key, value) => {
    if (value && value.type === 'Buffer') {
        return { type: 'Buffer', data: Buffer.from(value.data).toString('base64') };
    }
    if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
        return { type: 'Buffer', data: Buffer.from(value).toString('base64') };
    }
    return value;
};

const waReviver = (key, value) => {
    if (value && value.type === 'Buffer' && typeof value.data === 'string') {
        return Buffer.from(value.data, 'base64');
    }
    return value;
};

const cleanForFirestore = (obj) => {
    return JSON.parse(JSON.stringify(obj, waReplacer));
};

const useFirebaseAuthState = async (sessionId) => {
    const writeData = async (data, id) => {
        try {
            if (!db) return;
            const safeId = id.replace(/\//g, '_');
            const cleanData = cleanForFirestore(data);
            await db.collection(COLLECTION).doc(`${sessionId}_${safeId}`).set(cleanData);
        } catch (e) {
            console.error(`❌ Erro ao salvar ${id} no Firebase:`, e.message);
        }
    };

    const readData = async (id) => {
        try {
            if (!db) return null;
            const safeId = id.replace(/\//g, '_');
            const doc = await db.collection(COLLECTION).doc(`${sessionId}_${safeId}`).get();
            if (doc.exists) {
                return JSON.parse(JSON.stringify(doc.data()), waReviver);
            }
        } catch (e) {
            console.error(`❌ Erro ao ler ${id} do Firebase:`, e.message);
        }
        return null;
    };

    const removeData = async (id) => {
        try {
            if (!db) return;
            const safeId = id.replace(/\//g, '_');
            await db.collection(COLLECTION).doc(`${sessionId}_${safeId}`).delete();
        } catch (e) {
            console.error(`❌ Erro ao remover ${id} do Firebase:`, e.message);
        }
    };

    const creds = await readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const fileId = `${category}-${id}`;
                            tasks.push(value ? writeData(value, fileId) : removeData(fileId));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};

module.exports = { useFirebaseAuthState };
