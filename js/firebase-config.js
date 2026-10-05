import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCo7fogm5s-FH-nKaKaLJjXkziEBQ6jKOc",
  authDomain: "billing-eb822.firebaseapp.com",
  projectId: "billing-eb822",
  storageBucket: "billing-eb822.firebasestorage.app",
  messagingSenderId: "451925717893",
  appId: "1:451925717893:web:f6ff53800a6d50bd158aec",
  measurementId: "G-81YN6JP7KB"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(firebaseApp);

export { firebaseApp, firestoreDb };
