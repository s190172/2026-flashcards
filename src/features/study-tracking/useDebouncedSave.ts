import { useEffect, useRef } from "react";
import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../config/firebaseConfig";
import { Flashcard } from "../../types/appTypes";

export const useDebouncedSave = (user: any, cards: Flashcard[], stats: any) => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Save to unified local storage
    if (cards || stats) {
        localStorage.setItem("ARCHITECT_LRN_STATE", JSON.stringify({cards, stats}));
    }

    if (!user) return;
    
    // Clear existing timer
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    saveTimeoutRef.current = setTimeout(async () => {
       console.log("🚀 Debounce complete! Firing ONE write to Firestore...");
       try {
         // Batch sync ALL cards
         const chunkSize = 400;
         for (let i = 0; i < cards.length; i += chunkSize) {
           const chunk = cards.slice(i, i + chunkSize);
           const batch = writeBatch(db);
           for (const card of chunk) {
             const docRef = doc(db, "cards", card.id);
             batch.set(docRef, { ...card });
           }
           await batch.commit();
         }
         
         // Update user daily study session stats
         await setDoc(doc(db, "users", user.uid), { 
             lastActive: new Date().toISOString(),
             cardCount: cards.length,
             stats
         }, { merge: true });
       } catch (e) {
         console.error("Auto-save failed", e);
       }
    }, 5000);
    
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [cards, user, stats]);
};
