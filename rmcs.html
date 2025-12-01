<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RMCS Protocol | Game Nexus</title>
  
  <!-- Fonts & Tailwind -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Rajdhani:wght@300;500;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  
  <!-- Firebase -->
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js"></script>
  <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js"></script>
  <script src="js/firebase-config.js"></script>

  <style>
    /* --- CYBERPUNK THEME --- */
    :root {
      --neon-blue: #00f3ff;
      --neon-green: #00ff9d;
      --neon-pink: #d946ef; 
      --bg-dark: #050b14;
    }

    * { box-sizing: border-box; user-select: none; }
    body {
      font-family: 'Rajdhani', sans-serif;
      background-color: var(--bg-dark);
      color: white;
      min-height: 100vh;
      display: flex; flex-direction: column;
      overflow-x: hidden;
    }

    /* Background Grid */
    .cyber-grid {
      position: fixed; inset: 0; z-index: -1;
      background-image: 
        linear-gradient(rgba(0, 243, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 243, 255, 0.03) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
    }

    /* Cyber Buttons */
    .cyber-btn {
      font-family: 'Orbitron', sans-serif; text-transform: uppercase; letter-spacing: 2px;
      background: rgba(0, 243, 255, 0.1); border: 1px solid var(--neon-blue);
      color: var(--neon-blue); padding: 12px 24px; clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
      transition: 0.3s; cursor: pointer; position: relative; overflow: hidden;
    }
    .cyber-btn:hover { background: var(--neon-blue); color: black; box-shadow: 0 0 20px var(--neon-blue); }
    
    .cyber-btn.danger { border-color: var(--neon-pink); color: var(--neon-pink); background: rgba(217, 70, 239, 0.1); }
    .cyber-btn.danger:hover { background: var(--neon-pink); color: white; box-shadow: 0 0 20px var(--neon-pink); }

    /* Inputs */
    .cyber-input {
      background: rgba(0,0,0,0.5); border: 1px solid #334155; color: white;
      font-family: 'Orbitron', sans-serif; padding: 12px; width: 100%;
      outline: none; transition: 0.3s; text-align: center; letter-spacing: 2px;
    }
    .cyber-input:focus { border-color: var(--neon-blue); box-shadow: 0 0 15px rgba(0, 243, 255, 0.2); }

    /* Game Table */
    .game-table {
      position: relative; width: 320px; height: 320px; margin: 2rem auto;
      border-radius: 50%; border: 2px dashed rgba(255,255,255,0.1);
      display: flex; align-items: center; justify-content: center;
    }
    .game-content {
      position: absolute; width: 200px; height: 200px;
      display: flex; align-items: center; justify-content: center;
      text-align: center; z-index: 10;
    }

    /* Avatars */
    .avatar {
      position: absolute; width: 70px; height: 70px;
      background: #0f172a; border: 2px solid var(--neon-blue);
      border-radius: 50%; display: flex; flex-direction: column;
      align-items: center; justify-content: center; 
      box-shadow: 0 0 15px rgba(0,0,0,0.5); transition: 0.3s;
    }
    .avatar-name {
      position: absolute; bottom: -20px; width: 120px; text-align: center;
      font-size: 0.75rem; font-weight: bold; color: var(--neon-blue);
      text-shadow: 0 0 5px black;
    }

    /* Modals */
    .modal-overlay { background: rgba(0,0,0,0.95); backdrop-filter: blur(10px); z-index: 100; }
    .active-screen { animation: fadeIn 0.4s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>

  <div class="cyber-grid"></div>

  <!-- NAVIGATION -->
  <nav class="flex justify-between items-center p-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-50">
    <div class="flex items-center gap-3">
      <a href="index.html" class="text-gray-400 hover:text-white transition"><i class="fa-solid fa-arrow-left"></i> HUB</a>
      <span class="h-4 w-[1px] bg-gray-600"></span>
      <span class="font-cyber text-neon-blue tracking-widest font-bold">RMCS PROTOCOL</span>
    </div>
    <div class="flex items-center gap-4">
        <button id="logoutBtn" class="hidden text-red-400 text-xs border border-red-900 px-2 py-1 rounded hover:bg-red-900/20">SIGNOUT</button>
        <button id="openStoreBtn" class="text-yellow-400 hover:text-white transition text-sm">
            <i class="fa-solid fa-shop mr-1"></i> STORE
        </button>
        <div id="userCoins" class="text-xs font-mono border border-yellow-500/30 px-2 py-1 rounded text-yellow-400">0 CR</div>
    </div>
  </nav>

  <!-- MAIN CONTAINER -->
  <main class="flex-1 flex items-center justify-center p-4 relative">
    
    <!-- 1. MAIN MENU SCREEN -->
    <div id="mainMenu" class="active-screen w-full max-w-md text-center space-y-6">
      <h1 class="text-5xl font-cyber font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-8 drop-shadow-[0_0_15px_rgba(0,243,255,0.3)]">
        RAJA MANTRI
      </h1>
      
      <button class="create-btn cyber-btn w-full text-lg font-bold"><i class="fa-solid fa-plus mr-2"></i> CREATE LOBBY</button>
      <button class="join-btn cyber-btn w-full text-lg font-bold border-gray-500 text-gray-300"><i class="fa-solid fa-right-to-bracket mr-2"></i> JOIN LOBBY</button>
      <button id="openHistoryBtn" class="text-sm text-gray-500 hover:text-neon-blue tracking-widest mt-8 underline decoration-dotted">VIEW MISSION LOGS</button>
    </div>

    <!-- 2. CREATE SCREEN -->
    <div id="createScreen" class="hidden w-full max-w-sm bg-black/60 border border-gray-700 p-8 rounded-xl backdrop-blur-md">
      <h2 class="font-cyber text-2xl text-white mb-6 text-center">INITIATE LOBBY</h2>
      <input type="text" id="createPlayerName" placeholder="CODENAME" class="cyber-input mb-4">
      <input type="text" id="createRoomCode" placeholder="ROOM CODE (OPTIONAL)" class="cyber-input mb-6 uppercase" maxlength="6">
      <button id="createRoomFinal" class="cyber-btn w-full mb-3">INITIALIZE</button>
      <button class="back-btn text-gray-500 text-xs w-full hover:text-white">ABORT</button>
    </div>

    <!-- 3. JOIN SCREEN -->
    <div id="joinScreen" class="hidden w-full max-w-sm bg-black/60 border border-gray-700 p-8 rounded-xl backdrop-blur-md">
      <h2 class="font-cyber text-2xl text-white mb-6 text-center">JOIN FREQUENCY</h2>
      <input type="text" id="joinPlayerName" placeholder="CODENAME" class="cyber-input mb-4">
      <input type="text" id="joinRoomCode" placeholder="ENTER ROOM CODE" class="cyber-input mb-6 uppercase" maxlength="6">
      <button id="joinRoomFinal" class="cyber-btn w-full mb-3">CONNECT</button>
      <button class="back-btn text-gray-500 text-xs w-full hover:text-white">ABORT</button>
    </div>

    <!-- 4. GAME SCREEN -->
    <div id="gameScreen" class="hidden w-full max-w-5xl flex-col md:flex-row gap-6 items-start h-[80vh]">
      <div class="flex-1 w-full h-full bg-black/40 border border-white/5 rounded-2xl relative flex flex-col items-center justify-center overflow-hidden">
        <div class="absolute top-4 left-4 z-20"><div id="currentRoomCode" class="text-neon-green font-mono text-xl font-bold"></div></div>
        <div class="absolute top-4 right-4 z-20"><button id="cancelRoomBtn" class="text-red-500 hover:text-red-400 text-xs border border-red-500/30 px-3 py-1 rounded bg-red-900/10">END SESSION</button></div>

        <div class="game-table">
          <div class="table absolute inset-0 rounded-full border border-dashed border-white/10 animate-[spin_60s_linear_infinite]"></div>
          <div id="gameContent" class="game-content"></div>
        </div>

        <div id="roundTransition" class="hidden absolute inset-0 bg-black z-50 flex-col items-center justify-center">
            <h2 id="roundTitle" class="text-6xl font-cyber text-neon-blue animate-bounce">ROUND 1</h2>
        </div>
        <button id="startGameBtn" class="cyber-btn absolute bottom-10 z-20 shadow-lg">INITIATE SEQUENCE</button>
      </div>

      <div class="w-full md:w-80 bg-black/60 border border-white/10 h-full rounded-xl p-4 flex flex-col backdrop-blur-md">
        <div class="flex border-b border-gray-700 mb-4">
            <div class="flex-1 text-center pb-2 border-b-2 border-neon-blue text-white text-xs font-bold tracking-widest">AGENTS</div>
            <div class="flex-1 text-center pb-2 text-gray-500 text-xs font-bold tracking-widest">SCORE</div>
        </div>
        <div id="playersList" class="space-y-2 mb-6"></div>
        <div class="flex-1 overflow-y-auto"><h3 class="text-[10px] text-gray-500 uppercase mb-2 font-bold">Live Data</h3><div id="scoreList" class="space-y-1"></div></div>
        <button id="exitLobbyBtn" class="mt-auto w-full py-3 text-xs text-red-400 hover:text-white border border-red-900/50 hover:bg-red-900/20 rounded transition">DISCONNECT</button>
      </div>
    </div>

    <!-- 5. STORE SCREEN -->
    <div id="storeScreen" class="hidden w-full max-w-4xl h-[80vh] bg-[#0a0a15] border border-neon-blue/30 rounded-2xl p-6 flex-col relative shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        <button class="back-btn absolute top-6 right-6 text-gray-400 hover:text-white text-2xl">&times;</button>
        <h2 class="font-cyber text-3xl text-white mb-6 flex items-center gap-3"><i class="fa-solid fa-cart-shopping text-neon-blue"></i> BLACK MARKET</h2>
        <div class="flex gap-4 mb-6 border-b border-gray-800">
            <button onclick="filterStore('avatars')" class="store-tab pb-2 px-4 text-white border-b-2 border-neon-blue font-bold text-sm hover:text-neon-blue transition">AVATARS</button>
            <button onclick="filterStore('colors')" class="store-tab pb-2 px-4 text-gray-500 border-b-2 border-transparent font-bold text-sm hover:text-neon-blue transition">COLORS</button>
            <button onclick="filterStore('sounds')" class="store-tab pb-2 px-4 text-gray-500 border-b-2 border-transparent font-bold text-sm hover:text-neon-blue transition">AUDIO</button>
        </div>
        <div id="storeGrid" class="grid grid-cols-2 md:grid-cols-4 gap-4 overflow-y-auto p-2"></div>
    </div>

  </main>

  <!-- AUTH MODAL (ADDED) -->
  <div id="authModal" class="modal-overlay fixed inset-0 hidden flex items-center justify-center p-4">
    <div class="bg-[#0a0a15] border-2 border-neon-blue p-10 rounded-xl max-w-sm w-full text-center shadow-[0_0_60px_rgba(0,243,255,0.15)]">
      <h2 class="font-cyber text-3xl text-white mb-8 tracking-widest">IDENTIFICATION</h2>
      
      <button id="googleLoginBtn" class="w-full bg-white text-black font-bold font-cyber py-4 rounded mb-4 flex items-center justify-center gap-3 hover:bg-gray-200 transition shadow-lg">
        <i class="fa-brands fa-google text-xl"></i> ACCESS VIA GOOGLE
      </button>
      
      <div class="my-6 border-t border-gray-800"></div>

      <button id="guestLoginBtn" class="text-gray-500 hover:text-white text-xs font-bold uppercase tracking-[0.2em] transition">
        [ Continue as Guest ]
      </button>
    </div>
  </div>

  <!-- HISTORY MODAL -->
  <div id="historyModal" class="fixed inset-0 bg-black/90 z-[60] hidden items-center justify-center p-4">
    <div class="bg-[#0f172a] border border-gray-600 w-full max-w-2xl rounded-lg p-6 max-h-[80vh] flex flex-col">
        <div class="flex justify-between items-center mb-4"><h2 class="font-cyber text-xl text-white">MISSION LOGS</h2><button id="closeHistoryBtn" class="text-gray-400 hover:text-white">&times;</button></div>
        <div id="historyContent" class="overflow-y-auto flex-1"></div>
    </div>
  </div>

  <!-- FEEDBACK MODAL -->
  <div id="feedbackModal" class="fixed inset-0 bg-black/95 z-[70] hidden items-center justify-center p-4 backdrop-blur-sm">
    <div class="bg-gray-900 border border-neon-blue w-full max-w-md rounded-xl p-8 text-center relative">
        <h2 class="font-cyber text-2xl text-neon-blue mb-2">DEBRIEFING</h2>
        <input type="text" id="feedbackName" class="cyber-input mb-6 text-left" readonly>
        <textarea id="feedbackText" placeholder="Additional Intel (Optional)" class="w-full bg-black border border-gray-700 text-white p-3 rounded mb-4 text-sm h-20"></textarea>
        <button id="submitFeedbackBtn" class="cyber-btn w-full mb-2">TRANSMIT DATA</button>
        <button id="skipFeedbackBtn" class="text-gray-500 text-xs hover:text-white">SKIP DEBRIEF</button>
    </div>
  </div>

  <script src="js/rmcs.js"></script>

</body>
</html>
