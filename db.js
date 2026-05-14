const { db } = require('./firebase');

async function init() {
    console.log('✅ Banco de Dados Firestore Inicializado');
}

async function run(query, params = []) {
    const q = query.toUpperCase();
    
    if (q.includes('INSERT INTO SCHEDULES')) {
        const [group_jid, message, file_path, file_type, scheduled_time] = params;
        const docRef = await db.collection('schedules').add({
            group_jid,
            message,
            file_path,
            file_type,
            scheduled_time,
            status: 'pending',
            created_at: new Date().toISOString()
        });
        return { lastID: docRef.id };
    }
    
    if (q.includes('UPDATE SCHEDULES SET STATUS')) {
        // Formato: UPDATE schedules SET status = ?, error_message = ? WHERE id = ?
        // Ou: UPDATE schedules SET status = ? WHERE id = ?
        let status, id, error_message = null;
        if (params.length === 3) {
            [status, error_message, id] = params;
        } else {
            [status, id] = params;
        }
        
        const updateData = { status };
        if (error_message) updateData.error_message = error_message;
        
        await db.collection('schedules').doc(id).update(updateData);
        return { changes: 1 };
    }

    if (q.includes('DELETE FROM SCHEDULES WHERE ID')) {
        const [id] = params;
        await db.collection('schedules').doc(id).delete();
        return { changes: 1 };
    }
}

async function all(query, params = []) {
    const q = query.toUpperCase();

    if (q.includes('SELECT * FROM SCHEDULES ORDER BY SCHEDULED_TIME')) {
        const snapshot = await db.collection('schedules').orderBy('scheduled_time', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    if (q.includes('SELECT * FROM SCHEDULES WHERE STATUS = \'PENDING\'')) {
        const [maxTime] = params;
        let queryRef = db.collection('schedules').where('status', '==', 'pending');
        
        const snapshot = await queryRef.get();
        let results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Filtro de tempo (Firestore não lida bem com range em campos diferentes sem index, então filtramos no JS)
        if (maxTime) {
            results = results.filter(r => r.scheduled_time <= maxTime);
        }
        return results;
    }
    
    return [];
}

async function get(query, params = []) {
    if (query.toUpperCase().includes('SELECT * FROM SCHEDULES WHERE ID = ?')) {
        const [id] = params;
        const doc = await db.collection('schedules').doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }
    return null;
}

module.exports = { init, run, all, get };
