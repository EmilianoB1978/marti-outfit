// =============================================================================
// Share outfit: genera Outfit Card 1080×1080 Instagram-ready + caption
// =============================================================================
// Usa Canvas API + Web Share API native iOS. Niente AI, niente librerie.
// =============================================================================

const CANVAS_SIZE = 1080;
const PADDING = 60;

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

/**
 * Genera il Canvas 1080×1080 con la card outfit.
 * Layout:
 *   - Header con titolo + data
 *   - Grid foto capi (2-6 capi, layout adattivo)
 *   - Footer con watermark "Marty Outfit"
 */
async function buildOutfitCard(outfit, items) {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");

  // ========== Background (gradient sfondo soft) ==========
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_SIZE);
  grad.addColorStop(0, "#fafafa");
  grad.addColorStop(1, "#f0f0f0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // ========== Header ==========
  // Titolo
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.font = "bold 56px -apple-system, sans-serif";
  ctx.fillText(truncate(outfit.title || "Outfit", 28), CANVAS_SIZE / 2, 100);

  // Data
  ctx.fillStyle = "#888";
  ctx.font = "300 30px -apple-system, sans-serif";
  ctx.fillText(formatDateIT(new Date()), CANVAS_SIZE / 2, 150);

  // Linea decorativa oro
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(CANVAS_SIZE / 2 - 60, 175);
  ctx.lineTo(CANVAS_SIZE / 2 + 60, 175);
  ctx.stroke();

  // ========== Grid capi ==========
  // Carico tutte le immagini in parallelo
  const itemsWithPhotos = items.filter(i => i.photo_url).slice(0, 6);
  const imgs = await Promise.all(
    itemsWithPhotos.map(it => loadImage(it.photo_url).catch(() => null))
  );

  drawItemsGrid(ctx, imgs, itemsWithPhotos);

  // ========== Footer watermark ==========
  ctx.fillStyle = "#aaa";
  ctx.textAlign = "center";
  ctx.font = "300 26px -apple-system, sans-serif";
  ctx.fillText("✨ made with Marty Outfit", CANVAS_SIZE / 2, CANVAS_SIZE - 40);

  return canvas;
}

/** Disegna i capi in una griglia adattiva (1, 2, 3, 4, 5, 6 elementi). */
function drawItemsGrid(ctx, imgs, items) {
  const validImgs = imgs.filter(Boolean);
  const n = validImgs.length;
  if (n === 0) {
    ctx.fillStyle = "#bbb";
    ctx.font = "200 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("👕", CANVAS_SIZE / 2, CANVAS_SIZE / 2);
    return;
  }

  // Layout: scelgo righe×colonne in base al count
  const layouts = {
    1: { cols: 1, rows: 1 },
    2: { cols: 2, rows: 1 },
    3: { cols: 3, rows: 1 },
    4: { cols: 2, rows: 2 },
    5: { cols: 3, rows: 2 },  // 1 cell vuota
    6: { cols: 3, rows: 2 },
  };
  const { cols, rows } = layouts[n];

  // Area disponibile (sotto header, sopra footer)
  const areaTop = 220;
  const areaBottom = CANVAS_SIZE - 110;
  const areaHeight = areaBottom - areaTop;
  const areaWidth = CANVAS_SIZE - PADDING * 2;

  const gap = 24;
  const cellW = (areaWidth - gap * (cols - 1)) / cols;
  const cellH = (areaHeight - gap * (rows - 1)) / rows;

  validImgs.forEach((img, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = PADDING + col * (cellW + gap);
    const y = areaTop + row * (cellH + gap);

    // Sfondo card capo
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, cellW, cellH);

    // Foto (cover, mantenendo proporzioni)
    drawImageCover(ctx, img, x, y, cellW, cellH);

    // Border sottile
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cellW, cellH);
  });
}

/** Disegna un'immagine in modalita' "cover" dentro un rettangolo. */
function drawImageCover(ctx, img, x, y, w, h) {
  const ratio = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / ratio;
  const sh = h / ratio;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

// =============================================================================
// Caption auto-generata con link
// =============================================================================
function buildCaption(outfit, items) {
  const lines = [];
  lines.push(`✨ ${outfit.title || "Outfit del giorno"}`);
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
  const withLinks = items.filter(it => it.link_url);
  if (withLinks.length > 0) {
    lines.push("");
    lines.push("🛍️ Shop the look:");
    for (const it of withLinks) {
      const cat = it.subcategory || it.category || "Capo";
      lines.push(`${cat}: ${it.link_url}`);
    }
  }

  // Hashtag
  lines.push("");
  lines.push("#outfit #ootd #lookoftheday #fashion #martyoutfit");

  return lines.join("\n");
}

// =============================================================================
// API pubblica
// =============================================================================

/**
 * Genera la card outfit, prepara la caption, e mostra il share sheet iOS.
 * Fallback: se Web Share non e' supportato, scarica l'immagine + copia caption.
 *
 * @param {object} outfit - { title, context, item_ids }
 * @param {Array} allItems - array completo dei capi del guardaroba
 */
export async function shareOutfit(outfit, allItems) {
  // Risolvi gli item dell'outfit
  const items = (outfit.item_ids || [])
    .map(id => allItems.find(it => it.id === id))
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error("Nessun capo valido nell'outfit");
  }

  // Genera card + caption in parallelo
  const canvas = await buildOutfitCard(outfit, items);
  const caption = buildCaption(outfit, items);

  // Converti canvas -> Blob
  const blob = await new Promise(resolve =>
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Generazione immagine fallita");

  // Web Share API (iOS Safari supporta share di file da iOS 15+)
  const file = new File([blob], `outfit-${Date.now()}.jpg`, { type: "image/jpeg" });
  const shareData = {
    title: outfit.title || "Outfit",
    text: caption,
    files: [file],
  };

  if (navigator.canShare && navigator.canShare(shareData) && navigator.share) {
    try {
      await navigator.share(shareData);
      return { method: "share" };
    } catch (err) {
      if (err.name === "AbortError") return { method: "cancelled" };
      // Fallback se share fallisce
    }
  }

  // Fallback: download + copia clipboard
  return downloadAndCopyFallback(blob, caption);
}

/**
 * Fallback: scarica l'immagine + copia caption negli appunti.
 */
async function downloadAndCopyFallback(blob, caption) {
  // Download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `outfit-${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  // Clipboard
  try {
    await navigator.clipboard.writeText(caption);
    return { method: "fallback", clipboardOk: true };
  } catch {
    return { method: "fallback", clipboardOk: false, caption };
  }
}

// =============================================================================
// Utility
// =============================================================================
function formatDateIT(d) {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit", month: "long", year: "numeric"
  });
}
function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
