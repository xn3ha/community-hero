// ============================================
// STEP 1: Replace these values with YOUR Firebase config
// Get them from: https://console.firebase.google.com
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyCIUK5QiNdOL36AzcHSfYGV1AMBssDl7co",
  authDomain: "gen-lang-client-0659781546.firebaseapp.com",
  projectId: "gen-lang-client-0659781546",
  storageBucket: "gen-lang-client-0659781546.firebasestorage.app",
  messagingSenderId: "341087824108",
  appId: "1:341087824108:web:5d0378a669e2f7a9729dc9"
};

// ============================================
// STEP 2: Replace with YOUR Gemini API key
// Get it from: https://aistudio.google.com/app/apikey
// ============================================
const GEMINI_API_KEY = "AQ.Ab8RN6KIQfoD-8BN5rosvcsXYTKECij4RWTyWScfdCX1Ym_xkQ";

// ============================================
// STEP 3: Replace with YOUR Google Maps API key
// Get it from: https://console.cloud.google.com
// ============================================

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

