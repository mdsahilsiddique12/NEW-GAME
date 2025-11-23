document.addEventListener("DOMContentLoaded", function() {
  const firestore = firebase.firestore();
  let roomId = '';
  let playerName = '';
  let unsubscribe = null;
  let myRole = '';
  let myPlayerId = '';
  
  // DOM Elements
  const createBtn = document.getElementById('createRoom');
  const joinBtn = document.getElementById('joinRoom');
  const nameInputCreate = document.getElementById('nameInputCreate');
  const nameInputJoin = document.getElementById('nameInputJoin');
  const joinCodeInput = document.getElementById('joinCode');
  const gameContent = document.getElementById('gameContent');

  // --- HELPERS ---
  function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  }

  function getPlayerName(isCreating) {
    const mainInput = document.getElementById('playerName').value.trim();
    if (mainInput) return mainInput;
    return isCreating ? (nameInputCreate ? nameInputCreate.value.trim() : '') 
                      : (nameInputJoin ? nameInputJoin.value.trim() : '');
  }

  // --- 1. CREATE ROOM ---
  if (createBtn) {
    createBtn.onclick = async () => {
      playerName = getPlayerName(true);
      if (!playerName) return alert('Agent Name Required!');
      
      if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
      const uid = firebase.auth().currentUser.uid;

      let newCode = generateRoomCode(); // In real app, check collision
      
      await firestore.collection('detective_rooms').doc(newCode).set({
        host: playerName,
        hostId: uid,
        players: [{ name: playerName, id: uid, alive: true, role: null }],
        state: 'waiting',
        winner: null,
        logs: [] // To show "Player X died" events
      });
      
      roomId = newCode;
      listenToRoom(roomId);
    };
  }

  // --- 2. JOIN ROOM ---
  if (joinBtn) {
    joinBtn.onclick = async () => {
      playerName = getPlayerName(false);
      const code = joinCodeInput.value.trim().toUpperCase();
      if (!playerName || !code) return alert('Name & Code Required!');

      if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
      const uid = firebase.auth().currentUser.uid;

      const roomRef = firestore.collection('detective_rooms').doc(code);
      
      try {
        await firestore.runTransaction(async (t) => {
          const doc = await t.get(roomRef);
          if (!doc.exists) throw 'Invalid Room Code';
          const data = doc.data();
          
          if (!data.players.some(p => p.id === uid)) {
            if (data.players.length >= 10) throw 'Room Full!';
            if (data.state !== 'waiting') throw 'Game in progress!';
            
            t.update(roomRef, {
              players: firebase.firestore.FieldValue.arrayUnion({
                name: playerName, id: uid, alive: true, role: null
              })
            });
          }
        });
        roomId = code;
        listenToRoom(roomId);
      } catch (e) { alert(e); }
    };
  }

  // --- 3. GAME LISTENER ---
  function listenToRoom(code) {
    if (unsubscribe) unsubscribe();
    if (document.getElementById('view-menu')) {
        document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
        gameContent.style.display = 'block';
    }

    unsubscribe = firestore.collection('detective_rooms').doc(code).onSnapshot(doc => {
      if (!doc.exists) return location.reload(); // Reload if room deleted
      const data = doc.data();
      const uid = firebase.auth().currentUser.uid;
      const me = data.players.find(p => p.id === uid);
      
      myRole = me ? me.role : '';
      myPlayerId = uid;

      if (data.state === 'waiting') {
        renderLobby(code, data.players, data.hostId === uid);
      } else if (data.state === 'playing') {
        renderGameScreen(data, me); // NEW: Handles gameplay UI
      } else if (data.state === 'finished') {
        renderGameOver(data.winner);
      }
    });
  }

  // --- 4. RENDER LOBBY ---
  function renderLobby(code, players, isHost) {
    let html = `
      <div style="text-align:center;">
        <h3 style="color:#666;">MISSION CODE</h3>
        <div style="display:flex; justify-content:center; gap:10px; align-items:center; margin-bottom:20px;">
            <h1 class="room-code" style="margin:0;">${code}</h1>
            <button class="btn" style="width:auto; padding:5px 15px;" onclick="navigator.clipboard.writeText('${code}')">COPY</button>
        </div>
        <div id="pGrid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          ${players.map(p => `<div class="player-card" style="color:#fff; border:1px solid #00ff41;">${p.name}</div>`).join('')}
        </div>
        ${isHost ? `<button id="startBtn" class="btn btn-action-red" style="margin-top:20px;">START MISSION</button>` : `<p class="blink" style="color:#00ff41; margin-top:20px;">WAITING FOR HOST...</p>`}
      </div>`;
    
    gameContent.innerHTML = html;
    
    if (isHost) {
        const b = document.getElementById('startBtn');
        if(b) b.onclick = () => startGame(players);
    }
  }

  // --- 5. RENDER GAME SCREEN (ACTION PHASE) ---
  function renderGameScreen(data, me) {
    if (!me.alive) {
        gameContent.innerHTML = `<h1 style="color:red; text-align:center; margin-top:50px;">YOU ARE DEAD</h1><p style="text-align:center;">Wait for the mission to end.</p>`;
        return;
    }

    // Role Banner
    let roleColor = me.role === 'Killer' ? 'var(--neon-red)' : me.role === 'Detective' ? 'var(--neon-cyan)' : '#fff';
    
    let html = `
      <div style="border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:20px; text-align:center;">
        <div style="font-size:0.8rem; color:#666;">CURRENT IDENTITY</div>
        <h2 style="color:${roleColor}; font-size:2rem; margin:5px 0;">${me.role}</h2>
      </div>
      
      <h3 style="font-size:1rem; color:#888; margin-bottom:10px;">AGENTS STATUS:</h3>
      <div style="display:flex; flex-direction:column; gap:10px;">
    `;

    // Render Players List with Actions
    data.players.forEach(p => {
        if (!p.alive) {
             // Dead Player Entry
            html += `<div style="background:#330000; border:1px solid #550000; padding:10px; color:#888; text-decoration:line-through;">${p.name} (DEAD)</div>`;
        } else {
            // Living Player Entry
            let actionButton = '';
            
            // Don't show buttons for self
            if (p.id !== me.id) {
                if (me.role === 'Killer') {
                    actionButton = `<button onclick="killPlayer('${p.id}', '${p.name}')" style="float:right; background:var(--neon-red); border:none; color:#fff; padding:5px 10px; cursor:pointer; font-weight:bold;">KILL</button>`;
                } else if (me.role === 'Detective') {
                    actionButton = `<button onclick="arrestPlayer('${p.id}', '${p.name}')" style="float:right; background:var(--neon-cyan); border:none; color:#000; padding:5px 10px; cursor:pointer; font-weight:bold;">ARREST</button>`;
                }
            }
            
            html += `<div style="background:rgba(255,255,255,0.05); border:1px solid #444; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                        <span>${p.name} ${p.id === me.id ? '(YOU)' : ''}</span>
                        ${actionButton}
                     </div>`;
        }
    });
    html += `</div>`;

    // Logs Area
    if(data.logs && data.logs.length > 0) {
        html += `<div style="margin-top:20px; border-top:1px dashed #444; padding-top:10px; font-size:0.8rem; color:#aaa;">
                    <div style="margin-bottom:5px;">MISSION LOGS:</div>
                    ${data.logs.slice(-3).map(l => `<div>> ${l}</div>`).join('')}
                 </div>`;
    }

    gameContent.innerHTML = html;
  }

  function renderGameOver(winner) {
      let color = winner === 'Detectives' ? 'var(--neon-cyan)' : 'var(--neon-red)';
      let msg = winner === 'Detectives' ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED';
      
      gameContent.innerHTML = `
        <div style="text-align:center; margin-top:50px;">
            <h1 style="color:${color}; font-size:3rem; text-shadow:0 0 20px ${color};">${msg}</h1>
            <h3 style="color:#fff;">WINNER: ${winner.toUpperCase()}</h3>
            <button onclick="location.reload()" class="btn" style="margin-top:30px;">MAIN MENU</button>
        </div>
      `;
  }

  // --- 6. ACTIONS (Global Scope for HTML onclick) ---
  window.killPlayer = async (targetId, targetName) => {
    if(!confirm(`Eliminate ${targetName}?`)) return;
    
    const roomRef = firestore.collection('detective_rooms').doc(roomId);
    
    await roomRef.get().then(doc => {
        let players = doc.data().players;
        let logs = doc.data().logs || [];
        
        // Mark target as dead
        players = players.map(p => p.id === targetId ? {...p, alive: false} : p);
        logs.push(`${targetName} was eliminated.`);
        
        // Check if Detective died (Killer Wins)
        const targetRole = players.find(p => p.id === targetId).role;
        if (targetRole === 'Detective') {
            roomRef.update({ players, logs, state: 'finished', winner: 'Killer' });
        } else {
            roomRef.update({ players, logs });
        }
    });
  };

  window.arrestPlayer = async (targetId, targetName) => {
    if(!confirm(`Accuse ${targetName} of being the Killer?`)) return;
    
    const roomRef = firestore.collection('detective_rooms').doc(roomId);
    const doc = await roomRef.get();
    const players = doc.data().players;
    const target = players.find(p => p.id === targetId);
    
    if (target.role === 'Killer') {
        // Correct Guess -> Detectives Win
        roomRef.update({ state: 'finished', winner: 'Detectives' });
    } else {
        // Wrong Guess -> Killer Wins (Detective blew cover)
        roomRef.update({ state: 'finished', winner: 'Killer' });
    }
  };

  async function startGame(players) {
    if(players.length < 4) return alert("Need 4+ players!");
    
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const kId = shuffled[0].id;
    const dId = shuffled[1].id;

    const pWithRoles = players.map(p => {
        let r = 'Citizen';
        if(p.id === kId) r = 'Killer';
        if(p.id === dId) r = 'Detective';
        return {...p, role: r, alive: true};
    });

    await firestore.collection('detective_rooms').doc(roomId).update({
        players: pWithRoles,
        state: 'playing',
        logs: ['Mission Started. Good luck.']
    });
  }
});
