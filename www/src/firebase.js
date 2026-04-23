// src/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDM5N2KjctWbKKtY1bP0bde5kaNxqDExbI",
  authDomain: "mathmaze-d57fb.firebaseapp.com",
  projectId: "mathmaze-d57fb",
  storageBucket: "mathmaze-d57fb.appspot.com",
  messagingSenderId: "981708916474",
  appId: "1:981708916474:web:b050824643314771e2eb43"
};

// Ініціалізація
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Експортуємо
export { auth, db, storage };