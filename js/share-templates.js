// =============================================================================
// Share templates: 8 stili built-in + custom builder
// =============================================================================

const SIZE = 1080;

// =============================================================================
// FILTER SYSTEM (applicabile a ogni template via opts.filter)
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

// =============================================================================
// FONT FAMILIES
// =============================================================================
export const FONT_FAMILIES = {
  system:   '-apple-system, BlinkMacSystemFont, sans-serif',
  serif:    'Georgia, "Times New Roman", serif',
  display:  '"Playfair Display", Georgia, serif',
  mono:     '"SF Mono", Menlo, monospace',
  cursive:  '"Brush Script MT", cursive',
};

// =============================================================================
// HELPER COMUNI
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

  if (radius > 0) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }

  ctx.filter = filter;

  // Cover-fit
  const ratio = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / ratio;
  const sh = h / ratio;
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
  return d.toLocaleDateString("it-IT", {
    day: "2-digit", month: "long", year: "numeric"
  });
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
  const areaWidth = SIZE - padLeft - padRight;
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
// TEMPLATE BUILT-IN
// =============================================================================

// 1. CLASSIC GOLD
async function renderClassic(ctx, data, opts) {
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
    top: 220, bottom: SIZE - 110, padding: 60, gap: 24,
    bg: "#ffffff", border: "#e0e0e0", filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#aaa"; ctx.textAlign = "center";
    ctx.font = "300 26px " + FONT_FAMILIES.system;
    ctx.fillText("✨ made with Marty Outfit", SIZE / 2, SIZE - 40);
  }
}

// 2. DARK ELEGANT
async function renderDark(ctx, data, opts) {
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

// 3. PASTEL ROMANCE
async function renderPastel(ctx, data, opts) {
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
    top: 240, bottom: SIZE - 110, padding: 80, gap: 22,
    bg: "#ffffff", border: "#e8c8d0", radius: 24, borderWidth: 2,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#a04860"; ctx.font = "italic 300 24px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("✨ Marty Outfit", SIZE / 2, SIZE - 40);
  }
}

// 4. MAGAZINE EDITORIAL
async function renderMagazine(ctx, data, opts) {
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
    top: 400, bottom: SIZE - 110, padLeft: 130, padRight: 80, gap: 16,
    bg: "#ffffff", border: "#1a1a1a", borderWidth: 4,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "right"; ctx.font = "bold 22px sans-serif";
    ctx.fillText("MARTY OUTFIT", SIZE - 80, SIZE - 40);
  }
}

// 5. POLAROID STACK (foto come polaroid sovrapposte con rotazione)
async function renderPolaroid(ctx, data, opts) {
  // Background carta texture
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, "#f5e9d4"); grad.addColorStop(1, "#ebd6b3");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);

  // Texture noise simulate
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

  // Disegno polaroid (max 4-5)
  const valid = data.images.filter(Boolean).slice(0, 5);
  const polW = 280, polH = 320;
  const cx = SIZE / 2, cy = SIZE / 2 + 50;
  const positions = [
    { x: cx - 280, y: cy - 100, rot: -0.18 },
    { x: cx + 50, y: cy - 130, rot: 0.12 },
    { x: cx - 100, y: cy + 40, rot: 0.05 },
    { x: cx + 180, y: cy + 80, rot: -0.08 },
    { x: cx - 320, y: cy + 100, rot: 0.15 },
  ];

  valid.forEach((img, idx) => {
    const p = positions[idx];
    if (!p) return;

    ctx.save();
    ctx.translate(p.x + polW/2, p.y + polH/2);
    ctx.rotate(p.rot);
    ctx.translate(-(p.x + polW/2), -(p.y + polH/2));

    // Shadow
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;

    // Carta polaroid bianca
    ctx.fillStyle = "#fefefe"; ctx.fillRect(p.x, p.y, polW, polH);

    ctx.shadowColor = "transparent";

    // Foto interna (lascia bordo bianco sotto + 14px attorno)
    const photoX = p.x + 14, photoY = p.y + 14;
    const photoW = polW - 28, photoH = polH - 80;
    drawImage(ctx, img, photoX, photoY, photoW, photoH, {
      filter: PHOTO_FILTERS[opts.filter || "none"].css
    });

    ctx.restore();
  });

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#7a5a3a"; ctx.font = "italic 24px " + FONT_FAMILIES.serif; ctx.textAlign = "center";
    ctx.fillText("✨ Marty Outfit", SIZE / 2, SIZE - 40);
  }
}

// 6. MOSAIC ASIMMETRICO (1 grande + altri piccoli)
async function renderMosaic(ctx, data, opts) {
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, SIZE, SIZE);

  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#1a1a1a"; ctx.textAlign = "left";
  ctx.font = "bold 50px " + FONT_FAMILIES.display;
  ctx.fillText(truncate(title, 26), 60, 100);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888"; ctx.font = "300 24px " + FONT_FAMILIES.system;
    ctx.fillText(formatDateIT(), 60, 135);
  }

  // Linea oro
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, 160); ctx.lineTo(220, 160); ctx.stroke();

  // Layout asimmetrico
  const valid = data.images.filter(Boolean).slice(0, 5);
  const filter = PHOTO_FILTERS[opts.filter || "none"].css;
  const top = 200, bottom = SIZE - 110;
  const padding = 60;
  const areaW = SIZE - padding * 2;
  const areaH = bottom - top;

  if (valid.length === 1) {
    drawImage(ctx, valid[0], padding, top, areaW, areaH, { filter });
  } else if (valid.length === 2) {
    drawImage(ctx, valid[0], padding, top, areaW * 0.65 - 8, areaH, { filter });
    drawImage(ctx, valid[1], padding + areaW * 0.65 + 8, top, areaW * 0.35 - 8, areaH, { filter });
  } else {
    // Foto principale grande a sinistra
    const heroW = areaW * 0.6;
    drawImage(ctx, valid[0], padding, top, heroW, areaH, { filter });

    // Resto a destra in colonna
    const remaining = valid.slice(1);
    const rx = padding + heroW + 16;
    const rw = areaW - heroW - 16;
    const rh = (areaH - 16 * (remaining.length - 1)) / remaining.length;
    remaining.forEach((img, i) => {
      drawImage(ctx, img, rx, top + i * (rh + 16), rw, rh, { filter });
    });
  }

  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#aaa"; ctx.font = "300 22px " + FONT_FAMILIES.system; ctx.textAlign = "right";
    ctx.fillText("MARTY OUTFIT", SIZE - 60, SIZE - 40);
  }
}

// 7. HERO SINGLE (una foto grande, info minimal)
async function renderHero(ctx, data, opts) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, SIZE, SIZE);

  const valid = data.images.filter(Boolean);
  if (valid.length > 0) {
    drawImage(ctx, valid[0], 0, 0, SIZE, SIZE, {
      filter: PHOTO_FILTERS[opts.filter || "none"].css
    });
  }

  // Overlay scuro in basso
  const overlay = ctx.createLinearGradient(0, SIZE * 0.55, 0, SIZE);
  overlay.addColorStop(0, "rgba(0,0,0,0)");
  overlay.addColorStop(1, "rgba(0,0,0,0.85)");
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

// 8. MINIMAL (pulizia totale)
async function renderMinimal(ctx, data, opts) {
  ctx.fillStyle = "#fefefe"; ctx.fillRect(0, 0, SIZE, SIZE);

  drawGrid(ctx, data.images, {
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
// CUSTOM TEMPLATE RENDERER (interpreta config object)
// =============================================================================
async function renderCustom(ctx, data, opts) {
  const cfg = opts.customConfig || {};
  const bg = cfg.background || { type: "solid", color: "#ffffff" };

  // Background
  if (bg.type === "gradient") {
    const grad = bg.direction === "horizontal"
      ? ctx.createLinearGradient(0, 0, SIZE, 0)
      : bg.direction === "diagonal"
      ? ctx.createLinearGradient(0, 0, SIZE, SIZE)
      : ctx.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, bg.color1 || "#ffffff");
    grad.addColorStop(1, bg.color2 || "#f0f0f0");
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = bg.color || "#ffffff";
  }
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Title
  const titleCfg = cfg.title || {};
  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = titleCfg.color || "#1a1a1a";
  ctx.textAlign = titleCfg.align || "center";
  const titleFont = (titleCfg.italic ? "italic " : "")
    + (titleCfg.weight || "bold") + " "
    + (titleCfg.size || 56) + "px "
    + (FONT_FAMILIES[titleCfg.font] || FONT_FAMILIES.system);
  ctx.font = titleFont;
  const titleX = titleCfg.align === "left" ? 60 : titleCfg.align === "right" ? SIZE - 60 : SIZE / 2;
  ctx.fillText(truncate(title, 28), titleX, titleCfg.y || 110);

  // Date
  if (opts.includeDate !== false) {
    const dateCfg = cfg.date || {};
    ctx.fillStyle = dateCfg.color || "#888";
    ctx.font = "300 28px " + (FONT_FAMILIES[dateCfg.font] || FONT_FAMILIES.system);
    ctx.fillText(formatDateIT(), titleX, titleCfg.y ? titleCfg.y + 45 : 155);
  }

  // Decorative line
  if (cfg.line && cfg.line.show !== false) {
    ctx.strokeStyle = cfg.line.color || cfg.accent || "#d4af37";
    ctx.lineWidth = cfg.line.width || 3;
    ctx.beginPath();
    ctx.moveTo(SIZE/2 - 60, 195); ctx.lineTo(SIZE/2 + 60, 195);
    ctx.stroke();
  }

  // Accent emoji
  if (cfg.emoji) {
    ctx.fillStyle = cfg.accent || "#d4af37";
    ctx.font = "50px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(cfg.emoji, SIZE / 2, 70);
  }

  // Photo grid
  const photoStyle = cfg.photoStyle || {};
  drawGrid(ctx, data.images, {
    top: 230, bottom: SIZE - 110,
    padding: photoStyle.padding ?? 60,
    gap: photoStyle.gap ?? 24,
    bg: photoStyle.cardBg,
    border: photoStyle.borderColor,
    borderWidth: photoStyle.borderWidth ?? 2,
    radius: photoStyle.radius ?? 0,
    shadow: photoStyle.shadow,
    filter: PHOTO_FILTERS[opts.filter || "none"].css,
  });

  // Watermark
  if (opts.includeWatermark !== false) {
    const wm = cfg.watermark || {};
    ctx.fillStyle = wm.color || "#aaa";
    ctx.textAlign = "center";
    ctx.font = "300 24px " + (FONT_FAMILIES[wm.font] || FONT_FAMILIES.system);
    ctx.fillText(wm.text || "✨ made with Marty Outfit", SIZE / 2, SIZE - 40);
  }
}

// =============================================================================
// CATALOG
// =============================================================================
export const TEMPLATES = {
  classic: {
    name: "Classico Gold",
    description: "Bianco minimal con linea oro",
    preview: "linear-gradient(135deg, #fafafa 0%, #f0ebde 100%)",
    accent: "#d4af37",
    render: renderClassic,
  },
  dark: {
    name: "Dark Elegant",
    description: "Nero luxe con titolo serif oro",
    preview: "linear-gradient(135deg, #1a1a1a 0%, #2e2e2e 100%)",
    accent: "#d4af37",
    render: renderDark,
  },
  pastel: {
    name: "Pastel Romance",
    description: "Rosa cipria con cuori",
    preview: "linear-gradient(135deg, #fdf2f4 0%, #f8e3e7 100%)",
    accent: "#d4738a",
    render: renderPastel,
  },
  magazine: {
    name: "Magazine",
    description: "Editorial bold con numerazione",
    preview: "linear-gradient(90deg, #1a1a1a 0% 8%, #ffffff 8% 100%)",
    accent: "#d4af37",
    render: renderMagazine,
  },
  polaroid: {
    name: "Polaroid Stack",
    description: "Foto come polaroid sovrapposte",
    preview: "linear-gradient(135deg, #f5e9d4 0%, #ebd6b3 100%)",
    accent: "#7a5a3a",
    render: renderPolaroid,
  },
  mosaic: {
    name: "Mosaic",
    description: "Asimmetrico, foto hero + dettagli",
    preview: "linear-gradient(135deg, #ffffff 50%, #d4af37 50% 55%, #ffffff 55%)",
    accent: "#d4af37",
    render: renderMosaic,
  },
  hero: {
    name: "Hero Single",
    description: "Una foto grande full bleed",
    preview: "linear-gradient(180deg, #555 0% 70%, #000 100%)",
    accent: "#d4af37",
    render: renderHero,
  },
  minimal: {
    name: "Minimal",
    description: "Pulito, font monospace, lowercase",
    preview: "linear-gradient(180deg, #fefefe 0% 90%, #eeeeee 100%)",
    accent: "#666",
    render: renderMinimal,
  },
};

export const DEFAULT_TEMPLATE = "classic";

// =============================================================================
// API
// =============================================================================
export async function renderWithTemplate(templateKey, canvas, data, options = {}) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Custom template (config-based)
  if (templateKey === "custom") {
    await renderCustom(ctx, data, options);
    return;
  }

  // User template (saved con config + render via custom)
  if (options.userTemplateConfig) {
    await renderCustom(ctx, data, { ...options, customConfig: options.userTemplateConfig });
    return;
  }

  // Built-in
  const tpl = TEMPLATES[templateKey] || TEMPLATES[DEFAULT_TEMPLATE];
  await tpl.render(ctx, data, options);
}
