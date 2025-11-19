document.addEventListener("DOMContentLoaded", function() {
  const mainMenu = document.getElementById('mainMenu');
  const createScreen = document.getElementById('createScreen');
  const joinScreen = document.getElementById('joinScreen');
  const gameScreen = document.getElementById('gameScreen');
  // playersList is not used in the HTML/JS provided but kept for compatibility
  const playersList = document.getElementById('playersList'); 
  const currentRoomCode = document.getElementById('currentRoomCode');
  const startGameBtn = document.getElementById('startGameBtn');
  const exitLobbyBtn = document.getElementById('exitLobbyBtn');
  // The .game-table element contains the avatars in the lobby and all game UI in other phases
  const gameTable = document.querySelector('.game-table'); 
  
  // State variables
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
  function renderRoomCode(code) {
    if (currentRoomCode) {
      currentRoomCode.innerHTML = `
        <span class="font-mono font-bold">${code}</span>
        <button id="copyRoomCodeBtn" class="copy-btn">Copy</button>
      `;
      // Use the pre-defined .copy-btn styles from rmcs.html
      const copyBtn = document.getElementById('copyRoomCodeBtn');
      if(copyBtn) {
          copyBtn.onclick = () => {
            // Check if navigator.clipboard is available before using it
            if (navigator.clipboard) {
              navigator.clipboard.writeText(code).then(() => {
                // Show a simple message box (assuming a showMessage utility, but for now using alert)
                alert('Copied!'); 
              }).catch(err => {
                console.error('Could not copy text: ', err);
                alert('Failed to copy. Please manually copy the code.');
              });
            } else {
                // Fallback for older browsers
                const tempInput = document.createElement("input");
                document.body.appendChild(tempInput);
                tempInput.value = code;
                tempInput.select();
                document.execCommand("copy");
                document.body.removeChild(tempInput);
                alert('Copied (Legacy)!'); 
            }
          };
      }
    }
  }

  function assignRoles(players) {
    // Check if the number of players is exactly 4, otherwise the roles will be incomplete
    if (players.length !== 4) return players.map(p => ({ ...p, role: 'Waiting' }));
    
    const roles = ['Raja', 'Mantri', 'Chor', 'Sipahi'];
    // Shuffle the roles array
    let shuffled = [...roles].sort(() => Math.random() - 0.5); 
    
    // Assign one unique role to each player
    return players.map((p, i) => ({ ...p, role: shuffled[i] }));
  }

  function renderAvatarsTable(players, selfId) {
    if (!gameTable) return;
    // Clear previous avatars
    [...gameTable.querySelectorAll('.avatar')].forEach(el => el.remove()); 
    
    const N = players.length;
    if (N === 0) return;
    
    // Adjusted radius for better display on the fixed 300x300 .game-table
    const radius = 100, cx = 150, cy = 150; 
    const selfIndex = players.findIndex(p => p.id === selfId);

    for (let i = 0; i < N; ++i) {
      // Calculate index relative to self for 'self in front' view
      let logicalIndex = (i - selfIndex + N) % N; 
      // Start angle adjusted to place the first player (self) at the bottom (270 degrees)
      let angle = Math.PI * 1.5 + (2 * Math.PI * logicalIndex) / N; 
      
      let x = cx + radius * Math.cos(angle);
      let y = cy + radius * Math.sin(angle); // Switched from -sin to +sin for Y-down coordinates

      let avatar = document.createElement('div');
      avatar.className = 'avatar';
      // Adjust positions to center the 60x60 avatar box
      avatar.style.left = (x - 30) + 'px'; 
      avatar.style.top = (y - 30) + 'px';
      // Use a more descriptive icon
      avatar.innerHTML = `<span class="text-3xl">${players[i].id === selfId ? 'You' : '👤'}</span>`; 
      
      let name = document.createElement('div');
      name.className = 'avatar-name';
      name.textContent = players[i].name + (players[i].id === selfId ? ' (You)' : '');
      avatar.appendChild(name);
      gameTable.appendChild(avatar);
    }
  }
  
  function renderPlayersList(players) {
    // The HTML has no element with ID 'playersList', but the variable is declared, so keeping this for completeness if the user adds it.
    if (playersList) 
      playersList.innerHTML = players.map(p => `<li>${p.name}</li>`).join('');
  }
  
  // Helper to show custom message box (as defined in rmcs.html)
  function showMessage(title, body) {
      const messageBox = document.getElementById('messageBox');
      if (!messageBox) return alert(`${title}: ${body}`);
      
      document.getElementById('messageBoxTitle').textContent = title;
      document.getElementById('messageBoxBody').textContent = body;
      
      messageBox.classList.remove('hidden');
      document.getElementById('messageBoxClose').onclick = () => {
          messageBox.classList.add('hidden');
      };
  }

  // --- Room Creation ---
  document.getElementById('createRoomFinal').onclick = async () => {
    playerName = document.getElementById('createPlayerName').value.trim();
    let customRoomCode = document.getElementById('createRoomCode').value.trim().toUpperCase();
    document.getElementById('createRoomError').innerText = '';
    
    // Validation
    if (!playerName) {
      document.getElementById('createRoomError').innerText = "Enter your name."; return;
    }
    if (customRoomCode && (customRoomCode.length < 4 || !/^[A-Z0-9]{4,8}$/.test(customRoomCode))) {
      document.getElementById('createRoomError').innerText = "Room code must be 4-8 uppercase letters or numbers."; return;
    }
    
    // Generate code if not provided
    if (!customRoomCode) customRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const ref = db.collection('rmcs_rooms').doc(customRoomCode);
    
    try {
      // Check if room code already exists
      const docSnapshot = await ref.get();
      if (docSnapshot.exists) {
        document.getElementById('createRoomError').innerText = "Room code already exists. Try a new code!"; return;
      }
      
      // Ensure user is authenticated before creating a room
      firebase.auth().onAuthStateChanged(async user => {
        // Assuming a user is anonymously logged in via js/firebase-config.js.
        // If not, a proper login flow is needed here.
        if (!user) {
          // Attempt anonymous login if not logged in
          try {
            const anonUser = await firebase.auth().signInAnonymously();
            user = anonUser.user;
          } catch(e) {
             document.getElementById('createRoomError').innerText = "Authentication error: " + e.message; 
             return; 
          }
        }
        
        await ref.set({
          host: user.uid, // Store host ID instead of name for better logic
          players: [{ name: playerName, id: user.uid }],
          phase: 'lobby',
          created: firebase.firestore.FieldValue.serverTimestamp() // Use server timestamp
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
          // Attempt anonymous login if not logged in
          try {
            const anonUser = await firebase.auth().signInAnonymously();
            user = anonUser.user;
          } catch(e) {
             document.getElementById('joinRoomError').innerText = "Authentication error: " + e.message; 
             return; 
          }
        }
        
        // Prevent joining if player name is already in use (basic check)
        if (data.players.some(p => p.name === playerName)) {
             document.getElementById('joinRoomError').innerText = "A player with this name is already in the room. Choose another name."; 
             return;
        }

        // Check if user is already in the room (e.g., rejoining after refresh)
        if (!data.players.some(p => p.id === user.uid)) {
          // Add the new player
          await ref.update({
            players: firebase.firestore.FieldValue.arrayUnion({ name: playerName, id: user.uid })
          });
        } else {
             // Update the player's name if they are rejoining with a new one
             const updatedPlayers = data.players.map(p => 
                 p.id === user.uid ? { name: playerName, id: user.uid } : p
             );
             await ref.update({ players: updatedPlayers });
        }
        
        roomId = code;
        // Update the global playerName for the current session
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
        if (!data) {
           showMessage("Error", "Room not found or deleted.");
           showScreen(mainMenu);
           return;
        } 

        const players = data.players || [];
        const selfId = firebase.auth().currentUser?.uid;
        
        if (data.phase === "completed") {
           // Handle end game scenario
           showMessage("Game Ended", "The room host has ended the game.");
           showScreen(mainMenu);
           return;
        }

        renderRoomCode(roomCode);

        // Check if current user is the host (the player with the host ID)
        let isHost = players.length > 0 && selfId === data.host;
        
        // --- Lobby Phase ---
        if (data.phase === "lobby") {
          // Clear any non-lobby game UI
          document.getElementById('gameContent')?.classList?.remove('hidden'); 
          
          // Render lobby elements
          renderPlayersList(players); // This is likely vestigial since the list is not in HTML
          renderAvatarsTable(players, selfId); 
          
          // Host controls
          if (startGameBtn) {
            startGameBtn.style.display = isHost ? 'block' : 'none'; // Only show for host
            // Game can only start with exactly 4 players
            startGameBtn.disabled = !(isHost && players.length === 4);
            startGameBtn.textContent = (players.length === 4) ? 'Start Game' : `Waiting for ${4 - players.length} player(s)`;
            
            startGameBtn.onclick = async () => {
              if (!(isHost && players.length === 4)) return;
              
              const roles = assignRoles(players);
              
              await roomRef.update({
                phase: 'reveal',
                playerRoles: roles,
                // The 'guess' field is reset at the end of the round, so no need to reset here
                revealed: []
              });
            };
          }

        // --- Reveal Phase ---
        } else if (data.phase === 'reveal') {
          // Hide lobby-specific content
          document.getElementById('gameContent')?.classList?.add('hidden');
          if (startGameBtn) startGameBtn.style.display = 'none';

          showRoleRevealScreen(players, selfId, data.playerRoles, data.revealed || []);
        
        // --- Guess Phase ---
        } else if (data.phase === 'guess') {
          document.getElementById('gameContent')?.classList?.add('hidden');
          showSipahiGuessUI(data.playerRoles, selfId, roomCode);
        
        // --- Result Phase ---
        } else if (data.phase === "roundResult") {
          document.getElementById('gameContent')?.classList?.add('hidden');
          showRoundResult(data, selfId, roomCode, isHost); // Pass isHost to control Next Round button
        }
      });
  }

  // --- Role Reveal Flow ---
  function showRoleRevealScreen(players, selfId, playerRoles, revealed) {
    if (gameTable) gameTable.innerHTML = '';
    
    // Find my role
    const p = (playerRoles || []).find(p => p.id === selfId);
    if (!p) return; // Should not happen if a player is in the room
    
    const isRajaSipahi = p && (p.role === 'Raja' || p.role === 'Sipahi');
    // The Sipahi only needs to reveal if the Raja hasn't already done so to trigger the guess phase
    const alreadyRevealed = (revealed || []).some(r => r.id === selfId);
    const container = gameTable;
    if (!container) return;
    
    // Check if both Raja and Sipahi have revealed their roles
    const rajaRevealed = (revealed || []).some(r => r.role === 'Raja');
    const sipahiRevealed = (revealed || []).some(r => r.role === 'Sipahi');
    
    // Logic to move to the 'guess' phase automatically
    if (rajaRevealed && sipahiRevealed) {
        db.collection('rmcs_rooms').doc(roomId).update({
            phase: 'guess',
            // Reset revealed array for the next round's reveal
            revealed: [] 
        });
        return; 
    }

    // Prepare HTML for revealed roles
    let revealedRoles = playerRoles.filter(pr => revealed.some(r => r.id === pr.id));
    let revealedHtml = revealedRoles.map(r => `
      <div class="text-center">
        <div class="text-5xl">${r.role === 'Raja' ? "👑" : r.role === 'Sipahi' ? "🛡️" : ""}</div>
        <div class="avatar-name mt-1">${r.name}</div>
      </div>
    `).join('');
    
    // Find the player's own role (for display)
    const selfRole = p.role;
    const roleEmoji = selfRole === 'Raja' ? '👑' : selfRole === 'Mantri' ? '🧠' : selfRole === 'Chor' ? '🔪' : '🛡️';

    // Update the game table content
    container.innerHTML = `
      <div class="flex flex-col items-center mt-8">
        <div class="role-card paper-unfold bg-white shadow-lg p-6 rounded-2xl text-2xl text-center">
          <p>Your Role: <b class="text-indigo-700">${selfRole} ${roleEmoji}</b></p>
          ${isRajaSipahi && !alreadyRevealed ? 
            '<button id="revealBtn" class="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-full font-semibold hover:bg-indigo-700 transition-colors">Reveal Role</button>' 
            : ''}
        </div>
        ${(!isRajaSipahi) ? 
          `<div class="mt-4 bg-gray-200 text-gray-700 text-md p-3 rounded-xl text-center">
            Your role is secret (${selfRole}).<br>Wait for Raja (👑) and Sipahi (🛡️) to reveal.
           </div>` 
          : (alreadyRevealed ? '<div class="mt-4 text-green-700 font-bold">Role revealed! Waiting for all reveals...</div>' : '')}
           
        ${revealedHtml ? `
            <h4 class="text-xl font-semibold mt-6 text-gray-800">Revealed:</h4>
            <div class="flex gap-6 justify-center p-6 bg-yellow-50 rounded-xl shadow-inner mt-2">${revealedHtml}</div>
        ` : '<div class="mt-6 text-gray-500">No roles have been revealed yet.</div>'}
      </div>
    `;
    
    // Add event listener for the reveal button
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
    if (gameTable) gameTable.innerHTML = '';
    
    const p = (playerRoles || []).find(p => p.id === selfId);
    const container = gameTable;
    if (!container) return; 

    // Find the Mantri and Chor for the Sipahi to guess
    const mantri = playerRoles.find(pr => pr.role === 'Mantri');
    const chor = playerRoles.find(pr => pr.role === 'Chor');

    // Create a list of targets (Mantri and Chor)
    let targets = [];
    if (mantri) targets.push(mantri);
    if (chor) targets.push(chor);
    targets = targets.sort(() => Math.random() - 0.5); // Shuffle order on the UI

    let timer = 90, timerId;
    
    // Only the Sipahi should see the full guessing UI
    if (!p || p.role !== 'Sipahi') {
         container.innerHTML = `
           <div class="text-center mt-12 text-xl font-semibold text-gray-600">
              The Sipahi (🛡️) is currently making their guess. Please wait.
           </div>
         `;
         return;
    }
    
    // Sipahi UI logic
    function render() {
      container.innerHTML = `
        <div class="rounded-2xl shadow-2xl p-6 flex flex-col items-center bg-white max-w-xs mx-auto mt-6 animate-fade-in">
          <h3 class="mb-2 text-2xl font-bold text-blue-700">Sipahi (🛡️): Guess the Chor!</h3>
          <div id="timer" class="mb-4 text-xl font-mono text-red-700">Time Left: ${timerFormat(timer)}</div>
          <p class="text-sm text-gray-600 mb-4">Choose one player:</p>
          <div class="flex flex-col gap-3 mb-2 w-full">
            ${targets.map(t => `<button class="guess-btn bg-blue-200 hover:bg-blue-400 rounded-xl px-5 py-3 text-lg font-semibold transition-all" data-id="${t.id}">${t.name}</button>`).join('')}
          </div>
          <div id="guessResult" class="mt-2 font-bold text-green-700"></div>
        </div>
      `;
      
      // Add event listeners to guess buttons
      targets.forEach(t => {
        const button = container.querySelector(`button[data-id="${t.id}"]`);
        if(button) {
            button.onclick = async () => {
              // Disable all buttons immediately after a guess
              container.querySelectorAll('.guess-btn').forEach(btn => btn.disabled = true);
              
              let isChor = t.role === 'Chor';
              clearInterval(timerId); // Stop the timer
              
              // Move to the result phase
              db.collection('rmcs_rooms').doc(roomCode).update({
                phase: 'roundResult',
                guess: { sipahi: p.name, guessed: t.name, correct: isChor }
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
      const timerEl = container.querySelector('#timer');
      if (timerEl) timerEl.textContent = `Time Left: ${timerFormat(timer)}`;
      
      if (timer <= 0) {
        clearInterval(timerId);
        // Time's up, automatic wrong guess (guessed: null)
        db.collection('rmcs_rooms').doc(roomCode).update({
          phase: 'roundResult',
          guess: { sipahi: p.name, guessed: null, correct: false }
        });
      }
    }, 1000);
  }

  // --- Round Result Animation & Next Button ---
  function showRoundResult(data, selfId, roomCode, isHost) {
    if (!gameTable) return;
    
    const res = data.guess;
    const playerRoles = data.playerRoles;
    
    let isCorrect = res && res.correct;
    
    let message, emoji;
    if (!res || res.guessed === null) {
        message = "Time ran out! The Chor escapes!";
        emoji = "⏰";
    } else if (isCorrect) {
        message = `Success! The Sipahi (${res.sipahi}) caught the Chor!`;
        emoji = "🎉";
    } else {
        message = `Wrong Guess! The Sipahi (${res.sipahi}) accused ${res.guessed}, but the Chor escapes!`;
        emoji = "😥";
    }
    
    // Find who the Chor was
    const chor = playerRoles.find(p => p.role === 'Chor');
    const mantri = playerRoles.find(p => p.role === 'Mantri');
    const raja = playerRoles.find(p => p.role === 'Raja');
    const sipahi = playerRoles.find(p => p.role === 'Sipahi');
    
    // Display score and full roles
    let scoreRajaMantri = isCorrect ? 1000 : 0; // Raja/Mantri get 1000 points if correct
    let scoreChor = isCorrect ? 0 : 1000; // Chor gets 1000 points if wrong/no guess
    let scoreSipahi = isCorrect ? 1000 : 0; // Sipahi points based on guess

    let resultsHtml = `
      <div class="text-left w-full max-w-sm mt-4 p-4 bg-gray-100 rounded-xl shadow-inner">
        <h4 class="text-lg font-bold mb-2 border-b pb-1">Role Summary</h4>
        <p>👑 Raja: <b>${raja.name}</b></p>
        <p>🧠 Mantri: <b>${mantri.name}</b></p>
        <p>🛡️ Sipahi: <b>${sipahi.name}</b></p>
        <p>🔪 Chor: <b class="text-red-600">${chor.name}</b></p>
        <h4 class="text-lg font-bold mt-3 mb-2 border-b pb-1">Round Points</h4>
        <p>Raja/Mantri/Sipahi: <b class="text-green-600">${scoreRajaMantri} points</b></p>
        <p>Chor: <b class="${scoreChor > 0 ? 'text-red-600' : 'text-green-600'}">${scoreChor} points</b></p>
      </div>
    `;

    gameTable.innerHTML = `
      <div class="flex flex-col justify-center items-center min-h-[200px] animate-fade-in">
        <div class="text-8xl mb-6 animate-pulse">${emoji}</div>
        <div class="rounded-2xl shadow-xl ${isCorrect ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'} py-4 px-8 mb-6 text-2xl font-bold text-center">${message}</div>
        ${resultsHtml}
        ${isHost ? '<button class="next-round-btn px-8 py-3 rounded-xl bg-indigo-600 text-white text-xl shadow-lg hover:bg-indigo-700 mt-5">Start New Round</button>' : 
                   '<div class="mt-5 text-gray-500 font-semibold">Waiting for host to start the next round...</div>'}
      </div>
    `;
    
    // Host-only button to reset the room state for a new round
    if (isHost) {
      const nextRoundBtn = gameTable.querySelector('.next-round-btn');
      if (nextRoundBtn) {
        nextRoundBtn.onclick = async () => {
          const ref = db.collection('rmcs_rooms').doc(roomCode);
          // In a full game, you'd calculate and update persistent scores here.
          // For simplicity, this simply resets the round state.
          await ref.update({
            phase: 'lobby',
            playerRoles: [],
            revealed: [],
            guess: null,
          });
        };
      }
    }
  }

  // --- Exit Lobby ---
  if (exitLobbyBtn) exitLobbyBtn.onclick = async () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    
    // Option to remove the player from the room or delete the room if host
    const selfId = firebase.auth().currentUser?.uid;
    if (selfId && roomId) {
        const roomRef = db.collection('rmcs_rooms').doc(roomId);
        try {
            const doc = await roomRef.get();
            const data = doc.data();
            if (data) {
                if (data.host === selfId) {
                    // Host leaves: Delete the room (or assign new host)
                    await roomRef.delete();
                } else {
                    // Non-host leaves: Remove player from the list
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
  
  // Initial anonymous sign-in to ensure a user is available for room creation/joining
  if (typeof firebase !== 'undefined' && firebase.auth) {
      firebase.auth().onAuthStateChanged(user => {
          if (!user) {
              // Attempts to sign in anonymously if no user is found
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
