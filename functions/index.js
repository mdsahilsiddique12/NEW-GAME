const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// --- Helper: Assign Roles ---
function assignRoles(players) {
  if (players.length !== 4) return null;
  const roleNames = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
  const shuffled = [...roleNames].sort(() => Math.random() - 0.5);
  
  return players.map((p, i) => ({
    id: p.id,
    name: p.name,
    role: shuffled[i]
  }));
}

// --- Helper: Calculate Points ---
function getRoundPoints(playerRoles, isCorrect) {
  const points = {};
  playerRoles.forEach(p => {
    if (p.role === 'Raja') points[p.id] = 1000;
    else if (p.role === 'Mantri') points[p.id] = 500;
    else if (p.role === 'Sipahi') points[p.id] = isCorrect ? 250 : 0;
    else if (p.role === 'Chor') points[p.id] = isCorrect ? 0 : 250;
  });
  return points;
}

// --- 1. Start Game / Next Round ---
exports.startGame = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const { roomId } = data;
  // VALIDATION: Ensure roomId exists
  if (!roomId) {
    throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a valid roomId.');
  }

  const roomRef = db.collection('rmcs_rooms').doc(roomId);
  const doc = await roomRef.get();

  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Room not found.');
  }
  
  const roomData = doc.data();

  // Authorization: Host only
  if (roomData.host !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only the host can start the game.');
  }

  const roles = assignRoles(roomData.players);
  
  await roomRef.update({
    phase: 'reveal',
    playerRoles: roles,
    revealed: [],
    guess: null,
    scoreUpdated: false
  });

  return { success: true };
});

// --- 2. Update Scores ---
exports.updateScores = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required.');
  }

  const { roomId, isCorrect } = data;
  if (!roomId) {
    throw new functions.https.HttpsError('invalid-argument', 'RoomId required.');
  }

  const roomRef = db.collection('rmcs_rooms').doc(roomId);
  
  await db.runTransaction(async (t) => {
    const doc = await t.get(roomRef);
    if (!doc.exists) return;
    const d = doc.data();

    if (d.scoreUpdated) return; 

    const roundPoints = getRoundPoints(d.playerRoles, isCorrect);
    
    const historyEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      roles: d.playerRoles,
      points: roundPoints,
      result: isCorrect ? 'Chor Caught' : 'Chor Escaped'
    };

    const newHistory = [...(d.history || []), historyEntry];
    
    const newTotalScores = { ...d.scores };
    for (const [pid, pts] of Object.entries(roundPoints)) {
      newTotalScores[pid] = (newTotalScores[pid] || 0) + pts;
    }

    t.update(roomRef, {
      scores: newTotalScores,
      history: newHistory,
      scoreUpdated: true,
      phase: 'roundResult'
    });
  });

  return { success: true };
});
