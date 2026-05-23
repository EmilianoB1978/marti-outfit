// =============================================================================
// Outfit: generazione + persistenza outfit salvati
// =============================================================================

import {
  db, storage,
  collection, doc, addDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
  storageRef, uploadBytes, getDownloadURL,
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
 * Aggiorna un outfit salvato esistente. Accetta un patch parziale (solo i
 * campi da modificare). Aggiunge automaticamente updated_at = serverTimestamp.
 */
export async function updateSavedOutfit(id, patch) {
  const cleaned = { ...patch, updated_at: serverTimestamp() };
  // Firestore non accetta undefined: trasformo in null
  for (const k of Object.keys(cleaned)) {
    if (cleaned[k] === undefined) cleaned[k] = null;
  }
  await updateDoc(doc(db, COLLECTION, id), cleaned);
}

/**
 * Elimina un outfit salvato.
 */
export async function deleteSavedOutfit(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Salva un outfit visuale (creato con il drag&drop editor).
 * @param {object} data - { title, layout, item_ids, compositeBlob }
 * @returns {Promise<object>} l'outfit salvato
 */
export async function saveVisualOutfit(data) {
  // Carico l'immagine composita su Storage
  const compositePath = `outfits/composite_${Date.now()}.png`;
  const ref = storageRef(storage, compositePath);
  await uploadBytes(ref, data.compositeBlob, { contentType: "image/png" });
  const compositeUrl = await getDownloadURL(ref);

  const payload = {
    title: data.title || "Outfit visuale",
    description: data.description || null,
    item_ids: data.item_ids || [],
    context: data.context || null,
    is_visual: true,
    composite_url: compositeUrl,
    composite_path: compositePath,
    layout: data.layout || [],
    created_at: serverTimestamp(),
  };
  const docRef = await addDoc(collection(db, COLLECTION), payload);
  return { id: docRef.id, ...payload };
}
