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

// Default per i campi opzionali aggiunti nel tempo (Fase 3, 6, link)
// Lazy migration: applicati in memoria al fetch, scritti su DB solo
// quando l'utente modifica esplicitamente.
const ITEM_DEFAULTS = {
  // Fase 3 - wear tracking
  wear_count:    0,
  last_worn_at:  null,
  wear_history:  [],
  price:         null,
  // Fase 6 - auto-tagging migliorato
  subcategory:    null,
  color_primary:  null,
  color_secondary: null,
  pattern:        null,
  material:       null,
  formality:      null,  // 1-5
  cutout_url:     null,  // gia' usato da editor visuale (Fase 4)
  cutout_path:    null,
  // Link prodotto + alert scadenza
  link_url:       null,
  link_added_at:  null,  // ISO string di quando il link e' stato impostato
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
 * Usa l'estensione e il content-type corretti in base al tipo del blob
 * (WebP per i browser moderni, JPEG fallback).
 * @param {Blob} blob - immagine compressa
 * @returns {Promise<{url, path}>}
 */
export async function uploadPhoto(blob) {
  const isWebP = blob.type === "image/webp";
  const ext = isWebP ? "webp" : "jpg";
  const filename = `items/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const ref = storageRef(storage, filename);
  await uploadBytes(ref, blob, { contentType: blob.type || "image/jpeg" });
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
    // Tracking (Fase 3)
    wear_count:   0,
    last_worn_at: null,
    wear_history: [],
    price:        data.price ?? null,
    // Auto-tagging migliorato (Fase 6)
    subcategory:    data.subcategory     || null,
    color_primary:  data.color_primary   || data.color || null,
    color_secondary: data.color_secondary || null,
    pattern:        data.pattern  || null,
    material:       data.material || null,
    formality:      data.formality ?? null,
    // Link prodotto
    link_url:       data.link_url || null,
    link_added_at:  data.link_url ? new Date().toISOString() : null,
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
 * Comprimi un PNG con alpha in WebP per ridurre dimensione (~60%).
 * Mantiene trasparenza, qualita' percepibile identica.
 */
async function compressPngToWebp(pngBlob, quality = 0.85) {
  // Se il browser non supporta WebP con alpha, ritorno il PNG originale
  try {
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    if (!c.toDataURL("image/webp").startsWith("data:image/webp")) {
      return pngBlob;
    }
  } catch { return pngBlob; }

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(pngBlob);
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob(blob => {
      // Se WebP fallisce, ritorno il PNG originale
      resolve(blob || pngBlob);
    }, "image/webp", quality);
  });
}

/**
 * Carica il cutout (con bg trasparente) su Storage e aggiorna l'item.
 * Comprime in WebP per risparmiare ~60% spazio rispetto al PNG sorgente.
 * @param {string} itemId
 * @param {Blob} cutoutBlob - PNG con trasparenza dal motore bg-removal
 * @returns {Promise<string>} URL pubblico del cutout
 */
export async function uploadAndSaveCutout(itemId, cutoutBlob) {
  const compressed = await compressPngToWebp(cutoutBlob);
  const isWebP = compressed.type === "image/webp";
  const ext = isWebP ? "webp" : "png";
  const path = `cutouts/${itemId}.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, compressed, { contentType: compressed.type || "image/png" });
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
 * Elimina un capo + foto + cutout (se esistono) da Storage.
 * Foto e cutout sono best-effort: se falliscono il record viene comunque rimosso.
 */
export async function deleteItem(id, photoPath, cutoutPath) {
  // Foto principale
  if (photoPath) {
    try { await deleteObject(storageRef(storage, photoPath)); }
    catch (err) { console.warn("Foto non cancellata:", err); }
  }
  // Cutout (PNG creato dall'editor visuale, se l'utente l'ha mai aperto)
  if (cutoutPath) {
    try { await deleteObject(storageRef(storage, cutoutPath)); }
    catch (err) { console.warn("Cutout non cancellato:", err); }
  }
  await deleteDoc(doc(db, COLLECTION, id));
}

/**
 * Statistiche storage: numero foto + cutout + dimensione stimata.
 * NB: la dimensione e' stimata client-side (HEAD request via fetch sui URL),
 * Firebase Storage non espone size via SDK senza Admin. Per evitare 100+
 * fetch, restituiamo solo i counter e una stima (foto avg 100KB, cutout 200KB).
 */
export async function getStorageStats() {
  const items = await listItems();
  const photoCount = items.filter(i => i.photo_url).length;
  const cutoutCount = items.filter(i => i.cutout_url).length;
  // Stime conservative basate sulla compressione attuale
  const photoEstimateKB = photoCount * 100;
  const cutoutEstimateKB = cutoutCount * 200;
  return {
    photoCount,
    cutoutCount,
    estimatedKB: photoEstimateKB + cutoutEstimateKB,
    estimatedMB: ((photoEstimateKB + cutoutEstimateKB) / 1024).toFixed(1),
  };
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
