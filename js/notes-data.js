// =============================================================================
// Notes: modello + CRUD Firestore
// =============================================================================
// Collection 'notes' (un doc per nota). Tipi supportati:
//   - 'free'      = nota libera (titolo + body + foto)
//   - 'wishlist'  = capo desiderato (label, link, prezzo target, foto)
//   - 'tailor'    = sarta/ritocchi (capo, modifica, preventivo, data ritiro)
//   - 'moodboard' = mood board look (foto multiple + tag)
//   - 'gift'      = regali (persona, occasione, idee, budget, deadline)
//
// I campi opzionali per ogni tipo stanno in 'data: {...}' (Firestore amico
// degli oggetti annidati). I campi base (title, body, tags, pinned, foto)
// restano top-level e validi per tutti i tipi.
// =============================================================================

import {
  db, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp, storageRef, uploadBytes,
  getDownloadURL, deleteObject, storage,
} from "./firebase-config.js";

const COLLECTION = "notes";

export const NOTE_TYPES = [
  { key: "free",      icon: "📝",  label: "Nota libera",     desc: "Testo, foto, checklist" },
  { key: "wishlist",  icon: "🛍️",  label: "Wishlist capo",    desc: "Capo desiderato + alert prezzo" },
  { key: "tailor",    icon: "✂️",  label: "Sarta / Ritocchi", desc: "Capo, modifica, preventivo, ritiro" },
  { key: "moodboard", icon: "💄",  label: "Mood board",       desc: "Ispirazioni look con foto" },
  { key: "gift",      icon: "🎁",  label: "Regali",           desc: "Persona, idea, budget, deadline" },
];

// =============================================================================
// CRUD
// =============================================================================

export async function listNotes() {
  // Pinned prima (desc su pinned_at), poi cronologico desc
  const q = query(collection(db, COLLECTION), orderBy("pinned_at", "desc"));
  let docs = [];
  try {
    const snap = await getDocs(q);
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    // Fallback: senza orderBy se mancano gli indici
    const snap = await getDocs(collection(db, COLLECTION));
    docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  // Sort defensivo: pinned prima (con pinned_at desc), poi updated_at desc
  return docs.sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    const ka = pinKey(a) || updKey(a) || "";
    const kb = pinKey(b) || updKey(b) || "";
    return kb.localeCompare(ka);
  });
}

function pinKey(n) {
  return n.pinned_at?.seconds ? String(n.pinned_at.seconds) : null;
}
function updKey(n) {
  return n.updated_at?.seconds ? String(n.updated_at.seconds) :
         n.created_at?.seconds ? String(n.created_at.seconds) : null;
}

export async function getNote(id) {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function createNote(data) {
  const payload = {
    type:        data.type || "free",
    title:       String(data.title || "").slice(0, 120),
    body:        data.body || "",
    pinned:      !!data.pinned,
    pinned_at:   data.pinned ? serverTimestamp() : null,
    tags:        Array.isArray(data.tags) ? data.tags : [],
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    data:        data.data || {},   // payload specifico per tipo
    created_at:  serverTimestamp(),
    updated_at:  serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

export async function updateNote(id, partial) {
  const upd = { ...partial, updated_at: serverTimestamp() };
  // Gestione pin: se viene cambiato 'pinned', aggiorna anche 'pinned_at'
  if ("pinned" in partial) {
    upd.pinned_at = partial.pinned ? serverTimestamp() : null;
  }
  await updateDoc(doc(db, COLLECTION, id), upd);
}

export async function deleteNote(id) {
  // Cancella anche eventuali allegati su Storage
  const note = await getNote(id);
  if (note && Array.isArray(note.attachments)) {
    for (const a of note.attachments) {
      if (a.path) {
        try { await deleteObject(storageRef(storage, a.path)); } catch {}
      }
    }
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

// =============================================================================
// Allegati (Storage)
// =============================================================================
/**
 * Upload di una foto allegata a una nota. Compressione client-side a max 1600px.
 * @returns {Promise<{url, path, type, name}>}
 */
export async function uploadAttachment(blob, name = "attachment.jpg") {
  const compressed = await compressImage(blob, 1600);
  const ext = (compressed.type === "image/png" ? "png" : "jpg");
  const path = `notes/attach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, compressed, { contentType: compressed.type });
  const url = await getDownloadURL(ref);
  return { url, path, type: compressed.type, name };
}

async function compressImage(blob, maxSide) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.width, h = img.height;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const tw = Math.round(w * scale);
      const th = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = tw; canvas.height = th;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, tw, th);
      canvas.toBlob(b => resolve(b || blob), "image/jpeg", 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

// =============================================================================
// Search & filter
// =============================================================================

/**
 * Search full-text client-side (case-insensitive, accent-insensitive).
 * Match su: title, body, tags, data fields stringati.
 */
export function searchNotes(notes, q) {
  const needle = normalize(q);
  if (!needle) return notes;
  return notes.filter(n => {
    const haystack = normalize([
      n.title,
      n.body,
      ...(n.tags || []),
      JSON.stringify(n.data || {}),
    ].filter(Boolean).join(" "));
    return haystack.includes(needle);
  });
}

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Estrae tutti i tag distinti dalla lista di note. */
export function extractAllTags(notes) {
  const set = new Set();
  for (const n of notes) {
    for (const t of (n.tags || [])) {
      if (t && t.trim()) set.add(t.trim());
    }
  }
  return Array.from(set).sort();
}
