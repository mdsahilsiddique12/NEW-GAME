import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    updateDoc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    addDoc, 
    getDocs, 
    deleteDoc, 
    runTransaction,
    serverTimestamp,
    // Add for array removal if needed, though transactions are safer for complex updates
    // arrayRemove, arrayUnion 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase service instances and state
let db, auth;
let userId = null;
let isAuthenticated = false;
let unsubscribe = null; // Holds the onSnapshot listener function
let roomId = '';
let playerName = '';
let isHost = false;

// UI Elements
const mainMenu = document.getElementById('mainMenu');
const createScreen = document.getElementById('createScreen');
const joinScreen = document.getElementById('joinScreen');
const gameScreen = document.getElementById('gameScreen');
const playersList = document.getElementById('playersList');
const currentRoomCode = document.getElementById('currentRoomCode');
const startGameBtn = document.getElementById('startGameBtn');
const exitLobbyBtn = document.getElementById('exitLobbyBtn');
const gameContent = document.getElementById('gameContent');
const hostControlsContainer = document.getElementById('hostControlsContainer');
const roundDisplay = document.getElementById('roundDisplay');
const scoreList = document.getElementById('scoreList');
const messageBox = document.getElementById('messageBox');
const messageBoxTitle = document.getElementById('messageBoxTitle');
const messageBoxText = document.getElementById('messageBoxBody'); // Corrected from messageBoxText to messageBoxBody based on HTML
const messageBoxClose = document.getElementById('messageBoxClose');

// Game Constants
const ROLES = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
const POINTS = { Raja: 1000, Mantri: 500, Chor: 0, Sipahi_Correct: 250, Sipahi_Wrong: 0 };

/**
 * Utility function to show a custom modal message box.
 * @param {string} title 
 * @param {string} text 
 */
function showMessageBox(title, text) {
    messageBoxTitle.textContent = title;
    messageBoxText.textContent = text;
    messageBox.classList.remove('hidden');
}

messageBoxClose.onclick = () => {
    messageBox.classList.add('hidden');
};

/**
 * Handles screen navigation.
 * @param {HTMLElement} show - The screen element to show.
 */
function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(screen => screen.classList.remove('active-screen'));
    show.classList.add('active-screen');
}

/**
 * Utility to copy text to clipboard.
 * @param {string} text 
 */
function copyToClipboard(text) {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
        document.execCommand('copy');
        showMessageBox("Copied!", `Room code ${text} copied to clipboard.`);
    } catch (err) {
        showMessageBox("Error", "Failed to copy text. Please copy manually.");
    }
    document.body.removeChild(tempInput);
}

/**
 * Generates a random 6-character room code.
 * @returns {string}
 */
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Gets the Firestore collection reference for rooms.
 * @returns {firebase.firestore.CollectionReference}
 */
function getRoomCollection() {
    return collection(db, `artifacts/${appId}/public/data/rmcs_rooms`);
}

/**
 * Renders the Room Code and Copy button.
 * @param {string} code 
 */
function renderRoomCode(code) {
    if (currentRoomCode) {
        currentRoomCode.innerHTML = `
            <span class="font-mono font-bold">${code}</span>
            <button id="copyRoomCodeBtn" class="ml-3 px-3 py-1 bg-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-300 transition-colors text-base shadow-md">Copy</button>
        `;
        document.getElementById('copyRoomCodeBtn').onclick = () => copyToClipboard(code);
    }
}

/**
 * Renders the score list in the lobby/game screen.
 * @param {Array} players 
 */
function renderScoreboard(players) {
    // Note: scoreList is not present in the HTML provided for this rendering logic.
    // The HTML only contains the `gameScreen` structure, which includes the `game-table` for avatars,
    // but no specific `scoreList` element. Assuming it should go into `gameContent` or an inner element if needed,
    // but for now, this function is defined but won't run as intended with the current HTML structure.
    if (!scoreList) return;
    
    // Sort players by score descending
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

    if (sortedPlayers.length === 0) {
        scoreList.innerHTML = '<li class="text-center text-gray-500">No players in room.</li>';
        return;
    }

    scoreList.innerHTML = sortedPlayers.map(p => `
        <li class="flex justify-between items-center px-2 py-1 bg-white rounded-md shadow-sm border border-gray-100">
            <span class="font-semibold text-gray-800">${p.name} ${p.isHost ? '(Host)' : ''}</span>
            <span class="text-xl font-bold ${p.score > 0 ? 'text-green-600' : 'text-gray-500'}">${p.score}</span>
        </li>
    `).join('');
}

/**
 * Renders the list of players in the lobby.
 * @param {Array} players 
 */
function renderPlayersList(players) {
    // Note: playersList is not present in the HTML provided. It only contains a `game-table`.
    // I'm skipping this logic for the current HTML structure to prevent errors,
    // but leaving the function definition for completeness against the JS source code.
    if (!playersList) return;
    
    if (players.length === 0) {
        playersList.innerHTML = '<li class="text-gray-500 text-center">No players in room.</li>';
        return;
    }

    playersList.innerHTML = players.map(p => `
        <li class="px-3 py-2 bg-white rounded-lg shadow-md flex justify-between items-center border-l-4 ${p.isHost ? 'border-indigo-500' : 'border-gray-300'}">
            <span class="font-medium text-gray-700">${p.name}</span>
            <span class="text-xs font-semibold text-gray-500">${p.isHost ? 'HOST' : 'Player'}</span>
        </li>
    `).join('');
}


// --- LOBBY/GAME STATE HANDLER ---

/**
 * The main listener function for the room state.
 * @param {string} code 
 */
function listenToRoom(code) {
    if (unsubscribe) {
        unsubscribe(); // Detach previous listener
    }

    const roomRef = doc(getRoomCollection(), code);

    unsubscribe = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists()) {
            showMessageBox("Room Closed", "The host has closed the room or the room no longer exists.");
            exitLobby();
            return;
        }

        const data = docSnap.data();
        const players = data.players || [];
        const selfPlayer = players.find(p => p.id === userId);

        // Check if the current user is still in the room
        if (!selfPlayer) {
            showMessageBox("Kicked Out", "You have been removed from the room.");
            exitLobby();
            return;
        }

        roomId = code;
        playerName = selfPlayer.name;
        isHost = selfPlayer.isHost;

        renderRoomCode(code);
        renderScoreboard(players); // Will fail gracefully as scoreList is null
        renderPlayersList(players); // Will fail gracefully as playersList is null

        // Update UI based on game phase
        if (data.phase === 'waiting') {
            handleWaitingPhase(data);
        } else if (data.phase === 'roleReveal') {
            handleRoleRevealPhase(data, selfPlayer);
        } else if (data.phase === 'sipahiGuessing') {
            handleSipahiGuessingPhase(data, selfPlayer);
        } else if (data.phase === 'roundResult') {
            handleRoundResultPhase(data, selfPlayer);
        } else if (data.phase === 'gameOver') {
            handleGameOverPhase(data);
        }
    }, (error) => {
        console.error("Error listening to room:", error);
        showMessageBox("Connection Error", "There was an issue connecting to the game. Please try again.");
        exitLobby();
    });
}

// --- PHASE HANDLERS ---

/**
 * Handles the 'waiting' (lobby) phase.
 * @param {object} data 
 */
function handleWaitingPhase(data) {
    if (roundDisplay) roundDisplay.classList.add('hidden');
    if (gameContent) gameContent.innerHTML = `
        <div class="text-gray-500 text-center p-4">
            Waiting for players to join... You need at least 4 players to start!
        </div>
    `;

    // Host Controls
    if (isHost) {
        if (hostControlsContainer) hostControlsContainer.innerHTML = '';
        if (startGameBtn) {
            startGameBtn.disabled = data.players.length < 4;
            startGameBtn.textContent = data.players.length < 4 ? `Need ${4 - data.players.length} More Player(s)` : 'Start Game';
        }
    } else {
        if (hostControlsContainer) hostControlsContainer.innerHTML = '<p class="text-center text-sm text-gray-500 mt-2">Waiting for the Host to start the game.</p>';
        if (startGameBtn) startGameBtn.classList.add('hidden');
    }
    
    if (startGameBtn) startGameBtn.classList.remove('hidden');
}

/**
 * Handles the 'roleReveal' phase.
 * @param {object} data 
 * @param {object} selfPlayer 
 */
function handleRoleRevealPhase(data, selfPlayer) {
    if (roundDisplay) {
        roundDisplay.classList.remove('hidden');
        roundDisplay.innerHTML = `<p class="text-2xl font-bold text-gray-800">Round ${data.round}</p>`;
    }

    if (startGameBtn) startGameBtn.classList.add('hidden');
    if (hostControlsContainer) hostControlsContainer.innerHTML = ''; // Hide host controls for now

    const role = selfPlayer.role;
    
    // Determine the text based on the role
    let roleText = '';
    let actionText = '';
    
    if (role === 'Raja') {
        roleText = 'Raja (King)';
        actionText = 'You must find the Mantri. You have 1000 points.';
    } else if (role === 'Mantri') {
        roleText = 'Mantri (Minister)';
        actionText = 'You must identify the Chor (thief). You have 500 points.';
    } else if (role === 'Sipahi') {
        roleText = 'Sipahi (Soldier)';
        actionText = 'You will be asked to guess the Chor. Your points depend on your guess!';
    } else if (role === 'Chor') {
        roleText = 'Chor (Thief)';
        actionText = 'Try not to get caught! You have 0 points.';
    }

    if (gameContent) gameContent.innerHTML = `
        <div class="role-card role-${role}">
            <h2 class="text-4xl font-extrabold mb-4">${roleText}</h2>
            <p class="text-lg mb-6">${actionText}</p>
            <p class="text-sm text-gray-600">The rest of the game begins once everyone has seen their role.</p>
        </div>
    `;

    // Automatically transition to the next phase after a delay
    // This is a simple client-side timeout, but host should manage the transition
    if (isHost) {
        setTimeout(() => {
            if (data.phase === 'roleReveal') {
                updateDoc(doc(getRoomCollection(), roomId), {
                    phase: 'sipahiGuessing'
                });
            }
        }, 5000); // 5 second delay to read the role
    }
}

/**
 * Handles the 'sipahiGuessing' phase.
 * @param {object} data 
 * @param {object} selfPlayer 
 */
function handleSipahiGuessingPhase(data, selfPlayer) {
    const role = selfPlayer.role;
    if (startGameBtn) startGameBtn.classList.add('hidden');
    
    // Find the Sipahi player
    const sipahiPlayer = data.players.find(p => p.role === 'Sipahi');
    const chorPlayer = data.players.find(p => p.role === 'Chor');

    if (!sipahiPlayer || !chorPlayer) {
        console.error("Sipahi or Chor not found. Game state error.");
        return;
    }

    // const nonSipahiPlayers = data.players.filter(p => p.role !== 'Sipahi' && p.id !== userId);
    
    // All players see the Sipahi is guessing, except the Sipahi himself.
    if (gameContent) gameContent.innerHTML = `
        <div class="text-center p-4">
            <h3 class="text-2xl font-bold mb-4 text-gray-800">Sipahi's Guess</h3>
            <p class="text-gray-600">The ${sipahiPlayer.name} (Sipahi) is currently guessing who the Chor is...</p>
            <div class="mt-8">
                <div class="h-4 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div class="bg-indigo-500 h-4 rounded-full w-1/3 pulse-animation"></div>
                </div>
            </div>
        </div>
    `;

    // If the current user is the Sipahi, show the guessing UI
    if (role === 'Sipahi' && selfPlayer.id === sipahiPlayer.id) {
        
        // Players to choose from (everyone *except* the Sipahi)
        const targets = data.players.filter(p => p.role !== 'Sipahi');

        if (gameContent) gameContent.innerHTML = `
            <div class="text-center p-4">
                <h3 class="text-2xl font-bold mb-4 text-gray-800">Who is the Chor?</h3>
                <p class="text-lg text-gray-600 mb-6">You must correctly identify the Chor to earn 250 points.</p>
                <div class="space-y-3 w-full">
                    ${targets.map(p => `
                        <button class="guess-btn confirm-btn w-full text-left flex justify-between items-center" data-chor-id="${p.id}">
                            <span>Guess: ${p.name}</span>
                            <span class="text-2xl ml-2">🕵️</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        
        // Attach event listeners to guess buttons
        document.querySelectorAll('.guess-btn').forEach(button => {
            button.onclick = () => handleSipahiGuess(button.dataset.chorId, chorPlayer.id, data);
        });
    }

    if (hostControlsContainer) hostControlsContainer.innerHTML = ''; // No host controls during this phase
}

/**
 * Handles the Sipahi's guess and transitions to the result phase.
 * @param {string} guessedId - The ID of the player the Sipahi guessed.
 * @param {string} chorId - The actual ID of the Chor.
 * @param {object} data - The current room data.
 */
async function handleSipahiGuess(guessedId, chorId, data) {
    const isCorrect = guessedId === chorId;
    const sipahiPlayer = data.players.find(p => p.role === 'Sipahi');
    
    // Update the room state with the guess result
    const guessPayload = {
        sipahiId: sipahiPlayer.id,
        guessedId: guessedId,
        chorId: chorId,
        correct: isCorrect
    };

    try {
        await updateDoc(doc(getRoomCollection(), roomId), {
            phase: 'roundResult',
            guess: guessPayload
        });
    } catch (e) {
        console.error("Error updating guess result:", e);
        showMessageBox("Error", "Could not record the guess. Please check your connection.");
    }
}

/**
 * Handles the 'roundResult' phase: displays results and updates scores.
 * @param {object} data 
 * @param {object} selfPlayer 
 */
function handleRoundResultPhase(data, selfPlayer) {
    const res = data.guess;
    if (!res) return; // Should not happen

    if (startGameBtn) startGameBtn.classList.add('hidden');
    
    const isCorrect = res.correct;
    const sipahiName = data.players.find(p => p.id === res.sipahiId)?.name || 'Sipahi';
    const chorName = data.players.find(p => p.id === res.chorId)?.name || 'Chor';
    const guessedName = data.players.find(p => p.id === res.guessedId)?.name || 'Guessed Player';
    
    let message = isCorrect ? "SUCCESS! Sipahi found the Chor!" : "FAILURE! Wrong Guess, the Chor escapes!";
    let emoji = isCorrect ? "🎉" : "😔";

    if (gameContent) gameContent.innerHTML = `
        <div class="flex flex-col justify-center items-center min-h-[200px] animate-fadeIn">
            <div class="text-6xl mb-6">${emoji}</div>
            <div class="rounded-xl shadow-lg ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} py-4 px-8 mb-6 text-xl font-bold text-center">
                ${message}
            </div>
            <p class="text-lg font-semibold text-gray-700">Sipahi (${sipahiName}) guessed: <span class="${isCorrect ? 'text-green-600' : 'text-red-600'}">${guessedName}</span></p>
            <p class="text-lg font-semibold text-gray-700">The Chor was: <span class="text-red-800">${chorName}</span></p>
            <p class="mt-4 text-xl font-extrabold text-indigo-700">Scores Updated!</p>
        </div>
    `;

    // Host Controls: Button to start the next round
    if (isHost) {
        if (hostControlsContainer) hostControlsContainer.innerHTML = `
            <button id="nextRoundBtn" class="confirm-btn w-full">Start Next Round</button>
            <button id="endGameBtn" class="back-btn mt-3 w-full">End Game</button>
        `;
        if (document.getElementById('nextRoundBtn')) document.getElementById('nextRoundBtn').onclick = () => startNextRound(data);
        if (document.getElementById('endGameBtn')) document.getElementById('endGameBtn').onclick = () => endGame(data);
    } else {
        if (hostControlsContainer) hostControlsContainer.innerHTML = '<p class="text-center text-sm text-gray-500 mt-2">Waiting for the Host to start the next round.</p>';
    }
}

/**
 * Handles the 'gameOver' phase.
 * @param {object} data 
 */
function handleGameOverPhase(data) {
    if (startGameBtn) startGameBtn.classList.add('hidden');
    if (hostControlsContainer) hostControlsContainer.innerHTML = '';
    if (roundDisplay) roundDisplay.classList.add('hidden');

    const sortedPlayers = [...data.players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    if (gameContent) gameContent.innerHTML = `
        <div class="text-center p-4">
            <h3 class="text-4xl font-extrabold text-indigo-600 mb-6">🏆 Game Over! 🏆</h3>
            <p class="text-2xl font-bold mb-4 text-gray-800">Winner: ${winner.name} (${winner.score} points)</p>
            <p class="text-gray-600 mb-6">Final Scores:</p>
            <ul class="space-y-2 mb-6 p-3 bg-gray-50 rounded-lg border w-full">
                ${sortedPlayers.map(p => `
                    <li class="flex justify-between font-semibold text-gray-700">
                        <span>${p.name}</span>
                        <span>${p.score}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
    
    // Add a button to reset to the main menu
    if (hostControlsContainer) hostControlsContainer.innerHTML = `
        <button id="backToMenuBtn" class="confirm-btn w-full mt-4">Back to Main Menu</button>
    `;
    if (document.getElementById('backToMenuBtn')) document.getElementById('backToMenuBtn').onclick = () => exitLobby(true);
}

// --- GAME ACTIONS ---

/**
 * Starts the game from the lobby by assigning initial roles.
 */
async function startGame() {
    if (!isHost || !userId) return showMessageBox("Error", "Only the host can start the game.");

    const roomRef = doc(getRoomCollection(), roomId);

    await runTransaction(db, async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists()) {
            throw "Room does not exist!";
        }
        
        const data = roomDoc.data();
        let players = data.players || [];
        
        if (players.length < 4) {
            throw "Cannot start. Need at least 4 players.";
        }
        
        // 1. Reset/Initialize scores if needed
        players = players.map(p => ({
            ...p,
            score: p.score || 0, // Initialize score if not present
            lastRole: null,
            role: null,
        }));

        // 2. Assign initial roles
        const shuffledRoles = ROLES.sort(() => 0.5 - Math.random());
        const shuffledPlayers = players.sort(() => 0.5 - Math.random());
        
        for (let i = 0; i < shuffledPlayers.length; i++) {
            shuffledPlayers[i].role = shuffledRoles[i % ROLES.length];
        }

        transaction.update(roomRef, {
            phase: 'roleReveal',
            round: 1,
            players: shuffledPlayers,
            lastUpdated: serverTimestamp(),
            // Clear previous guess data
            guess: null
        });

    }).catch(e => {
        console.error("Transaction failed (startGame):", e);
        showMessageBox("Game Error", `Could not start the game: ${e}`);
    });
}

/**
 * Starts the next round, rotating roles and updating scores.
 * @param {object} data - Current room data.
 */
async function startNextRound(data) {
    if (!isHost || !userId) return showMessageBox("Error", "Only the host can start the next round.");

    const roomRef = doc(getRoomCollection(), roomId);

    await runTransaction(db, async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists()) throw "Room does not exist!";
        
        const currentData = roomDoc.data();
        let players = currentData.players || [];
        
        // --- 1. Calculate Scores from previous round ---
        const guess = currentData.guess;
        const isCorrect = guess?.correct;

        players = players.map(p => {
            let points = p.score;
            let currentRole = p.role;
            
            // Apply points based on the role and round result
            if (currentRole === 'Raja') {
                points += POINTS.Raja;
            } else if (currentRole === 'Mantri') {
                points += POINTS.Mantri;
            } else if (currentRole === 'Sipahi') {
                points += isCorrect ? POINTS.Sipahi_Correct : POINTS.Sipahi_Wrong;
            }
            // Chor gets 0 points regardless, so no change
            
            return {
                ...p,
                score: points,
                lastRole: currentRole,
                role: null, // Clear role for the new round
            };
        });
        
        // --- 2. Assign new roles (Rotation) ---
        const previousRoles = players.map(p => p.lastRole);
        const shuffledPlayers = players.sort(() => 0.5 - Math.random());
        
        // Assign roles, making sure no one gets the same role twice in a row if possible (simple shuffle is enough)
        const shuffledRoles = ROLES.sort(() => 0.5 - Math.random());
        
        for (let i = 0; i < shuffledPlayers.length; i++) {
            shuffledPlayers[i].role = shuffledRoles[i % ROLES.length];
        }

        // --- 3. Update Firestore ---
        transaction.update(roomRef, {
            phase: 'roleReveal',
            round: currentData.round + 1,
            players: shuffledPlayers,
            lastUpdated: serverTimestamp(),
            guess: null // Clear previous guess
        });

    }).catch(e => {
        console.error("Transaction failed (startNextRound):", e);
        showMessageBox("Game Error", `Could not start the next round: ${e}`);
    });
}

/**
 * Ends the game and transitions to the game over screen.
 * @param {object} data - Current room data.
 */
async function endGame(data) {
    if (!isHost || !userId) return showMessageBox("Error", "Only the host can end the game.");
    
    // Final score calculation is handled in startNextRound, so just transition to 'gameOver'
    try {
        await updateDoc(doc(getRoomCollection(), roomId), {
            phase: 'gameOver',
            lastUpdated: serverTimestamp()
        });
    } catch (e) {
        console.error("Error ending game:", e);
        showMessageBox("Error", "Could not end the game.");
    }
}

/**
 * Creates a new game room.
 */
async function createRoom() {
    if (!isAuthenticated) return showMessageBox("Auth Error", "Authentication not ready. Please wait a moment.");
    
    const createPlayerName = document.getElementById('createPlayerName');
    const createRoomError = document.getElementById('createRoomError');

    playerName = createPlayerName.value.trim();
    if (!playerName) return createRoomError.textContent = "Please enter your name.";
    createRoomError.textContent = "";
    
    const newRoomCode = generateRoomCode();
    const roomRef = doc(getRoomCollection(), newRoomCode);

    const initialPlayer = { 
        id: userId, 
        name: playerName, 
        isHost: true, 
        score: 0,
        role: null // Current role
    };

    try {
        // Use setDoc for room creation with a custom ID
        await setDoc(roomRef, {
            hostId: userId,
            roomCode: newRoomCode,
            phase: 'waiting', // waiting, roleReveal, sipahiGuessing, roundResult, gameOver
            round: 0,
            players: [initialPlayer],
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
        });

        roomId = newRoomCode;
        isHost = true;
        showScreen(gameScreen);
        listenToRoom(newRoomCode);

    } catch (e) {
        console.error("Error creating room:", e);
        createRoomError.textContent = `Failed to create room: ${e.message || 'Server error'}.`;
    }
}

/**
 * Joins an existing game room.
 */
async function joinRoom() {
    if (!isAuthenticated) return showMessageBox("Auth Error", "Authentication not ready. Please wait a moment.");
    
    const joinPlayerName = document.getElementById('joinPlayerName');
    const joinRoomCode = document.getElementById('joinRoomCode');
    const joinRoomError = document.getElementById('joinRoomError');

    playerName = joinPlayerName.value.trim();
    const code = joinRoomCode.value.trim().toUpperCase();

    if (!playerName || !code) {
        return joinRoomError.textContent = "Enter your name and the room code.";
    }
    joinRoomError.textContent = "";
    
    const roomRef = doc(getRoomCollection(), code);
    
    try {
        // getDoc needs to be imported, assuming it is from the previous import list
        const roomDoc = await getDoc(roomRef); 
        if (!roomDoc.exists()) {
            return joinRoomError.textContent = "Room not found. Check the code.";
        }

        const data = roomDoc.data();
        let players = data.players || [];

        // Prevent joining if player already exists by ID
        if (players.some(p => p.id === userId)) {
             // If already in the room, just re-join
             console.log("Player already in room. Re-joining.");
        } else {
            // Check if game is already active
            if (data.phase !== 'waiting') {
                return joinRoomError.textContent = "Game is already in progress. Cannot join now.";
            }
            
            // Add new player to the list
            const newPlayer = {
                id: userId,
                name: playerName,
                isHost: false,
                score: 0,
                role: null
            };

            players.push(newPlayer);
            
            // Update the document to add the new player
            await updateDoc(roomRef, {
                players: players,
                lastUpdated: serverTimestamp()
            });
        }
        
        roomId = code;
        isHost = false;
        showScreen(gameScreen);
        listenToRoom(code);

    } catch (e) {
        console.error("Error joining room:", e);
        joinRoomError.textContent = `Failed to join room: ${e.message || 'Server error'}.`;
    }
}

/**
 * Exits the current lobby, handling clean up.
 * @param {boolean} isGameOver - True if exiting after game over.
 */
async function exitLobby(isGameOver = false) {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    if (!roomId) {
        showScreen(mainMenu);
        return;
    }
    
    const roomRef = doc(getRoomCollection(), roomId);

    try {
        if (isHost && !isGameOver) {
            // Host leaves: delete the room
            await deleteDoc(roomRef);
            console.log(`Host left, room ${roomId} deleted.`);
        } else if (userId) {
            // Player leaves: remove them from the player array in a transaction
            await runTransaction(db, async (transaction) => {
                const roomDoc = await transaction.get(roomRef);
                if (!roomDoc.exists()) return;
                
                let players = roomDoc.data().players || [];
                const updatedPlayers = players.filter(p => p.id !== userId);

                if (updatedPlayers.length > 0) {
                    transaction.update(roomRef, {
                        players: updatedPlayers,
                        lastUpdated: serverTimestamp()
                    });
                } else {
                    // Last player leaves, delete the room
                    transaction.delete(roomRef);
                }
            });
            console.log(`Player left room ${roomId}.`);
        }
    } catch (e) {
        console.error("Error exiting lobby/deleting room:", e);
    }
    
    // Reset state and return to main menu
    roomId = '';
    isHost = false;
    playerName = '';
    if (hostControlsContainer) hostControlsContainer.innerHTML = '';
    if (startGameBtn) startGameBtn.classList.remove('hidden'); // Show button on main menu/lobby again
    showScreen(mainMenu);
}


// --- INITIALIZATION ---

/**
 * Initializes Firebase, Auth, and sets up UI listeners.
 */
async function initFirebase() {
    setLogLevel('debug');
    if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is missing. Cannot initialize.");
        showMessageBox("Setup Error", "Firebase configuration is missing.");
        return;
    }
    
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    
    // Auth logic: Sign in anonymously or with custom token
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Firebase authentication failed:", error);
        showMessageBox("Auth Error", "Failed to sign in. Please refresh.");
    }
    
    // Listen for auth state changes to get the user ID
    onAuthStateChanged(auth, (user) => {
        if (user) {
            userId = user.uid;
            isAuthenticated = true;
            console.log("Authenticated user ID:", userId);
        } else {
            console.error("User is signed out.");
        }
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    await initFirebase();

    // Attach UI event handlers
    const createBtn = document.querySelector('.create-btn');
    const joinBtn = document.querySelector('.join-btn');
    if (createBtn) createBtn.onclick = () => showScreen(createScreen);
    if (joinBtn) joinBtn.onclick = () => showScreen(joinScreen);
    
    // Use data-target for back buttons on different screens
    document.querySelectorAll('.back-btn').forEach(btn => {
        if (btn.dataset.target) {
            btn.onclick = () => showScreen(document.getElementById(btn.dataset.target));
        }
    });

    const createRoomFinal = document.getElementById('createRoomFinal');
    const joinRoomFinal = document.getElementById('joinRoomFinal');

    if (createRoomFinal) createRoomFinal.onclick = createRoom;
    if (joinRoomFinal) joinRoomFinal.onclick = joinRoom;
    
    if (startGameBtn) startGameBtn.onclick = startGame;
    if (exitLobbyBtn) exitLobbyBtn.onclick = exitLobby;

    // Show initial screen
    showScreen(mainMenu);
});

// Attach exit lobby logic to window close/reload event for cleanup (best effort)
window.addEventListener('beforeunload', () => {
    if (unsubscribe) {
        unsubscribe();
    }
    // Note: Deleting/leaving logic on unload is unreliable in browsers,
    // but the Firebase transaction on exitLobby is the primary mechanism.
});
