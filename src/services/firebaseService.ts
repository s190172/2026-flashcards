import { collection, query, where, limit, getDocs, doc, setDoc, documentId, updateDoc, writeBatch, getDoc, getDocFromCache, getDocsFromCache, deleteField, startAfter } from "firebase/firestore";
import { db, auth } from "../config/firebaseConfig";
import { Flashcard, DeckSummary, SRSData } from "../types/appTypes";
import { IDatabaseService } from "./dbInterface";

class FirebaseServiceImpl implements IDatabaseService {
  async queryGlobalCards(searchTerm: string): Promise<Flashcard[]> {
    const cleanTerm = searchTerm.trim();
    if (!cleanTerm) return [];

    try {
      const cardsRef = collection(db, "cards");
      // Use firestore native constraints on the actual 'term' property representing the card term/word
      const q = query(
        cardsRef,
        where("term", ">=", cleanTerm),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const results: Flashcard[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        results.push({ 
          id: docSnap.id, 
          term: data.term || "",
          definition: data.definition || "",
          ...data 
        } as Flashcard);
      });
      return results;
    } catch (err) {
      console.error("Error querying global cards:", err);
      return [];
    }
  }

  async queryGlobalDecks(searchTerm: string): Promise<DeckSummary[]> {
    const cleanTerm = searchTerm.trim();
    if (!cleanTerm) return [];

    try {
      const decksRef = collection(db, "decks");
      const q = query(
        decksRef,
        where("title", ">=", cleanTerm),
        limit(5)
      );
      const querySnapshot = await getDocs(q);
      const results: DeckSummary[] = [];
      querySnapshot.forEach((docSnap) => {
        results.push({ id: docSnap.id, ...docSnap.data() } as DeckSummary);
      });
      return results;
    } catch (err) {
      console.error("Error querying global decks:", err);
      return [];
    }
  }

  async fetchGlobalCardsByIds(cardIds: string[]): Promise<Flashcard[]> {
    if (!cardIds || cardIds.length === 0) return [];
    try {
      const cardsRef = collection(db, "cards");
      const results: Flashcard[] = [];
      const batches = [];
      for (let i = 0; i < cardIds.length; i += 10) {
        batches.push(cardIds.slice(i, i + 10));
      }
      for (const batch of batches) {
        const q = query(cardsRef, where(documentId(), "in", batch));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((docSnap) => {
          results.push({ id: docSnap.id, ...docSnap.data() } as Flashcard);
        });
      }
      return results;
    } catch (err) {
      console.error("Error fetching global cards by IDs:", err);
      return [];
    }
  }

  async savePersonalCardReference(deckId: string, cardId: string, srsData: SRSData): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error("User must be logged in to save personal card reference.");
    }

    const userDeckRef = doc(db, "users", uid, "personal_decks", deckId);
    
    try {
      // Attempt targeted atomic strike first
      await updateDoc(userDeckRef, {
        [`srsMap.${cardId}`]: srsData
      });
    } catch (error: any) {
      // Fallback safeguard with structural setup if the document doesn't exist yet
      if (error.code === 'not-found') {
        await setDoc(userDeckRef, {
          srsMap: {
            [cardId]: srsData
          }
        }, { merge: true });
      } else {
        throw error;
      }
    }
  }

  async deletePersonalCardReference(deckId: string, cardId: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error("User must be logged in to delete personal card reference.");
    }

    const userDeckRef = doc(db, "users", uid, "personal_decks", deckId);
    await updateDoc(userDeckRef, {
      [`srsMap.${cardId}`]: deleteField()
    });
  }

  async resetDeckProgress(deckId: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error("User must be logged in to reset deck progress.");
    }

    const userDeckRef = doc(db, "users", uid, "personal_decks", deckId);
    await updateDoc(userDeckRef, {
      srsMap: {}
    });
  }

  async getDeckStudyAnalytics(deckId: string): Promise<{ missed: number, recalled: number, mastered: number }> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error("User must be logged in to get deck study analytics.");
    }

    const userDeckRef = doc(db, "users", uid, "personal_decks", deckId);
    let docSnap;
    try {
      docSnap = await getDocFromCache(userDeckRef);
      if (!docSnap.exists()) throw new Error("Not in cache");
    } catch (err) {
      docSnap = await getDoc(userDeckRef);
    }

    const result = { missed: 0, recalled: 0, mastered: 0 };

    if (docSnap.exists()) {
      const data = docSnap.data();
      const srsMap = data.srsMap || {};
      for (const cardId of Object.keys(srsMap)) {
        const confidence = srsMap[cardId].confidence;
        if (confidence === "hard") result.missed++;
        else if (confidence === "good") result.recalled++;
        else if (confidence === "easy") result.mastered++;
      }
    }

    return result;
  }

  async syncCardDeltaBatch(deckId: string, updates: { cardId: string, srsData: SRSData }[]): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new Error("User must be logged in to sync card deltas.");
    }

    const userDeckRef = doc(db, "users", uid, "personal_decks", deckId);
    const batch = writeBatch(db);
    
    const updatePayload: Record<string, any> = {};
    for (const update of updates) {
      updatePayload[`srsMap.${update.cardId}`] = update.srsData;
    }
    
    batch.update(userDeckRef, updatePayload);
    await batch.commit();
  }

  async queryGlobalCardsPaginated(searchTerm: string, lastVisibleDoc: any): Promise<{ cards: Flashcard[], lastDoc: any }> {
    const searchClean = searchTerm.toLowerCase().trim();
    let q;

    if (!searchClean) {
      if (lastVisibleDoc) {
        q = query(collection(db, "cards"), limit(12), startAfter(lastVisibleDoc));
      } else {
        q = query(collection(db, "cards"), limit(12));
      }
    } else {
      if (lastVisibleDoc) {
        q = query(
          collection(db, "cards"),
          where("keywords", "array-contains", searchClean),
          limit(12),
          startAfter(lastVisibleDoc)
        );
      } else {
        q = query(
          collection(db, "cards"),
          where("keywords", "array-contains", searchClean),
          limit(12)
        );
      }
    }

    const snapshot = await getDocs(q);
    const cards: Flashcard[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Record<string, any>)
    } as Flashcard));

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

    return { cards, lastDoc };
  }

  async forceSyncDeckFromServer(deckId: string): Promise<DeckSummary | null> {
    const deckRef = doc(db, "decks", deckId);
    try {
      const docSnap = await getDoc(deckRef); // Bypasses client cache, striking the live server directly
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as DeckSummary;
      }
      return null;
    } catch (serverErr) {
      console.error("Manual sync failed. Server unreachable:", serverErr);
      return null;
    }
  }

  async getDeck(deckId: string): Promise<DeckSummary | null> {
    const deckRef = doc(db, "decks", deckId);
    try {
      // Attempt cache read first
      const docSnap = await getDocFromCache(deckRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as DeckSummary;
      }
      return null;
    } catch (err) {
      // Cache miss or expired, fall back to server network
      try {
        const docSnap = await getDoc(deckRef);
        if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() } as DeckSummary;
        }
        return null;
      } catch (serverErr) {
        console.error("Failed to fetch deck from server:", serverErr);
        return null;
      }
    }
  }

  async getUserDecks(): Promise<DeckSummary[]> {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];

    const decksRef = collection(db, "users", uid, "personal_decks");
    try {
      const snapshot = await getDocsFromCache(decksRef);
      const results: DeckSummary[] = [];
      snapshot.forEach(docSnap => results.push({ id: docSnap.id, ...docSnap.data() } as DeckSummary));
      return results;
    } catch (err) {
      // Fall back to server
      try {
        const snapshot = await getDocs(decksRef);
        const results: DeckSummary[] = [];
        snapshot.forEach(docSnap => results.push({ id: docSnap.id, ...docSnap.data() } as DeckSummary));
        return results;
      } catch (serverErr) {
        console.error("Failed to fetch user decks from server:", serverErr);
        return [];
      }
    }
  }

  async publishDeck(deckData: DeckSummary, cards: Flashcard[]): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Must be logged in to publish.");

    const b = writeBatch(db);

    // 1. Deck document reference
    const deckRef = doc(collection(db, "decks"), deckData.id);
    b.set(deckRef, {
      ...deckData,
      authorId: uid,
      createdAt: new Date().toISOString()
    });

    // 2. Card documents reference
    for (const card of cards) {
      const cardRef = doc(collection(db, "cards"), card.id);
      b.set(cardRef, {
        ...card,
        deckId: deckData.id,
        authorId: uid
      });
    }

    // Single atomic transmission
    await b.commit();
  }
}

export const FirebaseService = new FirebaseServiceImpl();

