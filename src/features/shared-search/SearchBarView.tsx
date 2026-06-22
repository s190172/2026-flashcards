import React, { useState, useEffect, useRef } from "react";
import { dbEngine } from "../../services/dbProvider";
import { Flashcard, DeckSummary, SRSData } from "../../types/appTypes";
import { Search, Loader2, BookOpen, Layers, CheckCircle, AlertCircle, Info } from "lucide-react";

const FALLBACK_METADATA = [
  { id: "meta-1", title: "Tip: Precise Keywords", description: "Search by exact concepts (e.g., 'JSON', 'State') to retrieve exact matched cards." },
  { id: "meta-2", title: "Tip: Full Decks Copying", description: "You can import an entire curated study deck into your active workspace." },
  { id: "meta-3", title: "Tip: SRS Box Placement", description: "All newly imported cards start in Box 1 to let you learn or review fresh." },
  { id: "meta-4", title: "Tip: Zero Interface Lag", description: "Our decoupled srsSyncEngine handles writes in local memory to maximize efficiency." },
  { id: "meta-5", title: "Tip: Daily Streak Recovery", description: "Track your review dates continuously to protect and build your memory stream." }
];

export function SearchBarView({ currentDeckId, onItemsAdded }: { currentDeckId: string, onItemsAdded?: (newCards: Flashcard[]) => void }) {
  const [inputVal, setInputVal] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [addedItems, setAddedItems] = useState<Record<string, boolean>>({});
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const isMounted = useRef<boolean>(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const getInitialSRS = (): SRSData => {
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 1);
    return {
      boxNumber: 1,
      interval: 1,
      isMastered: false,
      next_review_date: nextReview.toISOString()
    };
  };

  const handleExecuteSearch = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    setInfoMessage(null);
    setErrorMessage(null);
    const cleanVal = inputVal.trim();

    if (!cleanVal) {
      setDecks([]);
      setCards([]);
      return;
    }

    if (cleanVal.length < 3) {
      setErrorMessage("Please type at least 3 characters to execute search.");
      return;
    }

    setIsSearching(true);

    try {
      const [decksRes, cardsRes] = await Promise.all([
        dbEngine.queryGlobalDecks(cleanVal).catch(err => {
          console.error("Decks search failed:", err);
          return [] as DeckSummary[];
        }),
        dbEngine.queryGlobalCards(cleanVal).catch(err => {
          console.error("Cards search failed:", err);
          return [] as Flashcard[];
        })
      ]);
      
      if (!isMounted.current) return;

      setDecks(decksRes || []);
      setCards(cardsRes || []);
      
      if ((!decksRes || decksRes.length === 0) && (!cardsRes || cardsRes.length === 0)) {
        setInfoMessage("No matching terms found. Try adjusting your query keywords.");
      }
    } catch (err: any) {
      console.error("Search failed:", err);
      setErrorMessage("An unexpected database error occurred while querying.");
    } finally {
      if (isMounted.current) {
        setIsSearching(false);
      }
    }
  };

  const handleAddDeck = async (deck: DeckSummary) => {
    setInfoMessage(null);
    setErrorMessage(null);
    
    if (!currentDeckId) {
      setErrorMessage("Please select or create a personal deck first before importing items.");
      return;
    }

    if (!deck.cardIds || deck.cardIds.length === 0) {
      setErrorMessage(`The deck "${deck.title}" contains no individual card records.`);
      return;
    }

    try {
      setAddedItems(prev => ({ ...prev, [deck.id]: true }));
      
      const fetchedCards = await dbEngine.fetchGlobalCardsByIds(deck.cardIds);
      
      const defaultSrsData = getInitialSRS();
      Promise.all(
        deck.cardIds.map(cId => 
          dbEngine.savePersonalCardReference(currentDeckId, cId, defaultSrsData)
        )
      ).catch(err => console.error("Database sync failed background save:", err));

      if (onItemsAdded) {
        onItemsAdded(fetchedCards);
      }
      setInfoMessage(`Successfully cloned all cards from "${deck.title}" locally!`);
    } catch (err: any) {
      console.error("Failed to clone deck:", err);
      setErrorMessage(err.message || "Failed to clone deck cards.");
      setAddedItems(prev => ({ ...prev, [deck.id]: false }));
    }
  };

  const handleAddCard = async (card: Flashcard) => {
    setInfoMessage(null);
    setErrorMessage(null);
    
    if (!currentDeckId) {
      setErrorMessage("Please select or create a personal deck first before importing items.");
      return;
    }

    try {
      setAddedItems(prev => ({ ...prev, [card.id]: true }));
      const defaultSrsData = getInitialSRS();
      
      await dbEngine.savePersonalCardReference(currentDeckId, card.id, defaultSrsData);
      
      if (onItemsAdded) {
        onItemsAdded([card]);
      }
      setInfoMessage(`Added card "${card.term}" into your personal deck queue!`);
    } catch (err: any) {
      console.error("Failed to add card:", err);
      setErrorMessage(err.message || "Failed to register card locally.");
      setAddedItems(prev => ({ ...prev, [card.id]: false }));
    }
  };

  const isInputEmpty = !inputVal.trim();

  return (
    <div id="search-bar-view-root" className="w-full max-w-4xl mx-auto p-6 bg-slate-900 text-slate-100 rounded-2xl shadow-xl border border-slate-800">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Global Dictionary Search</h1>
        <p className="text-slate-400 text-sm">Query shared community decks and cards using native Firestore server-side queries.</p>
      </div>

      <form onSubmit={handleExecuteSearch} className="relative mb-6">
        <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-450" />
        <input
          type="text"
          id="search-input-box"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Finish typing, then press enter or click search..."
          className="w-full pl-12 pr-28 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-100 placeholder-slate-500 transition-all font-sans"
        />
        <button
          type="submit"
          id="search-submit-btn"
          disabled={isSearching}
          className="absolute right-2 top-2 px-4 py-1.5 bg-violet-650 hover:bg-violet-600 disabled:bg-slate-800 text-white font-medium rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Searching
            </>
          ) : (
            "Lookup"
          )}
        </button>
      </form>

      {/* Error / Alert banner spaces */}
      {errorMessage && (
        <div className="mb-6 flex gap-3 p-4 bg-rose-950/40 border border-rose-900 rounded-xl text-rose-300 text-sm animate-in fade-in">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {infoMessage && (
        <div className="mb-6 flex gap-3 p-4 bg-emerald-950/40 border border-emerald-900 rounded-xl text-emerald-300 text-sm animate-in fade-in">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* 2. EMPTY STATE GUARDRAIL: SHOW STATIC METADATA (MAX 5 ITEMS) */}
      {isInputEmpty ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-850 pb-2 mb-2">
            <Info className="h-4 w-4 text-violet-400" />
            <h2 className="text-xs uppercase tracking-wider font-bold text-slate-400">Search Guide & Static Reference</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FALLBACK_METADATA.slice(0, 5).map((item) => (
              <div 
                key={item.id} 
                id={`static-${item.id}`}
                className="p-4 bg-slate-950/60 border border-slate-850 rounded-xl transition-all hover:bg-slate-950"
              >
                <h3 className="font-semibold text-xs text-slate-200 mb-1">{item.title}</h3>
                <p className="text-xs text-slate-450 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Result grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Decks Result Block */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
              <Layers className="h-5 w-5 text-indigo-400" />
              <h2 className="font-semibold text-sm uppercase tracking-wider text-slate-300">Global Decks</h2>
            </div>
            {decks.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center italic">No matching decks.</p>
            ) : (
              <div className="space-y-3">
                {decks.map((deck) => (
                  <div key={deck.id} id={`deck-${deck.id}`} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="max-w-[65%]">
                      <h3 className="font-medium text-xs text-slate-200 truncate">{deck.title}</h3>
                      <p className="text-[11px] text-slate-450 truncate mt-0.5">{deck.description || "No description."}</p>
                      <span className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-medium bg-indigo-950 text-indigo-300 rounded border border-indigo-900">
                        {deck.cardIds?.length || 0} cards
                      </span>
                    </div>
                    <button
                      onClick={() => handleAddDeck(deck)}
                      disabled={addedItems[deck.id]}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold tracking-wider uppercase transition-all shrink-0 cursor-pointer ${
                        addedItems[deck.id]
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-900 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white"
                      }`}
                    >
                      {addedItems[deck.id] ? (
                        <>
                          <CheckCircle className="h-3 w-3" /> Added
                        </>
                      ) : (
                        "Import"
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Individual cards Result Block */}
          <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-800">
              <BookOpen className="h-5 w-5 text-emerald-400" />
              <h2 className="font-semibold text-sm uppercase tracking-wider text-slate-300">Loose Flashcards</h2>
            </div>
            {cards.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center italic">No matching individual cards.</p>
            ) : (
              <div className="space-y-3">
                {cards.map((card) => (
                  <div key={card.id} id={`card-${card.id}`} className="flex items-center justify-between p-3 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                    <div className="max-w-[65%]">
                      <h3 className="font-semibold text-xs text-emerald-400 font-mono truncate">{card.term}</h3>
                      <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">{card.definition}</p>
                    </div>
                    <button
                      onClick={() => handleAddCard(card)}
                      disabled={addedItems[card.id]}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold tracking-wider uppercase transition-all shrink-0 cursor-pointer ${
                        addedItems[card.id]
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-900 cursor-not-allowed"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      }`}
                    >
                      {addedItems[card.id] ? (
                        <>
                          <CheckCircle className="h-3 w-3" /> Added
                        </>
                      ) : (
                        "+ Copy"
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
