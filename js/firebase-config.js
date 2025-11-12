// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBs8Og7h-YLS3GsrYxDmWYl-468x53N8Fw",
  authDomain: "my-game-1a8b5.firebaseapp.com",
  projectId: "my-game-1a8b5",
  storageBucket: "my-game-1a8b5.firebasestorage.app",
  messagingSenderId: "835310690681",
  appId: "1:835310690681:web:01131eb278ee63682d4fa8",
  measurementId: "G-SPMYSY2T5K"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Sign in anonymously
firebase.auth().signInAnonymously().catch((error) => {
  console.error("Auth error:", error);
});

// Listen for authentication state changes
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    console.log("Signed in as:", user.uid);
  } else {
    console.log("Signed out");
  }
});
