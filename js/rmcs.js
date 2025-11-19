import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, setLogLevel, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL VARIABLES & FIREBASE INITIALIZATION ---

// Use global variables provided by the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db, auth;
let currentUserId = null;
let roomId = '';
let playerName = '';
let isHost = false;
let roomListenerUnsubscribe = null;
let currentRoomData = null; // Store the latest snapshot data

// Firestore path
const ROOMS_COLLECTION = `artifacts/${appId}/public/data/rmcs_rooms`;

// Game Constants
const ROLE_POINTS = { Raja: 1000, Mantri: 500, SipahiCorrect: 250, SipahiWrong: 0, ChorCaught: 0, ChorEscaped: 250 };
const ROLES = ['Raja', 'Mantri', 'Chor', 'Sipahi'];

// --- UI UTILITIES ---

function showMessage(title, text) {
  const messageBox = document.getElementById('messageBox');
  document.getElementById('messageBoxTitle').textContent = title;
  document.getElementById('messageBoxText').textContent = text;
  document.getElementById('messageBoxClose').onclick = () => messageBox.classList.add('hidden');
  messageBox.classList.remove('hidden');
}

function showScreen(showScreenId) {
    const screens = ['mainMenu', 'createScreen', 'joinScreen', 'gameScreen'];
    screens.forEach(id => {
        const screen = document.getElementById(id);
        if (screen) screen.classList.remove('active-screen');
    });
    
    const targetScreen = document.getElementById(showScreenId);
    if (targetScreen) targetScreen.classList.add('active-screen');
}

function renderRoomCode(code) {
    const container = document.getElementById('currentRoomCode');
    container.innerHTML = `
        <span class="font-mono font-bold text-gray-800">${code}</span>
        <button id="copyRoomCodeBtn" class="ml-2 px-2 py-1 bg-indigo-200 text-indigo-700 rounded hover:bg-indigo-300 transition-colors duration-200">Copy</button>
    `;
    document.getElementById('copyRoomCodeBtn').onclick = () => {
        // Use document.execCommand('copy') for better compatibility in iframe environments
        const el = document.createElement('textarea');
        el.value = code;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        showMessage("Copied!", "Room code has been copied to your clipboard.");
    };
}

// --- INITIALIZATION ---

document.addEventListener("DOMContentLoaded", async function() {
    setLogLevel('debug');

    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Firebase Initialization/Auth Error:", error);
        showMessage("Initialization Error", "Could not connect to the game service. Please try refreshing.");
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            setupUIListeners();
            // Re-join logic if the user was in a room before refresh could go here
        } else {
            currentUserId = null;
            showMessage("Signed Out", "You have been signed out.");
        }
    });
});

function setupUIListeners() {
    // Navigation
    document.querySelector('.create-btn').onclick = () => showScreen('createScreen');
    document.querySelector('.join-btn').onclick = () => showScreen('joinScreen');
    [...document.querySelectorAll('.back-btn')].forEach(btn => btn.onclick = (e) => showScreen(e.target.dataset.target || 'mainMenu'));

    // Host/Lobby Actions
    document.getElementById('startGameBtn').onclick = startGame;
    document.getElementById('exitLobbyBtn').onclick = exitRoom;
    
    // Create/Join Actions
    document.getElementById('createRoomFinal').onclick = createRoom;
    document.getElementById('joinRoomFinal').onclick = joinRoom;
}

// --- FIREBASE ROOM MANAGEMENT ---

async function createRoom() {
    playerName = document.getElementById('createPlayerName').value.trim();
    if (!playerName || !currentUserId) return showMessage("Error", "Please enter your name and ensure you are signed in.");

    try {
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        const roomRef = doc(db, ROOMS_COLLECTION, code);
        
        const initialPlayer = { id: currentUserId, name: playerName, score: 0, role: null };
        const initialRoomData = {
            hostId: currentUserId,
            players: [initialPlayer],
            state: 'lobby', // 'lobby', 'playing'
            phase: 'lobby', // 'rolesAssigned', 'guessing', 'roundResult'
            round: 0,
            roles: {}, // { 'Raja': userId, 'Mantri': userId, ... }
            guess: {}, // { sipahiId: userId, guessedChorId: userId, isCorrect: boolean }
            created: Date.now()
        };

        await setDoc(roomRef, initialRoomData);
        roomId = code;
        isHost = true;
        
        showMessage("Room Created!", `Room code is: ${roomId}. Share it!`);
        enterRoom(roomId);
    } catch (error) {
        console.error("Error creating room:", error);
        showMessage("Creation Failed", "Could not create room. Please try again.");
    }
}

async function joinRoom() {
    playerName = document.getElementById('joinPlayerName').value.trim();
    const code = document.getElementById('joinRoomCode').value.trim().toUpperCase();

    if (!playerName || !code || !currentUserId) return showMessage("Error", "Please enter your name and the room code.");

    try {
        const roomRef = doc(db, ROOMS_COLLECTION, code);
        const playerToAdd = { id: currentUserId, name: playerName, score: 0, role: null };
        
        await updateDoc(roomRef, {
            players: arrayUnion(playerToAdd)
        });

        roomId = code;
        isHost = false; // Will be confirmed by snapshot listener
        enterRoom(roomId);
    } catch (error) {
        console.error("Error joining room:", error);
        showMessage("Join Failed", "Room not found or error joining. Check the code and try again.");
    }
}

function enterRoom(code) {
    if (roomListenerUnsubscribe) roomListenerUnsubscribe();

    showScreen('gameScreen');
    renderRoomCode(code);

    const roomRef = doc(db, ROOMS_COLLECTION, code);
    roomListenerUnsubscribe = onSnapshot(roomRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentRoomData = docSnapshot.data();
            handleGameUpdate(currentRoomData);
        } else {
            console.log("Room deleted or non-existent.");
            showMessage("Room Closed", "The room no longer exists. Returning to menu.");
            exitRoom(false);
        }
    }, (error) => {
        console.error("Firestore listen error:", error);
        showMessage("Connection Error", "Lost connection to the room. Exiting.");
        exitRoom(false);
    });
}

async function exitRoom(shouldUpdateFirebase = true) {
    if (roomListenerUnsubscribe) {
        roomListenerUnsubscribe();
        roomListenerUnsubscribe = null;
    }
    
    if (shouldUpdateFirebase && roomId && currentUserId && currentRoomData) {
        try {
            const roomRef = doc(db, ROOMS_COLLECTION, roomId);
            const playerToRemove = currentRoomData.players.find(p => p.id === currentUserId);
            
            // Note: arrayRemove requires the object to exactly match, so we must use the object form with default score.
            await updateDoc(roomRef, {
                players: arrayRemove({ id: currentUserId, name: playerName, score: 0, role: null })
            });
            // If the host leaves, the room remains, but the next player can potentially become host
        } catch (e) {
            console.warn("Could not remove player from room:", e);
        }
    }
    
    // Reset local state
    roomId = '';
    playerName = '';
    isHost = false;
    currentRoomData = null;
    
    showScreen('mainMenu');
}

// --- GAME STATE MACHINE ---

function handleGameUpdate(data) {
    const players = data.players || [];
    const currentPlayer = players.find(p => p.id === currentUserId);
    
    isHost = data.hostId === currentUserId;

    // Always render UI containers
    renderRoundDisplay(data.round);
    renderScoreboard(players);
    renderPlayerList(players, data.state);
    
    // Host Control Logic
    renderHostControls(data, players.length);
    
    // Phase Logic
    if (data.state === 'lobby') {
        renderGameLobby(players.length);
    } else if (data.state === 'playing') {
        if (data.phase === 'rolesAssigned') {
            renderRoleAssignment(data, currentPlayer);
        } else if (data.phase === 'guessing') {
            renderGuessingPhase(data, currentPlayer);
        } else if (data.phase === 'roundResult') {
            renderRoundResult(data, currentPlayer);
        }
    }
}

// --- RENDER FUNCTIONS (Strictly using original GUI flow) ---

function renderRoundDisplay(round) {
    const el = document.getElementById('roundDisplay');
    el.innerHTML = `
        <h2 class="text-3xl font-bold text-gray-800">Round <span class="text-indigo-600">${round}</span></h2>
    `;
    if (round === 0) el.classList.add('hidden'); else el.classList.remove('hidden');
}

function renderScoreboard(players) {
    const listEl = document.getElementById('scoreList');
    const sortedPlayers = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    
    let html = sortedPlayers.map((p, index) => {
        const isSelf = p.id === currentUserId;
        const className = isSelf ? 'font-extrabold text-indigo-700 bg-indigo-50 p-2 rounded-lg' : 'text-gray-700 p-2';
        return `
            <li class="flex justify-between items-center ${className}">
                <span class="text-lg">${index + 1}. ${p.name} ${isSelf ? '(You)' : ''}</span>
                <span class="text-xl font-mono">${p.score || 0}</span>
            </li>
        `;
    }).join('');
    listEl.innerHTML = html || '<li class="text-center text-gray-500">No scores available.</li>';
}

function renderPlayerList(players, state) {
    const listEl = document.getElementById('playersList');
    let html = players.map(p => {
        const isSelf = p.id === currentUserId;
        const isHostPlayer = p.id === currentRoomData?.hostId;
        const playerStatus = state === 'playing' ? 'In Game' : 'In Lobby';
        
        return `
            <li class="flex justify-between items-center p-2 rounded-lg ${isSelf ? 'bg-indigo-100 font-bold' : 'bg-white border'}">
                <span>${p.name} ${isHostPlayer ? '(Host)' : ''} ${isSelf ? '(You)' : ''}</span>
                <span class="text-sm text-gray-500">${playerStatus}</span>
            </li>
        `;
    }).join('');
    listEl.innerHTML = html;
}

function renderHostControls(data, playerCount) {
    const controlsContainer = document.getElementById('hostControlsContainer');
    const startGameBtn = document.getElementById('startGameBtn');
    
    // Always hide the default startGameBtn from the HTML template if we are in game
    startGameBtn.classList.add('hidden');
    controlsContainer.innerHTML = '';
    
    if (!isHost) return;

    // Show host actions only when game is playing or result is displayed
    if (data.state === 'playing') {
        let buttonsHtml = '';

        if (data.phase === 'roundResult') {
            buttonsHtml = `
                <button id="nextRoundBtn" class="confirm-btn w-full bg-green-500 hover:bg-green-600">Next Round</button>
                <button id="cancelRoundBtn" class="back-btn w-full mt-3 bg-red-500 text-white hover:bg-red-600">Cancel Round / End Game</button>
            `;
            controlsContainer.innerHTML = buttonsHtml;
            document.getElementById('nextRoundBtn').onclick = startNewRound;
            document.getElementById('cancelRoundBtn').onclick = cancelRound;
        } else {
            // During roles, guessing, the only control is cancel round (emergency stop)
            buttonsHtml = `
                <p class="text-sm font-semibold text-gray-700 mb-2">Host Actions:</p>
                <button id="cancelRoundBtn" class="back-btn w-full bg-red-500 text-white hover:bg-red-600">Cancel Round</button>
            `;
            controlsContainer.innerHTML = buttonsHtml;
            document.getElementById('cancelRoundBtn').onclick = cancelRound;
        }

    } else { // Lobby state
        startGameBtn.classList.remove('hidden');
        startGameBtn.disabled = playerCount < 4;
        startGameBtn.textContent = playerCount < 4 ? `Need ${4 - playerCount} players to Start` : 'Start Game';
    }
}

function renderGameLobby(playerCount) {
    const gameContentEl = document.getElementById('gameContent').querySelector('.table');
    gameContentEl.innerHTML = `
        <div class="text-center p-4">
            <h3 class="text-xl font-semibold text-gray-700 mb-2">Waiting for Host to Start...</h3>
            <p class="text-gray-500">${playerCount}/4 minimum players joined.</p>
        </div>
    `;
    // Ensure the default StartGameBtn is visible if this player is the host, this is handled in renderHostControls
}

function renderRoleAssignment(data, currentPlayer) {
    const gameContentEl = document.getElementById('gameContent').querySelector('.table');
    const myRole = Object.keys(data.roles).find(role => data.roles[role] === currentUserId);
    
    // Custom utility classes that map to the visual style of the original app
    const ROLE_CLASSES = {
        Raja: 'bg-yellow-500 text-yellow-900 shadow-lg shadow-yellow-500/50',
        Mantri: 'bg-green-500 text-green-900 shadow-lg shadow-green-500/50',
        Sipahi: 'bg-indigo-500 text-indigo-900 shadow-lg shadow-indigo-500/50',
        Chor: 'bg-red-500 text-red-900 shadow-lg shadow-red-500/50',
        Spectator: 'bg-gray-400 text-gray-800 shadow-lg shadow-gray-400/50'
    };

    let title, message;
    if (myRole) {
        title = `You are the ${myRole}!`;
        message = myRole === 'Raja' ? 'You automatically get 1000 points. Sit back!' :
                  myRole === 'Mantri' ? 'You automatically get 500 points. Claim your role!' :
                  myRole === 'Sipahi' ? 'Wait for the Mantri to claim their role before you guess.' :
                  'Stay quiet and look innocent. Try to avoid being identified.';
    } else {
        title = 'Spectator';
        message = 'You are observing this round.';
    }

    gameContentEl.innerHTML = `
        <div class="flex flex-col items-center p-6 w-full animate-fade-in">
            <div class="role-card p-4 rounded-xl text-center w-full max-w-xs ${ROLE_CLASSES[myRole] || ROLE_CLASSES['Spectator']}">
                <h3 class="text-3xl font-extrabold mb-2">${title}</h3>
                <p class="text-lg text-white font-semibold">${message}</p>
            </div>
            <div id="roleActionArea" class="mt-6 w-full max-w-sm">
                ${myRole === 'Mantri' ? 
                    `<button id="claimMantriBtn" class="confirm-btn w-full bg-green-700 hover:bg-green-800 giant-btn">I Claim Mantri! (500 pts)</button>` : 
                    `<button disabled class="back-btn w-full giant-btn">Waiting for Mantri...</button>`
                }
            </div>
        </div>
    `;

    if (myRole === 'Mantri') {
        document.getElementById('claimMantriBtn').onclick = async () => {
            const roomRef = doc(db, ROOMS_COLLECTION, roomId);
            await updateDoc(roomRef, { phase: 'guessing' }); // Mantri claim moves straight to guessing phase
            showMessage("Mantri Claimed", "The Sipahi can now make their guess!");
        };
    }
}

function renderGuessingPhase(data, currentPlayer) {
    const gameContentEl = document.getElementById('gameContent').querySelector('.table');
    const isSipahi = currentUserId === data.roles['Sipahi'];
    
    // Exclude the Sipahi and the Raja (Raja is excluded since they don't guess or get guessed)
    const guessablePlayers = data.players.filter(p => p.id !== data.roles['Sipahi'] && p.id !== data.roles['Raja']);
    
    const sipahiContent = `
        <h3 class="text-2xl font-bold text-gray-800 mb-4">Sipahi: Guess the Chor!</h3>
        <p class="text-lg text-gray-600 mb-6">Which player is the Chor? Click to accuse them!</p>
        <div class="space-y-3 w-full max-w-xs">
            ${guessablePlayers.map(p => `
                <button data-id="${p.id}" class="guess-player-btn giant-btn w-full bg-red-400 text-red-900 hover:bg-red-500 transition-all duration-300">
                    Accuse ${p.name}
                </button>
            `).join('')}
        </div>
    `;
    
    const otherContent = `
        <h3 class="text-2xl font-bold text-gray-800 mb-4">Guessing in Progress...</h3>
        <p class="text-lg text-gray-600 mb-6">The Sipahi is making their choice. Maintain your poker face!</p>
        <div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12 mb-4 animate-spin"></div>
    `;

    gameContentEl.innerHTML = `
        <div class="flex flex-col items-center p-6 w-full animate-fade-in">
            ${isSipahi ? sipahiContent : otherContent}
        </div>
    `;

    if (isSipahi) {
        document.querySelectorAll('.guess-player-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const guessedId = e.target.dataset.id;
                const chorId = data.roles['Chor'];
                const isCorrect = guessedId === chorId;
                
                await calculateRoundResult(data, isCorrect, guessedId);

                const roomRef = doc(db, ROOMS_COLLECTION, roomId);
                await updateDoc(roomRef, {
                    phase: 'roundResult',
                    guess: {
                        sipahiId: currentUserId,
                        guessedChorId: guessedId,
                        isCorrect: isCorrect,
                    }
                });
            };
        });
    }
}

async function calculateRoundResult(data, isCorrect, guessedId) {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const players = data.players;
    const roles = data.roles;

    // Define points based on outcome
    const points = {
        [roles['Raja']]: ROLE_POINTS.Raja,
        [roles['Mantri']]: ROLE_POINTS.Mantri,
        [roles['Sipahi']]: isCorrect ? ROLE_POINTS.SipahiCorrect : ROLE_POINTS.SipahiWrong,
        [roles['Chor']]: isCorrect ? ROLE_POINTS.ChorCaught : ROLE_POINTS.ChorEscaped
    };

    // Create a new array with updated scores
    const updatedPlayers = players.map(p => {
        const pointGain = points[p.id] || 0;
        return {
            ...p,
            score: (p.score || 0) + pointGain,
        };
    });

    await updateDoc(roomRef, { players: updatedPlayers });
}


function renderRoundResult(data, currentPlayer) {
    const gameContentEl = document.getElementById('gameContent').querySelector('.table');
    const guess = data.guess;
    const players = data.players;
    const roles = data.roles;
    
    const getPlayerName = (id) => players.find(p => p.id === id)?.name || 'Unknown Player';

    const chorName = getPlayerName(roles['Chor']);
    const sipahiName = getPlayerName(roles['Sipahi']);
    const guessedName = getPlayerName(guess.guessedChorId);
    
    let outcomeTitle, outcomeMessage, emoji;

    if (guess.isCorrect) {
        outcomeTitle = "SUCCESS!";
        outcomeMessage = `${sipahiName} (Sipahi) correctly identified ${chorName} as the Chor!`;
        emoji = "👑"; // King is happy
    } else {
        outcomeTitle = "CHOR ESCAPES!";
        outcomeMessage = `${sipahiName} (Sipahi) incorrectly guessed ${guessedName}. The Chor was ${chorName}!`;
        emoji = "🎭"; // Mask/Chor escapes
    }
    
    const myRole = Object.keys(roles).find(role => roles[role] === currentUserId);
    
    // Calculate score change from the previous round (requires storing the prior score, simple check for display purposes only)
    const myCurrentScore = players.find(p => p.id === currentUserId)?.score || 0;
    const initialScoreInRound = currentRoomData.players.find(p => p.id === currentUserId)?.score || 0; 
    const myScoreGain = myCurrentScore - initialScoreInRound;

    // Display result and scores
    gameContentEl.innerHTML = `
        <div class="flex flex-col justify-center items-center min-h-[200px] p-6 w-full animate-fade-in">
            <div class="text-6xl mb-4 animate-bounce">${emoji}</div>
            <div class="rounded-2xl shadow-xl py-4 px-8 mb-6 text-2xl font-bold text-center w-full max-w-sm ${guess.isCorrect ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}">
                <h3 class="text-3xl font-extrabold mb-2">${outcomeTitle}</h3>
                <p class="text-lg font-semibold">${outcomeMessage}</p>
            </div>
            <div class="text-center mb-6">
                <p class="text-lg font-semibold text-gray-700">Your Role: <span class="font-bold">${myRole || 'Spectator'}</span></p>
                <p class="text-2xl font-bold text-indigo-600">You earned <span class="text-green-500">+${myScoreGain || 0}</span> points this round.</p>
            </div>
        </div>
    `;
}

// --- HOST GAME FLOW ACTIONS ---

async function startGame() {
    if (!isHost) return;
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    await updateDoc(roomRef, {
        state: 'playing',
        round: 1
    });
    await assignRoles();
}

async function startNewRound() {
    if (!isHost) return;
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    
    await updateDoc(roomRef, {
        round: (currentRoomData.round || 0) + 1,
        phase: 'rolesAssigned',
        roles: {},
        guess: {}
    });
    await assignRoles();
}

async function cancelRound() {
    if (!isHost) return;
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    
    // Reset game state back to lobby
    await updateDoc(roomRef, {
        state: 'lobby',
        phase: 'lobby',
        round: 0,
        roles: {},
        guess: {}
    });
    showMessage("Round Cancelled", "The current round has been cancelled and the game is back in the lobby.");
}

async function assignRoles() {
    if (!isHost) return;
    try {
        const roomRef = doc(db, ROOMS_COLLECTION, roomId);
        
        const players = currentRoomData.players;

        if (players.length < 4) {
            return showMessage("Error", "Need a minimum of 4 players to start a round.");
        }

        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
        const assignedRoles = {};
        
        // Assign roles to players based on the shuffled order (first 4 get roles)
        ROLES.forEach((role, index) => {
            if (shuffledPlayers[index]) {
                assignedRoles[role] = shuffledPlayers[index].id;
            }
        });

        await updateDoc(roomRef, {
            phase: 'rolesAssigned',
            roles: assignedRoles,
            guess: {}
        });
        
    } catch (e) {
        console.error("Error assigning roles:", e);
        showMessage("Game Error", "Could not assign roles. Check console for details.");
    }
}
