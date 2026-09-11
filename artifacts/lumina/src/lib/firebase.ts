import { initializeApp } from "firebase/auth";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBJNJ4SRWmvL0cNtO3AH2ZEPAWXa6br35A",
  authDomain: "lumina-app-22fd7.firebaseapp.com",
  projectId: "lumina-app-22fd7",
  storageBucket: "lumina-app-22fd7.firebasestorage.app",
  messagingSenderId: "480961815956",
  appId: "1:480961815956:web:419fcd9f9fcddd8d291b81"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
