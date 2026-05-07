// =============================================================================
// Storico outfit — timeline verticale a scroll infinito
// =============================================================================
// Aggrega CalendarEntry (worn/planned) + DiaryEntry per data, raggruppa per
// mese, render alternato sx/dx come la timeline del + ma scorrevole.
// Lazy load chunk di 30 entry alla volta via IntersectionObserver sul sentinel.
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Cal from "./calendar-data.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import { listEntries as listDiary, MOODS } from "./diary-data.js";

Theme.init();

const state = {
  byDate: [],          // array ordinato desc { date, entry, outfit, items, diary }
  filtered: [],        // applicato filtro
  rendered: 0,         // quanti elementi ho gia' renderizzato
  chunk: 30,           // dimensione lazy load
  filterType: "all",
  filterMood: "all",
  itemsById: new Map(),
  outfitsById: new Map(),
  observer: null,
};

// =============================================================================
function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function fmtMonth(date) {
  return capitalize(date.toLocaleDateString("it-IT", { month: "long", year: "numeric" }));
}
function fmtDay(date) {
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}
function fmtWeekday(date) {
  return date.toLocaleDateString("it-IT", { weekday: "short" }).replace(/\.$/, "");
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// =============================================================================
async function boot() {
  const [items, outfits, calEntries, diary] = await Promise.all([
    Wardrobe.listItems().catch(() => []),
    Outfit.listSavedOutfits().catch(() => []),
    Cal.listEntries().catch(() => []),
    listDiary().catch(() => []),
  ]);
  state.itemsById   = new Map(items.map(i => [i.id, i]));
  state.outfitsById = new Map(outfits.map(o => [o.id, o]));
  const diaryByDate = new Map(diary.map(d => [d.id, d]));

  // Costruisco byDate: una entry per ogni CalendarEntry (worn/planned)
  // Aggiungo anche le data che hanno solo diary (mood) ma nessun outfit
  const map = new Map(); // dateKey -> { date, entry, outfit, items, diary }
  for (const e of calEntries) {
    const dateKey = e.date;
    const outfit = state.outfitsById.get(e.outfit_id);
    const itemList = (outfit?.item_ids || [])
      .map(id => state.itemsById.get(id))
      .filter(Boolean);
    map.set(dateKey, {
      date: new Date(dateKey),
      dateKey,
      entry: e,
      outfit,
      items: itemList,
      diary: diaryByDate.get(dateKey) || null,
    });
  }
  // Aggiungo le entry diary che NON hanno gia' un outfit (mood-only)
  for (const d of diary) {
    if (!map.has(d.id)) {
      map.set(d.id, {
        date: new Date(d.id),
        dateKey: d.id,
        entry: null,
        outfit: null,
        items: [],
        diary: d,
      });
    }
  }

  state.byDate = Array.from(map.values())
    .sort((a, b) => b.date - a.date);

  populateMoodFilter();
  applyFilter();

  document.getElementById("oh-stats")?.classList.remove("hidden");
  document.getElementById("oh-total").textContent  = state.byDate.filter(x => x.outfit).length;
  document.getElementById("oh-days").textContent   = state.byDate.length;
  const months = new Set(state.byDate.map(x =>
    `${x.date.getFullYear()}-${x.date.getMonth()}`));
  document.getElementById("oh-months").textContent = months.size;
}

function populateMoodFilter() {
  const sel = document.getElementById("oh-filter-mood");
  if (!sel) return;
  const moodsInUse = new Set(state.byDate.map(x => x.diary?.mood).filter(Boolean));
  for (const m of MOODS) {
    if (moodsInUse.has(m.key)) {
      const opt = document.createElement("option");
      opt.value = m.key;
      opt.textContent = `${m.emoji} ${m.label}`;
      sel.appendChild(opt);
    }
  }
}

function applyFilter() {
  let arr = state.byDate.slice();
  if (state.filterType === "worn") {
    arr = arr.filter(x => x.entry?.type === "worn");
  } else if (state.filterType === "planned") {
    arr = arr.filter(x => x.entry?.type === "planned");
  }
  if (state.filterMood !== "all") {
    arr = arr.filter(x => x.diary?.mood === state.filterMood);
  }
  state.filtered = arr;
  state.rendered = 0;
  document.getElementById("oh-timeline").innerHTML = "";
  renderChunk();
}

// =============================================================================
function renderChunk() {
  const wrap = document.getElementById("oh-timeline");
  if (!wrap) return;

  if (state.filtered.length === 0) {
    wrap.innerHTML = `<div class="oh-empty">
      <div class="oh-empty-icon">📍</div>
      <p>Nessun outfit nello storico.</p>
      <p class="oh-empty-hint">Pianifica un outfit dal calendario o segna come "indossato oggi" un capo dal modal.</p>
    </div>`;
    return;
  }

  const start = state.rendered;
  const end = Math.min(start + state.chunk, state.filtered.length);

  let html = "";
  let lastMonth = null;
  if (start > 0) {
    const prev = state.filtered[start - 1];
    lastMonth = `${prev.date.getFullYear()}-${prev.date.getMonth()}`;
  }

  for (let i = start; i < end; i++) {
    const it = state.filtered[i];
    const monthKey = `${it.date.getFullYear()}-${it.date.getMonth()}`;
    if (monthKey !== lastMonth) {
      html += `<div class="oh-month">
        <span class="oh-month-pill">${escapeHtml(fmtMonth(it.date))}</span>
      </div>`;
      lastMonth = monthKey;
    }
    const side = (i % 2 === 0) ? "left" : "right";
    html += renderCard(it, side);
  }

  wrap.insertAdjacentHTML("beforeend", html);
  state.rendered = end;

  // Re-bind click handlers per le card appena aggiunte
  wrap.querySelectorAll(".oh-card:not([data-bound])").forEach(c => {
    c.dataset.bound = "1";
    c.addEventListener("click", () => onCardClick(c.dataset.date));
  });
}

function renderCard(item, side) {
  const { date, entry, outfit, items, diary } = item;
  const day = date.getDate();
  const wd = fmtWeekday(date);

  const moodEmoji = diary?.mood ? (MOODS.find(m => m.key === diary.mood)?.emoji || "") : "";
  const isWorn   = entry?.type === "worn";
  const isPlan   = entry?.type === "planned";

  // Mini-thumbnail collage dei primi 3 capi
  const thumbs = items.slice(0, 3).map((it, idx) => `
    <div class="oh-thumb oh-thumb-${idx}" style="${it.photo_url
      ? `background-image:url('${it.photo_url}')`
      : `background:#3a3a3a; display:flex; align-items:center; justify-content:center; font-size:18px;`}">${
        it.photo_url ? "" : "👕"
      }</div>
  `).join("");
  const moreCount = items.length > 3 ? `<div class="oh-thumb oh-thumb-more">+${items.length - 3}</div>` : "";

  const subtitle = outfit
    ? escapeHtml(outfit.title || "Outfit")
    : (diary ? "Solo pagina diario" : "Nessun outfit");

  const occasion = outfit?.context ? `<span class="oh-occasion">${escapeHtml(outfit.context)}</span>` : "";
  const statusBadge = isWorn
    ? `<span class="oh-badge oh-badge-worn">✓ Indossato</span>`
    : isPlan
      ? `<span class="oh-badge oh-badge-plan">📅 Pianificato</span>`
      : "";

  return `<div class="oh-row oh-row-${side}">
    <div class="oh-card" data-date="${escapeHtml(item.dateKey)}">
      <div class="oh-card-head">
        <div class="oh-date-block">
          <div class="oh-date-day">${day}</div>
          <div class="oh-date-wd">${escapeHtml(wd)}</div>
        </div>
        ${moodEmoji ? `<div class="oh-mood">${moodEmoji}</div>` : ""}
      </div>
      ${items.length > 0 ? `<div class="oh-thumbs">${thumbs}${moreCount}</div>` : ""}
      <div class="oh-card-body">
        <div class="oh-title">${subtitle}</div>
        <div class="oh-meta">
          ${statusBadge}
          ${occasion}
        </div>
      </div>
    </div>
    <div class="oh-connector"></div>
    <div class="oh-dot"></div>
  </div>`;
}

function onCardClick(dateKey) {
  // Apre il calendario al giorno corrispondente (e l'utente puo' modificare)
  location.href = `./calendar.html#${dateKey}`;
}

// =============================================================================
// Lazy load via IntersectionObserver
// =============================================================================
function setupLazyLoad() {
  const sentinel = document.getElementById("oh-sentinel");
  if (!sentinel) return;
  state.observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting && state.rendered < state.filtered.length) {
        renderChunk();
      }
    }
  }, { rootMargin: "200px" });
  state.observer.observe(sentinel);
}

// =============================================================================
// Filtri UI
// =============================================================================
function bindFilters() {
  document.getElementById("btn-filter").addEventListener("click", () => {
    document.getElementById("oh-filters").classList.toggle("hidden");
  });
  document.getElementById("oh-filter-type").addEventListener("change", (e) => {
    state.filterType = e.target.value;
    applyFilter();
  });
  document.getElementById("oh-filter-mood").addEventListener("change", (e) => {
    state.filterMood = e.target.value;
    applyFilter();
  });
}

// =============================================================================
window.addEventListener("DOMContentLoaded", async () => {
  bindFilters();
  await boot();
  setupLazyLoad();
});
