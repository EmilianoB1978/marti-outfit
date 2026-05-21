// =============================================================================
// Background removal wrapper
// =============================================================================
// Usa @imgly/background-removal caricato dinamicamente da CDN al primo uso.
// La libreria scarica i suoi modelli ML (~30 MB) e li cacha in IndexedDB.
// Noi cachiamo i cutout finiti su Firebase Storage in modo che ogni capo
// venga processato UNA volta sola, anche cambiando dispositivo.
//
// IMPORTANTE: licenza @imgly = AGPL-3.0. OK per uso personale.
// Per commercializzare l'app sostituire questo modulo con remove.bg API,
// transformers.js, o altro provider con licenza permissiva.
// Tutto il resto dell'app non dipende dai dettagli di questo modulo.
// =============================================================================

// esm.sh risolve automaticamente i bare specifier (onnxruntime-web, ecc.)
// che jsdelivr/unpkg lasciano non risolti -> errore "Module does not resolve to URL"
const CDN_URL = "https://esm.sh/@imgly/background-removal@1.7.0";

// URL del Cloudflare Worker che fa da proxy a Hugging Face Inference API
// (modello briaai/RMBG-1.4). Same-origin del proxy Claude esistente.
const WORKER_URL = "https://marty-outfit-proxy.e-barbierato.workers.dev";

// Helper: wrappa un'eccezione con un prefisso di fase, cosi' nei toast
// vediamo ESATTAMENTE quale step della pipeline ha fallito.
class BgRemovalError extends Error {
  constructor(phase, originalErr) {
    const orig = originalErr && originalErr.message ? originalErr.message : String(originalErr || "errore sconosciuto");
    super(`[${phase}] ${orig}`);
    this.phase = phase;
    this.original = originalErr;
  }
}

// Import lazy della libreria (solo al primo uso)
let _libPromise = null;
function loadLibrary() {
  if (!_libPromise) {
    _libPromise = import(/* @vite-ignore */ CDN_URL).catch(err => {
      _libPromise = null;  // permetti retry su errore
      console.error("[bg-removal] import lib failed", err);
      throw new BgRemovalError("import-lib", err);
    });
  }
  return _libPromise;
}

/**
 * Pre-carica il modello (chiamabile da un "Prepara editor" CTA).
 * @param {function} onProgress - callback opzionale (0..1)
 */
export async function preload(onProgress) {
  let lib;
  try {
    lib = await loadLibrary();
  } catch (e) { throw e; }  // gia' wrappato

  // Trigger del download modello con un'immagine 1x1 dummy
  let dummyBlob;
  try {
    dummyBlob = await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==").then(r => r.blob());
  } catch (err) {
    throw new BgRemovalError("preload-dummy", err);
  }

  try {
    return await lib.removeBackground(dummyBlob, {
      progress: (key, current, total) => {
        if (onProgress) onProgress(current / total);
      }
    });
  } catch (err) {
    console.error("[bg-removal] preload model failed", err);
    throw new BgRemovalError("preload-model", err);
  }
}

/**
 * Rimuove lo sfondo da un'immagine. Restituisce un Blob PNG con trasparenza.
 * @param {string} imageUrl - URL della foto originale
 * @param {function} onProgress - callback opzionale (0..1)
 * @returns {Promise<Blob>}
 */
export async function removeBackground(imageUrl, onProgress) {
  // Fase 1: carica la libreria @imgly via dynamic import
  let lib;
  try {
    lib = await loadLibrary();
  } catch (e) { throw e; }  // gia' wrappato come [import-lib]

  // Fase 2: scarica l'immagine sorgente (Firebase Storage URL)
  let inputBlob;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    inputBlob = await response.blob();
  } catch (err) {
    console.error("[bg-removal] fetch image failed", err, imageUrl);
    throw new BgRemovalError("fetch-image", err);
  }

  // Fase 3: esegue il modello ONNX (scaricato in IndexedDB al primo uso)
  try {
    return await lib.removeBackground(inputBlob, {
      progress: (key, current, total) => {
        if (onProgress) onProgress(current / total);
      },
      // Modello small: piu' veloce, qualita' OK per vestiti su sfondo semplice
      model: "small",
      output: { format: "image/png", quality: 0.9 },
    });
  } catch (err) {
    console.error("[bg-removal] inference failed", err);
    throw new BgRemovalError("inference", err);
  }
}

/**
 * Rimuove lo sfondo server-side via Cloudflare Worker + Hugging Face
 * Inference API (modello briaai/RMBG-1.4).
 *
 * Vantaggi vs client-side @imgly:
 * - Non scarica 30 MB di modello sul dispositivo
 * - Funziona affidabile su iOS PWA (no limiti memoria/ONNX runtime)
 * - Stessa qualita' o superiore di @imgly small
 *
 * Costo: gratis per uso personale (HF free tier: ~300 immagini/ora).
 *
 * @param {string} imageUrl - URL pubblico (es. Firebase Storage)
 * @param {function} onProgress - callback opzionale (0..1) per UX
 * @returns {Promise<Blob>} PNG cutout con trasparenza
 */
export async function removeBackgroundServer(imageUrl, onProgress) {
  // Step di progresso: 0 = invio, 0.2 = HF carica modello, 1 = done
  if (onProgress) onProgress(0.05);

  let response;
  try {
    response = await fetch(`${WORKER_URL}/remove-bg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl }),
    });
  } catch (err) {
    throw new BgRemovalError("server-network", err);
  }

  if (onProgress) onProgress(0.85);

  if (!response.ok) {
    // Il Worker restituisce errori come JSON; provo a parsare per messaggio chiaro
    let detail = "";
    try {
      const j = await response.json();
      detail = j.error || JSON.stringify(j);
    } catch {
      try { detail = await response.text(); } catch { detail = ""; }
    }
    throw new BgRemovalError(
      `server-${response.status}`,
      new Error(detail || `HTTP ${response.status}`)
    );
  }

  const blob = await response.blob();
  if (onProgress) onProgress(1);
  return blob;
}

/**
 * Wrapper smart: prova prima server-side (rapido, leggero), se fallisce
 * cade su client-side @imgly. Pensato per uso real-time da PWA.
 */
export async function removeBackgroundSmart(imageUrl, onProgress) {
  try {
    return await removeBackgroundServer(imageUrl, onProgress);
  } catch (serverErr) {
    console.warn("[bg-removal] server failed, falling back to client", serverErr);
    // Fallback al client-side solo se il server e' irraggiungibile o non
    // configurato. Per altri errori (HTTP 4xx/5xx con dettaglio) preferiamo
    // propagare l'errore originale: di solito e' piu' utile.
    const phase = serverErr.phase || "";
    if (phase === "server-network" || phase === "server-503") {
      try {
        return await removeBackground(imageUrl, onProgress);
      } catch (clientErr) {
        // Se entrambi falliscono, butta su l'errore server (piu' informativo)
        throw serverErr;
      }
    }
    throw serverErr;
  }
}
