// =============================================================================
// Share outfit: orchestratore generazione card + caption + share sheet iOS
// =============================================================================
// La generazione visiva e' delegata a js/share-templates.js (4 stili).
// Il template scelto e le opzioni sono passati via parametro options.
// =============================================================================

import { renderWithTemplate, DEFAULT_TEMPLATE } from "./share-templates.js";

const CANVAS_SIZE = 1080;

/**
 * Carica un'immagine da URL come <img> ready-to-draw.
 * Risolve CORS per Firebase Storage URL (sono CORS-OK).
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// =============================================================================
// Caption auto-generata con link
// =============================================================================
function buildCaption(outfit, items, options = {}) {
  const lines = [];
  const title = options.customTitle || outfit.title || "Outfit del giorno";
  lines.push(`✨ ${title}`);
  if (outfit.context) lines.push(`📍 Per: ${outfit.context}`);
  lines.push("");

  // Lista capi
  for (const it of items) {
    const cat = it.subcategory || it.category || "Capo";
    const color = it.color_primary || it.color || "";
    const desc = color ? `${cat} ${color}` : cat;
    lines.push(`• ${desc}`);
  }

  // Sezione link (solo capi con link valido)
  if (options.includeLinks !== false) {
    const withLinks = items.filter(it => it.link_url);
    if (withLinks.length > 0) {
      lines.push("");
      lines.push("🛍️ Shop the look:");
      for (const it of withLinks) {
        const cat = it.subcategory || it.category || "Capo";
        lines.push(`${cat}: ${it.link_url}`);
      }
    }
  }

  // Hashtag
  if (options.includeHashtags !== false) {
    lines.push("");
    lines.push("#outfit #ootd #lookoftheday #fashion #martyoutfit");
  }

  return lines.join("\n");
}

// =============================================================================
// API pubblica
// =============================================================================

/**
 * Genera la card outfit (con il template scelto), prepara la caption,
 * e mostra il share sheet iOS.
 *
 * @param {object} outfit - { title, context, item_ids }
 * @param {Array} allItems - array completo dei capi del guardaroba
 * @param {object} options - {
 *   template: 'classic'|'dark'|'pastel'|'magazine' (default: classic),
 *   customTitle: string (opzionale, override outfit.title),
 *   includeDate: boolean (default true),
 *   includeWatermark: boolean (default true),
 *   includeLinks: boolean (default true),
 *   includeHashtags: boolean (default true),
 * }
 */
export async function shareOutfit(outfit, allItems, options = {}) {
  const items = (outfit.item_ids || [])
    .map(id => allItems.find(it => it.id === id))
    .filter(Boolean);
  if (items.length === 0) throw new Error("Nessun capo valido nell'outfit");

  // Carica le immagini in parallelo
  const itemsWithPhotos = items.filter(it => it.photo_url).slice(0, 6);
  const images = await Promise.all(
    itemsWithPhotos.map(it => loadImage(it.photo_url).catch(() => null))
  );

  // Renderizza il canvas con il template scelto
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  await renderWithTemplate(
    options.template || DEFAULT_TEMPLATE,
    canvas,
    { outfit, items, images },
    options
  );

  const caption = buildCaption(outfit, items, options);

  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Generazione immagine fallita");

  // Web Share API (iOS Safari supporta share di file da iOS 15+)
  const file = new File([blob], `outfit-${Date.now()}.jpg`, { type: "image/jpeg" });
  const shareData = { title: outfit.title || "Outfit", text: caption, files: [file] };

  if (navigator.canShare && navigator.canShare(shareData) && navigator.share) {
    try {
      await navigator.share(shareData);
      return { method: "share" };
    } catch (err) {
      if (err.name === "AbortError") return { method: "cancelled" };
    }
  }

  return downloadAndCopyFallback(blob, caption);
}

/**
 * Genera SOLO la preview (ritorna dataURL) per la modale di scelta template.
 * Non condivide niente.
 */
export async function generatePreview(outfit, allItems, options = {}) {
  const items = (outfit.item_ids || [])
    .map(id => allItems.find(it => it.id === id))
    .filter(Boolean);
  if (items.length === 0) return null;

  const itemsWithPhotos = items.filter(it => it.photo_url).slice(0, 6);
  const images = await Promise.all(
    itemsWithPhotos.map(it => loadImage(it.photo_url).catch(() => null))
  );

  // Render a dimensione ridotta per la preview (300×300 anziche' 1080)
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  await renderWithTemplate(
    options.template || DEFAULT_TEMPLATE,
    canvas,
    { outfit, items, images },
    options
  );

  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Fallback: scarica l'immagine + copia caption negli appunti.
 */
async function downloadAndCopyFallback(blob, caption) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `outfit-${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  try {
    await navigator.clipboard.writeText(caption);
    return { method: "fallback", clipboardOk: true };
  } catch {
    return { method: "fallback", clipboardOk: false, caption };
  }
}
