import React, { useState, useEffect } from "react";
import { CheckCircle2, RotateCw, HelpCircle, Volume2, GraduationCap, Plus, Award, Download } from "lucide-react";
import { stageCardProgress } from "../services/srsSyncEngine";

export function FlashcardStudyView({
  isDark,
  stylesObj,
  userId,
  activeDeckId,
  onOpenSetup,
  exportDeckToPDF
}: {
  isDark: boolean;
  stylesObj: any;
  userId?: string;
  activeDeckId?: string;
  onOpenSetup: () => void;
  exportDeckToPDF: () => void;
}) {
  const [deck, setDeck] = useState<any[]>([]);
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // LOCAL STORAGE REFERENCE ONLY (Empty dependency array)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("learning_dashboard_cards");
      if (stored) {
        const parsed = JSON.parse(stored);
        setDeck(parsed);
        // Start review queue with all cards
        setSessionQueue(parsed.map((c: any) => c.id));
      }
    } catch (e) {
      console.error("Failed to parse local deck state:", e);
    }
  }, []);

  const activeCardIndex = sessionQueue.length > 0 && deck.length > 0
    ? deck.findIndex(c => c.id === sessionQueue[0])
    : 0;
  
  const currentCard = deck[activeCardIndex >= 0 ? activeCardIndex : 0];

  const calculateSRS = (card: any, type: "hard" | "good" | "easy") => {
    const currentInterval = card.interval || 0;
    const ease = card.ease_factor || 2.5;
    
    let nextInterval = 1;
    let nextEase = ease;

    if (type === "hard") {
      nextInterval = 1;
      nextEase = Math.max(1.3, ease - 0.2);
    } else if (type === "good") {
      nextInterval = currentInterval === 0 ? 1 : currentInterval === 1 ? 6 : Math.round(currentInterval * ease);
    } else {
      nextInterval = currentInterval === 0 ? 4 : Math.round(currentInterval * ease * 1.3);
      nextEase += 0.15;
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + nextInterval);

    return {
      boxNumber: 1, // keeping standard type requirement
      interval: nextInterval,
      ease_factor: nextEase,
      isMastered: type === "easy" || type === "good",
      next_review_date: nextReview.toISOString()
    };
  };

  // 2. WATER-TIGHT CLICK MUTATION LOGIC
  const handleReview = (type: "hard" | "good" | "easy") => {
    if (!currentCard) return;

    const srs = calculateSRS(currentCard, type);
    const isMastered = srs.isMastered;

    // STEP A: Mutate the local component React state immediately so the flashcard changes on screen with zero lag.
    const updatedDeck = deck.map(c => {
      if (c.id === currentCard.id) {
        return {
          ...c,
          confidence: type,
          interval: srs.interval,
          ease_factor: srs.ease_factor,
          next_review_date: srs.next_review_date,
          isMastered
        };
      }
      return c;
    });
    setDeck(updatedDeck);
    
    // Maintain local storage persistence immediately
    localStorage.setItem("learning_dashboard_cards", JSON.stringify(updatedDeck));

    // STEP B: Stage the new SRS metrics directly into memory via stageCardProgress instantly without network lag or timeouts.
    if (userId && activeDeckId) {
      const updatedMetrics = {
        boxNumber: srs.boxNumber,
        interval: srs.interval,
        easeFactor: srs.ease_factor,
        isMastered: isMastered,
        next_review_date: srs.next_review_date,
        confidence: type
      };

      stageCardProgress(activeDeckId, currentCard.id, updatedMetrics);
    }

    setIsFlipped(false);
    setShowHint(false);

    // Queue shifting logic entirely local - executed synchronously to comply with zero timeout rule
    setSessionQueue(prev => {
      if (prev.length === 0) return prev;
      const currentId = prev[0];
      const remaining = prev.slice(1);
      if (type !== "hard") { // Mastered or Recalled
        return remaining;
      } else { // Missed (Loop back to end)
        return [...remaining, currentId];
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className={`${stylesObj.panelBg} p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3`}>
        <span className={`text-sm font-semibold ${stylesObj.textHeading} font-sans block`}>
          {sessionQueue.length > 0 ? `Card ${(activeCardIndex >= 0 ? activeCardIndex : 0) + 1} of ${deck.length}` : "Deck Review session"}
        </span>
        
        <div className={`w-48 ${isDark ? "bg-slate-800" : "bg-slate-200"} rounded-full h-2 overflow-hidden shadow-inner`}>
          <div 
            className="bg-indigo-600 dark:bg-indigo-505 h-full transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
            style={{ width: `${deck.length > 0 ? Math.round((Math.max(0, deck.length - sessionQueue.length) / deck.length) * 100) : 0}%` }}
          />
        </div>
        
        <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full ${stylesObj.badgeActive}`}>
          {deck.length > 0 ? Math.round((Math.max(0, deck.length - sessionQueue.length) / deck.length) * 100) : 0}% Mastered ({sessionQueue.length} remaining)
        </span>
      </div>

      {deck.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-12 text-center space-y-4">
          <HelpCircle className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-200">No Flashcards Generated Yet</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Configure your setup by adding manual definitions or using AI.
          </p>
          <button
            onClick={onOpenSetup}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all cursor-pointer shadow-md inline-flex items-center gap-2"
          >
            Configure Deck <Plus className="w-4 h-4" />
          </button>
        </div>
      ) : sessionQueue.length === 0 ? (
        <div className="bg-slate-900/40 border-2 border-dashed border-indigo-500/20 rounded-3xl p-12 text-center space-y-5 shadow-xl animate-fade-in my-4">
          <Award className="w-16 h-16 text-indigo-400 mx-auto animate-pulse" />
          <div>
            <h3 className="text-xl font-bold text-slate-100 font-sans">Study Session Complete! 🎉</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              Amazing job! You have fully graduated all flashcards in this deck. 
              Any cards evaluated as <span className="text-rose-455 font-bold text-rose-400">"Missed"</span> were repeated continuously until you mastered them!
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3 flex-wrap">
            <button
              onClick={() => setSessionQueue(deck.map(c => c.id))}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md inline-flex items-center gap-2 border-2 border-indigo-700 hover:border-indigo-400"
            >
              <RotateCw className="w-4 h-4" /> Review Session
            </button>
            <button
              onClick={exportDeckToPDF}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-emerald-500/20 border border-emerald-400/30 inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Export Deck PDF
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="perspective-1000 w-full min-h-[340px]">
             <div 
               onClick={() => setIsFlipped(!isFlipped)}
               className={`relative w-full min-h-[340px] preserve-3d transition-transform duration-300 cursor-pointer rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-slate-900/60 ${
                 isFlipped ? "rotate-y-180" : ""
               }`}
             >
               <div className={`absolute inset-0 w-full h-full bg-gradient-to-br ${stylesObj.cardFront} p-8 rounded-3xl backface-hidden flex flex-col justify-between border transition-all duration-300`}>
                 <div className="flex justify-between items-center text-slate-400 text-xs">
                   <span className={`font-mono uppercase tracking-widest font-semibold flex items-center gap-1.5 px-3 py-1 rounded-full ${stylesObj.badgeActive}`}>
                     <RotateCw className="w-3.5 h-3.5 animate-spin-slow" /> Front • Term
                   </span>
                   <span className={`${isDark ? "bg-slate-800/60 text-slate-400" : "bg-slate-200/70 text-slate-600"} px-3 py-1 rounded-full font-semibold`}>Reveal Card</span>
                 </div>
                 <div className="text-center my-auto px-4 py-8">
                   <div className="flex items-center justify-center gap-2">
                     <h2 className={`text-3xl sm:text-4xl font-extrabold ${isDark ? "text-white" : "text-indigo-950"} tracking-tight leading-tight select-none`}>
                       {currentCard?.term}
                     </h2>
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         const utterance = new SpeechSynthesisUtterance(currentCard?.term);
                         window.speechSynthesis.speak(utterance);
                       }}
                       className={`p-2 rounded-full transition-colors ${isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-200 text-slate-500"}`}
                       aria-label="Speak term"
                     >
                       <Volume2 className="w-6 h-6" />
                     </button>
                   </div>
                 </div>
                 <div className="text-xs text-center text-slate-500 flex items-center justify-center gap-1 font-mono select-none">
                   <GraduationCap className="w-4 h-4 text-slate-400" /> Confidence rating buttons below calculate memory intervals
                 </div>
               </div>

               <div className={`absolute inset-0 w-full h-full bg-gradient-to-br ${stylesObj.cardBack} p-8 rounded-3xl backface-hidden rotate-y-180 flex flex-col justify-between border transition-all duration-300`}>
                 <div className="flex justify-between items-center text-slate-400 text-xs">
                   <span className={`font-mono uppercase tracking-widest font-semibold flex items-center gap-1.5 px-3 py-1 rounded-full animate-pulse ${stylesObj.badgeGreen}`}>
                     <CheckCircle2 className="w-3.5 h-3.5" /> Back • Definition
                   </span>
                   <span className={`${isDark ? "bg-slate-800/60 text-slate-400" : "bg-slate-200/70 text-slate-600"} px-3 py-1 rounded-full font-semibold`}>Reveal Card</span>
                 </div>
                 <div className="text-center my-auto px-4 py-6">
                   <p className={`text-lg sm:text-xl ${isDark ? "text-slate-100" : "text-slate-800"} font-medium leading-relaxed tracking-normal max-w-md mx-auto select-none`}>
                     {currentCard?.definition}
                   </p>
                 </div>
                 <div className="text-xs text-center text-slate-400 font-mono select-none">
                   Flip back to see keyword references
                 </div>
               </div>
            </div>
          </div>

          <div className={`p-4 border rounded-2xl transition-all duration-300 ${stylesObj.panelBg}`}>
             <button
               onClick={() => setShowHint(!showHint)}
               className="w-full flex items-center justify-between text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-semibold text-sm transition-all focus:outline-none cursor-pointer"
             >
               <span className="flex items-center gap-1.5">
                 <HelpCircle className="w-4 h-4" />
                 {showHint ? "Hide Context / Study Hint" : "Reveal Context / Study Hint"}
               </span>
               <span className={`text-xs px-2 py-0.5 rounded font-mono ${isDark ? "bg-slate-800/50 border border-slate-700/20 text-indigo-300" : "bg-slate-100 border border-slate-200 text-indigo-700"}`}>
                 {showHint ? "[-]" : "[+]"}
               </span>
             </button>
             {showHint && (
               <div className={`mt-3 text-sm px-1 pt-1 border-t ${stylesObj.border} leading-relaxed font-mono ${stylesObj.textMuted}`}>
                 {currentCard?.hint || "No secondary hints logged for this term."}
               </div>
             )}
          </div>

          <div className="bg-slate-900/20 p-5 rounded-2xl border border-slate-900 space-y-4">
            <span className={`block text-xs font-semibold text-center uppercase tracking-wider font-mono ${isDark ? "text-slate-300" : "text-slate-800"}`}>
              Evaluate active recall accuracy:
            </span>
            <div className="grid grid-cols-3 gap-3">
               <button
                 onClick={() => handleReview("hard")}
                 className={`py-3.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex flex-col items-center gap-1 shadow-md
                   ${isDark
                     ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-100 border-2 border-rose-500/40 hover:border-rose-500/80 shadow-rose-950/20"
                     : "bg-rose-100 hover:bg-rose-200 text-rose-950 hover:text-rose-900 border-2 border-rose-400 hover:border-rose-500"
                   }
                 `}
               >
                 <RotateCw className={`w-5 h-5 ${isDark ? "text-rose-400" : "text-rose-700"}`} />
                 Missed
               </button>

               <button
                 onClick={() => handleReview("good")}
                 className={`py-3.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex flex-col items-center gap-1 shadow-md
                   ${isDark
                     ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-100 border-2 border-amber-500/40 hover:border-amber-500/80 shadow-amber-950/20"
                     : "bg-amber-100 hover:bg-amber-200 text-amber-950 hover:text-amber-900 border-2 border-amber-400 hover:border-amber-500"
                   }
                 `}
               >
                 <CheckCircle2 className={`w-5 h-5 ${isDark ? "text-amber-400" : "text-amber-700"}`} />
                 Recalled
               </button>

               <button
                 onClick={() => handleReview("easy")}
                 className={`py-3.5 rounded-xl text-sm font-semibold transition-all cursor-pointer flex flex-col items-center gap-1 shadow-md
                   ${isDark
                     ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-100 border-2 border-emerald-500/40 hover:border-emerald-500/80 shadow-emerald-950/20"
                     : "bg-emerald-100 hover:bg-emerald-200 text-emerald-950 hover:text-emerald-900 border-2 border-emerald-400 hover:border-emerald-500"
                   }
                 `}
               >
                 <CheckCircle2 className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-700"}`} />
                 Mastered
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
