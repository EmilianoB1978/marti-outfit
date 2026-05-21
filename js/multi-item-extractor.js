// =============================================================================
// Multi-item extractor
// =============================================================================
// Date una foto di outfit completo (persona vestita) e la lista di garments
// rilevati da Claude (con bbox + tag), estrae N capi separati con sfondo
// rimosso, pronti per essere salvati come item indipendenti nel guardaroba.
//
// Pipeline per ogni garment:
//   1. Crop locale (canvas) usando il bbox normalizzato
//   2. Upload del crop come foto sorgente su Firebase (tmp/extracted/)
//   3. POST al Worker /remove-bg per ottenere il cutout con sfondo trasparente
//   4. (Caller: presenta in review modal, salva quelli selezionati)
//
// IMPORTANTE: il file ritorna i blob + le URL Storage. Il caller decide se:
//   - Creare l'item (salva il photo_url che e' gia' su Storage)
//   - Scartare il capo (deve cancellare la photo dallo Storage via cleanup)
// =============================================================================

import { storage, storageRef, uploadBytes, getDownloadURL, deleteObject } from "./firebase-config.js";

const WORKER_URL = "https://marty-outfit-proxy.e-barbierato.workers.dev";
const REMOVE_BG_ENDPOINT = WORKER_URL + "/remove-bg";

// Padding aggiunto attorno al bbox (in proporzione, 0-1) per evitare crop
// troppo stretti che taglino bordi del capo.
const BBOX_PADDING = 0.03;

/**
 * Crea un'immagine HTMLImageElement da una sorgente blob: o https:
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Caricamento immagine fallito"));
    img.src = src;
  });
}

/**
 * Crop di una porzione di immagine secondo bbox normalizzato [x, y, w, h].
 * Ritorna un Blob JPEG (qualita' 92%).
 */
async function cropToBlob(sourceUrl, bbox) {
  const img = await loadImage(sourceUrl);

  const [nx, ny, nw, nh] = bbox;
  // Padding + clamp ai bordi
  const x = Math.max(0, nx - BBOX_PADDING) * img.naturalWidth;
  const y = Math.max(0, ny - BBOX_PADDING) * img.naturalHeight;
  const w = Math.min(1 - nx + BBOX_PADDING, nw + BBOX_PADDING * 2) * img.naturalWidth;
  const h = Math.min(1 - ny + BBOX_PADDING, nh + BBOX_PADDING * 2) * img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Crop fallito"));
    }, "image/jpeg", 0.92);
  });
}

/**
 * Upload di un blob immagine su Firebase Storage nel folder degli items.
 * Ritorna { url, path }.
 */
async function uploadCropBlob(blob) {
  const filename = `items/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const ref = storageRef(storage, filename);
  await uploadBytes(ref, blob, { contentType: blob.type || "image/jpeg" });
  const url = await getDownloadURL(ref);
  return { url, path: filename };
}

/**
 * Chiama il Worker /remove-bg passando una URL pubblica (Firebase Storage).
 * Ritorna il Blob PNG cutout.
 */
async function removeBackgroundServer(imageUrl) {
  const res = await fetch(REMOVE_BG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl })
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.error || JSON.stringify(j);
    } catch {
      try { detail = await res.text(); } catch { detail = ""; }
    }
    throw new Error(`Worker /remove-bg HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  return res.blob();
}

/**
 * Cancella una foto da Firebase Storage (best-effort, non lancia errori).
 * Usato per cleanup quando l'utente scarta un capo non confermato.
 */
export async function deleteStoragePath(path) {
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch (err) {
    console.warn("[multi-item] cleanup storage failed:", path, err);
  }
}

/**
 * Estrae un singolo capo: crop + upload + bg-removal.
 *
 * @param {string} sourceUrl - URL della foto outfit intera (blob: o https:)
 * @param {object} garment - oggetto da Claude { bbox, category, ... }
 * @param {function} onProgress - callback (label: string) per UI feedback
 * @returns {Promise<{photo_url, photo_path, cutout_blob, tags}>}
 */
async function extractOne(sourceUrl, garment, onProgress = () => {}) {
  if (!Array.isArray(garment.bbox) || garment.bbox.length !== 4) {
    throw new Error("Garment senza bbox valido");
  }

  onProgress("📐 Ritaglio");
  const cropBlob = await cropToBlob(sourceUrl, garment.bbox);

  onProgress("📤 Upload");
  const { url, path } = await uploadCropBlob(cropBlob);

  onProgress("✨ Rimozione sfondo");
  const cutoutBlob = await removeBackgroundServer(url);

  // Estraggo i tag (tutti i campi tranne bbox)
  const { bbox, ...tags } = garment;

  return {
    photo_url: url,
    photo_path: path,
    cutout_blob: cutoutBlob,
    tags,
  };
}

/**
 * Estrae N capi da una foto outfit in batch sequenziale (rispetta rate limit
 * remove.bg di 1 req/sec).
 *
 * @param {string} sourceUrl - URL della foto outfit (blob: o https:)
 * @param {Array} garments - lista da Claude (da analyzeOutfit())
 * @param {function} onItemProgress - callback (index, total, label, result?) per UI
 * @returns {Promise<Array<{photo_url, photo_path, cutout_blob, tags, error?}>>}
 */
export async function extractAll(sourceUrl, garments, onItemProgress = () => {}) {
  const results = [];

  for (let i = 0; i < garments.length; i++) {
    const garment = garments[i];
    try {
      onItemProgress(i, garments.length, "in corso");
      const r = await extractOne(sourceUrl, garment, (lbl) => {
        onItemProgress(i, garments.length, lbl);
      });
      results.push(r);
      onItemProgress(i, garments.length, "ok", r);
    } catch (err) {
      console.error(`[multi-item] capo ${i + 1} fallito:`, err);
      results.push({
        error: err.message || String(err),
        tags: garment,
      });
      onItemProgress(i, garments.length, "errore", { error: err.message });
    }
    // Rate limit safety: 1.2s tra una chiamata e l'altra (free tier remove.bg
    // permette 1 req/sec, ma meglio non rasentare il limite)
    if (i < garments.length - 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  return results;
}
