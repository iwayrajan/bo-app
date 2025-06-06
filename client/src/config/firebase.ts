import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBxc776gEgkUmx75m64afzZSZCqDrPIGgk",
  authDomain: "bo-app-77cce.firebaseapp.com",
  projectId: "bo-app-77cce",
  storageBucket: "bo-app-77cce.appspot.com",
  messagingSenderId: "201269067618",
  appId: "1:201269067618:web:de58e971df00ad6720f63b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Auth
const auth = getAuth(app);

// Enable offline persistence
// Note: This is optional but recommended for better offline support
// await enableIndexedDbPersistence(db);

export { db, auth }; 