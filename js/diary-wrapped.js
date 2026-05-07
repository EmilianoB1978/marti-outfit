// Marty Diary Wrapped: riassunto annuale del diario condivisibile.
// Riusa pattern Trip Wrapped (canvas 1080x1080 + Web Share API + Instagram
// Stories deep link). Stats calcolate dalle entry diary + wear_history dei capi.

import { listEntries, MOODS, idToDate, dateToId, computeStreak } from "./diary-data.js";
import { listItems as listGarments } from "./wardrobe.js";

// =============================================================================
// Stats
// =============================================================================

export function computeYearStats(year, allEntries, allGarments) {
  const yearEntries = allEntries.filter(e => e.id?.startsWith(`${year}-`));
  const total = yearEntries.length;

  // Mood distribution
  const moodMap = new Map();
  for (const e of yearEntries) {
    if (!e.mood) continue;
    moodMap.set(e.mood, (moodMap.get(e.mood) || 0) + 1);
  }
  const moodRanked = [...moodMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const def = MOODS.find(m => m.key === key);
      return { key, count, emoji: def?.emoji || "❓", label: def?.label || key };
    });

  // Streak max nell'anno: piu' lunga sequenza consecutiva di entry
  const dates = new Set(yearEntries.map(e => e.id));
  let maxStreak = 0;
  let currentStreak = 0;
  // Itera giorno per giorno dell'anno
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const id = dateToId(d);
    if (dates.has(id)) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  // Tag top
  const tagMap = new Map();
  for (const e of yearEntries) {
    for (const t of (e.tags || [])) {
      const k = String(t).trim().toLowerCase();
      if (!k) continue;
      tagMap.set(k, (tagMap.get(k) || 0) + 1);
    }
  }
  const topTags = [...tagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  // Capi piu' indossati nell'anno (dal wear_history dei capi)
  const itemUseCount = new Map();
  for (const g of allGarments || []) {
    const hist = g.wear_history;
    if (!Array.isArray(hist)) continue;
    let yearCount = 0;
    for (const ts of hist) {
      try {
        let d;
        if (ts?.seconds) d = new Date(ts.seconds * 1000);
        else if (typeof ts === "string") d = new Date(ts);
        else if (ts instanceof Date) d = ts;
        else if (typeof ts === "number") d = new Date(ts);
        else continue;
        if (d.getFullYear() === year) yearCount++;
      } catch (_) {}
    }
    if (yearCount > 0) itemUseCount.set(g.id, { item: g, count: yearCount });
  }
  const topItems = [...itemUseCount.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Foto totali nelle entry
  const photoCount = yearEntries.reduce((s, e) => s + (e.photos?.length || 0), 0);

  return {
    year,
    total,
    moodRanked,
    topMood: moodRanked[0] || null,
    maxStreak,
    topTags,
    topItems,
    photoCount,
    moodCoverage: total > 0 ? Math.round((moodMap.size === 0 ? 0 : [...moodMap.values()].reduce((a, b) => a + b, 0)) / total * 100) : 0,
  };
}

// =============================================================================
// Canvas image
// =============================================================================

export async function buildWrappedImageBlob(stats) {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Sfondo gradient viola-rosa (palette Diario)
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#1f1532");
  grad.addColorStop(0.5, "#2d1b48");
  grad.addColorStop(1, "#3d1735");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Sfere decorative
  ctx.fillStyle = "rgba(167, 139, 250, 0.10)";
  ctx.beginPath(); ctx.arc(W * 0.1, H * 0.15, 220, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(244, 114, 182, 0.10)";
  ctx.beginPath(); ctx.arc(W * 0.9, H * 0.85, 300, 0, Math.PI * 2); ctx.fill();

  // Header
  ctx.fillStyle = "#d8b4fe";
  ctx.font = "bold 36px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("📔 DIARIO WRAPPED", W / 2, 110);

  // Year big
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 140px -apple-system, system-ui, sans-serif";
  ctx.fillText(String(stats.year), W / 2, 250);

  // Stat: pagine totali
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 90px -apple-system, system-ui, sans-serif";
  ctx.fillText(String(stats.total), W / 2, 380);
  ctx.fillStyle = "#a78bfa";
  ctx.font = "500 28px -apple-system, system-ui, sans-serif";
  ctx.fillText(stats.total === 1 ? "pagina scritta" : "pagine scritte", W / 2, 420);

  // Mood top
  if (stats.topMood) {
    ctx.fillStyle = "rgba(167, 139, 250, 0.15)";
    roundRect(ctx, 90, 470, W - 180, 130, 22);
    ctx.fill();
    ctx.font = "100px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(stats.topMood.emoji, W / 2, 555);
    ctx.fillStyle = "#d8b4fe";
    ctx.font = "500 22px -apple-system, system-ui, sans-serif";
    ctx.fillText(`Mood ricorrente: ${stats.topMood.label}`, W / 2, 590);
  }

  // Streak max
  ctx.fillStyle = "rgba(244, 114, 182, 0.15)";
  roundRect(ctx, 90, 630, (W - 200) / 2, 140, 22);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  const x1 = 90 + (W - 200) / 4;
  ctx.fillText(`${stats.maxStreak}🔥`, x1, 715);
  ctx.fillStyle = "#f9a8d4";
  ctx.font = "500 20px -apple-system, system-ui, sans-serif";
  ctx.fillText("streak record", x1, 750);

  // Foto totali
  ctx.fillStyle = "rgba(96, 165, 250, 0.15)";
  roundRect(ctx, W / 2 + 10, 630, (W - 200) / 2, 140, 22);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px -apple-system, system-ui, sans-serif";
  const x2 = W / 2 + 10 + (W - 200) / 4;
  ctx.fillText(`${stats.photoCount}📸`, x2, 715);
  ctx.fillStyle = "#bfdbfe";
  ctx.font = "500 20px -apple-system, system-ui, sans-serif";
  ctx.fillText(stats.photoCount === 1 ? "foto" : "foto totali", x2, 750);

  // Top tags
  if (stats.topTags.length > 0) {
    ctx.fillStyle = "#d8b4fe";
    ctx.font = "500 22px -apple-system, system-ui, sans-serif";
    ctx.fillText("TOP TAG", W / 2, 830);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 26px -apple-system, system-ui, sans-serif";
    const tagsLine = stats.topTags.slice(0, 4).map(t => `#${t.tag}`).join("  ");
    ctx.fillText(tagsLine, W / 2, 875);
  }

  // Mood distribution dots (orizzontale)
  if (stats.moodRanked.length > 0) {
    const dots = stats.moodRanked.slice(0, 8);
    const totalCount = dots.reduce((s, d) => s + d.count, 0);
    const dotW = 70;
    const totalW = dots.length * dotW;
    let x = W / 2 - totalW / 2 + dotW / 2;
    for (const d of dots) {
      const size = 16 + Math.round(20 * (d.count / Math.max(1, totalCount)));
      ctx.font = `${size + 18}px -apple-system, system-ui, sans-serif`;
      ctx.fillText(d.emoji, x, 950);
      x += dotW;
    }
  }

  // Footer brand
  ctx.fillStyle = "#a78bfa";
  ctx.font = "500 22px -apple-system, system-ui, sans-serif";
  ctx.fillText("📔 Marty Outfit", W / 2, 1020);

  return await new Promise(resolve => canvas.toBlob(b => resolve(b), "image/png"));
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

// =============================================================================
// UI overlay
// =============================================================================

let _wrappedDataCache = null;

async function ensureData() {
  if (_wrappedDataCache && Date.now() - _wrappedDataCache.ts < 60000) {
    return _wrappedDataCache;
  }
  const [entries, garments] = await Promise.all([
    listEntries().catch(() => []),
    listGarments().catch(() => []),
  ]);
  _wrappedDataCache = { entries, garments, ts: Date.now() };
  return _wrappedDataCache;
}

export async function openDiaryWrapped(year) {
  const targetYear = year || new Date().getFullYear();
  const overlay = document.createElement("div");
  overlay.id = "diary-wrapped-overlay";
  overlay.className = "diary-wrapped-overlay";
  overlay.innerHTML = `
    <div class="diary-wrapped-modal">
      <header class="diary-wrapped-header">
        <button class="btn-icon" id="diary-wrapped-close" aria-label="Chiudi">✕</button>
        <h2>Diario Wrapped</h2>
        <span></span>
      </header>
      <div class="diary-wrapped-body">
        <p class="diary-wrapped-loading">⏳ Sto preparando il tuo riassunto...</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#diary-wrapped-close").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  try {
    const { entries, garments } = await ensureData();
    const stats = computeYearStats(targetYear, entries, garments);
    if (stats.total === 0) {
      overlay.querySelector(".diary-wrapped-body").innerHTML = `
        <div class="diary-wrapped-empty">
          <div class="diary-wrapped-empty-icon">📔</div>
          <p>Nessuna pagina scritta nel ${targetYear}.</p>
          <p>Inizia oggi a scrivere il tuo diario!</p>
        </div>
      `;
      return;
    }
    const blob = await buildWrappedImageBlob(stats);
    const url = URL.createObjectURL(blob);
    overlay.querySelector(".diary-wrapped-body").innerHTML = `
      <img class="diary-wrapped-image" src="${url}" alt="Diary Wrapped" />
      <div class="diary-wrapped-actions">
        <button class="btn btn-gold btn--block" id="diary-wrapped-share">📤 Condividi</button>
        <button class="btn btn-ghost btn--block" id="diary-wrapped-download">💾 Salva immagine</button>
      </div>
    `;
    overlay.querySelector("#diary-wrapped-share").addEventListener("click", async () => {
      try {
        const file = new File([blob], `diary-wrapped-${targetYear}.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Diary Wrapped ${targetYear}` });
        } else {
          // Fallback: download
          downloadBlob(blob, `diary-wrapped-${targetYear}.png`);
        }
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      }
    });
    overlay.querySelector("#diary-wrapped-download").addEventListener("click", () => {
      downloadBlob(blob, `diary-wrapped-${targetYear}.png`);
    });
  } catch (err) {
    console.error(err);
    overlay.querySelector(".diary-wrapped-body").innerHTML = `
      <p class="diary-wrapped-empty">❌ Errore: ${err.message}</p>
    `;
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
