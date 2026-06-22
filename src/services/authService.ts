import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  User, 
  linkWithCredential, 
  GoogleAuthProvider, 
  EmailAuthProvider,
  signOut
} from "firebase/auth";
import { auth } from "../config/firebaseConfig";

export const authService = {
  /**
   * Initializes auth state and forces an anonymous session if no user exists.
   */
  initAuthSession: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        callback(currentUser);
      } else {
        try {
          const { user } = await signInAnonymously(auth);
          callback(user);
        } catch (err) {
          console.error("Failed to initialize guest session on boot:", err);
          callback(null);
        }
      }
    });
  },

  signInGuest: async () => {
    return await signInAnonymously(auth);
  },

  upgradeGuestToGoogle: async (googleIdToken: string) => {
    if (!auth.currentUser) throw new Error("No active session to upgrade");
    const credential = GoogleAuthProvider.credential(googleIdToken);
    return await linkWithCredential(auth.currentUser, credential);
  },

  upgradeGuestToEmailPassword: async (email: string, password: string) => {
    if (!auth.currentUser) throw new Error("No active session to upgrade");
    const credential = EmailAuthProvider.credential(email, password);
    return await linkWithCredential(auth.currentUser, credential);
  },

  disconnect: async () => {
    await signOut(auth);
  }
};
