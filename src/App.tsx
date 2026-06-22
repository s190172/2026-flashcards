/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  RotateCw, 
  GraduationCap, 
  Dices, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  Flame, 
  Timer, 
  Plus, 
  Trash2, 
  Clipboard, 
  Eye, 
  EyeOff,
  HelpCircle,
  FileText,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Award,
  Search,
  Download,
  Upload,
  Palette,
  Save,
  Database,
  RotateCcw,
  Sliders,
  Volume2,
  GripVertical,
  CloudLightning,
  ExternalLink
} from "lucide-react";
import { 
  DndContext, 
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { jsPDF } from "jspdf";

// Firebase imports
import { auth, db } from "./config/firebaseConfig";
import { flushSessionBufferToCloud, initializeLifecycleGuard } from "./services/srsSyncEngine";
import { useDebouncedSave } from "./features/study-tracking/useDebouncedSave";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  linkWithPopup,
  linkWithRedirect,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential
} from "firebase/auth";
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, query, where, getDoc, writeBatch, updateDoc } from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Generate lowercase search prefixes for term search indexing
const generateSearchKeywords = (term: string): string[] => {
  if (!term) return [];
  const clean = term.trim().toLowerCase();
  const result: string[] = [];
  for (let i = 1; i <= clean.length; i++) {
    result.push(clean.substring(0, i));
  }
  return result;
};

interface Flashcard {
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

interface ExamQuestion {
  id: string;
  type: "multiple-choice-term" | "multiple-choice-def" | "true-false" | "fill-blank";
  prompt: string;
  correctAnswer: string;
  choices?: string[];
  pairingTerm?: string; // used for true-false visual reference
  pairingDef?: string; // used for true-false visual reference
}

interface MatchTile {
  id: string; // unique tile ID: "term-{cardId}" or "def-{cardId}"
  cardId: string;
  type: "term" | "def";
  text: string;
}

const DEFAULT_CARDS: Flashcard[] = [
  {
    id: "vite-card",
    term: "Vite",
    definition: "A blazing-fast frontend build tool that leverages native ES modules.",
    hint: "Features instant Hot Module Replacement and is French for 'fast'."
  },
  {
    id: "react-card",
    term: "React",
    definition: "A declarative, component-based user interface library created by Meta.",
    hint: "Relies on a Virtual DOM structure and component lifecycle principles."
  },
  {
    id: "ts-card",
    term: "TypeScript",
    definition: "A strongly typed superset of JavaScript that compiles to plain JavaScript.",
    hint: "Developed and maintained by Microsoft, adding compile-time static types."
  },
  {
    id: "tailwind-card",
    term: "Tailwind CSS",
    definition: "A engine utility-first styling framework design with immediate CSS classes.",
    hint: "Emphasizes responsive utilities without leaving your HTML layout structures."
  },
  {
    id: "srs-card",
    term: "Anki SRS",
    definition: "An active-recall spaced repetition flashcard system optimized for retention.",
    hint: "Spaced repetition scheduler based on Anki's custom confidence ratings."
  },
  {
    id: "closure-card",
    term: "Closure",
    definition: "A function bundled together with references to its lexically surrounding state.",
    hint: "Enables inner functions to remember scope boundaries where they were born."
  }
];


import { SortableFlashcardItem } from "./features/deck-inventory/SortableFlashcardItem";
import { FlashcardStudyView } from "./components/FlashcardStudyView";
import { DatabaseStatusTester } from "./components/DatabaseStatusTester";
import { SearchBarView } from "./features/shared-search/SearchBarView";
import { dbEngine } from "./services/dbProvider";
export default function App() {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setCards((items) => {
        const oldIndex = items.findIndex(c => c.id === active.id);
        const newIndex = items.findIndex(c => c.id === over.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  // Theme Configuration (Light vs Dark with high contrast support)
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("theme") as "light" | "dark") || "dark";
  });

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      return next;
    });
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  }, [theme]);

  const isDark = theme === "dark";

  // Light Mode variations state
  const [lightVariation, setLightVariation] = useState<"slate" | "sepia" | "mint" | "lavender" | "contrast">(() => {
    return (localStorage.getItem("active_light_variation") as any) || "slate";
  });

  // Local backups / Snapshot slot states
  const [snapshotSlot1, setSnapshotSlot1] = useState<string | null>(() => localStorage.getItem("backup_slot_1"));
  const [snapshotSlot2, setSnapshotSlot2] = useState<string | null>(() => localStorage.getItem("backup_slot_2"));
  const [snapshotSlot3, setSnapshotSlot3] = useState<string | null>(() => localStorage.getItem("backup_slot_3"));

  // Iframe-safe Custom Toast notifications state
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'info' | 'error' }>>([]);
  const showToast = React.useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Iframe-safe custom confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    type: 'primary' | 'danger';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    type: "primary",
    onConfirm: () => {}
  });

  const triggerConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    type: 'primary' | 'danger' = 'primary',
    confirmText: string = 'Confirm'
  ) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText,
      type,
      onConfirm
    });
  };

  // 1. Export JSON backup helper
  const handleExportJSONBackup = () => {
    try {
      const backupData = {
        appSign: "architect_lrn_backup",
        version: "4.1.0",
        timestamp: new Date().toISOString(),
        cards,
        bestMatchTime,
        theme,
        lightVariation
      };
      
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `architect_deck_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("JSON file backup downloaded successfully!", "success");
    } catch (err) {
      console.error("Failed to export backup: ", err);
      showToast("Error exporting JSON backup: " + (err instanceof Error ? err.message : String(err)), "error");
    }
  };

  // 2. Import JSON backup helper
  const handleImportJSONBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const rawText = event.target?.result as string;
        const parsed = JSON.parse(rawText);
        
        // Validation checks
        if (!parsed || !Array.isArray(parsed.cards)) {
          showToast("Invalid backup file: missing flashcards list.", "error");
          return;
        }

        triggerConfirm(
          "Import JSON Backup",
          `Restore backup with ${parsed.cards.length} cards? This will replace your current active study deck entirely.`,
          async () => {
            await restoreDeckSource(parsed.cards);
            
            if (parsed.bestMatchTime !== undefined) {
              setBestMatchTime(parsed.bestMatchTime);
              localStorage.setItem("learning_dashboard_best_match", parsed.bestMatchTime.toString());
            }
            if (parsed.lightVariation !== undefined) {
              setLightVariation(parsed.lightVariation);
              localStorage.setItem("active_light_variation", parsed.lightVariation);
            }
            if (parsed.theme !== undefined) {
              setTheme(parsed.theme);
              localStorage.setItem("theme", parsed.theme);
            }

            showToast("Backup successfully imported and restored!", "success");
          },
          "primary",
          "Restore Deck"
        );
      } catch (err) {
        console.error("Failed to import backup: ", err);
        showToast("Error parsing backup file: " + (err instanceof Error ? err.message : String(err)), "error");
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = "";
  };

  // Helper to load snapshot state easily
  const restoreDeckSource = async (restoredCards: Flashcard[]) => {
    if (restoredCards.length === 0) return;
    setCards(restoredCards);
    setCurrentIdx(0);
    // Sync to Cloud Firestore if logged in
    if (user) {
      try {
        setSyncingStatus("syncing");
        const q = query(collection(db, "cards"), where("authorId", "==", user.uid));
        const snapshot = await getDocs(q);
        
        // Chunk deletions into batches of 400 (Firestore maximum is 500 per batch)
        const docSnaps = snapshot.docs;
        const chunkSize = 400;
        for (let i = 0; i < docSnaps.length; i += chunkSize) {
          const chunk = docSnaps.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          for (const docSnap of chunk) {
            batch.delete(docSnap.ref);
          }
          await batch.commit();
        }
        
        await dbAddMultipleCards(restoredCards, user.uid);
        setSyncingStatus("synced");
      } catch (err) {
        console.error("Firebase bulk restore fail: ", err);
        setSyncingStatus("error");
      }
    }
  };

  // 3. Save snapshot to specific local slot
  const handleSaveSnapshotSlot = (slotNum: 1 | 2 | 3) => {
    const totalCount = cards.length;
    const timeStr = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const dateStr = new Date().toLocaleDateString();
    
    // Auto design name: Deck with term count and clear timestamp, no blocking window prompt!
    const designedName = `Study Deck (${totalCount} cards) • ${timeStr}`;

    const snapshotPayload = {
      name: designedName,
      date: dateStr + " " + timeStr,
      cards,
      bestMatchTime
    };

    const str = JSON.stringify(snapshotPayload);
    localStorage.setItem(`backup_slot_${slotNum}`, str);
    
    // Beautiful feedback indicators
    showToast(`Snapshot Slot ${slotNum === 1 ? 'A' : slotNum === 2 ? 'B' : 'C'} saved!`, "success");
    setSaveStatus(`Saved slot ${slotNum}!`);
    setTimeout(() => setSaveStatus(null), 2500);

    if (slotNum === 1) setSnapshotSlot1(str);
    if (slotNum === 2) setSnapshotSlot2(str);
    if (slotNum === 3) setSnapshotSlot3(str);
  };

  // 4. Restore snapshot from specific local slot
  const handleRestoreSnapshotSlot = async (slotNum: 1 | 2 | 3) => {
    const rawStr = localStorage.getItem(`backup_slot_${slotNum}`);
    if (!rawStr) return;

    try {
      const parsed = JSON.parse(rawStr);
      if (!parsed || !Array.isArray(parsed.cards)) {
        showToast("Snapshot data is corrupt or invalid.", "error");
        return;
      }

      triggerConfirm(
        "Restore Snapshot",
        `Do you want to restore snapshot "${parsed.name}"? This replaces your currently active learning cards setup immediately.`,
        async () => {
          await restoreDeckSource(parsed.cards);
          
          if (parsed.bestMatchTime !== undefined) {
            setBestMatchTime(parsed.bestMatchTime);
            localStorage.setItem("learning_dashboard_best_match", parsed.bestMatchTime.toString());
          }
          showToast(`Snapshot loaded: ${parsed.cards.length} cards restored!`, "success");
        },
        "primary",
        "Load Snapshot"
      );
    } catch (err) {
      console.error(err);
      showToast("Failed to restore snapshot.", "error");
    }
  };

  // 5. Clear specific local slot
  const handleClearSnapshotSlot = (slotNum: 1 | 2 | 3) => {
    triggerConfirm(
      "Delete Snapshot Slot",
      `Are you sure you want to permanently delete snapshot slot ${slotNum === 1 ? 'A' : slotNum === 2 ? 'B' : 'C'}? This is irreversible.`,
      () => {
        localStorage.removeItem(`backup_slot_${slotNum}`);
        if (slotNum === 1) setSnapshotSlot1(null);
        if (slotNum === 2) setSnapshotSlot2(null);
        if (slotNum === 3) setSnapshotSlot3(null);
        showToast("Snapshot slot cleared.", "info");
      },
      "danger",
      "Delete permanently"
    );
  };

  // Navigation
  const [activeTab, setActiveTab] = useState<"flashcards" | "exam" | "match" | "setup" | "debug" | "search">("flashcards");

  // Core Cards State
  const [cards, setCards] = useState<Flashcard[]>(() => {
    const stored = localStorage.getItem("ARCHITECT_LRN_STATE");
    if (stored) {
      try {
        return JSON.parse(stored).cards || DEFAULT_CARDS;
      } catch (e) {
        return DEFAULT_CARDS;
      }
    }
    return DEFAULT_CARDS;
  });


  // Study statistics
  const [studiedCount, setStudiedCount] = useState<number>(() => {
    const stored = localStorage.getItem("ARCHITECT_LRN_STATE");
    if (stored) {
        try { return JSON.parse(stored).stats.studiedCount || 0; } catch (e) { return 0; }
    }
    return 0;
  });

  // Carousel controls
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Manual Deck Management Form
  const [newTerm, setNewTerm] = useState("");
  const [newDefinition, setNewDefinition] = useState("");
  const [newHint, setNewHint] = useState("");
  const [deckTitle, setDeckTitle] = useState("");
  const [activeDeckId, setActiveDeckId] = useState<string>("active_default_deck");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const [deckSearchQuery, setDeckSearchQuery] = useState("");

  // Raw notes text area & parsing
  const [rawNotes, setRawNotes] = useState("");
  const [parseLogs, setParseLogs] = useState<string | null>(null);
  const [importSubTab, setImportSubTab] = useState<"text" | "file">("text");

  // Gemini state parameters
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return sessionStorage.getItem("gemini_app_key") || "";
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [geminiStatus, setGeminiStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; msg: string }>({
    type: "idle",
    msg: ""
  });

  // Dynamic high-contrast responsive styles
  const stylesObj = isDark 
    ? {
        rootBg: "bg-[#060a13] text-slate-100",
        panelBg: "bg-slate-900/90 border-slate-705/80 backdrop-blur-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)]",
        cardPanelBg: "bg-[#0d1323] border-slate-800",
        subPanelBg: "bg-[#090e1b]",
        inputBg: "bg-slate-950 border-slate-850 text-slate-100 placeholder:text-slate-700 focus:border-indigo-400",
        border: "border-slate-800",
        borderAccent: "border-slate-750",
        textMuted: "text-slate-400",
        textLight: "text-slate-300",
        textHeading: "text-slate-50",
        cardFront: "from-slate-950 to-slate-900 border-slate-800 text-slate-50 hover:border-indigo-500/40",
        cardBack: "from-slate-950 to-[#0c1222] border-indigo-950 text-slate-50 hover:border-indigo-500/40",
        badgeActive: "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30",
        badgeGreen: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
      }
    : lightVariation === "sepia"
    ? {
        rootBg: "bg-[#fcf8f2] text-[#433422]",
        panelBg: "bg-[#f5ece2] border-[#e1d0bd] shadow-[0_4px_15px_rgba(67,52,34,0.06)]",
        cardPanelBg: "bg-[#faf6ee] border-[#ecdccb] shadow-sm",
        subPanelBg: "bg-[#efe5d6]",
        inputBg: "bg-[#fcfcf9] border-[#decab1] text-[#433422] placeholder:text-[#a59179] focus:border-[#a2825c]",
        border: "border-[#e0ceb9]",
        borderAccent: "border-[#dec8af]",
        textMuted: "text-[#87725b]",
        textLight: "text-[#62513f]",
        textHeading: "text-[#3b2a1a] font-bold",
        cardFront: "from-[#fcfcf9] to-[#f6ede2] border-[#dfcdba] text-[#433422] hover:border-[#a2825c]",
        cardBack: "from-[#faf6ee] to-[#ede2d2] border-[#decab1] text-[#433422] hover:border-[#a2825c]",
        badgeActive: "bg-[#a2825c]/15 text-[#8c6b45] border border-[#a2825c]/35",
        badgeGreen: "bg-emerald-50 text-emerald-700 border border-emerald-250"
      }
    : lightVariation === "mint"
    ? {
        rootBg: "bg-[#f2faf6] text-[#0f3525]",
        panelBg: "bg-[#e5f7ed] border-[#cbeddb] shadow-[0_4px_15px_rgba(15,48,36,0.05)]",
        cardPanelBg: "bg-[#f5fdfa] border-[#d2f3e4] shadow-sm",
        subPanelBg: "bg-[#d5f3e4]",
        inputBg: "bg-[#f8fdfb] border-[#c0ebd5] text-[#0f3525] placeholder:text-emerald-800/40 focus:border-emerald-500",
        border: "border-[#caeedc]",
        borderAccent: "border-[#b8ebd1]",
        textMuted: "text-[#3a6856]",
        textLight: "text-[#1d4f3e]",
        textHeading: "text-[#062418] font-bold",
        cardFront: "from-[#fafdff] to-[#e4f7ee] border-[#c1ebd5] text-[#0f3525] hover:border-emerald-500",
        cardBack: "from-[#fbfefd] to-[#d4f3e4] border-[#bae4cf] text-[#0f3525] hover:border-emerald-500",
        badgeActive: "bg-emerald-600/15 text-emerald-750 border border-emerald-500/30",
        badgeGreen: "bg-emerald-600/15 text-emerald-750 border border-emerald-500/30"
      }
    : lightVariation === "lavender"
    ? {
        rootBg: "bg-[#faf9fc] text-[#2c1a4e]",
        panelBg: "bg-[#f3f0f8] border-[#e4dcfa] shadow-[0_4px_15px_rgba(44,27,78,0.05)]",
        cardPanelBg: "bg-[#fcfafd] border-[#ebeef6] shadow-sm",
        subPanelBg: "bg-[#e9e3f4]",
        inputBg: "bg-[#fcfdfd] border-[#dad0ec] text-[#2c1a4e] placeholder:text-indigo-800/40 focus:border-indigo-400",
        border: "border-[#e3dcf0]",
        borderAccent: "border-[#dccded]",
        textMuted: "text-[#5e4b85]",
        textLight: "text-[#433169]",
        textHeading: "text-[#22123f] font-bold",
        cardFront: "from-[#fefdfe] to-[#eae5f6] border-[#dfd2f3] text-[#2c1a4e] hover:border-indigo-450",
        cardBack: "from-[#fcfafd] to-[#e2dbf1] border-[#dad1ec] text-[#2c1a4e] hover:border-indigo-440",
        badgeActive: "bg-indigo-600/10 text-indigo-700 border border-indigo-400/35",
        badgeGreen: "bg-emerald-50 text-emerald-700 border border-emerald-250"
      }
    : lightVariation === "contrast"
    ? {
        rootBg: "bg-[#ffffff] text-[#000000]",
        panelBg: "bg-[#ffffff] border-2 border-[#000000] shadow-[4px_4px_0px_#000000]",
        cardPanelBg: "bg-[#ffffff] border-2 border-[#000000]",
        subPanelBg: "bg-[#f5f5f5]",
        inputBg: "bg-[#ffffff] border-2 border-[#000000] text-[#000000] placeholder:text-[#666666] focus:border-[#000000]",
        border: "border-[#000000]",
        borderAccent: "border-[#000000]",
        textMuted: "text-slate-800 font-bold",
        textLight: "text-slate-900",
        textHeading: "text-black font-black",
        cardFront: "from-[#ffffff] to-[#ffffff] border-2 border-[#000000] text-black shadow-none hover:bg-neutral-50",
        cardBack: "from-[#ffffff] to-[#ffffff] border-2 border-[#000000] text-black shadow-none hover:bg-neutral-50",
        badgeActive: "bg-black text-white border-2 border-black font-semibold",
        badgeGreen: "bg-black text-white border-2 border-black font-semibold"
      }
    : {
        rootBg: "bg-slate-50 text-slate-900",
        panelBg: "bg-white border-slate-400 shadow-[0_2px_12px_rgba(0,0,0,0.1)]",
        cardPanelBg: "bg-white border-slate-400 shadow-sm",
        subPanelBg: "bg-slate-100",
        inputBg: "bg-white border-slate-500 text-slate-950 placeholder:text-slate-600 focus:border-indigo-700",
        border: "border-slate-400",
        borderAccent: "border-slate-500",
        textMuted: "text-slate-800",
        textLight: "text-slate-950",
        textHeading: "text-slate-950 font-bold",
        cardFront: "from-white to-slate-100 border-slate-400 text-slate-950 shadow-md hover:border-indigo-500",
        cardBack: "from-white to-slate-200 border-indigo-500 text-slate-950 shadow-md hover:border-indigo-600",
        badgeActive: "bg-indigo-100 text-indigo-950 border border-indigo-400",
        badgeGreen: "bg-emerald-100 text-emerald-950 border border-emerald-400"
      };

  // Exam Center parameters
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [examGraded, setExamGraded] = useState(false);
  const [examScore, setExamScore] = useState<number | null>(null);

  // Timed Match Game parameters
  const [matchTiles, setMatchTiles] = useState<MatchTile[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [matchedCardIds, setMatchedCardIds] = useState<Set<string>>(new Set());
  const [mismatchedTileIds, setMismatchedTileIds] = useState<Set<string>>(new Set());
  const [bestMatchTime, setBestMatchTime] = useState<number>(() => {
    const stored = localStorage.getItem("ARCHITECT_LRN_STATE");
    if (stored) {
        try { return JSON.parse(stored).stats.bestMatchTime || 0; } catch (e) { return 0; }
    }
    return 0;
  });
  
  // Stopwatch parameters
  const [matchElapsedTime, setMatchElapsedTime] = useState(0);
  const [matchRunning, setMatchRunning] = useState(false);
  const stopwatchRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Firebase Auth and real-time database synchronizer states
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncingStatus, setSyncingStatus] = useState<"offline" | "syncing" | "synced" | "error">("offline");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Auto-sync cards and user stats
  useEffect(() => {
    if (!user) return;
    
    // Clear existing
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    setSyncingStatus("syncing");
    
    saveTimeoutRef.current = setTimeout(async () => {
       try {
         // Batch sync ALL cards
         await dbAddMultipleCards(cards, user.uid);
         
         // Update user daily study session stats
         await setDoc(doc(db, "users", user.uid), { 
             lastActive: new Date().toISOString(),
             cardCount: cards.length
         }, { merge: true });
         
         setSyncingStatus("synced");
       } catch (e) {
         console.error("Auto-save failed", e);
         setSyncingStatus("error");
       }
    }, 5000);
    
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [cards, user]);

  // NATIVE VISIBILITY LIFECYCLE BINDING
  useEffect(() => {
    initializeLifecycleGuard();
  }, []);

  // Email login / register states
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailFormMode, setEmailFormMode] = useState<"login" | "signup">("login");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const isFetchingRef = useRef(false);

  // Helper: Secure individual card saver
  const dbAddCard = async (card: Flashcard, currentUid?: string) => {
    const activeUid = currentUid || user?.uid;
    if (!activeUid) return;
    try {
      const docRef = doc(db, "cards", card.id);
      const payload: any = {
        id: card.id,
        userId: activeUid,
        authorId: activeUid,
        term: card.term,
        definition: card.definition,
        hint: card.hint || "",
        confidence: card.confidence || "",
        searchKeywords: generateSearchKeywords(card.term)
      };
      if (card.interval !== undefined) payload.interval = card.interval;
      if (card.ease_factor !== undefined) payload.ease_factor = card.ease_factor;
      if (card.next_review_date !== undefined) payload.next_review_date = card.next_review_date;
      
      await setDoc(docRef, payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `cards/${card.id}`);
    }
  };

  // Helper: Secure single card deleter
  const dbDeleteCard = async (cardId: string) => {
    if (!user) return;
    try {
      const docRef = doc(db, "cards", cardId);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `cards/${cardId}`);
    }
  };

  // Helper: Secure multiple cards multi-saver
  const dbAddMultipleCards = async (newCards: Flashcard[], currentUid?: string) => {
    const activeUid = currentUid || user?.uid;
    if (!activeUid) return;
    try {
      // Chunk into batches of 400 (Firestore maximum is 500 per batch)
      const chunkSize = 400;
      for (let i = 0; i < newCards.length; i += chunkSize) {
        const chunk = newCards.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const card of chunk) {
          const docRef = doc(db, "cards", card.id);
          const payload: any = {
            id: card.id,
            userId: activeUid,
            authorId: activeUid,
            term: card.term,
            definition: card.definition,
            hint: card.hint || "",
            confidence: card.confidence || "",
            searchKeywords: generateSearchKeywords(card.term)
          };
          if (card.interval !== undefined) payload.interval = card.interval;
          if (card.ease_factor !== undefined) payload.ease_factor = card.ease_factor;
          if (card.next_review_date !== undefined) payload.next_review_date = card.next_review_date;
          batch.set(docRef, payload);
        }
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "cards-bulk");
    }
  };

  // Helper: Secure user-level stat metrics saver
  const dbSaveStats = async (newCount: number, newTime: number, currentUid?: string) => {
    const activeUid = currentUid || user?.uid;
    if (!activeUid) return;
    try {
      const docRef = doc(db, "users", activeUid, "stats", "dashboard");
      await setDoc(docRef, {
        userId: activeUid,
        studiedCount: newCount,
        bestMatchTime: newTime
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${activeUid}/stats/dashboard`);
    }
  };

  // Google sign in popup
  const handleGoogleSignIn = async (forceDirect = false) => {
    const provider = new GoogleAuthProvider();
    setSyncingStatus("syncing");
    setSyncError(null);
    try {
      // Trigger the auth popups directly and synchronously inside this user-initiated microtask
      if (user && user.isAnonymous && !forceDirect) {
        try {
          await linkWithPopup(user, provider);
          showToast("Successfully linked your guest session to Google!", "success");
        } catch (linkErr: any) {
          if (linkErr.code === "auth/credential-already-in-use" || linkErr.code === "auth/email-already-in-use" || String(linkErr).includes("already")) {
            showToast("Google account already has a saved deck. Logging in directly...", "info");
            // Retrieve the credentials from the first popup to bypass opening a second popup
            const credential = GoogleAuthProvider.credentialFromError(linkErr) || linkErr.credential;
            if (credential) {
              await signInWithCredential(auth, credential);
              showToast("Logged in with Google!", "success");
            } else {
              await signInWithPopup(auth, provider);
              showToast("Logged in with Google!", "success");
            }
          } else {
            throw linkErr;
          }
        }
      } else {
        await signInWithPopup(auth, provider);
        showToast("Logged in with Google!", "success");
      }
      setSyncingStatus("synced");
    } catch (err: any) {
      console.error("Sign in failed: ", err);
      const isPopupBlocked = err.code === "auth/popup-blocked" || 
                             String(err).includes("popup-blocked") || 
                             String(err).includes("blocked");
      if (isPopupBlocked) {
        console.warn("Google popup blocked by browser settings.");
        setSyncingStatus("error");
        setSyncError("Popup Blocked: Go to your browser search/address bar, click the blocked popup icon, and select 'Always allow popups'. Or, link instantly using Email & Password below!");
        showToast("Popup blocked! Please allow popups in your browser bar.", "error");
        return;
      }
      setSyncingStatus("error");
      setSyncError(err.message || String(err));
      showToast(err.message || String(err), "error");
    }
  };

  // Minimalist One-click guest fallback
  const handleAnonymousSignIn = async () => {
    setSyncingStatus("syncing");
    setSyncError(null);
    try {
      await signInAnonymously(auth);
      setSyncingStatus("synced");
      showToast("Signed in as Guest. Sync is dynamic and live!", "success");
    } catch (err: any) {
      console.error("Guest login failed: ", err);
      setSyncingStatus("error");
      setSyncError(err.message || String(err));
    }
  };

  // Sign out
  const handleSignOut = async () => {
    setSyncingStatus("syncing");
    try {
      await signOut(auth);
      setCards(DEFAULT_CARDS);
      setStudiedCount(0);
      setBestMatchTime(0);
      setSyncingStatus("offline");
    } catch (err: any) {
      console.error("Sign out failed: ", err);
      setSyncingStatus("error");
      setSyncError(err.message || String(err));
    }
  };

  // Email and Password Sign In or Create Account
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) {
      showToast("Email and password are required.", "error");
      return;
    }
    setSyncingStatus("syncing");
    setSyncError(null);
    try {
      if (emailFormMode === "login") {
        await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
        showToast("Logged in successfully!", "success");
      } else {
        const { authService } = await import("./services/authService");
        if (user && user.isAnonymous) {
          try {
            await authService.upgradeGuestToEmailPassword(emailInput.trim(), passwordInput);
            showToast("Account created and securely linked to current session!", "success");
          } catch (linkErr: any) {
            if (linkErr.code === "auth/email-already-in-use" || linkErr.code === "auth/credential-already-in-use" || String(linkErr).includes("already")) {
              showToast("Email already exists. Logging in with existing credentials...", "info");
              await signInWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
              showToast("Logged in successfully!", "success");
            } else {
              throw linkErr;
            }
          }
        } else {
          await createUserWithEmailAndPassword(auth, emailInput.trim(), passwordInput);
          showToast("Account created successfully!", "success");
        }
      }
      setEmailInput("");
      setPasswordInput("");
      setShowEmailForm(false);
      setSyncingStatus("synced");
    } catch (err: any) {
      console.error("Email authentication failed: ", err);
      setSyncingStatus("error");
      setSyncError(err.message || String(err));
      showToast(err.message || String(err), "error");
    }
  };

  // Push Finalized Deck to Cloud Sync (Batched write)
  const pushDeckToCloudSync = async () => {
    if (!user) {
      showToast("Please sign in first to push your deck to the cloud.", "error");
      return;
    }
    setSyncingStatus("syncing");
    try {
      // 1. Fetch current cloud cards to delete them and overwrite with local deck state
      const q = query(collection(db, "cards"), where("authorId", "==", user.uid));
      const snapshot = await getDocs(q).catch(err => {
        handleFirestoreError(err, OperationType.GET, "cards");
      });
      
      const docSnaps = snapshot ? snapshot.docs : [];
      
      // Delete existing cards in batches of 400
      const chunkSize = 400;
      for (let i = 0; i < docSnaps.length; i += chunkSize) {
        const chunk = docSnaps.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const docSnap of chunk) {
          batch.delete(docSnap.ref);
        }
        await batch.commit();
      }
      
      // 2. Batched write the local array of finalized cards with searchKeywords
      for (let i = 0; i < cards.length; i += chunkSize) {
        const chunk = cards.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const card of chunk) {
          const docRef = doc(db, "cards", card.id);
          const payload: any = {
            id: card.id,
            authorId: user.uid,
            term: card.term,
            definition: card.definition,
            hint: card.hint || "",
            confidence: card.confidence || "",
            searchKeywords: generateSearchKeywords(card.term)
          };
          if (card.interval !== undefined) payload.interval = card.interval;
          if (card.ease_factor !== undefined) payload.ease_factor = card.ease_factor;
          if (card.next_review_date !== undefined) payload.next_review_date = card.next_review_date;
          batch.set(docRef, payload);
        }
        await batch.commit();
      }

      // 3. Create and save the deck summary payload
      const deckId = user.uid + "_" + Date.now();
      const deckRef = doc(db, "decks", deckId);
      const finalDeckTitle = deckTitle.trim() || (cards.length > 0 ? `${cards[0].term} Deck` : "My Study Deck");
      const deckPayload = {
        id: deckId,
        title: finalDeckTitle,
        description: `A custom study deck containing ${cards.length} cards.`,
        cardCount: cards.length,
        creatorName: user.displayName || user.email || "Unknown Architect",
        searchKeywords: generateSearchKeywords(finalDeckTitle),
        cardIds: cards.map(c => c.id)
      };
      await setDoc(deckRef, deckPayload);
      
      setSyncingStatus("synced");
      showToast("✨ Finalized deck successfully pushed to Cloud Sync!", "success");
    } catch (err: any) {
      console.error("Failed to push deck to cloud sync: ", err);
      setSyncingStatus("error");
      setSyncError(err.message || String(err));
      showToast("Push failed: " + (err.message || String(err)), "error");
    }
  };

  // Unified wrappers for state mutations (Strictly Local-First Drafting config)
  const addCards = (newCards: Flashcard[]) => {
    setCards(prev => [...prev, ...newCards]);
    showToast(`Added ${newCards.length} cards locally. Click 'Push Finalized Deck to Cloud Sync' to save.`, "info");
  };

  const addSingleCard = (card: Flashcard) => {
    setCards(prev => [...prev, card]);
    showToast("Added card locally. Click 'Push Finalized Deck to Cloud Sync' to save.", "info");
  };

  const deleteSingleCard = React.useCallback((cardId: string) => {
    setCards(prevCards => {
      const filtered = prevCards.filter(c => c.id !== cardId);
      setCurrentIdx(prevIdx => prevIdx >= filtered.length ? 0 : prevIdx);
      return filtered;
    });
    showToast("Card deleted locally. Click 'Push Finalized Deck to Cloud Sync' to save.", "info");
  }, [showToast]);

  // Spaced Repetition SM-2 scheduling algorithm helper
  const calculateSRS = (card: Flashcard, rating: "hard" | "good" | "easy") => {
    const currentInterval = card.interval || 0;
    let currentEase = card.ease_factor || 2.5;
    
    let newInterval = 1;
    let newEase = currentEase;

    if (rating === "easy") {
      newEase = Math.min(3.0, currentEase + 0.15);
      if (currentInterval === 0) {
        newInterval = 4; // 4 days for first easy review
      } else {
        newInterval = Math.max(1, Math.round(currentInterval * newEase * 1.2));
      }
    } else if (rating === "good") {
      newEase = currentEase; // stable
      if (currentInterval === 0) {
        newInterval = 1;
      } else if (currentInterval === 1) {
        newInterval = 3; // 3 days
      } else {
        newInterval = Math.max(1, Math.round(currentInterval * newEase));
      }
    } else { // 'hard'
      newEase = Math.max(1.3, currentEase - 0.2);
      newInterval = 1; // back to short-loop review
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + newInterval);

    return {
      interval: newInterval,
      ease_factor: parseFloat(newEase.toFixed(2)),
      next_review_date: nextReview.toISOString()
    };
  };

  const updateCardConfidence = (cardId: string, type: "hard" | "good" | "easy") => {
    const updated = cards.map(c => {
      if (c.id === cardId) {
        const srs = calculateSRS(c, type);
        return { 
          ...c, 
          confidence: type,
          interval: srs.interval,
          ease_factor: srs.ease_factor,
          next_review_date: srs.next_review_date
        };
      }
      return c;
    });
    setCards(updated);
    if (user) {
      const cardToUpdate = updated.find(c => c.id === cardId);
      if (cardToUpdate) {
        dbAddCard(cardToUpdate);
      }
    }
  };

  // Sync effect on Authentication transitions
  useEffect(() => {
    let internalUnsubscribe: () => void;
    (async () => {
      const { authService } = await import("./services/authService");
      
      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult) {
          console.log("Verified auth redirect callback successfully resolved!");
          showToast("Successfully authenticated via Google redirect!", "success");
        }
      } catch (redirectErr: any) {
        console.error("Redirect auth resolution failed:", redirectErr);
        if (redirectErr.code === "auth/credential-already-in-use" || redirectErr.code === "auth/email-already-in-use" || String(redirectErr).includes("already")) {
          showToast("This Google account is already registered! Signed in securely.", "info");
        } else {
          setSyncError(`OAuth Redirect failed: ${redirectErr.message || String(redirectErr)}`);
          showToast(`Redirect Auth Error: ${redirectErr.message || String(redirectErr)}`, "error");
        }
      }
      
      internalUnsubscribe = authService.initAuthSession(async (currentUser) => {
        setUser(currentUser);
        setAuthLoading(false);
        
        if (currentUser) {
          if (isFetchingRef.current) return;
          isFetchingRef.current = true;
          setSyncingStatus("syncing");
          try {
            // Fetch existing cards from Firestore to compare
            const q = query(collection(db, "cards"), where("authorId", "==", currentUser.uid));
            const snapshot = await getDocs(q).catch(err => {
              handleFirestoreError(err, OperationType.GET, "cards");
            });
          
          let cloudCards: Flashcard[] = [];
          if (snapshot) {
            snapshot.forEach(doc => {
              cloudCards.push(doc.data() as Flashcard);
            });
          }
          
          // Merge local cards into cloud if cloud is empty
          const localKeys = localStorage.getItem("learning_dashboard_cards");
          let localCardsList: Flashcard[] = [];
          if (localKeys) {
            try {
              localCardsList = JSON.parse(localKeys);
            } catch (e) {}
          }
          
          if (localCardsList.length > 0 && cloudCards.length === 0) {
            await dbAddMultipleCards(localCardsList, currentUser.uid);
          } else if (cloudCards.length > 0) {
            setCards(cloudCards);
          }
          
          // Fetch stats
          const statsRef = doc(db, "users", currentUser.uid, "stats", "dashboard");
          const statsSnap = await getDoc(statsRef).catch(err => {
            handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}/stats/dashboard`);
          });
          
          if (statsSnap && statsSnap.exists()) {
            const sData = statsSnap.data();
            setStudiedCount(sData.studiedCount ?? 0);
            setBestMatchTime(sData.bestMatchTime ?? 0);
          } else {
            // Save local stats to cloud using values retrieved from localStorage directly to avoid stale closures
            const currentStudiedCount = Number(localStorage.getItem("learning_dashboard_studied_count") || "0");
            const currentBestMatchTime = Number(localStorage.getItem("learning_dashboard_best_match") || "0");
            await dbSaveStats(currentStudiedCount, currentBestMatchTime, currentUser.uid);
          }
          setSyncingStatus("synced");
        } catch (err: any) {
          console.error("Error syncing during login: ", err);
          setSyncingStatus("error");
          setSyncError(err.message || String(err));
        } finally {
          isFetchingRef.current = false;
        }
      } else {
        setSyncingStatus("offline");
      }
    });

    })();
    return () => {
      if (internalUnsubscribe) internalUnsubscribe();
    }
  }, []);

  // Synchronize dynamic card additions by reading the active deck's 'srsMap'
  useEffect(() => {
    let internalIsMounted = true;
    if (!user || !activeDeckId) return;

    const userDeckRef = doc(db, "users", user.uid, "personal_decks", activeDeckId);
    
    getDoc(userDeckRef).then((docSnap) => {
      if (!internalIsMounted) return;
      if (docSnap.exists()) {
        const data = docSnap.data();
        const srsMap = data.srsMap || {};
        const cardIds = Object.keys(srsMap);
        
        setCards(currentCards => {
          const currentIds = currentCards.map(c => c.id);
          const hasDifferentElements = 
            currentIds.length !== cardIds.length || 
            currentIds.some(id => !cardIds.includes(id)) || 
            cardIds.some(id => !currentIds.includes(id));
          
          if (hasDifferentElements) {
             if (cardIds.length > 0) {
                // Fetch in background to prevent blocking React update batching
                setTimeout(() => {
                  if (!internalIsMounted) return;
                  dbEngine.fetchGlobalCardsByIds(cardIds).then(fetchedCards => {
                    if (internalIsMounted) setCards(fetchedCards);
                  }).catch(console.error);
                }, 0);
             } else {
               // Empty deck
               setTimeout(() => {
                 if (internalIsMounted) setCards([]);
               }, 0);
             }
          }
          return currentCards;
        });
      }
    }).catch(err => console.error("Failed to fetch personal deck data:", err));

    return () => {
      internalIsMounted = false;
    };
  }, [user, activeDeckId]);

  // Sync through debounced hook
  useDebouncedSave(user, cards, {studiedCount, bestMatchTime});

  // Save cards to localStorage automatically
  useEffect(() => {
    localStorage.setItem("learning_dashboard_cards", JSON.stringify(cards));
  }, [cards]);



  // Helper to correctly handle quotes and commas inside CSV values
  const splitCSVLine = (line: string, delimiter: string = ","): string[] => {
    const result: string[] = [];
    let currentPart = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(currentPart);
        currentPart = "";
      } else {
        currentPart += char;
      }
    }
    result.push(currentPart);
    return result;
  };

  const runLocalFileParser = (text: string, fileExtension: string, fileName: string) => {
    try {
      let importedCount = 0;
      const parsedCards: Flashcard[] = [];

      if (fileExtension === "json") {
        const parsed = JSON.parse(text);
        const rawCards = Array.isArray(parsed) ? parsed : (parsed.cards || []);
        if (Array.isArray(rawCards)) {
          rawCards.forEach((c: any) => {
            const term = c.term || c.front || c.keyword || c.question || "";
            const def = c.definition || c.back || c.meaning || c.answer || "";
            const hint = c.hint || c.cloze || "Imported JSON Card";
            if (term && def) {
              parsedCards.push({
                id: `json-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                term: String(term).trim(),
                definition: String(def).trim(),
                hint: String(hint).trim(),
                confidence: "",
                interval: 1,
                ease_factor: 2.5,
                next_review_date: new Date().toISOString()
              });
              importedCount++;
            }
          });
        }
      } else {
        // Parse CSV or tab-separated Anki txt export
        const lines = text.split(/\r?\n/);
        
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          
          let parts: string[] = [];
          
          if (trimmed.includes("\t")) {
            parts = trimmed.split("\t");
          } else if (trimmed.includes(";")) {
            parts = splitCSVLine(trimmed, ";");
          } else {
            parts = splitCSVLine(trimmed, ",");
          }

          parts = parts.map(p => p.trim().replace(/^"|"$/g, "").trim());

          if (parts.length >= 2) {
            const term = parts[0];
            const definition = parts[1];
            const hint = parts[2] || "Imported File Card";
            
            if (term.toLowerCase() === "term" || term.toLowerCase() === "front" || term.toLowerCase() === "concept") {
              return;
            }

            parsedCards.push({
              id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              term: term,
              definition: definition,
              hint: hint,
              confidence: "",
              interval: 1,
              ease_factor: 2.5,
              next_review_date: new Date().toISOString()
            });
            importedCount++;
          }
        });
      }

      if (parsedCards.length > 0) {
        addCards(parsedCards);
        setParseLogs(`🎉 Successfully imported ${importedCount} study flashcards from "${fileName}"!`);
      } else {
        setParseLogs(`⚠️ No valid flashcards could be parsed from "${fileName}". Please ensure your file has at least two columns.`);
      }
    } catch (err: any) {
      console.error(err);
      setParseLogs(`❌ Error parsing file "${fileName}": ${err.message || String(err)}`);
    }
  };

  // Handle CSV/Anki plain text import with smart Gemini parser option
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase() || "";
    
    // Help warning for .apkg files
    if (fileExtension === "apkg") {
      setParseLogs(`💡 Anki (.apkg) decks are packed binary SQLite packages. 
To import Anki cards:
1. Open Anki and select your Deck.
2. Click File > Export.
3. Choose "Notes in Plain Text (*.txt)" and check "Include HTML and media references".
4. Upload that exported .txt (tab-separated) file here! We parse them flawlessly.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      // Use modern server-side Gemini background ingestion as the primary method
      setGeminiStatus({ type: "loading", msg: `Uploading file contents to Gemini for smart structural parsing...` });
      try {
        const response = await fetch("/api/gemini/ingest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ text })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || `Server returned status ${response.status}`);
        }

        const data = await response.json();

        if (data && Array.isArray(data.cards)) {
          addCards(data.cards);
          setGeminiStatus({
            type: "success",
            msg: `✨ Successfully imported ${data.cards.length} clean flashcards using Gemini AI structural parsing!`
          });
          setParseLogs(`🎉 Gemini parsed and cleaned ${data.cards.length} flashcards from "${file.name}"!`);
        } else {
          throw new Error("Parsed response from Gemini was not a valid array.");
        }
      } catch (err: any) {
        console.error("Gemini file parse failed, falling back to local: ", err);
        setGeminiStatus({
          type: "error",
          msg: `AI Parse Failed: ${err.message || String(err)}. Running local standard fallback parser.`
        });
        runLocalFileParser(text, fileExtension, file.name);
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = "";
  };

  // Export Deck to a beautiful, clean PDF Study Sheet
  const exportDeckToPDF = () => {
    if (cards.length === 0) {
      alert("No cards are in the active deck to export.");
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    // Dimensions: A4 is 210mm x 297mm
    const margin = 20;
    const contentWidth = 210 - (margin * 2); // 170mm
    let y = 30;

    // Cover Title Block
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 27, 75); // Royal indigo
    doc.text("Active Study Flashcard Deck", margin, y);
    
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate grayish
    doc.text(`Generated on ${new Date().toLocaleDateString()} • Total Flashcards: ${cards.length}`, margin, y);

    // Separator Line
    y += 6;
    doc.setDrawColor(99, 102, 241); // Indigo color
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + contentWidth, y);
    
    y += 15;

    // Render cards list
    cards.forEach((card, index) => {
      // Check page height overflow (max height is 297, limit to around 260 for padding)
      const estimatedHeight = 35; // Standard base gap
      if (y + estimatedHeight > 265) {
        doc.addPage();
        y = 25; // Header gap on new page
        
        // Minor header on new pages
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("Active Study Flashcard Deck — Continued", margin, 15);
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.2);
        doc.line(margin, 17, margin + contentWidth, 17);
      }

      // Draw active index marker
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(99, 102, 241); // Indigo
      doc.text(`CARD #${index + 1}`, margin, y);
      
      // Draw standard confidence tag if studied
      if (card.confidence) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        if (card.confidence === "easy") {
          doc.setTextColor(16, 185, 129); // Emerald
          doc.text("MASTERED", margin + 145, y);
        } else if (card.confidence === "good") {
          doc.setTextColor(99, 102, 241); // Indigo
          doc.text("RECALLED", margin + 145, y);
        } else {
          doc.setTextColor(239, 68, 68); // Rose
          doc.text("MISSED", margin + 145, y);
        }
      }

      y += 6;
      // Draw Term
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42); // Slate-900
      const termLines = doc.splitTextToSize(card.term, contentWidth);
      doc.text(termLines, margin, y);
      y += (termLines.length * 6);

      // Draw Definition
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(51, 65, 85); // Slate-700
      const defLines = doc.splitTextToSize(card.definition, contentWidth);
      doc.text(defLines, margin, y);
      y += (defLines.length * 5.2) + 2;

      // Draw Optional Hint
      if (card.hint && card.hint !== "No hint specified.") {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139); // Slate-500
        const hintLines = doc.splitTextToSize(`Hint: ${card.hint}`, contentWidth);
        doc.text(hintLines, margin, y);
        y += (hintLines.length * 4.5) + 2;
      }

      // Add a clean grey dividing rule
      y += 4;
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.setLineWidth(0.3);
      doc.line(margin, y, margin + contentWidth, y);
      
      y += 10; // margin below divider
    });

    // Trigger local attachment download
    doc.save(`study-deck-export-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Create mock questions from existing cards list
  const generateNewExam = () => {
    if (cards.length < 3) {
      setGeminiStatus({
        type: "error",
        msg: "Add at least 3 cards to your deck to support randomized exams."
      });
      return;
    }

    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    const selectedCards = shuffled.slice(0, Math.min(5, shuffled.length));

    const questions: ExamQuestion[] = selectedCards.map((card, idx) => {
      // Pick dynamic types
      const typeDecider = idx % 4;
      
      if (typeDecider === 0) {
        // Qtype 0: Multiple choice - match Term with correct Definition
        const wrongDefs = cards
          .filter(c => c.id !== card.id)
          .map(c => c.definition)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        
        const choices = [card.definition, ...wrongDefs].sort(() => Math.random() - 0.5);
        return {
          id: `exam-q-${idx}-${card.id}`,
          type: "multiple-choice-term",
          prompt: `Select the correct definition for the term: "${card.term}"`,
          correctAnswer: card.definition,
          choices
        };
      } else if (typeDecider === 1) {
        // Qtype 1: Multiple choice - match Definition with correct Term
        const wrongTerms = cards
          .filter(c => c.id !== card.id)
          .map(c => c.term)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
        
        const choices = [card.term, ...wrongTerms].sort(() => Math.random() - 0.5);
        return {
          id: `exam-q-${idx}-${card.id}`,
          type: "multiple-choice-def",
          prompt: `Which term corresponds with this definition? \n"${card.definition}"`,
          correctAnswer: card.term,
          choices
        };
      } else if (typeDecider === 2) {
        // Qtype 2: True/False statement
        const coinFlip = Math.random() > 0.5;
        let pairingDef = card.definition;
        let isCorrect = "True";

        if (!coinFlip) {
          const alternateCard = cards.find(c => c.id !== card.id) || card;
          pairingDef = alternateCard.definition;
          isCorrect = alternateCard.id === card.id ? "True" : "False";
        }

        return {
          id: `exam-q-${idx}-${card.id}`,
          type: "true-false",
          prompt: `True or False: The term "${card.term}" matches the definition: "${pairingDef}"`,
          correctAnswer: isCorrect,
          choices: ["True", "False"],
          pairingTerm: card.term,
          pairingDef: pairingDef
        };
      } else {
        // Qtype 3: Fill-in-the-blank term
        return {
          id: `exam-q-${idx}-${card.id}`,
          type: "fill-blank",
          prompt: `Complete the sentence with the correct term:\n"${card.definition}" (Hint: ${card.hint || "starts with " + card.term.charAt(0)})`,
          correctAnswer: card.term.toLowerCase().trim()
        };
      }
    });

    setExamQuestions(questions);
    setExamAnswers({});
    setExamGraded(false);
    setExamScore(null);
  };

  // Helper to match fill-in-the-blank answers using keyword tolerance
  const checkKeywordMatch = (userAnswer: string, correctAnswer: string): boolean => {
    const userClean = userAnswer.trim().toLowerCase();
    const correctClean = correctAnswer.trim().toLowerCase();
    
    if (!userClean) return false;
    if (!correctClean) return false;
    
    // Exact or direct inclusion match
    if (userClean === correctClean || userClean.includes(correctClean) || correctClean.includes(userClean)) {
      return true;
    }
    
    // Stop words to filter out for keyword search
    const stopWords = new Set([
      "the", "and", "for", "with", "you", "that", "this", "these", "those", 
      "have", "are", "was", "were", "been", "has", "had", "its", "not", "but", 
      "all", "any", "can", "out", "how", "who", "why", "from", "into", "some", "your"
    ]);
    
    // Retrieve words of length at least 3
    const keywords = correctClean
      .split(/[^a-zA-Z0-9]+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3 && !stopWords.has(w));
      
    if (keywords.length === 0) {
      return userClean.includes(correctClean) || correctClean.includes(userClean);
    }
    
    // Count matches
    const matchedCount = keywords.filter(word => userClean.includes(word)).length;
    const matchRatio = matchedCount / keywords.length;
    
    // If user typed words contain at least 60% of correct keywords
    return matchRatio >= 0.6;
  };

  // Grade exam responses
  const gradeExam = () => {
    let scoreCount = 0;
    examQuestions.forEach((q) => {
      const userAns = (examAnswers[q.id] || "").trim().toLowerCase();
      const correctAns = q.correctAnswer.trim().toLowerCase();
      
      let isCorrect = false;
      if (q.type === "fill-blank") {
        isCorrect = checkKeywordMatch(userAns, correctAns);
      } else {
        isCorrect = userAns === correctAns;
      }
      
      if (isCorrect) {
        scoreCount += 1;
      }
    });

    const percent = Math.round((scoreCount / examQuestions.length) * 100);
    setExamScore(percent);
    setExamGraded(true);
  };

  // Generate Exam automatically on transition
  useEffect(() => {
    if (activeTab === "exam" && examQuestions.length === 0) {
      generateNewExam();
    }
  }, [activeTab, cards]);

  // Timed Match Game Matrix Generator
  const initializeMatchGame = () => {
    if (cards.length < 4) {
      return;
    }

    // Capture 4 random cards
    const pool = [...cards].sort(() => Math.random() - 0.5).slice(0, 4);

    // Split into terms and definitions
    const tiles: MatchTile[] = [];
    pool.forEach((card) => {
      tiles.push({
        id: `term-${card.id}`,
        cardId: card.id,
        type: "term",
        text: card.term
      });
      tiles.push({
        id: `def-${card.id}`,
        cardId: card.id,
        type: "def",
        text: card.definition
      });
    });

    // Shuffle split tiles (2x4 design)
    setMatchTiles(tiles.sort(() => Math.random() - 0.5));
    setMatchedCardIds(new Set());
    setSelectedTileId(null);
    setMismatchedTileIds(new Set());
    
    // Reset stopwatch parameters
    setMatchElapsedTime(0);
    setMatchRunning(false);
    if (stopwatchRef.current) clearInterval(stopwatchRef.current);
  };

  // Start match game timer
  useEffect(() => {
    if (matchRunning) {
      stopwatchRef.current = setInterval(() => {
        setMatchElapsedTime((prev) => prev + 10);
      }, 10);
    } else {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    }
    return () => {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    };
  }, [matchRunning]);

  // Initialize Match game on mount or tab select
  useEffect(() => {
    if (activeTab === "match") {
      initializeMatchGame();
    } else {
      setMatchRunning(false);
    }
  }, [activeTab, cards]);

  // Handle grid selection
  const handleTileClick = (tile: MatchTile) => {
    if (matchedCardIds.has(tile.cardId)) return;
    if (mismatchedTileIds.size > 0) return; // Wait for red mismatch animation fallback

    // Start timer on first selection
    if (!matchRunning) {
      setMatchRunning(true);
    }

    if (selectedTileId === null) {
      setSelectedTileId(tile.id);
    } else {
      // Ignore double click on same item
      if (selectedTileId === tile.id) {
        setSelectedTileId(null);
        return;
      }

      // Lookup first tile details
      const firstTile = matchTiles.find(t => t.id === selectedTileId);
      
      if (firstTile && firstTile.cardId === tile.cardId && firstTile.type !== tile.type) {
        // MATCH DETECTED!
        const newMatched = new Set(matchedCardIds);
        newMatched.add(tile.cardId);
        setMatchedCardIds(newMatched);
        setSelectedTileId(null);

        // Check if game complete
        if (newMatched.size === 4) {
          setMatchRunning(false);
          // Update personal record
          if (bestMatchTime === 0 || matchElapsedTime < bestMatchTime) {
            setBestMatchTime(matchElapsedTime);
            localStorage.setItem("learning_dashboard_best_match", matchElapsedTime.toString());
          }
        }
      } else {
        // MISMATCH! Trigger flash red border animation
        const newMismatched = new Set<string>();
        newMismatched.add(selectedTileId);
        newMismatched.add(tile.id);
        setMismatchedTileIds(newMismatched);
        setSelectedTileId(null);

        setTimeout(() => {
          setMismatchedTileIds(new Set());
        }, 800);
      }
    }
  };

  // Convert milliseconds into highly readable string formats
  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const centiseconds = Math.floor((ms % 1000) / 10);
    
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
  };

  // Manual Setup Deck Form submission
  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim() || !newDefinition.trim()) {
      alert("Please check that Term and Definition parameters are complete.");
      return;
    }

    const brandCard: Flashcard = {
      id: `manual-${Date.now()}`,
      term: newTerm.trim(),
      definition: newDefinition.trim(),
      hint: newHint.trim() || "No hint specified.",
      searchKeywords: generateSearchKeywords(newTerm)
    };

    if (user) {
      try {
        const newCardRef = doc(collection(db, "cards"));
        brandCard.id = newCardRef.id;
        
        // 2. Automate the Dual-Write full document
        await setDoc(newCardRef, { 
          id: newCardRef.id, 
          term: brandCard.term, 
          definition: brandCard.definition, 
          searchKeywords: brandCard.searchKeywords 
        });

        // 3. Update the user deck tracker map
        const userDeckRef = doc(db, "users", user.uid, "personal_decks", activeDeckId);
        
        try {
          await updateDoc(userDeckRef, {
            [`srsMap.${newCardRef.id}`]: {
              boxNumber: 1,
              interval: 1,
              isMastered: false,
              next_review_date: new Date().toISOString()
            }
          });
        } catch (e: any) {
          if (e.code === 'not-found') {
            await setDoc(userDeckRef, {
              srsMap: {
                [newCardRef.id]: {
                  boxNumber: 1,
                  interval: 1,
                  isMastered: false,
                  next_review_date: new Date().toISOString()
                }
              }
            }, { merge: true });
          } else {
            throw e;
          }
        }
      } catch (err) {
        console.error("Failed to automatically link card reference to active deck context:", err);
        // We gracefully continue local functionality even if dual write fails.
      }
    }

    addSingleCard(brandCard);
    setNewTerm("");
    setNewDefinition("");
    setNewHint("");
  };

  // Delete card safely
  const handleDeleteCard = React.useCallback((id: string) => {
    if (cards.length <= 1) {
      alert("At least one card must remain in the learning dashboard configuration.");
      return;
    }
    deleteSingleCard(id);
  }, [cards.length, deleteSingleCard]);

  // Parse Raw Clipboard text regex parser splitting at colons or hyphens and cleansing markers
  const runLocalRegexParser = () => {
    if (!rawNotes.trim()) {
      setParseLogs("Empty raw notes field. Please input text for local parsing.");
      return;
    }

    const lines = rawNotes.split("\n");
    let addedCount = 0;
    const parsedCards: Flashcard[] = [];

    lines.forEach((line) => {
      let trimmed = line.trim();
      if (!trimmed) return;

      // Clean up messy index or Markdown list indicators (*, -, •, integers)
      trimmed = trimmed.replace(/^[\s*•\-–—\d\.\)]+\s*/, "");

      // 1. Match comma/colon with definition keyword (e.g. "Concrete, Definition: A composite material...")
      const definitionBreakRegex = /[,;:-]?\s*(?:definition|defn|def|meaning)\s*:\s*/i;
      const defMatch = trimmed.match(definitionBreakRegex);

      if (defMatch && defMatch.index !== undefined) {
        const termPart = trimmed.substring(0, defMatch.index).trim();
        const definitionPart = trimmed.substring(defMatch.index + defMatch[0].length).trim();

        if (termPart && definitionPart) {
          parsedCards.push({
            id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            term: termPart,
            definition: definitionPart,
            hint: "Extracted from separator text"
          });
          addedCount += 1;
        }
      } else {
        // 2. Split at standard delimiters: arrow (-> or =>), colon (:), hyphen (-, –, —), equals (=), pipe (|), or tab
        const separatorRegex = /\s*(?:->|=>|:=|:|–|—|-|=|\t|\|)\s*/;
        const match = trimmed.match(separatorRegex);

        if (match && match.index !== undefined) {
          const termPart = trimmed.substring(0, match.index).trim();
          const definitionPart = trimmed.substring(match.index + match[0].length).trim();

          if (termPart && definitionPart) {
            parsedCards.push({
              id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              term: termPart,
              definition: definitionPart,
              hint: "Extracted from separator text"
            });
            addedCount += 1;
          }
        } else {
          // Fallback for natural definitions: split at words like " is ", " means ", or " defined as "
          const naturalRegex = /\s+(?:is|means|defined as|refers to)\s+/i;
          const naturalMatch = trimmed.match(naturalRegex);
          if (naturalMatch && naturalMatch.index !== undefined) {
            const termPart = trimmed.substring(0, naturalMatch.index).trim();
            const definitionPart = trimmed.substring(naturalMatch.index + naturalMatch[0].length).trim();

            if (termPart && definitionPart) {
              parsedCards.push({
                id: `auto-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                term: termPart,
                definition: definitionPart.charAt(0).toUpperCase() + definitionPart.slice(1),
                hint: "Extracted from separator text"
              });
              addedCount += 1;
            }
          }
        }
      }
    });

    if (parsedCards.length > 0) {
      addCards(parsedCards);
      setParseLogs(`Successfully parsed and appended ${addedCount} brand-new flashcards!`);
      setRawNotes("");
    } else {
      setParseLogs("Standard extraction failed. Try using format like 'Term : Definition' or 'Term -> Meaning' or 'Term refers to definition'.");
    }
  };

  // Live real Gemini API generation using official server-side endpoints
  const runLiveGeminiGeneration = async () => {
    if (!aiTopic.trim()) {
      setGeminiStatus({ type: "error", msg: "Please enter a study topic (e.g. Mitochondria, Quantum Mechanics)" });
      return;
    }

    setGeminiStatus({ type: "loading", msg: `Engaging Gemini background AI on the server to generate flashcards about "${aiTopic}"...` });

    try {
      const response = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ topic: aiTopic })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Server returned status ${response.status}`);
      }

      const data = await response.json();

      if (data && Array.isArray(data.cards)) {
        addCards(data.cards);
        setGeminiStatus({
          type: "success",
          msg: `✨ Successfully imported ${data.cards.length} live Gemini-generated flashcards into your dashboard!`
        });
        setAiTopic("");
      } else {
        throw new Error("Invalid output layout structures parsed from server response.");
      }
    } catch (err: any) {
      console.error("Gemini server-side generation failed: ", err);
      setGeminiStatus({
        type: "error",
        msg: `Gemini Generation Failed: ${err.message || "Ensure the network is healthy and try again."}`
      });
    }
  };

  // Live Gemini Note Extractor which reads typed/pasted study notes
  const runLiveGeminiNotesExtraction = async () => {
    if (!rawNotes.trim()) {
      setGeminiStatus({ type: "error", msg: "Please paste some study notes in the notes workspace first." });
      return;
    }

    setGeminiStatus({ type: "loading", msg: "Analyzing note context... Engaging real-time Gemini AI extraction on server." });

    try {
      const response = await fetch("/api/gemini/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: rawNotes })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Server returned status ${response.status}`);
      }

      const data = await response.json();

      if (data && Array.isArray(data.cards)) {
        addCards(data.cards);
        setGeminiStatus({
          type: "success",
          msg: `✨ Note Importer: Smart server-side Gemini AI successfully extracted ${data.cards.length} study flashcards!`
        });
        setRawNotes("");
      } else {
        throw new Error("Invalid output layout structures parsed from server response.");
      }
    } catch (err: any) {
      console.error("Gemini note extraction failed: ", err);
      setGeminiStatus({
        type: "error",
        msg: `AI Extract Failed: ${err.message || String(err)}. Running local fallback regex parser.`
      });
      runLocalRegexParser();
    }
  };

  const filteredInventoryCards = React.useMemo(() => {
    const query = deckSearchQuery.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter(card => 
      card.term.toLowerCase().includes(query) ||
      card.definition.toLowerCase().includes(query) ||
      (card.hint && card.hint.toLowerCase().includes(query))
    );
  }, [cards, deckSearchQuery]);

  return (
    <div id="deck-workspace" className={`flex flex-col lg:flex-row min-h-screen w-full transition-colors duration-300 ${stylesObj.rootBg} p-4 gap-4 overflow-y-auto overflow-x-hidden font-sans antialiased selection:bg-indigo-500/30 selection:text-indigo-200`}>
      
      {/* Sidebar navigation panel - Clean Minimalism layout */}
      <aside className="w-full lg:w-56 flex flex-col gap-2 py-2 lg:py-4 shrink-0 justify-between lg:justify-start">
        <div className="px-4 mb-2 lg:mb-6 flex flex-row lg:flex-col justify-between lg:justify-start items-center lg:items-start gap-3">
          <div>
            <h1 className="text-xl font-black tracking-tighter text-indigo-500 dark:text-indigo-400">ARCHITECT LRN</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-slate-500 font-mono">v4.1.0_SRS_STABLE</span>
              <button 
                onClick={() => setActiveTab(activeTab === "debug" ? "flashcards" : "debug")}
                className={`text-[8.5px] font-mono font-bold uppercase px-1.5 py-0.5 rounded cursor-pointer transition-all border ${
                  activeTab === "debug"
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-sm shadow-indigo-900/30"
                    : "bg-indigo-500/10 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 border-indigo-500/20 hover:border-indigo-500/40"
                }`}
                title="Open client-first Database Status Tester"
              >
                ⚙️ DB Debug
              </button>
            </div>
          </div>
          
          {/* Quick Theme Switcher */}
          <div className="flex flex-col items-end lg:items-start gap-1">
            <button
              onClick={toggleTheme}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 border-2 ${
                isDark 
                  ? "bg-slate-900 border-slate-850 text-slate-300 hover:text-white hover:bg-slate-800" 
                  : "bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm"
              }`}
            >
              {isDark ? "🌙 Dark Mode" : "☀️ Light Mode"}
            </button>
            
            {/* Light Mode Variation Selector */}
            {!isDark && (
              <div className="flex items-center gap-1 mt-0.5 animate-fade-in scale-90 md:scale-100 origin-right lg:origin-left">
                {[
                  { id: "slate", label: "Slt", title: "Classic Slate", bg: "bg-[#f1f5f9] text-slate-800 border-slate-300" },
                  { id: "sepia", label: "Sep", title: "Warm Sepia", bg: "bg-[#f5ece2] text-[#433422] border-[#decbb7]" },
                  { id: "mint", label: "Mnt", title: "Fresh Mint", bg: "bg-[#e5f7ed] text-[#0f3525] border-[#caeedc]" },
                  { id: "lavender", label: "Lav", title: "Sunset Lavender", bg: "bg-[#f3f0f8] text-[#2c1a4e] border-[#e3dcf0]" },
                  { id: "contrast", label: "Bld", title: "High-Contrast", bg: "bg-white text-black border-black" }
                ].map(variant => (
                  <button
                    key={variant.id}
                    onClick={() => {
                      setLightVariation(variant.id as any);
                      localStorage.setItem("active_light_variation", variant.id);
                    }}
                    title={variant.title}
                    className={`px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold rounded border cursor-pointer transition-all ${variant.bg} ${
                      lightVariation === variant.id 
                        ? "ring-2 ring-indigo-500 scale-105" 
                        : "opacity-65 hover:opacity-100"
                    }`}
                  >
                    {variant.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Unified Navigation Buttons */}
        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-none shrink-0 border-b border-slate-200 dark:border-slate-800 lg:border-none">
          <button
            id="tab-btn-cards"
            onClick={() => setActiveTab("flashcards")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 text-xs font-semibold uppercase tracking-wider border-2 ${
              activeTab === "flashcards"
                ? (isDark ? "bg-slate-900 text-white border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)]" : "bg-white text-indigo-700 border-indigo-600 shadow-md")
                : (isDark ? "border-slate-800 text-slate-400 hover:bg-slate-850 hover:border-slate-700 hover:text-slate-200" : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900")
            }`}
          >
            <span className="text-base select-none">🎴</span>
            <span>My Workspace</span>
          </button>

          <button
            id="tab-btn-exam"
            onClick={() => setActiveTab("exam")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 text-xs font-semibold uppercase tracking-wider border-2 ${
              activeTab === "exam"
                ? (isDark ? "bg-slate-900 text-white border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)]" : "bg-white text-indigo-700 border-indigo-600 shadow-md")
                : (isDark ? "border-slate-800 text-slate-400 hover:bg-slate-850 hover:border-slate-700 hover:text-slate-200" : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900")
            }`}
          >
            <span className="text-base select-none">📝</span>
            <span>Exam Center</span>
          </button>

          <button
            id="tab-btn-match"
            onClick={() => setActiveTab("match")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 text-xs font-semibold uppercase tracking-wider border-2 ${
              activeTab === "match"
                ? (isDark ? "bg-slate-900 text-white border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)]" : "bg-white text-indigo-700 border-indigo-600 shadow-md")
                : (isDark ? "border-slate-800 text-slate-400 hover:bg-slate-850 hover:border-slate-700 hover:text-slate-200" : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900")
            }`}
          >
            <span className="text-base select-none">🧩</span>
            <span>Match Game</span>
          </button>

          <button
            id="tab-btn-setup"
            onClick={() => setActiveTab("setup")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 text-xs font-semibold uppercase tracking-wider border-2 ${
              activeTab === "setup"
                ? (isDark ? "bg-slate-900 text-white border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)]" : "bg-white text-indigo-700 border-indigo-600 shadow-md")
                : (isDark ? "border-slate-800 text-slate-400 hover:bg-slate-850 hover:border-slate-700 hover:text-slate-200" : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900")
            }`}
          >
            <span className="text-base select-none">⚙️</span>
            <span>Deck Setup</span>
          </button>
          <button
            id="tab-btn-search"
            onClick={() => setActiveTab("search")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 text-xs font-semibold uppercase tracking-wider border-2 ${
              activeTab === "search"
                ? (isDark ? "bg-slate-900 text-white border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.25)]" : "bg-white text-indigo-700 border-indigo-600 shadow-md")
                : (isDark ? "border-slate-800 text-slate-400 hover:bg-slate-850 hover:border-slate-700 hover:text-slate-200" : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900")
            }`}
          >
            <span className="text-base select-none">🔍</span>
            <span>Global Finder</span>
          </button>
          <button
            id="tab-btn-sync"
            onClick={() => {
              if (user) {
                setSyncingStatus("syncing");
                flushSessionBufferToCloud()
                  .then(() => {
                    setSyncingStatus("synced");
                    showToast("Sync completed! Session buffer committed peacefully.", "success");
                  })
                  .catch((err: any) => {
                    setSyncingStatus("error");
                    showToast("Sync failed: " + err.message, "error");
                  });
              } else {
                showToast("Please sign in to sync your study cards.", "info");
              }
            }}
            className={`flex items-center justify-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap cursor-pointer shrink-0 text-xs font-semibold uppercase tracking-wider border-2 ${isDark ? "border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700 hover:text-white" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50 shadow-sm"}`}
          >
            <RotateCw className={`w-4 h-4 ${syncingStatus === "syncing" ? "animate-spin" : ""}`} />
            <span>Sync Data</span>
          </button>
        </div>

        {/* Sidebar Status and Telemetry Block */}
        <div className="mt-auto hidden lg:flex flex-col gap-3 pb-2">
          {/* Deck Telemetry Widget */}
          <div className={`p-4 backdrop-blur-md ${isDark ? "bg-indigo-950/70 border-indigo-500/30 text-indigo-200" : "bg-indigo-50 border-indigo-200 text-indigo-800 shadow-sm"} text-xs space-y-2 select-none border rounded-xl`}>
            <p className={`text-[10px] uppercase tracking-widest ${isDark ? "text-indigo-300" : "text-indigo-600"} font-bold`}>Metrics Widget</p>
            <div className="flex justify-between items-center font-sans">
              <span>Deck Cards:</span>
              <span className={`font-bold ${isDark ? "text-indigo-100" : "text-indigo-900"} font-mono`}>{cards.length}</span>
            </div>
            {bestMatchTime > 0 && (
              <div className={`flex flex-col gap-0.5 border-t ${isDark ? "border-indigo-500/20" : "border-indigo-100"} pt-1.5 mt-1 font-sans`}>
                <span>Match Highscore:</span>
                <span className="font-mono text-[10px] text-emerald-500 font-bold">{formatTime(bestMatchTime)}</span>
              </div>
            )}
          </div>

          <div className={`p-4 backdrop-blur-md ${isDark ? "bg-violet-950/70 border-violet-500/30 text-violet-200" : "bg-violet-50 border-violet-200 shadow-sm"} border rounded-xl space-y-3`}>
            <p className={`text-[10px] uppercase tracking-widest ${isDark ? "text-violet-300" : "text-violet-600"} font-bold`}>Cloud Sync Hub</p>
            
            {authLoading ? (
              <div className={`flex items-center gap-2 text-xs ${isDark ? "text-violet-300" : "text-violet-700"}`}>
                <RotateCw className={`w-3 h-3 animate-spin ${isDark ? "text-violet-400" : "text-violet-500"}`} />
                <span>Initializing link...</span>
              </div>
            ) : user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt="user" 
                      className={`w-5 h-5 rounded-full border ${isDark ? "border-violet-500/50" : "border-violet-300"}`} 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={`w-5 h-5 rounded-full ${isDark ? "bg-violet-900 text-violet-100 border border-violet-500/20" : "bg-violet-100 text-violet-800 border border-violet-300"} flex items-center justify-center text-[10px] font-bold`}>
                      {user.isAnonymous ? "G" : (user.displayName?.charAt(0) || user.email?.charAt(0)?.toUpperCase() || "U")}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-bold ${isDark ? "text-violet-100" : "text-violet-900"} truncate`}>
                      {user.isAnonymous ? "Guest Sync Session" : (user.displayName || "Active User")}
                    </p>
                    <p className={`text-[9px] ${isDark ? "text-violet-300/80" : "text-violet-600"} truncate`}>
                      {user.isAnonymous ? "Guest (No domain setup required!)" : (user.email || "Linked session")}
                    </p>
                  </div>
                </div>

                <div className={`flex items-center justify-between text-[10px] border-t ${isDark ? "border-violet-800/40" : "border-violet-200/60"} pt-2`}>
                  <div className="flex items-center gap-1.5">
                    {syncingStatus === "syncing" && (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                        <span className="text-amber-500 font-mono">Syncing...</span>
                      </>
                    )}
                    {syncingStatus === "synced" && (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-emerald-500 font-mono font-bold">Cloud Active</span>
                      </>
                    )}
                    {syncingStatus === "offline" && (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div>
                        <span className="text-slate-500 font-mono">Local Only</span>
                      </>
                    )}
                    {syncingStatus === "error" && (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-bounce"></div>
                        <span className="text-rose-500 font-mono">Err Rules</span>
                      </>
                    )}
                  </div>
                  
                  <button 
                    onClick={handleSignOut}
                    className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? "text-rose-400 hover:text-rose-300" : "text-rose-600 hover:text-rose-500"} transition-colors cursor-pointer`}
                  >
                    Disconnect
                  </button>
                </div>

                {/* Offer permanent upgrade/login options if current session is Guest */}
                {user.isAnonymous && (
                  <div className={`mt-3 pt-2.5 border-t border-dashed ${isDark ? "border-violet-800/45" : "border-violet-200/80"} space-y-2`}>
                    <p className={`text-[9px] leading-snug ${isDark ? "text-violet-350" : "text-violet-700"} font-medium`}>
                      Your current session is Guest. Connect a Google or Email profile to persist your flashcards forever:
                    </p>
                    <div className="space-y-1.5">
                      <button
                        onClick={() => handleGoogleSignIn(false)}
                        className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-[10px] text-white py-1 px-2.5 rounded-xl transition-all font-semibold active:scale-95 cursor-pointer shadow-sm"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-200" />
                        <span>Link with Google</span>
                      </button>
                      
                      <div className="text-center pt-0.5">
                        <button
                          type="button"
                          onClick={() => setShowEmailForm(!showEmailForm)}
                          className={`text-[9px] ${isDark ? "text-indigo-400 hover:text-indigo-300" : "text-indigo-600 hover:text-indigo-800"} underline font-medium cursor-pointer`}
                        >
                          {showEmailForm ? "Hide Email Setup" : "Link with Email & Password"}
                        </button>
                      </div>

                      {showEmailForm && (
                        <form onSubmit={handleEmailAuth} className="space-y-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 animate-fade-in text-left">
                          <p className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">
                            {emailFormMode === "login" ? "Email Login" : "Email Sign Up / Link"}
                          </p>
                          
                          <div className="space-y-1">
                            <input
                              type="email"
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              placeholder="Email address"
                              className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg px-2 py-0.5 text-[9px] text-slate-200 outline-none transition-all placeholder:text-slate-600 font-sans"
                              required
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <input
                              type="password"
                              value={passwordInput}
                              onChange={(e) => setPasswordInput(e.target.value)}
                              placeholder="Password"
                              className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg px-2 py-0.5 text-[9px] text-slate-200 outline-none transition-all placeholder:text-slate-600 font-sans"
                              required
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-[9px] text-white py-0.5 px-2 rounded font-bold transition-all uppercase tracking-wider cursor-pointer"
                          >
                            {emailFormMode === "login" ? "Sign In" : "Register & Link"}
                          </button>

                          <div className="text-center pt-1 border-t border-slate-850">
                            <button
                              type="button"
                              onClick={() => setEmailFormMode(emailFormMode === "login" ? "signup" : "login")}
                              className="text-[8px] text-slate-400 hover:text-slate-300 underline transition-all cursor-pointer"
                            >
                              {emailFormMode === "login" ? "Need an account? Sign up" : "Have an email account? Log in"}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className={`text-[10px] ${isDark ? "text-slate-400" : "text-slate-600"} leading-relaxed font-sans`}>
                  Sync study cards and stats securely. Use Google, Email, or Guest session.
                </p>
                <div className="space-y-1.5">
                  <button
                    id="sign-in-btn"
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-[11px] text-white py-1.5 px-3 rounded-xl transition-all font-semibold active:scale-95 cursor-pointer shadow-[0_0_12px_rgba(79,70,229,0.2)]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                    <span>Google Cloud Sync</span>
                  </button>
                  <button
                    onClick={handleAnonymousSignIn}
                    className={`w-full text-center text-[10px] ${isDark ? "text-indigo-200 hover:text-white" : "text-indigo-600 hover:text-indigo-800"} underline font-medium cursor-pointer block`}
                  >
                    Or enter as Guest (no setup)
                  </button>
                  <div className={`text-center pt-0.5 border-t ${isDark ? "border-slate-800/20" : "border-indigo-200/50"}`}>
                    <button
                      type="button"
                      onClick={() => setShowEmailForm(!showEmailForm)}
                      className={`text-[10px] ${isDark ? "text-indigo-400 hover:text-indigo-300" : "text-indigo-600 hover:text-indigo-800"} underline font-medium cursor-pointer`}
                    >
                      {showEmailForm ? "Hide Email Login" : "Or use Email / Password"}
                    </button>
                  </div>

                  {showEmailForm && (
                    <form onSubmit={handleEmailAuth} className="space-y-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-850 animate-fade-in text-left">
                      <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                        {emailFormMode === "login" ? "Email Login" : "Email Sign Up"}
                      </p>
                      
                      <div className="space-y-1">
                        <input
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="Email address"
                          className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-[10px] text-slate-200 outline-none transition-all placeholder:text-slate-600 font-sans"
                          required
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <input
                          type="password"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="Password"
                          className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-lg px-2.5 py-1 text-[10px] text-slate-200 outline-none transition-all placeholder:text-slate-600 font-sans"
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-[10px] text-white py-1 px-3 rounded-lg font-bold transition-all uppercase tracking-wider cursor-pointer"
                      >
                        {emailFormMode === "login" ? "Sign In" : "Register"}
                      </button>

                      <div className="text-center pt-1 border-t border-slate-850">
                        <button
                          type="button"
                          onClick={() => setEmailFormMode(emailFormMode === "login" ? "signup" : "login")}
                          className="text-[9px] text-slate-400 hover:text-slate-300 underline transition-all cursor-pointer"
                        >
                          {emailFormMode === "login" ? "Need an account? Sign up" : "Have an email account? Log in"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
            
            {syncError && (
              <div className="mt-2 text-[9px] leading-relaxed font-mono relative">
                {syncError.toLowerCase().includes("unauthorized") || syncError.toLowerCase().includes("domain") ? (
                  <div className="text-rose-450 space-y-2 bg-slate-950/40 p-2.5 rounded-lg border border-rose-500/10">
                    <div className="flex items-center justify-between">
                      <p className="font-sans font-bold text-[10px] text-rose-400">⚠️ Auth Domain Error:</p>
                      <button 
                        type="button" 
                        onClick={() => setSyncError(null)}
                        className="text-[9px] font-sans text-rose-300 hover:text-rose-200 hover:underline bg-rose-500/10 hover:bg-rose-500/20 px-1.5 py-0.5 rounded cursor-pointer transition-all"
                      >
                        Dismiss
                      </button>
                    </div>
                    <p className="text-slate-400 font-sans text-[10px]">
                      Add <code className="bg-slate-900 border border-slate-800 px-1 py-0.5 rounded text-rose-300 font-mono text-[9px] block select-all mt-1">{window.location.hostname}</code> to <strong>Authorized Domains</strong> in Firebase Console (Auth &gt; Settings).
                    </p>
                    <div className="pt-2 border-t border-slate-800/40 space-y-1 text-slate-300 font-sans text-[10px]">
                      <p className="text-teal-400 font-semibold">⚡ Seamless Alternative:</p>
                      <p className="text-[9px] text-slate-400">
                        Email & Password authentication works instantly on ANY custom website without any domain setup!
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowEmailForm(true);
                          setSyncError(null);
                        }}
                        className="w-full mt-1.5 bg-indigo-650 hover:bg-indigo-600 text-white font-sans text-[10px] font-bold py-1 px-2.5 rounded-xl transition active:scale-95 cursor-pointer text-center"
                      >
                        Link with Email & Password Now
                      </button>
                    </div>
                  </div>
                ) : syncError.toLowerCase().includes("popup") || syncError.toLowerCase().includes("blocked") ? (
                  <div className="text-amber-400 space-y-2 bg-slate-950/50 p-2.5 rounded-lg border border-amber-500/20 font-sans text-[10px]">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-amber-400 text-[10px] flex items-center gap-1">⚠️ Popup Blocked</p>
                      <button 
                        type="button" 
                        onClick={() => setSyncError(null)}
                        className="text-[9px] font-sans text-amber-300 hover:text-amber-200 hover:underline bg-amber-550/10 px-1.5 py-0.5 rounded cursor-pointer transition-all"
                      >
                        Dismiss
                      </button>
                    </div>
                    <p className="text-slate-300 leading-normal text-[9px]">
                      Your browser blocked the Google Sign-In popup. Please click the blocked popup icon in your browser's search or address bar and choose <strong>"Always allow popups"</strong> for this domain.
                    </p>
                    <div className="pt-2 border-t border-slate-800/40 space-y-1.5 font-sans">
                      <p className="text-teal-400 font-semibold text-[10px]">⚡ Instant Alternative:</p>
                      <p className="text-[9px] text-slate-400 leading-normal">
                        You can link and persist your cards instantly using the Email & Password option below, requiring no popup permissions.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowEmailForm(true);
                          setSyncError(null);
                        }}
                        className="w-full mt-1 bg-indigo-650 hover:bg-indigo-600 text-white font-sans text-[10px] font-bold py-1 px-2.5 rounded-xl transition active:scale-95 cursor-pointer text-center"
                      >
                        Link with Email & Password
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-rose-455 bg-slate-950/40 p-2 rounded-lg border border-rose-500/10 flex items-center justify-between gap-2">
                    <p className="truncate flex-1">{syncError}</p>
                    <button 
                      type="button" 
                      onClick={() => setSyncError(null)}
                      className="text-[9px] text-rose-300 hover:text-rose-200 font-sans hover:underline cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Container Content Area with Clean Minimalism styling */}
      <main className="flex-1 bg-slate-900/20 rounded-2xl p-2 lg:p-6 flex flex-col gap-4">
        
        {/* Tab content renderer router */}
        <div className="flex-1 flex flex-col">
          
          {/* TAB A: 3D FLASHCARD CAROUSEL WITH SRS */}
          {activeTab === "flashcards" && (
            <FlashcardStudyView
               isDark={isDark}
               stylesObj={stylesObj}
               userId={user?.uid}
               activeDeckId={activeDeckId === "active_default_deck" ? "primary_default_uuid" : activeDeckId}
               onOpenSetup={() => setActiveTab("setup")}
               exportDeckToPDF={exportDeckToPDF}
            />
          )}

          {/* TAB B: EXAM CENTER */}
          {activeTab === "exam" && (
            <div className="max-w-2xl mx-auto space-y-6">
              
              <div className="flex justify-between items-center bg-slate-900/40 p-5 rounded-2xl border border-slate-900 shadow-sm flex-wrap gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-indigo-400" /> Active Exam Simulator
                  </h3>
                  <p className="text-xs text-slate-400">Pulls unique mock matching logic from active flashcard deck</p>
                </div>

                <button
                  onClick={generateNewExam}
                  className="bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-indigo-500/30 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Re-Generate Questions
                </button>
              </div>

              {cards.length < 3 ? (
                <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-12 text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-rose-500/80 mx-auto" />
                  <h3 className="text-lg font-bold text-slate-200">Exam Center Locked</h3>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto">
                    At least 3 complete flashcards are required to design mock exam parameters (Multiple Choice definitions pull from sibling terms).
                  </p>
                  <button
                    onClick={() => setActiveTab("setup")}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm cursor-pointer transition-all inline-flex items-center gap-2"
                  >
                    Go to setup <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Results Dashboard block */}
                  {examGraded && examScore !== null && (
                    <div className="bg-gradient-to-br from-slate-900 to-indigo-950/30 p-6 rounded-2xl border border-indigo-500/25 text-center space-y-3 shadow-lg">
                      <Award className="w-10 h-10 text-amber-400 mx-auto animate-bounce" />
                      <h4 className="text-lg font-extrabold text-white">Grading Report Card</h4>
                      
                      <div className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                        <span className="text-xs text-slate-300 font-mono">Mock Score:</span>
                        <span id="exam-score-badge" className={`text-2xl font-black font-mono ${examScore >= 80 ? "text-emerald-400" : examScore >= 60 ? "text-indigo-300" : "text-rose-400"}`}>
                          {examScore}%
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        {examScore >= 80 
                          ? "Exceptional retention rate. Your confidence interval spacing matrices can be extended!" 
                          : examScore >= 60 
                          ? "Good study groundwork. Review 'Missed' flagged terms within SRS review queue." 
                          : "Sub-optimal baseline. Utilize timed match grids to cement key terms."}
                      </p>
                    </div>
                  )}

                  {/* Question Cards listing */}
                  <div className="space-y-5">
                    {examQuestions.map((q, qidx) => {
                      const userValue = examAnswers[q.id] || "";
                      const isCorrect = q.type === "fill-blank"
                        ? checkKeywordMatch(userValue, q.correctAnswer)
                        : userValue.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
                      const borderState = examGraded 
                        ? isCorrect 
                          ? "border-emerald-500/50 bg-emerald-950/5 shadow-[0_0_15px_rgba(16,185,129,0.08)]" 
                          : "border-rose-500/50 bg-rose-950/5 shadow-[0_0_15px_rgba(239,68,68,0.08)]"
                        : "border-slate-900 hover:border-slate-800 focus-within:border-indigo-500/30";

                      return (
                        <div 
                          key={q.id}
                          className={`bg-slate-900/20 p-6 rounded-2xl border p-5 transition-all ${borderState}`}
                        >
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-mono text-xs text-indigo-400 font-semibold uppercase tracking-wider">
                              Question {qidx + 1} • {q.type === "fill-blank" ? "Fill-in-the-blank" : q.type === "true-false" ? "True / False" : "Multiple Choice"}
                            </span>
                            
                            {examGraded && (
                              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${isCorrect ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                                {isCorrect ? "Correct" : "Incorrect"}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-medium text-slate-200 leading-relaxed mb-4 whitespace-pre-wrap">
                            {q.prompt}
                          </p>

                          {/* Render choices based on Q-Type */}
                          {q.type.startsWith("multiple-choice") && q.choices && (
                            <div className="grid grid-cols-1 gap-2">
                              {q.choices.map((choice) => {
                                const isSelected = userValue === choice;
                                const choiceStyle = isSelected 
                                  ? "bg-indigo-600/15 border-indigo-400 text-white font-medium shadow-[0_0_15px_rgba(99,102,241,0.15)]" 
                                  : "bg-slate-950 border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-300";

                                return (
                                  <button
                                    key={choice}
                                    disabled={examGraded}
                                    onClick={() => setExamAnswers({ ...examAnswers, [q.id]: choice })}
                                    className={`w-full text-left p-3.5 rounded-xl border-2 text-xs leading-relaxed transition-all cursor-pointer ${choiceStyle}`}
                                  >
                                    {choice}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {q.type === "true-false" && (
                            <div className="grid grid-cols-2 gap-3">
                              {["True", "False"].map((choice) => {
                                const isSelected = userValue === choice;
                                const choiceStyle = isSelected 
                                  ? "bg-indigo-600/15 border-indigo-400 text-white font-semibold shadow-[0_0_15px_rgba(99,102,241,0.15)]" 
                                  : "bg-slate-950 border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-300";

                                return (
                                  <button
                                    key={choice}
                                    disabled={examGraded}
                                    onClick={() => setExamAnswers({ ...examAnswers, [q.id]: choice })}
                                    className={`w-full text-center p-3 rounded-xl border-2 text-sm transition-all cursor-pointer ${choiceStyle}`}
                                  >
                                    {choice}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {q.type === "fill-blank" && (
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Type correct term here..."
                                disabled={examGraded}
                                value={userValue}
                                onChange={(e) => setExamAnswers({ ...examAnswers, [q.id]: e.target.value })}
                                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-3 placeholder:text-slate-600 focus:outline-none text-sm font-mono text-slate-200"
                              />
                              {examGraded && !isCorrect && (
                                <p className="text-[11px] font-mono text-rose-400 mt-1 pl-1">
                                  Correct Answer: "{q.correctAnswer}"
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Submit evaluation controls */}
                  <div className="pt-3">
                    {!examGraded ? (
                      <button
                        onClick={gradeExam}
                        id="grade-exam-btn"
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 font-bold text-center text-white rounded-xl shadow-md transition-all sm:text-base cursor-pointer"
                      >
                        Grade Exam Submission
                      </button>
                    ) : (
                      <button
                        onClick={generateNewExam}
                        className="w-full py-4 bg-slate-900 hover:bg-slate-800 border border-indigo-500/20 hover:border-indigo-500/50 font-bold text-center text-indigo-300 rounded-xl shadow-md transition-all cursor-pointer"
                      >
                        Launch New Mock Exam Run
                      </button>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB C: TIMED MATCH MATRIX */}
          {activeTab === "match" && (
            <div className="max-w-3xl mx-auto space-y-6">
              
              {/* Game state dashboard telemetry blocks */}
              <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-900 shadow-sm flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-0.5">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Dices className="w-5 h-5 text-indigo-400" /> Timed Grid Matcher
                  </h3>
                  <p className="text-xs text-slate-400">Match correspond terms and definitions quickly</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="bg-slate-950 px-4 py-2 border border-slate-900 rounded-xl flex items-center gap-2 min-w-[130px] justify-center">
                    <Timer className="w-4 h-4 text-indigo-400" />
                    <span className="font-mono text-base font-bold text-indigo-300 text-center select-none">
                      {formatTime(matchElapsedTime)}
                    </span>
                  </div>

                  <button
                    onClick={initializeMatchGame}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer border border-slate-800 transition-all flex items-center gap-1"
                  >
                    <RotateCw className="w-3.5 h-3.5" /> Restart & Shuffle
                  </button>
                </div>
              </div>

              {cards.length < 4 ? (
                <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-12 text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-rose-500/80 mx-auto" />
                  <h3 className="text-lg font-bold text-slate-200">Gamification Matrix Locked</h3>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto">
                    A minimum of 4 complete flashcards are required to design 2x4 matching matrix sets.
                  </p>
                  <button
                    onClick={() => setActiveTab("setup")}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium text-sm cursor-pointer transition-all inline-flex items-center gap-2"
                  >
                    Go to setup <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Game Success indicator card overlay */}
                  {matchedCardIds.size === 4 && (
                    <div className="bg-gradient-to-r from-emerald-950/20 to-teal-950/20 p-6 rounded-2xl border border-emerald-500/30 text-center space-y-3 shadow-md animate-fade-in">
                      <Sparkles className="w-10 h-10 text-emerald-400 mx-auto animate-pulse" />
                      <h4 className="text-lg font-extrabold text-emerald-200">Matching Complete!</h4>
                      <p className="text-xs text-slate-300">
                        You matched all terms in a time of <span className="font-mono text-emerald-300 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">{formatTime(matchElapsedTime)}</span>. Top Study efforts!
                      </p>
                      
                      <div className="pt-2">
                        <button
                          onClick={initializeMatchGame}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-6 rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                        >
                          Keep Study Running & Shuffle Deck
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2x4 Grid layout splitting terms and definition tiles */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {matchTiles.map((tile) => {
                      const isMatched = matchedCardIds.has(tile.cardId);
                      const isSelected = selectedTileId === tile.id;
                      const isMismatched = mismatchedTileIds.has(tile.id);

                      let styleState = "bg-slate-950 hover:bg-slate-900 border-2 border-slate-800 hover:border-slate-700 text-slate-300";
                      
                      if (isMatched) {
                        styleState = "opacity-20 border-2 border-emerald-700 bg-emerald-950/10 text-emerald-300/40 pointer-events-none scale-95 duration-300 cursor-default";
                      } else if (isMismatched) {
                        styleState = "border-2 border-rose-500 bg-rose-950/20 text-rose-300 animate-shake shadow-[0_0_15px_rgba(239,68,68,0.25)]";
                      } else if (isSelected) {
                        styleState = "border-2 border-indigo-400 bg-indigo-950/25 text-indigo-200 select-none shadow-[0_0_15px_rgba(99,102,241,0.2)] font-medium";
                      }

                      return (
                        <button
                          key={tile.id}
                          onClick={() => handleTileClick(tile)}
                          className={`min-h-[140px] p-4 text-center rounded-2xl text-xs leading-relaxed flex flex-col justify-between transition-all duration-300 cursor-pointer ${styleState}`}
                        >
                          <span className="block font-mono text-[9px] uppercase tracking-wider text-slate-500 mb-2 font-bold select-none text-left">
                            {tile.type === "term" ? "Term Category" : "Definition"}
                          </span>
                          
                          <div className="my-auto select-none break-words font-sans text-[11.5px] font-medium leading-snug">
                            {tile.text}
                          </div>

                          {isMatched && (
                            <span className="block font-mono text-[9px] font-bold text-center text-emerald-400 uppercase tracking-widest mt-2">
                              ✓ matched
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB: SEARCH */}
          {activeTab === "search" && (
            <section className="animate-in fade-in duration-500 max-w-4xl mx-auto">
              <div className="p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
                <SearchBarView 
                  currentDeckId={activeDeckId} 
                  onItemsAdded={(newCards) => {
                    setCards(prev => {
                      // Avoid duplicates
                      const existingIds = new Set(prev.map(c => c.id));
                      const toAdd = newCards.filter(c => !existingIds.has(c.id));
                      return [...prev, ...toAdd];
                    });
                    showToast(`Added ${newCards.length} items to your deck inventory.`, "success");
                  }} 
                />
              </div>
            </section>
          )}
                           {/* TAB D: DECK SETUP & SINGLE STREAM GENERATORS */}
          {activeTab === "setup" && (
            <div className="max-w-6xl mx-auto space-y-6">

              {/* Deck lists inventory manager */}
              <div className={`${stylesObj.panelBg} rounded-2xl border p-6 space-y-4`}>
                <div className={`flex justify-between items-center flex-wrap gap-4 border-b ${stylesObj.border} pb-4`}>
                  <div>
                    <h4 className={`text-base font-bold ${stylesObj.textHeading} flex items-center gap-1.5`}>
                      <FileText className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> Deck Inventory Configuration
                    </h4>
                    <p className={`text-xs ${stylesObj.textMuted} font-sans`}>Review, modify, or eliminate generated card listings</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={deckTitle}
                      onChange={(e) => setDeckTitle(e.target.value)}
                      placeholder="My Study Deck..."
                      className="text-xs bg-slate-900/50 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-1.5 outline-none text-slate-200"
                    />
                    <button
                      onClick={pushDeckToCloudSync}
                      disabled={syncingStatus === "syncing"}
                      className="text-xs text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 border border-indigo-500/20 px-3 py-1.5 rounded-xl transition-all font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <CloudLightning className="w-3.5 h-3.5" />
                      Share Globally
                    </button>
                    <button
                      onClick={exportDeckToPDF}
                      className="text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 border border-emerald-400/50 shadow-md shadow-emerald-500/20 px-3 py-1.5 rounded-xl transition-all font-bold inline-flex items-center gap-1.5 group cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-white group-hover:scale-110 transition-all" />
                      Export Deck PDF
                    </button>
                    <button
                      onClick={() => {
                        triggerConfirm(
                          "Clear Active Deck",
                          "Are you sure you want to restore the default flashcards locally? This will replace any custom cards and order you have configured. Click 'Push Finalized Deck to Cloud Sync' afterwards to synchronize this with your cloud profile.",
                          async () => {
                            setCards(DEFAULT_CARDS);
                            setCurrentIdx(0);
                            showToast("Active deck reset locally to default presets.", "info");
                          },
                          "danger",
                          "Confirm Reset"
                        );
                      }}
                      className="text-xs text-rose-400 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/20 hover:border-rose-500/40 px-3 py-1.5 rounded-xl transition-all font-semibold font-mono cursor-pointer"
                    >
                      Wipe Deck
                    </button>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <Search className="h-4 w-4 text-indigo-400/70" />
                  </span>
                  <input
                    type="text"
                    value={deckSearchQuery}
                    onChange={(e) => setDeckSearchQuery(e.target.value)}
                    placeholder="Search cards by term, definition, or hint..."
                    className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-10 py-2.5 outline-none text-xs text-slate-200 transition-all font-sans"
                  />
                  {deckSearchQuery && (
                    <button
                      onClick={() => setDeckSearchQuery("")}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-[10px] text-slate-400 hover:text-slate-200 font-mono font-bold tracking-wider hover:bg-slate-800/40 px-1.5 py-0.5 rounded transition-all"
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                {(() => {
                  if (filteredInventoryCards.length === 0) {
                    return (
                      <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-8 text-center space-y-2">
                        <AlertCircle className="w-8 h-8 text-indigo-400/50 mx-auto" />
                        <p className="text-slate-300 font-bold text-xs mt-1">No matching cards found</p>
                        <p className="text-slate-500 text-[11px] font-sans">No cards matched your query "{deckSearchQuery}". Modify your search or clear the filter.</p>
                        <button
                          onClick={() => setDeckSearchQuery("")}
                          className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40 bg-indigo-500/5 px-3 py-1 rounded-lg transition-all"
                        >
                          Clear Filter
                        </button>
                      </div>
                    );
                  }

                  return (
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCorners}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={filteredInventoryCards}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                          {filteredInventoryCards.map((card) => {
                            const originalIndex = cards.findIndex(c => c.id === card.id);
                            return (
                              <SortableFlashcardItem 
                                key={card.id} 
                                card={card} 
                                originalIndex={originalIndex} 
                                handleDeleteCard={handleDeleteCard} 
                                isDark={isDark}
                                stylesObj={stylesObj}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  );
                })()}
              </div>

              
              {/* Form entries Split layout columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                
                {/* Column left: Setup manually */}
                <div className="bg-slate-900/40 rounded-2xl border-2 border-slate-800 p-6 md:p-8 space-y-6">
                  

                  <div className="flex items-center gap-3 border-b border-slate-800/80 pb-3">
                    <Plus className="w-5 h-5 text-indigo-400" />
                    <div>
                      <h4 className="text-base font-bold text-slate-100 font-sans">Add Study Card Manually</h4>
                      <p className="text-xs text-slate-400 font-sans">Append singular terms and definitions immediately to active local storage</p>
                    </div>
                  </div>

                  <form onSubmit={handleAddCard} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs uppercase text-slate-400 tracking-wider font-mono font-semibold">New Term / Keyword:</label>
                      <input
                        type="text"
                        value={newTerm}
                        onChange={(e) => setNewTerm(e.target.value)}
                        placeholder="e.g., Closure"
                        className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 outline-none text-xs text-slate-200 transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs uppercase text-slate-400 tracking-wider font-mono font-semibold">Study Definition / Meaning:</label>
                      <textarea
                        value={newDefinition}
                        onChange={(e) => setNewDefinition(e.target.value)}
                        placeholder="e.g., A function bundled together with references to its surrounding state."
                        rows={3}
                        className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 outline-none text-xs text-slate-200 transition-all resize-none font-sans"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs uppercase text-slate-400 tracking-wider font-mono font-semibold">Helpful Hint (Optional):</label>
                      <input
                        type="text"
                        value={newHint}
                        onChange={(e) => setNewHint(e.target.value)}
                        placeholder="e.g., lexical environment boundaries"
                        className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 outline-none text-xs text-slate-200 transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl text-xs tracking-wider uppercase transition-all cursor-pointer shadow-md border-2 border-indigo-700/50 hover:border-indigo-400"
                    >
                      New Flashcard
                    </button>
                  </form>
                </div>

                {/* Column right: Smart Notes Workspace with Dual Extraction Choices */}
                <div className="bg-slate-900/40 rounded-2xl border-2 border-slate-800 p-6 md:p-8 space-y-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 border-b border-slate-800/80 pb-3 mb-4">
                      <Clipboard className="w-5 h-5 text-indigo-400" />
                      <div>
                        <h4 className="text-base font-bold text-slate-100 font-sans">Notes & File Ingestion</h4>
                        <p className="text-xs text-slate-400 font-sans">Import cards from notes, paste contents or upload CSV/Anki exports</p>
                      </div>
                    </div>

                    {/* Sub-tab selection controls */}
                    <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/80 mb-4">
                      <button
                        type="button"
                        onClick={() => setImportSubTab("text")}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          importSubTab === "text"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        <span>Paste Notes</span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setImportSubTab("file")}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          importSubTab === "file"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-100"
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload File</span>
                      </button>
                    </div>

                    {importSubTab === "text" ? (
                      <div className="space-y-4 animate-fade-in text-left">
                        <div className="space-y-1.5">
                          <label className="block text-xs uppercase text-slate-400 tracking-wider font-mono font-semibold">Paste Your Raw Study notes here:</label>
                          <textarea
                            value={rawNotes}
                            onChange={(e) => setRawNotes(e.target.value)}
                            placeholder={`Example (Freeform or split lists):\n- API : Application Programming Interface\n- HTML : Hypertext Markup Language\nOr paste any general paragraphs, lecture slide contents, transcripts, or summaries to let the AI extract definitions!`}
                            rows={6}
                            className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 rounded-xl px-4 py-3 outline-none text-xs font-mono resize-none leading-relaxed text-slate-200 transition-all"
                          />
                        </div>

                        {/* Dual Extraction Choices */}
                        <div className="space-y-2.5">
                          <label className="block text-[11px] uppercase text-indigo-200 tracking-wider font-mono font-bold">Choose Extraction Method:</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Option 1: Live Gemini AI parser */}
                            <button
                              onClick={runLiveGeminiNotesExtraction}
                              disabled={geminiStatus.type === "loading"}
                              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer border-2 border-indigo-500 hover:border-indigo-300 transition-all flex items-center justify-center gap-2 text-center shadow-lg shadow-indigo-950/20"
                            >
                              <Sparkles className="w-4 h-4 text-indigo-200" />
                              <span>{geminiStatus.type === "loading" ? "Extracting..." : "Extract with Gemini AI"}</span>
                            </button>

                            {/* Option 2: Smart separation parser */}
                            <button
                              onClick={runLocalRegexParser}
                              className="bg-slate-950 hover:bg-slate-900 text-slate-300 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer border-2 border-slate-800 hover:border-slate-700 transition-all flex items-center justify-center gap-2 text-center"
                            >
                              <Clipboard className="w-4 h-4 text-indigo-400" />
                              <span>Standard Extract (No AI)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 animate-fade-in text-left">
                        <div className="space-y-1.5">
                          <label className="block text-xs uppercase text-slate-400 tracking-wider font-mono font-semibold">Upload Study Deck File:</label>
                          <div className={`border-4 ${isDark ? "border-slate-800 hover:border-indigo-500/40 bg-slate-950/50" : "border-slate-400 hover:border-indigo-500 bg-white"} rounded-2xl p-6 transition-all flex flex-col items-center justify-center text-center group relative cursor-pointer min-h-[180px]`}>
                            <input
                              type="file"
                              accept=".csv,.txt,.json,.apkg"
                              onChange={handleImportFile}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="space-y-2 flex flex-col items-center">
                              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 group-hover:scale-110 duration-200">
                                <Upload className="w-6 h-6" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-200">Drag & drop or click to upload</p>
                                <p className="text-[10px] text-slate-500 mt-1 font-mono">Supports .CSV, .TXT (Anki tab-text), or .JSON</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Informative Anki Helper Box */}
                        <div className="bg-slate-950/40 border-2 border-slate-800/60 p-3.5 rounded-xl text-xs text-slate-400 leading-relaxed font-sans space-y-1">
                          <p className="font-semibold text-slate-300 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                            How to import your Anki Decks?
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Anki <code className="text-indigo-300 font-mono">.apkg</code> files are packed binary SQLite database archives. The most portable, standard way to study them here is to export card decks in Anki via <strong className="text-slate-300 font-medium">File &gt; Export</strong> as <strong className="text-slate-300 font-medium">Notes in Plain Text (*.txt)</strong> or <strong className="text-slate-300 font-medium">CSV</strong>, and upload that file here. We parse tab-separated and CSV Anki exports instantly!
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-2">
                    {parseLogs && (
                      <div className="text-xs font-mono text-indigo-300 bg-indigo-500/10 px-4 py-3 rounded-xl border border-indigo-500/20 whitespace-pre-wrap leading-relaxed animate-fade-in mb-3">
                        {parseLogs}
                      </div>
                    )}

                    {geminiStatus.msg && (
                      <div className={`text-xs font-mono px-4 py-3 rounded-xl border-2 leading-relaxed animate-fade-in ${
                        geminiStatus.type === "error" 
                          ? "bg-rose-500/5 text-rose-300 border-rose-500/30" 
                          : geminiStatus.type === "success" 
                          ? "bg-emerald-500/5 text-emerald-300 border-emerald-500/30" 
                          : "bg-slate-950 text-indigo-400 border-indigo-500/20"
                      }`}>
                        {geminiStatus.msg}
                      </div>
                    )}
                  </div>
                </div>

              </div>
              
              {/* Gemini API Key Universal Config Bar */}
              <div className="bg-slate-900/60 rounded-2xl border-2 border-slate-800 p-5 md:p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                       <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                      Google Gemini AI Engine Credentials
                    </h4>
                    <p className="text-xs text-slate-400 font-sans">
                      Enter your API key below. This credential enables real-time AI context notes analysis and prompt-based study generators.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase ${
                      geminiApiKey 
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}>
                      {geminiApiKey ? "● AI Connected" : "○ Offline Simulator Active"}
                    </span>
                  </div>
                </div>

                <div className="relative max-w-xl">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="Enter your GEMINI_API_KEY..."
                    className="w-full bg-slate-950 border-2 border-slate-800 focus:border-indigo-500 rounded-xl pl-4 pr-10 py-2.5 placeholder:text-slate-700 outline-none text-xs font-mono text-slate-300 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 transition-all focus:outline-none cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 font-mono italic">
                  Key saved securely inside active browser sessionStorage. If left empty, offline responsive simulators handle test runs gracefully.
                </p>
              </div>

              {/* STUDY DECK BACKUP & VERSION SNAPSHOT HUB */}
              <div className={`${stylesObj.panelBg} rounded-2xl border-2 p-5 md:p-6 space-y-6 transition-all duration-300`}>
                <div className="flex items-center gap-3 border-b pb-3 border-slate-200 dark:border-slate-800">
                  <Database className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  <div className="text-left">
                    <h4 className={`text-base font-bold ${stylesObj.textHeading} font-sans`}>
                      💾 Study Deck Backup & Snapshot Manager
                    </h4>
                    <p className={`text-xs ${stylesObj.textMuted} font-sans`}>
                      Back up your current website configuration, switch flashcard decks instantly at will, and restore previous versions.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Left: JSON File Backup */}
                  <div className="space-y-4 border-r-0 lg:border-r border-slate-200 dark:border-slate-800 lg:pr-6 text-left">
                    <div className="space-y-1">
                      <h5 className={`text-xs font-bold uppercase tracking-wider ${stylesObj.textHeading} font-mono flex items-center gap-1.5`}>
                        <Download className="w-4 h-4 text-emerald-500" /> JSON File Backup
                      </h5>
                      <p className={`text-[11px] ${stylesObj.textMuted} font-sans`}>
                        Save your entire study deck and configuration to a local JSON file. Perfect for permanent backup or migrating to other devices.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      {/* Export Button */}
                      <button
                        onClick={handleExportJSONBackup}
                        className="flex-grow bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Backup</span>
                      </button>

                      {/* Import Area */}
                      <div className="flex-grow relative">
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleImportJSONBackup}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                        />
                        <div className={`border-2 ${isDark ? "bg-slate-950/50 border-slate-800" : "bg-white border-slate-400"} rounded-xl py-2.5 px-4 text-center transition-all flex items-center justify-center gap-2 cursor-pointer hover:border-indigo-500`}>
                          <Upload className={`w-3.5 h-3.5 ${isDark ? "text-indigo-400" : "text-indigo-700"}`} />
                          <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? stylesObj.textLight : "text-slate-950"}`}>
                            Upload Backup
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Snapshots versioning */}
                  <div className="space-y-4 text-left">
                    <div className="space-y-1">
                      <h5 className={`text-xs font-bold uppercase tracking-wider ${stylesObj.textHeading} font-mono flex items-center gap-1.5`}>
                        <CheckCircle2 className="w-4 h-4 text-indigo-400 animate-pulse" /> Local Snapshot Slots
                      </h5>
                      <p className={`text-[11px] ${stylesObj.textMuted} font-sans`}>
                        Take instant, quick snapshots in your browser. This lets you change terms and websites "at will" and toggle back and forth effortlessly.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {[
                        { num: 1, state: snapshotSlot1, label: "Snapshot Slot A" },
                        { num: 2, state: snapshotSlot2, label: "Snapshot Slot B" },
                        { num: 3, state: snapshotSlot3, label: "Snapshot Slot C" }
                      ].map(slot => {
                        let parsed = null;
                        if (slot.state) {
                          try {
                            parsed = JSON.parse(slot.state);
                          } catch (e) {}
                        }

                        return (
                          <div
                            key={slot.num}
                            className={`flex flex-col sm:flex-row items-start sm:items-center justify-between border rounded-xl p-3 gap-3 transition-all ${
                              parsed 
                                ? "bg-indigo-500/5 border-indigo-500/20" 
                                : "bg-slate-50/50 dark:bg-slate-950/20 border-slate-250/90 dark:border-slate-800"
                            }`}
                          >
                            <div className="space-y-0.5 text-left">
                              <span className={`text-[10px] font-mono font-bold uppercase ${
                                parsed ? "text-indigo-400" : "text-slate-400"
                              }`}>
                                {slot.label}
                              </span>
                              <div className={`text-xs font-semibold ${stylesObj.textHeading}`}>
                                {parsed ? parsed.name : "Free Slot (Empty)"}
                              </div>
                              {parsed && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                  Saved {parsed.date} • {parsed.cards?.length || 0} cards
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 font-sans">
                              {/* Save Snapshot */}
                              <button
                                onClick={() => handleSaveSnapshotSlot(slot.num as any)}
                                title="Overwrite slot with current deck config"
                                className="flex-grow sm:flex-initial bg-slate-200 dark:bg-slate-900 hover:bg-slate-300 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 p-2 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer border border-slate-300 dark:border-slate-850"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>Save Here</span>
                              </button>
                              
                              {saveStatus && saveStatus.includes(`slot ${slot.num}`) && (
                                <span className="text-[10px] text-emerald-500 font-bold ml-2">✓ Saved!</span>
                              )}

                              {parsed ? (
                                <>
                                  {/* Restore Snapshot */}
                                  <button
                                    onClick={() => handleRestoreSnapshotSlot(slot.num as any)}
                                    title="Load this snapshot configuration"
                                    className="flex-grow sm:flex-initial bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm shadow-indigo-950/20"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Restore</span>
                                  </button>

                                  {/* Delete Slot */}
                                  <button
                                    onClick={() => handleClearSnapshotSlot(slot.num as any)}
                                    title="Clear Slot"
                                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 p-2 rounded-lg text-[10px] transition-all cursor-pointer border border-rose-500/20 flex items-center justify-center"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* TAB E: SECURE DATABASE STATUS DIAGNOSTICS & SYSTEM MONITOR */}
          {activeTab === "debug" && (
            <DatabaseStatusTester
              user={user}
              isDark={isDark}
              stylesObj={stylesObj}
              showToast={showToast}
            />
          )}

      {/* Iframe-Safe Toast Notifications Overlay */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`shadow-lg rounded-xl border p-3 flex items-center justify-between gap-2.5 animate-fade-in pointer-events-auto max-w-sm text-xs font-medium font-sans ${
              t.type === 'success' 
                ? 'bg-emerald-950 text-emerald-100 border-emerald-500/20' 
                : t.type === 'error' 
                ? 'bg-rose-950 text-rose-100 border-rose-500/20' 
                : 'bg-slate-900 text-indigo-100 border-indigo-500/10'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${t.type === 'success' ? 'bg-emerald-400' : t.type === 'error' ? 'bg-rose-400' : 'bg-indigo-400'}`} />
              <span className="flex-1 leading-snug">{t.message}</span>
            </div>
            <button 
              onClick={() => setToasts((prev) => prev.filter((prevT) => prevT.id !== t.id))}
              className="text-[10px] text-slate-400 hover:text-white font-mono cursor-pointer ml-1.5 p-0.5"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Custom High-Quality Confirm Modal */}
      <AestheticConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

        </div>

      </main>

    </div>
  );
}

interface AestheticConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  type?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

function AestheticConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = "Cancel",
  type = "primary",
  onConfirm,
  onCancel
}: AestheticConfirmModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Background Mask */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onCancel} />
      
      {/* Centered Card */}
      <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-2xl max-w-md w-full relative z-10 shadow-2xl space-y-4 text-left font-sans">
        <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
          {type === 'danger' ? '⚠️' : 'ℹ️'} {title}
        </h4>
        <p className="text-xs text-slate-300 leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer transition-all border border-slate-700/50"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all text-white ${
              type === 'danger' 
                ? 'bg-rose-600 hover:bg-rose-500 shadow-sm shadow-rose-950/30' 
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-sm shadow-indigo-950/30'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
