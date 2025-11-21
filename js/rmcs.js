document.addEventListener("DOMContentLoaded", function () {
  // --- DOM Elements & Firebase Initialization ---
  const mainMenu       = document.getElementById('mainMenu');
  const createScreen   = document.getElementById('createScreen');
  const joinScreen     = document.getElementById('joinScreen');
  const gameScreen     = document.getElementById('gameScreen');

  // Lobby side panel & Buttons
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

  // History Modal Elements
  const historyModal = document.getElementById('historyModal');
  const openHistoryBtn = document.getElementById('openHistoryBtn');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');

  // Firebase Functions SDK
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
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(s => {
      if(s) s.classList.remove('active-screen');
      if(s) s.style.display = 'none'; // Ensure hidden
    });
    if (show) {
      show.style.display = 'flex'; // Force flex for centering
      show.classList.add('active-screen');
    }
  }

  // Button Wiring
  const createBtn = document.querySelector('.create-btn');
  const joinBtn   = document.querySelector('.join-btn');
  if (createBtn) createBtn.onclick = () => showScreen(createScreen);
  if (joinBtn)   joinBtn.onclick   = () => showScreen(joinScreen);
  
  [...document.querySelectorAll('.back-btn')].forEach(btn => {
    btn.onclick = () => showScreen(mainMenu);
  });

  // History Button Wiring
  if(openHistoryBtn) openHistoryBtn.onclick = () => {
    if(historyModal) {
        historyModal.classList.remove('hidden');
        historyModal.style.display = 'flex';
    }
  };
  
  if(closeHistoryBtn) closeHistoryBtn.onclick = () => {
    if(historyModal) {
        historyModal.classList.add('hidden');
        historyModal.style.display = 'none';
    }
  };

  // --- Custom Message Modal ---
  function showMessage(title, body, onConfirm = null) {
    if (!messageBox || !messageBoxTitle || !messageBoxBody || !messageBoxClose) {
      alert(`${title}: ${body}`);
      if (onConfirm) onConfirm();
      return;
    }

    messageBoxTitle.textContent = title;
    messageBoxBody.innerHTML    = body; // Allow HTML for formatting
    messageBox.classList.remove('hidden');
    messageBox.style.display = 'flex'; // Ensure flex layout

    messageBoxClose.onclick = () => {
      messageBox.classList.add('hidden');
      messageBox.style.display = 'none';
      if (onConfirm) onConfirm();
    };
  }

  // --- Room code UI + Copy ---
  function renderRoomCode(code) {
    if (!currentRoomCode) return;
    currentRoomCode.innerHTML = `
      <div class="flex justify-between items-center w-full">
        <span class="font-cyber text-neon-green text-2xl tracking-widest drop-shadow-md">${code}</span>
        <button id="copyRoomCodeBtn" class="ml-4 text-xs font-bold text-gray-400 border border-gray-600 px-2 py-1 rounded hover:text-white hover:border-white transition uppercase">
          COPY DATA
        </button>
      </div>
    `;
    const copyBtn = document.getElementById('copyRoomCodeBtn');
    if (!copyBtn) return;

    copyBtn.onclick = () => {
      navigator.clipboard.writeText(code)
        .then(() => showMessage('SYSTEM', 'Room code copied to clipboard.'))
        .catch(() => alert('Failed to copy.'));
    };
  }

  // --- Circular Avatars Table (NEON EDITION) ---
  function renderAvatarsTable(players, selfId) {
    if (!gameTable) return; 

    // If we are in lobby, hide dynamic content overlay
    if (gameContent) {
      gameContent.innerHTML = '';
      gameContent.style.display = 'none';
    }
    const tableEl = gameTable.querySelector('.table');
    if (tableEl) tableEl.style.display = 'block';

    // Clear old avatars
    [...gameTable.querySelectorAll('.avatar')].forEach(el => el.remove());

    const N = players.length;
    if (N === 0) return;

    const radius = 130; // Slightly larger for 3D effect
    const cx = 160;     // Center X (half of 320px width)
    const cy = 160;     // Center Y

    const selfIndex = players.findIndex(p => p.id === selfId);

    for (let i = 0; i < N; ++i) {
      const logicalIndex = (i - selfIndex + N) % N;
      const angle = Math.PI * 1.5 + (2 * Math.PI * logicalIndex) / N; 
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      // Adjust for avatar size (70px) -> 35px offset
      avatar.style.left = (x - 35) + 'px';
      avatar.style.top  = (y - 35) + 'px';

      const isSelf = players[i].id === selfId;
      
      // Neon Styling based on self/other
      if(isSelf) {
        avatar.style.borderColor = 'var(--neon-green)';
        avatar.style.boxShadow = '0 0 20px var(--neon-green)';
      } else {
        avatar.style.borderColor = 'var(--neon-blue)';
      }

      const avatarEmoji = isSelf ? 'YOU' : '👤';
      avatar.innerHTML = `<span class="text-3xl drop-shadow-md">${avatarEmoji}</span>`;

      const name = document.createElement('div');
      name.className = 'avatar-name';
      name.textContent = players[i].name;
      if(isSelf) name.style.color = 'var(--neon-green)';
      
      avatar.appendChild(name);
      gameTable.appendChild(avatar);
    }
  }

  // --- Lobby Players List (Footer) ---
  function renderPlayersList(players) {
    if (!playersListEl) return;
    const uid = selfUid();
    playersListEl.innerHTML = players.map(p => `
      <div class="flex items-center gap-2 px-3 py-1 border border-gray-700 bg-gray-900/50 rounded text-gray-300 text-xs uppercase font-bold">
        <span class="${p.id === uid ? 'text-neon-green' : 'text-neon-blue'} text-lg">●</span>
        <span>${p.name}</span>
      </div>
    `).join('');
  }

  // --- Scoreboard UI (Cyber Style) ---
  function renderScoreboard(scores, players) {
    if (!scoreListEl || !scoreboardEl) return;

    scoreboardEl.style.display = 'block';

    const scoreData = players
      .map(p => ({ name: p.name, score: scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);

    scoreListEl.innerHTML = scoreData.map(p => `
      <div class="flex justify-between items-center py-2 border-b border-gray-800 last:border-b-0 hover:bg-white/5 px-2 transition">
        <span class="text-neon-blue font-bold truncate max-w-[100px]">${p.name}</span>
        <span class="font-mono text-neon-pink text-lg">${p.score}</span>
      </div>
    `).join('');
  }

  // --- Render History Table ---
  function renderHistoryTable(history, players) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    if (!history || history.length === 0) {
      historyContent.innerHTML = '<p class="text-gray-500 text-center p-4">No rounds played yet.</p>';
      return;
    }

    let html = `
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="text-xs text-gray-400 border-b border-gray-700">
            <th class="p-2">R#</th>
            <th class="p-2">Raja</th>
            <th class="p-2">Mantri</th>
            <th class="p-2">Sipahi</th>
            <th class="p-2">Chor</th>
          </tr>
        </thead>
        <tbody class="text-sm font-mono text-gray-300">
    `;

    history.forEach((round, index) => {
      const getRoleName = (r) => {
        const p = round.roles.find(rp => rp.role === r);
        return p ? p.name : '-';
      };
      const getRolePoints = (r) => {
        const p = round.roles.find(rp => rp.role === r);
        return p ? round.points[p.id] : 0;
      };

      html += `
        <tr class="border-b border-gray-800 hover:bg-white/5">
          <td class="p-2 text-neon-blue font-bold">${index + 1}</td>
          <td class="p-2">
            <div class="text-yellow-300">${getRoleName('Raja')}</div>
            <div class="text-[10px] text-gray-500">+${getRolePoints('Raja')}</div>
          </td>
          <td class="p-2">
            <div class="text-fuchsia-300">${getRoleName('Mantri')}</div>
            <div class="text-[10px] text-gray-500">+${getRolePoints('Mantri')}</div>
          </td>
          <td class="p-2">
            <div class="text-cyan-300">${getRoleName('Sipahi')}</div>
            <div class="text-[10px] text-gray-500">+${getRolePoints('Sipahi')}</div>
          </td>
          <td class="p-2">
            <div class="text-rose-400">${getRoleName('Chor')}</div>
            <div class="text-[10px] text-gray-500">+${getRolePoints('Chor')}</div>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    historyContent.innerHTML = html;
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
        if (errorEl) errorEl.innerText = "IDENTITY REQUIRED.";
        return;
      }
      if (customRoomCode && (customRoomCode.length < 4 || !/^[A-Z0-9]{4,8}$/.test(customRoomCode))) {
        if (errorEl) errorEl.innerText = "INVALID CODE FORMAT.";
        return;
      }

      if (!customRoomCode) {
        customRoomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
      }

      const ref = db.collection('rmcs_rooms').doc(customRoomCode);

      try {
        const docSnapshot = await ref.get();
        if (docSnapshot.exists) {
          if (errorEl) errorEl.innerText = "CODE COLLISION DETECTED.";
          return;
        }

        firebase.auth().onAuthStateChanged(async user => {
          if (!user) {
            try {
              const anonUser = await firebase.auth().signInAnonymously();
              user = anonUser.user;
            } catch (e) {
              if (errorEl) errorEl.innerText = "AUTH FAILURE: " + e.message;
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
        if (errorEl) errorEl.innerText = "SYSTEM ERROR: " + e.message;
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
        if (errorEl) errorEl.innerText = "CREDENTIALS MISSING.";
        return;
      }

      const ref = db.collection('rmcs_rooms').doc(code);

      try {
        const doc = await ref.get();
        if (!doc.exists) {
          if (errorEl) errorEl.innerText = "ROOM NOT FOUND.";
          return;
        }

        const data = doc.data();
        if (data.phase !== 'lobby') {
          if (errorEl) errorEl.innerText = "SESSION ALREADY ACTIVE.";
          return;
        }
        if (data.players.length >= 4) {
          if (errorEl) errorEl.innerText = "SERVER FULL.";
          return;
        }

        firebase.auth().onAuthStateChanged(async user => {
          if (!user) {
            try {
              const anonUser = await firebase.auth().signInAnonymously();
              user = anonUser.user;
            } catch (e) {
              if (errorEl) errorEl.innerText = "AUTH FAILURE: " + e.message;
              return;
            }
          }

          const playerWithSameName = data.players.find(p => p.name === playerName);
          if (playerWithSameName && playerWithSameName.id !== user.uid) {
            if (errorEl) errorEl.innerText = "ALIAS ALREADY TAKEN.";
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
        if (errorEl) errorEl.innerText = "SYSTEM ERROR: " + e.message;
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
        showMessage("CONNECTION LOST", "Room terminated by host.", () => {
          showScreen(mainMenu);
        });
        roomId = '';
        return;
      }

      const players = data.players || [];
      const scores  = data.scores || {};

      if (!players.some(p => p.id === selfId)) {
        showMessage("ACCESS DENIED", "You have been removed from the session.", () => showScreen(mainMenu));
        if (unsubscribe) unsubscribe();
        roomId = '';
        return;
      }

      renderRoomCode(roomCode);
      renderPlayersList(players);
      renderScoreboard(scores, players);
      
      // Render History Table
      renderHistoryTable(data.history || [], players);

      const isHost = selfId === data.host;

      // Cancel Room button (host only)
      if (cancelRoomBtn) {
        cancelRoomBtn.style.display = isHost ? 'block' : 'none';
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
          startGameBtn.style.display = 'flex';
          startGameBtn.disabled = !(isHost && players.length === 4);
          
          if(players.length === 4) {
              startGameBtn.textContent = 'INITIATE SEQUENCE';
              startGameBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          } else {
              startGameBtn.textContent = `WAITING FOR OPERATIVES (${players.length}/4)`;
              startGameBtn.classList.add('opacity-50', 'cursor-not-allowed');
          }

          startGameBtn.onclick = async () => {
            if (!(isHost && players.length === 4)) return;
            try {
              const startFn = functions.httpsCallable('startGame');
              startGameBtn.textContent = 'INITIALIZING...';
              await startFn({ roomId: roomId });
            } catch (error) {
              console.error("Error starting game:", error);
              showMessage("ERROR", error.message);
              startGameBtn.textContent = 'INITIATE SEQUENCE';
            }
          };
        }

      } else {
        // In-game phases: Hide lobby controls
        if (startGameBtn) startGameBtn.style.display = 'none';
        
        // Show game content overlay
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

  // --- Role Reveal Screen (Cyberpunk) ---
  function showRoleRevealScreen(players, selfId, playerRoles, revealed) {
    if (!gameContent) return;

    const p = (playerRoles || []).find(p => p.id === selfId);
    if (!p) return;

    const isRajaSipahi = (p.role === 'Raja' || p.role === 'Sipahi');
    const alreadyRevealed = (revealed || []).some(r => r.id === selfId);

    const rajaRevealed   = (revealed || []).some(r => r.role === 'Raja');
    const sipahiRevealed = (revealed || []).some(r => r.role === 'Sipahi');

    // Auto-progress
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
      <div class="flex flex-col items-center bg-black/40 border border-gray-600 p-2 rounded w-20">
        <span class="text-2xl filter drop-shadow-lg">
          ${r.role === 'Raja' ? "👑" : r.role === 'Sipahi' ? "🛡️" : ""}
        </span>
        <span class="text-[10px] uppercase text-neon-blue mt-1 font-bold">${r.name}</span>
      </div>
    `).join('');

    const selfRole = p.role;
    const roleEmoji =
      selfRole === 'Raja'  ? '👑' :
      selfRole === 'Mantri'? '🧠' :
      selfRole === 'Chor'  ? '🔪' : '🛡️';

    const revealBtnHtml = (isRajaSipahi && !alreadyRevealed)
      ? `<button id="revealBtn" class="cyber-btn danger w-full mt-4">DECRYPT IDENTITY</button>`
      : '';

    const infoHtml = !isRajaSipahi
      ? `<div class="mt-4 text-neon-green text-sm font-mono border border-neon-green p-2 rounded bg-green-900/20">
           > STATUS: COVERT<br>
           > WAITING FOR SIGNAL
         </div>`
      : (alreadyRevealed
          ? '<div class="mt-4 text-neon-blue font-bold animate-pulse">IDENTITY EXPOSED</div>'
          : '');

    gameContent.innerHTML = `
      <div class="w-full max-w-md animate-fade-in">
        <div class="border-2 border-neon-blue p-6 bg-black/80 rounded-lg shadow-[0_0_30px_rgba(0,243,255,0.2)]">
          <h3 class="text-gray-400 text-xs tracking-widest uppercase mb-2">Assigned Protocol</h3>
          <div class="text-4xl font-black text-white mb-1 drop-shadow-lg">${roleEmoji}</div>
          <div class="text-3xl font-cyber text-neon-blue uppercase tracking-wider mb-4">${selfRole}</div>
          ${revealBtnHtml}
          ${infoHtml}
        </div>

        <div class="mt-6 w-full">
          <h4 class="text-xs text-gray-500 uppercase tracking-widest mb-2 border-b border-gray-800 pb-1">Exposed Operatives</h4>
          <div class="flex justify-center gap-2 flex-wrap min-h-[60px]">
            ${revealedHtml || '<span class="text-gray-600 text-xs italic mt-2">No data available.</span>'}
          </div>
        </div>
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

  // --- Sipahi Guess UI (Cyberpunk) ---
  function showSipahiGuessUI(playerRoles, selfId, roomCode) {
    if (!gameContent) return;

    const p = (playerRoles || []).find(p => p.id === selfId);
    let targets = (playerRoles || []).filter(pr => pr.role !== 'Raja' && pr.role !== 'Sipahi');
    targets = targets.sort(() => Math.random() - 0.5);

    let timer = 60;
    let timerId = null;

    if (!p || p.role !== 'Sipahi') {
      gameContent.innerHTML = `
        <div class="text-center p-6 animate-fade-in">
           <div class="text-6xl mb-4 animate-bounce">🛡️</div>
           <h3 class="text-neon-blue text-xl font-bold uppercase tracking-widest">Sipahi is Analyzing</h3>
           <p class="text-gray-400 text-xs mt-2 font-mono">Stand by for accusation...</p>
        </div>
      `;
      return;
    }

    function timerFormat(t) {
      return `00:${String(t).padStart(2, "0")}`;
    }

    function render() {
      gameContent.innerHTML = `
        <div class="w-full max-w-md p-4 animate-fade-in text-center">
          <h3 class="font-cyber text-2xl text-white mb-2 uppercase">Identify the Chor</h3>
          <div id="timer" class="font-mono text-red-500 text-3xl mb-6 drop-shadow-[0_0_10px_red]">
            ${timerFormat(timer)}
          </div>
          
          <div class="grid grid-cols-1 gap-3 w-full">
            ${targets.map(t => `
              <button class="guess-btn cyber-btn w-full py-3 text-lg" data-id="${t.id}">
                ${t.name}
              </button>
            `).join('')}
          </div>
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
      if (timerEl) {
         timerEl.textContent = timerFormat(timer);
         if(timer < 10) timerEl.classList.add('animate-ping');
      }
      
      if (timer <= 0) {
        clearInterval(timerId);
        db.collection('rmcs_rooms').doc(roomCode).update({
          phase: 'roundResult',
          guess: {
            sipahi: p.id,
            guessed: null,
            correct: false,
            sipahiName: p.name,
            guessedName: 'TIMEOUT'
          }
        });
      }
    }, 1000);
  }

  // --- Round Result (Cyberpunk) ---
  function showRoundResult(data, selfId, roomCode, isHost) {
    if (!gameContent) return;

    const res = data.guess;
    const playerRoles = data.playerRoles || [];
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);

    const isCorrect = res && res.correct;

    let message, emoji, statusColor;
    
    if (!res || res.guessedName === 'TIMEOUT') {
        message = "TIME EXPIRED // TARGET ESCAPED";
        emoji = "⚠️";
        statusColor = "text-yellow-400";
    } else if (isCorrect) {
        message = "TARGET NEUTRALIZED";
        emoji = "🎯";
        statusColor = "text-neon-green";
    } else {
        message = "MISSION FAILED // WRONG TARGET";
        emoji = "❌";
        statusColor = "text-red-500";
    }

    // Update Scores Logic (Host only trigger)
    // Note: updateScores is now called by the backend or frontend depending on your logic.
    // If using backend transaction, we just call the function.
    if (isHost && !data.scoreUpdated) {
      const updateScoresFn = functions.httpsCallable('updateScores');
      updateScoresFn({ roomId: roomCode, isCorrect })
        .catch(console.error);
      // We let the backend set scoreUpdated via transaction to be safe,
      // but we can also optimistically set it here to prevent double calls.
    }

    // Role Reveal Section
    const roleMap = {};
    playerRoles.forEach(p => roleMap[p.role] = p.name);

    // Updated Results HTML with brighter colors
    const resultsHtml = `
      <div class="w-full bg-black/80 border border-gray-600 p-4 rounded mt-4 text-left shadow-lg">
        <div class="flex justify-between items-center border-b border-gray-500 pb-1 mb-2">
          <span class="text-xs text-gray-300 uppercase tracking-wider">Mission Report</span>
        </div>
        <div class="space-y-3 text-base font-bold font-mono">
          <div class="flex justify-between items-center bg-white/5 p-2 rounded">
            <span class="text-yellow-300 drop-shadow-sm">👑 RAJA</span> 
            <span class="text-white tracking-wide">${roleMap['Raja'] || '-'}</span>
          </div>
          <div class="flex justify-between items-center bg-white/5 p-2 rounded">
            <span class="text-fuchsia-300 drop-shadow-sm">🧠 MANTRI</span> 
            <span class="text-white tracking-wide">${roleMap['Mantri'] || '-'}</span>
          </div>
          <div class="flex justify-between items-center bg-white/5 p-2 rounded">
            <span class="text-cyan-300 drop-shadow-sm">🛡️ SIPAHI</span> 
            <span class="text-white tracking-wide">${roleMap['Sipahi'] || '-'}</span>
          </div>
          <div class="flex justify-between items-center bg-white/5 p-2 rounded">
            <span class="text-rose-400 drop-shadow-sm">🔪 CHOR</span> 
            <span class="text-white tracking-wide">${roleMap['Chor'] || '-'}</span>
          </div>
        </div>
      </div>
    `;

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full animate-fade-in">
        <div class="text-6xl mb-2 filter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">${emoji}</div>
        <h2 class="font-cyber text-2xl ${statusColor} uppercase tracking-widest text-center drop-shadow-lg">${message}</h2>
        
        ${resultsHtml}

        ${
          isHost
            ? '<button class="next-round-btn cyber-btn w-full mt-6">REBOOT SYSTEM</button>'
            : '<div class="mt-6 text-xs text-gray-500 animate-pulse">WAITING FOR HOST REBOOT...</div>'
        }
      </div>
    `;

    if (isHost) {
      const nextRoundBtn = gameContent.querySelector('.next-round-btn');
      if (nextRoundBtn) {
        nextRoundBtn.onclick = async () => {
            const startFn = functions.httpsCallable('startGame');
            nextRoundBtn.textContent = "INITIALIZING...";
            await startFn({ roomId }); 
        };
      }
    }
  }

  // --- Host: Cancel Room ---
  async function handleCancelRoom() {
    const confirmed = window.confirm("TERMINATE SESSION? THIS ACTION IS IRREVERSIBLE.");
    if (!confirmed || !roomId) return;

    const roomRef = db.collection('rmcs_rooms').doc(roomId);
    try {
      await roomRef.delete();
    } catch (e) {
      showMessage("ERROR", "DELETION FAILED: " + e.message);
    }
  }

  // --- Exit Lobby ---
  if (exitLobbyBtn) {
    exitLobbyBtn.onclick = async () => {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }

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
        } catch (e) { console.error(e); }
      }
      roomId = '';
      showScreen(mainMenu);
    };
  }

  // --- Initial Auth ---
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(user => {
      if (!user) {
        firebase.auth().signInAnonymously().catch(e => {
          showMessage("CRITICAL FAILURE", "Could not connect to secure server.");
        });
      }
    });
  } else {
    showMessage("SYSTEM ERROR", "Firebase SDK missing.");
  }
});
