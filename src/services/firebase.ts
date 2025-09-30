// src/services/firebase.ts

// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  increment,
  updateDoc,
} from "firebase/firestore";
import { getAnalytics, logEvent } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBM-Kr-4_j1LNHRHZXjCodl6SZkz2I01XA",
  authDomain: "deepseek-playground.firebaseapp.com",
  projectId: "deepseek-playground",
  storageBucket: "deepseek-playground.firebasestorage.app",
  messagingSenderId: "957881500732",
  appId: "1:957881500732:web:095fd89be23a14d7402f39",
  measurementId: "G-BE5808NS2L",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Analytics
export const analytics =
  typeof window !== "undefined" ? getAnalytics(app) : null;
export { logEvent };

// Authentication
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

// Firestore
export const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080); // Emulator

// Initialize user count if it doesn't exist
export async function initializeUserCount() {
  const countRef = doc(db, "stats", "userCount");
  const docSnap = await getDoc(countRef);

  if (!docSnap.exists()) {
    await setDoc(countRef, { count: 0 });
  }
}

// Increment user count
export async function incrementUserCount() {
  const countRef = doc(db, "stats", "userCount");
  await updateDoc(countRef, {
    count: increment(1),
  });
}

// Get current user count
export async function getUserCount() {
  const countRef = doc(db, "stats", "userCount");
  const docSnap = await getDoc(countRef);
  return docSnap.exists() ? docSnap.data().count : 0;
}

// 例: Googleでのログイン
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleAuthProvider);
    return result.user;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// 例: サインアウト
export async function doSignOut() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

// 例: ログイン状態変更のリスナー
export function onFirebaseAuthStateChanged(
  callback: (user: FirebaseUser | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      // ログイン時
      if (analytics) {
        logEvent(analytics, "login", {
          method: user.providerData[0]?.providerId || "unknown",
          uid: user.uid,
        });
      }
    } else {
      // ログアウト時
      if (analytics) {
        logEvent(analytics, "logout");
      }
    }
    callback(user);
  });
}
