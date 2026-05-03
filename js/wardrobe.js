// =============================================================================
// Wardrobe: gestione capi (CRUD su Firestore + Storage)
// =============================================================================

import {
  db, storage,
  collection, doc, addDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
  storageRef, uploadBytes, getDownloadURL, deleteObject
} from "./firebase-config.js";

const COLLECTION = "items";

/**
 * Carica tutti i capi del guardaroba, ordinati per data di creazione DESC.
 */
export async function listItems() {
  const q = query(collection(db, COLLECTION), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Carica un capo specifico. Non usato spesso (la lista e' gia' in memoria).
 */
export async function getItem(id) {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDocs(query(collection(db, COLLECTION)));
  const found = snap.docs.find(d => d.id === id);
  return found ? { id: found.id, ...found.data() } : null;
}

/**
 * Carica una foto su Firebase Storage e ritorna l'URL pubblico.
 * @param {Blob} blob - immagine ridimensionata
 * @returns {Promise<{url, path}>}
 */
export async function uploadPhoto(blob) {
  const filename = `items/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const ref = storageRef(storage, filename);
  await uploadBytes(ref, blob, { contentType: "image/jpeg" });
  const url = await getDownloadURL(ref);
  return { url, path: filename };
}

/**
 * Crea un nuovo capo. Riceve oggetto gia' completo.
 */
export async function createItem(data) {
  const payload = {
    photo_url: data.photo_url || null,
    photo_path: data.photo_path || null,  // ci serve per cancellare il file
    category: data.category || null,
    color: data.color || null,
    style: data.style || null,
    season: data.season || [],            // array
    occasion: data.occasion || null,
    notes: data.notes || null,
    description: data.description || null, // descrizione AI (opzionale)
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

/**
 * Aggiorna un capo esistente.
 */
export async function updateItem(id, data) {
  const ref = doc(db, COLLECTION, id);
  const payload = { ...data, updated_at: serverTimestamp() };
  // Non sovrascrivere created_at
  delete payload.created_at;
  await updateDoc(ref, payload);
}

/**
 * Elimina un capo + la foto associata su Storage.
 */
export async function deleteItem(id, photoPath) {
  // Prima cancello la foto (se fallisce non blocco la cancellazione del record)
  if (photoPath) {
    try {
      await deleteObject(storageRef(storage, photoPath));
    } catch (err) {
      console.warn("Foto non cancellata da Storage:", err);
    }
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Filtra una lista di capi secondo un set di filtri attivi.
 * Filter shape: { category?: string, season?: string, style?: string }
 */
export function filterItems(items, filters) {
  return items.filter(it => {
    if (filters.category && it.category !== filters.category) return false;
    if (filters.style && it.style !== filters.style) return false;
    if (filters.season) {
      const seasons = Array.isArray(it.season) ? it.season : [];
      if (!seasons.includes(filters.season)) return false;
    }
    return true;
  });
}
