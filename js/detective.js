// Firebase initialization
const db = firebase.firestore();

let roomId = '';
let playerName = '';
let playerId = '';
let isHost = false;
let role = '';
let deaths = [];

// Create room
document.getElementById('createRoom').onclick = async function() {
  playerName = document.getElementById('playerName').value.trim();
  if (!playerName) return alert('Enter your name!');
  isHost = true;
  const doc = await db.collection('detective_rooms').add({
    host: playerName,
    players: [{ name: playerName, id: firebase.auth().currentUser.uid, alive: true, role: null }],
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
  const doc = await db.collection('detective_rooms').doc(code).get();
  if (!doc.exists) return alert('Room not found');
  await db.collection('detective_rooms').doc(code).update({
    players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, id: firebase.auth().currentUser.uid, alive: true, role: null })
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
  db.collection('detective_rooms').doc(code).onSnapshot(doc => {
    const data = doc.data();
    const players = data.players;
    let playersHtml = '<h3>Players:</h3>';
    players.forEach(p => playersHtml += `<div class="player-card">${p.name}${p.alive ? '' : ' (Dead)'}</div>`);
    document.getElementById('playersList').innerHTML = playersHtml;
  });
}

// Start game
function startGame() {
  db.collection('detective_rooms').doc(roomId).update({
    state: 'playing'
  });
  assignRoles();
}

// Assign roles
function assignRoles() {
  db.collection('detective_rooms').doc(roomId).get().then(doc => {
    const data = doc.data();
    const players = data.players;
    const shuffled = players.sort(() => Math.random() - 0.5);
    const killer = shuffled[0];
    const detective = shuffled[1];
    players.forEach(p => {
      if (p.id === firebase.auth().currentUser.uid) {
        if (p.id === killer.id) {
          role = 'Killer';
        } else if (p.id === detective.id) {
          role = 'Detective';
        } else {
          role = 'Citizen';
        }
        document.getElementById('gameContent').innerHTML = `
          <div class="role-card ${role.toLowerCase()}">
            <h2>Your Role: ${role}</h2>
            <p>${role === 'Killer' ? 'Eliminate citizens secretly.' : role === 'Detective' ? 'Find the killer.' : 'Try to survive.'}</p>
          </div>
        `;
      }
    });
  });
}
