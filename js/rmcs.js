document.addEventListener("DOMContentLoaded", function() {
  const mainMenu = document.getElementById('mainMenu');
  const createScreen = document.getElementById('createScreen');
  const joinScreen = document.getElementById('joinScreen');
  const gameScreen = document.getElementById('gameScreen');
  const playersList = document.getElementById('playersList');
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn = document.getElementById('startGameBtn');
  const exitLobbyBtn = document.getElementById('exitLobbyBtn');
  const gameTable = document.querySelector('.game-table');
  let unsubscribe = null, roomId = '', playerName = '';

  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(screen => screen.classList.remove('active-screen'));
    show.classList.add('active-screen');
  }
  document.querySelector('.create-btn').onclick = () => showScreen(createScreen);
  document.querySelector('.join-btn').onclick = () => showScreen(joinScreen);
  [...document.querySelectorAll('.back-btn')].forEach(btn => btn.onclick = () => showScreen(mainMenu));

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
  function renderAvatarsTable(players, selfId) {
    if (!gameTable) return;
    [...gameTable.querySelectorAll('.avatar')].forEach(el => el.remove());
    const N = players.length;
    if (N === 0) return;

    const radius = window.innerWidth < 700 ? 90 : 150, cx = 150, cy = 150;
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
      document.getElementById('createRoomError').innerText = "Enter your name."; return;
    }
    if (customRoomCode && (customRoomCode.length < 4 || !/^[A-Z0-9]{4,8}$/.test(customRoomCode))) {
      document.getElementById('createRoomError').innerText = "Room code: 4-8 letters/numbers."; return;
    }
    if (!customRoomCode) customRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const ref = db.collection('rmcs_rooms').doc(customRoomCode);
    const docSnapshot = await ref.get();
    if (docSnapshot.exists) {
      document.getElementById('createRoomError').innerText = "Room code already exists. Try a new code!"; return;
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
      document.getElementById('joinRoomError').innerText = "Enter both a name and room code."; return;
    }
    const ref = db.collection('rmcs_rooms').doc(code);
    const doc = await ref.get();
    if (!doc.exists) {
      document.getElementById('joinRoomError').innerText = "Room not found!"; return;
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
        if (data.phase === "completed") return; // All rounds done

        renderRoomCode(roomCode);
        renderPlayersList(players);
        if (data.phase === "lobby") renderAvatarsTable(players, selfId);

        // Check if current user is host
        let isHost = players.length > 0 && selfId === players[0].id;
        if (startGameBtn) {
          startGameBtn.disabled = !(isHost && players.length === 4 && data.phase === 'lobby');
          // Bind the click handler every time
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
          if(gameTable) gameTable.innerHTML = '';
          document.getElementById('gameContent')?.classList?.add('hidden');
          showRoleRevealScreen(players, selfId, data.playerRoles, data.revealed || []);
        } else if (data.phase === 'guess') {
          if(gameTable) gameTable.innerHTML = '';
          document.getElementById('gameContent')?.classList?.add('hidden');
          showSipahiGuessUI(data.playerRoles, selfId, roomCode);
        } else if (data.phase === "roundResult") {
          if(gameTable) gameTable.innerHTML = '';
          showRoundResult(data, selfId, roomCode);
        }
      });
  }

  // --- Role Reveal Flow ---
  function showRoleRevealScreen(players, selfId, playerRoles, revealed) {
    if (gameTable) gameTable.innerHTML = '';
    const p = (playerRoles || []).find(p => p.id === selfId);
    const isRajaSipahi = p && (p.role === 'Raja' || p.role === 'Sipahi');
    const alreadyRevealed = (revealed || []).some(r => r.id === selfId);
    const container = gameTable;
    if (!container) return;
    container.innerHTML = `
      <div class="flex flex-col items-center mt-8">
        <div class="role-card paper-unfold bg-white shadow-lg p-6 rounded-2xl text-2xl">${p ? "Your Role:" : ""} <b>${p ? p.role : ''}</b>
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

    // Show Raja & Sipahi avatars in straight line after reveal
    if (revealed.filter(r => r.role === "Raja" || r.role === "Sipahi").length) {
      setTimeout(() => showRevealedAvatars(playerRoles, revealed), 600);
    }
    // When both revealed, move to guess phase
    if (revealed.filter(r => r.role === 'Raja' || r.role === 'Sipahi').length === 2) {
      setTimeout(() => {
        db.collection('rmcs_rooms').doc(roomId).update({ phase: 'guess' });
      }, 1200);
    }
  }

  // Straight line revealed avatars (Raja, Sipahi)
  function showRevealedAvatars(playerRoles, revealed) {
    if (!gameTable) return;
    // Only display after reveal, skip if less than 1 revealed
    let names = playerRoles.filter(pr => revealed.some(r => r.id === pr.id)).map(pr => ({name: pr.name, role: pr.role}));
    if (!names.length) return;
    gameTable.innerHTML = `<div class="flex gap-6 justify-center p-6">
    ${names.map(p => `
      <div class="text-center">
        <div class="text-5xl">${p.role === 'Raja' ? "👑" : "🛡️"}</div>
        <div class="avatar-name mt-1">${p.name}</div>
      </div>`).join('')}
    </div>`;
  }

  // --- Sipahi Guess UI ---
  function showSipahiGuessUI(playerRoles, selfId, roomCode) {
    if (gameTable) gameTable.innerHTML = '';
    const p = (playerRoles || []).find(p => p.id === selfId);
    if (!p || p.role !== 'Sipahi') return;
    // Sipahi can only see Mantri and Chor
    const targets = playerRoles.filter(pr => pr.role === 'Mantri' || pr.role === 'Chor');
    let timer = 90, timerId;
    const container = gameTable;
    function render() {
      container.innerHTML = `
        <div class="rounded-2xl shadow-2xl p-6 flex flex-col items-center bg-white max-w-xs mx-auto mt-6 animate-fade-in">
          <h3 class="mb-2 text-lg font-bold text-blue-700">Guess the Chor</h3>
          <div id="timer" class="mb-3 text-lg font-mono text-red-700">${timerFormat(timer)}</div>
          <div class="flex flex-col gap-3 mb-2 w-full">
            ${targets.map(t => `<button class="bg-blue-200 hover:bg-blue-400 rounded-xl px-5 py-3 text-lg font-semibold transition-all" data-id="${t.id}">${t.name}</button>`).join('')}
          </div>
          <div id="guessResult" class="mt-2 font-bold text-green-700"></div>
        </div>
      `;
      targets.forEach(t => {
        container.querySelector(`button[data-id="${t.id}"]`).onclick = async () => {
          let isChor = t.role === 'Chor';
          clearInterval(timerId);
          db.collection('rmcs_rooms').doc(roomCode).update({
            phase: 'roundResult',
            guess: { sipahi: p.name, guessed: t.name, correct: isChor }
          });
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
        db.collection('rmcs_rooms').doc(roomCode).update({
          phase: 'roundResult',
          guess: { sipahi: p.name, guessed: null, correct: false }
        });
      }
    }, 1000);
  }

  // --- Round Result Animation & Next Button ---
  function showRoundResult(data, selfId, roomCode) {
    if (!gameTable) return;
    // Fancy animation/message
    const res = data.guess;
    let isCorrect = res && res.correct;
    let message = isCorrect ? "Congratulations! Sipahi found the Chor!" : "Wrong Guess. The Chor escapes!";
    let emoji = isCorrect ? "🎉" : "😥";
    gameTable.innerHTML = `
      <div class="flex flex-col justify-center items-center min-h-[200px]">
        <div class="animate-bounce text-6xl mb-6">${emoji}</div>
        <div class="rounded-2xl shadow-xl bg-green-100 text-green-900 py-4 px-8 mb-6 text-2xl font-bold text-center">${message}</div>
        <button class="next-round-btn px-8 py-3 rounded-xl bg-indigo-600 text-white text-xl shadow-lg hover:bg-indigo-700 mt-5">Next Round</button>
      </div>
    `;
    gameTable.querySelector('.next-round-btn').onclick = async () => {
      const ref = db.collection('rmcs_rooms').doc(roomCode);
      const docSnap = await ref.get();
      let players = (docSnap.data() || {}).players || [];
      const roles = assignRoles(players);
      await ref.update({
        phase: 'lobby',
        playerRoles: [],
        revealed: [],
        guess: null,
        // Add additional tracking if needed
      });
    };
  }

  // --- Exit Lobby ---
  if (exitLobbyBtn) exitLobbyBtn.onclick = () => {
    showScreen(mainMenu);
    if (unsubscribe) unsubscribe();
  };
});
