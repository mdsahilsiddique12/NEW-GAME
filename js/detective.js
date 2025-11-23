document.addEventListener("DOMContentLoaded", function() {
  const firestore = firebase.firestore();
  let unsubscribe = null;
  let roomId = '';
  let myUid = '';

  // DOM Elements
  const scorePanel = document.getElementById('scorePanel');
  const scoreListEl = document.getElementById('scoreList');
  const gameContent = document.getElementById('gameContent');
  const mainMenu = document.getElementById('mainMenu');
  
  // Modal Elements
  const customModal = document.getElementById('customModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');
  const modalBox = document.getElementById('modalBox');

  // --- 1. MODAL SYSTEM ---
  window.showModal = (title, body, color, confirmCallback) => {
    modalTitle.innerText = title;
    modalBody.innerText = body;
    modalBox.style.borderColor = color;
    modalConfirmBtn.style.background = color;
    modalConfirmBtn.style.color = color === '#fff' ? '#000' : '#fff';
    
    const newBtn = modalConfirmBtn.cloneNode(true);
    modalConfirmBtn.parentNode.replaceChild(newBtn, modalConfirmBtn);
    newBtn.addEventListener('click', () => {
      closeModal();
      confirmCallback();
    });
    customModal.style.display = 'flex';
  };

  window.closeModal = () => { customModal.style.display = 'none'; };

  // --- 2. TRANSITIONS ---
  function playTransition() {
    const screen = document.getElementById('transitionScreen');
    screen.style.display = 'flex';
    setTimeout(() => { screen.style.display = 'none'; }, 2000);
  }

  // --- 3. BUTTONS ---
  document.getElementById('createBtn').onclick = async () => {
    const name = document.getElementById('playerNameInput').value.trim();
    if (!name) return alert("NAME REQUIRED");
    await auth();
    const code = generateCode();
    await firestore.collection('detective_rooms').doc(code).set({
      host: myUid, state: 'waiting', round: 1,
      players: [{ id: myUid, name: name, role: null, alive: true, score: 0 }],
      history: [], created: Date.now()
    });
    enterRoom(code);
  };

  document.getElementById('joinBtn').onclick = () => {
    document.getElementById('joinInputs').style.display = 'block';
    document.getElementById('createBtn').style.display = 'none';
    document.getElementById('joinBtn').style.display = 'none';
  };

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
          t.update(ref, { players: firebase.firestore.FieldValue.arrayUnion({ id: myUid, name: name, role: null, alive: true, score: 0 }) });
        }
      });
      enterRoom(code);
    } catch (e) { alert(e); }
  };

  document.getElementById('leaveBtn').onclick = () => { if(confirm("DISCONNECT?")) location.reload(); };
  document.getElementById('viewHistoryBtn').onclick = () => { document.getElementById('historyModal').style.display = 'flex'; };

  // --- CORE LOGIC ---
  async function auth() { if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously(); myUid = firebase.auth().currentUser.uid; }
  function generateCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

  function enterRoom(code) {
    roomId = code;
    mainMenu.style.display = 'none';
    scorePanel.style.display = 'flex';
    gameContent.style.display = 'block';
    if(unsubscribe) unsubscribe();
    
    let lastState = 'waiting';

    unsubscribe = firestore.collection('detective_rooms').doc(code).onSnapshot(doc => {
      if (!doc.exists) { alert("SESSION ENDED"); location.reload(); return; }
      const data = doc.data();
      
      if (lastState !== data.state && (data.state === 'playing' || data.state === 'result')) {
        playTransition();
      }
      lastState = data.state;

      renderGame(data);
      renderScores(data.players);
      renderHistory(data.history);
    });
  }

  // --- RENDERERS ---
  function renderScores(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    scoreListEl.innerHTML = sorted.map(p => `
      <div class="score-item"><span>${p.name}</span><span style="color:var(--neon-cyan)">${p.score}</span></div>
    `).join('');
  }

  function renderHistory(history) {
    const el = document.getElementById('historyContent');
    if (!history || history.length === 0) { el.innerHTML = "No data."; return; }
    el.innerHTML = history.map((h, i) => `
      <div style="border-bottom:1px solid #333; padding:10px;">
        <div style="color:#888; font-size:0.7rem;">ROUND ${i+1}</div>
        <div style="display:flex; justify-content:space-between; font-weight:bold;">
           <span style="color:${h.winner.includes('KILLER')?'red':'cyan'}">${h.winner}</span>
           <span>Killer: ${h.killerName}</span>
        </div>
      </div>
    `).join('');
  }

  function renderGame(data) {
    const isHost = data.host === myUid;
    const me = data.players.find(p => p.id === myUid);
    
    let html = `<div style="text-align:center; margin-bottom:20px;">
      <h2 style="color:var(--radar-green); font-size:2.5rem; display:inline-block; vertical-align:middle;">${roomId}</h2>
      <button class="copy-btn" onclick="copyCode('${roomId}', this)">COPY</button>
    </div>`;

    if (data.state === 'waiting') {
      html += `<div style="text-align:center; padding:20px; border:1px dashed #444;">
        <h3 style="color:var(--neon-cyan); margin-bottom:20px;">LOBBY: ${data.players.length} / 10</h3>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
          ${data.players.map(p => `<div style="background:#111; padding:8px; border:1px solid #333;">${p.name}</div>`).join('')}
        </div>
        ${isHost ? `<button onclick="startGame('${roomId}')" class="btn btn-primary">START MISSION</button>` : `<p class="blink" style="color:#00ff41;">WAITING FOR HOST...</p>`}
      </div>`;
    } 
    else if (data.state === 'playing') {
      const roleColor = me.role === 'Killer' ? '#ff2a2a' : me.role === 'Detective' ? '#00f3ff' : '#fff';
      html += `<div style="background:rgba(0,0,0,0.5); padding:15px; border-left:4px solid ${roleColor}; margin-bottom:20px;">
        <div style="font-size:0.8rem; color:#aaa;">ASSIGNED ROLE</div>
        <div style="font-size:2rem; font-weight:bold; color:${roleColor}">${me.role}</div>
      </div>`;

      if (!me.alive) {
        html += `<h2 style="color:red; text-align:center; border:2px solid red; padding:10px;">ELIMINATED</h2>`;
      } else {
        html += `<div class="player-list">`;
        data.players.forEach(p => {
          let actionBtn = '';
          if (p.id !== myUid && p.alive) {
            if (me.role === 'Killer') actionBtn = `<button onclick="tryKill('${p.id}', '${p.name}')" style="background:transparent; border:1px solid red; color:red; padding:5px 10px; cursor:pointer;">KILL</button>`;
            if (me.role === 'Detective') actionBtn = `<button onclick="tryArrest('${p.id}', '${p.name}')" style="background:transparent; border:1px solid cyan; color:cyan; padding:5px 10px; cursor:pointer;">ARREST</button>`;
          }
          html += `<div class="player-row ${!p.alive ? 'dead' : ''}">
            <span>${p.name} ${!p.alive ? '(DEAD)' : ''}</span>
            ${actionBtn}
          </div>`;
        });
        html += `</div>`;
      }
    } 
    else if (data.state === 'result') {
      const winColor = data.lastWinner.includes('KILLER') ? '#ff2a2a' : '#00f3ff';
      html += `<div style="text-align:center; padding:30px;">
        <h1 style="color:${winColor}; text-shadow:0 0 20px ${winColor}; margin-bottom:20px;">${data.lastWinner}</h1>
        ${isHost ? `<button onclick="startNewRound('${roomId}')" class="btn btn-primary">NEXT ROUND</button>` : `<p>Waiting for Host...</p>`}
      </div>`;
    }
    gameContent.innerHTML = html;
  }

  // --- ACTIONS ---
  window.copyCode = (code, btn) => {
    navigator.clipboard.writeText(code);
    const original = btn.innerText;
    btn.innerText = "COPIED!";
    setTimeout(() => btn.innerText = original, 2000);
  };

  window.startGame = async (rid) => {
    const ref = firestore.collection('detective_rooms').doc(rid);
    const doc = await ref.get();
    const players = doc.data().players;
    if (players.length < 4) return alert("NEED 4+ AGENTS");
    const shuffled = [...players].sort(()=>Math.random()-0.5);
    const kId = shuffled[0].id;
    const dId = shuffled[1].id;
    const updated = players.map(p => ({ ...p, alive: true, role: p.id === kId ? 'Killer' : p.id === dId ? 'Detective' : 'Citizen' }));
    await ref.update({ state: 'playing', players: updated });
  };

  window.tryKill = (targetId, targetName) => {
    showModal("EXECUTE?", `Target: ${targetName}`, '#ff2a2a', async () => {
      const ref = firestore.collection('detective_rooms').doc(roomId);
      await firestore.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const players = doc.data().players;
        const target = players.find(p => p.id === targetId);
        target.alive = false; 
        if (target.role === 'Detective') {
          const killer = players.find(p => p.role === 'Killer');
          killer.score += 1000;
          t.update(ref, { players, state: 'result', lastWinner: 'KILLER WINS', history: firebase.firestore.FieldValue.arrayUnion({ killerName: killer.name, winner: 'KILLER' }) });
        } else {
          t.update(ref, { players });
        }
      });
    });
  };

  // UPDATED "LAST CHANCE" LOGIC
  window.tryArrest = (targetId, targetName) => {
    showModal("CONFIRM ARREST", `Suspect: ${targetName}`, '#00f3ff', async () => {
      const ref = firestore.collection('detective_rooms').doc(roomId);
      await firestore.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const players = doc.data().players;
        const target = players.find(p => p.id === targetId);
        const me = players.find(p => p.id === myUid);
        const killer = players.find(p => p.role === 'Killer');

        if (target.role === 'Killer') {
          // CORRECT GUESS -> DETECTIVES WIN
          me.score += 800;
          players.forEach(p => { if(p.role==='Citizen' && p.alive) p.score += 500; });
          t.update(ref, { players, state: 'result', lastWinner: 'DETECTIVES WIN', history: firebase.firestore.FieldValue.arrayUnion({ killerName: killer.name, winner: 'DETECTIVES' }) });
        } else {
          // WRONG GUESS -> TARGET DIES
          target.alive = false;
          me.score -= 200;

          // CHECK FOR "LAST CHANCE" SCENARIO
          // Count remaining survivors
          const survivors = players.filter(p => p.alive).length;
          
          // If only 2 people left (Detective + Killer), Killer wins automatically
          if (survivors <= 2) {
            killer.score += 1000;
            t.update(ref, { players, state: 'result', lastWinner: 'KILLER WINS (NO CITIZENS LEFT)', history: firebase.firestore.FieldValue.arrayUnion({ killerName: killer.name, winner: 'KILLER' }) });
          } else {
            // Still innocents left -> Game Continues
            t.update(ref, { players });
          }
        }
      });
    });
  };

  window.startNewRound = async (rid) => {
    const ref = firestore.collection('detective_rooms').doc(rid);
    await ref.update({ state: 'waiting' }); 
    startGame(rid);
  };
});
