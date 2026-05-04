// =============================================================================
// Calendar data layer: associa outfit a date (pianificate o indossate)
// =============================================================================
// Collezione 'calendar' su Firestore con schema:
//   { date: "2026-05-04" (string YYYY-MM-DD), outfit_id, type: "planned"|"worn", note }
// =============================================================================

import {
  db,
  collection, doc, addDoc, getDocs, deleteDoc, updateDoc,
  query, orderBy, where, serverTimestamp,
  setDoc, getDoc,
} from "./firebase-config.js";

const COLLECTION = "calendar";

/** Formatta una Date come stringa YYYY-MM-DD (locale Roma). */
export function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Lista tutte le entry del calendario (per il mese corrente o globale). */
export async function listEntries() {
  const q = query(collection(db, COLLECTION), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Aggiunge una pianificazione/indossamento per una data specifica.
 * Sovrascrive eventuale entry pre-esistente sulla stessa data.
 */
export async function setEntry(date, outfitId, type = "planned", note = null) {
  const dateKey = typeof date === "string" ? date : formatDateKey(date);
  // Cerco se esiste gia' un'entry per quella data
  const all = await listEntries();
  const existing = all.find(e => e.date === dateKey);

  const payload = {
    date: dateKey,
    outfit_id: outfitId,
    type,
    note,
    updated_at: serverTimestamp(),
  };

  if (existing) {
    await updateDoc(doc(db, COLLECTION, existing.id), payload);
    return { id: existing.id, ...payload };
  } else {
    payload.created_at = serverTimestamp();
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return { id: ref.id, ...payload };
  }
}

/** Rimuove la pianificazione di una data. */
export async function deleteEntry(date) {
  const dateKey = typeof date === "string" ? date : formatDateKey(date);
  const all = await listEntries();
  const existing = all.find(e => e.date === dateKey);
  if (existing) await deleteDoc(doc(db, COLLECTION, existing.id));
}

/** Ritorna l'entry per una data specifica (o null). */
export async function getEntry(date) {
  const dateKey = typeof date === "string" ? date : formatDateKey(date);
  const all = await listEntries();
  return all.find(e => e.date === dateKey) || null;
}

/** Conversione date -> Map<dateKey, entry> per render veloce del calendario. */
export function entriesByDate(entries) {
  const map = new Map();
  entries.forEach(e => map.set(e.date, e));
  return map;
}
