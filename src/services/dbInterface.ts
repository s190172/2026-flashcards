import { Flashcard, DeckSummary, SRSData } from "../types/appTypes";

export interface IDatabaseService {
  queryGlobalCards(searchTerm: string): Promise<Flashcard[]>;
  queryGlobalDecks(searchTerm: string): Promise<DeckSummary[]>;
  fetchGlobalCardsByIds(cardIds: string[]): Promise<Flashcard[]>;
  savePersonalCardReference(deckId: string, cardId: string, srsData: SRSData): Promise<void>;
  deletePersonalCardReference(deckId: string, cardId: string): Promise<void>;
  resetDeckProgress(deckId: string): Promise<void>;
  getDeckStudyAnalytics(deckId: string): Promise<{ missed: number, recalled: number, mastered: number }>;
  syncCardDeltaBatch(deckId: string, updates: { cardId: string, srsData: SRSData }[]): Promise<void>;
  queryGlobalCardsPaginated(searchTerm: string, lastVisibleDoc: any): Promise<{ cards: Flashcard[], lastDoc: any }>;
  forceSyncDeckFromServer(deckId: string): Promise<DeckSummary | null>;
  getDeck(deckId: string): Promise<DeckSummary | null>;
  getUserDecks(): Promise<DeckSummary[]>;
  publishDeck(deckData: DeckSummary, cards: Flashcard[]): Promise<void>;
}
