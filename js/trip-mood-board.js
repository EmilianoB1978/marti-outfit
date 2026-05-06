// =============================================================================
// Trip Mood Board: canvas 1080x1350 con outfit del viaggio in griglia
// =============================================================================
// Differenza con Trip Wrapped:
// - Wrapped = post-viaggio, stats + capo MVP + palette
// - Mood Board = pre/durante viaggio, le FOTO degli outfit pianificati
// Uso: condividere su Stories prima di partire / durante.
// =============================================================================

const W = 1080;
const H = 1350;   // 4:5 = IG portrait

/**
 * @param {object} trip - viaggio (con outfits_by_day, occasions_by_day, ecc.)
 * @param {array}  items - capi del guardaroba (per le foto)
 * @returns {Promise<Blob>} PNG 1080x1350
 */
export async function buildMoodBoardBlob(trip, items) {
  const itemsById = new Map(items.map(i => [i.id, i]));
  const outfits = trip.outfits_by_day || {};
  const days = Object.keys(outfits).sort();

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Sfondo sfumato chiaro (no nero come Wrapped — qui voglio leggerezza)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#fdf8ed");
  bg.addColorStop(1, "#f6ecd2");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Sfere decorative oro
  ctx.fillStyle = "rgba(212, 175, 55, 0.15)";
  ctx.beginPath(); ctx.arc(W * 0.92, H * 0.08, 140, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.06, H * 0.95, 180, 0, Math.PI * 2); ctx.fill();

  // ===== HEADER (top 240px) =====
  ctx.textAlign = "center";

  // Eyebrow
  ctx.fillStyle = "#8a6520";
  ctx.font = "bold 32px -apple-system, system-ui, sans-serif";
  ctx.fillText("✈️  IL MIO MOOD", W / 2, 90);

  // Nome viaggio
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "bold 64px Georgia, serif";
  ctx.fillText(truncate(trip.name || trip.destination?.name || "Viaggio", 22), W / 2, 165);

  // Bandiera + città + date
  const flag = countryFlag(trip.destination?.country_code);
  const sub = `${flag}  ${trip.destination?.name || ""}  ·  ${formatDateRange(trip.start_date, trip.end_date)}`;
  ctx.fillStyle = "#5e4a10";
  ctx.font = "30px -apple-system, system-ui, sans-serif";
  ctx.fillText(sub, W / 2, 220);

  // ===== GRIGLIA 3x3 outfit (270 -> 1180) =====
  const GRID_TOP = 290;
  const GRID_PADDING = 40;        // bordi laterali
  const GRID_GAP = 14;
  const COLS = 3;
  const cellW = (W - 2 * GRID_PADDING - (COLS - 1) * GRID_GAP) / COLS;
  const cellH = cellW;            // quadrate

  const slots = days.slice(0, 9);
  for (let i = 0; i < 9; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = GRID_PADDING + col * (cellW + GRID_GAP);
    const y = GRID_TOP + row * (cellH + GRID_GAP);

    if (i < slots.length) {
      const dayISO = slots[i];
      const itemIds = outfits[dayISO] || [];
      const dayItems = itemIds.map(id => itemsById.get(id)).filter(Boolean);
      await drawOutfitCell(ctx, x, y, cellW, cellH, dayItems, dayISO);
    } else {
      drawEmptyCell(ctx, x, y, cellW, cellH);
    }
  }

  // Se ci sono più di 9 giorni, badge "+N altri"
  if (days.length > 9) {
    ctx.fillStyle = "rgba(212, 175, 55, 0.95)";
    ctx.beginPath();
    ctx.roundRect(W - GRID_PADDING - 220, GRID_TOP + 3 * cellH + 2 * GRID_GAP - 50, 200, 48, 24);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "bold 24px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`+${days.length - 9} altri giorni`, W - GRID_PADDING - 120, GRID_TOP + 3 * cellH + 2 * GRID_GAP - 18);
  }

  // ===== FOOTER =====
  ctx.fillStyle = "#8a6520";
  ctx.font = "bold 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("✨ Marty Outfit", W / 2, H - 50);

  return new Promise(resolve => canvas.toBlob(b => resolve(b), "image/png", 0.92));
}

// =============================================================================
// Disegno cella singola (giorno + outfit)
// =============================================================================
async function drawOutfitCell(ctx, x, y, w, h, dayItems, dayISO) {
  // Sfondo cella
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();

  // Bordo sottile
  ctx.strokeStyle = "rgba(212, 175, 55, 0.3)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();

  if (dayItems.length === 0) {
    ctx.fillStyle = "#bfb38a";
    ctx.font = "italic 20px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("—", x + w / 2, y + h / 2);
    return;
  }

  // Sub-griglia 2x2 di thumb (max 4 capi visibili)
  const padding = 8;
  const innerW = w - 2 * padding;
  const innerH = h - 2 * padding - 26;  // riserva 26px in fondo per la label
  const subGap = 4;
  const sub = Math.min(dayItems.length, 4);
  let cols, rows;
  if (sub <= 1)      { cols = 1; rows = 1; }
  else if (sub <= 2) { cols = 2; rows = 1; }
  else if (sub <= 4) { cols = 2; rows = 2; }
  const tw = (innerW - (cols - 1) * subGap) / cols;
  const th = (innerH - (rows - 1) * subGap) / rows;

  // Salva clip arrotondato per le immagini
  ctx.save();
  roundRect(ctx, x + padding, y + padding, innerW, innerH, 8);
  ctx.clip();

  for (let i = 0; i < sub; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const tx = x + padding + c * (tw + subGap);
    const ty = y + padding + r * (th + subGap);
    const it = dayItems[i];
    await drawItemThumb(ctx, tx, ty, tw, th, it);
  }
  ctx.restore();

  // Label giorno (in fondo alla cella)
  ctx.fillStyle = "#5e4a10";
  ctx.font = "bold 16px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  const dayLabel = formatDayShort(dayISO);
  ctx.fillText(dayLabel, x + w / 2, y + h - 10);
}

function drawEmptyCell(ctx, x, y, w, h) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = "rgba(212, 175, 55, 0.2)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.setLineDash([]);
}

async function drawItemThumb(ctx, x, y, w, h, item) {
  // Sfondo placeholder
  ctx.fillStyle = "#ede5cc";
  ctx.fillRect(x, y, w, h);

  if (item.photo_url) {
    try {
      const img = await loadImage(item.photo_url);
      // cover-fit: scala mantenendo aspect ratio
      const scale = Math.max(w / img.width, h / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      const ix = x + (w - iw) / 2;
      const iy = y + (h - ih) / 2;
      ctx.drawImage(img, ix, iy, iw, ih);
      return;
    } catch (e) {
      // fallback emoji
    }
  }
  // Fallback: emoji categoria centrata
  ctx.fillStyle = "#8a6520";
  ctx.font = `${Math.floor(w * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(categoryEmoji(item.category), x + w / 2, y + h / 2);
  ctx.textBaseline = "alphabetic";
}

// =============================================================================
// Utils
// =============================================================================
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load fail"));
    img.src = url;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function countryFlag(code) {
  if (!code || code.length !== 2) return "🌍";
  const A = 0x1F1E6, base = "A".charCodeAt(0);
  const c = code.toUpperCase();
  return String.fromCodePoint(A + (c.charCodeAt(0) - base)) +
         String.fromCodePoint(A + (c.charCodeAt(1) - base));
}

function categoryEmoji(cat) {
  const m = { top: "👕", bottom: "👖", scarpe: "👟", accessori: "👜", capospalla: "🧥", vestito: "👗", completo: "🤵" };
  return m[String(cat || "").toLowerCase()] || "🏷️";
}

function truncate(s, max) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

const MONTHS_ABBR = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
function formatDateRange(startISO, endISO) {
  if (!startISO || !endISO) return "";
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS_ABBR[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${MONTHS_ABBR[s.getMonth()]} – ${e.getDate()} ${MONTHS_ABBR[e.getMonth()]} ${e.getFullYear()}`;
}

const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
function formatDayShort(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_ABBR[d.getMonth()]}`;
}
