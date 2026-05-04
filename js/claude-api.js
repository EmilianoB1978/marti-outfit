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

/**
 * Ridimensiona un'immagine a max 1024px lato lungo e ritorna base64.
 * Riduce drasticamente il costo Claude (token immagine) e l'upload Firebase.
 */
export async function resizeImage(file, maxSize = 1024, quality = 0.85) {
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

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Conversione canvas fallita"));
          // Ritorno sia il blob (per upload) che il base64 (per Claude)
          const r2 = new FileReader();
          r2.onload = () => resolve({
            blob,
            base64: r2.result.split(",")[1],  // strip "data:image/jpeg;base64,"
            mimeType: "image/jpeg"
          });
          r2.onerror = reject;
          r2.readAsDataURL(blob);
        },
        "image/jpeg",
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
