document.addEventListener("DOMContentLoaded", function() {
  // Navigation references
  const mainMenu = document.getElementById('mainMenu');
  const createScreen = document.getElementById('createScreen');
  const joinScreen = document.getElementById('joinScreen');
  const gameScreen = document.getElementById('gameScreen');
  const playersList = document.getElementById('playersList');
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn = document.getElementById('startGameBtn');
  const exitLobbyBtn = document.getElementById('exitLobbyBtn');
  const gameTable = document.querySelector('.game-table .table');

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

  // --- Game page logic ---
  function showGame(roomCode) {
    showScreen(gameScreen);
    currentRoomCode.innerHTML = roomCode;
    startGameBtn.disabled = true;

    // Listen for changes and update UI
    db.collection('rmcs_rooms').doc(roomCode)
      .onSnapshot(doc => {
        const data = doc.data();
        if (!data) return;

        // Update player list
        playersList.innerHTML = data.players.map(p => `<li>${p.name}</li>`).join('');

        // Update avatar table
        gameTable.innerHTML = '';
        const angleStep = 360 / data.players.length;
        data.players.forEach((p, i) => {
          const angle = i * angleStep;
          const x = 150 + 120 * Math.cos(angle * Math.PI / 180);
          const y = 150 + 120 * Math.sin(angle * Math.PI / 180);
          const avatar = document.createElement('div');
          avatar.className = 'avatar';
          avatar.style.left = `${x - 30}px`;
          avatar.style.top = `${y - 30}px`;
          avatar.innerHTML = '👤';
          const name = document.createElement('div');
          name.className = 'avatar-name';
          name.innerText = p.name;
          avatar.appendChild(name);
          gameTable.appendChild(avatar);
        });

        // Update start button state
        startGameBtn.disabled = data.players.length !== 4;
      });
  }

  // Start the game, check enough players
  startGameBtn.onclick = async () => {
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
  };

  // Exit lobby
  exitLobbyBtn.onclick = () => {
    showScreen(mainMenu);
  };
});
