// =============================================================================
// Share templates: 4 stili visivi diversi per le outfit card 1080×1080
// =============================================================================
// Ogni template e' una funzione render(ctx, canvas, data, options).
// data = { outfit, items, images } - immagini gia' caricate
// options = { customTitle, includeDate, includeWatermark }
// =============================================================================

const SIZE = 1080;

// =============================================================================
// Helpers comuni
// =============================================================================
function drawImageCover(ctx, img, x, y, w, h, radius = 0) {
  ctx.save();
  if (radius > 0) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }

  const ratio = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / ratio;
  const sh = h / ratio;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function formatDateIT(d = new Date()) {
  return d.toLocaleDateString("it-IT", {
    day: "2-digit", month: "long", year: "numeric"
  });
}

function gridLayout(n) {
  return ({
    1: { cols: 1, rows: 1 }, 2: { cols: 2, rows: 1 }, 3: { cols: 3, rows: 1 },
    4: { cols: 2, rows: 2 }, 5: { cols: 3, rows: 2 }, 6: { cols: 3, rows: 2 },
  })[Math.min(n, 6)];
}

// =============================================================================
// Template 1: CLASSIC GOLD
// =============================================================================
async function renderClassic(ctx, canvas, data, opts) {
  // Background (gradient soft)
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, "#fafafa");
  grad.addColorStop(1, "#f0ebde");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Header
  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.font = "bold 56px -apple-system, sans-serif";
  ctx.fillText(truncate(title, 28), SIZE / 2, 100);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888";
    ctx.font = "300 30px -apple-system, sans-serif";
    ctx.fillText(formatDateIT(), SIZE / 2, 150);
  }

  // Linea oro
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(SIZE / 2 - 60, 175);
  ctx.lineTo(SIZE / 2 + 60, 175);
  ctx.stroke();

  // Grid
  drawGrid(ctx, data.images, { top: 220, bottom: SIZE - 110, padding: 60, gap: 24, bg: "#ffffff", border: "#e0e0e0" });

  // Watermark
  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#aaa";
    ctx.textAlign = "center";
    ctx.font = "300 26px -apple-system, sans-serif";
    ctx.fillText("✨ made with Marty Outfit", SIZE / 2, SIZE - 40);
  }
}

// =============================================================================
// Template 2: DARK ELEGANT
// =============================================================================
async function renderDark(ctx, canvas, data, opts) {
  // Background scuro con gradient
  const grad = ctx.createLinearGradient(0, 0, 0, SIZE);
  grad.addColorStop(0, "#1a1a1a");
  grad.addColorStop(1, "#2e2e2e");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Header
  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#d4af37";
  ctx.textAlign = "center";
  ctx.font = "bold 60px 'Playfair Display', serif";
  ctx.fillText(truncate(title, 26), SIZE / 2, 110);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888";
    ctx.font = "italic 300 28px serif";
    ctx.fillText(formatDateIT(), SIZE / 2, 155);
  }

  // Linea decorativa doppia oro
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SIZE / 2 - 100, 180);
  ctx.lineTo(SIZE / 2 + 100, 180);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(SIZE / 2 - 60, 188);
  ctx.lineTo(SIZE / 2 + 60, 188);
  ctx.stroke();

  // Grid (card scure con bordo oro sottile)
  drawGrid(ctx, data.images, {
    top: 240, bottom: SIZE - 110, padding: 70, gap: 28,
    bg: "#242424", border: "#3a3a3a", borderWidth: 2,
  });

  // Watermark
  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#d4af37";
    ctx.textAlign = "center";
    ctx.font = "300 22px serif";
    ctx.fillText("M A R T Y   O U T F I T", SIZE / 2, SIZE - 40);
  }
}

// =============================================================================
// Template 3: PASTEL ROMANCE
// =============================================================================
async function renderPastel(ctx, canvas, data, opts) {
  // Background rosa cipria con gradient
  const grad = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  grad.addColorStop(0, "#fdf2f4");
  grad.addColorStop(0.5, "#fae3e9");
  grad.addColorStop(1, "#f8e3e7");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Decorazione cuore in alto
  ctx.fillStyle = "#d4738a";
  ctx.font = "60px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("♡", SIZE / 2, 80);

  // Title (serif elegante)
  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#3d2630";
  ctx.font = "italic 600 54px 'Playfair Display', Georgia, serif";
  ctx.fillText(truncate(title, 30), SIZE / 2, 145);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#a04860";
    ctx.font = "300 26px sans-serif";
    ctx.fillText(formatDateIT(), SIZE / 2, 185);
  }

  // Grid con angoli molto arrotondati
  drawGrid(ctx, data.images, {
    top: 240, bottom: SIZE - 110, padding: 80, gap: 22,
    bg: "#ffffff", border: "#e8c8d0", radius: 24, borderWidth: 2,
  });

  // Watermark
  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#a04860";
    ctx.font = "italic 300 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("✨ Marty Outfit", SIZE / 2, SIZE - 40);
  }
}

// =============================================================================
// Template 4: MAGAZINE EDITORIAL
// =============================================================================
async function renderMagazine(ctx, canvas, data, opts) {
  // Bianco puro
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Banda nera laterale sinistra
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, 80, SIZE);

  // "EDITORIAL" verticale nella banda
  ctx.save();
  ctx.translate(40, SIZE / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.letterSpacing = "8px";
  ctx.fillText("EDITORIAL · LOOK BOOK", 0, 0);
  ctx.restore();

  // Numero grande in alto a destra
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 180px serif";
  ctx.textAlign = "right";
  ctx.fillText("01", SIZE - 80, 200);

  // Titolo bold (sinistra)
  const title = opts.customTitle || data.outfit.title || "Outfit";
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 64px 'Playfair Display', serif";
  ctx.textAlign = "left";
  ctx.fillText(truncate(title, 22), 130, 280);

  if (opts.includeDate !== false) {
    ctx.fillStyle = "#888";
    ctx.font = "300 26px sans-serif";
    ctx.fillText(formatDateIT().toUpperCase(), 130, 320);
  }

  // Linea orizzontale nera spessa
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(130, 360);
  ctx.lineTo(SIZE - 80, 360);
  ctx.stroke();

  // Grid (con bordi neri spessi, no radius - editorial vibe)
  drawGrid(ctx, data.images, {
    top: 400, bottom: SIZE - 110, padding: 130, gap: 16,
    bg: "#ffffff", border: "#1a1a1a", borderWidth: 4, padRight: 60,
  });

  // Watermark
  if (opts.includeWatermark !== false) {
    ctx.fillStyle = "#1a1a1a";
    ctx.textAlign = "right";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("MARTY OUTFIT", SIZE - 80, SIZE - 40);
  }
}

// =============================================================================
// Helper: griglia adattiva (riusato dai template)
// =============================================================================
function drawGrid(ctx, imgs, cfg) {
  const valid = imgs.filter(Boolean);
  if (valid.length === 0) return;
  const { cols, rows } = gridLayout(valid.length);
  const padLeft = cfg.padding;
  const padRight = cfg.padRight || cfg.padding;
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

    // Sfondo cella
    if (cfg.bg) {
      ctx.fillStyle = cfg.bg;
      if (radius > 0) {
        roundRect(ctx, x, y, cellW, cellH, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, cellW, cellH);
      }
    }

    drawImageCover(ctx, img, x, y, cellW, cellH, radius);

    if (cfg.border) {
      ctx.strokeStyle = cfg.border;
      ctx.lineWidth = borderWidth;
      if (radius > 0) {
        roundRect(ctx, x, y, cellW, cellH, radius);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, cellW, cellH);
      }
    }
  });
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

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// =============================================================================
// Catalog: lista template per UI
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
    description: "Rosa cipria romantico con cuori",
    preview: "linear-gradient(135deg, #fdf2f4 0%, #f8e3e7 100%)",
    accent: "#d4738a",
    render: renderPastel,
  },
  magazine: {
    name: "Magazine Editorial",
    description: "Stile rivista bold con numerazione",
    preview: "linear-gradient(90deg, #1a1a1a 0% 8%, #ffffff 8% 100%)",
    accent: "#d4af37",
    render: renderMagazine,
  },
};

export const DEFAULT_TEMPLATE = "classic";

/** API esposta: renderizza con il template scelto. */
export async function renderWithTemplate(templateKey, canvas, data, options = {}) {
  const tpl = TEMPLATES[templateKey] || TEMPLATES[DEFAULT_TEMPLATE];
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await tpl.render(ctx, canvas, data, options);
}
