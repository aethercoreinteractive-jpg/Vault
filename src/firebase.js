
import { initializeApp } from "firebase/app";

import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

import {
  getDatabase,
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue
} from "firebase/database";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDhcLaRIRDoalYSUxFLbKoRreLWt6aP3OQ",
  authDomain: "vault-5c2f4.firebaseapp.com",
  databaseURL: "https://vault-5c2f4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vault-5c2f4",
  storageBucket: "vault-5c2f4.firebasestorage.app",
  messagingSenderId: "593105426462",
  appId: "1:593105426462:web:e268bd0aec6ea012c8f60f",
  measurementId: "G-QDE13VT79C"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);

export const authReady = setPersistence(
  auth,
  browserLocalPersistence
);

export {
  ref,
  get,
  set,
  push,
  update,
  remove,
  onValue,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};
