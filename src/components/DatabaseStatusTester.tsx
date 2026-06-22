import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db, firebaseConfig } from "../config/firebaseConfig";

interface DatabaseStatusTesterProps {
  user: any;
  isDark: boolean;
  stylesObj: any;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function DatabaseStatusTester({ 
  user, 
  isDark, 
  stylesObj,
  showToast
}: DatabaseStatusTesterProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbCards, setDbCards] = useState<any[]>([]);
  const [rawGlobalResult, setRawGlobalResult] = useState<{ success: boolean; count: number; error?: string } | null>(null);

  // Fetch current user's cards from original database
  const fetchUserCards = async () => {
    if (!user) {
      setError("No user authenticated. Authenticated session is required by secure security rules.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = query(collection(db, "cards"), where("authorId", "==", user.uid));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbCards(items);
      showToast("Cloud user cards retrieved successfully!", "success");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to retrieve cards");
      showToast("Failed to retrieve cards: Missing or Insufficient Permissions.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Test Raw Global Collection (gets blocked by custom rules if not owner, demonstrating security!)
  const testRawGlobalFetch = async () => {
    setLoading(true);
    setRawGlobalResult(null);
    try {
      const snapshot = await getDocs(collection(db, "cards"));
      setRawGlobalResult({
        success: true,
        count: snapshot.size
      });
      showToast("Raw global fetch succeeded (Warning: check rules privacy, should be blocked!)", "info");
    } catch (err: any) {
      console.error(err);
      setRawGlobalResult({
        success: false,
        count: 0,
        error: err?.message || "Permission Denied"
      });
      showToast("Security Active: Raw global get rejected as expected.", "success");
    } finally {
      setLoading(false);
    }
  };

  // Create a synthetic debug test card
  const handleCreateTestCard = async () => {
    if (!user) {
      showToast("Must be signed in to verify database write authorization.", "error");
      return;
    }
    setLoading(true);
    try {
      const id = "test_" + Date.now();
      const testCard = {
        id,
        userId: user.uid,
        term: "💡 Db Status Test Term",
        definition: "This is a successful client-side Firestore synchronization test card generated at " + new Date().toLocaleTimeString(),
        confidence: "",
        interval: 0,
        ease_factor: 2.5,
        next_review_date: new Date().toISOString()
      };
      await setDoc(doc(db, "cards", id), testCard);
      showToast("Test card stored successfully in cloud!", "success");
      // refresh user list
      await fetchUserCards();
    } catch (err: any) {
      showToast("Failed to store test card in cloud: " + (err.message || err), "error");
    } finally {
      setLoading(false);
    }
  };

  // Delete test card
  const handleDeleteTestCard = async (id: string) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, "cards", id));
      showToast("Test card eliminated from database.", "success");
      await fetchUserCards();
    } catch (err: any) {
      showToast("Failed to delete test card: " + (err.message || err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserCards();
    }
  }, [user]);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className={`${stylesObj.panelBg} rounded-xl border p-6 space-y-4`}>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h3 className={`text-base font-bold ${stylesObj.textHeading} flex items-center gap-2`}>
              🔧 Client-First Database Status Tester & Admin Panel
            </h3>
            <p className={`text-xs ${stylesObj.textMuted} font-sans`}>
              Bypass Google Cloud Console dashboard bugs by verifying connection states, inspecting collections, and monitoring synchronization layers.
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase flex items-center gap-1 bg-indigo-500/10 text-indigo-500`}>
            🧪 Admin Mode
          </span>
        </div>

        {/* Configurations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className={`${isDark ? "bg-slate-950/60" : "bg-slate-100"} p-4 rounded-xl border ${stylesObj.border} space-y-1.5`}>
            <p className={`text-[10px] font-mono uppercase font-bold tracking-wider ${stylesObj.textMuted}`}>Active Firebase Credentials</p>
            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className={`${stylesObj.textMuted}`}>Project ID:</span>
                <span className={`font-semibold ${stylesObj.textLight}`}>{firebaseConfig.projectId}</span>
              </div>
              <div className="flex justify-between">
                <span className={`${stylesObj.textMuted}`}>Database ID:</span>
                <span className={`font-semibold text-indigo-500 truncate max-w-[150px]`} title="(default) - Standard Main Database">
                  (default)
                </span>
              </div>
              <div className="flex justify-between">
                <span className={`${stylesObj.textMuted}`}>Auth Domain:</span>
                <span className={`font-semibold ${stylesObj.textLight} truncate max-w-[150px]`}>{firebaseConfig.authDomain}</span>
              </div>
            </div>
          </div>

          <div className={`${isDark ? "bg-slate-950/60" : "bg-slate-100"} p-4 rounded-xl border ${stylesObj.border} space-y-1.5`}>
            <p className={`text-[10px] font-mono uppercase font-bold tracking-wider ${stylesObj.textMuted}`}>Authentication & Authority</p>
            <div className="text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className={`${stylesObj.textMuted}`}>Auth State:</span>
                <span className={`font-semibold ${user ? "text-emerald-500" : "text-amber-500"}`}>{user ? "SIGNED IN" : "SIGNED OUT"}</span>
              </div>
              {user && (
                <>
                  <div className="flex justify-between">
                    <span className={`${stylesObj.textMuted}`}>Unique UID:</span>
                    <span className={`font-semibold ${stylesObj.textLight} truncate max-w-[150px]`} title={user.uid}>{user.uid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={`${stylesObj.textMuted}`}>Account E-mail:</span>
                    <span className={`font-semibold ${stylesObj.textLight} truncate max-w-[150px]`}>{user.email}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={`${isDark ? "bg-slate-950/60" : "bg-slate-100"} p-4 rounded-xl border ${stylesObj.border} space-y-1.5`}>
            <p className={`text-[10px] font-mono uppercase font-bold tracking-wider ${stylesObj.textMuted}`}>Query Diagnostics</p>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className={`font-mono text-[11px] ${stylesObj.textMuted}`}>Cards loaded locally:</span>
                <span className={`font-mono font-bold ${stylesObj.textLight}`}>{dbCards.length} docs</span>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={fetchUserCards}
                  disabled={loading}
                  className="flex-1 py-1 px-2 text-[10px] font-bold uppercase bg-indigo-600 text-white rounded hover:bg-indigo-500 cursor-pointer disabled:opacity-50"
                >
                  Reload User
                </button>
                <button
                  onClick={testRawGlobalFetch}
                  disabled={loading}
                  className="flex-1 py-1 px-2 text-[10px] font-bold uppercase border border-slate-700 hover:bg-slate-800 text-slate-300 rounded cursor-pointer disabled:opacity-50"
                  title="Grabs raw collection to confirm secure rule rejection for unauthorized fields"
                >
                  Global Probe
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {rawGlobalResult && (
        <div className={`p-4 rounded-xl border ${rawGlobalResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"} font-mono text-xs animate-fade-in`}>
          <div className="flex justify-between items-center mb-1">
            <span className="font-bold">🚨 Global DB Probe Diagnosis:</span>
            <button onClick={() => setRawGlobalResult(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
          {rawGlobalResult.success ? (
            <p>SUCCESSFUL PROBE. Found {rawGlobalResult.count} total documents in the database. Warning: This indicates security rules do not restrict list operations to owner-specific partitions!</p>
          ) : (
            <div className="space-y-1">
              <p className="text-rose-400 font-bold">REJECTED SECURELY (Expected Rule Action):</p>
              <p className={`text-[11px] break-words text-slate-300 ${isDark ? "bg-slate-950" : "bg-slate-200"} p-2 rounded`}>
                {rawGlobalResult.error}
              </p>
              <p className="text-[10px] text-slate-450 font-sans mt-1">Excellent! The Firestore list security rules successfully blocked an unpartitioned client query. This verifies that your data partitions are protected against leak attacks!</p>
            </div>
          )}
        </div>
      )}

      {/* Main Database Table & List */}
      <div className={`${stylesObj.panelBg} rounded-xl border p-6 space-y-4`}>
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h4 className={`text-sm font-bold ${stylesObj.textHeading} flex items-center gap-1.5`}>
              📂 Document Records: <code className="text-indigo-400 font-mono font-bold">cards</code> collection ({dbCards.length} cards total)
            </h4>
            <p className={`text-xs ${stylesObj.textMuted} font-sans`}>
              Showing raw records registered for the current synchronized UID partition.
            </p>
          </div>
          <button
            onClick={handleCreateTestCard}
            disabled={loading}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            ➕ Post Debug Card
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-mono whitespace-pre-wrap">
            {error}
          </div>
        )}

        {loading && dbCards.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 font-mono space-y-2">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Executing fetch from cloud firestore endpoint (Region configured)...</p>
          </div>
        ) : dbCards.length === 0 ? (
          <div className={`p-12 text-center rounded-xl border ${stylesObj.border} border-dashed`}>
            <p className={`text-xs ${stylesObj.textMuted}`}>No cloud card references. Connect with Google or persist some cards, or press "Post Debug Card" to test write actions!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/60">
            <table className="w-full text-left text-xs font-mono">
              <thead className={`${isDark ? "bg-slate-950" : "bg-slate-100"} text-slate-400 text-[10px] uppercase font-bold border-b border-slate-850`}>
                <tr>
                  <th className="p-3">Doc ID</th>
                  <th className="p-3">User ID (Owner)</th>
                  <th className="p-3">Term</th>
                  <th className="p-3">Definition Summary</th>
                  <th className="p-3 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {dbCards.map((card) => (
                  <tr key={card.id} className={`${isDark ? "hover:bg-slate-900/40" : "hover:bg-slate-100/50"} transition-colors`}>
                    <td className="p-3 max-w-[120px] truncate font-semibold text-slate-400" title={card.id}>
                      {card.id}
                    </td>
                    <td className="p-3 max-w-[100px] truncate text-slate-500 text-[10px]" title={card.userId}>
                      {card.userId}
                    </td>
                    <td className={`p-3 max-w-[140px] truncate font-bold ${stylesObj.textHeading}`}>
                      {card.term}
                    </td>
                    <td className="p-3 max-w-[200px] truncate text-slate-400">
                      {card.definition}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteTestCard(card.id)}
                        className="py-1 px-2.5 rounded bg-rose-500/10 text-rose-455 border border-rose-500/20 hover:bg-rose-500/20 hover:text-rose-400 text-[10px] cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
