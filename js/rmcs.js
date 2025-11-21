document.addEventListener("DOMContentLoaded", function() {
  // --- DOM Elements & Firebase Initialization ---
  const mainMenu = document.getElementById('mainMenu');
  const createScreen = document.getElementById('createScreen');
  const joinScreen = document.getElementById('joinScreen');
  const gameScreen = document.getElementById('gameScreen');
  const playersListEl = document.getElementById('playersList'); 
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn = document.getElementById('startGameBtn');
  const exitLobbyBtn = document.getElementById('exitLobbyBtn');
  const cancelRoomBtn = document.getElementById('cancelRoomBtn'); // Must be in HTML
  const gameTable = document.querySelector('.game-table'); 
  const gameContent = document.getElementById('gameContent'); // Must be in HTML
  const scoreboardEl = document.getElementById('scoreboard');
  const scoreListEl = document.getElementById('scoreList');
  
  // Initialize Functions reference (must be called after firebase.initializeApp in firebase-config.js)
  // ⚠️ NOTE: This line requires the firebase-functions.js SDK to be imported in your HTML.
  const functions = firebase.functions();
  
  // --- State variables ---
  let unsubscribe = null, roomId = '', playerName = '';

  function showScreen(show) {
    [mainMenu, createScreen, joinScreen, gameScreen].forEach(screen => screen.classList.remove('active-screen'));
    show.classList.add('active-screen');
  }
  
  // --- Navigation Handlers ---
  document.querySelector('.create-btn').onclick = () => showScreen(createScreen);
  document.querySelector('.join-btn').onclick = () => showScreen(joinScreen);
  [...document.querySelectorAll('.back-btn')].forEach(btn => btn.onclick = () => showScreen(mainMenu));

  // --- Utility Functions ---
  
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

  // NOTE: The assignRoles function has been removed. Role assignment is now handled by the 'startGame' Cloud Function.

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
      
      let avatarEmoji;
      if (players[i].id === selfId) {
          avatarEmoji = 'YOU'; 
          avatar.classList.add('bg-indigo-200'); 
      } else {
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
    
    if (!customRoomCode) customRoomCode = Math.random().toString(36).substring(2, 6).toUpperCase(); 
    
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
          scores: initialScores, 
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
        
        // **FIX for Rejoining Bug: Allow rejoining if the player is the same user ID**
        const playerWithSameName = data.players.find(p => p.name === playerName);
        
        // Block only if the name is taken by a *different* player ID
        if (playerWithSameName && playerWithSameName.id !== user.uid) {
             document.getElementById('joinRoomError').innerText = "A different player with this name is already in the room. Choose another name."; 
             return;
        }
        // **END FIX**
        
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
            startGameBtn.style.display = 'block'; 
            startGameBtn.disabled = !(isHost && players.length === 4);
            startGameBtn.textContent = (players.length === 4) ? 'Start Game' : `Waiting for ${4 - players.length} player(s) (Need 4)`;
            
            // ⭐️ ROBUST SOLUTION: Call Cloud Function to start game/assign roles
            startGameBtn.onclick = async () => {
              if (!(isHost && players.length === 4)) return;
              
              try {
                  startGameBtn.textContent = 'Starting...';
                  const startGameFunction = functions.httpsCallable('startGame');
                  // This is the ONLY place roles are assigned, and it's done securely on the server
                  await startGameFunction({ roomId: roomCode }); 
                  // The room listener handles the phase change
              } catch (error) {
                  console.error("Error calling startGame function:", error);
                  showMessage("Error Starting Game", error.message);
                  startGameBtn.textContent = 'Start Game'; // Reset button
              }
            };
          }

        // --- In-Game Phases (Reveal, Guess, Result) ---
        } else {
            // Hide lobby-specific content (avatars on the table)
            if (gameContent) gameContent.style.display = 'flex'; 
            gameTable.querySelector('.table').style.display = 'none';
            if (startGameBtn) startGameBtn.style.display = 'none';
            
            if (data.phase === 'reveal') {
                showRoleRevealScreen(players, selfId, data.playerRoles, data.revealed || []);
            } else if (data.phase === 'guess') {
                showSipahiGuessUI(data.playerRoles, selfId, roomCode);
            } else if (data.phase === "roundResult") {
                // Score updates are now handled securely by the makeGuess Cloud Function
                showRoundResult(data, selfId, roomCode, isHost); 
            }
        }
      });
  }

  // --- Role Reveal Flow (Client-side update is fine as roles are already assigned securely) ---
  function showRoleRevealScreen(players, selfId, playerRoles, revealed) {
    if (!gameContent) return;
    
    const p = (playerRoles || []).find(p => p.id === selfId);
    if (!p) return; 
    
    const isRajaSipahi = p && (p.role === 'Raja' || p.role === 'Sipahi');
    const alreadyRevealed = (revealed || []).some(r => r.id === selfId);
    
    // Check if Raja and Sipahi have revealed their roles
    const rajaRevealed = (revealed || []).some(r => r.role === 'Raja');
    const sipahiRevealed = (revealed || []).some(r => r.role === 'Sipahi');
    
    // Auto-transition to 'guess' phase (Host action, but client can perform this simple update)
    if (rajaRevealed && sipahiReveahi && p.role === 'Raja') {
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
        // Direct write for revealing is fine as it's not a critical game state
        db.collection('rmcs_rooms').doc(roomId).update({
          revealed: firebase.firestore.FieldValue.arrayUnion({id: selfId, role: p.role, name: p.name})
        });
      };
    }
  }

  // --- Sipahi Guess UI (Calls Cloud Function) ---
  function showSipahiGuessUI(playerRoles, selfId, roomCode) {
    if (!gameContent) return;
    
    const p = (playerRoles || []).find(p => p.id === selfId);
    
    // Sipahi cannot guess Raja or Sipahi's own role.
    let targets = playerRoles.filter(pr => pr.role !== 'Raja' && pr.role !== 'Sipahi');
    targets = targets.sort(() => Math.random() - 0.5); // Shuffle order on the UI

    let timer = 60, timerId; 
    
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
      
      const makeGuessFunction = functions.httpsCallable('makeGuess');

      // **FIX for TypeError: Use querySelectorAll once after innerHTML is set**
      const guessButtons = gameContent.querySelectorAll('.guess-btn');

      // Add event listeners to guess buttons
      guessButtons.forEach(button => {
        const t = targets.find(target => target.id === button.dataset.id);
        if(t) {
            button.onclick = async () => {
              gameContent.querySelectorAll('.guess-btn').forEach(btn => btn.disabled = true);
              clearInterval(timerId); // Stop the timer
              
              try {
                  // ⭐️ ROBUST SOLUTION: Call Cloud Function to process guess and update score/phase
                  await makeGuessFunction({ roomId: roomCode, guessedId: t.id });
              } catch (error) {
                  console.error("Error making guess:", error);
                  showMessage("Guess Error", error.message);
              }
            };
        }
      });
      // **END FIX**
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
        // ⭐️ ROBUST SOLUTION: Call Cloud Function for timeout (guessedId: null)
        const makeGuessFunction = functions.httpsCallable('makeGuess');
        makeGuessFunction({ roomId: roomCode, guessedId: null })
            .catch(error => console.error("Error on timeout guess:", error));
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
    
    // Calculate Score for display purposes (data is already securely updated in Firestore)
    let roundPoints = {};
    if (isCorrect) { roundPoints[raja.id] = 1000; roundPoints[mantri.id] = 1000; roundPoints[sipahi.id] = 1000; roundPoints[chor.id] = 0; } 
    else { roundPoints[raja.id] = 0; roundPoints[mantri.id] = 0; roundPoints[sipahi.id] = 0; roundPoints[chor.id] = 1000; }

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
    
    
    // Host-only button to reset the room state for a new round
    if (isHost) {
      const nextRoundBtn = gameContent.querySelector('.next-round-btn');
      if (nextRoundBtn) {
        nextRoundBtn.onclick = async () => {
          // Direct write back to lobby is fine, as 'startGame' will call the secure logic next.
          await roomRef.update({
            phase: 'lobby', 
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
      const confirmed = window.confirm("Are you sure you want to delete this room? This cannot be undone.");
      if (!confirmed) return;
      
      const roomRef = db.collection('rmcs_rooms').doc(roomId);
      try {
          await roomRef.delete();
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
        } catch(e) {
            console.error("Error leaving room:", e);
        }
    }
    
    roomId = '';
    playerName = '';
    showScreen(mainMenu);
  };
  
  // Initial anonymous sign-in to ensure a user is available
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
});
