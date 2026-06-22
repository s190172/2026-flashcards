import { doc, writeBatch } from "firebase/firestore";
import { db, auth } from "../config/firebaseConfig";

// ======================================================================
// GLOBALLY ISOLATED MEMORY LAYER (Completely separate from React lifecycles)
// ======================================================================
let sessionWriteBuffer: Record<string, { deckId: string; srsData: any }> = {};

/**
 * Stages card progress entirely in local memory.
 * This function handles the "Click Storm" with ZERO cloud database footprint.
 */
export const stageCardProgress = (deckId: string, cardId: string, srsData: any): void => {
  // Update the isolated plain JavaScript dictionary
  sessionWriteBuffer[`${deckId}/${cardId}`] = { deckId, srsData };
  
  // Mirror to LocalStorage solely as a backup safety net for cold crashes
  try {
    localStorage.setItem("architect_lrn_backup_buffer", JSON.stringify(sessionWriteBuffer));
  } catch (err) {
    console.error("Local caching fallback failed:", err);
  }
};

/**
 * Compiles all accumulated mutations into a single atomic transaction 
 * and pushes it to Firestore only when the session ends.
 */
export const flushSessionBufferToCloud = async (): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid || Object.keys(sessionWriteBuffer).length === 0) return;

  try {
    const batch = writeBatch(db);
    const updatesByDeck: Record<string, Record<string, any>> = {};

    // Group individual card metrics by their respective parent decks
    Object.entries(sessionWriteBuffer).forEach(([key, item]) => {
      const cId = key.split('/')[1];
      if (!updatesByDeck[item.deckId]) {
        updatesByDeck[item.deckId] = {};
      }
      updatesByDeck[item.deckId][`srsMap.${cId}`] = item.srsData;
    });

    // Stage updates into the atomic transaction batch
    Object.entries(updatesByDeck).forEach(([deckId, payload]) => {
      const deckRef = doc(db, "users", uid, "personal_decks", deckId);
      batch.update(deckRef, {
        ...payload,
        lastUpdated: Date.now()
      });
    });

    // Execute the single cloud transaction
    await batch.commit();
    
    // Wipe local cache records clean upon successful transmission
    sessionWriteBuffer = {};
    localStorage.removeItem("architect_lrn_backup_buffer");
    console.log("Write-Behind Session Cache cleanly committed to Firestore.");
  } catch (error) {
    console.error("Critical failure during exit batch synchronization:", error);
  }
};

/**
 * Global App Wire: Attaches the modern Page Lifecycle event listener.
 * Place this inside your root file (like index.tsx or App.tsx) on startup.
 */
export const initializeLifecycleGuard = (): void => {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushSessionBufferToCloud();
    }
  });
  
  // Cold Recovery Phase: Automatically resolve any interrupted previous sessions
  const lingeringBackup = localStorage.getItem("architect_lrn_backup_buffer");
  if (lingeringBackup) {
    try {
      const parsed = JSON.parse(lingeringBackup);
      sessionWriteBuffer = parsed;
      flushSessionBufferToCloud();
    } catch (e) {
      localStorage.removeItem("architect_lrn_backup_buffer");
    }
  }
};
