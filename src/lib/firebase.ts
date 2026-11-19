import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Firebase web configuration.
// Values are read from the environment (.env / .env.local — see .env.example)
// with the previous hardcoded values as fallback, so the app still boots when
// no .env file is present.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBy6KzxD9KZDtofc0MJzcNlRM9Jzt-DZUk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "anjussaloon.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "anjussaloon",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "anjussaloon.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "120160528567",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:120160528567:web:c8eedda81f2f15005b0532",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-YD29X0H5K6"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
let analytics = null;
if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
  analytics = getAnalytics(app);
}

export { app, analytics, auth, db, storage, firebaseConfig };
