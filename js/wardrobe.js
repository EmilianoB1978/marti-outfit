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

// Default per i campi nuovi (Fase 3 - lazy migration in memoria)
const ITEM_DEFAULTS = {
  wear_count:    0,
  last_worn_at:  null,
  wear_history:  [],
  price:         null,
};

/** Applica i default a un capo letto dal DB. NON scrive su DB (lazy). */
function ensureDefaults(item) {
  for (const [k, v] of Object.entries(ITEM_DEFAULTS)) {
    if (item[k] === undefined) item[k] = v;
  }
  return item;
}

/**
 * Carica tutti i capi del guardaroba, ordinati per data di creazione DESC.
 * Applica default per campi nuovi (wear_count, ecc.) ai vecchi record.
 */
export async function listItems() {
  const q = query(collection(db, COLLECTION), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ensureDefaults({ id: d.id, ...d.data() }));
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
    // Tracking (Fase 3) - inizializzati a default
    wear_count:   0,
    last_worn_at: null,
    wear_history: [],
    price:        data.price ?? null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

// ============================================================================
// Wear tracking (Fase 3)
// ============================================================================

/**
 * Marca un capo come "indossato oggi": incrementa wear_count, aggiorna
 * last_worn_at, push su wear_history. Salva su Firestore.
 */
export async function markItemAsWorn(id, currentItem) {
  const now = new Date().toISOString();
  const newCount = (currentItem.wear_count || 0) + 1;
  const newHistory = [...(currentItem.wear_history || []), now];

  await updateDoc(doc(db, COLLECTION, id), {
    wear_count: newCount,
    last_worn_at: now,
    wear_history: newHistory,
    updated_at: serverTimestamp(),
  });

  return { wear_count: newCount, last_worn_at: now, wear_history: newHistory };
}

/**
 * Carica il cutout (PNG con bg trasparente) su Storage e aggiorna l'item.
 * Usato dall'outfit editor visuale (bg-removal.js).
 * @param {string} itemId
 * @param {Blob} cutoutBlob - PNG con trasparenza
 * @returns {Promise<string>} URL pubblico del cutout
 */
export async function uploadAndSaveCutout(itemId, cutoutBlob) {
  const path = `cutouts/${itemId}.png`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, cutoutBlob, { contentType: "image/png" });
  const url = await getDownloadURL(ref);
  await updateDoc(doc(db, COLLECTION, itemId), {
    cutout_url: url,
    cutout_path: path,
    updated_at: serverTimestamp(),
  });
  return url;
}

/**
 * Marca un intero outfit come indossato: incrementa wear_count su ogni
 * capo dell'outfit. Esegue le update in parallelo.
 */
export async function markOutfitAsWorn(itemIds, allItems) {
  const now = new Date().toISOString();
  const itemMap = new Map(allItems.map(it => [it.id, it]));

  const updates = itemIds
    .map(id => itemMap.get(id))
    .filter(Boolean)
    .map(item => {
      const newCount = (item.wear_count || 0) + 1;
      const newHistory = [...(item.wear_history || []), now];
      return updateDoc(doc(db, COLLECTION, item.id), {
        wear_count: newCount,
        last_worn_at: now,
        wear_history: newHistory,
        updated_at: serverTimestamp(),
      });
    });

  await Promise.all(updates);
  return now;
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
