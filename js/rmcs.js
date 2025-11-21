document.addEventListener("DOMContentLoaded", function () {
  // --- DOM Elements ---
  const mainMenu       = document.getElementById('mainMenu');
  const createScreen   = document.getElementById('createScreen');
  const joinScreen     = document.getElementById('joinScreen');
  const gameScreen     = document.getElementById('gameScreen');

  // Lobby & Buttons
  const playersListEl  = document.getElementById('playersList');
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn   = document.getElementById('startGameBtn');
  const exitLobbyBtn   = document.getElementById('exitLobbyBtn');
  const cancelRoomBtn  = document.getElementById('cancelRoomBtn');

  // Game Areas
  const gameTable      = document.querySelector('.game-table');
  const gameContent    = document.getElementById('gameContent');
  const scoreboardEl   = document.getElementById('scoreboard');
  const scoreListEl    = document.getElementById('scoreList');

  // Message & History Modals
  const messageBox     = document.getElementById('messageBox');
  const messageBoxTitle = document.getElementById('messageBoxTitle');
  const messageBoxBody  = document.getElementById('messageBoxBody');
  const messageBoxClose = document.getElementById('messageBoxClose');
  
  const historyModal = document.getElementById('historyModal');
  const openHistoryBtn = document.getElementById('openHistoryBtn');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');

  // --- State variables ---
  let unsubscribe = null;
  let roomId = '';
  let playerName = '';

  function selfUid() {
    return firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
  }

  // --- Navigation ---
  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(s => {
      if(s) { s.classList.remove('active-screen'); s.style.display = 'none'; }
    });
    if (show) { show.style.display = 'flex'; show.classList.add('active-screen'); }
  }

  document.querySelector('.create-btn').onclick = () => showScreen(createScreen);
  document.querySelector('.join-btn').onclick   = () => showScreen(joinScreen);
  document.querySelectorAll('.back-btn').forEach(btn => btn.onclick = () => showScreen(mainMenu));

  // History Modal Toggles
  if(openHistoryBtn) openHistoryBtn.onclick = () => { if(historyModal) { historyModal.classList.remove('hidden'); historyModal.style.display = 'flex'; }};
  if(closeHistoryBtn) closeHistoryBtn.onclick = () => { if(historyModal) { historyModal.classList.add('hidden'); historyModal.style.display = 'none'; }};

  // --- Logic Helpers (Client Side) ---
  function assignRoles(players) {
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    const shuffled = [...roles].sort(() => Math.random() - 0.5);
    return players.map((p, i) => ({ id: p.id, name: p.name, role: shuffled[i] }));
  }

  function calculateRoundPoints(playerRoles, isCorrect) {
    const points = {};
    playerRoles.forEach(p => {
        if (p.role === 'Raja') points[p.id] = 1000;
        else if (p.role === 'Mantri') points[p.id] = 500;
        else if (p.role === 'Sipahi') points[p.id] = isCorrect ? 250 : 0;
        else if (p.role === 'Chor') points[p.id] = isCorrect ? 0 : 250;
    });
    return points;
  }

  // --- UI Renderers ---
  function renderRoomCode(code) {
    if (!currentRoomCode) return;
    currentRoomCode.innerHTML = `
      <div class="flex justify-between items-center w-full">
        <span class="font-cyber text-neon-green text-2xl tracking-widest drop-shadow-md">${code}</span>
        <button id="copyBtn" class="ml-4 text-xs border border-gray-500 px-2 py-1 rounded text-gray-400 hover:text-white">COPY</button>
      </div>`;
    document.getElementById('copyBtn').onclick = () => {
        navigator.clipboard.writeText(code).then(() => alert('Copied!')).catch(() => {});
    };
  }

  function renderPlayersList(players) {
    if (!playersListEl) return;
    const uid = selfUid();
    playersListEl.innerHTML = players.map(p => `
      <div class="flex items-center gap-2 px-3 py-1 border border-gray-700 bg-gray-900/50 rounded text-gray-300 text-xs uppercase font-bold">
        <span class="${p.id === uid ? 'text-neon-green' : 'text-neon-blue'} text-lg">●</span>
        <span>${p.name}</span>
      </div>`).join('');
  }

  function renderScoreboard(scores, players) {
    if (!scoreListEl) return;
    const sorted = players.map(p => ({ name: p.name, score: scores[p.id] || 0 })).sort((a, b) => b.score - a.score);
    scoreListEl.innerHTML = sorted.map(p => `
      <div class="flex justify-between items-center py-2 border-b border-gray-800 hover:bg-white/5 px-2">
        <span class="text-neon-blue font-bold truncate max-w-[100px]">${p.name}</span>
        <span class="font-mono text-neon-pink text-lg">${p.score}</span>
      </div>`).join('');
  }

  function renderHistoryTable(history) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    if (!history || history.length === 0) {
      historyContent.innerHTML = '<p class="text-gray-500 text-center">No mission data.</p>';
      return;
    }
    let html = `<table class="w-full text-left border-collapse"><thead class="text-xs text-gray-400 border-b border-gray-700"><tr><th class="p-2">R#</th><th class="p-2">Raja</th><th class="p-2">Mantri</th><th class="p-2">Sipahi</th><th class="p-2">Chor</th></tr></thead><tbody class="text-sm font-mono text-gray-300">`;
    
    history.forEach((round, i) => {
        const get = (r) => { 
            const p = round.roles.find(rp => rp.role === r); 
            return p ? `<div class="${r==='Raja'?'text-yellow-300':r==='Mantri'?'text-fuchsia-300':r==='Sipahi'?'text-cyan-300':'text-rose-400'}">${p.name}</div><div class="text-[10px] text-gray-500">+${round.points[p.id]}</div>` : '-'; 
        };
        html += `<tr class="border-b border-gray-800"><td class="p-2 text-neon-blue font-bold">${i+1}</td><td class="p-2">${get('Raja')}</td><td class="p-2">${get('Mantri')}</td><td class="p-2">${get('Sipahi')}</td><td class="p-2">${get('Chor')}</td></tr>`;
    });
    historyContent.innerHTML = html + '</tbody></table>';
  }

  function renderAvatarsTable(players, selfId) {
    if (!gameTable) return;
    if (gameContent) { gameContent.innerHTML = ''; gameContent.style.display = 'none'; }
    const tableEl = gameTable.querySelector('.table');
    if (tableEl) tableEl.style.display = 'block';
    [...gameTable.querySelectorAll('.avatar')].forEach(el => el.remove());

    const N = players.length;
    if (N === 0) return;
    const radius = 130, cx = 160, cy = 160;
    const selfIndex = players.findIndex(p => p.id === selfId);

    for (let i = 0; i < N; ++i) {
      const logicalIndex = (i - selfIndex + N) % N;
      const angle = Math.PI * 1.5 + (2 * Math.PI * logicalIndex) / N;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.left = (x - 35) + 'px';
      avatar.style.top  = (y - 35) + 'px';
      const isSelf = players[i].id === selfId;
      
      if(isSelf) { avatar.style.borderColor = 'var(--neon-green)'; avatar.style.boxShadow = '0 0 20px var(--neon-green)'; }
      else { avatar.style.borderColor = 'var(--neon-blue)'; }

      avatar.innerHTML = `<span class="text-3xl drop-shadow-md">${isSelf ? 'YOU' : '👤'}</span><div class="avatar-name" style="${isSelf ? 'color:var(--neon-green)' : ''}">${players[i].name}</div>`;
      gameTable.appendChild(avatar);
    }
  }

  // --- Main Room Listener ---
  function listenToRoom(roomCode) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);

    unsubscribe = roomRef.onSnapshot(doc => {
      const data = doc.data();
      const selfId = selfUid();

      if (!data) { alert("Room deleted."); showScreen(mainMenu); roomId = ''; return; }
      if (!data.players.some(p => p.id === selfId)) { alert("You were removed."); showScreen(mainMenu); return; }

      renderRoomCode(roomCode);
      renderPlayersList(data.players);
      renderScoreboard(data.scores || {}, data.players);
      renderHistoryTable(data.history || []);

      const isHost = selfId === data.host;
      if (cancelRoomBtn) { cancelRoomBtn.style.display = isHost ? 'block' : 'none'; cancelRoomBtn.onclick = isHost ? handleCancelRoom : null; }

      if (data.phase === "lobby") {
        if (gameContent) { gameContent.style.display = 'none'; }
        const tableEl = gameTable ? gameTable.querySelector('.table') : null;
        if (tableEl) tableEl.style.display = 'block';
        renderAvatarsTable(data.players, selfId);

        if (startGameBtn) {
          startGameBtn.style.display = 'flex';
          startGameBtn.disabled = !(isHost && data.players.length === 4);
          startGameBtn.textContent = (data.players.length === 4) ? 'INITIATE SEQUENCE' : `WAITING (${data.players.length}/4)`;
          if(data.players.length !== 4) startGameBtn.classList.add('opacity-50'); else startGameBtn.classList.remove('opacity-50');

          // --- HOST START GAME LOGIC (Client Side) ---
          startGameBtn.onclick = async () => {
            if (!(isHost && data.players.length === 4)) return;
            const roles = assignRoles(data.players);
            await roomRef.update({ phase: 'reveal', playerRoles: roles, revealed: [], guess: null, scoreUpdated: false });
          };
        }
      } else {
        // In Game
        if (startGameBtn) startGameBtn.style.display = 'none';
        if (gameContent) gameContent.style.display = 'flex';
        
        if (data.phase === 'reveal') showRoleRevealScreen(data, selfId, roomRef);
        else if (data.phase === 'guess') showSipahiGuessUI(data, selfId, roomRef);
        else if (data.phase === 'roundResult') showRoundResult(data, selfId, roomRef, isHost);
      }
    });
  }

  function showRoleRevealScreen(data, selfId, roomRef) {
    const p = data.playerRoles.find(p => p.id === selfId);
    const isRS = (p.role === 'Raja' || p.role === 'Sipahi');
    const revealed = data.revealed || [];
    const amIRevealed = revealed.some(r => r.id === selfId);

    // Auto-progress
    if (data.host === selfId) {
        const rRevealed = revealed.some(r => r.role === 'Raja');
        const sRevealed = revealed.some(r => r.role === 'Sipahi');
        if (rRevealed && sRevealed) { roomRef.update({ phase: 'guess', revealed: [] }); return; }
    }

    const revHtml = (data.playerRoles.filter(pr => revealed.some(r => r.id === pr.id))).map(r => 
        `<div class="bg-black/40 border border-gray-600 p-2 rounded w-20 flex flex-col items-center"><span class="text-2xl">${r.role==='Raja'?'👑':r.role==='Sipahi'?'🛡️':''}</span><span class="text-[10px] text-neon-blue font-bold">${r.name}</span></div>`
    ).join('');

    gameContent.innerHTML = `
      <div class="w-full max-w-md animate-fade-in">
        <div class="border-2 border-neon-blue p-6 bg-black/80 rounded-lg shadow-[0_0_30px_rgba(0,243,255,0.2)] text-center">
          <h3 class="text-gray-400 text-xs uppercase mb-2">Assigned Protocol</h3>
          <div class="text-4xl mb-1">${p.role==='Raja'?'👑':p.role==='Mantri'?'🧠':p.role==='Chor'?'🔪':'🛡️'}</div>
          <div class="text-3xl font-cyber text-neon-blue uppercase mb-4">${p.role}</div>
          ${(isRS && !amIRevealed) ? `<button id="revealBtn" class="cyber-btn danger w-full">DECRYPT IDENTITY</button>` : (!isRS ? `<div class="text-neon-green text-sm border border-neon-green p-2 rounded">STATUS: COVERT</div>` : `<div class="text-neon-blue font-bold animate-pulse">IDENTITY EXPOSED</div>`)}
        </div>
        <div class="mt-6"><h4 class="text-xs text-gray-500 uppercase border-b border-gray-800 pb-1 mb-2">Exposed</h4><div class="flex justify-center gap-2">${revHtml || '<span class="text-gray-600 text-xs">No data.</span>'}</div></div>
      </div>`;
      
    const btn = document.getElementById('revealBtn');
    if (btn) btn.onclick = () => roomRef.update({ revealed: firebase.firestore.FieldValue.arrayUnion({ id: selfId, role: p.role, name: p.name }) });
  }

  function showSipahiGuessUI(data, selfId, roomRef) {
    const p = data.playerRoles.find(p => p.id === selfId);
    
    // Timer Logic could be added here, but for simplicity relying on users.
    if (p.role !== 'Sipahi') {
        gameContent.innerHTML = `<div class="text-center p-6 animate-fade-in"><div class="text-6xl mb-4 animate-bounce">🛡️</div><h3 class="text-neon-blue text-xl font-bold">Sipahi is Analyzing...</h3></div>`;
        return;
    }

    let targets = data.playerRoles.filter(pr => pr.role !== 'Raja' && pr.role !== 'Sipahi');
    gameContent.innerHTML = `
      <div class="w-full max-w-md p-4 animate-fade-in text-center">
        <h3 class="font-cyber text-2xl text-white mb-6">Identify the Chor</h3>
        <div class="grid grid-cols-1 gap-3">${targets.map(t => `<button class="guess-btn cyber-btn w-full py-3" data-id="${t.id}">${t.name}</button>`).join('')}</div>
      </div>`;

    document.querySelectorAll('.guess-btn').forEach(btn => {
        btn.onclick = () => {
            const t = targets.find(tg => tg.id === btn.dataset.id);
            roomRef.update({ 
                phase: 'roundResult', 
                guess: { sipahiId: p.id, guessedId: t.id, correct: t.role === 'Chor', guessedName: t.name },
                scoreUpdated: false 
            });
        };
    });
  }

  function showRoundResult(data, selfId, roomRef, isHost) {
    const res = data.guess;
    const isCorrect = res.correct;
    
    // --- HOST LOGIC: Calculate & Save Scores (Client Side) ---
    if (isHost && !data.scoreUpdated) {
       const roundPoints = calculateRoundPoints(data.playerRoles, isCorrect);
       const historyEntry = { timestamp: new Date().toISOString(), roles: data.playerRoles, points: roundPoints, result: isCorrect?'Caught':'Escaped' };
       
       // Cumulative Score Calc
       const newScores = { ...data.scores };
       Object.keys(roundPoints).forEach(uid => { newScores[uid] = (newScores[uid] || 0) + roundPoints[uid]; });

       // Atomic Update not strictly needed for single host, but standard update works
       roomRef.update({
           scores: newScores,
           history: firebase.firestore.FieldValue.arrayUnion(historyEntry),
           scoreUpdated: true
       });
    }

    const roleMap = {}; data.playerRoles.forEach(p => roleMap[p.role] = p.name);
    
    const resultsHtml = `
      <div class="w-full bg-black/80 border border-gray-600 p-4 rounded mt-4 text-left shadow-lg">
        <div class="flex justify-between items-center border-b border-gray-500 pb-1 mb-2"><span class="text-xs text-gray-300 uppercase">Mission Report</span></div>
        <div class="space-y-3 text-base font-bold font-mono">
          <div class="flex justify-between items-center bg-white/5 p-2 rounded"><span class="text-yellow-300">👑 RAJA</span><span class="text-white">${roleMap['Raja']}</span></div>
          <div class="flex justify-between items-center bg-white/5 p-2 rounded"><span class="text-fuchsia-300">🧠 MANTRI</span><span class="text-white">${roleMap['Mantri']}</span></div>
          <div class="flex justify-between items-center bg-white/5 p-2 rounded"><span class="text-cyan-300">🛡️ SIPAHI</span><span class="text-white">${roleMap['Sipahi']}</span></div>
          <div class="flex justify-between items-center bg-white/5 p-2 rounded"><span class="text-rose-400">🔪 CHOR</span><span class="text-white">${roleMap['Chor']}</span></div>
        </div>
      </div>`;

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full animate-fade-in">
        <div class="text-6xl mb-2">${isCorrect ? '🎯' : '❌'}</div>
        <h2 class="font-cyber text-2xl ${isCorrect ? 'text-neon-green' : 'text-red-500'} uppercase tracking-widest text-center">${isCorrect ? 'TARGET NEUTRALIZED' : 'MISSION FAILED'}</h2>
        ${resultsHtml}
        ${isHost ? '<button id="nextRoundBtn" class="cyber-btn w-full mt-6">REBOOT SYSTEM</button>' : '<div class="mt-6 text-xs text-gray-500 animate-pulse">WAITING FOR HOST...</div>'}
      </div>`;

    if (isHost) {
        const nb = document.getElementById('nextRoundBtn');
        if(nb) nb.onclick = () => {
            const roles = assignRoles(data.playerRoles);
            roomRef.update({ phase: 'reveal', playerRoles: roles, revealed: [], guess: null, scoreUpdated: false });
        };
    }
  }

  // --- Setup Handlers ---
  async function handleCancelRoom() {
    if(confirm("Terminate Session?")) await db.collection('rmcs_rooms').doc(roomId).delete();
  }

  document.getElementById('createRoomFinal').onclick = async () => {
    playerName = document.getElementById('createPlayerName').value.trim();
    let code = document.getElementById('createRoomCode').value.trim().toUpperCase() || Math.random().toString(36).substring(2, 6).toUpperCase();
    if(!playerName) return alert("Name required");
    
    const ref = db.collection('rmcs_rooms').doc(code);
    if ((await ref.get()).exists) return alert("Code taken");

    firebase.auth().signInAnonymously().then(creds => {
        const uid = creds.user.uid;
        ref.set({ host: uid, players: [{name: playerName, id: uid}], phase: 'lobby', scores: {[uid]:0}, created: firebase.firestore.FieldValue.serverTimestamp() });
        roomId = code; listenToRoom(roomId); showScreen(gameScreen);
    });
  };

  document.getElementById('joinRoomFinal').onclick = async () => {
    playerName = document.getElementById('joinPlayerName').value.trim();
    let code = document.getElementById('joinRoomCode').value.trim().toUpperCase();
    if(!playerName || !code) return alert("Info required");

    const ref = db.collection('rmcs_rooms').doc(code);
    const doc = await ref.get();
    if (!doc.exists) return alert("Room not found");
    
    firebase.auth().signInAnonymously().then(creds => {
        const uid = creds.user.uid;
        if(!doc.data().players.some(p=>p.id===uid)) {
            ref.update({ players: firebase.firestore.FieldValue.arrayUnion({name: playerName, id: uid}), [`scores.${uid}`]: 0 });
        }
        roomId = code; listenToRoom(roomId); showScreen(gameScreen);
    });
  };
});
