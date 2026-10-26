import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyBy6KzxD9KZDtofc0MJzcNlRM9Jzt-DZUk",
  authDomain: "anjussaloon.firebaseapp.com",
  projectId: "anjussaloon",
  storageBucket: "anjussaloon.firebasestorage.app",
  messagingSenderId: "120160528567",
  appId: "1:120160528567:web:c8eedda81f2f15005b0532",
  measurementId: "G-YD29X0H5K6"
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
