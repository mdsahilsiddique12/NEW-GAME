document.addEventListener("DOMContentLoaded", function () {
  // ==========================================================================
  // 1. FIREBASE & STATE INITIALIZATION
  // ==========================================================================
  // Check if Firebase is loaded
  if (typeof firebase === 'undefined') {
      console.error("Firebase not loaded. Check script tags.");
      return;
  }
  
  const db = firebase.firestore();
  let unsubscribe = null;
  let roomId = '';
  let playerName = '';
  let currentUserData = null;
  let lastPhase = ''; 

  // ==========================================================================
  // 2. DOM ELEMENTS (Safe Selection)
  // ==========================================================================
  const getEl = (id) => document.getElementById(id);

  const mainMenu = getEl('mainMenu');
  const createScreen = getEl('createScreen');
  const joinScreen = getEl('joinScreen');
  const gameScreen = getEl('gameScreen');
  const storeScreen = getEl('storeScreen');

  // If we are not on the Game Page (rmcs.html), stop execution to prevent errors
  if (!mainMenu || !gameScreen) {
      console.log("Not on Game Page. Script paused.");
      return;
  }

  const authModal = getEl('authModal');
  const logoutBtn = getEl('logoutBtn');
  const googleLoginBtn = getEl('googleLoginBtn');
  const guestLoginBtn = getEl('guestLoginBtn');

  const openStoreBtn = getEl('openStoreBtn');
  const userCoinsEl = getEl('userCoins');
  const exitLobbyBtn = getEl('exitLobbyBtn');

  // Feedback Elements
  const feedbackModal = getEl('feedbackModal');
  const submitFeedbackBtn = getEl('submitFeedbackBtn');
  const skipFeedbackBtn = getEl('skipFeedbackBtn');
  const feedbackNameInput = getEl('feedbackName');

  // Game UI
  const playersListEl = getEl('playersList');
  const currentRoomCode = getEl('currentRoomCode');
  const gameTable = document.querySelector('.game-table');
  const gameContent = getEl('gameContent');
  const startGameBtn = getEl('startGameBtn');
  const roundTransition = getEl('roundTransition');

  // ==========================================================================
  // 3. SOUND ENGINE (Error Handling Added)
  // ==========================================================================
  const SoundEffects = {
    meme: {
      caught: new Audio('sounds/sabash.mp3'),
      escaped: new Audio('sounds/ias.mp3'),
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
        // We catch the error so 404s don't break the game logic
        audio.play().catch(e => console.warn(`Sound '${type}' failed:`, e.message));
    }
  }

  // ==========================================================================
  // 4. AUTHENTICATION SYSTEM
  // ==========================================================================
  firebase.auth().onAuthStateChanged(async (user) => {
    if (user) {
      // User logged in
      if(authModal) {
          authModal.classList.add('hidden');
          authModal.style.display = 'none'; // Ensure display none
      }
      if (logoutBtn) logoutBtn.classList.remove('hidden');
      await loadUserData(user.uid);
    } else {
      // User logged out
      if(authModal) {
          authModal.classList.remove('hidden');
          authModal.style.display = 'flex';
      }
      if (logoutBtn) logoutBtn.classList.add('hidden');
    }
  });

  async function loadUserData(uid) {
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      const initialData = {
        username: "Agent_" + uid.substring(0, 4),
        coins: 100, xp: 0, level: 1, inventory: [],
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await userRef.set(initialData);
      currentUserData = initialData;
    } else {
      currentUserData = doc.data();
    }
    if (userCoinsEl) userCoinsEl.innerText = (currentUserData.coins || 0) + " CR";
  }

  if (googleLoginBtn) {
    googleLoginBtn.onclick = () => {
      const provider = new firebase.auth.GoogleAuthProvider();
      firebase.auth().signInWithPopup(provider).catch(e => alert(e.message));
    };
  }

  if (guestLoginBtn) {
    guestLoginBtn.onclick = () => {
      firebase.auth().signInAnonymously().catch(e => alert(e.message));
    };
  }

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      if (confirm("Are you sure you want to sign out?")) {
        firebase.auth().signOut().then(() => location.reload());
      }
    };
  }

  async function requireAuth() {
    if (!firebase.auth().currentUser) {
      alert("Authentication Required.");
      throw new Error("Auth Required");
    }
    return firebase.auth().currentUser.uid;
  }

  // ==========================================================================
  // 5. STORE SYSTEM
  // ==========================================================================
  const storeItems = [
    { id: 'robot_avatar', type: 'avatars', name: 'Mecha Unit', price: 500, icon: '🤖', desc: 'Cybernetic organism.' },
    { id: 'alien_avatar', type: 'avatars', name: 'Xenoform', price: 750, icon: '👽', desc: 'Visitor from deep space.' },
    { id: 'hacker_avatar', type: 'avatars', name: 'Netrunner', price: 1000, icon: '🕵️', desc: 'Master of the grid.' },
    { id: 'gold_name', type: 'colors', name: 'Midas Touch', price: 2000, icon: '👑', desc: 'Golden glow text.' },
    { id: 'neon_name', type: 'colors', name: 'Glitch Red', price: 1500, icon: '🔴', desc: 'Aggressive red neon.' },
    { id: 'meme_pack', type: 'sounds', name: 'Meme Lord', price: 3000, icon: '📢', desc: 'Funny sound effects.' }
  ];

  if(openStoreBtn) {
    openStoreBtn.onclick = async () => {
      try { await requireAuth(); renderStore('avatars'); showScreen(storeScreen); } catch(e){}
    };
  }

  window.filterStore = (category) => {
    document.querySelectorAll('.store-tab').forEach(t => {
        t.classList.remove('text-white', 'border-neon-blue');
        t.classList.add('text-gray-500', 'border-transparent');
    });
    if(event && event.target) {
        event.target.classList.add('text-white', 'border-neon-blue');
        event.target.classList.remove('text-gray-500', 'border-transparent');
    }
    renderStore(category);
  };

  const storeGrid = document.getElementById('storeGrid');
  function renderStore(category) {
    if (!storeGrid) return;
    storeGrid.innerHTML = storeItems.filter(i => i.type === category).map(item => {
      const owned = currentUserData && currentUserData.inventory && currentUserData.inventory.includes(item.id);
      return `
        <div class="bg-black/60 border ${owned ? 'border-green-500' : 'border-gray-700'} p-4 rounded flex flex-col items-center text-center hover:bg-gray-900/80 transition">
          <div class="text-4xl mb-2">${item.icon}</div>
          <h4 class="font-cyber text-white text-sm tracking-wider">${item.name}</h4>
          <p class="text-gray-400 text-xs mb-3 font-mono h-8 leading-tight overflow-hidden">${item.desc}</p>
          ${owned 
            ? `<button class="w-full bg-green-900/30 text-green-400 border border-green-500 text-xs py-2 rounded cursor-default uppercase font-bold">OWNED</button>`
            : `<button onclick="buyItem('${item.id}', ${item.price})" class="w-full bg-neon-blue/10 hover:bg-neon-blue/30 text-neon-blue border border-neon-blue text-xs py-2 rounded uppercase font-bold transition">BUY ${item.price} 💰</button>`
          }
        </div>`;
    }).join('');
  }

  window.buyItem = async (itemId, price) => {
    if (currentUserData.coins < price) return alert("INSUFFICIENT FUNDS.");
    if (!confirm(`Purchase this item for ${price} coins?`)) return;

    const uid = firebase.auth().currentUser.uid;
    const userRef = db.collection('users').doc(uid);

    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        const data = doc.data();
        if (data.coins < price) throw "Not enough coins";
        t.update(userRef, { coins: data.coins - price, inventory: firebase.firestore.FieldValue.arrayUnion(itemId) });
      });
      await loadUserData(uid);
      // Refresh current view
      const item = storeItems.find(i => i.id === itemId);
      if(item) renderStore(item.type);
      playSound('cash');
      alert("SUCCESSFUL.");
    } catch (e) { alert("FAILED: " + e); }
  };

  // ==========================================================================
  // 6. NAVIGATION & FEEDBACK
  // ==========================================================================
  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen, storeScreen].forEach(s => {
      if(s) { s.classList.remove('active-screen'); s.style.display = 'none'; }
    });
    if (show) { show.style.display = 'flex'; show.classList.add('active-screen'); }
  }

  document.querySelectorAll('.create-btn').forEach(b => b.onclick = () => showScreen(createScreen));
  document.querySelectorAll('.join-btn').forEach(b => b.onclick = () => showScreen(joinScreen));
  document.querySelectorAll('.back-btn').forEach(btn => btn.onclick = () => showScreen(mainMenu));

  const openHistoryBtn = getEl('openHistoryBtn');
  const closeHistoryBtn = getEl('closeHistoryBtn');
  const historyModal = getEl('historyModal');
  if(openHistoryBtn) openHistoryBtn.onclick = () => { if(historyModal) { historyModal.classList.remove('hidden'); historyModal.style.display = 'flex'; }};
  if(closeHistoryBtn) closeHistoryBtn.onclick = () => { if(historyModal) { historyModal.classList.add('hidden'); historyModal.style.display = 'none'; }};

  // Exit & Feedback Logic
  if (exitLobbyBtn) {
      exitLobbyBtn.onclick = () => {
        if(unsubscribe) unsubscribe();
        if(feedbackNameInput) feedbackNameInput.value = playerName || "";
        if(feedbackModal) {
            feedbackModal.classList.remove('hidden');
            feedbackModal.style.display = 'flex';
        }
      };
  }

  if (submitFeedbackBtn) {
      submitFeedbackBtn.onclick = async () => {
          const name = feedbackNameInput ? feedbackNameInput.value : "Anon";
          const textEl = document.getElementById('feedbackText');
          const text = textEl ? textEl.value : "";
          
          const getRating = (n) => { const el = document.querySelector(`input[name="${n}"]:checked`); return el ? el.value : 0; };
          const ratings = { func: getRating('func'), gui: getRating('gui'), over: getRating('over') };
          
          try {
              await db.collection('rmcs_feedback').add({ name, text, ratings, time: firebase.firestore.FieldValue.serverTimestamp() });
              alert("Data Transmitted.");
              location.reload();
          } catch(e) { alert("Error sending feedback."); location.reload(); }
      };
  }

  if (skipFeedbackBtn) {
      skipFeedbackBtn.onclick = () => location.reload();
  }

  // ==========================================================================
  // 7. GAME ROOM LOGIC
  // ==========================================================================
  const createRoomBtn = getEl('createRoomFinal');
  if(createRoomBtn) {
    createRoomBtn.onclick = async () => {
      const nameInput = getEl('createPlayerName');
      const codeInput = getEl('createRoomCode');
      playerName = nameInput.value.trim();
      let code = codeInput.value.trim().toUpperCase() || Math.random().toString(36).substring(2, 6).toUpperCase();
      if(!playerName) return alert("Name required");
      
      try {
          const uid = await requireAuth();
          const ref = db.collection('rmcs_rooms').doc(code);
          if ((await ref.get()).exists) return alert("Code taken.");

          const playerData = {
              name: playerName, id: uid, 
              inventory: currentUserData.inventory || [],
              isVip: (currentUserData.inventory || []).includes('gold_name'),
              nameColor: (currentUserData.inventory || []).includes('gold_name') ? 'gold' : 'white'
          };

          await ref.set({ 
              host: uid, players: [playerData], phase: 'lobby', scores: {[uid]:0}, 
              created: firebase.firestore.FieldValue.serverTimestamp() 
          });
          roomId = code; listenToRoom(roomId); showScreen(gameScreen);
      } catch(e) { console.error(e); }
    };
  }

  const joinRoomBtn = getEl('joinRoomFinal');
  if(joinRoomBtn) {
    joinRoomBtn.onclick = async () => {
      const nameInput = getEl('joinPlayerName');
      const codeInput = getEl('joinRoomCode');
      playerName = nameInput.value.trim();
      let code = codeInput.value.trim().toUpperCase();
      if(!playerName || !code) return alert("Info required");

      try {
          const uid = await requireAuth();
          const ref = db.collection('rmcs_rooms').doc(code);
          const doc = await ref.get();
          if (!doc.exists) return alert("Room not found");

          const playerData = {
              name: playerName, id: uid, 
              inventory: currentUserData.inventory || [],
              isVip: (currentUserData.inventory || []).includes('gold_name'),
              nameColor: (currentUserData.inventory || []).includes('gold_name') ? 'gold' : 'white'
          };

          const currentPlayers = doc.data().players || [];
          if(!currentPlayers.some(p=>p.id===uid)) {
              if(currentPlayers.length >= 4) return alert("Room Full.");
              await ref.update({ players: firebase.firestore.FieldValue.arrayUnion(playerData), [`scores.${uid}`]: 0 });
          }
          roomId = code; listenToRoom(roomId); showScreen(gameScreen);
      } catch(e) { console.error(e); }
    };
  }

  // ==========================================================================
  // 8. GAME LOOP
  // ==========================================================================
  function listenToRoom(roomCode) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);

    unsubscribe = roomRef.onSnapshot(doc => {
      const data = doc.data();
      if(!firebase.auth().currentUser) return;
      const selfId = firebase.auth().currentUser.uid;

      if (!data) { alert("Room deleted."); showScreen(mainMenu); roomId = ''; return; }
      if (!data.players.some(p => p.id === selfId)) { alert("Removed from room."); showScreen(mainMenu); return; }

      if(currentRoomCode) currentRoomCode.innerText = roomCode;
      renderPlayersList(data.players);
      renderScoreboard(data.scores || {}, data.players);
      
      const historyContent = getEl('historyContent');
      if(historyContent && data.history) {
          historyContent.innerHTML = data.history.map((h,i) => `<div class="border-b border-gray-700 py-2 text-xs text-gray-300">Round ${i+1}: ${h.result}</div>`).join('');
      }

      const isHost = selfId === data.host;
      const cancelBtn = getEl('cancelRoomBtn');
      if(cancelBtn) { 
          cancelBtn.style.display = isHost ? 'block' : 'none'; 
          cancelBtn.onclick = () => { if(confirm("Terminate Session?")) roomRef.delete(); }; 
      }

      if (data.phase !== lastPhase) {
          if(data.phase === 'reveal') {
             playSound('reveal');
             if(roundTransition) { 
                 roundTransition.classList.remove('hidden'); 
                 roundTransition.style.display = 'flex'; 
                 setTimeout(() => roundTransition.style.display = 'none', 2500); 
             }
          }
      }
      lastPhase = data.phase;

      const table = document.querySelector('.game-table .table');

      if (data.phase === "lobby") {
        if(gameContent) gameContent.innerHTML = '';
        if(table) table.style.display = 'block';
        renderAvatarsTable(data.players, selfId);

        if(startGameBtn) {
            startGameBtn.style.display = 'flex';
            startGameBtn.disabled = !(isHost && data.players.length === 4);
            startGameBtn.innerText = (data.players.length === 4) ? "INITIATE SEQUENCE" : `WAITING (${data.players.length}/4)`;
            startGameBtn.classList.toggle('opacity-50', data.players.length !== 4);
            
            startGameBtn.onclick = () => {
                if(isHost && data.players.length === 4) {
                    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'].sort(() => Math.random() - 0.5);
                    const pr = data.players.map((p,i) => ({ id: p.id, name: p.name, role: roles[i] }));
                    roomRef.update({ phase: 'reveal', playerRoles: pr, revealed: [], guess: null, scoreUpdated: false });
                }
            };
        }
      } 
      else {
        if(startGameBtn) startGameBtn.style.display = 'none';
        if(table) table.style.display = 'block';
        
        if (data.phase === 'reveal') showRoleRevealScreen(data, selfId, roomRef);
        else if (data.phase === 'guess') showSipahiGuessUI(data, selfId, roomRef);
        else if (data.phase === 'roundResult') showRoundResult(data, selfId, roomRef, isHost);
      }
    });
  }

  // --- GAME RENDERERS ---
  function showRoleRevealScreen(data, selfId, roomRef) {
    const p = data.playerRoles.find(p => p.id === selfId);
    const isRS = (p.role === 'Raja' || p.role === 'Sipahi'); 
    const revealed = data.revealed || [];
    const amIRevealed = revealed.some(r => r.id === selfId);

    if (data.host === selfId) {
        const rRevealed = revealed.some(r => r.role === 'Raja');
        const sRevealed = revealed.some(r => r.role === 'Sipahi');
        if (rRevealed && sRevealed) { roomRef.update({ phase: 'guess', revealed: [] }); return; }
    }

    if(gameContent) {
        gameContent.innerHTML = `
          <div class="flex flex-col items-center animate-fade-in">
              <div class="text-5xl mb-2">${getRoleIcon(p.role)}</div>
              <h3 class="font-cyber text-2xl text-neon-blue mb-4">${p.role}</h3>
              ${(isRS && !amIRevealed) 
                ? `<button id="revealRoleBtn" class="cyber-btn danger text-xs">EXPOSE IDENTITY</button>` 
                : (!isRS ? `<div class="text-gray-500 text-xs border border-gray-700 px-2 py-1">STAY COVERT</div>` : `<div class="text-neon-green text-xs font-bold animate-pulse">IDENTITY EXPOSED</div>`)
              }
          </div>`;
        
        const btn = document.getElementById('revealRoleBtn');
        if(btn) btn.onclick = () => {
            roomRef.update({ revealed: firebase.firestore.FieldValue.arrayUnion({ id: selfId, role: p.role, name: p.name }) });
        };
    }
  }

  function showSipahiGuessUI(data, selfId, roomRef) {
    if(!gameContent) return;
    const p = data.playerRoles.find(p => p.id === selfId);
    if (p.role !== 'Sipahi') {
        gameContent.innerHTML = `<div class="text-center animate-fade-in"><div class="text-5xl mb-2 animate-bounce">🛡️</div><h3 class="text-neon-blue font-bold">SIPAHI IS ANALYZING...</h3></div>`;
        return;
    }
    let targets = data.playerRoles.filter(pr => pr.role !== 'Raja' && pr.role !== 'Sipahi');
    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-64 animate-fade-in">
        <h3 class="font-cyber text-white mb-4 text-sm bg-black/80 px-2">IDENTIFY THE CHOR</h3>
        <div class="grid grid-cols-1 gap-2 w-full">
            ${targets.map(t => `<button class="guess-btn cyber-btn w-full py-2 text-sm" data-id="${t.id}">${t.name}</button>`).join('')}
        </div>
      </div>`;
    document.querySelectorAll('.guess-btn').forEach(btn => {
        btn.onclick = () => {
            const t = targets.find(tg => tg.id === btn.dataset.id);
            roomRef.update({ phase: 'roundResult', guess: { sipahiId: p.id, guessedId: t.id, correct: t.role === 'Chor', guessedName: t.name }, scoreUpdated: false });
        };
    });
  }

  function showRoundResult(data, selfId, roomRef, isHost) {
    if(!gameContent) return;
    const res = data.guess;
    const isCorrect = res.correct;
    
    if (!data.scoreUpdated) { if (isCorrect) playSound('caught'); else playSound('escaped'); }

    if (isHost && !data.scoreUpdated) {
       const roundPoints = calculateRoundPoints(data.playerRoles, isCorrect);
       const newScores = { ...data.scores };
       Object.keys(roundPoints).forEach(uid => { newScores[uid] = (newScores[uid] || 0) + roundPoints[uid]; });
       const historyEntry = { result: isCorrect?'Caught':'Escaped' };
       
       roomRef.update({ scores: newScores, history: firebase.firestore.FieldValue.arrayUnion(historyEntry), scoreUpdated: true });
       data.playerRoles.forEach(p => { db.collection('users').doc(p.id).update({ xp: firebase.firestore.FieldValue.increment(50), coins: firebase.firestore.FieldValue.increment(10) }); });
    }

    const resultText = isCorrect ? 'CHOR CAUGHT' : 'CHOR ESCAPED';
    const resultColor = isCorrect ? 'text-neon-green' : 'text-red-500';
    const resultEmoji = isCorrect ? '🎯' : '🤡';
    const roleMap = {}; 
    data.playerRoles.forEach(p => roleMap[p.role] = p.name);

    const hostBtnHtml = isHost 
      ? `<button id="rebootBtn" class="cyber-btn w-full mt-2 text-xs py-2 shadow-[0_0_15px_rgba(0,243,255,0.4)]">REBOOT SYSTEM</button>` 
      : `<div class="mt-2 text-[10px] text-gray-500 animate-pulse">WAITING FOR HOST...</div>`;

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-64 animate-fade-in bg-black/90 p-4 border border-neon-blue/50 rounded-lg">
        <div class="text-4xl mb-1">${resultEmoji}</div>
        <h2 class="font-cyber text-lg ${resultColor} mb-4">${resultText}</h2>
        <div class="w-full text-xs space-y-1 font-mono text-left mb-4">
           <div class="flex justify-between"><span class="text-yellow-300">RAJA</span> <span>${roleMap['Raja']}</span></div>
           <div class="flex justify-between"><span class="text-fuchsia-300">MANTRI</span> <span>${roleMap['Mantri']}</span></div>
           <div class="flex justify-between"><span class="text-cyan-300">SIPAHI</span> <span>${roleMap['Sipahi']}</span></div>
           <div class="flex justify-between"><span class="text-rose-400">CHOR</span> <span>${roleMap['Chor']}</span></div>
        </div>
        ${hostBtnHtml}
      </div>`;

    if (isHost) {
        setTimeout(() => {
            const btn = document.getElementById('rebootBtn');
            if (btn) {
                btn.onclick = () => {
                    btn.innerText = "INITIALIZING...";
                    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'].sort(() => Math.random() - 0.5);
                    const pr = data.playerRoles.map((p,i) => ({ id: p.id, name: p.name, role: roles[i] }));
                    roomRef.update({ phase: 'reveal', playerRoles: pr, revealed: [], guess: null, scoreUpdated: false });
                };
            }
        }, 100);
    }
  }

  function getRoleIcon(role) {
      if(role === 'Raja') return '👑';
      if(role === 'Mantri') return '🧠';
      if(role === 'Sipahi') return '🛡️';
      if(role === 'Chor') return '🔪';
      return '❓';
  }

  function calculateRoundPoints(roles, isCorrect) {
      const pts = {};
      roles.forEach(p => {
          if (p.role === 'Raja') pts[p.id] = 1000;
          else if (p.role === 'Mantri') pts[p.id] = 800;
          else if (p.role === 'Sipahi') pts[p.id] = isCorrect ? 500 : 0;
          else if (p.role === 'Chor') pts[p.id] = isCorrect ? 0 : 500;
      });
      return pts;
  }

  function renderPlayersList(players) {
      if(!playersListEl) return;
      const uid = firebase.auth().currentUser.uid;
      playersListEl.innerHTML = players.map(p => `
        <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-800 ${p.isVip ? 'bg-yellow-900/10' : ''}">
            <span class="${p.id===uid?'text-neon-green':'text-gray-500'} text-xs">●</span>
            <span class="${p.nameColor==='gold'?'text-yellow-400 font-bold drop-shadow-sm':'text-gray-300'} text-sm">${p.name}</span>
            ${p.isVip ? '<i class="fa-solid fa-crown text-yellow-500 text-[10px] ml-auto"></i>' : ''}
        </div>`).join('');
  }

  function renderScoreboard(scores, players) {
      const list = document.getElementById('scoreList');
      if(!list) return;
      const sorted = players.map(p => ({name: p.name, score: scores[p.id]||0})).sort((a,b)=>b.score-a.score);
      list.innerHTML = sorted.map(x => `
        <div class="flex justify-between px-2 py-1 text-xs text-gray-400 border-b border-gray-800 hover:bg-white/5">
            <span>${x.name}</span>
            <span class="text-neon-pink font-mono">${x.score}</span>
        </div>
      `).join('');
  }

  function renderAvatarsTable(players, selfId) {
    const table = document.querySelector('.game-table');
    if(!table) return;
    table.querySelectorAll('.avatar').forEach(e => e.remove());
    const N = players.length;
    if(N===0) return;
    const radius = 130, cx = 160, cy = 160;
    const selfIdx = players.findIndex(p=>p.id===selfId);
    
    players.forEach((p, i) => {
        const logicalIdx = (i - selfIdx + N) % N; 
        const angle = Math.PI/2 + (2 * Math.PI * logicalIdx) / N; 
        const x = cx + radius * Math.cos(angle) - 35;
        const y = cy + radius * Math.sin(angle) - 35;
        const el = document.createElement('div');
        el.className = 'avatar';
        el.style.left = x + 'px'; el.style.top = y + 'px';
        let icon = '👤';
        if(p.inventory && p.inventory.includes('robot_avatar')) icon = '🤖';
        if(p.inventory && p.inventory.includes('alien_avatar')) icon = '👽';
        if(p.inventory && p.inventory.includes('hacker_avatar')) icon = '🕵️';
        el.innerHTML = `<span class="text-3xl">${icon}</span><div class="avatar-name">${p.name}</div>`;
        if(p.id === selfId) { el.style.borderColor = 'var(--neon-green)'; el.style.boxShadow = '0 0 15px var(--neon-green)'; }
        table.appendChild(el);
    });
  }
});
