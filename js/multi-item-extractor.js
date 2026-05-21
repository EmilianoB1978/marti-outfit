// =============================================================================
// Multi-item extractor (v2 — image generation)
// =============================================================================
// Date una foto di outfit completo (persona vestita) e la lista di garments
// rilevati da Claude (con tag + image_prompt), GENERA per ogni capo una nuova
// immagine fotorealistica isolata su sfondo trasparente via OpenAI gpt-image-1.
//
// Differenze vs v1 (crop + bg-removal):
// - Niente bounding box: usa il modello AI con prompt visivo dettagliato
// - Output = foto-prodotto e-commerce (stile flat-lay / invisible mannequin)
//   anziche' "pezzo di persona estratto dalla foto"
// - Lo stesso risultato che produce ChatGPT con il tool "estrai capi"
//
// Pipeline per ogni garment:
//   1. Upload della foto outfit completa su Firebase (UNA volta, condivisa)
//   2. POST /generate-garment al Worker con { imageUrl, prompt } del capo
//   3. Salva il PNG generato in items/<id>.png (Firebase Storage)
//   4. Caller riceve { photo_url, photo_path, cutout_blob, tags }
//      (photo_url e cutout_url coincidono: l'output e' gia' pulito)
//
// IMPORTANTE: il file ritorna i blob + le URL Storage. Il caller decide se:
//   - Creare l'item (salva photo_url che e' gia' su Storage)
//   - Scartare il capo (deve cancellare via cleanup)
// =============================================================================

import { storage, storageRef, uploadBytes, getDownloadURL, deleteObject } from "./firebase-config.js";

const WORKER_URL = "https://marty-outfit-proxy.e-barbierato.workers.dev";
const GENERATE_GARMENT_ENDPOINT = WORKER_URL + "/generate-garment";

/**
 * Carica un Blob immagine su Firebase Storage in items/.
 */
async function uploadBlob(blob, extHint = "jpg") {
  const ext = (blob.type && blob.type.includes("png")) ? "png" : extHint;
  const filename = `items/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const ref = storageRef(storage, filename);
  await uploadBytes(ref, blob, { contentType: blob.type || "image/jpeg" });
  const url = await getDownloadURL(ref);
  return { url, path: filename };
}

/**
 * Provider di image generation per /generate-garment.
 * - 'cf' (default): Cloudflare Workers AI flux-1-schnell. Gratuito, solo prompt.
 * - 'openai': OpenAI gpt-image-1. Pagato, vede la foto outfit come reference.
 * Per cambiare globalmente, modifica DEFAULT_PROVIDER.
 */
const DEFAULT_PROVIDER = "cf";

/**
 * Chiama /generate-garment per generare la foto-prodotto del capo.
 * Ritorna il Blob PNG generato.
 */
async function generateGarmentImage(outfitUrl, prompt, options = {}) {
  const provider = options.provider || DEFAULT_PROVIDER;
  const quality = options.quality || "low";
  const res = await fetch(GENERATE_GARMENT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl: outfitUrl, prompt, provider, quality }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.error || JSON.stringify(j);
    } catch {
      try { detail = await res.text(); } catch { detail = ""; }
    }
    throw new Error(`Worker /generate-garment HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }

  return res.blob();
}

/**
 * Cancella una foto da Firebase Storage (best-effort).
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
 * Estrae N capi da una foto outfit.
 * Pipeline: 1 upload foto outfit + N chiamate /generate-garment.
 *
 * @param {Blob} outfitBlob - la foto outfit originale (resized)
 * @param {Array} garments - lista da Claude analyzeOutfit() con image_prompt
 * @param {function} onItemProgress - (index, total, label, result?)
 * @returns {Promise<Array<{photo_url, photo_path, cutout_blob, tags, error?}>>}
 */
export async function extractAll(outfitBlob, garments, onItemProgress = () => {}) {
  // Step 0: upload della foto outfit SOLO se provider 'openai' (vede la foto
  // come reference). Per 'cf' (flux-schnell, text-to-image) e' inutile.
  let outfit = null;
  let tempOutfitPath = null;
  if (DEFAULT_PROVIDER === "openai") {
    onItemProgress(-1, garments.length, "📤 Upload foto outfit");
    outfit = await uploadBlob(outfitBlob, "jpg");
    tempOutfitPath = outfit.path;
  }

  const results = [];

  for (let i = 0; i < garments.length; i++) {
    const garment = garments[i];
    try {
      onItemProgress(i, garments.length, "🎨 Generazione AI");

      const prompt = garment.image_prompt
        || `${garment.subcategory || garment.category || "garment"}, ${(garment.color_primary || []).join(" ")}, ${(garment.material || []).join(" ")}, ${(garment.pattern || []).join(" ")}`;

      const generatedBlob = await generateGarmentImage(outfit ? outfit.url : null, prompt);

      onItemProgress(i, garments.length, "📤 Salvataggio");
      const { url, path } = await uploadBlob(generatedBlob, "png");

      // Tag senza image_prompt (e' un dato runtime, non lo salviamo sull'item)
      const { image_prompt, ...tags } = garment;

      const result = {
        photo_url: url,
        photo_path: path,
        // L'output e' gia' un PNG con sfondo trasparente: lo riuso come cutout.
        cutout_blob: generatedBlob,
        tags,
      };
      results.push(result);
      onItemProgress(i, garments.length, "ok", result);
    } catch (err) {
      console.error(`[multi-item] capo ${i + 1} fallito:`, err);
      const errorResult = {
        error: err.message || String(err),
        tags: garment,
      };
      results.push(errorResult);
      onItemProgress(i, garments.length, "errore", errorResult);
    }
    // Throttle leggero tra le chiamate OpenAI (rate limit Tier 1 e' largo,
    // ma evitiamo burst).
    if (i < garments.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Cleanup della foto outfit temporanea (solo se l'avevamo uploadata)
  if (tempOutfitPath) {
    await deleteStoragePath(tempOutfitPath);
  }

  return results;
}
