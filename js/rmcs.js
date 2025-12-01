document.addEventListener("DOMContentLoaded", function () {
  
  if (typeof firebase === 'undefined') { console.error("Firebase missing"); return; }
  const db = firebase.firestore();
  let unsubscribe = null;
  let roomId = '';
  let playerName = '';
  let currentUserData = null;
  let lastPhase = ''; 

  // --- DOM Selectors ---
  const getEl = (id) => document.getElementById(id);
  
  const mainMenu = getEl('mainMenu');
  const createScreen = getEl('createScreen');
  const joinScreen = getEl('joinScreen');
  const gameScreen = getEl('gameScreen');
  
  // Stop if not on game page
  if (!mainMenu || !gameScreen) return;

  const gameContent = getEl('gameContent'); 
  const playersListEl = getEl('playersList');
  const currentRoomCode = getEl('currentRoomCode');
  const scoreListEl = getEl('scoreList');
  const startGameBtn = getEl('startGameBtn');
  const cancelRoomBtn = getEl('cancelRoomBtn');
  const roundTransition = getEl('roundTransition');
  const roundTitle = getEl('roundTitle');

  // --- SOUND ENGINE ---
  const SoundEffects = {
    meme: {
      caught: new Audio('sounds/sabash.mp3'),
      escaped: new Audio('sounds/failure.mp3'),
      reveal: new Audio('sounds/drum_roll.mp3'),
      click: new Audio('sounds/bubble.mp3'),
      cash: new Audio('sounds/cash.mp3')
    },
    default: {
      caught: new Audio('sounds/sabash.mp3'),
      escaped: new Audio('sounds/anyay.mp3'),
      reveal: new Audio('sounds/vine-boom.mp3'),
      click: new Audio('sounds/bubble.mp3'),
      cash: new Audio('sounds/ca.mp3')
    }
  };

  function playSound(type) {
    const hasMemePack = currentUserData && currentUserData.inventory && currentUserData.inventory.includes('meme_pack');
    const pack = hasMemePack ? 'meme' : 'default';
    const audio = SoundEffects[pack][type];
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => {});
    }
  }

  // --- AUTH ---
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) await loadUserData(user.uid);
  });

  async function loadUserData(uid) {
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      const initialData = { username: "Agent", coins: 100, xp: 0, inventory: [] };
      await userRef.set(initialData);
      currentUserData = initialData;
    } else {
      currentUserData = doc.data();
    }
  }

  async function requireAuth() {
    if (!firebase.auth().currentUser) throw new Error("Auth Required");
    return firebase.auth().currentUser.uid;
  }

  // --- NAVIGATION ---
  function showScreen(screen) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(s => {
      if(s) { s.classList.remove('active-screen'); s.style.display = 'none'; }
    });
    if (screen) { screen.style.display = 'block'; screen.classList.add('active-screen'); }
    playSound('click'); // Play sound on navigation
  }

  document.querySelectorAll('.create-btn').forEach(b => b.onclick = () => showScreen(createScreen));
  document.querySelectorAll('.join-btn').forEach(b => b.onclick = () => showScreen(joinScreen));
  document.querySelectorAll('.back-btn').forEach(b => b.onclick = () => showScreen(mainMenu));
  
  const exitLobbyBtn = getEl('exitLobbyBtn');
  if(exitLobbyBtn) {
      exitLobbyBtn.onclick = () => {
          if(unsubscribe) unsubscribe();
          showScreen(mainMenu);
          playSound('click');
      };
  }

  // --- ROOM CREATION ---
  const createRoomFinal = getEl('createRoomFinal');
  if(createRoomFinal) {
      createRoomFinal.onclick = async () => {
        playSound('click');
        const nameVal = getEl('createPlayerName').value.trim();
        const codeVal = getEl('createRoomCode').value.trim().toUpperCase() || Math.random().toString(36).substring(2, 6).toUpperCase();
        
        if(!nameVal) return alert("Name Required");
        
        try {
            const uid = await requireAuth();
            const ref = db.collection('rmcs_rooms').doc(codeVal);
            if((await ref.get()).exists) return alert("Code Taken");

            const playerData = {
                name: nameVal, id: uid,
                inventory: currentUserData.inventory || [],
                isVip: (currentUserData.inventory||[]).includes('gold_name'),
                nameColor: (currentUserData.inventory||[]).includes('gold_name') ? 'gold' : 'white'
            };

            await ref.set({
                host: uid, players: [playerData], phase: 'lobby', scores: {[uid]:0},
                history: [], // Initialize history array
                created: firebase.firestore.FieldValue.serverTimestamp()
            });
            roomId = codeVal; listenToRoom(roomId); showScreen(gameScreen);
        } catch(e) { console.error(e); }
      };
  }

  const joinRoomFinal = getEl('joinRoomFinal');
  if(joinRoomFinal) {
      joinRoomFinal.onclick = async () => {
          playSound('click');
          const nameVal = getEl('joinPlayerName').value.trim();
          const codeVal = getEl('joinRoomCode').value.trim().toUpperCase();
          
          if(!nameVal || !codeVal) return alert("Credentials Missing");

          try {
            const uid = await requireAuth();
            const ref = db.collection('rmcs_rooms').doc(codeVal);
            const doc = await ref.get();
            if(!doc.exists) return alert("Room Not Found");

            const playerData = {
                name: nameVal, id: uid,
                inventory: currentUserData.inventory || [],
                isVip: (currentUserData.inventory||[]).includes('gold_name'),
                nameColor: (currentUserData.inventory||[]).includes('gold_name') ? 'gold' : 'white'
            };

            if(!doc.data().players.some(p=>p.id === uid)) {
                if(doc.data().players.length >= 4) return alert("Full");
                await ref.update({ 
                    players: firebase.firestore.FieldValue.arrayUnion(playerData),
                    [`scores.${uid}`]: 0 
                });
            }
            roomId = codeVal; listenToRoom(roomId); showScreen(gameScreen);
          } catch(e) { console.error(e); }
      };
  }

  // --- COPY BUTTON FUNCTION ---
  window.copyRoomCode = function(code) {
      navigator.clipboard.writeText(code).then(() => {
          alert("Code Copied: " + code);
          playSound('click');
      });
  };

  // --- GAME LOOP ---
  function listenToRoom(roomCode) {
      if(unsubscribe) { unsubscribe(); unsubscribe = null; }
      const roomRef = db.collection('rmcs_rooms').doc(roomCode);

      unsubscribe = roomRef.onSnapshot(doc => {
          const data = doc.data();
          if(!firebase.auth().currentUser) return;
          const selfId = firebase.auth().currentUser.uid;

          if(!data) { alert("Room Closed"); showScreen(mainMenu); return; }
          if(!data.players.some(p=>p.id===selfId)) { alert("Kicked"); showScreen(mainMenu); return; }

          // --- FIX: Copy Button HTML ---
          if(currentRoomCode) {
              currentRoomCode.innerHTML = `
                <span class="text-neon-green text-2xl tracking-widest">${roomCode}</span>
                <button onclick="copyRoomCode('${roomCode}')" class="text-gray-400 hover:text-white transition">
                    <i class="fa-regular fa-copy"></i>
                </button>
              `;
          }

          renderPlayersList(data.players);
          renderScoreboard(data.scores, data.players);
          renderHistory(data.history);

          const isHost = selfId === data.host;
          if(cancelRoomBtn) {
              cancelRoomBtn.style.display = isHost ? 'block' : 'none';
              cancelRoomBtn.onclick = () => { if(confirm("Close Room?")) roomRef.delete(); };
          }

          // --- ROUND TRANSITION LOGIC ---
          if(data.phase !== lastPhase) {
              if(data.phase === 'reveal') {
                  playSound('reveal');
                  // --- FIX: Calculate Round Number ---
                  const roundNum = (data.history ? data.history.length : 0) + 1;
                  if(roundTitle) roundTitle.innerText = "ROUND " + roundNum;
                  
                  if(roundTransition) {
                      roundTransition.classList.remove('hidden');
                      roundTransition.style.display = 'flex';
                      setTimeout(() => { roundTransition.style.display = 'none'; }, 2500);
                  }
              }
          }
          lastPhase = data.phase;

          // TOGGLE VISIBILITY
          if (data.phase === 'lobby') {
              gameContent.style.display = 'none'; 
              renderAvatarsTable(data.players, selfId);
              
              if(startGameBtn) {
                  startGameBtn.style.display = 'flex';
                  startGameBtn.disabled = !(isHost && data.players.length === 4);
                  startGameBtn.innerText = (data.players.length === 4) ? "INITIATE SEQUENCE" : `WAITING (${data.players.length}/4)`;
                  startGameBtn.onclick = () => {
                      if(isHost && data.players.length === 4) {
                          playSound('click'); // Instant sound
                          const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'].sort(() => Math.random() - 0.5);
                          const pr = data.players.map((p,i) => ({ id: p.id, name: p.name, role: roles[i] }));
                          roomRef.update({ phase: 'reveal', playerRoles: pr, revealed: [], guess: null, scoreUpdated: false });
                      }
                  };
              }
          } else {
              gameContent.style.display = 'flex';
              if(startGameBtn) startGameBtn.style.display = 'none';

              if(data.phase === 'reveal') showRoleRevealScreen(data, selfId, roomRef);
              else if(data.phase === 'guess') showSipahiGuessUI(data, selfId, roomRef);
              else if(data.phase === 'roundResult') showRoundResult(data, selfId, roomRef, isHost);
          }
      });
  }

  // --- RENDERERS ---
  function showRoleRevealScreen(data, selfId, roomRef) {
      const p = data.playerRoles.find(p => p.id === selfId);
      const isRS = (p.role === 'Raja' || p.role === 'Sipahi');
      const revealed = data.revealed || [];
      const amIRevealed = revealed.some(r => r.id === selfId);

      if(data.host === selfId) {
          const rRev = revealed.some(r => r.role === 'Raja');
          const sRev = revealed.some(r => r.role === 'Sipahi');
          if(rRev && sRev) { roomRef.update({ phase: 'guess', revealed: [] }); return; }
      }

      gameContent.innerHTML = `
        <div class="flex flex-col items-center animate-fade-in w-full">
            <div class="text-6xl mb-4">${getRoleIcon(p.role)}</div>
            <h3 class="font-cyber text-3xl text-neon-blue mb-2">${p.role}</h3>
            ${(isRS && !amIRevealed) 
              ? `<button id="revealRoleBtn" class="cyber-btn danger text-sm">EXPOSE IDENTITY</button>` 
              : (!isRS 
                  ? `<div class="text-gray-500 text-xs border border-gray-700 px-3 py-1">STAY COVERT</div>` 
                  : `<div class="text-neon-green text-sm font-bold uppercase border border-neon-green px-3 py-1">Exposed</div>`
                )
            }
            <div class="mt-6 w-full border-t border-gray-800 pt-4 flex justify-center gap-2">
               ${revealed.map(r => `<div class="bg-gray-900 p-1 rounded text-xs text-neon-blue border border-gray-700">${r.name} : ${getRoleIcon(r.role)}</div>`).join('')}
            </div>
        </div>`;

      const btn = document.getElementById('revealRoleBtn');
      if(btn) btn.onclick = () => {
          playSound('reveal'); // Instant sound
          roomRef.update({ revealed: firebase.firestore.FieldValue.arrayUnion({ id: selfId, role: p.role, name: p.name }) });
      };
  }

  function showSipahiGuessUI(data, selfId, roomRef) {
      const p = data.playerRoles.find(p => p.id === selfId);
      if (p.role !== 'Sipahi') {
          gameContent.innerHTML = `<div class="text-center animate-fade-in"><div class="text-6xl mb-4 animate-bounce">🛡️</div><h3 class="text-neon-blue font-bold">SIPAHI IS ANALYZING...</h3></div>`;
          return;
      }
      
      let targets = data.playerRoles.filter(pr => pr.role !== 'Raja' && pr.role !== 'Sipahi');
      gameContent.innerHTML = `
        <div class="flex flex-col items-center w-full animate-fade-in">
          <h3 class="font-cyber text-white mb-6 text-sm bg-red-900/20 px-4 py-1 rounded uppercase animate-pulse">Identify Chor</h3>
          <div class="grid grid-cols-1 gap-3 w-full max-w-xs">
              ${targets.map(t => `<button class="guess-btn cyber-btn w-full py-4 text-lg" data-id="${t.id}">${t.name}</button>`).join('')}
          </div>
        </div>`;
      
      document.querySelectorAll('.guess-btn').forEach(btn => {
          btn.onclick = () => {
              playSound('click'); // Instant sound
              const t = targets.find(tg => tg.id === btn.dataset.id);
              roomRef.update({ phase: 'roundResult', guess: { sipahiId: p.id, guessedId: t.id, correct: t.role === 'Chor', guessedName: t.name }, scoreUpdated: false });
          };
      });
  }

  function showRoundResult(data, selfId, roomRef, isHost) {
      const res = data.guess;
      const isCorrect = res.correct;

      if(!data.scoreUpdated) {
          if(isCorrect) playSound('caught'); else playSound('escaped');
      }

      if(isHost && !data.scoreUpdated) {
         const pts = calculateRoundPoints(data.playerRoles, isCorrect);
         const newScores = { ...data.scores };
         Object.keys(pts).forEach(uid => { newScores[uid] = (newScores[uid] || 0) + pts[uid]; });
         const historyEntry = { result: isCorrect?'Caught':'Escaped' };
         
         roomRef.update({ scores: newScores, history: firebase.firestore.FieldValue.arrayUnion(historyEntry), scoreUpdated: true });
      }

      const resultText = isCorrect ? 'CHOR CAUGHT' : 'CHOR ESCAPED';
      const resultColor = isCorrect ? 'text-neon-green' : 'text-red-500';
      const roleMap = {}; data.playerRoles.forEach(p => roleMap[p.role] = p.name);

      gameContent.innerHTML = `
        <div class="flex flex-col items-center w-full animate-fade-in">
          <h2 class="font-cyber text-2xl ${resultColor} mb-4 tracking-widest">${resultText}</h2>
          <div class="w-full text-sm space-y-2 font-mono text-left mb-6 bg-black/40 p-4 rounded border border-gray-800">
             <div class="flex justify-between"><span class="text-yellow-300">👑 RAJA</span> <span class="text-white">${roleMap['Raja']}</span></div>
             <div class="flex justify-between"><span class="text-fuchsia-300">🧠 MANTRI</span> <span class="text-white">${roleMap['Mantri']}</span></div>
             <div class="flex justify-between"><span class="text-cyan-300">🛡️ SIPAHI</span> <span class="text-white">${roleMap['Sipahi']}</span></div>
             <div class="flex justify-between"><span class="text-rose-400">🔪 CHOR</span> <span class="text-white">${roleMap['Chor']}</span></div>
          </div>
          ${isHost ? `<button id="rebootBtn" class="cyber-btn w-full">REBOOT SYSTEM</button>` : `<div class="text-xs text-gray-500">WAITING FOR HOST...</div>`}
        </div>`;

      if(isHost) {
          setTimeout(() => {
              const btn = getEl('rebootBtn');
              if(btn) btn.onclick = () => {
                  playSound('click'); // Instant sound
                  btn.innerText = "INITIALIZING...";
                  const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'].sort(() => Math.random() - 0.5);
                  const pr = data.playerRoles.map((p,i) => ({ id: p.id, name: p.name, role: roles[i] }));
                  roomRef.update({ phase: 'reveal', playerRoles: pr, revealed: [], guess: null, scoreUpdated: false });
              };
          }, 100);
      }
  }

  // --- HELPERS ---
  function getRoleIcon(role) {
      if(role==='Raja') return '👑'; if(role==='Mantri') return '🧠';
      if(role==='Sipahi') return '🛡️'; if(role==='Chor') return '🔪';
      return '❓';
  }
  function calculateRoundPoints(roles, isCorrect) {
      const pts = {};
      roles.forEach(p => {
          if(p.role === 'Raja') pts[p.id] = 1000;
          else if(p.role === 'Mantri') pts[p.id] = 800;
          else if(p.role === 'Sipahi') pts[p.id] = isCorrect ? 500 : 0;
          else if(p.role === 'Chor') pts[p.id] = isCorrect ? 0 : 500;
      });
      return pts;
  }
  function renderPlayersList(players) {
      if(!playersListEl) return;
      playersListEl.innerHTML = players.map(p => `
         <div class="px-3 py-1 border border-gray-700 rounded bg-black/40 text-xs text-gray-300 flex items-center gap-2">
            <span class="text-[10px] text-neon-blue">●</span> ${p.name}
         </div>
      `).join('');
  }
  function renderScoreboard(scores, players) {
      if(!scoreListEl) return;
      const sorted = players.map(p => ({name: p.name, score: scores[p.id]||0})).sort((a,b)=>b.score-a.score);
      scoreListEl.innerHTML = sorted.map((p, i) => `
        <div class="flex justify-between items-center py-2 border-b border-gray-800/50">
           <span class="${i===0?'text-neon-green font-bold':'text-gray-400'}">${p.name}</span>
           <span class="font-mono text-neon-pink">${p.score}</span>
        </div>
      `).join('');
  }
  function renderHistory(history) {
      const el = getEl('historyContent');
      if(!el || !history) return;
      el.innerHTML = history.map((h, i) => `
        <div class="border-b border-gray-800 py-2 flex justify-between text-sm text-gray-300">
            <span>Round ${i+1}</span>
            <span class="${h.result==='Caught'?'text-green-400':'text-red-400'}">${h.result}</span>
        </div>
      `).join('');
  }
  function renderAvatarsTable(players, selfId) {
      const table = document.querySelector('.game-table');
      if(!table) return;
      table.querySelectorAll('.avatar').forEach(e => e.remove());
      const N = players.length; if(N === 0) return;
      const radius = 130, cx = 160, cy = 160;
      const selfIdx = players.findIndex(p => p.id === selfId);
      players.forEach((p, i) => {
          const logicalIdx = (i - selfIdx + N) % N; 
          const angle = (Math.PI / 2) + (2 * Math.PI * logicalIdx) / N;
          const x = cx + radius * Math.cos(angle) - 35;
          const y = cy + radius * Math.sin(angle) - 35;
          const el = document.createElement('div');
          el.className = 'avatar'; el.style.left = x + 'px'; el.style.top = y + 'px';
          let icon = '👤';
          if(p.inventory) {
             if(p.inventory.includes('robot_avatar')) icon = '🤖';
             else if(p.inventory.includes('alien_avatar')) icon = '👽';
          }
          el.innerHTML = `<span class="text-3xl drop-shadow-md">${icon}</span><div class="avatar-name" style="${p.id===selfId?'color:var(--neon-green);border:1px solid var(--neon-green)':''}">${p.name}</div>`;
          if(p.id === selfId) { el.style.borderColor = 'var(--neon-green)'; el.style.boxShadow = '0 0 20px var(--neon-green)'; }
          table.appendChild(el);
      });
  }
});
