import { Flashcard } from "../../../types/appTypes";

export const parseCardText = (rawText: string): Partial<Flashcard> => {
  // Split on comma or colon and attempt to extract term and definition
  const match = rawText.match(/^([^,:]+)[,:]\s*(.*)$/i);
  if (match) {
    return {
      term: match[1].trim(),
      definition: match[2].trim()
    };
  }
  return { term: rawText.trim() };
};
