const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// --- Helper: Assign Roles ---
function assignRoles(players) {
  if (players.length !== 4) return null;
  const roleNames = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
  // Shuffle
  const shuffled = [...roleNames].sort(() => Math.random() - 0.5);
  
  return players.map((p, i) => ({
    id: p.id,
    name: p.name,
    role: shuffled[i]
  }));
}

// --- Helper: Calculate Points for This Round ---
function getRoundPoints(playerRoles, isCorrect) {
  // Standard Points: Raja=1000, Mantri=500, Sipahi=250/0, Chor=0/250
  const points = {};
  playerRoles.forEach(p => {
    if (p.role === 'Raja') points[p.id] = 1000;
    else if (p.role === 'Mantri') points[p.id] = 500;
    else if (p.role === 'Sipahi') points[p.id] = isCorrect ? 250 : 0;
    else if (p.role === 'Chor') points[p.id] = isCorrect ? 0 : 250;
  });
  return points;
}

// --- 1. Start/Next Round ---
exports.startGame = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  const { roomId } = data;
  const roomRef = db.collection('rmcs_rooms').doc(roomId);
  const doc = await roomRef.get();

  if (!doc.exists) throw new functions.https.HttpsError('not-found', 'Room not found');
  const roomData = doc.data();

  // Authorization: Host only
  if (roomData.host !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Host only');
  }

  // Assign Roles
  const roles = assignRoles(roomData.players);
  
  // Reset/Init Round State
  await roomRef.update({
    phase: 'reveal',
    playerRoles: roles,
    revealed: [],
    guess: null,
    scoreUpdated: false
  });

  return { success: true };
});

// --- 2. Update Scores (Called at end of round) ---
exports.updateScores = functions.https.onCall(async (data, context) => {
  const { roomId, isCorrect } = data;
  const roomRef = db.collection('rmcs_rooms').doc(roomId);
  
  // Run inside transaction to ensure atomic updates (history + score)
  await db.runTransaction(async (t) => {
    const doc = await t.get(roomRef);
    if (!doc.exists) return;
    const d = doc.data();

    if (d.scoreUpdated) return; // Already updated

    const roundPoints = getRoundPoints(d.playerRoles, isCorrect);
    const historyEntry = {
      timestamp: admin.firestore.Timestamp.now(),
      roles: d.playerRoles,
      points: roundPoints,
      result: isCorrect ? 'Chor Caught' : 'Chor Escaped'
    };

    // Prepare updates
    // 1. Add to History Array
    const newHistory = [...(d.history || []), historyEntry];
    
    // 2. Increment Scores
    const newTotalScores = { ...d.scores };
    for (const [pid, pts] of Object.entries(roundPoints)) {
      newTotalScores[pid] = (newTotalScores[pid] || 0) + pts;
    }

    t.update(roomRef, {
      scores: newTotalScores,
      history: newHistory,
      scoreUpdated: true,
      phase: 'roundResult' // Ensure we stay in result phase
    });
  });

  return { success: true };
});

// --- 3. Reset Game (Optional, if you want a "Full Reset" button) ---
exports.resetGame = functions.https.onCall(async (data, context) => {
  const { roomId } = data;
  await db.collection('rmcs_rooms').doc(roomId).update({
    phase: 'lobby',
    scores: {},     // Reset scores
    history: [],    // Clear history
    playerRoles: [],
    guess: null
  });
});
