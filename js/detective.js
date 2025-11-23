document.addEventListener("DOMContentLoaded", function() {
  
  // Initialize Firestore (Use local variable to avoid global conflict)
  const firestore = firebase.firestore();

  // --- State Variables ---
  let roomId = '';
  let playerName = '';
  let unsubscribe = null; // To stop listening when game ends or restarts
  let isHost = false;

  // --- DOM Elements ---
  const createBtn = document.getElementById('createRoom');
  const joinBtn = document.getElementById('joinRoom');
  const nameInputCreate = document.getElementById('nameInputCreate'); // From new UI
  const nameInputJoin = document.getElementById('nameInputJoin');     // From new UI
  const joinCodeInput = document.getElementById('joinCode');
  const gameContent = document.getElementById('gameContent');

  // --- Helper: Get Player Name ---
  // Supports both the hidden 'playerName' or the specific input fields
  function getPlayerName(isCreating) {
    const mainInput = document.getElementById('playerName').value.trim();
    if (mainInput) return mainInput;
    
    if (isCreating) return nameInputCreate ? nameInputCreate.value.trim() : '';
    return nameInputJoin ? nameInputJoin.value.trim() : '';
  }

  // --- 1. CREATE ROOM ---
  if (createBtn) {
    createBtn.onclick = async function() {
      playerName = getPlayerName(true);
      if (!playerName) return alert('Please enter your Agent Name!');

      // Auto-Auth if not logged in
      if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
      const uid = firebase.auth().currentUser.uid;

      try {
        const docRef = await firestore.collection('detective_rooms').add({
          host: playerName,
          hostId: uid,
          players: [{ name: playerName, id: uid, alive: true, role: null }],
          state: 'waiting',
          created: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        roomId = docRef.id;
        isHost = true;
        listenToRoom(roomId);
        
      } catch (error) {
        console.error(error);
        alert("Error creating room: " + error.message);
      }
    };
  }

  // --- 2. JOIN ROOM ---
  if (joinBtn) {
    joinBtn.onclick = async function() {
      playerName = getPlayerName(false);
      const code = joinCodeInput.value.trim();

      if (!playerName || !code) return alert('Enter Name and Room Code!');

      // Auto-Auth
      if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
      const uid = firebase.auth().currentUser.uid;

      const docRef = firestore.collection('detective_rooms').doc(code);

      try {
        await firestore.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef);
          if (!doc.exists) throw 'Room not found';

          const data = doc.data();

          // Check if already in room
          const alreadyIn = data.players.some(p => p.id === uid);
          
          if (!alreadyIn) {
            // VALIDATION: Max 10 Players
            if (data.players.length >= 10) throw 'Mission Full (Max 10 Agents)!';
            // VALIDATION: Game in progress
            if (data.state !== 'waiting') throw 'Mission already underway!';

            transaction.update(docRef, {
              players: firebase.firestore.FieldValue.arrayUnion({ 
                name: playerName, 
                id: uid, 
                alive: true, 
                role: null 
              })
            });
          }
        });

        roomId = code;
        isHost = false;
        listenToRoom(roomId);

      } catch (error) {
        alert(error);
      }
    };
  }

  // --- 3. LOBBY & GAME LISTENER ---
  function listenToRoom(code) {
    // Clean up previous listener if exists
    if (unsubscribe) unsubscribe();

    // Switch UI to Game View immediately
    if (document.getElementById('view-menu')) {
        document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
        gameContent.style.display = 'block';
    }

    unsubscribe = firestore.collection('detective_rooms').doc(code).onSnapshot(doc => {
      if (!doc.exists) return alert("Room terminated.");
      const data = doc.data();
      const currentUser = firebase.auth().currentUser;

      // RENDER: Waiting Room / Lobby
      if (data.state === 'waiting') {
        renderLobby(code, data.players, data.hostId === currentUser.uid);
      } 
      // RENDER: Playing (Role Reveal)
      else if (data.state === 'playing') {
        const myPlayer = data.players.find(p => p.id === currentUser.uid);
        if (myPlayer && myPlayer.role) {
          renderRole(myPlayer.role);
        }
      }
    });
  }

  // --- 4. RENDER FUNCTIONS ---
  
  function renderLobby(code, players, amIHost) {
    const count = players.length;
    const minPlayers = 4;
    
    let html = `
      <div style="text-align:center; animation: fadeIn 0.5s;">
        <h3 style="color:#888; letter-spacing:2px;">MISSION KEY</h3>
        <span class="room-code">${code}</span>
        <div id="playersList"></div>
    `;

    // Generate Player Grid
    let listHtml = `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin:20px 0;">`;
    players.forEach(p => {
      listHtml += `
        <div class="player-card" style="border:1px solid #00ff41; padding:10px; background:rgba(0,255,65,0.05);">
          ${p.name}
        </div>`;
    });
    listHtml += `</div>`;
    
    html += listHtml;

    // Start Button Logic (Host Only)
    if (amIHost) {
      if (count < minPlayers) {
        html += `<button disabled class="btn" style="background:#333; color:#666; cursor:not-allowed;">
                   WAITING FOR AGENTS (${count}/${minPlayers})
                 </button>`;
      } else {
        html += `<button id="startGameBtn" class="btn btn-action-red">
                   INITIATE MISSION
                 </button>`;
      }
    } else {
      html += `<div style="color:#00ff41; margin-top:20px;" class="blink">WAITING FOR COMMANDER...</div>`;
    }
    
    html += `</div>`;
    gameContent.innerHTML = html;

    // Attach Start Event
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
      startBtn.onclick = () => startGame(players);
    }
  }

  function renderRole(role) {
    let colorClass = 'citizen';
    let desc = 'Stay alive. Trust no one.';
    
    if (role === 'Killer') {
      colorClass = 'killer';
      desc = 'Eliminate the targets. Don\'t get caught.';
    } else if (role === 'Detective') {
      colorClass = 'detective';
      desc = 'Identify and stop the Killer.';
    }

    gameContent.innerHTML = `
      <div class="role-card ${colorClass}">
        <h2 style="font-size:3rem; margin-bottom:10px;">${role}</h2>
        <p style="font-family:'Share Tech Mono'; font-size:1.2rem;">${desc}</p>
      </div>
    `;
  }

  // --- 5. GAME LOGIC (Host Side) ---
  async function startGame(players) {
    // Double check count
    if (players.length < 4) return alert("Not enough agents!");

    // Assign Roles
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const killerId = shuffled[0].id;
    const detectiveId = shuffled[1].id;

    const updatedPlayers = players.map(p => {
      let r = 'Citizen';
      if (p.id === killerId) r = 'Killer';
      if (p.id === detectiveId) r = 'Detective';
      return { ...p, role: r };
    });

    // Update DB to start game
    await firestore.collection('detective_rooms').doc(roomId).update({
      players: updatedPlayers,
      state: 'playing'
    });
  }

});
