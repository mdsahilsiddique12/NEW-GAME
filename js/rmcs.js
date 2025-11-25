document.addEventListener("DOMContentLoaded", function () {
  // --- FIREBASE & STATE ---
  const db = firebase.firestore();
  let unsubscribe = null;
  let roomId = '';
  let playerName = '';
  let currentUserData = null; // Holds XP, Level, Inventory

  // --- DOM ELEMENTS ---
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

  // Modals
  const messageBox     = document.getElementById('messageBox');
  const historyModal   = document.getElementById('historyModal');
  const openHistoryBtn = document.getElementById('openHistoryBtn');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');

  // Feedback DOM
  const feedbackModal     = document.getElementById('feedbackModal');
  const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
  const skipFeedbackBtn   = document.getElementById('skipFeedbackBtn');
  const feedbackNameInput = document.getElementById('feedbackName');


  // Store and Purchases
  const storeScreen = document.getElementById('storeScreen');
  const openStoreBtn = document.getElementById('openStoreBtn');
  const userCoinsEl = document.getElementById('userCoins');
  const storeGrid = document.getElementById('storeGrid');

  // --- SOUND ENGINE (MEME PACKS) ---
  const SoundEffects = {
    default: {
      win: new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'),
      fail: new Audio('https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3'),
      reveal: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3')
    },
    meme: {
      // Replace these with real URLs later. Using placeholders for now.
      win: new Audio('https://www.myinstants.com/media/sounds/oh-my-god-wow.mp3'), // Placeholder
      fail: new Audio('https://www.myinstants.com/media/sounds/spongebob-fail.mp3'), // Placeholder
      reveal: new Audio('https://www.myinstants.com/media/sounds/vine-boom.mp3') // Placeholder
    }
  };

  function playSound(type) {
    // Check inventory for 'meme_pack'
    const pack = (currentUserData && currentUserData.inventory && currentUserData.inventory.includes('meme_pack')) ? 'meme' : 'default';
    try {
      if(SoundEffects[pack][type]) {
        SoundEffects[pack][type].currentTime = 0;
        SoundEffects[pack][type].play();
      }
    } catch(e) { console.log("Audio blocked:", e); }
  }
    // --- STORE DATA ---
  const storeItems = [
    // AVATARS
    { id: 'robot_avatar', type: 'avatars', name: 'Mecha Unit', price: 500, icon: '🤖', desc: 'Cybernetic organism.' },
    { id: 'alien_avatar', type: 'avatars', name: 'Xenoform', price: 750, icon: '👽', desc: 'Visitor from deep space.' },
    { id: 'hacker_avatar', type: 'avatars', name: 'Netrunner', price: 1000, icon: '🕵️', desc: 'Master of the grid.' },
    
    // NAME COLORS (Designed for High Visibility)
    { id: 'gold_name', type: 'colors', name: 'Midas Touch', price: 2000, icon: '👑', desc: 'Golden glow text.', css: 'color:#FFD700; text-shadow:0 0 5px black;' },
    { id: 'neon_name', type: 'colors', name: 'Glitch Red', price: 1500, icon: '🔴', desc: 'Aggressive red neon.', css: 'color:#ff003c; text-shadow:0 0 5px black;' },
    
    // SOUND PACKS
    { id: 'meme_pack', type: 'sounds', name: 'Meme Lord', price: 3000, icon: '📢', desc: 'Funny sound effects.' }
  ];

  // --- STORE LOGIC ---
  
  // 1. Open Store
  if(openStoreBtn) {
    openStoreBtn.onclick = async () => {
      const uid = await authAndLoadUser();
      userCoinsEl.innerText = currentUserData.coins || 0;
      renderStore('avatars'); // Default tab
      showScreen(storeScreen);
    };
  }

  // 2. Render Items
  window.filterStore = (category) => {
    // Update Tab UI
    document.querySelectorAll('.store-tab').forEach(t => {
        t.classList.remove('text-white', 'border-neon-blue');
        t.classList.add('text-gray-500', 'border-transparent');
    });
    event.target.classList.add('text-white', 'border-neon-blue');
    event.target.classList.remove('text-gray-500', 'border-transparent');
    
    renderStore(category);
  };

  function renderStore(category) {
    storeGrid.innerHTML = storeItems.filter(i => i.type === category).map(item => {
      const owned = currentUserData.inventory.includes(item.id);
      
      return `
        <div class="bg-black/60 border ${owned ? 'border-green-500' : 'border-gray-700'} p-4 rounded flex flex-col items-center text-center hover:bg-gray-900/80 transition">
          <div class="text-4xl mb-2">${item.icon}</div>
          <h4 class="font-cyber text-white text-sm tracking-wider">${item.name}</h4>
          <p class="text-gray-400 text-xs mb-3 font-mono h-8 leading-tight overflow-hidden">${item.desc}</p>
          
          ${owned 
            ? `<button class="w-full bg-green-900/30 text-green-400 border border-green-500 text-xs py-2 rounded cursor-default uppercase font-bold">OWNED</button>`
            : `<button onclick="buyItem('${item.id}', ${item.price})" class="w-full bg-neon-blue/10 hover:bg-neon-blue/30 text-neon-blue border border-neon-blue text-xs py-2 rounded uppercase font-bold transition">
                 BUY ${item.price} 💰
               </button>`
          }
        </div>
      `;
    }).join('');
  }

  // 3. Buy Function
  window.buyItem = async (itemId, price) => {
    if (currentUserData.coins < price) {
      alert("INSUFFICIENT FUNDS. Complete missions to earn credits.");
      return;
    }

    if (!confirm(`Purchase this item for ${price} coins?`)) return;

    const uid = firebase.auth().currentUser.uid;
    const userRef = db.collection('users').doc(uid);

    try {
      // Use Transaction for safety
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        const data = doc.data();
        if (data.coins < price) throw "Not enough coins";
        
        const newCoins = data.coins - price;
        const newInventory = [...data.inventory, itemId];
        
        t.update(userRef, { coins: newCoins, inventory: newInventory });
      });
      
      // Refresh Local Data
      await authAndLoadUser();
      userCoinsEl.innerText = currentUserData.coins;
      
      // Re-render current tab to show "OWNED"
      const currentTab = storeItems.find(i => i.id === itemId).type;
      renderStore(currentTab);
      
      alert("TRANSACTION SUCCESSFUL.");
    } catch (e) {
      alert("TRANSACTION FAILED: " + e);
    }
  };


  // --- USER PROFILE SYSTEM (XP & COSMETICS) ---
  async function authAndLoadUser() {
    if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
    const uid = firebase.auth().currentUser.uid;

    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      // New User Profile
      const initialData = {
        inventory: [], // e.g. ['gold_name', 'robot_avatar', 'meme_pack']
        coins: 0,
        xp: 0,
        level: 1,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await userRef.set(initialData);
      currentUserData = initialData;
    } else {
      currentUserData = doc.data();
    }
    return uid;
  }

  function getAvatarIcon(inventory) {
    if (!inventory) return '👤';
    if (inventory.includes('robot_avatar')) return '🤖';
    if (inventory.includes('alien_avatar')) return '👽';
    if (inventory.includes('hacker_avatar')) return '🕵️';
    return '👤';
  }

  // --- NAVIGATION ---
  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(s => {
      if(s) { s.classList.remove('active-screen'); s.style.display = 'none'; }
    });
    if (show) { show.style.display = 'flex'; show.classList.add('active-screen'); }
  }

  document.querySelector('.create-btn').onclick = () => showScreen(createScreen);
  document.querySelector('.join-btn').onclick   = () => showScreen(joinScreen);
  document.querySelectorAll('.back-btn').forEach(btn => btn.onclick = () => showScreen(mainMenu));

  if(openHistoryBtn) openHistoryBtn.onclick = () => { if(historyModal) { historyModal.classList.remove('hidden'); historyModal.style.display = 'flex'; }};
  if(closeHistoryBtn) closeHistoryBtn.onclick = () => { if(historyModal) { historyModal.classList.add('hidden'); historyModal.style.display = 'none'; }};

  // --- GAME LOGIC HELPERS ---
  function assignRoles(players) {
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    const shuffled = [...roles].sort(() => Math.random() - 0.5);
    return players.map((p, i) => ({ id: p.id, name: p.name, role: shuffled[i] }));
  }

  function calculateRoundPoints(playerRoles, isCorrect) {
    const points = {};
    playerRoles.forEach(p => {
        if (p.role === 'Raja') points[p.id] = 1000;
        else if (p.role === 'Mantri') points[p.id] = 800;
        else if (p.role === 'Sipahi') points[p.id] = isCorrect ? 500 : 0;
        else if (p.role === 'Chor') points[p.id] = isCorrect ? 0 : 500;
    });
    return points;
  }

  // --- UI RENDERERS ---
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
    const uid = firebase.auth().currentUser.uid;
    
    playersListEl.innerHTML = players.map(p => {
      // PREMIUM STYLING
      const isVip = p.isVip;
      const isGold = p.nameColor === 'gold';
      
      const nameClass = isGold ? 'text-yellow-400 drop-shadow-[0_0_5px_rgba(255,215,0,0.8)]' : 'text-gray-300';
      const borderClass = isVip ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-gray-700 bg-gray-900/50';
      const badgeHtml = isVip ? '<span class="ml-2 text-[10px] bg-yellow-500 text-black px-1 rounded font-bold">PRO</span>' : '';

      return `
        <div class="flex items-center gap-2 px-3 py-1 border ${borderClass} rounded text-xs uppercase font-bold transition hover:scale-105">
          <span class="${p.id === uid ? 'text-neon-green' : 'text-neon-blue'} text-lg">●</span>
          <span class="${nameClass}">${p.name}</span>
          ${badgeHtml}
        </div>`;
    }).join('');
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
      
      // Avatar Logic
      const icon = getAvatarIcon(players[i].inventory); // Use premium avatar if available

      if(isSelf) { avatar.style.borderColor = 'var(--neon-green)'; avatar.style.boxShadow = '0 0 20px var(--neon-green)'; }
      else { avatar.style.borderColor = 'var(--neon-blue)'; }

      avatar.innerHTML = `<span class="text-3xl drop-shadow-md">${icon}</span><div class="avatar-name" style="${isSelf ? 'color:var(--neon-green)' : ''}">${players[i].name}</div>`;
      gameTable.appendChild(avatar);
    }
  }

  // --- MAIN ROOM LISTENER ---
  let currentRound = 0; 
  let lastPhase = '';

  function listenToRoom(roomCode) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);

    unsubscribe = roomRef.onSnapshot(doc => {
      const data = doc.data();
      const selfId = firebase.auth().currentUser.uid;

      if (!data) { alert("Room deleted."); showScreen(mainMenu); roomId = ''; return; }
      if (!data.players.some(p => p.id === selfId)) { alert("You were removed."); showScreen(mainMenu); return; }

      renderRoomCode(roomCode);
      renderPlayersList(data.players);
      renderScoreboard(data.scores || {}, data.players);
      renderHistoryTable(data.history || []);

      const isHost = selfId === data.host;
      if (cancelRoomBtn) { cancelRoomBtn.style.display = isHost ? 'block' : 'none'; cancelRoomBtn.onclick = isHost ? handleCancelRoom : null; }

      const roundNum = (data.history ? data.history.length : 0) + 1;

      // Round Transition
      const transitionEl = document.getElementById('roundTransition');
      const roundTitle = document.getElementById('roundTitle');
      if (data.phase === 'reveal' && lastPhase !== 'reveal') {
          if(transitionEl && roundTitle) {
              roundTitle.textContent = `ROUND ${roundNum}`;
              transitionEl.classList.remove('hidden');
              transitionEl.style.display = 'flex';
              setTimeout(() => {
                  transitionEl.classList.add('hidden');
                  transitionEl.style.display = 'none';
              }, 3000);
              
              // Play Sound
              playSound('reveal');
          }
      }
      lastPhase = data.phase;

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

          startGameBtn.onclick = async () => {
            if (!(isHost && data.players.length === 4)) return;
            const roles = assignRoles(data.players);
            await roomRef.update({ phase: 'reveal', playerRoles: roles, revealed: [], guess: null, scoreUpdated: false });
          };
        }
      } else {
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
    
    // Sound Triggers
    if (!data.scoreUpdated) { // Play only once when result first loads
       // For you, play appropriate sound
       if (isCorrect) playSound('win'); 
       else playSound('fail');
    }

    if (isHost && !data.scoreUpdated) {
       const roundPoints = calculateRoundPoints(data.playerRoles, isCorrect);
       const historyEntry = { timestamp: new Date().toISOString(), roles: data.playerRoles, points: roundPoints, result: isCorrect?'Caught':'Escaped' };
       
       const newScores = { ...data.scores };
       Object.keys(roundPoints).forEach(uid => { newScores[uid] = (newScores[uid] || 0) + roundPoints[uid]; });

       // Award XP to everyone (Simple +10xp per round)
       data.playerRoles.forEach(p => {
          db.collection('users').doc(p.id).update({ xp: firebase.firestore.FieldValue.increment(10) });
       });

       roomRef.update({
           scores: newScores,
           history: firebase.firestore.FieldValue.arrayUnion(historyEntry),
           scoreUpdated: true
       });
    }

    const roleMap = {}; 
    data.playerRoles.forEach(p => roleMap[p.role] = p.name);
    
    const resultText = isCorrect ? 'TARGET NEUTRALIZED' : 'MISSION FAILED';
    const resultColor = isCorrect ? 'text-neon-green' : 'text-red-500';
    const resultEmoji = isCorrect ? '🎯' : '❌';

    const resultsHtml = `
      <div class="w-full bg-black/80 border border-gray-600 p-4 rounded mt-4 text-left shadow-lg">
        <div class="flex justify-between items-center border-b border-gray-500 pb-1 mb-2">
          <span class="text-xs text-gray-300 uppercase tracking-wider">Mission Report</span>
        </div>
        <div class="space-y-2 text-base font-bold font-mono">
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
      </div>`;

    const hostControlsHtml = isHost 
      ? `<button id="nextRoundBtn" class="cyber-btn w-full mt-4 py-3 shadow-[0_0_15px_rgba(0,243,255,0.4)]">REBOOT SYSTEM</button>` 
      : `<div class="mt-4 text-xs text-gray-500 animate-pulse text-center">WAITING FOR HOST REBOOT...</div>`;

    gameContent.innerHTML = `
      <div class="flex flex-col items-center w-full animate-fade-in px-2">
        <div class="text-6xl mb-2 filter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">${resultEmoji}</div>
        <h2 class="font-cyber text-xl md:text-2xl ${resultColor} uppercase tracking-widest text-center drop-shadow-lg break-words w-full leading-tight">
          ${resultText}
        </h2>
        ${resultsHtml}
        ${hostControlsHtml}
      </div>`;

    if (isHost) {
        setTimeout(() => {
            const nb = document.getElementById('nextRoundBtn');
            if (nb) {
                nb.onclick = async () => {
                    nb.textContent = "INITIALIZING...";
                    nb.disabled = true; 
                    const roles = assignRoles(data.playerRoles); 
                    await roomRef.update({ 
                        phase: 'reveal', 
                        playerRoles: roles, 
                        revealed: [], 
                        guess: null, 
                        scoreUpdated: false 
                    });
                };
            }
        }, 100);
    }
  }

  // --- FEEDBACK & EXIT LOGIC ---
  if(exitLobbyBtn) {
      exitLobbyBtn.onclick = () => {
        if(unsubscribe) unsubscribe();
        feedbackNameInput.value = playerName || ""; 
        feedbackModal.classList.remove('hidden');
        feedbackModal.style.display = 'flex';
      };
  }

  if(submitFeedbackBtn) {
      submitFeedbackBtn.onclick = async () => {
        const name = document.getElementById('feedbackName').value.trim() || "Anonymous Agent";
        const suggestion = document.getElementById('feedbackText').value.trim();
        const getRating = (groupName) => {
          const el = document.querySelector(`input[name="${groupName}"]:checked`);
          return el ? parseInt(el.value) : 0;
        };
        const ratings = { functionality: getRating('func'), overall: getRating('over'), gui: getRating('gui') };

        if (ratings.overall === 0) { alert("Please provide Overall Rating."); return; }

        submitFeedbackBtn.innerText = "TRANSMITTING...";
        submitFeedbackBtn.disabled = true;
        
        try {
          await db.collection('rmcs_feedback').add({ name: name, ratings: ratings, suggestion: suggestion, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
          alert("Data Transmitted. Session Terminated.");
          location.reload();
        } catch (error) {
          alert("Error sending feedback. Exiting.");
          location.reload();
        }
      };
  }

  if(skipFeedbackBtn) {
      skipFeedbackBtn.onclick = () => { if(confirm("Abort Debriefing?")) location.reload(); };
  }

  async function handleCancelRoom() {
    if(confirm("Terminate Session?")) await db.collection('rmcs_rooms').doc(roomId).delete();
  }

  // --- CREATE & JOIN (WITH PREMIUM CHECK) ---
  document.getElementById('createRoomFinal').onclick = async () => {
    playerName = document.getElementById('createPlayerName').value.trim();
    let code = document.getElementById('createRoomCode').value.trim().toUpperCase() || Math.random().toString(36).substring(2, 6).toUpperCase();
    if(!playerName) return alert("Name required");
    
    const uid = await authAndLoadUser(); // Load Premium Data First

    const ref = db.collection('rmcs_rooms').doc(code);
    if ((await ref.get()).exists) return alert("Code taken");

    const playerData = {
        name: playerName, 
        id: uid,
        // Premium Attributes
        inventory: currentUserData.inventory, 
        isVip: currentUserData.inventory.includes('gold_name'),
        nameColor: currentUserData.inventory.includes('gold_name') ? 'gold' : 'white'
    };

    ref.set({ 
        host: uid, 
        players: [playerData], 
        phase: 'lobby', 
        scores: {[uid]:0}, 
        created: firebase.firestore.FieldValue.serverTimestamp() 
    });
    roomId = code; listenToRoom(roomId); showScreen(gameScreen);
  };

  document.getElementById('joinRoomFinal').onclick = async () => {
    playerName = document.getElementById('joinPlayerName').value.trim();
    let code = document.getElementById('joinRoomCode').value.trim().toUpperCase();
    if(!playerName || !code) return alert("Info required");

    const uid = await authAndLoadUser(); // Load Premium Data First
    
    const ref = db.collection('rmcs_rooms').doc(code);
    const doc = await ref.get();
    if (!doc.exists) return alert("Room not found");
    
    const playerData = {
        name: playerName, 
        id: uid,
        inventory: currentUserData.inventory,
        isVip: currentUserData.inventory.includes('gold_name'),
        nameColor: currentUserData.inventory.includes('gold_name') ? 'gold' : 'white'
    };

    if(!doc.data().players.some(p=>p.id===uid)) {
        ref.update({ players: firebase.firestore.FieldValue.arrayUnion(playerData), [`scores.${uid}`]: 0 });
    }
    roomId = code; listenToRoom(roomId); showScreen(gameScreen);
  };
});
