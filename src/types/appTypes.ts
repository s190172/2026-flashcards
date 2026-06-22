export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  hint: string;
  confidence?: "hard" | "good" | "easy" | "";
  interval?: number;
  ease_factor?: number;
  next_review_date?: string;
  isMastered?: boolean;
  searchKeywords?: string[];
}

export interface DeckSummary {
  id: string;
  title: string;
  description: string;
  cardCount: number;
  creatorName: string;
  searchKeywords: string[];
  cardIds: string[];
}

export interface SRSData {
  boxNumber: number;
  interval: number;
  isMastered: boolean;
  next_review_date: string; // ISO String
}

export interface ExamQuestion {
  id: string;
  type: "multiple-choice-term" | "multiple-choice-def" | "true-false" | "fill-blank";
  prompt: string;
  correctAnswer: string;
  choices?: string[];
  pairingTerm?: string; // used for true-false visual reference
  pairingDef?: string; // used for true-false visual reference
}

export interface MatchTile {
  id: string; // unique tile ID: "term-{cardId}" or "def-{cardId}"
  cardId: string;
  type: "term" | "def";
  text: string;
}
