const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://familia-faria-125d8-default-rtdb.europe-west1.firebasedatabase.app'
  });
}

const ICONS = {
  medico: '🏥', escola: '🏫', desporto: '⚽', aniversario: '🎂',
  viagem: '✈️', trabalho: '💼', social: '🍽️', outro: '📋'
};

const MEMBERS = {
  claudio: 'Cláudio', odete: 'Odete', clara: 'Clara', leonor: 'Leonor'
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method not allowed' };

  try {
    const { title, date, time, type, members } = JSON.parse(event.body);

    // Read all FCM tokens from database
    const db = admin.database();
    const snapshot = await db.ref('fcm_tokens').once('value');
    const tokensObj = snapshot.val();

    if (!tokensObj) {
      return { statusCode: 200, body: 'No tokens registered' };
    }

    const tokens = Object.values(tokensObj);
    const icon = ICONS[type] || '📋';
    const memberNames = (members || []).map(m => MEMBERS[m] || m).join(', ');
    const timeStr = time ? ` às ${time}` : '';

    const message = {
      notification: {
        title: `${icon} ${title}`,
        body: `${date}${timeStr} · ${memberNames}`
      },
      webpush: {
        notification: {
          icon: 'https://famous-squirrel-511030.netlify.app/icon-192.png',
          badge: 'https://famous-squirrel-511030.netlify.app/icon-192.png',
          vibrate: [200, 100, 200],
          tag: 'familia-evento',
          renotify: true
        },
        fcmOptions: {
          link: 'https://essenciaimoveis25-svg.github.io/familia-faria/'
        }
      },
      tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Remove invalid tokens
    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered') {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    for (const token of invalidTokens) {
      const key = Object.keys(tokensObj).find(k => tokensObj[k] === token);
      if (key) await db.ref(`fcm_tokens/${key}`).remove();
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ sent: response.successCount, failed: response.failureCount })
    };

  } catch (err) {
    console.error('Notify error:', err);
    return { statusCode: 500, headers: CORS, body: err.message };
  }
};
