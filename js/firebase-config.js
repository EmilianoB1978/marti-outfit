// =============================================================================
// Firebase configuration
// =============================================================================
// 1. Vai su https://console.firebase.google.com
// 2. Crea un progetto (es. "my-wardrobe")
// 3. Aggiungi una "Web App" (icona </>)
// 4. Copia il blocco firebaseConfig qui sotto, sostituendo i valori
// 5. Abilita: Firestore Database (modalita' produzione) e Storage
// 6. Vedi README.md per le regole di sicurezza Firestore/Storage
// =============================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

// Configurazione Firebase del progetto my-wardrobe-e9ebd
const firebaseConfig = {
  apiKey: "AIzaSyCQysgZ_ab67GI2iH4R68nYFBrgrjzj53o",
  authDomain: "my-wardrobe-e9ebd.firebaseapp.com",
  projectId: "my-wardrobe-e9ebd",
  storageBucket: "my-wardrobe-e9ebd.firebasestorage.app",
  messagingSenderId: "62912683355",
  appId: "1:62912683355:web:a7d2d6b97cd43e61b88e7e",
  measurementId: "G-N44B19X7KR"
};

// Verifica che la configurazione sia stata inserita (placeholder rimosso = configurato)
const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("TUA_");

let app, db, storage;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  console.warn("[Firebase] Non configurato - vedi js/firebase-config.js");
}

// Esporto sia gli oggetti che le funzioni helper, in modo che gli altri
// moduli importino solo da qui (single source of truth).
export {
  isConfigured,
  db,
  storage,
  // Firestore
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  // Storage
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
};