// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

// Helper to assign roles securely
function assignRoles(players) {
    if (players.length !== 4) return null;
    
    // Roles: Raja(1000), Mantri(500), Chor(0), Sipahi(250)
    const roles = [
      { name: 'Raja', point: 1000 }, 
      { name: 'Mantri', point: 500 }, 
      { name: 'Chor', point: 0 }, 
      { name: 'Sipahi', point: 250 }
    ];
    
    // Secure shuffling and assignment
    let shuffledRoles = [...roles].sort(() => Math.random() - 0.5); 
    
    return players.map((p, i) => ({ 
        id: p.id,
        name: p.name,
        role: shuffledRoles[i].name, 
        rolePoints: shuffledRoles[i].point, 
        isChor: shuffledRoles[i].name === 'Chor'
    }));
}

// Helper to calculate score updates securely
function calculateRoundPoints(playerRoles, isCorrectGuess) {
    let points = {};
    const raja = playerRoles.find(p => p.role === 'Raja');
    const mantri = playerRoles.find(p => p.role === 'Mantri');
    const chor = playerRoles.find(p => p.role === 'Chor');
    const sipahi = playerRoles.find(p => p.role === 'Sipahi');

    if (isCorrectGuess) {
        // Raja, Mantri, Sipahi win
        points[raja.id] = 1000;
        points[mantri.id] = 1000;
        points[sipahi.id] = 1000;
        points[chor.id] = 0;
    } else {
        // Chor wins
        points[raja.id] = 0;
        points[mantri.id] = 0;
        points[sipahi.id] = 0;
        points[chor.id] = 1000;
    }
    return points;
}

/**
 * Callable function to start a new RMCS round.
 * Handles role assignment and state transition securely.
 */
exports.startGame = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userId = context.auth.uid;
    const { roomId } = data;
    
    const roomRef = db.collection('rmcs_rooms').doc(roomId);
    const doc = await roomRef.get();
    
    if (!doc.exists) {
        throw new new functions.https.HttpsError('not-found', 'Room not found.');
    }
    
    const roomData = doc.data();
    
    // 2. Authorization Check (Host only)
    if (roomData.host !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Only the host can start the game.');
    }
    
    const players = roomData.players || [];
    
    // 3. Logic Validation
    if (players.length !== 4) {
        throw new functions.https.HttpsError('failed-precondition', 'Exactly 4 players are required to start the game.');
    }
    
    // 4. Secure State Transition and Role Assignment
    const playerRoles = assignRoles(players);

    await roomRef.update({
        phase: 'reveal',
        playerRoles: playerRoles,
        revealed: [],
        guess: null,
        scoreUpdated: false
    });

    return { success: true };
});

/**
 * Callable function for the Sipahi to make a guess.
 * Calculates the result and score update securely.
 */
exports.makeGuess = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const userId = context.auth.uid;
    const { roomId, guessedId } = data; // guessedId is the ID of the player the Sipahi is guessing (or null for timeout)
    
    const roomRef = db.collection('rmcs_rooms').doc(roomId);
    const doc = await roomRef.get();
    
    if (!doc.exists) {
        throw new functions.https.HttpsError('not-found', 'Room not found.');
    }
    
    const roomData = doc.data();
    
    // 2. Game State Validation
    if (roomData.phase !== 'guess') {
        throw new functions.https.HttpsError('failed-precondition', 'Cannot guess outside the guess phase.');
    }
    
    const sipahi = roomData.playerRoles.find(p => p.role === 'Sipahi');
    
    // 3. Authorization Check (Only the Sipahi can guess)
    if (!sipahi || sipahi.id !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Only the Sipahi can make a guess.');
    }
    
    let guessedPlayer = null;
    let isCorrect = false;
    let guessedName = 'No Guess';

    if (guessedId) {
        guessedPlayer = roomData.playerRoles.find(p => p.id === guessedId);
        if (!guessedPlayer) {
             throw new functions.https.HttpsError('not-found', 'Guessed player not found.');
        }
        isCorrect = guessedPlayer.role === 'Chor';
        guessedName = guessedPlayer.name;
    } 
    // If guessedId is null (timeout), isCorrect remains false.

    // 4. Secure Result Calculation & Score Update
    let newScores = roomData.scores || {};
    
    if (!roomData.scoreUpdated) {
        const pointsEarned = calculateRoundPoints(roomData.playerRoles, isCorrect);
        
        // Accumulate points
        roomData.playerRoles.forEach(p => {
            newScores[p.id] = (newScores[p.id] || 0) + (pointsEarned[p.id] || 0);
        });
    }

    // 5. State Transition
    await roomRef.update({
        phase: 'roundResult',
        guess: { 
            sipahiId: userId, 
            sipahiName: sipahi.name, 
            guessedId: guessedId, 
            guessedName: guessedName, 
            correct: isCorrect 
        },
        scores: newScores, // Update scores securely
        scoreUpdated: true // Flag to prevent re-calculation
    });

    return { success: true };
});
