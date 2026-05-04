// =============================================================================
// Capsules: gestione collezioni tematiche di capi (CRUD su Firestore)
// =============================================================================

import {
  db,
  collection, doc, addDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "./firebase-config.js";

const COLLECTION = "capsules";

/** Lista tutte le capsule, ordinate per data creazione DESC. */
export async function listCapsules() {
  const q = query(collection(db, COLLECTION), orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Crea una nuova capsule.
 * @param {object} data - { name, icon, accent_color, item_ids }
 */
export async function createCapsule(data) {
  const payload = {
    name: data.name || "Senza nome",
    icon: data.icon || "🎒",
    accent_color: data.accent_color || "#d4af37",
    item_ids: Array.isArray(data.item_ids) ? data.item_ids : [],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

/** Aggiorna una capsule esistente. */
export async function updateCapsule(id, data) {
  const payload = { ...data, updated_at: serverTimestamp() };
  delete payload.created_at;
  delete payload.id;
  await updateDoc(doc(db, COLLECTION, id), payload);
}

/** Elimina una capsule. I capi non vengono toccati. */
export async function deleteCapsule(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Aggiunge/rimuove un item dall'array item_ids di una capsule. */
export async function toggleItemInCapsule(capsuleId, itemId, currentItemIds) {
  const exists = currentItemIds.includes(itemId);
  const newIds = exists
    ? currentItemIds.filter(x => x !== itemId)
    : [...currentItemIds, itemId];
  await updateCapsule(capsuleId, { item_ids: newIds });
  return newIds;
}
