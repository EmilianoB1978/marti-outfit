// =============================================================================
// Outfit: generazione + persistenza outfit salvati
// =============================================================================

import {
  db,
  collection, doc, addDoc, getDocs, deleteDoc,
  query, orderBy, serverTimestamp
} from "./firebase-config.js";

const COLLECTION = "outfits";

/**
 * Lista degli outfit salvati, piu' recenti prima.
 */
export async function listSavedOutfits() {
  const q = query(collection(db, COLLECTION), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Salva un outfit suggerito dall'AI nella collezione preferiti.
 * @param {object} outfit - { title, description, item_ids[], context }
 */
export async function saveOutfit(outfit) {
  const payload = {
    title: outfit.title || "Outfit",
    description: outfit.description || null,
    item_ids: outfit.item_ids || [],
    context: outfit.context || null,
    created_at: serverTimestamp()
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

/**
 * Elimina un outfit salvato.
 */
export async function deleteSavedOutfit(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}
