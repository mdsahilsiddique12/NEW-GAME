// --- GLOBAL VARIABLES ---
let db;
let authModal, upgradeModal, loginBtn, userInfo, userNameEl, userCoinsEl;

document.addEventListener("DOMContentLoaded", function() {
    // Initialize Firebase Services safely
    db = firebase.firestore();
    
    // Cache DOM Elements
    authModal = document.getElementById('authModal');
    upgradeModal = document.getElementById('upgradeModal');
    loginBtn = document.getElementById('loginBtn');
    userInfo = document.getElementById('userInfo');
    userNameEl = document.getElementById('userName');
    userCoinsEl = document.getElementById('userCoins');

    // --- AUTH STATE LISTENER (The Watchdog) ---
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            console.log("User detected:", user.uid);
            // 1. User is Logged In
            if(authModal) {
                authModal.classList.add('hidden');
                authModal.style.display = 'none'; 
            }
            
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }
            
            // Set Name
            if(userNameEl) userNameEl.innerText = (user.displayName || "Agent_" + user.uid.substring(0, 4)).toUpperCase();

            // 2. Load User Data
            const userRef = db.collection('users').doc(user.uid);
            try {
                let doc = await userRef.get();
                if (!doc.exists) {
                    const newProfile = {
                        username: user.displayName || "Agent_" + user.uid.substring(0, 4),
                        email: user.email || "guest",
                        coins: 100, xp: 0, level: 1, plan: 'free', inventory: [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await userRef.set(newProfile);
                    doc = await userRef.get();
                }
                const data = doc.data();
                if(userCoinsEl) userCoinsEl.innerText = (data.coins || 0) + " CR";
                
                // Store for game pages
                localStorage.setItem('rmcs_uid', user.uid);
            } catch (e) { console.error("Profile Error:", e); }

        } else {
            console.log("No user. Forcing Login.");
            // 3. User is Logged Out -> FORCE MODAL
            if(authModal) {
                authModal.classList.remove('hidden');
                authModal.style.display = 'flex';
            }
            if(userInfo) {
                userInfo.classList.add('hidden');
                userInfo.classList.remove('flex');
            }
            if(loginBtn) loginBtn.classList.remove('hidden');
        }
    });
});

// --- GLOBAL FUNCTIONS (Must be outside DOMContentLoaded) ---

window.openAuthModal = function() {
    if(authModal) {
        authModal.classList.remove('hidden');
        authModal.style.display = 'flex';
    }
};

window.loginGoogle = function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch(error => alert("Login failed: " + error.message));
};

window.loginGuest = function() {
    firebase.auth().signInAnonymously().catch(error => alert("Guest login failed: " + error.message));
};

// LOGOUT FUNCTION (Added for you)
window.logoutUser = function() {
    if(confirm("Are you sure you want to log out?")) {
        firebase.auth().signOut().then(() => {
            location.reload();
        });
    }
};

window.launchGame = function(page) {
    if (!firebase.auth().currentUser) {
        alert("ACCESS DENIED. You must login first.");
        window.openAuthModal();
        return;
    }
    window.location.href = page;
};

window.openUpgradeModal = function() {
    if(upgradeModal) {
        upgradeModal.classList.remove('hidden');
        upgradeModal.style.display = 'flex';
    }
};

window.closeUpgradeModal = function() {
    if(upgradeModal) {
        upgradeModal.classList.add('hidden');
        upgradeModal.style.display = 'none';
    }
};

window.buyPlan = function(plan) {
    const user = firebase.auth().currentUser;
    if (!user) return alert("Please login first.");
    
    if(confirm(`Confirm upgrade to ${plan.toUpperCase()}?`)) {
        const userRef = db.collection('users').doc(user.uid);
        let coins = 0; 
        if(plan === 'rookie') coins = 500;
        if(plan === 'elite') coins = 2500;
        if(plan === 'legendary') coins = 10000;

        userRef.update({
            plan: plan,
            coins: firebase.firestore.FieldValue.increment(coins)
        }).then(() => {
            alert("Upgrade Successful!");
            window.closeUpgradeModal();
            location.reload();
        });
    }
};
