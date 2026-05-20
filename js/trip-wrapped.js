// =============================================================================
// Trip Wrapped: summary post-viaggio + share canvas Stories-ready
// =============================================================================
// Si attiva quando trip.status === "done" (date passate).
// Calcola aggregati dai dati gia' presenti: outfits_by_day, capi del
// guardaroba, durata, occasioni. Nessuna AI.
// =============================================================================

import { estimateItemsVolume, estimateItemsWeightGrams, OCCASION_OPTIONS, getLuggage } from "./trips-data.js";

/**
 * @returns {object} stats per il render del Wrapped
 *   {
 *     days, packedCount, outfitDays, mvp:{item,count}, secondMvp,
 *     totalPrice, costPerDay,
 *     occasionsBreakdown:[{key,label,icon,count,pct}],
 *     colorPalette:[{hex,count}],
 *     volumeL, weightKg, luggage,
 *     reuseRate (0-100)
 *   }
 */
export function computeWrappedStats(trip, items, weightsMap) {
  const itemsById = new Map(items.map(i => [i.id, i]));
  const outfitsByDay = trip.outfits_by_day || {};
  const allItemIds = [];
  const usageCount = new Map();   // itemId -> giorni in cui appare
  const days = Object.keys(outfitsByDay).length;

  for (const arr of Object.values(outfitsByDay)) {
    for (const id of arr) {
      allItemIds.push(id);
      usageCount.set(id, (usageCount.get(id) || 0) + 1);
    }
  }
  const uniqueIds = [...usageCount.keys()];
  const packedItems = uniqueIds.map(id => itemsById.get(id)).filter(Boolean);

  // MVP = capo piu' indossato (n. di giorni in cui appare)
  const ranked = [...usageCount.entries()].sort((a, b) => b[1] - a[1]);
  const mvp       = ranked[0] ? { item: itemsById.get(ranked[0][0]), count: ranked[0][1] } : null;
  const secondMvp = ranked[1] ? { item: itemsById.get(ranked[1][0]), count: ranked[1][1] } : null;

  // Spesa totale dei capi pacchettati (serve solo se hanno price)
  const totalPrice = packedItems.reduce((sum, it) => sum + (Number(it.price) || 0), 0);
  const costPerDay = days > 0 && totalPrice > 0 ? totalPrice / days : 0;

  // Distribuzione occasioni
  const occMap = trip.occasions_by_day || {};
  const occCount = {};
  for (const occ of Object.values(occMap)) occCount[occ] = (occCount[occ] || 0) + 1;
  const occasionsBreakdown = Object.entries(occCount)
    .map(([key, count]) => {
      const opt = OCCASION_OPTIONS.find(x => x.key === key);
      return {
        key,
        label: opt?.label || key,
        icon: opt?.icon || "✨",
        count,
        pct: Math.round((count / Math.max(1, days)) * 100),
      };
    })
    .sort((a, b) => b.count - a.count);

  // Palette colori (top 5 colori principali dei capi packed)
  const colorMap = new Map();
  for (const it of packedItems) {
    const c = (it.color_primary || it.color || "").toLowerCase().trim();
    if (!c) continue;
    colorMap.set(c, (colorMap.get(c) || 0) + 1);
  }
  const colorPalette = [...colorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, hex: colorNameToHex(name), count }));

  // Volume + peso valigia
  const volumeL = estimateItemsVolume(packedItems);
  const weightG = estimateItemsWeightGrams(packedItems, weightsMap);
  const luggage = getLuggage(trip.luggage_type || "cabina");

  // Reuse rate: quanto sono stati riusati in media i capi
  // (giorni totali outfit / capi unici) -> >1 = riuso, =1 = mai riuso
  const totalAppearances = allItemIds.length;
  const avgReuse = uniqueIds.length > 0 ? totalAppearances / uniqueIds.length : 0;
  // Score 0-100: 1.0 -> 0%, 2.0 -> 50%, 3.0+ -> 100%
  const reuseRate = Math.round(Math.min(100, Math.max(0, (avgReuse - 1) * 50)));

  return {
    days,
    packedCount: uniqueIds.length,
    outfitDays: days,
    mvp,
    secondMvp,
    totalPrice,
    costPerDay,
    occasionsBreakdown,
    colorPalette,
    volumeL,
    weightG,
    weightKg: Math.round(weightG / 100) / 10,
    luggage,
    reuseRate,
    avgReuse: Math.round(avgReuse * 10) / 10,
  };
}

// Mappa nomi colore italiani -> hex (subset, fallback a un grigio neutro)
const COLOR_HEX = {
  "bianco": "#ffffff", "panna": "#fff8e7", "crema": "#f5ecd6",
  "nero": "#1a1a1a",
  "grigio": "#808080",
  "beige": "#d4b896", "cammello": "#c19a6b", "cuoio": "#8b5a2b",
  "marrone": "#6b4423", "testa di moro": "#3d2817",
  "blu navy": "#1c2a48", "blu": "#2a59a8", "azzurro": "#82b4e8", "celeste": "#a0c8e8", "denim": "#5478a8",
  "denim chiaro": "#8aa4c4", "denim scuro": "#2a3a52",
  "rosso": "#c0392b", "bordeaux": "#5a1a1f",
  "rosa": "#f4a8b8", "fucsia": "#d63484",
  "verde": "#2d8b4a", "verde oliva": "#6b8e23", "verde salvia": "#9caf88", "verde militare": "#4b5d3a",
  "giallo": "#f1c40f", "arancione": "#e67e22", "senape": "#c8a228", "ocra": "#cc7722",
  "viola": "#8b4a8b", "lilla": "#c8a8d8", "prugna": "#5d3a5a",
  "oro": "#d4af37", "argento": "#c0c0c0", "rame": "#b87333",
};
function colorNameToHex(name) {
  const k = String(name || "").toLowerCase().trim();
  return COLOR_HEX[k] || "#9a9a9a";
}

/**
 * Genera un'immagine 1080x1080 (canvas) con il Wrapped del viaggio
 * pronta per Stories/share. Ritorna un Blob.
 */
export async function buildWrappedImageBlob(trip, stats) {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Sfondo gradient nero/oro
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#1a1a1a");
  grad.addColorStop(1, "#2a1f08");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Sfere decorative oro
  ctx.fillStyle = "rgba(212, 175, 55, 0.08)";
  ctx.beginPath(); ctx.arc(W * 0.15, H * 0.2, 200, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W * 0.85, H * 0.85, 280, 0, Math.PI * 2); ctx.fill();

  // Header label
  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 38px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✨ TRIP WRAPPED", W / 2, 110);

  // Bandiera grande
  ctx.font = "200px sans-serif";
  ctx.fillText(countryFlag(trip.destination?.country_code), W / 2, 320);

  // Nome destinazione + date
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px Georgia, serif";
  ctx.fillText(truncate(trip.name || trip.destination?.name || "Viaggio", 22), W / 2, 410);

  ctx.fillStyle = "#a89968";
  ctx.font = "32px -apple-system, system-ui, sans-serif";
  ctx.fillText(formatDateRange(trip.start_date, trip.end_date), W / 2, 460);

  // Numeri grandi (3 stat: giorni, capi, outfit)
  drawBigStat(ctx, W * 0.20, 600, stats.days, "giorni");
  drawBigStat(ctx, W * 0.50, 600, stats.packedCount, "capi");
  drawBigStat(ctx, W * 0.80, 600, stats.outfitDays, "outfit");

  // MVP + thumb
  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 28px -apple-system, system-ui, sans-serif";
  ctx.fillText("👑 CAPO MVP", W / 2, 760);
  if (stats.mvp && stats.mvp.item) {
    const mvpItem = stats.mvp.item;
    const subcat = mvpItem.subcategory || mvpItem.category || "Capo";
    const color = mvpItem.color_primary || mvpItem.color || "";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px Georgia, serif";
    ctx.fillText(truncate(`${capitalize(subcat)}${color ? " " + color : ""}`, 28), W / 2, 815);
    ctx.fillStyle = "#a89968";
    ctx.font = "26px -apple-system, system-ui, sans-serif";
    ctx.fillText(`indossato ${stats.mvp.count} ${stats.mvp.count === 1 ? "giorno" : "giorni"} su ${stats.days}`, W / 2, 855);
  }

  // Palette colori (chip orizzontali)
  if (stats.colorPalette && stats.colorPalette.length) {
    const startX = (W - stats.colorPalette.length * 90) / 2;
    for (let i = 0; i < stats.colorPalette.length; i++) {
      const c = stats.colorPalette[i];
      const cx = startX + i * 90 + 35;
      const cy = 940;
      ctx.fillStyle = c.hex;
      ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Footer brand
  ctx.fillStyle = "#a89968";
  ctx.font = "22px -apple-system, system-ui, sans-serif";
  ctx.fillText("✨ Marti Outfit", W / 2, 1030);

  // Export Blob
  return new Promise(resolve => canvas.toBlob(b => resolve(b), "image/png"));
}

// =============================================================================
// helpers locali
// =============================================================================
function drawBigStat(ctx, x, y, value, label) {
  ctx.textAlign = "center";
  ctx.fillStyle = "#d4af37";
  ctx.font = "bold 96px Georgia, serif";
  ctx.fillText(String(value), x, y);
  ctx.fillStyle = "#a89968";
  ctx.font = "26px -apple-system, system-ui, sans-serif";
  ctx.fillText(label, x, y + 38);
}

function countryFlag(code) {
  if (!code || code.length !== 2) return "🌍";
  const A = 0x1F1E6, base = "A".charCodeAt(0);
  const c = code.toUpperCase();
  return String.fromCodePoint(A + (c.charCodeAt(0) - base)) +
         String.fromCodePoint(A + (c.charCodeAt(1) - base));
}

function truncate(s, max) {
  s = String(s || "");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatDateRange(startISO, endISO) {
  if (!startISO || !endISO) return "";
  const MONTHS = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}
