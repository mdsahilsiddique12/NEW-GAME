document.addEventListener("DOMContentLoaded", function () {
  // --- DOM Elements & Firebase Initialization ---
  const mainMenu       = document.getElementById('mainMenu');
  const createScreen   = document.getElementById('createScreen');
  const joinScreen     = document.getElementById('joinScreen');
  const gameScreen     = document.getElementById('gameScreen');

  // Lobby side panel
  const playersListEl  = document.getElementById('playersList');
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn   = document.getElementById('startGameBtn');
  const exitLobbyBtn   = document.getElementById('exitLobbyBtn');
  const cancelRoomBtn  = document.getElementById('cancelRoomBtn');

  // Game table & dynamic content
  const gameTable      = document.querySelector('.game-table');
  const gameContent    = document.getElementById('gameContent');

  // Scoreboard
  const scoreboardEl   = document.getElementById('scoreboard');
  const scoreListEl    = document.getElementById('scoreList');

  // Message modal
  const messageBox     = document.getElementById('messageBox');
  const messageBoxTitle = document.getElementById('messageBoxTitle');
  const messageBoxBody  = document.getElementById('messageBoxBody');
  const messageBoxClose = document.getElementById('messageBoxClose');

  // Firebase Functions SDK (leave backend unchanged)
  const functions = (typeof firebase !== 'undefined' && firebase.functions)
    ? firebase.functions()
    : { httpsCallable: () => () => { throw new Error("Firebase Functions SDK not loaded!"); } };

  // --- State variables ---
  let unsubscribe = null;
  let roomId = '';
  let playerName = '';

  // Convenience: returns current user id or null
  function selfUid() {
    return (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser)
      ? firebase.auth().currentUser.uid
      : null;
  }

  // --- Screen Navigation ---
  function showScreen(show) {
    const screens = [mainMenu, createScreen, joinScreen, gameScreen].filter(Boolean);
    screens.forEach(screen => screen.classList.remove('active-screen'));
    if (show) show.classList.add('active-screen');
  }

  const createBtn = document.querySelector('.create-btn');
  const joinBtn   = document.querySelector('.join-btn');
  if (createBtn) createBtn.onclick = () => showScreen(createScreen);
  if (joinBtn)   joinBtn.onclick   = () => showScreen(joinScreen);
  [...document.querySelectorAll('.back-btn')].forEach(btn => {
    btn.onclick = () => showScreen(mainMenu);
  });

  // --- Messages / Toast-like modal ---
  function showMessage(title, body, onConfirm = null) {
    if (!messageBox || !messageBoxTitle || !messageBoxBody || !messageBoxClose) {
      alert(`${title}: ${body}`);
      if (onConfirm) onConfirm();
      return;
    }

    messageBoxTitle.textContent = title;
    messageBoxBody.textContent  = body;
    messageBox.classList.remove('hidden');

    messageBoxClose.onclick = () => {
      messageBox.classList.add('hidden');
      if (onConfirm) onConfirm();
    };
  }

  // --- Room code UI + Copy ---
  function renderRoomCode(code) {
    if (!currentRoomCode) return;
    currentRoomCode.innerHTML = `
      <div class="room-code-display-inner">
        <span class="font-mono font-bold tracking-widest text-xl">${code}</span>
        <button id="copyRoomCodeBtn" class="copy-btn px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition">
          Copy
        </button>
      </div>
    `;
    const copyBtn = document.getElementById('copyRoomCodeBtn');
    if (!copyBtn) return;

    copyBtn.onclick = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code)
          .then(() => showMessage('Copied!', 'Room code copied to clipboard.'))
          .catch(err => {
            console.error('Could not copy text: ', err);
            alert('Failed to copy. Please manually copy the code.');
          });
      } else {
        const tempInput = document.createElement("input");
        document.body.appendChild(tempInput);
        tempInput.value = code;
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showMessage('Copied!', 'Room code copied to clipboard.');
      }
    };
  }

  // --- Client-side role assignment (unchanged semantics) ---
  function assignRoles(players) {
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return shuffled.map((player, index) => ({
      id:   player.id,
      name: player.name,
      role: roles[index]
    }));
  }

  // --- Circular Avatars Table ---
  function renderAvatarsTable(players, selfId) {
    if (!gameTable) return; // Important: prevents TypeError on null

    // Clear dynamic game content; show table background
    if (gameContent) {
      gameContent.innerHTML = '';
      gameContent.style.display = 'none';
    }
    const tableEl = gameTable.querySelector('.table');
    if (tableEl) tableEl.style.display = 'block';

    // Wipe previous avatars safely
    [...gameTable.querySelectorAll('.avatar')].forEach(el => el.remove());

    const N = players.length;
    if (N === 0) return;

    const radius = 110;
    const cx = 150;
    const cy = 150;
    const selfIndex = players.findIndex(p => p.id === selfId);

    for (let i = 0; i < N; ++i) {
      const logicalIndex = (i - selfIndex + N) % N;
      const angle = Math.PI * 1.5 + (2 * Math.PI * logicalIndex) / N; // self at bottom
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      const avatar = document.createElement('div');
      avatar.className = 'avatar shadow-md rounded-full border-4 border-white';
      avatar.style.left = (x - 30) + 'px';
      avatar.style.top  = (y - 30) + 'px';

      const isSelf = players[i].id === selfId;
      avatar.classList.add(isSelf ? 'bg-indigo-500' : 'bg-slate-100');

      const avatarEmoji = isSelf ? 'YOU' : '👤';
      avatar.innerHTML = `<span class="text-2xl font-bold ${isSelf ? 'text-white' : 'text-slate-700'}">${avatarEmoji}</span>`;

      const name = document.createElement('div');
      name.className = 'avatar-name text-xs font-semibold mt-1';
      name.textContent = players[i].name + (isSelf ? ' (You)' : '');
      avatar.appendChild(name);

      gameTable.appendChild(avatar);
    }
  }

  // --- Lobby Players List ---
  function renderPlayersList(players) {
    if (!playersListEl) return;
    const uid = selfUid();
    playersListEl.innerHTML = players.map(p => `
      <div class="flex items-center gap-2 mb-1 px-2 py-1 rounded-lg bg-slate-800/60 text-slate-50">
        <span class="text-xl">${p.id === uid ? '⭐' : '🔸'}</span>
        <span class="font-semibold truncate max-w-[150px]">${p.name}</span>
      </div>
    `).join('');
  }

  // --- Scoreboard UI ---
  function renderScoreboard(scores, players) {
    if (!scoreListEl || !scoreboardEl) return;

    scoreboardEl.style.display = 'block';

    const scoreData = players
      .map(p => ({ name: p.name, score: scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);

    scoreListEl.innerHTML = scoreData.map(p => `
      <div class="flex justify-between items-center py-1 border-b border-slate-200 last:border-b-0">
        <span class="truncate max-w-[140px]">${p.name}</span>
        <span class="font-extrabold text-indigo-600">${p.score}</span>
      </div>
    `).join('');
  }

  // --- Create Room ---
  const createRoomBtn = document.getElementById('createRoomFinal');
  if (createRoomBtn) {
    createRoomBtn.onclick = async () => {
      playerName = (document.getElementById('createPlayerName')?.value || '').trim();
      let customRoomCode = (document.getElementById('createRoomCode')?.value || '').trim().toUpperCase();
      const errorEl = document.getElementById('createRoomError');
      if (errorEl) errorEl.innerText = '';

      if (!playerName) {
        if (errorEl) errorEl.innerText = "Enter your name.";
        return;
      }
      if (customRoomCode && (customRoomCode.length < 4 || !/^[A-Z0-9]{4,8}$/.test(customRoomCode))) {
        if (errorEl) errorEl.innerText = "Room code must be 4-8 uppercase letters or numbers.";
        return;
      }

      if (!customRoomCode) {
        customRoomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
      }

      const ref = db.collection('rmcs_rooms').doc(customRoomCode);

      try {
        const docSnapshot = await ref.get();
        if (docSnapshot.exists) {
          if (errorEl) errorEl.innerText = "Room code already exists. Try a new code!";
          return;
        }

        firebase.auth().onAuthStateChanged(async user => {
          if (!user) {
            try {
              const anonUser = await firebase.auth().signInAnonymously();
              user = anonUser.user;
            } catch (e) {
              if (errorEl) errorEl.innerText = "Authentication error: " + e.message;
              return;
            }
          }

          const initialScores = { [user.uid]: 0 };

          await ref.set({
            host: user.uid,
            players: [{ name: playerName, id: user.uid }],
            phase: 'lobby',
            scores: initialScores,
            created: firebase.firestore.FieldValue.serverTimestamp()
          });

          roomId = customRoomCode;
          listenToRoom(roomId);
          showScreen(gameScreen);
        });

      } catch (e) {
        console.error("Error creating room:", e);
        if (errorEl) errorEl.innerText = "An error occurred: " + e.message;
      }
    };
  }

  // --- Join Room ---
  const joinRoomBtn = document.getElementById('joinRoomFinal');
  if (joinRoomBtn) {
    joinRoomBtn.onclick = async () => {
      playerName = (document.getElementById('joinPlayerName')?.value || '').trim();
      const code = (document.getElementById('joinRoomCode')?.value || '').trim().toUpperCase();
      const errorEl = document.getElementById('joinRoomError');
      if (errorEl) errorEl.innerText = '';

      if (!playerName || !code) {
        if (errorEl) errorEl.innerText = "Enter both a name and room code.";
        return;
      }

      const ref = db.collection('rmcs_rooms').doc(code);

      try {
        const doc = await ref.get();
        if (!doc.exists) {
          if (errorEl) errorEl.innerText = "Room not found!";
          return;
        }

        const data = doc.data();
        if (data.phase !== 'lobby') {
          if (errorEl) errorEl.innerText = "The game has already started in this room.";
          return;
        }
        if (data.players.length >= 4) {
          if (errorEl) errorEl.innerText = "Room is full (max 4 players).";
          return;
        }

        firebase.auth().onAuthStateChanged(async user => {
          if (!user) {
            try {
              const anonUser = await firebase.auth().signInAnonymously();
              user = anonUser.user;
            } catch (e) {
              if (errorEl) errorEl.innerText = "Authentication error: " + e.message;
              return;
            }
          }

          const playerWithSameName = data.players.find(p => p.name === playerName);
          if (playerWithSameName && playerWithSameName.id !== user.uid) {
            if (errorEl) errorEl.innerText = "A different player with this name is already in the room. Choose another name.";
            return;
          }

          const isRejoining = data.players.some(p => p.id === user.uid);

          if (!isRejoining) {
            await ref.update({
              players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, id: user.uid }),
              [`scores.${user.uid}`]: 0
            });
          } else {
            const updatedPlayers = data.players.map(p =>
              p.id === user.uid ? { name: playerName, id: user.uid } : p
            );
            await ref.update({ players: updatedPlayers });
          }

          roomId = code;
          listenToRoom(roomId);
          showScreen(gameScreen);
        });

      } catch (e) {
        console.error("Error joining room:", e);
        if (errorEl) errorEl.innerText = "An error occurred: " + e.message;
      }
    };
  }

  // --- Listen & Drive UI by Room State ---
  function listenToRoom(roomCode) {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);

    unsubscribe = roomRef.onSnapshot(doc => {
      const data = doc.data();
      const selfId = selfUid();

      if (!data || !doc.exists) {
        showMessage("Room Ended", "The room was deleted by the host or no longer exists.", () => {
          showScreen(mainMenu);
        });
        roomId = '';
        return;
      }

      const players = data.players || [];
      const scores  = data.scores || {};

      if (!players.some(p => p.id === selfId)) {
        showMessage("Kicked/Left", "You have been removed from the room.", () => showScreen(mainMenu));
        if (unsubscribe) unsubscribe();
        roomId = '';
        return;
      }

      renderRoomCode(roomCode);
      renderPlayersList(players);
      renderScoreboard(scores, players);

      const isHost = selfId === data.host;

      // Cancel Room button (host only)
      if (cancelRoomBtn) {
        cancelRoomBtn.style.display = isHost ? 'inline-flex' : 'none';
        cancelRoomBtn.onclick = isHost ? handleCancelRoom : null;
      }

      if (data.phase === "lobby") {
        // Lobby UI
        if (gameContent) {
          gameContent.innerHTML = '';
          gameContent.style.display = 'none';
        }
        const tableEl = gameTable ? gameTable.querySelector('.table') : null;
        if (tableEl) tableEl.style.display = 'block';

        renderAvatarsTable(players, selfId);

        if (startGameBtn) {
          startGameBtn.style.display = 'inline-flex';
          startGameBtn.disabled = !(isHost && players.length === 4);
          startGameBtn.textContent = (players.length === 4)
            ? 'Start Game'
            : `Waiting for ${4 - players.length} player(s) (Need 4)`;

          startGameBtn.onclick = async () => {
            if (!(isHost && players.length === 4)) return;
            try {
              startGameBtn.textContent = 'Starting...';
              const roles = assignRoles(players);
              await roomRef.update({
                phase: 'reveal',
                playerRoles: roles,
                revealed: [],
                scoreUpdated: false
              });
            } catch (error) {
              console.error("Error starting game:", error);
              showMessage("Error Starting Game", error.message);
              startGameBtn.textContent = 'Start Game';
            }
          };
        }

      } else {
        // In-game phases: hide table, show dynamic content
        const tableEl = gameTable ? gameTable.querySelector('.table') : null;
        if (tableEl) tableEl.style.display = 'none';
        if (startGameBtn) startGameBtn.style.display = 'none';
        if (gameContent) gameContent.style.display = 'flex';

        if (data.phase === 'reveal') {
          showRoleRevealScreen(players, selfId, data.playerRoles, data.revealed || []);
        } else if (data.phase === 'guess') {
          showSipahiGuessUI(data.playerRoles, selfId, roomCode);
        } else if (data.phase === "roundResult") {
          showRoundResult(data, selfId, roomCode, isHost);
        }
      }
    });
  }

  // --- Role Reveal Screen ---
  function showRoleRevealScreen(players, selfId, playerRoles, revealed) {
    if (!gameContent) return;

    const p = (playerRoles || []).find(p => p.id === selfId);
    if (!p) return;

    const isRajaSipahi = (p.role === 'Raja' || p.role === 'Sipahi');
    const alreadyRevealed = (revealed || []).some(r => r.id === selfId);

    const rajaRevealed   = (revealed || []).some(r => r.role === 'Raja');
    const sipahiRevealed = (revealed || []).some(r => r.role === 'Sipahi');

    if (rajaRevealed && sipahiRevealed && p.role === 'Raja') {
      db.collection('rmcs_rooms').doc(roomId).update({
        phase: 'guess',
        revealed: []
      });
      return;
    }

    const revealedRoles = (playerRoles || []).filter(pr =>
      (revealed || []).some(r => r.id === pr.id)
    );
    const revealedHtml = revealedRoles.map(r => `
      <div class="text-center bg-gray-50 p-3 rounded-lg shadow-sm min-w-[80px]">
        <div class="text-3xl">
          ${r.role === 'Raja' ? "👑" : r.role === 'Sipahi' ? "🛡️" : ""}
        </div>
        <div class="text-xs font-semibold text-gray-700 mt-1">${r.name}</div>
      </div>
    `).join('');

    const selfRole = p.role;
    const roleEmoji =
      selfRole === 'Raja'  ? '👑' :
      selfRole === 'Mantri'? '🧠' :
      selfRole === 'Chor'  ? '🔪' : '🛡️';

    const revealBtnHtml = (isRajaSipahi && !alreadyRevealed)
      ? '<button id="revealBtn" class="mt-4 px-6 py-2 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-colors shadow-lg">Reveal Role</button>'
      : '';

    const infoHtml = !isRajaSipahi
      ? `<div class="mt-4 bg-gray-200 text-gray-700 text-md p-3 rounded-xl text-center font-semibold">
           Your role is secret (${selfRole}). Wait for Raja (👑) and Sipahi (🛡️) to reveal.
         </div>`
      : (alreadyRevealed
          ? '<div class="mt-4 text-green-700 font-bold bg-green-50 p-2 rounded-lg">Role revealed! Waiting for others...</div>'
          : '');

    const revealedContainer = revealedHtml
      ? `<h4 class="text-lg font-semibold mt-6 text-gray-800">Revealed Roles:</h4>
         <div class="flex gap-4 justify-center p-4 bg-yellow-50 rounded-xl shadow-inner mt-2">${revealedHtml}</div>`
      : '<div class="mt-6 text-gray-500">No roles have been revealed yet.</div>';

    gameContent.innerHTML = `
      <div class="flex flex-col items-center mt-4 p-4 w-full">
        <div class="role-card paper-unfold bg-white shadow-xl p-6 rounded-2xl text-2xl text-center border-4 border-indigo-300 w-full max-w-sm">
          <p class="text-gray-600 text-xl">Your Role is:</p>
          <b class="text-indigo-700 text-4xl">${selfRole} ${roleEmoji}</b>
          ${revealBtnHtml}
        </div>
        ${infoHtml}
        ${revealedContainer}
      </div>
    `;

    const revealBtn = document.getElementById('revealBtn');
    if (isRajaSipahi && !alreadyRevealed && revealBtn) {
      revealBtn.onclick = () => {
        db.collection('rmcs_rooms').doc(roomId).update({
          revealed: firebase.firestore.FieldValue.arrayUnion({
            id: selfId, role: p.role, name: p.name
          })
        });
      };
    }
  }

  // --- Sipahi Guess UI ---
  function showSipahiGuessUI(playerRoles, selfId, roomCode) {
    if (!gameContent) return;

    const p = (playerRoles || []).find(p => p.id === selfId);
    let targets = (playerRoles || []).filter(pr => pr.role !== 'Raja' && pr.role !== 'Sipahi');
    targets = targets.sort(() => Math.random() - 0.5);

    let timer = 60;
    let timerId = null;

    if (!p || p.role !== 'Sipahi') {
      gameContent.innerHTML = `
        <div class="text-center mt-12 text-xl font-semibold text-white bg-indigo-700 p-4 rounded-xl shadow-2xl animate-fade-in">
          The Sipahi (🛡️) is currently making their guess. Please wait...
        </div>
      `;
      return;
    }

    function timerFormat(t) {
      const m = String(Math.floor(t / 60)).padStart(2, "0");
      const s = String(t % 60).padStart(2, "0");
      return `${m}:${s}`;
    }

    function render() {
      gameContent.innerHTML = `
        <div class="rounded-2xl shadow-2xl p-6 flex flex-col items-center bg-white max-w-sm mx-auto mt-6 animate-fade-in border-4 border-blue-500">
          <h3 class="mb-2 text-3xl font-extrabold text-blue-700">Guess the Chor! 🔪</h3>
          <div id="timer" class="mb-4 text-2xl font-mono text-red-700 bg-red-100 p-2 rounded">
            Time Left: ${timerFormat(timer)}
          </div>
          <p class="text-sm text-gray-600 mb-4 font-semibold">
            Choose one player (either Mantri or Chor):
          </p>
          <div class="flex flex-col gap-3 mb-2 w-full">
            ${targets.map(t => `
              <button class="guess-btn w-full bg-blue-500 text-white hover:bg-blue-600 rounded-xl px-5 py-3 text-xl font-bold transition-all" data-id="${t.id}">
                ${t.name}
              </button>
            `).join('')}
          </div>
          <div id="guessResult" class="mt-2 font-bold text-green-700"></div>
        </div>
      `;

      const guessButtons = gameContent.querySelectorAll('.guess-btn');
      guessButtons.forEach(button => {
        const t = targets.find(target => target.id === button.dataset.id);
        if (!t) return;
        button.onclick = async () => {
          gameContent.querySelectorAll('.guess-btn').forEach(btn => { btn.disabled = true; });
          clearInterval(timerId);
          const isChor = t.role === 'Chor';
          await db.collection('rmcs_rooms').doc(roomCode).update({
            phase: 'roundResult',
            guess: {
              sipahi: p.id,
              guessed: t.id,
              correct: isChor,
              sipahiName: p.name,
              guessedName: t.name
            }
          });
        };
      });
    }

    render();

    timerId = setInterval(() => {
      timer--;
      const timerEl = gameContent.querySelector('#timer');
      if (timerEl) timerEl.textContent = `Time Left: ${timerFormat(timer)}`;
      if (timer <= 0) {
        clearInterval(timerId);
        db.collection('rmcs_rooms').doc(roomCode).update({
          phase: 'roundResult',
          guess: {
            sipahi: p.id,
            guessed: null,
            correct: false,
            sipahiName: p.name,
            guessedName: 'No Guess'
          }
        });
      }
    }, 1000);
  }

  // --- Round Result + Next Round ---
  function showRoundResult(data, selfId, roomCode, isHost) {
    if (!gameContent) return;

    const res = data.guess;
    const playerRoles = data.playerRoles || [];
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);

    const isCorrect = res && res.correct;

    let message, emoji;
    if (!res || res.guessedName === 'No Guess') {
      message = "Time ran out! The Chor escapes!";
      emoji = "⏰";
    } else if (isCorrect) {
      message = `Success! The Sipahi (${res.sipahiName}) caught the Chor!`;
      emoji = "🎉";
    } else {
      message = `Wrong Guess! The Sipahi (${res.sipahiName}) accused ${res.guessedName}, but the Chor escapes!`;
      emoji = "😥";
    }

    const chor   = playerRoles.find(p => p.role === 'Chor');
    const mantri = playerRoles.find(p => p.role === 'Mantri');
    const raja   = playerRoles.find(p => p.role === 'Raja');
    const sipahi = playerRoles.find(p => p.role === 'Sipahi');

    const updateScoresFn = functions.httpsCallable('updateScores');
    if (!data.scoreUpdated) {
      updateScoresFn({ roomId: roomCode, isCorrect })
        .catch(error => console.error("Error updating scores:", error));
      roomRef.update({ scoreUpdated: true });
    }

    const resultsHtml = `
      <div class="text-left w-full max-w-sm mt-4 p-4 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
        <h4 class="text-lg font-bold mb-2 border-b pb-1 text-gray-800">Role Summary</h4>
        <p>👑 Raja: <b>${raja?.name || '-'}</b></p>
        <p>🧠 Mantri: <b>${mantri?.name || '-'}</b></p>
        <p>🛡️ Sipahi: <b>${sipahi?.name || '-'}</b></p>
        <p>🔪 Chor: <b class="text-red-600">${chor?.name || '-'}</b></p>
      </div>
    `;

    gameContent.innerHTML = `
      <div class="flex flex-col justify-center items-center min-h-[300px] animate-fade-in p-4 w-full">
        <div class="text-8xl mb-6 animate-bounce">${emoji}</div>
        <div class="rounded-2xl shadow-xl ${isCorrect ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'} py-4 px-8 mb-6 text-2xl font-bold text-center border-4 ${isCorrect ? 'border-green-300' : 'border-red-300'}">
          ${message}
        </div>
        ${resultsHtml}
        ${
          isHost
            ? '<button class="next-round-btn giant-btn create-btn !py-3 !text-xl !w-full !max-w-xs mt-5">Start New Round</button>'
            : '<div class="mt-5 text-white font-semibold bg-gray-700 p-3 rounded-xl shadow-md">Waiting for host to start the next round...</div>'
        }
      </div>
    `;

    if (isHost) {
      const nextRoundBtn = gameContent.querySelector('.next-round-btn');
      if (nextRoundBtn) {
        nextRoundBtn.onclick = async () => {
          await roomRef.update({
            phase: 'lobby',
            playerRoles: [],
            revealed: [],
            guess: null,
            scoreUpdated: false
          });
        };
      }
    }
  }

  // --- Host: Cancel / Delete Room ---
  async function handleCancelRoom() {
    const confirmed = window.confirm("Are you sure you want to delete this room? This cannot be undone.");
    if (!confirmed || !roomId) return;

    const roomRef = db.collection('rmcs_rooms').doc(roomId);
    try {
      await roomRef.delete();
    } catch (e) {
      console.error("Error deleting room:", e);
      showMessage("Error", "Failed to delete room: " + e.message);
    }
  }

  // --- Exit Lobby ---
  if (exitLobbyBtn) {
    exitLobbyBtn.onclick = async () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      const selfId = selfUid();
      if (selfId && roomId) {
        const roomRef = db.collection('rmcs_rooms').doc(roomId);
        try {
          const doc = await roomRef.get();
          const data = doc.data();
          if (data) {
            if (data.host === selfId) {
              await roomRef.delete();
            } else {
              const playerToRemove = data.players.find(p => p.id === selfId);
              if (playerToRemove) {
                await roomRef.update({
                  players: firebase.firestore.FieldValue.arrayRemove(playerToRemove)
                });
              }
            }
          }
        } catch (e) {
          console.error("Error leaving room:", e);
        }
      }
      roomId = '';
      playerName = '';
      showScreen(mainMenu);
    };
  }

  // --- Initial anonymous sign-in ---
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(user => {
      if (!user) {
        firebase.auth().signInAnonymously()
          .catch(e => {
            console.error("Failed to sign in anonymously:", e);
            showMessage("Authentication Error", "Could not connect to the game server. Please refresh.");
          });
      }
    });
  } else {
    console.error("Firebase SDK not initialized correctly.");
    showMessage("System Error", "Firebase SDK is missing. Check your HTML imports.");
  }
});
