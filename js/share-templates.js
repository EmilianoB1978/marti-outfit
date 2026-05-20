// =============================================================================
// Share templates: 8 built-in + custom builder con aspect ratio, pattern,
// overlays multipli (text/sticker/logo)
// =============================================================================

// Default canvas (per built-in, sempre 1:1)
const DEFAULT_SIZE = 1080;

// Aspect ratios disponibili
export const ASPECTS = {
  "1:1":  { width: 1080, height: 1080, label: "Quadrato (post)" },
  "4:5":  { width: 1080, height: 1350, label: "Verticale (post)" },
  "9:16": { width: 1080, height: 1920, label: "Stories (9:16)" },
};

// =============================================================================
// FILTRI FOTO
// =============================================================================
export const PHOTO_FILTERS = {
  none:     { label: "Nessuno",   css: "none" },
  bw:       { label: "B&W",       css: "grayscale(1)" },
  sepia:    { label: "Sepia",     css: "sepia(0.85) brightness(1.05)" },
  warm:     { label: "Caldo",     css: "saturate(1.25) hue-rotate(10deg)" },
  cool:     { label: "Freddo",    css: "saturate(1.1) hue-rotate(-15deg) brightness(1.03)" },
  vibrant:  { label: "Vivido",    css: "saturate(1.5) contrast(1.1)" },
  vintage:  { label: "Vintage",   css: "sepia(0.4) contrast(1.1) saturate(0.85)" },
  fade:     { label: "Sbiadito",  css: "saturate(0.6) contrast(0.95) brightness(1.05)" },
};

export const FONT_FAMILIES = {
  system:   '-apple-system, BlinkMacSystemFont, sans-serif',
  serif:    'Georgia, "Times New Roman", serif',
  display:  '"Playfair Display", Georgia, serif',
  mono:     '"SF Mono", Menlo, monospace',
  cursive:  '"Brush Script MT", cursive',
};

// =============================================================================
// PATTERN PRESETS
// =============================================================================
export const PATTERNS = {
  none:    { label: "Nessuno" },
  dots:    { label: "Pois" },
  stripes: { label: "Righe orizzontali" },
  diag:    { label: "Diagonali" },
  grid:    { label: "Griglia" },
  waves:   { label: "Onde" },
  hearts:  { label: "Cuori" },
};

function paintPattern(ctx, w, h, type, color, density = 30) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  if (type === "dots") {
    for (let y = density / 2; y < h; y += density) {
      for (let x = density / 2; x < w; x += density) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  } else if (type === "stripes") {
    ctx.lineWidth = 1;
    for (let y = density; y < h; y += density) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else if (type === "diag") {
    ctx.lineWidth = 1;
    const diagSpacing = density * 0.7;
    for (let i = -h; i < w + h; i += diagSpacing) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  } else if (type === "grid") {
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += density) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let x = 0; x < w; x += density) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  } else if (type === "waves") {
    ctx.lineWidth = 1.5;
    for (let y = density; y < h; y += density) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const yy = y + Math.sin(x / 24) * 6;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  } else if (type === "hearts") {
    ctx.font = `${density * 0.65}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    for (let y = density; y < h; y += density * 1.4) {
      const offset = (Math.floor(y / (density * 1.4)) % 2) * (density / 2);
      for (let x = density / 2 + offset; x < w; x += density * 1.4) {
        ctx.fillText("♡", x, y);
      }
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================
function drawImage(ctx, img, x, y, w, h, opts = {}) {
  const radius = opts.radius || 0;
  const filter = opts.filter || "none";
  const rotation = opts.rotation || 0;

  ctx.save();
  if (rotation) {
    ctx.translate(x + w/2, y + h/2);
    ctx.rotate(rotation);
    ctx.translate(-(x + w/2), -(y + h/2));
  }
  if (radius > 0) { roundRect(ctx, x, y, w, h, radius); ctx.clip(); }
  else { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); }

  ctx.filter = filter;
  const ratio = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / ratio, sh = h / ratio;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatDateIT(d = new Date()) {
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function gridLayout(n) {
  return ({
    1: { cols: 1, rows: 1 }, 2: { cols: 2, rows: 1 }, 3: { cols: 3, rows: 1 },
    4: { cols: 2, rows: 2 }, 5: { cols: 3, rows: 2 }, 6: { cols: 3, rows: 2 },
  })[Math.min(n, 6)];
}

function drawGrid(ctx, imgs, cfg) {
  const valid = imgs.filter(Boolean);
  if (valid.length === 0) return;
  const { cols, rows } = gridLayout(valid.length);
  const padLeft = cfg.padLeft ?? cfg.padding;
  const padRight = cfg.padRight ?? cfg.padding;
  const W = cfg.canvasWidth || DEFAULT_SIZE;
  const areaWidth = W - padLeft - padRight;
  const areaHeight = cfg.bottom - cfg.top;
  const gap = cfg.gap;
  const cellW = (areaWidth - gap * (cols - 1)) / cols;
  const cellH = (areaHeight - gap * (rows - 1)) / rows;
  const radius = cfg.radius || 0;
  const borderWidth = cfg.borderWidth || 2;

  valid.forEach((img, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = padLeft + col * (cellW + gap);
    const y = cfg.top + row * (cellH + gap);

    if (cfg.bg) {
      ctx.fillStyle = cfg.bg;
      if (radius > 0) { roundRect(ctx, x, y, cellW, cellH, radius); ctx.fill(); }
      else ctx.fillRect(x, y, cellW, cellH);
    }
    if (cfg.shadow) {
      ctx.save();
      ctx.shadowColor = cfg.shadowColor || "rgba(0,0,0,0.15)";
      ctx.shadowBlur = cfg.shadowBlur || 12;
      ctx.shadowOffsetY = 4;
      if (radius > 0) { roundRect(ctx, x, y, cellW, cellH, radius); ctx.fillStyle = "#fff"; ctx.fill(); }
      else { ctx.fillStyle = "#fff"; ctx.fillRect(x, y, cellW, cellH); }
      ctx.restore();
    }
    drawImage(ctx, img, x, y, cellW, cellH, { radius, filter: cfg.filter });
    if (cfg.border) {
      ctx.strokeStyle = cfg.border;
      ctx.lineWidth = borderWidth;
      if (radius > 0) { roundRect(ctx, x, y, cellW, cellH, radius); ctx.stroke(); }
      else ctx.strokeRect(x, y, cellW, cellH);
    }
  });
}

// =============================================================================
// OVERLAYS RENDERING (text, sticker, logo)
// =============================================================================

// Position presets (chiave -> {x, y} in 0..1 normalizzati)
export const POSITIONS = {
  "tl": [0.05, 0.05], "tc": [0.5, 0.05], "tr": [0.95, 0.05],
  "ml": [0.05, 0.5],  "mc": [0.5, 0.5],  "mr": [0.95, 0.5],
  "bl": [0.05, 0.95], "bc": [0.5, 0.95], "br": [0.95, 0.95],
};
export const POSITION_LABELS = {
  "tl":"↖", "tc":"↑", "tr":"↗", "ml":"←", "mc":"·", "mr":"→",
  "bl":"↙", "bc":"↓", "br":"↘",
};

function alignFromPosition(pos) {
  if (pos.endsWith("l")) return "left";
  if (pos.endsWith("r")) return "right";
  return "center";
}
function baselineFromPosition(pos) {
  if (pos.startsWith("t")) return "top";
  if (pos.startsWith("b")) return "alphabetic";
  return "middle";
}

async function renderOverlays(ctx, canvas, overlays = []) {
  const W = canvas.width, H = canvas.height;
  for (const overlay of overlays) {
    if (!overlay || overlay.disabled) continue;
    const [px, py] = POSITIONS[overlay.position || "bc"];
    let x = px * W, y = py * H;
    // Adjust for safe margins on edges
    if (overlay.position?.startsWith("t")) y = Math.max(y, 60);
    if (overlay.position?.startsWith("b")) y = Math.min(y, H - 60);

    ctx.save();
    if (overlay.rotation) {
      ctx.translate(x, y);
      ctx.rotate(overlay.rotation);
      ctx.translate(-x, -y);
    }

    if (overlay.type === "text") {
      const size = overlay.size || 36;
      const font = (overlay.italic ? "italic " : "")
        + (overlay.weight || "600") + " "
        + size + "px " + (FONT_FAMILIES[overlay.font] || FONT_FAMILIES.system);
      ctx.font = font;
      ctx.fillStyle = overlay.color || "#000";
      ctx.textAlign = alignFromPosition(overlay.position || "bc");
      ctx.textBaseline = baselineFromPosition(overlay.position || "bc");
      // Optional outline
      if (overlay.outline) {
        ctx.lineWidth = (size * 0.08);
        ctx.strokeStyle = overlay.outlineColor || "#fff";
        ctx.strokeText(overlay.text || "", x, y);
      }
      ctx.fillText(overlay.text || "", x, y);
    } else if (overlay.type === "sticker") {
      const size = overlay.size || 80;
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = alignFromPosition(overlay.position || "tr");
      ctx.textBaseline = baselineFromPosition(overlay.position || "tr");
      ctx.fillText(overlay.emoji || "✨", x, y);
    } else if (overlay.type === "logo" && overlay.imageUrl) {
      try {
        const img = await loadImageCached(overlay.imageUrl);
        const w = overlay.size || 120;
        const aspect = img.naturalHeight / img.naturalWidth;
        const h = w * aspect;
        const align = alignFromPosition(overlay.position || "br");
        const baseline = baselineFromPosition(overlay.position || "br");
        let drawX = x, drawY = y;
        if (align === "center") drawX -= w / 2;
        else if (align === "right") drawX -= w;
        if (baseline === "middle") drawY -= h / 2;
        else if (baseline === "alphabetic") drawY -= h;
        ctx.globalAlpha = overlay.opacity ?? 0.9;
        ctx.drawImage(img, drawX, drawY, w, h);
        ctx.globalAlpha = 1;
      } catch (err) {
        console.warn("Logo load failed:", err);
      }
    } else if (overlay.type === "shape") {
      const size = overlay.size || 60;
      ctx.fillStyle = overlay.color || "#d4af37";
      if (overlay.shape === "circle") {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (overlay.shape === "square") {
        ctx.fillRect(x - size/2, y - size/2, size, size);
      } else if (overlay.shape === "line") {
        ctx.strokeStyle = overlay.color || "#d4af37";
        ctx.lineWidth = overlay.thickness || 4;
        ctx.beginPath();
        ctx.moveTo(x - size/2, y);
        ctx.lineTo(x + size/2, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

// Cache immagini logo (evita ricaricamenti)
const _imageCache = new Map();
async function loadImageCached(url) {
  if (_imageCache.has(url)) return _imageCache.get(url);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
  _imageCache.set(url, img);
  return img;
}

// =============================================================================
// TEMPLATE BUILT-IN (tutti 1:1, 1080x1080)
// =============================================================================

async function renderClassic(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, "#fafafa"); grad.addColorStop(1, "#f0ebde");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "center";
  ctx.font = "bold 56px " + FONT_FAMILIES.system;
  ctx.fillText(truncate(title, 28), SIZE / 2, 100);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888"; ctx.font = "300 30px " + FONT_FAMILIES.system;
    ctx.fillText(formatDateIT(), SIZE / 2, 150);
  }
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(SIZE/2 - 60, 175); ctx.lineTo(SIZE/2 + 60, 175); ctx.stroke();

  drawGrid(ctx, data.images, {
    canvasWidth: SIZE,
    top: 220, bottom: SIZE - 110, padding: 60, gap: 24,
    bg: "#ffffff", border: "#e0e0e0", filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#aaa"; ctx.textAlign = "center";
    ctx.font = "300 26px " + FONT_FAMILIES.system;
    ctx.fillText("✨ made with Marti Outfit", SIZE / 2, SIZE - 40);
  }
}

async function renderDark(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, "#1a1a1a"); grad.addColorStop(1, "#2e2e2e");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#d4af37"; ctx.textAlign = "center";
  ctx.font = "bold 60px " + FONT_FAMILIES.display;
  ctx.fillText(truncate(title, 26), SIZE / 2, 110);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888"; ctx.font = "italic 300 28px " + FONT_FAMILIES.serif;
    ctx.fillText(formatDateIT(), SIZE / 2, 155);
  }
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SIZE/2 - 100, 180); ctx.lineTo(SIZE/2 + 100, 180); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(SIZE/2 - 60, 188); ctx.lineTo(SIZE/2 + 60, 188); ctx.stroke();

  drawGrid(ctx, data.images, {
    canvasWidth: SIZE,
    top: 240, bottom: SIZE - 110, padding: 70, gap: 28,
    bg: "#242424", border: "#3a3a3a", borderWidth: 2,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#d4af37"; ctx.textAlign = "center";
    ctx.font = "300 22px " + FONT_FAMILIES.serif;
    ctx.fillText("M A R T Y   O U T F I T", SIZE / 2, SIZE - 40);
  }
}

async function renderPastel(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, "#fdf2f4"); grad.addColorStop(0.5, "#fae3e9"); grad.addColorStop(1, "#f8e3e7");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = "#d4738a"; ctx.font = "60px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("♡", SIZE / 2, 80);

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#3d2630"; ctx.font = "italic 600 54px " + FONT_FAMILIES.display;
  ctx.fillText(truncate(title, 30), SIZE / 2, 145);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#a04860"; ctx.font = "300 26px sans-serif";
    ctx.fillText(formatDateIT(), SIZE / 2, 185);
  }
  drawGrid(ctx, data.images, {
    canvasWidth: SIZE,
    top: 240, bottom: SIZE - 110, padding: 80, gap: 22,
    bg: "#ffffff", border: "#e8c8d0", radius: 24, borderWidth: 2,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#a04860"; ctx.font = "italic 300 24px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("✨ Marti Outfit", SIZE / 2, SIZE - 40);
  }
}

async function renderMagazine(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#1a1a1a"; ctx.fillRect(0, 0, 80, SIZE);

  ctx.save();
  ctx.translate(40, SIZE / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#d4af37"; ctx.font = "bold 24px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("EDITORIAL · LOOK BOOK", 0, 0);
  ctx.restore();

  ctx.fillStyle = "#1a1a1a"; ctx.font = "bold 180px " + FONT_FAMILIES.serif; ctx.textAlign = "right";
  ctx.fillText("01", SIZE - 80, 200);

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#1a1a1a"; ctx.font = "bold 64px " + FONT_FAMILIES.display; ctx.textAlign = "left";
  ctx.fillText(truncate(title, 22), 130, 280);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888"; ctx.font = "300 26px sans-serif";
    ctx.fillText(formatDateIT().toUpperCase(), 130, 320);
  }
  ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(130, 360); ctx.lineTo(SIZE - 80, 360); ctx.stroke();

  drawGrid(ctx, data.images, {
    canvasWidth: SIZE,
    top: 400, bottom: SIZE - 110, padLeft: 130, padRight: 80, gap: 16,
    bg: "#ffffff", border: "#1a1a1a", borderWidth: 4,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "right"; ctx.font = "bold 22px sans-serif";
    ctx.fillText("MARTY OUTFIT", SIZE - 80, SIZE - 40);
  }
}

async function renderPolaroid(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, "#f5e9d4"); grad.addColorStop(1, "#ebd6b3");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = "#000";
    ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1, 1);
  }
  ctx.globalAlpha = 1;

  const title = opts.customTitle || data.outfit.title || "Memories";
  ctx.fillStyle = "#3d2818"; ctx.textAlign = "center";
  ctx.font = "italic 600 56px " + FONT_FAMILIES.cursive + ", " + FONT_FAMILIES.display;
  ctx.fillText(truncate(title, 26), SIZE / 2, 100);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#7a5a3a"; ctx.font = "italic 28px " + FONT_FAMILIES.serif;
    ctx.fillText(formatDateIT(), SIZE / 2, 145);
  }

  const valid = data.images.filter(Boolean).slice(0, 5);
  const polW = 280, polH = 320;
  const cx = SIZE / 2, cy = SIZE / 2 + 50;
  const positions = [
    { x: cx - 280, y: cy - 100, rot: -0.18 }, { x: cx + 50, y: cy - 130, rot: 0.12 },
    { x: cx - 100, y: cy + 40, rot: 0.05 },   { x: cx + 180, y: cy + 80, rot: -0.08 },
    { x: cx - 320, y: cy + 100, rot: 0.15 },
  ];
  valid.forEach((img, idx) => {
    const p = positions[idx]; if (!p) return;
    ctx.save();
    ctx.translate(p.x + polW/2, p.y + polH/2); ctx.rotate(p.rot);
    ctx.translate(-(p.x + polW/2), -(p.y + polH/2));
    ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fefefe"; ctx.fillRect(p.x, p.y, polW, polH);
    ctx.shadowColor = "transparent";
    drawImage(ctx, img, p.x + 14, p.y + 14, polW - 28, polH - 80, {
      filter: PHOTO_FILTERS[opts.filter || "none"].css
    });
    ctx.restore();
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#7a5a3a"; ctx.font = "italic 24px " + FONT_FAMILIES.serif; ctx.textAlign = "center";
    ctx.fillText("✨ Marti Outfit", SIZE / 2, SIZE - 40);
  }
}

async function renderMosaic(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, SIZE, SIZE);

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "left";
  ctx.font = "bold 50px " + FONT_FAMILIES.display;
  ctx.fillText(truncate(title, 26), 60, 100);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888"; ctx.font = "300 24px " + FONT_FAMILIES.system;
    ctx.fillText(formatDateIT(), 60, 135);
  }
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, 160); ctx.lineTo(220, 160); ctx.stroke();

  const valid = data.images.filter(Boolean).slice(0, 5);
  const filter = PHOTO_FILTERS[opts.filter || "none"].css;
  const top = 200, bottom = SIZE - 110, padding = 60;
  const areaW = SIZE - padding * 2, areaH = bottom - top;

  if (valid.length === 1) drawImage(ctx, valid[0], padding, top, areaW, areaH, { filter });
  else if (valid.length === 2) {
    drawImage(ctx, valid[0], padding, top, areaW * 0.65 - 8, areaH, { filter });
    drawImage(ctx, valid[1], padding + areaW * 0.65 + 8, top, areaW * 0.35 - 8, areaH, { filter });
  } else {
    const heroW = areaW * 0.6;
    drawImage(ctx, valid[0], padding, top, heroW, areaH, { filter });
    const remaining = valid.slice(1);
    const rx = padding + heroW + 16, rw = areaW - heroW - 16;
    const rh = (areaH - 16 * (remaining.length - 1)) / remaining.length;
    remaining.forEach((img, i) => drawImage(ctx, img, rx, top + i * (rh + 16), rw, rh, { filter }));
  }

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#aaa"; ctx.font = "300 22px " + FONT_FAMILIES.system; ctx.textAlign = "right";
    ctx.fillText("MARTY OUTFIT", SIZE - 60, SIZE - 40);
  }
}

async function renderHero(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, SIZE, SIZE);

  const valid = data.images.filter(Boolean);
  if (valid.length > 0) {
    drawImage(ctx, valid[0], 0, 0, SIZE, SIZE, {
      filter: PHOTO_FILTERS[opts.filter || "none"].css
    });
  }
  const overlay = ctx.createLinearGradient(0, SIZE * 0.55, 0, SIZE);
  overlay.addColorStop(0, "rgba(0,0,0,0)"); overlay.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = overlay; ctx.fillRect(0, SIZE * 0.55, SIZE, SIZE * 0.45);

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
  ctx.font = "bold 70px " + FONT_FAMILIES.display;
  ctx.fillText(truncate(title, 22), SIZE / 2, SIZE - 130);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#d4af37"; ctx.font = "300 28px " + FONT_FAMILIES.system;
    ctx.fillText(formatDateIT().toUpperCase(), SIZE / 2, SIZE - 80);
  }
  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "300 18px " + FONT_FAMILIES.system; ctx.textAlign = "center";
    ctx.fillText("M A R T Y   O U T F I T", SIZE / 2, SIZE - 40);
  }
}

async function renderMinimal(ctx, data, opts) {
  const SIZE = DEFAULT_SIZE;
  ctx.fillStyle = "#fefefe"; ctx.fillRect(0, 0, SIZE, SIZE);

  drawGrid(ctx, data.images, {
    canvasWidth: SIZE,
    top: 60, bottom: SIZE - 140, padding: 60, gap: 8,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "left";
  ctx.font = "300 32px " + FONT_FAMILIES.system;
  ctx.fillText(truncate(title.toLowerCase(), 30), 60, SIZE - 90);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#bbb"; ctx.font = "300 18px " + FONT_FAMILIES.mono;
    ctx.fillText(new Date().toISOString().slice(0, 10), 60, SIZE - 60);
  }
  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#bbb"; ctx.font = "300 14px " + FONT_FAMILIES.mono; ctx.textAlign = "right";
    ctx.fillText("· marty outfit ·", SIZE - 60, SIZE - 60);
  }
}

// =============================================================================
// CUSTOM TEMPLATE RENDERER (config-based, supporta aspect, pattern, overlays)
// =============================================================================
async function renderCustom(ctx, canvas, data, opts) {
  const cfg = opts.customConfig || {};
  const W = canvas.width, H = canvas.height;
  const isStory = (H / W) > 1.5;  // 9:16 layout differente

  // ===== Background =====
  const bg = cfg.background || { type: "solid", color: "#ffffff" };
  if (bg.type === "gradient") {
    const grad = bg.direction === "horizontal"
      ? ctx.createLinearGradient(0, 0, W, 0)
      : bg.direction === "diagonal"
      ? ctx.createLinearGradient(0, 0, W, H)
      : ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, bg.color1 || "#ffffff");
    grad.addColorStop(1, bg.color2 || "#f0f0f0");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = bg.color || bg.color1 || "#ffffff";
  }
  ctx.fillRect(0, 0, W, H);

  // ===== Pattern overlay =====
  if (cfg.pattern && cfg.pattern.type && cfg.pattern.type !== "none") {
    paintPattern(ctx, W, H, cfg.pattern.type, cfg.pattern.color || "rgba(0,0,0,0.08)", cfg.pattern.density || 30);
  }

  // ===== Title =====
  const titleCfg = cfg.title || {};
  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = titleCfg.color || "#1a1a1a";
  ctx.textAlign = titleCfg.align || "center";
  const titleFont = (titleCfg.italic ? "italic " : "")
    + (titleCfg.weight || "bold") + " "
    + (titleCfg.size || 56) + "px "
    + (FONT_FAMILIES[titleCfg.font] || FONT_FAMILIES.system);
  ctx.font = titleFont;
  const titleX = titleCfg.align === "left" ? 60 : titleCfg.align === "right" ? W - 60 : W / 2;
  const titleY = titleCfg.y || (isStory ? 140 : 110);
  ctx.fillText(truncate(title, 28), titleX, titleY);

  // ===== Date =====
  if (opts.includeDate !== false) {
    const dateCfg = cfg.date || {};
    ctx.fillStyle = dateCfg.color || "#888";
    ctx.font = "300 28px " + (FONT_FAMILIES[dateCfg.font] || FONT_FAMILIES.system);
    ctx.fillText(formatDateIT(), titleX, titleY + 45);
  }

  // ===== Decorative line =====
  if (cfg.line && cfg.line.show !== false) {
    ctx.strokeStyle = cfg.line.color || cfg.accent || "#d4af37";
    ctx.lineWidth = cfg.line.width || 3;
    ctx.beginPath();
    ctx.moveTo(W/2 - 60, titleY + 90);
    ctx.lineTo(W/2 + 60, titleY + 90);
    ctx.stroke();
  }

  // ===== Emoji decorativa =====
  if (cfg.emoji) {
    ctx.fillStyle = cfg.accent || "#d4af37";
    ctx.font = "50px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(cfg.emoji, W / 2, isStory ? 90 : 70);
  }

  // ===== Photo grid =====
  const photoStyle = cfg.photoStyle || {};
  const gridTop = isStory ? 280 : 230;
  const gridBottom = H - (isStory ? 200 : 110);
  drawGrid(ctx, data.images, {
    canvasWidth: W,
    top: gridTop, bottom: gridBottom,
    padding: photoStyle.padding ?? 60,
    gap: photoStyle.gap ?? 24,
    bg: photoStyle.cardBg,
    border: photoStyle.borderColor,
    borderWidth: photoStyle.borderWidth ?? 2,
    radius: photoStyle.radius ?? 0,
    shadow: photoStyle.shadow,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  // ===== Watermark =====
  if (opts.includeWatermark !== false) {
    const wm = cfg.watermark || {};
    ctx.fillStyle = wm.color || "#aaa";
    ctx.textAlign = "center";
    ctx.font = "300 24px " + (FONT_FAMILIES[wm.font] || FONT_FAMILIES.system);
    ctx.fillText(wm.text || "✨ made with Marti Outfit", W / 2, H - 40);
  }

  // ===== Overlays multipli (text, sticker, shape, logo) =====
  if (cfg.overlays && cfg.overlays.length > 0) {
    await renderOverlays(ctx, canvas, cfg.overlays);
  }
}

// =============================================================================
// CATALOG
// =============================================================================
export const TEMPLATES = {
  classic:  { name: "Classico Gold",   description: "Bianco minimal con linea oro",       preview: "linear-gradient(135deg, #fafafa 0%, #f0ebde 100%)",                 accent: "#d4af37", render: renderClassic },
  dark:     { name: "Dark Elegant",    description: "Nero luxe con titolo serif oro",     preview: "linear-gradient(135deg, #1a1a1a 0%, #2e2e2e 100%)",                 accent: "#d4af37", render: renderDark },
  pastel:   { name: "Pastel Romance",  description: "Rosa cipria con cuori",              preview: "linear-gradient(135deg, #fdf2f4 0%, #f8e3e7 100%)",                 accent: "#d4738a", render: renderPastel },
  magazine: { name: "Magazine",        description: "Editorial bold con numerazione",     preview: "linear-gradient(90deg, #1a1a1a 0% 8%, #ffffff 8% 100%)",            accent: "#d4af37", render: renderMagazine },
  polaroid: { name: "Polaroid Stack",  description: "Foto come polaroid sovrapposte",     preview: "linear-gradient(135deg, #f5e9d4 0%, #ebd6b3 100%)",                 accent: "#7a5a3a", render: renderPolaroid },
  mosaic:   { name: "Mosaic",          description: "Asimmetrico con foto hero",          preview: "linear-gradient(135deg, #ffffff 50%, #d4af37 50% 55%, #ffffff 55%)", accent: "#d4af37", render: renderMosaic },
  hero:     { name: "Hero Single",     description: "Una foto grande full bleed",         preview: "linear-gradient(180deg, #555 0% 70%, #000 100%)",                   accent: "#d4af37", render: renderHero },
  minimal:  { name: "Minimal",         description: "Pulito, mono, lowercase",            preview: "linear-gradient(180deg, #fefefe 0% 90%, #eeeeee 100%)",             accent: "#666",    render: renderMinimal },
};

export const DEFAULT_TEMPLATE = "classic";

// =============================================================================
// API: render con template + aspect
// =============================================================================

/**
 * Imposta dimensioni canvas in base all'aspect ratio
 * (solo i custom template lo rispettano; built-in sono fissi 1080×1080)
 */
export function configureCanvas(canvas, aspect = "1:1") {
  const a = ASPECTS[aspect] || ASPECTS["1:1"];
  canvas.width = a.width;
  canvas.height = a.height;
}

export async function renderWithTemplate(templateKey, canvas, data, options = {}) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Custom (config-based) - usa aspect dal config
  if (templateKey === "custom" || options.userTemplateConfig) {
    const cfg = options.userTemplateConfig || options.customConfig || {};
    configureCanvas(canvas, cfg.aspectRatio || "1:1");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await renderCustom(ctx, canvas, data, { ...options, customConfig: cfg });
    return;
  }

  // Built-in: fisso 1080×1080
  configureCanvas(canvas, "1:1");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tpl = TEMPLATES[templateKey] || TEMPLATES[DEFAULT_TEMPLATE];
  await tpl.render(ctx, data, options);
}
