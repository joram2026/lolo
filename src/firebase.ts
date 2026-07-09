import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC3gwAuNm3cUj-C490kQWix_5BKkgyS9No",
  authDomain: "lolo-be82d.firebaseapp.com",
  databaseURL: "https://lolo-be82d-default-rtdb.firebaseio.com",
  projectId: "lolo-be82d",
  storageBucket: "lolo-be82d.firebasestorage.app",
  messagingSenderId: "593798055850",
  appId: "1:593798055850:web:6d91f4b56467c3f2c7cdd3",
  measurementId: "G-BZEFBD2R8J"
};

const app = initializeApp(firebaseConfig);

// Initialize firestore using standard default database
const db = getFirestore(app);

const auth = getAuth(app);

export { app, db, auth };
