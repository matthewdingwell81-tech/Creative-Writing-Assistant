import { Capacitor } from "@capacitor/core";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBJNJ4SRWmvL0cNtO3AH2ZEPAWXa6br35A",
  authDomain: "lumina-app-22fd7.firebaseapp.com",
  projectId: "lumina-app-22fd7",
  storageBucket: "lumina-app-22fd7.firebasestorage.app",
  messagingSenderId: "480961815956",
  appId: "1:480961815956:web:419fcd9f9fcddd8d291b81"
};

const app = initializeApp(firebaseConfig);
export const googleWebClientId = "480961815956-fu1vcdqtnnth05fe7v8k098pnjh0amug.apps.googleusercontent.com";
const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
export const auth = isNativeAndroid
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);
export const firestore = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
