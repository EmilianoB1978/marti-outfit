// =============================================================================
// Claude API client
// =============================================================================
// Questo modulo NON chiama Claude direttamente: parla con il nostro
// Cloudflare Worker (proxy/worker.js) che custodisce la API key.
// Vedi README.md per il setup del Worker.
// =============================================================================

// URL del Cloudflare Worker che fa da proxy alla Claude API
const WORKER_URL = "https://marty-outfit-proxy.e-barbierato.workers.dev";

const isWorkerConfigured = !WORKER_URL.includes("TUONOME");

// Feature detect WebP (iOS Safari 14+, tutti i browser moderni)
const _webpSupported = (() => {
  try {
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    return c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch { return false; }
})();

/**
 * Ridimensiona un'immagine e la comprime in WebP (con fallback JPEG).
 * Default: 800px lato lungo, qualita' 0.78. Tipico: ~80-100 KB per foto capo.
 *
 * Riduce ~50-65% lo storage Firebase rispetto a JPEG q=0.85@1024px,
 * mantenendo qualita' visiva indistinguibile per il grid 2-3 colonne.
 *
 * @returns {{ blob, base64, mimeType, sizeKB }}
 */
export async function resizeImage(file, maxSize = 800, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => { img.src = e.target.result; };
    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = (height * maxSize) / width;
        width = maxSize;
      } else if (height > maxSize) {
        width = (width * maxSize) / height;
        height = maxSize;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // Preferisci WebP, fallback JPEG (browser molto vecchi)
      const mime = _webpSupported ? "image/webp" : "image/jpeg";

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Conversione canvas fallita"));
          const r2 = new FileReader();
          r2.onload = () => resolve({
            blob,
            base64: r2.result.split(",")[1],
            mimeType: mime,
            sizeKB: Math.round(blob.size / 1024),
          });
          r2.onerror = reject;
          r2.readAsDataURL(blob);
        },
        mime,
        quality
      );
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Analizza una foto di un capo e suggerisce i tag.
 * @param {string} base64Image - immagine in base64 (no data URI prefix)
 * @returns {Promise<{category, color, style, season, occasion, description}>}
 */
export async function analyzeGarment(base64Image) {
  if (!isWorkerConfigured) {
    throw new Error("Cloudflare Worker non configurato. Modifica js/claude-api.js");
  }

  const response = await fetch(`${WORKER_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image, mimeType: "image/jpeg" })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Analisi fallita: ${err}`);
  }

  const data = await response.json();
  return data.tags;  // { category, color, style, season[], occasion, description }
}

/**
 * Analizza una foto di outfit completo (persona vestita) e ritorna la lista
 * dei capi rilevati con bounding box (normalizzati 0-1) + tag di catalogazione.
 *
 * @param {string} base64Image - foto outfit (preferibilmente resize a 1024px max)
 * @returns {Promise<{garments: Array<{bbox:number[], category, subcategory, ...}>}>}
 */
export async function analyzeOutfit(base64Image) {
  if (!isWorkerConfigured) {
    throw new Error("Cloudflare Worker non configurato. Modifica js/claude-api.js");
  }

  const response = await fetch(`${WORKER_URL}/analyze-outfit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Image, mimeType: "image/jpeg" })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Analisi outfit fallita: ${err}`);
  }

  return response.json();  // { garments: [...] }
}

/**
 * Genera 2-3 outfit per un contesto dato i capi disponibili.
 * Manda al Worker SOLO i metadati (no foto): risparmia token e tempo.
 * @param {string} context - es. "cena informale"
 * @param {Array} items - array di capi { id, category, color, style, season, occasion }
 * @param {string|null} weather - optional, es. "Meteo oggi: Pioggia leggera, 8-14°C"
 * @returns {Promise<Array<{title, description, item_ids}>>}
 */
export async function suggestOutfits(context, items, weather = null) {
  if (!isWorkerConfigured) {
    throw new Error("Cloudflare Worker non configurato. Modifica js/claude-api.js");
  }

  // Invio solo i campi rilevanti per l'analisi (no foto, no note)
  const slim = items.map(it => ({
    id: it.id,
    category: it.category,
    color: it.color,
    style: it.style,
    season: it.season,
    occasion: it.occasion
  }));

  const response = await fetch(`${WORKER_URL}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, items: slim, weather })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Suggerimento fallito: ${err}`);
  }

  const data = await response.json();
  return data.outfits;  // [{ title, description, item_ids: [...] }]
}

export { isWorkerConfigured };
