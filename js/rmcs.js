document.addEventListener("DOMContentLoaded", function() {
  // Elements
  const mainMenu = document.getElementById('mainMenu');
  const createScreen = document.getElementById('createScreen');
  const joinScreen = document.getElementById('joinScreen');
  const gameScreen = document.getElementById('gameScreen');
  const playersList = document.getElementById('playersList');
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn = document.getElementById('startGameBtn');
  const exitLobbyBtn = document.getElementById('exitLobbyBtn');
  const gameTable = document.querySelector('.game-table');
  let unsubscribe = null, roomId = '', playerName = '', roleTimer = null;

  // Navigation
  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(screen => screen.classList.remove('active-screen'));
    show.classList.add('active-screen');
  }

  document.querySelector('.create-btn').onclick = () => showScreen(createScreen);
  document.querySelector('.join-btn').onclick = () => showScreen(joinScreen);
  [...document.querySelectorAll('.back-btn')].forEach(btn => btn.onclick = () => showScreen(mainMenu));

  // Copy button & code renderer
  function renderRoomCode(code) {
    if (currentRoomCode) {
      currentRoomCode.innerHTML = `
        <span class="font-mono font-bold">${code}</span>
        <button id="copyRoomCodeBtn" class="ml-2 px-2 py-1 bg-indigo-200 text-indigo-700 rounded hover:bg-indigo-300">Copy</button>
      `;
      document.getElementById('copyRoomCodeBtn').onclick = () => {
        navigator.clipboard.writeText(code);
        alert('Copied!');
      };
    }
  }

  function assignRoles(players) {
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    let shuffled = [...roles].sort(() => Math.random() - 0.5);
    return players.map((p, i) => ({ ...p, role: shuffled[i] }));
  }

  // Round Avatars Table
  function renderAvatarsTable(players, selfId) {
    if (!gameTable) return;
    [...gameTable.querySelectorAll('.avatar')].forEach(el => el.remove());

    const N = players.length;
    const radius = 115, cx = 150, cy = 150;
    const selfIndex = players.findIndex(p => p.id === selfId);

    for (let i = 0; i < N; ++i) {
      let logicalIndex = (i - selfIndex + N) % N;
      let angle = Math.PI / 2 + (2 * Math.PI * logicalIndex) / N;
      let x = cx + radius * Math.cos(angle), y = cy - radius * Math.sin(angle);

      let avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.left = (x - 30) + 'px';
      avatar.style.top = (y - 30) + 'px';
      avatar.innerHTML = '👤';
      let name = document.createElement('div');
      name.className = 'avatar-name';
      name.textContent = players[i].name;
      avatar.appendChild(name);
      gameTable.appendChild(avatar);
    }
  }

  function renderPlayersList(players) {
    if (playersList)
      playersList.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
  }

  // --- Room Creation ---
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
    if (!customRoomCode) customRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const ref = db.collection('rmcs_rooms').doc(customRoomCode);
    const docSnapshot = await ref.get();
    if (docSnapshot.exists) {
      document.getElementById('createRoomError').innerText = "Room code already exists. Try a new code!";
      return;
    }
    firebase.auth().onAuthStateChanged(async user => {
      if (!user) { document.getElementById('createRoomError').innerText = "Authentication error."; return; }
      await ref.set({
        host: playerName,
        players: [{ name: playerName, id: user.uid }],
        phase: 'lobby',
        created: Date.now()
      });
      roomId = customRoomCode;
      listenToRoom(roomId);
      showScreen(gameScreen);
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
      listenToRoom(roomId);
      showScreen(gameScreen);
    });
  };

// --- Listen and Draw Lobby/Game Screen ---
function listenToRoom(roomCode) {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  unsubscribe = db.collection('rmcs_rooms').doc(roomCode)
    .onSnapshot(doc => {
      const data = doc.data();
      if (!data) return;
      const players = data.players || [];
      const selfId = firebase.auth().currentUser?.uid;
      renderRoomCode(roomCode);
      renderPlayersList(players);
      renderAvatarsTable(players, selfId);

      // Check if current user is host
      let isHost = players.length > 0 && selfId === players[0].id;
      // Button logic: enabled only for host, phase lobby, and 4 players
      if (startGameBtn) {
        startGameBtn.disabled = !(isHost && players.length === 4 && data.phase === 'lobby');
        // Always update handler since it might be removed by re-render
        startGameBtn.onclick = async () => {
          if (!(isHost && players.length === 4 && data.phase === 'lobby')) return;
          const roomRef = db.collection('rmcs_rooms').doc(roomId);
          const roles = assignRoles(players);
          await roomRef.update({
            phase: 'reveal',
            playerRoles: roles,
            revealed: []
          });
        };
      }

      if (data.phase === 'lobby') {
        document.getElementById('gameContent')?.classList?.remove('hidden');
      } else if (data.phase === 'reveal') {
        document.getElementById('gameContent')?.classList?.add('hidden');
        showRoleRevealScreen(players, selfId, data.playerRoles, data.revealed || []);
      } else if (data.phase === 'guess') {
        document.getElementById('gameContent')?.classList?.add('hidden');
        showSipahiGuessUI(data.playerRoles, selfId);
      }
    });
}


  // --- Start Game (host only) ---
  startGameBtn.onclick = async () => {
    const roomRef = db.collection('rmcs_rooms').doc(roomId);
    const docSnap = await roomRef.get();
    const data = docSnap.data();
    if (!data || !data.players || data.players.length !== 4) return alert('Need exactly 4 players!');
    const roles = assignRoles(data.players);
    await roomRef.update({
      phase: 'reveal',
      playerRoles: roles,
      revealed: []
    });
  };

  // --- Role Reveal Flow ---
  function showRoleRevealScreen(players, selfId, playerRoles, revealed) {
    const p = (playerRoles || []).find(p => p.id === selfId);
    const isRajaSipahi = p && (p.role === 'Raja' || p.role === 'Sipahi');
    const alreadyRevealed = (revealed || []).some(r => r.id === selfId);
    const container = document.querySelector('.game-table');
    if (!container) return;
    container.innerHTML = `
      <div class="flex flex-col items-center mt-6">
        <div class="role-card bg-white shadow-lg p-6 rounded-2xl text-2xl">${p ? "Your Role:" : ""} <b>${p ? p.role : ''}</b>
          ${isRajaSipahi && !alreadyRevealed ? '<button id="revealBtn" class="mt-4 px-4 py-2 bg-indigo-500 text-white rounded-full">Reveal</button>' : ''}
        </div>
        ${(!isRajaSipahi) ? `<div class="mt-4 bg-gray-200 text-gray-600 text-md p-3 rounded-xl">Your role is secret.<br>Wait for Raja and Sipahi to reveal.</div>` : ''}
      </div>
    `;
    if (isRajaSipahi && !alreadyRevealed) {
      document.getElementById('revealBtn').onclick = () => {
        db.collection('rmcs_rooms').doc(roomId).update({
          revealed: firebase.firestore.FieldValue.arrayUnion({id: selfId, role: p.role})
        });
      };
    }

    // When both revealed, transition to guess phase if Sipahi.
    if (revealed.filter(r => r.role === 'Raja' || r.role === 'Sipahi').length === 2) {
      setTimeout(() => {
        db.collection('rmcs_rooms').doc(roomId).update({
          phase: 'guess'
        });
      }, 1000);
    }
  }

  // --- Sipahi Guess UI ---
  function showSipahiGuessUI(playerRoles, selfId) {
    const p = (playerRoles || []).find(p => p.id === selfId);
    if (!p || p.role !== 'Sipahi') return;
    const targets = playerRoles.filter(pr => pr.role !== 'Sipahi');
    let timer = 90;
    let timerId;
    const container = document.querySelector('.game-table');
    function render() {
      container.innerHTML = `
        <div class="rounded-2xl shadow-lg p-6 flex flex-col items-center bg-white max-w-xs mx-auto mt-6">
          <h3 class="mb-2 text-lg font-bold text-blue-700">Guess the Chor</h3>
          <div id="timer" class="mb-3 text-lg font-mono text-red-700">${timerFormat(timer)}</div>
          <div class="flex flex-col gap-3 mb-2">
            ${targets.map(t => `<button class="bg-blue-200 hover:bg-blue-400 rounded-xl px-5 py-3 text-lg font-semibold" data-id="${t.id}">${t.name}</button>`).join('')}
          </div>
          <div id="guessResult" class="mt-2 font-bold text-green-700"></div>
        </div>
      `;
      targets.forEach(t => {
        container.querySelector(`button[data-id="${t.id}"]`).onclick = () => {
          let isChor = t.role === 'Chor';
          container.querySelector('#guessResult').textContent = isChor ? "Correct! 🎉" : "Wrong guess!";
          clearInterval(timerId);
        };
      });
    }
    function timerFormat(t) {
      const m = String(Math.floor(t / 60)).padStart(2, "0");
      const s = String(t % 60).padStart(2, "0");
      return `${m}:${s}`;
    }
    render();
    timerId = setInterval(() => {
      timer--;
      const timerEl = container.querySelector('#timer');
      if (timerEl) timerEl.textContent = timerFormat(timer);
      if (timer <= 0) {
        clearInterval(timerId);
        container.querySelector('#guessResult').textContent = "Time's up!";
      }
    }, 1000);
  }

  // --- Exit Lobby ---
  if (exitLobbyBtn) exitLobbyBtn.onclick = () => {
    showScreen(mainMenu);
    if (unsubscribe) unsubscribe();
  };
});
