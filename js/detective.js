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
  
  const docRef = db.collection('detective_rooms').doc(code);
  
  // Use a transaction to safely check player count before joining
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) throw 'Room not found';
      
      const data = doc.data();
      
      // CHECK: Max 10 Players
      if (data.players.length >= 10) {
        throw 'Room is full (Max 10 players)!';
      }
      
      // CHECK: Game already started
      if (data.state !== 'waiting') {
        throw 'Game has already started!';
      }

      transaction.update(docRef, {
        players: firebase.firestore.FieldValue.arrayUnion({ 
          name: playerName, 
          id: firebase.auth().currentUser.uid, 
          alive: true, 
          role: null 
        })
      });
    });
    
    // If successful
    roomId = code;
    showRoom(roomId, playerName);
    
  } catch (error) {
    alert(error);
  }
};

// Show room and listen for updates
function showRoom(code, name) {
  document.getElementById('gameContent').innerHTML = `
    <h2>Room: <span class="room-code">${code}</span></h2>
    <h3 style="color:#aaa; margin-bottom:15px;">Share this code with friends!</h3>
    <div id="statusMsg" style="color: #00ff41; margin-bottom: 10px;"></div>
    <div id="playersList">Loading players...</div>
    ${isHost ? `<button id="startGame" class="btn btn-primary" style="margin-top:20px;">Start Game</button>` : '<p style="margin-top:20px; color:#666;">Waiting for host to start...</p>'}
  `;

  if (isHost) {
    document.getElementById('startGame').onclick = startGame;
  }

  // Listen for player updates
  db.collection('detective_rooms').doc(code).onSnapshot(doc => {
    const data = doc.data();
    if (!data) return; // Safety check if room is deleted

    // If game started, switch to role view
    if (data.state === 'playing' && !role) {
        assignRoles();
        return;
    }

    const players = data.players;
    const count = players.length;
    
    // Update Player List UI
    let playersHtml = `<h3 style="border-bottom:1px solid #333; padding-bottom:5px;">Players (${count}/10):</h3>`;
    players.forEach(p => playersHtml += `<div class="player-card">${p.name}${p.alive ? '' : ' (Dead)'}</div>`);
    document.getElementById('playersList').innerHTML = playersHtml;

    // Update Host Button Text based on count
    if (isHost) {
      const btn = document.getElementById('startGame');
      if (count < 4) {
        btn.innerText = `Need ${4 - count} more player(s)`;
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
      } else {
        btn.innerText = "Start Game";
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
      }
    }
  });
}

// Start game
async function startGame() {
  const doc = await db.collection('detective_rooms').doc(roomId).get();
  const players = doc.data().players;

  // CHECK: Min 4 Players
  if (players.length < 4) {
    return alert('Need at least 4 players to start!');
  }

  db.collection('detective_rooms').doc(roomId).update({
    state: 'playing'
  });
  
  // Host triggers role assignment for everyone via DB update
  // (The logic below actually runs locally for the host, but roles need to be saved to DB for everyone to see)
  // Note: Your original code calculated roles locally. For multiplayer sync, it's better to save roles to DB.
  // I will keep your original flow but ensure roles are saved so everyone gets one.
  performRoleAssignment(players);
}

function performRoleAssignment(players) {
    // Shuffle players
    const shuffled = players.sort(() => Math.random() - 0.5);
    
    // Logic: 1 Killer, 1 Detective, Rest Citizens
    const killerId = shuffled[0].id;
    const detectiveId = shuffled[1].id;
    
    // Map new roles
    const updatedPlayers = players.map(p => {
        let r = 'Citizen';
        if (p.id === killerId) r = 'Killer';
        if (p.id === detectiveId) r = 'Detective';
        return { ...p, role: r };
    });

    // Save assigned roles to Firestore
    db.collection('detective_rooms').doc(roomId).update({
        players: updatedPlayers
    });
}

// Assign/Reveal roles (Client Side)
// Modified to read from the DB instead of calculating locally again
function assignRoles() {
  db.collection('detective_rooms').doc(roomId).get().then(doc => {
    const data = doc.data();
    const players = data.players;
    
    players.forEach(p => {
      if (p.id === firebase.auth().currentUser.uid) {
        role = p.role; // Get role from DB
        
        let description = 'Try to survive.';
        if (role === 'Killer') description = 'Eliminate citizens secretly.';
        if (role === 'Detective') description = 'Find the killer.';

        document.getElementById('gameContent').innerHTML = `
          <div class="role-card ${role.toLowerCase()}">
            <h2>Your Role: ${role}</h2>
            <p>${description}</p>
          </div>
        `;
      }
    });
  });
}
