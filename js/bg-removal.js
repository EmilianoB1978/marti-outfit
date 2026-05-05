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

// Import lazy della libreria (solo al primo uso)
let _libPromise = null;
function loadLibrary() {
  if (!_libPromise) {
    _libPromise = import(/* @vite-ignore */ CDN_URL).catch(err => {
      _libPromise = null;  // permetti retry su errore
      throw err;
    });
  }
  return _libPromise;
}

/**
 * Pre-carica il modello (chiamabile da un "Prepara editor" CTA).
 * @param {function} onProgress - callback opzionale (0..1)
 */
export async function preload(onProgress) {
  const lib = await loadLibrary();
  // Trigger del download modello con un'immagine 1x1 dummy
  const dummyBlob = await fetch("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==").then(r => r.blob());
  return lib.removeBackground(dummyBlob, {
    progress: (key, current, total) => {
      if (onProgress) onProgress(current / total);
    }
  });
}

/**
 * Rimuove lo sfondo da un'immagine. Restituisce un Blob PNG con trasparenza.
 * @param {string} imageUrl - URL della foto originale
 * @param {function} onProgress - callback opzionale (0..1)
 * @returns {Promise<Blob>}
 */
export async function removeBackground(imageUrl, onProgress) {
  const lib = await loadLibrary();

  // Scarico l'immagine come blob (la libreria accetta blob, file, URL)
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Errore caricamento foto: ${response.status}`);
  const inputBlob = await response.blob();

  return lib.removeBackground(inputBlob, {
    progress: (key, current, total) => {
      if (onProgress) onProgress(current / total);
    },
    // Modello small: piu' veloce, qualita' OK per vestiti su sfondo semplice
    model: "small",
    output: { format: "image/png", quality: 0.9 },
  });
}
