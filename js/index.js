document.addEventListener("DOMContentLoaded", function() {
    // Initialize Firestore
    const db = firebase.firestore();

    // DOM Elements
    const authModal = document.getElementById('authModal');
    const upgradeModal = document.getElementById('upgradeModal');
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userNameEl = document.getElementById('userName');
    const userCoinsEl = document.getElementById('userCoins');

    // --- GLOBAL FUNCTIONS (Attached to window for HTML onclick access) ---

    window.openAuthModal = function() {
        authModal.classList.remove('hidden');
        authModal.style.display = 'flex';
    };

    window.loginGoogle = function() {
        const provider = new firebase.auth.GoogleAuthProvider();
        firebase.auth().signInWithPopup(provider).catch(error => {
            alert("Login failed: " + error.message);
        });
    };

    window.loginGuest = function() {
        firebase.auth().signInAnonymously()
            .then(() => {
                authModal.classList.add('hidden');
                authModal.style.display = 'none';
            })
            .catch(error => {
                alert("Guest login failed: " + error.message);
            });
    };

    window.launchGame = function(page) {
        if (!firebase.auth().currentUser) {
            alert("ACCESS DENIED. Identification required.");
            window.openAuthModal();
            return;
        }
        window.location.href = page;
    };

    window.openUpgradeModal = function() {
        upgradeModal.classList.remove('hidden');
        upgradeModal.style.display = 'flex';
    };

    window.closeUpgradeModal = function() {
        upgradeModal.classList.add('hidden');
        upgradeModal.style.display = 'none';
    };

    // Mock Payment Integration
    window.buyPlan = function(plan) {
        const user = firebase.auth().currentUser;
        if (!user) return alert("Please login first.");
        
        if(confirm(`Confirm upgrade to ${plan.toUpperCase()} protocol?`)) {
            const userRef = db.collection('users').doc(user.uid);
            
            // Give bonuses based on plan
            let coinsToAdd = 0;
            let xpToAdd = 0;
            if(plan === 'rookie') { coinsToAdd = 500; xpToAdd = 500; }
            if(plan === 'elite') { coinsToAdd = 2500; xpToAdd = 2000; }
            if(plan === 'legendary') { coinsToAdd = 10000; xpToAdd = 5000; }

            userRef.update({
                plan: plan,
                coins: firebase.firestore.FieldValue.increment(coinsToAdd),
                xp: firebase.firestore.FieldValue.increment(xpToAdd),
                lastPlanUpdate: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                alert(`UPGRADE SUCCESSFUL. Welcome to ${plan.toUpperCase()} tier.`);
                window.closeUpgradeModal();
                location.reload(); // Refresh to show updated coins
            }).catch(e => alert("Transaction Failed: " + e.message));
        }
    };

    // --- AUTH STATE LISTENER ---
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            // 1. UI Updates (Logged In)
            authModal.classList.add('hidden');
            authModal.style.display = 'none';
            
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            userInfo.classList.add('flex');
            
            // Set Name
            userNameEl.innerText = (user.displayName || "Agent_" + user.uid.substring(0, 4)).toUpperCase();

            // 2. Load/Create User Data in Firestore
            const userRef = db.collection('users').doc(user.uid);
            try {
                let doc = await userRef.get();

                if (!doc.exists) {
                    // Create new profile if missing
                    const newProfile = {
                        username: user.displayName || "Agent_" + user.uid.substring(0, 4),
                        email: user.email || "guest",
                        coins: 100, // Signup Bonus
                        xp: 0, 
                        level: 1, 
                        plan: 'free', 
                        inventory: [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    await userRef.set(newProfile);
                    doc = await userRef.get();
                }

                // Display Coins
                const data = doc.data();
                userCoinsEl.innerText = (data.coins || 0) + " CR";
                
                // Store for game pages
                localStorage.setItem('rmcs_uid', user.uid);

            } catch (e) {
                console.error("Error loading profile:", e);
            }

        } else {
            // 3. UI Updates (Logged Out)
            // Show auth modal after slight delay for effect
            setTimeout(() => {
                if(authModal.classList.contains('hidden')) {
                     authModal.classList.remove('hidden');
                     authModal.style.display = 'flex';
                }
            }, 800);
            
            userInfo.classList.add('hidden');
            userInfo.classList.remove('flex');
            loginBtn.classList.remove('hidden');
        }
    });
});
