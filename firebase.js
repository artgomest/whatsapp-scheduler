const admin = require('firebase-admin');

let serviceAccount;

try {
    // Diagnóstico
    console.log('🔍 Verificando variáveis de ambiente...');
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        console.log('✅ Variável FIREBASE_SERVICE_ACCOUNT encontrada! Tamanho:', process.env.FIREBASE_SERVICE_ACCOUNT.length);
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
        console.warn('⚠️ Variável FIREBASE_SERVICE_ACCOUNT não encontrada no process.env');
        serviceAccount = require('./firebase-service-account.json');
    }

    if (!admin.apps.length && serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        admin.firestore().settings({ ignoreUndefinedProperties: true }); // Proteção contra undefined
        console.log('✅ Firebase inicializado com sucesso!');
    } else if (!serviceAccount) {
        throw new Error('Chave do Firebase não encontrada. Configure a variável FIREBASE_SERVICE_ACCOUNT no Render.');
    }
} catch (error) {
    console.error('❌ ERRO CRÍTICO FIREBASE:', error.message);
}

module.exports = { 
    admin, 
    get db() { 
        return admin.apps.length ? admin.firestore() : null; 
    } 
};
