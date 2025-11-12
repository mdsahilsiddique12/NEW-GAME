document.addEventListener("DOMContentLoaded", function() {
  // Navigation references
  const mainMenu = document.getElementById('mainMenu');
  const createScreen = document.getElementById('createScreen');
  const joinScreen = document.getElementById('joinScreen');
  const gameScreen = document.getElementById('gameScreen');

  // Navigation logic
  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(screen => screen.classList.remove('active-screen'));
    show.classList.add('active-screen');
  }

  document.querySelector('.create-btn').onclick = () => showScreen(createScreen);
  document.querySelector('.join-btn').onclick = () => showScreen(joinScreen);
  [...document.querySelectorAll('.back-btn')].forEach(btn => btn.onclick = () => showScreen(mainMenu));

  // Main logic variables
  let roomId = '';
  let playerName = '';

  // --- Room Creation (with code uniqueness check) ---
  document.getElementById('createRoomFinal').onclick = async () => {
    playerName = document.getElementById('createPlayerName').value.trim();
    let customRoomCode = document.getElementById('createRoomCode').value.trim().toUpperCase();
    document.getElementById('createRoomError').innerText = '';

    if (!playerName) {
      document.getElementById('createRoomError').innerText = "Enter your name.";
      return;
    }
    if (customRoomCode && (customRoomCode.length < 4 || !/^[A-Z0-9]{4,8}$/.test(customRoomCode))) {
      document.getElementById('createRoomError').innerText = "Room code: 4-8 letters/numbers.";
      return;
    }

    if (!customRoomCode) {
      // Generate a random 6-letter code
      customRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Check for code uniqueness
    const ref = db.collection('rmcs_rooms').doc(customRoomCode);
    const docSnapshot = await ref.get();
    if (docSnapshot.exists) {
      document.getElementById('createRoomError').innerText = "Room code already exists. Try a new code!";
      return;
    }

    // Auth/initiate, create room
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) { document.getElementById('createRoomError').innerText = "Authentication error."; return; }
      try {
        await ref.set({
          host: playerName,
          players: [{ name: playerName, id: user.uid }],
          state: 'waiting',
          created: Date.now()
        });
        roomId = customRoomCode;
        showGame(roomId);
      } catch (error) {
        document.getElementById('createRoomError').innerText = 'Room creation error: ' + error.message;
      }
    });
  };

  // --- Join Room ---
  document.getElementById('joinRoomFinal').onclick = async () => {
    playerName = document.getElementById('joinPlayerName').value.trim();
    const code = document.getElementById('joinRoomCode').value.trim().toUpperCase();
    document.getElementById('joinRoomError').innerText = '';
    if (!playerName || !code) {
      document.getElementById('joinRoomError').innerText = "Enter both a name and room code.";
      return;
    }
    const ref = db.collection('rmcs_rooms').doc(code);
    const doc = await ref.get();
    if (!doc.exists) {
      document.getElementById('joinRoomError').innerText = "Room not found!";
      return;
    }
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) return document.getElementById('joinRoomError').innerText = "Authentication error.";
      if (!doc.data().players.some(p => p.id === user.uid)) {
        await ref.update({
          players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, id: user.uid })
        });
      }
      roomId = code;
      showGame(roomId);
    });
  };

  // --- Game page logic, all async functions unchanged from robust previous version ---

  function showGame(roomCode) {
    showScreen(gameScreen);
    const contentDiv = document.getElementById('gameContent');
    if (!contentDiv) return;
    contentDiv.innerHTML = `
      <h2>Room Code: <span style="font-size:1.3em;letter-spacing:2px">${roomCode}</span></h2>
      <div id="playersList"></div>
      <button id="startGame" class="btn btn-primary">Start Game</button>
    `;
    document.getElementById('startGame').onclick = startGame;

    // Listen for changes and update UI
    db.collection('rmcs_rooms').doc(roomCode)
      .onSnapshot(doc => {
        const data = doc.data();
        if (!data) return;
        let html = '<h3>Players in this Room:</h3>';
        data.players.forEach(p => {
          html += `<div class="player-card">${p.name}</div>`;
        });
        const playersList = document.getElementById('playersList');
        if (playersList) playersList.innerHTML = html;
        if (data.state === 'playing') {
          playRound(data);
        }
      });
  }

  // Start the game, check enough players
  async function startGame() {
    const doc = await db.collection('rmcs_rooms').doc(roomId).get();
    const data = doc.data();
    if (!data || !data.players || data.players.length !== 4) {
      alert('Exactly 4 players required to start!');
      return;
    }
    await db.collection('rmcs_rooms').doc(roomId).update({
      state: 'playing',
      round: 1,
      maxRounds: 5
    });
  }

  async function playRound(data) {
    const players = data.players;
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    if (!players || players.length !== 4) {
      const contentDiv = document.getElementById('gameContent');
      if (contentDiv) contentDiv.innerHTML =
        '<div class="status-message">Exactly 4 players required for Raja Mantri Chor Sipahi!</div>';
      return;
    }
    let roleDeck = [...roles].sort(() => Math.random() - 0.5);
    let playerRole = '';
    players.forEach((player, idx) => {
      if (player.id === firebase.auth().currentUser.uid) playerRole = roleDeck[idx];
    });

    const contentDiv = document.getElementById('gameContent');
    if (!contentDiv) return;

    if (playerRole === 'Raja' || playerRole === 'Sipahi') {
      contentDiv.innerHTML = `
        <div class="role-card big"><h2>Your Role: ${playerRole}</h2>
        <button id="revealBtn" class="btn btn-primary">Reveal Role</button></div>
        <div id="gameStatus"></div>
      `;
      document.getElementById('revealBtn').onclick = async () => {
        const unrevealed = data.revealedPlayers || [];
        if (unrevealed.some(p => p.id === firebase.auth().currentUser.uid)) {
          alert('Already revealed!');
          return;
        }
        await db.collection('rmcs_rooms').doc(roomId).update({
          revealedPlayers: firebase.firestore.FieldValue.arrayUnion({ id: firebase.auth().currentUser.uid, role: playerRole })
        });
      };
    } else {
      contentDiv.innerHTML = `
        <div class="role-card big"><h2>Your Role: ${playerRole}</h2>
        <p>Wait for Raja and Sipahi to reveal their roles.</p></div>
        <div id="gameStatus"></div>
      `;
    }

    db.collection('rmcs_rooms').doc(roomId).onSnapshot(doc => {
      const snapshotData = doc.data();
      if (!snapshotData) return;
      const revealed = snapshotData.revealedPlayers || [];
      if (revealed.length >= 2) {
        const revealedText = revealed.map(r => `${r.role}`).join(', ');
        const statusDiv = document.getElementById('gameStatus');
        if (statusDiv) statusDiv.innerText = `Revealed: ${revealedText}. Sipahi, guess the thief!`;
        guessUI(contentDiv, snapshotData);
      }
    });
  }

  function guessUI(container, GameData) {
    if (!container) return;
    container.innerHTML += `
      <input id="guessInput" placeholder="Enter thief name" class="input-field" />
      <button id="guessBtn" class="btn btn-success">Guess</button>
      <div id="guessResult"></div>
    `;
    document.getElementById('guessBtn').onclick = async () => {
      const guess = document.getElementById('guessInput').value.trim();
      if (!guess) return alert('Enter a name to guess!');
      const thiefPlayer = GameData.players.find(player => {
        const revealer = (GameData.revealedPlayers || []).find(r => r.id === player.id);
        return revealer && revealer.role === 'Chor';
      });
      const resultDiv = document.getElementById('guessResult');
      if (resultDiv) {
        if (thiefPlayer && guess === thiefPlayer.name) {
          resultDiv.innerText = 'Correct! You caught the thief.';
        } else {
          resultDiv.innerText = 'Wrong! The thief gets away.';
        }
      }
    };
  }
});
