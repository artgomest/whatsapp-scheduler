const admin = require('firebase-admin');

let serviceAccount;

try {
    // Tenta carregar do ambiente (Render) ou de um arquivo local
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        serviceAccount = require('./firebase-service-account.json');
    }

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
} catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error.message);
}

const db = admin.firestore();
module.exports = { admin, db };
