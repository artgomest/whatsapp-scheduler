const { db } = require('./firebase');
const { proto } = require('@whiskeysockets/baileys');
const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys/lib/Utils/auth-utils');

const COLLECTION = 'whatsapp_auth';

// Função para limpar objetos para o Firestore (remove undefined e converte buffers)
const cleanForFirestore = (obj) => {
    return JSON.parse(JSON.stringify(obj, BufferJSON.replacer));
};

const useFirebaseAuthState = async (sessionId) => {
    const writeData = async (data, id) => {
        try {
            if (!db) return;
            const safeId = id.replace(/\//g, '_'); // Remove barras
            const cleanData = cleanForFirestore(data);
            await db.collection(COLLECTION).doc(`${sessionId}_${safeId}`).set(cleanData);
        } catch (e) {
            console.error(`❌ Erro ao salvar ${id} no Firebase:`, e.message);
        }
    };

    const readData = async (id) => {
        try {
            if (!db) return null;
            const safeId = id.replace(/\//g, '_'); // Remove barras
            const doc = await db.collection(COLLECTION).doc(`${sessionId}_${safeId}`).get();
            if (doc.exists) {
                return JSON.parse(JSON.stringify(doc.data()), BufferJSON.reviver);
            }
        } catch (e) {
            console.error(`❌ Erro ao ler ${id} do Firebase:`, e.message);
        }
        return null;
    };

    const removeData = async (id) => {
        try {
            if (!db) return;
            const safeId = id.replace(/\//g, '_'); // Remove barras
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
