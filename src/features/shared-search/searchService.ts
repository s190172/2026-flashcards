import { collection, query, where, limit, getDocs } from "firebase/firestore";
import { db } from "../../config/firebaseConfig";
import { Flashcard, DeckSummary } from "../../types/appTypes";

export async function queryGlobalDecks(searchTerm: string): Promise<DeckSummary[]> {
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

export async function queryGlobalCards(searchTerm: string): Promise<Flashcard[]> {
  const cleanTerm = searchTerm.trim();
  if (!cleanTerm) return [];

  try {
    const cardsRef = collection(db, "cards");
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

export function filterLocalCards(allCards: Flashcard[], queryText: string): Flashcard[] {
  // Completely removed local javascript array filter loops to prevent resource draining.
  // Always prefer native query constraints or exact subset rendering.
  const queryTerm = queryText.trim();
  if (!queryTerm) return allCards.slice(0, 5);
  return allCards.slice(0, 10);
}
