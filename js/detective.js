document.addEventListener("DOMContentLoaded", function() {
  const firestore = firebase.firestore();
  let unsubscribe = null;
  let roomId = '';
  let myUid = '';

  // --- DOM REFS ---
  const scorePanel = document.getElementById('scorePanel');
  const scoreListEl = document.getElementById('scoreList');
  const gameContent = document.getElementById('gameContent');
  const mainMenu = document.getElementById('mainMenu');
  const historyModal = document.getElementById('historyModal');
  const historyContent = document.getElementById('historyContent');

  // --- BUTTON HANDLERS ---
  
  // 1. Create Room
  document.getElementById('createBtn').onclick = async () => {
    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) return alert("NAME REQUIRED");
    
    await auth();
    const code = generateCode();
    
    await firestore.collection('detective_rooms').doc(code).set({
      host: myUid,
      state: 'waiting', // waiting, playing, result
      round: 1,
      players: [{ id: myUid, name: name, role: null, alive: true, score: 0 }],
      history: [], // Stores past round data
      created: Date.now()
    });
    
    enterRoom(code);
  };

  // 2. Join UI Toggle
  document.getElementById('joinBtn').onclick = () => {
    document.getElementById('joinInputs').style.display = 'block';
    document.getElementById('createBtn').style.display = 'none';
    document.getElementById('joinBtn').style.display = 'none';
  };

  // 3. Confirm Join
  document.getElementById('confirmJoinBtn').onclick = async () => {
    const name = document.getElementById('playerNameInput').value.trim();
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (!name || !code) return alert("MISSING INTEL");

    await auth();
    const ref = firestore.collection('detective_rooms').doc(code);
    
    try {
      await firestore.runTransaction(async (t) => {
        const doc = await t.get(ref);
        if (!doc.exists) throw "INVALID CODE";
        const data = doc.data();
        if (data.players.length >= 10) throw "ROOM FULL";
        if (data.state !== 'waiting' && !data.players.find(p => p.id === myUid)) throw "MISSION IN PROGRESS";
        
        if (!data.players.find(p => p.id === myUid)) {
          t.update(ref, {
            players: firebase.firestore.FieldValue.arrayUnion({ id: myUid, name: name, role: null, alive: true, score: 0 })
          });
        }
      });
      enterRoom(code);
    } catch (e) { alert(e); }
  };

  // 4. Disconnect
  document.getElementById('leaveBtn').onclick = () => {
    if (confirm("ABORT MISSION?")) location.reload();
  };

  // 5. History
  document.getElementById('viewHistoryBtn').onclick = () => {
    historyModal.style.display = 'flex';
  };

  // --- CORE FUNCTIONS ---

  async function auth() {
    if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
    myUid = firebase.auth().currentUser.uid;
  }

  function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  function enterRoom(code) {
    roomId = code;
    mainMenu.style.display = 'none';
    scorePanel.style.display = 'flex';
    gameContent.style.display = 'block';
    
    if(unsubscribe) unsubscribe();
    
    unsubscribe = firestore.collection('detective_rooms').doc(code).onSnapshot(doc => {
      if (!doc.exists) { alert("HOST TERMINATED SESSION"); location.reload(); return; }
      const data = doc.data();
      renderGame(data);
      renderScores(data.players);
      renderHistory(data.history);
    });
  }

  // --- RENDERERS ---

  function renderScores(players) {
    // Sort by score descending
    const sorted = [...players].sort((a, b) => b.score - a.score);
    scoreListEl.innerHTML = sorted.map(p => `
      <div class="score-item">
        <span>${p.name}</span>
        <span>${p.score}</span>
      </div>
    `).join('');
  }

  function renderHistory(history) {
    if (!history || history.length === 0) {
      historyContent.innerHTML = "No completed rounds yet.";
      return;
    }
    
    let html = `<table><thead><tr><th>RND</th><th>KILLER</th><th>DETECTIVE</th><th>RESULT</th></tr></thead><tbody>`;
    history.forEach((h, i) => {
      html += `<tr>
        <td>${i+1}</td>
        <td style="color:var(--neon-red)">${h.killerName}</td>
        <td style="color:var(--neon-cyan)">${h.detectiveName}</td>
        <td>${h.winner} WIN</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    historyContent.innerHTML = html;
  }

  function renderGame(data) {
    const isHost = data.host === myUid;
    const me = data.players.find(p => p.id === myUid);
    
    let html = `<div style="text-align:center; margin-bottom:20px;">
      <h2 style="color:var(--radar-green); font-size:3rem; margin:0;">${roomId}</h2>
      <div style="color:#666; font-size:0.8rem; letter-spacing:2px;">SECURE CHANNEL</div>
    </div>`;

    // STATE: WAITING
    if (data.state === 'waiting') {
      html += `<div style="text-align:center; padding:20px; border:1px dashed #444;">
        <h3 style="color:var(--neon-cyan)">LOBBY STATUS: ${data.players.length} / 10 AGENTS</h3>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:20px 0;">
          ${data.players.map(p => `<div style="background:#111; padding:5px; border:1px solid #333;">${p.name}</div>`).join('')}
        </div>
        ${isHost ? `<button onclick="startGame('${roomId}')" class="btn btn-primary">INITIATE MISSION</button>` : `<p class="blink">WAITING FOR HOST...</p>`}
        ${isHost ? `<button onclick="terminateSession('${roomId}')" class="btn btn-danger" style="margin-top:20px;">TERMINATE SESSION</button>` : ''}
      </div>`;
    }
    
    // STATE: PLAYING
    else if (data.state === 'playing') {
      const roleColor = me.role === 'Killer' ? 'var(--neon-red)' : me.role === 'Detective' ? 'var(--neon-cyan)' : '#fff';
      
      html += `<div style="background:rgba(0,0,0,0.5); padding:15px; border-left:4px solid ${roleColor}; margin-bottom:20px;">
        <div style="font-size:0.8rem; color:#aaa;">ASSIGNED IDENTITY</div>
        <div style="font-size:2rem; font-weight:bold; color:${roleColor}">${me.role}</div>
        <div style="font-size:0.8rem;">${me.role === 'Killer' ? 'Target: Eliminate All.' : me.role === 'Detective' ? 'Target: Find the Killer.' : 'Target: Survive.'}</div>
      </div>`;

      if (!me.alive) {
        html += `<h2 style="color:red; text-align:center;">K.I.A. (KILLED IN ACTION)</h2>`;
      } else {
        html += `<div class="player-list">`;
        data.players.forEach(p => {
          let actionBtn = '';
          if (p.id !== myUid && p.alive) {
            if (me.role === 'Killer') actionBtn = `<button onclick="performKill('${p.id}')" style="padding:5px 10px; background:var(--neon-red); border:none; color:#fff; cursor:pointer;">KILL</button>`;
            if (me.role === 'Detective') actionBtn = `<button onclick="performArrest('${p.id}')" style="padding:5px 10px; background:var(--neon-cyan); border:none; color:#000; cursor:pointer;">ARREST</button>`;
          }
          
          html += `<div class="player-row ${!p.alive ? 'dead' : ''}">
            <span>${p.name} ${!p.alive ? '(DEAD)' : ''}</span>
            ${actionBtn}
          </div>`;
        });
        html += `</div>`;
      }
    }

    // STATE: RESULT
    else if (data.state === 'result') {
      const winColor = data.lastWinner === 'KILLER' ? 'var(--neon-red)' : 'var(--neon-cyan)';
      html += `<div style="text-align:center; padding:30px;">
        <h1 style="color:${winColor}; font-size:3rem;">${data.lastWinner} WINS</h1>
        <p style="margin-bottom:30px;">Round ${data.round} Complete.</p>
        ${isHost ? `<button onclick="startNewRound('${roomId}')" class="btn btn-primary">START NEXT ROUND</button>` : `<p>Host is prepping next round...</p>`}
        ${isHost ? `<button onclick="terminateSession('${roomId}')" class="btn btn-danger">TERMINATE SESSION</button>` : ''}
      </div>`;
    }

    gameContent.innerHTML = html;
  }

  // --- GAME ACTIONS (Global) ---
  
  window.startGame = async (rid) => {
    const ref = firestore.collection('detective_rooms').doc(rid);
    const doc = await ref.get();
    const players = doc.data().players;
    if (players.length < 4) return alert("NEED 4+ AGENTS");

    // Assign Roles
    const shuffled = [...players].sort(()=>Math.random()-0.5);
    const kId = shuffled[0].id;
    const dId = shuffled[1].id;

    const updated = players.map(p => ({
      ...p,
      alive: true,
      role: p.id === kId ? 'Killer' : p.id === dId ? 'Detective' : 'Citizen'
    }));

    await ref.update({ state: 'playing', players: updated });
  };

  window.performKill = async (targetId) => {
    if(!confirm("EXECUTE TARGET?")) return;
    const ref = firestore.collection('detective_rooms').doc(roomId);
    
    // Transaction ensures atomic updates
    await firestore.runTransaction(async (t) => {
      const doc = await t.get(ref);
      const players = doc.data().players;
      const target = players.find(p => p.id === targetId);
      
      target.alive = false; // Kill target

      // Check if Detective died -> Killer Wins
      if (target.role === 'Detective') {
        // End Round: Killer Wins
        const killer = players.find(p => p.role === 'Killer');
        killer.score += 1000;
        
        t.update(ref, { 
          players: players, 
          state: 'result', 
          lastWinner: 'KILLER',
          history: firebase.firestore.FieldValue.arrayUnion({
            killerName: killer.name,
            detectiveName: target.name, // Detective
            winner: 'KILLER'
          })
        });
      } else {
        // Just a kill, game continues
        t.update(ref, { players: players });
      }
    });
  };

  window.performArrest = async (targetId) => {
    if(!confirm("ACCUSE SUSPECT?")) return;
    const ref = firestore.collection('detective_rooms').doc(roomId);
    
    await firestore.runTransaction(async (t) => {
      const doc = await t.get(ref);
      const players = doc.data().players;
      const target = players.find(p => p.id === targetId);
      const me = players.find(p => p.id === myUid); // Detective
      const killer = players.find(p => p.role === 'Killer');

      if (target.role === 'Killer') {
        // DETECTIVE WINS
        me.score += 800; // Detective Bonus
        players.forEach(p => { if(p.role==='Citizen' && p.alive) p.score += 500; }); // Survivors Bonus

        t.update(ref, { 
          players: players, 
          state: 'result', 
          lastWinner: 'DETECTIVE',
          history: firebase.firestore.FieldValue.arrayUnion({
            killerName: killer.name,
            detectiveName: me.name,
            winner: 'DETECTIVE'
          })
        });
      } else {
        // WRONG ARREST -> KILLER WINS
        killer.score += 1000;
        
        t.update(ref, { 
          players: players, 
          state: 'result', 
          lastWinner: 'KILLER', // Killer wins because Detective failed
          history: firebase.firestore.FieldValue.arrayUnion({
            killerName: killer.name,
            detectiveName: me.name,
            winner: 'KILLER (WRONG ARREST)'
          })
        });
      }
    });
  };

  window.startNewRound = async (rid) => {
    const ref = firestore.collection('detective_rooms').doc(rid);
    await ref.update({ state: 'waiting' }); // Go back to lobby to reshuffle or just start
    startGame(rid); // Immediately reshuffle and start
  };

  window.terminateSession = async (rid) => {
    if(confirm("DESTROY ROOM DATA?")) {
      await firestore.collection('detective_rooms').doc(rid).delete();
    }
  };

});
