console.log("Index.js initializing...");

// 1. Initialize DB Global
const db = firebase.firestore();

// ===========================================================
// GLOBAL WINDOW FUNCTIONS (Available immediately)
// ===========================================================

// --- AUTH FUNCTIONS ---
window.openAuthModal = function() {
    const modal = document.getElementById('authModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.loginGoogle = function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider).catch(error => alert("Login Error: " + error.message));
};

window.loginGuest = function() {
    firebase.auth().signInAnonymously().catch(error => alert("Guest Error: " + error.message));
};

window.logoutUser = function() {
    if(confirm("Are you sure you want to log out?")) {
        firebase.auth().signOut().then(() => {
            window.location.reload();
        });
    }
};

// --- NAVIGATION FUNCTIONS ---
window.launchGame = function(page) {
    if (!firebase.auth().currentUser) {
        alert("ACCESS DENIED. Please Login first.");
        window.openAuthModal();
        return;
    }
    window.location.href = page;
};

// --- UPGRADE UI FUNCTIONS ---
window.openUpgradeModal = function() {
    const modal = document.getElementById('upgradeModal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

window.closeUpgradeModal = function() {
    const modal = document.getElementById('upgradeModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
};

// --- UPGRADE LOGIC (BUY PLAN) ---
window.buyPlan = function(plan) {
    const user = firebase.auth().currentUser;
    if (!user) return alert("Please login first.");
    
    // Define Plan Perks
    let coins = 0;
    let xp = 0;
    let badge = 'rookie';
    
    if(plan === 'rookie') { coins = 500; xp = 500; badge = 'bronze'; }
    if(plan === 'elite') { coins = 2500; xp = 2000; badge = 'silver'; }
    if(plan === 'legendary') { coins = 10000; xp = 5000; badge = 'gold'; }

    if(confirm(`Confirm upgrade to ${plan.toUpperCase()} tier?`)) {
        const userRef = db.collection('users').doc(user.uid);
        
        userRef.update({
            plan: plan,
            badge: badge,
            coins: firebase.firestore.FieldValue.increment(coins),
            xp: firebase.firestore.FieldValue.increment(xp),
            lastUpgrade: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            alert(`SUCCESS! You are now a ${plan.toUpperCase()} Agent.`);
            window.closeUpgradeModal();
            // Force reload to update UI
            window.location.reload();
        }).catch(e => {
            alert("Transaction Failed: " + e.message);
        });
    }
};

// ===========================================================
// EVENT LISTENERS (Runs when page loads)
// ===========================================================
document.addEventListener("DOMContentLoaded", function() {
    
    // --- AUTH STATE MONITOR ---
    firebase.auth().onAuthStateChanged(async (user) => {
        
        // Get Elements freshly
        const authModal = document.getElementById('authModal');
        const loginBtn = document.getElementById('loginBtn');
        const userInfo = document.getElementById('userInfo');
        const userNameEl = document.getElementById('userName');
        const userCoinsEl = document.getElementById('userCoins');

        if (user) {
            // >>> USER IS LOGGED IN <<<
            console.log("User Logged In:", user.uid);

            // 1. Hide Login Modal
            if(authModal) {
                authModal.classList.add('hidden');
                authModal.style.display = 'none';
            }
            
            // 2. Show User Info on Navbar
            if(loginBtn) loginBtn.classList.add('hidden');
            if(userInfo) {
                userInfo.classList.remove('hidden');
                userInfo.classList.add('flex');
            }

            // 3. Set Name
            if(userNameEl) userNameEl.innerText = (user.displayName || "AGENT").toUpperCase();

            // 4. Fetch or Create Database Profile
            const userRef = db.collection('users').doc(user.uid);
            try {
                let doc = await userRef.get();

                if (!doc.exists) {
                    // First time login? Create profile.
                    await userRef.set({
                        username: user.displayName || "Agent",
                        email: user.email || "guest",
                        coins: 100, // Welcome Bonus
                        xp: 0,
                        plan: 'free',
                        inventory: [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    doc = await userRef.get();
                }
                
                // Update Coins Display
                const data = doc.data();
                if(userCoinsEl) userCoinsEl.innerText = (data.coins || 0) + " CR";

            } catch (e) {
                console.error("Error fetching profile:", e);
            }

        } else {
            // >>> USER IS LOGGED OUT <<<
            console.log("User Logged Out. Enforcing Login.");

            // 1. Force Modal Open
            if(authModal) {
                authModal.classList.remove('hidden');
                authModal.style.display = 'flex';
            }

            // 2. Reset Navbar
            if(userInfo) {
                userInfo.classList.add('hidden');
                userInfo.classList.remove('flex');
            }
            if(loginBtn) loginBtn.classList.remove('hidden');
        }
    });

});
