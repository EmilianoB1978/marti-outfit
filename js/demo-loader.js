// =============================================================================
// Demo loader: carica/rimuove i 30 capi demo da Firestore
// =============================================================================
// Usa addDoc direttamente per controllo completo del payload (incluso is_demo).
// Le foto sono URL Unsplash esterni: createItem normale di wardrobe.js fa anche
// lo Storage upload, qui invece bypasso e salvo solo il record Firestore.
// =============================================================================

import {
  db,
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, serverTimestamp,
} from "./firebase-config.js";

import { DEMO_ITEMS } from "./demo-data.js";

const COLLECTION = "items";

/**
 * Carica i 30 capi demo. Skip se gia' caricati (controllo via query is_demo).
 * @param {function} onProgress - callback (current, total) opzionale
 * @returns {Promise<{ added, skipped }>}
 */
export async function loadDemo(onProgress) {
  const existingDemo = await countDemo();
  if (existingDemo > 0) {
    return { added: 0, skipped: existingDemo, alreadyLoaded: true };
  }

  let added = 0;
  for (let i = 0; i < DEMO_ITEMS.length; i++) {
    const item = DEMO_ITEMS[i];
    const payload = {
      // Tutti i campi del capo
      ...item,
      // Marker e timestamps
      is_demo: true,
      photo_path: null,            // foto esterna, niente storage path
      wear_count: 0,
      last_worn_at: null,
      wear_history: [],
      cutout_url: null,
      cutout_path: null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    await addDoc(collection(db, COLLECTION), payload);
    added++;
    if (onProgress) onProgress(added, DEMO_ITEMS.length);
  }

  return { added, skipped: 0, alreadyLoaded: false };
}

/**
 * Rimuove tutti i capi marcati is_demo=true.
 * Le foto sono esterne (Unsplash), nessun cleanup Storage necessario.
 */
export async function removeDemo(onProgress) {
  const q = query(collection(db, COLLECTION), where("is_demo", "==", true));
  const snap = await getDocs(q);

  let removed = 0;
  const total = snap.docs.length;

  for (const d of snap.docs) {
    await deleteDoc(doc(db, COLLECTION, d.id));
    removed++;
    if (onProgress) onProgress(removed, total);
  }

  return { removed };
}

/** Conta i capi demo presenti (per UI status). */
export async function countDemo() {
  const q = query(collection(db, COLLECTION), where("is_demo", "==", true));
  const snap = await getDocs(q);
  return snap.docs.length;
}
