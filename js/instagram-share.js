// =============================================================================
// Direct Share to Instagram Stories (iOS deep link)
// =============================================================================
// Limitazioni Meta:
// - Posting al feed Instagram NON e' possibile dal browser (serve Graph API
//   + account Business + Facebook Page + token OAuth + review approval).
// - Stories: deep link 'instagram-stories://share' apre Instagram con la
//   nostra immagine come background, l'utente tappa "Condividi" e pubblica.
//
// Requisiti:
// - L'app Instagram deve essere installata sul dispositivo
// - iOS Safari + iOS 14.5+ (Info.plist whitelist instagram-stories)
// - L'immagine va passata come data: URL (base64) — Instagram non accetta blob:
// =============================================================================

/**
 * Apre Instagram Stories con un'immagine PNG pronta come background.
 * @param {Blob} blob - immagine PNG/JPEG
 * @param {object} [opts]
 * @param {string} [opts.backgroundTop]    - es. "#1a1a1a"
 * @param {string} [opts.backgroundBottom] - es. "#d4af37"
 * @returns {Promise<boolean>} true se il deep link e' stato aperto, false se non supportato
 */
export async function shareToInstagramStories(blob, opts = {}) {
  if (!isInstagramSupported()) return false;

  // Converti il blob in data: URL (Instagram non accetta blob: URL)
  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl) return false;

  // Costruisci deep link
  const params = new URLSearchParams({
    source_application: "marty-outfit-pwa",
    backgroundImage: dataUrl,
  });
  if (opts.backgroundTop) params.set("backgroundTopColor", opts.backgroundTop);
  if (opts.backgroundBottom) params.set("backgroundBottomColor", opts.backgroundBottom);

  const url = `instagram-stories://share?${params.toString()}`;

  // Apri l'URL: iOS Safari riconosce instagram-stories:// e lancia l'app
  // Se l'app non e' installata, NON succede nulla (silenzioso).
  // Per detection installata vs no, non c'e' modo affidabile da web -> sempre tentiamo.
  window.location.href = url;
  return true;
}

/**
 * Heuristic: e' supportato lo schema instagram-stories?
 * - iOS Safari (incluse PWA installate): sì
 * - Android Chrome: parzialmente (Instagram funziona via Web Share API native)
 * - Desktop: no
 */
export function isInstagramSupported() {
  const ua = navigator.userAgent || "";
  // iOS / iPadOS
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPad iOS 13+ si maschera come Mac, ma ha touch
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch { resolve(null); }
  });
}
