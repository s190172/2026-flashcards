import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";

// Safely match config files via glob to prevent build failures on GitHub when JSON is missing
const configModules = import.meta.glob("../../firebase-applet-config*.json", { eager: true });
const appletConfig = (Object.values(configModules)[0] as { default?: any })?.default || {};

// Dynamic initialization using environment variables or fallback JSON config
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 
    (import.meta.env.VITE_FIREBASE_PROJECT_ID 
      ? `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com` 
      : appletConfig.authDomain || ""),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 
    (import.meta.env.VITE_FIREBASE_PROJECT_ID 
      ? `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebasestorage.app` 
      : appletConfig.storageBucket || ""),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || appletConfig.measurementId || "",
};

const app = initializeApp(firebaseConfig);

// Use default Firestore instance
export const db = getFirestore(app);
export const auth = getAuth(app);

// Validate Connection on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firebase network is currently offline. Running in local fallback state.");
    }
  }
}
testConnection();
