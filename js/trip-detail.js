// =============================================================================
// Trip detail — vista singolo viaggio + generatore outfit
// =============================================================================

import * as Theme from "./theme/manager.js";
import { listItems } from "./wardrobe.js";
import { getTrip, updateTrip, deleteTrip, formatTripDates } from "./trips-data.js";
import { generateTripOutfits, regenerateDay } from "./trips-generator.js";
import { OCCASION_OPTIONS } from "./trips-data.js";

Theme.init();

const state = {
  trip: null,
  items: [],
  itemsById: new Map(),
};

// =============================================================================
// Toast
// =============================================================================
function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast hidden"; }, 2400);
}

// =============================================================================
// Helpers
// =============================================================================
function getTripIdFromUrl() {
  return new URLSearchParams(location.search).get("id");
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function countryFlag(code) {
  if (!code || code.length !== 2) return "🌍";
  const A = 0x1F1E6, base = "A".charCodeAt(0);
  const c = code.toUpperCase();
  return String.fromCodePoint(A + (c.charCodeAt(0) - base)) +
         String.fromCodePoint(A + (c.charCodeAt(1) - base));
}

const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTHS_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
function formatDayHeader(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_IT[d.getMonth()]}`;
}

function listDaysBetween(startISO, endISO) {
  const out = [];
  if (!startISO || !endISO) return out;
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function computeStatus(t, today) {
  if (t.status === "frozen") return "frozen";
  if (t.status === "done")   return "done";
  if (!t.start_date || !t.end_date) return "planning";
  if (today < t.start_date) return "upcoming";
  if (today > t.end_date)   return "done";
  return "active";
}
function statusBadgeHtml(status, t, today) {
  if (status === "upcoming") {
    const days = Math.max(0, Math.round((new Date(t.start_date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000));
    if (days === 0) return `<span class="trip-badge trip-badge--gold">Parte oggi!</span>`;
    if (days === 1) return `<span class="trip-badge trip-badge--gold">Domani</span>`;
    if (days <= 7)  return `<span class="trip-badge trip-badge--gold">−${days} giorni</span>`;
    return `<span class="trip-badge">Tra ${days} giorni</span>`;
  }
  if (status === "active") return `<span class="trip-badge trip-badge--success">In corso</span>`;
  if (status === "done")   return `<span class="trip-badge trip-badge--muted">Completato</span>`;
  if (status === "frozen") return `<span class="trip-badge trip-badge--muted">In pausa</span>`;
  return `<span class="trip-badge">Pianificazione</span>`;
}

// =============================================================================
// Render
// =============================================================================
async function load() {
  const id = getTripIdFromUrl();
  const loading = document.getElementById("td-loading");
  const errBox = document.getElementById("td-error");
  const content = document.getElementById("td-content");
  loading.classList.remove("hidden");
  errBox.classList.add("hidden");
  content.classList.add("hidden");

  if (!id) { showError(); return; }

  try {
    const [trip, items] = await Promise.all([
      getTrip(id),
      listItems(),
    ]);
    if (!trip) { showError(); return; }
    state.trip = trip;
    state.items = items;
    state.itemsById = new Map(items.map(it => [it.id, it]));
  } catch (err) {
    console.error(err);
    toast("Errore caricamento viaggio", "error");
    showError();
    return;
  }

  loading.classList.add("hidden");
  content.classList.remove("hidden");
  renderHeader();
  renderOutfitsSection();
}

function showError() {
  document.getElementById("td-loading").classList.add("hidden");
  document.getElementById("td-error").classList.remove("hidden");
}

function renderHeader() {
  const t = state.trip;
  const today = todayISO();
  document.getElementById("td-title").textContent = t.name || "Viaggio";
  document.getElementById("td-flag").textContent = countryFlag(t.destination?.country_code);
  document.getElementById("td-name").textContent = t.name || t.destination?.name || "Viaggio";
  const dest = t.destination?.name || "—";
  const sub = t.destination?.admin1 ? `${dest}, ${t.destination.admin1}` : dest;
  document.getElementById("td-meta").innerHTML =
    `<span>📍 ${escapeHtml(sub)}</span> · <span>📅 ${escapeHtml(formatTripDates(t.start_date, t.end_date))}</span> · <span>⏱️ ${t.days || 0} ${t.days === 1 ? "giorno" : "giorni"}</span>`;
  document.getElementById("td-badge").innerHTML = statusBadgeHtml(computeStatus(t, today), t, today);

  const occHtml = (t.occasions || []).map(k => {
    const opt = OCCASION_OPTIONS.find(x => x.key === k);
    return opt ? `<span class="trip-tag">${opt.icon} ${opt.label}</span>` : "";
  }).join("");
  document.getElementById("td-occasions").innerHTML = occHtml;
}

function renderOutfitsSection() {
  const empty = document.getElementById("td-empty-outfits");
  const days = document.getElementById("td-days");
  const actions = document.getElementById("td-actions");
  const outfitsByDay = state.trip.outfits_by_day || {};
  const hasOutfits = Object.keys(outfitsByDay).length > 0;

  if (!hasOutfits) {
    empty.classList.remove("hidden");
    days.classList.add("hidden");
    actions.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  days.classList.remove("hidden");
  actions.classList.remove("hidden");
  renderDays(outfitsByDay);
}

function renderDays(outfitsByDay) {
  const list = document.getElementById("td-days");
  const days = listDaysBetween(state.trip.start_date, state.trip.end_date);
  const occasionsByDay = state.trip.occasions_by_day || {};
  const occList = state.trip.occasions || [];

  list.innerHTML = days.map((iso, idx) => {
    const itemIds = outfitsByDay[iso] || [];
    const occKey = occasionsByDay[iso] || (occList.length ? occList[idx % occList.length] : null);
    const occOpt = occKey ? OCCASION_OPTIONS.find(x => x.key === occKey) : null;
    const occBadge = occOpt
      ? `<span class="td-day-occ">${occOpt.icon} ${escapeHtml(occOpt.label)}</span>`
      : "";

    const thumbs = itemIds.map(id => {
      const it = state.itemsById.get(id);
      if (!it) return `<div class="td-thumb td-thumb--missing">?</div>`;
      if (it.photo_url) return `<div class="td-thumb"><img src="${it.photo_url}" alt="" loading="lazy" /></div>`;
      return `<div class="td-thumb td-thumb--placeholder">${categoryEmoji(it.category)}</div>`;
    }).join("");

    return `<article class="td-day-card" data-iso="${iso}">
      <header class="td-day-head">
        <div class="td-day-title">
          <strong>${escapeHtml(formatDayHeader(iso))}</strong>
          ${occBadge}
        </div>
        <button class="td-day-shuffle" data-action="shuffle-day" data-iso="${iso}" aria-label="Ricomponi questo giorno">🔄</button>
      </header>
      <div class="td-thumbs">
        ${thumbs || '<div class="td-day-empty">Nessun capo</div>'}
      </div>
    </article>`;
  }).join("");

  // Bind shuffle giorno
  list.querySelectorAll('[data-action="shuffle-day"]').forEach(btn => {
    btn.addEventListener("click", () => onShuffleDay(btn.dataset.iso));
  });
}

function categoryEmoji(cat) {
  const map = { top: "👕", bottom: "👖", scarpe: "👟", accessori: "👜", capospalla: "🧥", vestito: "👗", completo: "🤵" };
  return map[String(cat || "").toLowerCase()] || "🏷️";
}

// =============================================================================
// Generazione / shuffle
// =============================================================================
async function onGenerate() {
  if (!state.items.length) {
    toast("Aggiungi prima qualche capo al guardaroba", "default");
    return;
  }
  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.textContent = "✨ Generazione in corso...";
  try {
    const { outfits, occasionByDay } = generateTripOutfits(state.trip, state.items);
    await updateTrip(state.trip.id, {
      outfits_by_day:    outfits,
      occasions_by_day:  occasionByDay,
    });
    state.trip.outfits_by_day = outfits;
    state.trip.occasions_by_day = occasionByDay;
    renderOutfitsSection();
    toast("✨ Outfit generati!", "success");
  } catch (err) {
    console.error(err);
    toast("Errore generazione: " + err.message, "error");
    btn.disabled = false;
    btn.textContent = "✨ Genera outfit del viaggio";
  }
}

async function onShuffleAll() {
  if (!confirm("Rigenerare TUTTI gli outfit del viaggio? L'attuale composizione verrà sostituita.")) return;
  const btn = document.getElementById("btn-shuffle-all");
  btn.disabled = true;
  try {
    const { outfits, occasionByDay } = generateTripOutfits(state.trip, state.items, { seed: Date.now() + Math.random() * 1000 });
    await updateTrip(state.trip.id, {
      outfits_by_day:    outfits,
      occasions_by_day:  occasionByDay,
    });
    state.trip.outfits_by_day = outfits;
    state.trip.occasions_by_day = occasionByDay;
    renderDays(outfits);
    toast("🔀 Outfit rigenerati", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function onShuffleDay(iso) {
  try {
    const newIds = regenerateDay(state.trip, state.items, iso, state.trip.outfits_by_day, { seed: Date.now() + Math.random() * 1000 });
    const newOutfits = { ...(state.trip.outfits_by_day || {}), [iso]: newIds };
    await updateTrip(state.trip.id, { outfits_by_day: newOutfits });
    state.trip.outfits_by_day = newOutfits;
    renderDays(newOutfits);
    toast("🔄 Outfit del giorno aggiornato", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

async function onDelete() {
  if (!confirm(`Eliminare definitivamente "${state.trip.name || "questo viaggio"}"?`)) return;
  try {
    await deleteTrip(state.trip.id);
    location.replace("./trips.html");
  } catch (err) {
    toast("Errore eliminazione: " + err.message, "error");
  }
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-generate").addEventListener("click", onGenerate);
  document.getElementById("btn-shuffle-all").addEventListener("click", onShuffleAll);
  document.getElementById("btn-delete-trip").addEventListener("click", onDelete);
  load();
});
