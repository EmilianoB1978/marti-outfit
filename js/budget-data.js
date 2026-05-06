// =============================================================================
// Budget mese-per-mese: modello + CRUD Firestore
// =============================================================================
// Collection: 'budgets', un documento per mese (id = 'YYYY-MM').
// Ogni mese:
//   {
//     month: '2026-05',
//     budget: 200,                   // limite impostato dall'utente per questo mese
//     rollover_in: 50,               // €  positivo = avanzo dal mese precedente
//                                    //   negativo = sforamento dal mese precedente
//     transactions: [                // acquisti del mese
//       { id, label, amount, date, item_id?, category?, link? }
//     ],
//     closed: false,                 // true quando l'utente ha 'chiuso' il mese
//     rollover_out: null,            // come e' stato gestito il delta:
//                                    //   number = somma rollata al mese successivo
//                                    //   0      = azzerato dall'utente
//                                    //   null   = mese non chiuso
//     created_at, updated_at
//   }
// =============================================================================

import {
  db, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from "./firebase-config.js";

const COLLECTION = "budgets";

/** Ritorna 'YYYY-MM' del mese passato in date (default: oggi). */
export function monthKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Mese precedente di 'YYYY-MM'. */
export function prevMonthKey(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return monthKey(d);
}

/** Mese successivo. */
export function nextMonthKey(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return monthKey(d);
}

const MONTHS_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
export function formatMonth(month) {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_IT[m - 1]} ${y}`;
}

// =============================================================================
// CRUD
// =============================================================================

export async function getBudget(month) {
  const ref = doc(db, COLLECTION, month);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listBudgets() {
  const q = query(collection(db, COLLECTION), orderBy("month", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Crea o aggiorna il budget di un mese.
 * Se il mese non esiste, lo crea con budget = amount, rollover_in = quello
 * eventualmente lasciato dal mese precedente chiuso.
 */
export async function ensureBudget(month) {
  const existing = await getBudget(month);
  if (existing) return existing;

  // Cerco il mese precedente: se chiuso e con rollover_out > 0/<0, lo eredito
  let rollover_in = 0;
  try {
    const prev = await getBudget(prevMonthKey(month));
    if (prev && prev.closed && typeof prev.rollover_out === "number") {
      rollover_in = prev.rollover_out;
    }
  } catch { /* ignore */ }

  const fresh = {
    month,
    budget: 0,
    rollover_in,
    transactions: [],
    closed: false,
    rollover_out: null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  await setDoc(doc(db, COLLECTION, month), fresh);
  return { id: month, ...fresh };
}

export async function setMonthlyBudget(month, amount) {
  await ensureBudget(month);
  await updateDoc(doc(db, COLLECTION, month), {
    budget: Number(amount) || 0,
    updated_at: serverTimestamp(),
  });
}

export async function addTransaction(month, tx) {
  await ensureBudget(month);
  const b = await getBudget(month);
  const id = "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const newTx = {
    id,
    label: String(tx.label || "Spesa").slice(0, 80),
    amount: Math.round(Number(tx.amount) * 100) / 100,
    date: tx.date || new Date().toISOString().slice(0, 10),
    item_id: tx.item_id || null,
    category: tx.category || null,
    link: tx.link || null,
  };
  await updateDoc(doc(db, COLLECTION, month), {
    transactions: [...(b.transactions || []), newTx],
    updated_at: serverTimestamp(),
  });
  return newTx;
}

export async function deleteTransaction(month, txId) {
  const b = await getBudget(month);
  if (!b) return;
  const filtered = (b.transactions || []).filter(t => t.id !== txId);
  await updateDoc(doc(db, COLLECTION, month), {
    transactions: filtered,
    updated_at: serverTimestamp(),
  });
}

/**
 * Chiude un mese e decide cosa fare col delta:
 *   action = 'rollover' -> trasferisci delta al mese successivo
 *   action = 'reset'    -> azzera (delta perso/regalato)
 */
export async function closeMonth(month, action) {
  const b = await getBudget(month);
  if (!b) throw new Error("Mese non trovato");
  const summary = computeSummary(b);
  const rollover_out = action === "rollover" ? summary.delta : 0;
  await updateDoc(doc(db, COLLECTION, month), {
    closed: true,
    rollover_out,
    updated_at: serverTimestamp(),
  });
  // Crea/aggiorna il mese successivo con rollover_in
  if (action === "rollover" && rollover_out !== 0) {
    const next = nextMonthKey(month);
    const nextB = await getBudget(next);
    if (nextB) {
      await updateDoc(doc(db, COLLECTION, next), {
        rollover_in: (nextB.rollover_in || 0) + rollover_out,
        updated_at: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, COLLECTION, next), {
        month: next,
        budget: 0,
        rollover_in: rollover_out,
        transactions: [],
        closed: false,
        rollover_out: null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }
  }
  return { rollover_out };
}

/**
 * Riapre un mese chiuso (revert chiusura). Se il mese successivo aveva
 * rollover ricevuto, lo sottrae.
 */
export async function reopenMonth(month) {
  const b = await getBudget(month);
  if (!b || !b.closed) return;
  const wasRollover = b.rollover_out || 0;
  await updateDoc(doc(db, COLLECTION, month), {
    closed: false,
    rollover_out: null,
    updated_at: serverTimestamp(),
  });
  if (wasRollover !== 0) {
    const next = nextMonthKey(month);
    const nextB = await getBudget(next);
    if (nextB) {
      await updateDoc(doc(db, COLLECTION, next), {
        rollover_in: (nextB.rollover_in || 0) - wasRollover,
        updated_at: serverTimestamp(),
      });
    }
  }
}

// =============================================================================
// Summary (calcoli derivati)
// =============================================================================

export function computeSummary(budget) {
  if (!budget) return { spent: 0, available: 0, delta: 0, pct: 0 };
  const spent = (budget.transactions || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const available = (budget.budget || 0) + (budget.rollover_in || 0);
  const delta = available - spent;     // positivo = avanzo, negativo = sforamento
  const pct = available > 0 ? Math.min(100, Math.round((spent / available) * 100)) : 0;
  return {
    spent: Math.round(spent * 100) / 100,
    available: Math.round(available * 100) / 100,
    delta: Math.round(delta * 100) / 100,
    pct,
  };
}
