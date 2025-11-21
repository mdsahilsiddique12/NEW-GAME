document.addEventListener("DOMContentLoaded", function() {
  // --- DOM Elements ---
  const mainMenu = document.getElementById('mainMenu');
  const createScreen = document.getElementById('createScreen');
  const joinScreen = document.getElementById('joinScreen');
  const gameScreen = document.getElementById('gameScreen');
  const playersListEl = document.getElementById('playersList'); 
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn = document.getElementById('startGameBtn');
  const exitLobbyBtn = document.getElementById('exitLobbyBtn');
  const cancelRoomBtn = document.getElementById('cancelRoomBtn'); // New button
  const gameTable = document.querySelector('.game-table'); 
  const gameContent = document.getElementById('gameContent'); // New dynamic UI container
  const scoreboardEl = document.getElementById('scoreboard'); // New scoreboard container
  const scoreListEl = document.getElementById('scoreList'); // New score list
  
  // --- State variables ---
  let unsubscribe = null, roomId = '', playerName = '';
  // The global 'db' object (Firebase Firestore instance) is assumed to be defined in js/firebase-config.js

  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(screen => screen.classList.remove('active-screen'));
    show.classList.add('active-screen');
  }
  
  // --- Navigation Handlers ---
  document.querySelector('.create-btn').onclick = () => showScreen(createScreen);
  document.querySelector('.join-btn').onclick = () => showScreen(joinScreen);
  [...document.querySelectorAll('.back-btn')].forEach(btn => btn.onclick = () => showScreen(mainMenu));

  // --- Utility Functions ---
  
  // Helper to show custom message box (as defined in rmcs.html)
  function showMessage(title, body, onConfirm = null) {
      const messageBox = document.getElementById('messageBox');
      if (!messageBox) return alert(`${title}: ${body}`);
      
      document.getElementById('messageBoxTitle').textContent = title;
      document.getElementById('messageBoxBody').textContent = body;
      
      messageBox.classList.remove('hidden');
      document.getElementById('messageBoxClose').onclick = () => {
          messageBox.classList.add('hidden');
          if (onConfirm) onConfirm();
      };
  }
  
  function renderRoomCode(code) {
    if (currentRoomCode) {
      currentRoomCode.innerHTML = `
        <span class="font-mono font-bold">${code}</span>
        <button id="copyRoomCodeBtn" class="copy-btn">Copy</button>
      `;
      const copyBtn = document.getElementById('copyRoomCodeBtn');
      if(copyBtn) {
          copyBtn.onclick = () => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(code).then(() => {
                showMessage('Copied!', 'Room code copied to clipboard.');
              }).catch(err => {
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
    }
  }

  function assignRoles(players) {
    if (players.length !== 4) return players.map(p => ({ ...p, role: 'Waiting' }));
    
    // The role values are points: Raja(1000), Mantri(500), Chor(0), Sipahi(250)
    // The name values are the display names: Raja, Mantri, Chor, Sipahi
    const roles = [
      { name: 'Raja', point: 1000 }, 
      { name: 'Mantri', point: 500 }, 
      { name: 'Chor', point: 0 }, 
      { name: 'Sipahi', point: 250 }
    ];
    
    // Shuffle the roles array
    let shuffled = [...roles].sort(() => Math.random() - 0.5); 
    
    // Assign one unique role to each player
    return players.map((p, i) => ({ 
        ...p, 
        role: shuffled[i].name, 
        rolePoints: shuffled[i].point, // Store the base points for the role
        isChor: shuffled[i].name === 'Chor'
    }));
  }

  function renderAvatarsTable(players, selfId) {
    // Hide game content container and show the 'table' visually
    if (gameContent) gameContent.innerHTML = '';
    gameTable.querySelector('.table').style.display = 'block'; 
    
    // Clear previous avatars
    [...gameTable.querySelectorAll('.avatar')].forEach(el => el.remove()); 
    
    const N = players.length;
    if (N === 0) return;
    
    const radius = 100, cx = 150, cy = 150; 
    const selfIndex = players.findIndex(p => p.id === selfId);

    // Render the players in a circle (self always at the bottom center)
    for (let i = 0; i < N; ++i) {
      let logicalIndex = (i - selfIndex + N) % N; 
      // Angle adjusted for 4 players, placing self at the bottom (1.5 * PI = 270 deg)
      let angle = Math.PI * 1.5 + (2 * Math.PI * logicalIndex) / N; 
      
      let x = cx + radius * Math.cos(angle);
      let y = cy + radius * Math.sin(angle); 

      let avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.left = (x - 30) + 'px'; 
      avatar.style.top = (y - 30) + 'px';
      
      // Use an emoji for the player number
      let avatarEmoji;
      if (players[i].id === selfId) {
          avatarEmoji = 'YOU'; // Text for self
          avatar.classList.add('bg-indigo-200'); // Highlight self
      } else {
          // Simple visual differentiation for others
          avatarEmoji = '👤'; 
          avatar.classList.add('bg-gray-100');
      }
      
      avatar.innerHTML = `<span class="text-3xl">${avatarEmoji}</span>`; 
      
      let name = document.createElement('div');
      name.className = 'avatar-name';
      name.textContent = players[i].name + (players[i].id === selfId ? ' (You)' : '');
      avatar.appendChild(name);
      gameTable.appendChild(avatar);
    }
  }
  
  function renderPlayersList(players) {
    if (playersListEl) 
      playersListEl.innerHTML = players.map(p => `
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xl">${p.id === firebase.auth().currentUser?.uid ? '⭐' : '🔸'}</span>
          <span class="font-bold">${p.name}</span>
        </div>
      `).join('');
  }

  function renderScoreboard(scores, players) {
    if (!scoreListEl || !scoreboardEl) return;
    
    // Show scoreboard
    scoreboardEl.style.display = 'block';
    
    // Combine player names with scores
    const scoreData = players.map(p => ({
        name: p.name,
        score: scores[p.id] || 0
    })).sort((a, b) => b.score - a.score); // Sort by score descending

    scoreListEl.innerHTML = scoreData.map(p => `
        <div class="flex justify-between py-1 border-b border-gray-200 last:border-b-0">
          <span>${p.name.substring(0, 10)}...</span>
          <span class="font-extrabold text-indigo-600">${p.score}</span>
        </div>
    `).join('');
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
      document.getElementById('createRoomError').innerText = "Room code must be 4-8 uppercase letters or numbers."; return;
    }
    
    if (!customRoomCode) customRoomCode = Math.random().toString(36).substring(2, 6).toUpperCase(); // Shorter 4-char code
    
    const ref = db.collection('rmcs_rooms').doc(customRoomCode);
    
    try {
      const docSnapshot = await ref.get();
      if (docSnapshot.exists) {
        document.getElementById('createRoomError').innerText = "Room code already exists. Try a new code!"; return;
      }
      
      firebase.auth().onAuthStateChanged(async user => {
        if (!user) {
          try {
            const anonUser = await firebase.auth().signInAnonymously();
            user = anonUser.user;
          } catch(e) {
             document.getElementById('createRoomError').innerText = "Authentication error: " + e.message; 
             return; 
          }
        }
        
        // Initialize scores object with 0 for all players
        let initialScores = {};
        initialScores[user.uid] = 0;

        await ref.set({
          host: user.uid,
          players: [{ name: playerName, id: user.uid }],
          phase: 'lobby',
          scores: initialScores, // Initialize global scores
          created: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        roomId = customRoomCode;
        listenToRoom(roomId);
        showScreen(gameScreen);
      });
      
    } catch (e) {
      console.error("Error creating room:", e);
      document.getElementById('createRoomError').innerText = "An error occurred: " + e.message;
    }
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
    
    try {
      const doc = await ref.get();
      if (!doc.exists) {
        document.getElementById('joinRoomError').innerText = "Room not found!"; return;
      }
      
      const data = doc.data();
      if (data.phase !== 'lobby') {
        document.getElementById('joinRoomError').innerText = "The game has already started in this room."; return;
      }
      if (data.players.length >= 4) {
        document.getElementById('joinRoomError').innerText = "Room is full (max 4 players)."; return;
      }

      firebase.auth().onAuthStateChanged(async user => {
        if (!user) {
          try {
            const anonUser = await firebase.auth().signInAnonymously();
            user = anonUser.user;
          } catch(e) {
             document.getElementById('joinRoomError').innerText = "Authentication error: " + e.message; 
             return; 
          }
        }
        
        if (data.players.some(p => p.name === playerName)) {
             document.getElementById('joinRoomError').innerText = "A player with this name is already in the room. Choose another name."; 
             return;
        }
        
        const isRejoining = data.players.some(p => p.id === user.uid);
        
        if (!isRejoining) {
          // Add the new player & initialize their score to 0
          await ref.update({
            players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, id: user.uid }),
            [`scores.${user.uid}`]: 0 // Set initial score for the new player
          });
        } else {
             // Update the player's name if they are rejoining
             const updatedPlayers = data.players.map(p => 
                 p.id === user.uid ? { name: playerName, id: user.uid } : p
             );
             await ref.update({ players: updatedPlayers });
        }
        
        roomId = code;
        playerName = playerName; 
        listenToRoom(roomId);
        showScreen(gameScreen);
      });
      
    } catch (e) {
       console.error("Error joining room:", e);
       document.getElementById('joinRoomError').innerText = "An error occurred: " + e.message;
    }
  };

  // --- Listen and Draw Lobby/Game Screen ---
  function listenToRoom(roomCode) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);
    
    unsubscribe = roomRef
      .onSnapshot(doc => {
        const data = doc.data();
        const selfId = firebase.auth().currentUser?.uid;

        if (!data || !doc.exists) {
           // This handles cases where the host deletes the room
           showMessage("Room Ended", "The room was deleted by the host or no longer exists.", () => showScreen(mainMenu));
           roomId = '';
           return;
        } 

        const players = data.players || [];
        const scores = data.scores || {};
        
        // Check if the current user is still a part of the room
        if (!players.some(p => p.id === selfId)) {
            // Player was kicked or left gracefully and is still listening
             showMessage("Kicked/Left", "You have been removed from the room.", () => showScreen(mainMenu));
             if (unsubscribe) unsubscribe();
             roomId = '';
             return;
        }

        renderRoomCode(roomCode);
        renderPlayersList(players);
        renderScoreboard(scores, players);

        let isHost = selfId === data.host;
        
        // Show/Hide Cancel Room Button (Host only)
        if (cancelRoomBtn) {
            cancelRoomBtn.style.display = isHost ? 'block' : 'none';
            if (isHost) cancelRoomBtn.onclick = handleCancelRoom;
        }
        
        // --- Lobby Phase ---
        if (data.phase === "lobby") {
          // Hide dynamic content and show the table for avatar placement
          if (gameContent) gameContent.style.display = 'none';
          gameTable.querySelector('.table').style.display = 'block'; 
          
          renderAvatarsTable(players, selfId); 
          
          if (startGameBtn) {
            startGameBtn.style.display = 'block'; // Always visible in lobby
            startGameBtn.disabled = !(isHost && players.length === 4);
            startGameBtn.textContent = (players.length === 4) ? 'Start Game' : `Waiting for ${4 - players.length} player(s) (Need 4)`;
            
            startGameBtn.onclick = async () => {
              if (!(isHost && players.length === 4)) return;
              
              const roles = assignRoles(players);
              
              await roomRef.update({
                phase: 'reveal',
                playerRoles: roles,
                revealed: []
              });
            };
          }

        // --- In-Game Phases (Reveal, Guess, Result) ---
        } else {
            // Hide lobby-specific content (avatars on the table)
            if (gameContent) gameContent.style.display = 'flex'; // Show dynamic UI container
            gameTable.querySelector('.table').style.display = 'none'; // Hide the table itself
            if (startGameBtn) startGameBtn.style.display = 'none';
            
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

  // --- Role Reveal Flow ---
  function showRoleRevealScreen(players, selfId, playerRoles, revealed) {
    if (!gameContent) return;
    
    // Find my role
    const p = (playerRoles || []).find(p => p.id === selfId);
    if (!p) return; 
    
    const isRajaSipahi = p && (p.role === 'Raja' || p.role === 'Sipahi');
    const alreadyRevealed = (revealed || []).some(r => r.id === selfId);
    
    // Check if Raja and Sipahi have revealed their roles
    const rajaRevealed = (revealed || []).some(r => r.role === 'Raja');
    const sipahiRevealed = (revealed || []).some(r => r.role === 'Sipahi');
    
    // Auto-transition to 'guess' phase
    if (rajaRevealed && sipahiRevealed) {
        db.collection('rmcs_rooms').doc(roomId).update({
            phase: 'guess',
            revealed: [] // Reset for next round's reveal
        });
        return; 
    }

    // Prepare HTML for revealed roles
    let revealedRoles = playerRoles.filter(pr => revealed.some(r => r.id === pr.id));
    let revealedHtml = revealedRoles.map(r => `
      <div class="text-center bg-gray-50 p-3 rounded-lg shadow-sm">
        <div class="text-3xl">${r.role === 'Raja' ? "👑" : r.role === 'Sipahi' ? "🛡️" : ""}</div>
        <div class="text-xs font-semibold text-gray-700 mt-1">${r.name}</div>
      </div>
    `).join('');
    
    const selfRole = p.role;
    const roleEmoji = selfRole === 'Raja' ? '👑' : selfRole === 'Mantri' ? '🧠' : selfRole === 'Chor' ? '🔪' : '🛡️';

    gameContent.innerHTML = `
      <div class="flex flex-col items-center mt-4 p-4">
        <div class="role-card paper-unfold bg-white shadow-xl p-6 rounded-2xl text-2xl text-center border-4 border-indigo-300 w-full max-w-sm">
          <p class="text-gray-600 text-xl">Your Role is:</p>
          <b class="text-indigo-700 text-4xl">${selfRole} ${roleEmoji}</b>
          ${isRajaSipahi && !alreadyRevealed ? 
            '<button id="revealBtn" class="mt-4 px-6 py-2 bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-colors shadow-lg">Reveal Role</button>' 
            : ''}
        </div>
        ${(!isRajaSipahi) ? 
          `<div class="mt-4 bg-gray-200 text-gray-700 text-md p-3 rounded-xl text-center font-semibold">
            Your role is secret (${selfRole}).<br>Wait for Raja (👑) and Sipahi (🛡️) to reveal.
           </div>` 
          : (alreadyRevealed ? '<div class="mt-4 text-green-700 font-bold bg-green-50 p-2 rounded-lg">Role revealed! Waiting for others...</div>' : '')}
           
        ${revealedHtml ? `
            <h4 class="text-lg font-semibold mt-6 text-gray-800">Revealed Roles:</h4>
            <div class="flex gap-4 justify-center p-4 bg-yellow-50 rounded-xl shadow-inner mt-2">${revealedHtml}</div>
        ` : '<div class="mt-6 text-gray-500">No roles have been revealed yet.</div>'}
      </div>
    `;
    
    const revealBtn = document.getElementById('revealBtn');
    if (isRajaSipahi && !alreadyRevealed && revealBtn) {
      revealBtn.onclick = () => {
        db.collection('rmcs_rooms').doc(roomId).update({
          revealed: firebase.firestore.FieldValue.arrayUnion({id: selfId, role: p.role, name: p.name})
        });
      };
    }
  }

  // --- Sipahi Guess UI ---
  function showSipahiGuessUI(playerRoles, selfId, roomCode) {
    if (!gameContent) return;
    
    const p = (playerRoles || []).find(p => p.id === selfId);
    
    // Find the Mantri and Chor
    const mantri = playerRoles.find(pr => pr.role === 'Mantri');
    const chor = playerRoles.find(pr => pr.role === 'Chor');

    // Sipahi cannot guess Raja or Sipahi's own role.
    let targets = playerRoles.filter(pr => pr.role !== 'Raja' && pr.role !== 'Sipahi');
    targets = targets.sort(() => Math.random() - 0.5); // Shuffle order on the UI

    let timer = 60, timerId; // Reduced timer to 60s
    
    // Only the Sipahi should see the full guessing UI
    if (!p || p.role !== 'Sipahi') {
         gameContent.innerHTML = `
           <div class="text-center mt-12 text-xl font-semibold text-white bg-indigo-700 p-4 rounded-xl shadow-2xl animate-fade-in">
              The Sipahi (🛡️) is currently making their guess. <br>Please wait...
           </div>
         `;
         return;
    }
    
    // Sipahi UI logic
    function render() {
      gameContent.innerHTML = `
        <div class="rounded-2xl shadow-2xl p-6 flex flex-col items-center bg-white max-w-sm mx-auto mt-6 animate-fade-in border-4 border-blue-500">
          <h3 class="mb-2 text-3xl font-extrabold text-blue-700">Guess the Chor! 🔪</h3>
          <div id="timer" class="mb-4 text-2xl font-mono text-red-700 bg-red-100 p-2 rounded">Time Left: ${timerFormat(timer)}</div>
          <p class="text-sm text-gray-600 mb-4 font-semibold">Choose one player (either Mantri or Chor):</p>
          <div class="flex flex-col gap-3 mb-2 w-full">
            ${targets.map(t => `<button class="guess-btn w-full bg-blue-500 text-white hover:bg-blue-600 rounded-xl px-5 py-3 text-xl font-bold transition-all" data-id="${t.id}">${t.name}</button>`).join('')}
          </div>
          <div id="guessResult" class="mt-2 font-bold text-green-700"></div>
        </div>
      `;
      
      // Add event listeners to guess buttons
      targets.forEach(t => {
        const button = gameContent.querySelector(`button[data-id="${t.id}"]`);
        if(button) {
            button.onclick = async () => {
              gameContent.querySelectorAll('.guess-btn').forEach(btn => btn.disabled = true);
              
              let isChor = t.role === 'Chor';
              clearInterval(timerId); // Stop the timer
              
              // Move to the result phase
              db.collection('rmcs_rooms').doc(roomCode).update({
                phase: 'roundResult',
                guess: { sipahiId: p.id, sipahiName: p.name, guessedId: t.id, guessedName: t.name, correct: isChor }
              });
            };
        }
      });
    }
    
    function timerFormat(t) {
      const m = String(Math.floor(t / 60)).padStart(2, "0");
      const s = String(t % 60).padStart(2, "0");
      return `${m}:${s}`;
    }
    
    render();
    
    // Start the timer
    timerId = setInterval(() => {
      timer--;
      const timerEl = gameContent.querySelector('#timer');
      if (timerEl) timerEl.textContent = `Time Left: ${timerFormat(timer)}`;
      
      if (timer <= 0) {
        clearInterval(timerId);
        // Time's up, automatic wrong guess (guessed: null)
        db.collection('rmcs_rooms').doc(roomCode).update({
          phase: 'roundResult',
          guess: { sipahiId: p.id, sipahiName: p.name, guessedId: null, guessedName: 'No Guess', correct: false }
        });
      }
    }, 1000);
  }

  // --- Round Result Animation & Next Button ---
  function showRoundResult(data, selfId, roomCode, isHost) {
    if (!gameContent) return;
    
    const res = data.guess;
    const playerRoles = data.playerRoles;
    const roomRef = db.collection('rmcs_rooms').doc(roomCode);
    
    let isCorrect = res && res.correct;
    
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
    
    // Find the players by role
    const chor = playerRoles.find(p => p.role === 'Chor');
    const mantri = playerRoles.find(p => p.role === 'Mantri');
    const raja = playerRoles.find(p => p.role === 'Raja');
    const sipahi = playerRoles.find(p => p.role === 'Sipahi');
    
    // Calculate Score for the Round
    let roundPoints = {};
    if (isCorrect) {
        roundPoints[raja.id] = 1000;
        roundPoints[mantri.id] = 1000;
        roundPoints[sipahi.id] = 1000;
        roundPoints[chor.id] = 0;
    } else {
        roundPoints[raja.id] = 0;
        roundPoints[mantri.id] = 0;
        roundPoints[sipahi.id] = 0;
        roundPoints[chor.id] = 1000;
    }
    
    // Display score and full roles
    let resultsHtml = `
      <div class="text-left w-full max-w-sm mt-4 p-4 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
        <h4 class="text-lg font-bold mb-2 border-b pb-1 text-gray-800">Role Summary</h4>
        <p>👑 Raja: <b>${raja.name}</b></p>
        <p>🧠 Mantri: <b>${mantri.name}</b></p>
        <p>🛡️ Sipahi: <b>${sipahi.name}</b></p>
        <p>🔪 Chor: <b class="text-red-600">${chor.name}</b></p>
        <h4 class="text-lg font-bold mt-3 mb-2 border-b pb-1 text-gray-800">Round Points Earned</h4>
        <p>Raja (${raja.name}): <b class="text-green-600">${roundPoints[raja.id]}</b></p>
        <p>Mantri (${mantri.name}): <b class="text-green-600">${roundPoints[mantri.id]}</b></p>
        <p>Sipahi (${sipahi.name}): <b class="text-green-600">${roundPoints[sipahi.id]}</b></p>
        <p>Chor (${chor.name}): <b class="${roundPoints[chor.id] > 0 ? 'text-red-600' : 'text-green-600'}">${roundPoints[chor.id]}</b></p>
      </div>
    `;

    gameContent.innerHTML = `
      <div class="flex flex-col justify-center items-center min-h-[300px] animate-fade-in p-4 w-full">
        <div class="text-8xl mb-6 animate-bounce">${emoji}</div>
        <div class="rounded-2xl shadow-xl ${isCorrect ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'} py-4 px-8 mb-6 text-2xl font-bold text-center border-4 ${isCorrect ? 'border-green-300' : 'border-red-300'}">${message}</div>
        ${resultsHtml}
        ${isHost ? '<button class="next-round-btn giant-btn create-btn !py-3 !text-xl !w-full !max-w-xs mt-5">Start New Round</button>' : 
                   '<div class="mt-5 text-white font-semibold bg-gray-700 p-3 rounded-xl shadow-md">Waiting for host to start the next round...</div>'}
      </div>
    `;
    
    // **Persistent Score Update (Host-only logic when the screen is rendered)**
    if (isHost) {
        // Only run score update once by the host after the result is calculated
        if (!data.scoreUpdated) { 
            const newScores = data.scores || {};
            playerRoles.forEach(p => {
                newScores[p.id] = (newScores[p.id] || 0) + roundPoints[p.id];
            });
            
            roomRef.update({
                scores: newScores,
                scoreUpdated: true // Flag to prevent multiple updates
            });
        }
    }
    
    // Host-only button to reset the room state for a new round
    if (isHost) {
      const nextRoundBtn = gameContent.querySelector('.next-round-btn');
      if (nextRoundBtn) {
        nextRoundBtn.onclick = async () => {
          await roomRef.update({
            phase: 'lobby', // Back to lobby to allow players to see the updated score before the next round
            playerRoles: [],
            revealed: [],
            guess: null,
            scoreUpdated: false // Reset flag for the next round
          });
        };
      }
    }
  }

  // --- Host - Cancel/Delete Room ---
  async function handleCancelRoom() {
      // Simple confirmation for a destructive action
      const confirmed = window.confirm("Are you sure you want to delete this room? This cannot be undone.");
      if (!confirmed) return;
      
      const roomRef = db.collection('rmcs_rooms').doc(roomId);
      try {
          // Delete the room document
          await roomRef.delete();
          // The listener will handle the screen transition via the !doc.exists check
      } catch(e) {
          console.error("Error deleting room:", e);
          showMessage("Error", "Failed to delete room: " + e.message);
      }
  }


  // --- Exit Lobby ---
  if (exitLobbyBtn) exitLobbyBtn.onclick = async () => {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    
    const selfId = firebase.auth().currentUser?.uid;
    if (selfId && roomId) {
        const roomRef = db.collection('rmcs_rooms').doc(roomId);
        try {
            const doc = await roomRef.get();
            const data = doc.data();
            if (data) {
                if (data.host === selfId) {
                    // Host leaves: Delete the room 
                    await roomRef.delete(); // Listener handles the aftermath
                } else {
                    // Non-host leaves: Remove player from the list and their score from the scores object
                    const playerToRemove = data.players.find(p => p.id === selfId);
                    if (playerToRemove) {
                        await roomRef.update({
                            players: firebase.firestore.FieldValue.arrayRemove(playerToRemove),
                            // Note: Removing the score field for the user is slightly complex in vanilla update,
                            // but deleting the room on host exit is more important. For a simple exit, 
                            // we'll keep the score in the database but remove the player from the list.
                        });
                    }
                }
            }
        } catch(e) {
            console.error("Error leaving room:", e);
        }
    }
    
    roomId = '';
    playerName = '';
    showScreen(mainMenu);
  };
  
  // Initial anonymous sign-in to ensure a user is available for room creation/joining
  if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(user => {
          if (!user) {
              firebase.auth().signInAnonymously().catch(e => {
                  console.error("Failed to sign in anonymously:", e);
                  showMessage("Authentication Error", "Could not connect to the game server. Please refresh.");
              });
          }
      });
  } else {
       console.error("Firebase SDK not initialized correctly.");
       showMessage("System Error", "Firebase SDK is missing. Check your HTML imports.");
  }

  /* ** IMPORTANT SECURITY NOTE **
  The current implementation relies on client-side logic (the host) to perform critical updates like 
  role assignment, score updates, and phase changes. In a production environment, this is highly insecure 
  as any client can manipulate the game state. For robust, cheat-proof multiplayer, all critical game 
  logic (role assignment, score calculation, phase transitions) must be moved to **Firebase Cloud Functions 
  (server-side)**, and the client should only send basic actions (e.g., 'start game', 'make guess').
  */
});
