// =============================================================================
// Logo upload: gestione upload e cancellazione di logo personalizzati
// =============================================================================
// Storage: /logos/{timestamp}.png su Firebase Storage
// User-template ne contiene URL nei suoi overlays
// =============================================================================

import { storage, storageRef, uploadBytes, getDownloadURL, deleteObject } from "./firebase-config.js";
import { resizeImage } from "./claude-api.js";

/**
 * Upload di un logo (file da input). Lo ridimensiona a 400px max e WebP.
 * @param {File} file
 * @returns {Promise<{url, path}>}
 */
export async function uploadLogo(file) {
  // Logo va piccolo (~400px max) e con trasparenza se PNG
  // Uso resizeImage che converte in WebP/JPEG. Per loghi con trasparenza
  // l'utente puo' caricare un file gia' trasparente e si comprime.
  const { blob } = await resizeImage(file, 400, 0.85);
  const filename = `logos/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
  const ref = storageRef(storage, filename);
  await uploadBytes(ref, blob, { contentType: blob.type });
  const url = await getDownloadURL(ref);
  return { url, path: filename };
}

/** Cancella un logo da Storage (best effort). */
export async function deleteLogo(path) {
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch (err) {
    console.warn("Logo delete fallito (ok se gia' rimosso):", err);
  }
}
