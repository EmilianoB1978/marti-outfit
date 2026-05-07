// Diary data layer: CRUD Firestore + reverse lookup capi indossati per data
// USP: e' l'unico diario che ricorda automaticamente cosa indossavi.
//
// Document ID = YYYY-MM-DD (una entry al giorno, idempotente per data)
// Schema:
//   date          string YYYY-MM-DD (= id)
//   title         string
//   body          string (HTML rich text)
//   mood          string (emoji)
//   weather       string (emoji|sintetico)
//   tags          string[]
//   photos        [{url, path}]
//   created_at    timestamp
//   updated_at    timestamp

import { db, storage } from "./firebase-config.js";
import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy,
  Timestamp, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const COL = "diary";

export const MOODS = [
  { key: "happy",     emoji: "😊", label: "Felice" },
  { key: "love",      emoji: "🥰", label: "Innamorata" },
  { key: "calm",      emoji: "😌", label: "Tranquilla" },
  { key: "energetic", emoji: "💪", label: "Carica" },
  { key: "thoughtful",emoji: "🤔", label: "Pensierosa" },
  { key: "sad",       emoji: "🥺", label: "Triste" },
  { key: "angry",     emoji: "😤", label: "Arrabbiata" },
  { key: "tired",     emoji: "😴", label: "Stanca" },
  { key: "excited",   emoji: "🤩", label: "Entusiasta" },
  { key: "stressed",  emoji: "😰", label: "Stressata" },
];

// Util ---------------------------------------------------------------

export function dateToId(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayId() {
  return dateToId(new Date());
}

export function idToDate(id) {
  // YYYY-MM-DD -> Date locale (mezzanotte)
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatItalianDate(id) {
  const d = idToDate(id);
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// CRUD ---------------------------------------------------------------

export async function listEntries() {
  const q = query(collection(db, COL), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getEntry(id) {
  const ref = doc(db, COL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getOrCreateEntry(id) {
  const existing = await getEntry(id);
  if (existing) return existing;
  const data = {
    date: id,
    title: "",
    body: "",
    mood: null,
    weather: null,
    tags: [],
    photos: [],
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };
  await setDoc(doc(db, COL, id), data);
  return { id, ...data };
}

export async function updateEntry(id, patch) {
  const data = { ...patch, updated_at: Timestamp.now() };
  await updateDoc(doc(db, COL, id), data);
}

export async function deleteEntry(id) {
  // Cancella anche foto su Storage
  const e = await getEntry(id);
  if (e?.photos?.length) {
    for (const p of e.photos) {
      if (p.path) {
        try { await deleteObject(storageRef(storage, p.path)); } catch (_) {}
      }
    }
  }
  await deleteDoc(doc(db, COL, id));
}

// Storage allegati ---------------------------------------------------

export async function uploadDiaryPhoto(blob) {
  const path = `diary/photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: blob.type || "image/jpeg" });
  const url = await getDownloadURL(ref);
  return { url, path };
}

export async function removeDiaryPhoto(path) {
  if (!path) return;
  try { await deleteObject(storageRef(storage, path)); } catch (_) {}
}

// Outfit del giorno (reverse lookup wardrobe.wear_history) -----------
//
// Restituisce l'array di capi indossati nel giorno specificato.
// Si appoggia a wardrobe items che hanno wear_history come array di
// timestamp/iso. Filtra ogni capo cercando una entry il cui giorno
// coincide con dateId.

export function findWornGarments(allItems, dateId) {
  if (!Array.isArray(allItems)) return [];
  const target = dateId; // YYYY-MM-DD
  return allItems.filter(g => {
    const hist = g.wear_history;
    if (!Array.isArray(hist) || hist.length === 0) return false;
    return hist.some(ts => {
      try {
        let d;
        if (ts?.seconds) d = new Date(ts.seconds * 1000);
        else if (typeof ts === "string") d = new Date(ts);
        else if (ts instanceof Date) d = ts;
        else if (typeof ts === "number") d = new Date(ts);
        else return false;
        return dateToId(d) === target;
      } catch (_) { return false; }
    });
  });
}

// Mood streak / stats ------------------------------------------------

export function computeStreak(entries) {
  // Streak = giorni consecutivi a ritroso da oggi con entry non vuota
  if (!Array.isArray(entries) || entries.length === 0) return 0;
  const has = new Set(entries.map(e => e.id));
  let streak = 0;
  let cur = new Date();
  while (true) {
    const id = dateToId(cur);
    if (!has.has(id)) break;
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

export function moodCounts(entries) {
  const out = {};
  for (const e of entries) {
    if (e.mood) out[e.mood] = (out[e.mood] || 0) + 1;
  }
  return out;
}
