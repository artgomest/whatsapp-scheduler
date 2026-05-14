const { db } = require('./firebase');
const { proto } = require('@whiskeysockets/baileys');
const { Curve, signedKeyValue } = require('@whiskeysockets/baileys/lib/Utils/crypto');
const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys/lib/Utils/auth-utils');

const COLLECTION = 'whatsapp_auth';

const useFirebaseAuthState = async (sessionId) => {
    const writeData = async (data, id) => {
        try {
            const cleanData = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
            await db.collection(COLLECTION).doc(`${sessionId}_${id}`).set(cleanData);
        } catch (e) {
            console.error('Erro ao salvar no Firebase:', e);
        }
    };

    const readData = async (id) => {
        try {
            const doc = await db.collection(COLLECTION).doc(`${sessionId}_${id}`).get();
            if (doc.exists) {
                return JSON.parse(JSON.stringify(doc.data()), BufferJSON.reviver);
            }
        } catch (e) {
            console.error('Erro ao ler do Firebase:', e);
        }
        return null;
    };

    const removeData = async (id) => {
        try {
            await db.collection(COLLECTION).doc(`${sessionId}_${id}`).delete();
        } catch (e) {
            console.error('Erro ao remover do Firebase:', e);
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
