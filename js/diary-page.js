// Diario lista timeline + ricerca + stats
import {
  listEntries, dateToId, todayId, idToDate, formatItalianDate,
  computeStreak, moodCounts, MOODS,
} from "./diary-data.js";
import { listItems as listGarments } from "./wardrobe.js";
import { findWornGarments } from "./diary-data.js";

let state = { entries: [], garments: [], filter: "" };

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

window.addEventListener("DOMContentLoaded", async () => {
  $("#fab-add").addEventListener("click", () => {
    location.href = `./diary-detail.html?date=${todayId()}`;
  });
  $("#btn-today").addEventListener("click", () => {
    location.href = `./diary-detail.html?date=${todayId()}`;
  });
  $("#search-input").addEventListener("input", (e) => {
    state.filter = e.target.value.trim().toLowerCase();
    renderTimeline();
  });
  await refresh();
});

async function refresh() {
  const [entries, garments] = await Promise.all([
    listEntries().catch(() => []),
    listGarments().catch(() => []),
  ]);
  state.entries = entries;
  state.garments = garments;
  renderStats();
  renderTimeline();
}

function renderStats() {
  $("#stat-streak").textContent = computeStreak(state.entries);
  $("#stat-total").textContent = state.entries.length;
  const mc = moodCounts(state.entries);
  let topMood = null;
  let topCount = 0;
  for (const [k, v] of Object.entries(mc)) {
    if (v > topCount) { topMood = k; topCount = v; }
  }
  if (topMood) {
    const def = MOODS.find(m => m.key === topMood);
    $("#stat-mood").textContent = def ? def.emoji : topMood;
  } else {
    $("#stat-mood").textContent = "—";
  }
}

function renderTimeline() {
  const wrap = $("#diary-timeline");
  let entries = state.entries;
  if (state.filter) {
    const f = state.filter;
    entries = entries.filter(e => {
      const text = ((e.title || "") + " " + (e.body || "") + " " + (e.tags || []).join(" ")).toLowerCase();
      return text.includes(f);
    });
  }
  if (entries.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${state.filter ? "🔍" : "📔"}</div>
      <p class="empty-text">${state.filter ? "Nessun risultato" : "Nessuna pagina ancora"}</p>
      <p class="empty-hint">${state.filter ? "" : "Tocca + per scrivere oggi"}</p>
    </div>`;
    return;
  }

  // Raggruppa per anno-mese
  const groups = new Map();
  for (const e of entries) {
    const d = idToDate(e.id);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const html = Array.from(groups.entries()).map(([key, items]) => {
    const [y, m] = key.split("-");
    const monthName = new Date(Number(y), Number(m) - 1, 1)
      .toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return `<div class="diary-month-group">
      <h3 class="diary-month-title">${capitalize(monthName)}</h3>
      <div class="diary-entries">
        ${items.map(renderRow).join("")}
      </div>
    </div>`;
  }).join("");
  wrap.innerHTML = html;

  wrap.querySelectorAll(".diary-row").forEach(row => {
    row.addEventListener("click", () => {
      location.href = `./diary-detail.html?date=${row.dataset.id}`;
    });
  });
}

function renderRow(e) {
  const d = idToDate(e.id);
  const day = d.getDate();
  const wd = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"][d.getDay()];
  const mood = e.mood ? (MOODS.find(m => m.key === e.mood)?.emoji || "") : "";
  const preview = stripHtml(e.body || "").slice(0, 100);
  const cover = (e.photos && e.photos[0]?.url) || null;
  const worn = findWornGarments(state.garments, e.id);
  const wornCount = worn.length;
  return `<div class="diary-row" data-id="${e.id}">
    <div class="diary-row-date">
      <div class="diary-row-day">${day}</div>
      <div class="diary-row-wd">${wd}</div>
    </div>
    <div class="diary-row-body">
      <div class="diary-row-head">
        ${mood ? `<span class="diary-row-mood">${mood}</span>` : ""}
        <span class="diary-row-title">${escapeHtml(e.title || "(senza titolo)")}</span>
      </div>
      ${preview ? `<p class="diary-row-preview">${escapeHtml(preview)}</p>` : ""}
      <div class="diary-row-meta">
        ${wornCount > 0 ? `<span class="diary-row-worn">👗 ${wornCount} cap${wornCount === 1 ? "o" : "i"}</span>` : ""}
        ${(e.tags || []).slice(0, 3).map(t => `<span class="diary-row-tag">#${escapeHtml(t)}</span>`).join("")}
      </div>
    </div>
    ${cover ? `<div class="diary-row-cover" style="background-image:url('${cover}')"></div>` : ""}
  </div>`;
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
