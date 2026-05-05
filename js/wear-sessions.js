// =============================================================================
// Wear sessions: registra "sto indossando questo outfit ORA" con foto live
// =============================================================================
// Schema Firestore: wear_sessions/{id}
//   - outfit_id (opzionale)
//   - item_ids: []
//   - photos: [{ url, path, timestamp }]
//   - location: { lat, lon, label } (opzionale)
//   - notes: string
//   - mood: string (opzionale, per future feature)
//   - created_at
// =============================================================================

import {
  db, storage,
  collection, doc, addDoc, getDocs, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp,
  storageRef, uploadBytes, getDownloadURL, deleteObject,
} from "./firebase-config.js";
import { resizeImage } from "./claude-api.js";

const COLLECTION = "wear_sessions";

/** Carica una foto live su Storage e ritorna {url, path}. */
export async function uploadLivePhoto(file) {
  const { blob } = await resizeImage(file, 800, 0.78);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `live/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: blob.type });
  const url = await getDownloadURL(ref);
  return { url, path, timestamp: new Date().toISOString() };
}

/** Crea una nuova wear session. */
export async function createSession(data) {
  const payload = {
    outfit_id: data.outfit_id || null,
    item_ids: data.item_ids || [],
    photos: data.photos || [],
    location: data.location || null,
    notes: data.notes || null,
    mood: data.mood || null,
    created_at: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

/** Lista delle sessioni piu' recenti. */
export async function listSessions() {
  const q = query(collection(db, COLLECTION), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Aggiunge una foto a una session esistente. */
export async function addPhotoToSession(sessionId, photo) {
  const sessions = await listSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) throw new Error("Session non trovata");
  const photos = [...(s.photos || []), photo];
  await updateDoc(doc(db, COLLECTION, sessionId), { photos });
  return photos;
}

/** Elimina session + tutte le sue foto da Storage. */
export async function deleteSession(sessionId) {
  const sessions = await listSessions();
  const s = sessions.find(x => x.id === sessionId);
  if (!s) return;
  // Cleanup foto su Storage
  for (const photo of (s.photos || [])) {
    if (photo.path) {
      try { await deleteObject(storageRef(storage, photo.path)); }
      catch (err) { console.warn("Photo delete failed:", err); }
    }
  }
  await deleteDoc(doc(db, COLLECTION, sessionId));
}
