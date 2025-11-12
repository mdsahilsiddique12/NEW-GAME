// Firebase initialization
const db = firebase.firestore();

let roomId = '';
let playerName = '';
let playerId = '';
let isHost = false;
let role = '';
let revealedPlayers = [];

// Create room
document.getElementById('createRoom').onclick = async function() {
  playerName = document.getElementById('playerName').value.trim();
  if (!playerName) return alert('Enter your name!');
  isHost = true;
  const doc = await db.collection('rmcs_rooms').add({
    host: playerName,
    players: [{ name: playerName, id: firebase.auth().currentUser.uid }],
    state: 'waiting',
    created: Date.now()
  });
  roomId = doc.id;
  showRoom(roomId, playerName);
};

// Join room
document.getElementById('joinRoom').onclick = async function() {
  playerName = document.getElementById('playerName').value.trim();
  const code = document.getElementById('joinCode').value.trim();
  if (!playerName || !code) return alert('Enter name and room code!');
  const doc = await db.collection('rmcs_rooms').doc(code).get();
  if (!doc.exists) return alert('Room not found');
  await db.collection('rmcs_rooms').doc(code).update({
    players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, id: firebase.auth().currentUser.uid })
  });
  roomId = code;
  showRoom(roomId, playerName);
};

// Show room and listen for updates
function showRoom(code, name) {
  document.getElementById('gameContent').innerHTML = `
    <h2>Room: <span class="room-code">${code}</span></h2>
    <h3>Share this code with friends!</h3>
    <div id="playersList">Loading players...</div>
    <button id="startGame" class="btn btn-primary">Start Game</button>
  `;
  document.getElementById('startGame').onclick = startGame;

  // Listen for player updates
  db.collection('rmcs_rooms').doc(code).onSnapshot(doc => {
    const data = doc.data();
    const players = data.players;
    let playersHtml = '<h3>Players:</h3>';
    players.forEach(p => playersHtml += `<div class="player-card">${p.name}</div>`);
    document.getElementById('playersList').innerHTML = playersHtml;
  });
}

// Start game
function startGame() {
  db.collection('rmcs_rooms').doc(roomId).update({
    state: 'playing',
    round: 1,
    maxRounds: 5
  });
  assignRoles();
}

// Assign roles
function assignRoles() {
  db.collection('rmcs_rooms').doc(roomId).get().then(doc => {
    const data = doc.data();
    const players = data.players;
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    const shuffledRoles = roles.sort(() => Math.random() - 0.5);
    players.forEach((p, i) => {
      if (p.id === firebase.auth().currentUser.uid) {
        role = shuffledRoles[i];
        document.getElementById('gameContent').innerHTML = `
          <div class="role-card">
            <h2>Your Role: ${role}</h2>
            <p>Reveal your role to others.</p>
            <button id="revealRole" class="btn btn-primary">Reveal Role</button>
          </div>
        `;
        document.getElementById('revealRole').onclick = revealRole;
      }
    });
  });
}

// Reveal role
function revealRole() {
  revealedPlayers.push({ id: firebase.auth().currentUser.uid, role: role });
  db.collection('rmcs_rooms').doc(roomId).update({
    revealedPlayers: firebase.firestore.FieldValue.arrayUnion({ id: firebase.auth().currentUser.uid, role: role })
  });
  // Listen for other reveals and enable guessing
  db.collection('rmcs_rooms').doc(roomId).onSnapshot(doc => {
    const data = doc.data();
    const rajaRevealed = data.revealedPlayers.find(p => p.role === 'Raja');
    const sipahiRevealed = data.revealedPlayers.find(p => p.role === 'Sipahi');
    if (rajaRevealed && sipahiRevealed) {
      document.getElementById('gameContent').innerHTML += `
        <div class="status-message">Sipahi, guess the thief!</div>
        <input id="guessInput" placeholder="Enter suspect name" class="input-field" />
        <button id="guessBtn" class="btn btn-primary">Guess</button>
      `;
      document.getElementById('guessBtn').onclick = guessThief;
    }
  });
}

// Guess thief
function guessThief() {
  const suspectName = document.getElementById('guessInput').value.trim();
  db.collection('rmcs_rooms').doc(roomId).get().then(doc => {
    const data = doc.data();
    const thief = data.players.find(p => data.revealedPlayers.find(r => r.id === p.id && r.role === 'Chor'));
    const correct = suspectName === thief.name;
    // Update scores and show result
    document.getElementById('gameContent').innerHTML = `
      <div class="status-message">${correct ? 'Correct!' : 'Wrong!'}</div>
      <div class="score-board">
        <h3>Score Board</h3>
        <div id="scoreList"></div>
      </div>
    `;
    // Update scores in Firestore
    // (Add logic to update scores based on correct/wrong guess)
  });
}
