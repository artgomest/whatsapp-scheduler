const admin = require('firebase-admin');

let serviceAccount;

try {
    // Tenta carregar do ambiente (Render) ou de um arquivo local
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require('./firebase-service-account.json');
    }

    if (!admin.apps.length && serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase inicializado com sucesso!');
    } else if (!serviceAccount) {
        throw new Error('Chave do Firebase não encontrada. Configure a variável FIREBASE_SERVICE_ACCOUNT no Render.');
    }
} catch (error) {
    console.error('❌ ERRO CRÍTICO FIREBASE:', error.message);
}

const db = admin.apps.length ? admin.firestore() : null;
module.exports = { admin, db };
