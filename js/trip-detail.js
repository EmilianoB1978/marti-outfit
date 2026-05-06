// =============================================================================
// Trip detail — vista singolo viaggio + generatore outfit
// =============================================================================

import * as Theme from "./theme/manager.js";
import { listItems } from "./wardrobe.js";
import { getTrip, updateTrip, deleteTrip, duplicateTrip, toggleTripFreeze, getReservedItemIds, formatTripDates } from "./trips-data.js";
import { generateTripOutfits, regenerateDay } from "./trips-generator.js";
import { OCCASION_OPTIONS, LUGGAGE_TYPES, getLuggage, estimateItemsVolume, estimateItemsWeightGrams } from "./trips-data.js";
import { computeWrappedStats, buildWrappedImageBlob } from "./trip-wrapped.js";
import { buildMoodBoardBlob } from "./trip-mood-board.js";
import { getDressCode, STRICTNESS_LABELS } from "./trips-dresscode.js";

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
  renderThermalProfile();
  renderDressCodeSection();
  renderLuggageSection();
  renderOutfitsSection();
  updateFreezeButton();
  renderWrappedIfDone();

  // Mostra il banner conflitti gia' al load se ci sono altri viaggi sovrapposti
  // con capi in comune (anche se non si rigenerano subito).
  try {
    const { conflicts, reserved } = await getReservedItemIds(state.trip.id, state.trip.start_date, state.trip.end_date);
    renderConflictBanner(conflicts, reserved.size);
  } catch (e) { /* silenzioso */ }
}

// =============================================================================
// LUGGAGE
// =============================================================================
function renderLuggageSection() {
  const picker = document.getElementById("luggage-picker");
  const luggageKey = state.trip.luggage_type || "cabina";

  // Picker chip
  picker.innerHTML = LUGGAGE_TYPES.map(l =>
    `<button type="button" class="luggage-chip${l.key === luggageKey ? " is-active" : ""}" data-key="${l.key}" aria-label="${escapeHtml(l.label)}">
      <span class="luggage-chip-icon">${l.icon}</span>
      <span class="luggage-chip-label">${escapeHtml(l.label)}</span>
    </button>`
  ).join("");
  picker.querySelectorAll(".luggage-chip").forEach(b => {
    b.addEventListener("click", () => onLuggageChange(b.dataset.key));
  });

  updateLuggageDisplay({ animate: false });
}

function getPackedItems() {
  const outfits = state.trip.outfits_by_day || {};
  const ids = new Set();
  for (const arr of Object.values(outfits)) for (const id of arr) ids.add(id);
  return Array.from(ids).map(id => state.itemsById.get(id)).filter(Boolean);
}

function updateLuggageDisplay(opts = {}) {
  const luggageKey = state.trip.luggage_type || "cabina";
  const luggage = getLuggage(luggageKey);
  const items = getPackedItems();
  const volume = estimateItemsVolume(items);
  const volPct = Math.min(100, Math.round((volume / luggage.capacity_l) * 100));

  // Peso totale stimato dai weight_class dei capi.
  // Usa i grammi personalizzati dell'utente in Aspetto -> Pesi se modificati.
  const weightsMap = (Theme.getPreferences() || {}).itemWeights;
  const grams = estimateItemsWeightGrams(items, weightsMap);
  const kg = Math.round(grams / 100) / 10;   // 1 decimale
  const weightPct = Math.min(100, Math.round((kg / luggage.max_kg) * 100));

  document.getElementById("luggage-icon").textContent = luggage.icon;
  document.getElementById("luggage-counter").textContent =
    `${items.length} ${items.length === 1 ? "capo" : "capi"} · ~${volume}L / ${luggage.capacity_l}L · ~${kg} / ${luggage.max_kg} kg`;
  document.getElementById("luggage-dims").textContent = `${luggage.dims} · max ${luggage.max_kg} kg`;

  // La barra ora rappresenta il PIÙ PIENO dei due (volume o peso): cosi'
  // se sfori il peso prima del volume (es. tanti capi pesanti in zaino),
  // la barra te lo dice.
  const pct = Math.max(volPct, weightPct);
  const fill = document.getElementById("luggage-bar-fill");
  fill.style.width = pct + "%";
  fill.classList.remove("is-warning", "is-danger");
  if (pct >= 95) fill.classList.add("is-danger");
  else if (pct >= 80) fill.classList.add("is-warning");

  // Lista capi (thumb)
  const list = document.getElementById("luggage-items");
  if (items.length === 0) {
    list.innerHTML = `<div class="luggage-empty">Genera gli outfit per vedere i capi nella valigia</div>`;
  } else {
    list.innerHTML = items.map((it, i) => {
      const delay = opts.animate ? `style="animation-delay:${i * 50}ms"` : "";
      const cls = "luggage-thumb" + (opts.animate ? " is-dropping" : "");
      const photo = it.photo_url
        ? `<img src="${it.photo_url}" alt="" loading="lazy" />`
        : `<span>${categoryEmoji(it.category)}</span>`;
      return `<div class="${cls}" ${delay}>${photo}</div>`;
    }).join("");
  }

  // Animazione "scuoti la valigia" alla generazione
  if (opts.animate) {
    const stage = document.getElementById("luggage-stage");
    stage.classList.remove("is-shake");
    void stage.offsetWidth; // reflow
    stage.classList.add("is-shake");
  }
}

async function onLuggageChange(key) {
  if (key === state.trip.luggage_type) return;
  state.trip.luggage_type = key;
  // Aggiorna UI subito
  document.querySelectorAll(".luggage-chip").forEach(b => {
    b.classList.toggle("is-active", b.dataset.key === key);
  });
  updateLuggageDisplay({ animate: false });
  // Salva su DB
  try {
    await updateTrip(state.trip.id, { luggage_type: key });
  } catch (err) {
    toast("Errore salvataggio bagaglio", "error");
  }
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
    // Anti-conflitto: trova capi gia' "prenotati" da altri viaggi sovrapposti
    const { reserved, conflicts } = await getReservedItemIds(
      state.trip.id, state.trip.start_date, state.trip.end_date
    );
    const { outfits, occasionByDay } = generateTripOutfits(state.trip, state.items, { excludeIds: reserved });
    await updateTrip(state.trip.id, {
      outfits_by_day:    outfits,
      occasions_by_day:  occasionByDay,
    });
    state.trip.outfits_by_day = outfits;
    state.trip.occasions_by_day = occasionByDay;
    renderOutfitsSection();
    updateLuggageDisplay({ animate: true });
    renderConflictBanner(conflicts, reserved.size);
    if (conflicts.length > 0) {
      toast(`✨ Outfit generati · ${reserved.size} capi esclusi (in altro viaggio)`, "default");
    } else {
      toast("✨ Outfit generati!", "success");
    }
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
    const { reserved, conflicts } = await getReservedItemIds(state.trip.id, state.trip.start_date, state.trip.end_date);
    const { outfits, occasionByDay } = generateTripOutfits(state.trip, state.items, { seed: Date.now() + Math.random() * 1000, excludeIds: reserved });
    await updateTrip(state.trip.id, {
      outfits_by_day:    outfits,
      occasions_by_day:  occasionByDay,
    });
    state.trip.outfits_by_day = outfits;
    state.trip.occasions_by_day = occasionByDay;
    renderDays(outfits);
    updateLuggageDisplay({ animate: true });
    renderConflictBanner(conflicts, reserved.size);
    toast("🔀 Outfit rigenerati", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function onShuffleDay(iso) {
  try {
    const { reserved } = await getReservedItemIds(state.trip.id, state.trip.start_date, state.trip.end_date);
    const newIds = regenerateDay(state.trip, state.items, iso, state.trip.outfits_by_day, { seed: Date.now() + Math.random() * 1000, excludeIds: reserved });
    const newOutfits = { ...(state.trip.outfits_by_day || {}), [iso]: newIds };
    await updateTrip(state.trip.id, { outfits_by_day: newOutfits });
    state.trip.outfits_by_day = newOutfits;
    renderDays(newOutfits);
    updateLuggageDisplay({ animate: false });
    toast("🔄 Outfit del giorno aggiornato", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

// =============================================================================
// CONFLITTO CAPI tra viaggi sovrapposti — banner informativo
// =============================================================================
function renderConflictBanner(conflicts, reservedCount) {
  const box = document.getElementById("td-conflicts");
  if (!box) return;
  if (!conflicts || conflicts.length === 0 || reservedCount === 0) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  const tripsList = conflicts.map(c =>
    `<a class="td-conflict-trip" href="./trip-detail.html?id=${escapeHtml(c.tripId)}">📍 ${escapeHtml(c.tripName)} (${c.itemIds.length})</a>`
  ).join("");
  box.innerHTML = `
    <div class="td-conflict-icon">⚠️</div>
    <div class="td-conflict-body">
      <div class="td-conflict-title">${reservedCount} ${reservedCount === 1 ? "capo riservato" : "capi riservati"} ad altri viaggi</div>
      <div class="td-conflict-sub">Marty li ha esclusi dalla generazione per non sovrapporre con:</div>
      <div class="td-conflict-trips">${tripsList}</div>
    </div>
  `;
  box.classList.remove("hidden");
}

// =============================================================================
// FREEZE / DUPLICATE
// =============================================================================
async function onToggleFreeze() {
  try {
    const newStatus = await toggleTripFreeze(state.trip.id);
    state.trip.status = newStatus;
    renderHeader();
    updateFreezeButton();
    toast(newStatus === "frozen" ? "❄️ Viaggio messo in pausa" : "▶ Viaggio riattivato", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

function updateFreezeButton() {
  const btn = document.getElementById("btn-freeze-trip");
  if (!btn) return;
  btn.textContent = state.trip.status === "frozen" ? "▶ Riattiva viaggio" : "❄️ Metti in pausa";
}

// =============================================================================
// TRIP WRAPPED — visibile solo per viaggi 'done'
// =============================================================================
function renderWrappedIfDone() {
  const box = document.getElementById("td-wrapped");
  if (!box) return;
  const today = todayISO();
  const status = computeStatus(state.trip, today);
  if (status !== "done") {
    box.classList.add("hidden");
    return;
  }
  const outfits = state.trip.outfits_by_day || {};
  if (Object.keys(outfits).length === 0) {
    // Niente outfit generati -> niente da wrappare
    box.classList.add("hidden");
    return;
  }

  const weightsMap = (Theme.getPreferences() || {}).itemWeights;
  const stats = computeWrappedStats(state.trip, state.items, weightsMap);
  state.wrappedStats = stats;

  // Periodo
  document.getElementById("wrapped-period").textContent =
    formatTripDates(state.trip.start_date, state.trip.end_date);

  // Big numbers
  document.getElementById("wrap-days").textContent    = stats.days;
  document.getElementById("wrap-packed").textContent  = stats.packedCount;
  document.getElementById("wrap-outfits").textContent = stats.outfitDays;

  // MVP
  const mvpBlock = document.getElementById("wrap-mvp-block");
  if (stats.mvp && stats.mvp.item) {
    const m = stats.mvp.item;
    const subcat = m.subcategory || m.category || "Capo";
    const color = m.color_primary || m.color || "";
    document.getElementById("wrap-mvp-name").textContent =
      `${capitalize(subcat)}${color ? " " + color : ""}`;
    document.getElementById("wrap-mvp-count").textContent =
      `Indossato ${stats.mvp.count} ${stats.mvp.count === 1 ? "giorno" : "giorni"} su ${stats.days}`;
    const thumbEl = document.getElementById("wrap-mvp-thumb");
    if (m.photo_url) {
      thumbEl.innerHTML = `<img src="${escapeHtml(m.photo_url)}" alt="" />`;
    } else {
      thumbEl.textContent = categoryEmoji(m.category);
    }
    mvpBlock.classList.remove("hidden");
  } else {
    mvpBlock.classList.add("hidden");
  }

  // Palette
  const paletteBlock = document.getElementById("wrap-palette-block");
  const palette = document.getElementById("wrap-palette");
  if (stats.colorPalette.length > 0) {
    palette.innerHTML = stats.colorPalette.map(c =>
      `<div class="wrapped-color-chip" style="background:${escapeHtml(c.hex)}" title="${escapeHtml(c.name)}">
        <span class="wrapped-color-name">${escapeHtml(c.name)}</span>
        <span class="wrapped-color-count">${c.count}</span>
      </div>`
    ).join("");
    paletteBlock.classList.remove("hidden");
  } else {
    paletteBlock.classList.add("hidden");
  }

  // Occasioni
  const occBlock = document.getElementById("wrap-occ-block");
  const occList = document.getElementById("wrap-occ-list");
  if (stats.occasionsBreakdown.length > 0) {
    occList.innerHTML = stats.occasionsBreakdown.map(o =>
      `<div class="wrapped-occ-row">
        <span class="wrapped-occ-icon">${o.icon}</span>
        <span class="wrapped-occ-label">${escapeHtml(o.label)}</span>
        <span class="wrapped-occ-bar"><span class="wrapped-occ-fill" style="width:${o.pct}%"></span></span>
        <span class="wrapped-occ-count">${o.count}gg</span>
      </div>`
    ).join("");
    occBlock.classList.remove("hidden");
  } else {
    occBlock.classList.add("hidden");
  }

  // Reuse + valigia
  document.getElementById("wrap-reuse").textContent   = stats.reuseRate + "%";
  document.getElementById("wrap-luggage").textContent = `${stats.luggage.icon} ${stats.weightKg}kg`;

  box.classList.remove("hidden");
}

async function onShareWrapped() {
  const btn = document.getElementById("btn-share-wrapped");
  if (!state.wrappedStats) return;
  btn.disabled = true;
  btn.textContent = "📸 Generazione immagine...";
  try {
    const blob = await buildWrappedImageBlob(state.trip, state.wrappedStats);
    if (!blob) throw new Error("Impossibile generare immagine");
    const file = new File([blob], `wrapped-${state.trip.id}.png`, { type: "image/png" });
    const shareData = {
      title: state.trip.name || "Trip Wrapped",
      text: `✨ Il mio Trip Wrapped: ${state.trip.days || ""} giorni, ${state.wrappedStats.packedCount} capi.`,
      files: [file],
    };
    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
    } else {
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `wrapped-${state.trip.id}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Immagine scaricata", "success");
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error(err);
      toast("Errore condivisione: " + err.message, "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "📸 Condividi il Wrapped";
  }
}

// =============================================================================
// MOOD BOARD — pre/durante viaggio: griglia 3x3 con foto degli outfit
// =============================================================================
// =============================================================================
// PROFILO TERMICO — offset °C personale per generazione outfit
// =============================================================================
function renderThermalProfile() {
  const row = document.getElementById("td-thermal-row");
  const hint = document.getElementById("td-thermal-hint");
  if (!row) return;
  const current = Number(state.trip.thermal_offset) || 0;

  row.querySelectorAll(".td-thermal-chip").forEach(b => {
    const off = Number(b.dataset.offset) || 0;
    b.classList.toggle("is-active", off === current);
  });
  if (hint) hint.textContent = thermalHintText(current);

  row.onclick = async (e) => {
    const btn = e.target.closest(".td-thermal-chip");
    if (!btn) return;
    const newOffset = Number(btn.dataset.offset) || 0;
    if (newOffset === Number(state.trip.thermal_offset)) return;
    state.trip.thermal_offset = newOffset;
    row.querySelectorAll(".td-thermal-chip").forEach(b => {
      b.classList.toggle("is-active", Number(b.dataset.offset) === newOffset);
    });
    if (hint) hint.textContent = thermalHintText(newOffset);
    try {
      await updateTrip(state.trip.id, { thermal_offset: newOffset });
    } catch (err) { toast("Errore salvataggio profilo termico", "error"); }
  };
}

function thermalHintText(off) {
  if (off <= -3) return "🥶 Molto freddolosa: Marty aggiunge sempre uno strato termico in più.";
  if (off <= -1) return "❄️ Freddolosa: capi un po' più coprenti del normale.";
  if (off >= 3)  return "🔥 Sopporti molto bene il caldo: capi più leggeri del solito.";
  if (off >= 1)  return "🌤 Sopporti il caldo: capi più freschi.";
  return "🙂 Normale: nessun aggiustamento sul meteo.";
}

// =============================================================================
// DRESS CODE — banner regole per la destinazione (dataset statico)
// =============================================================================
function renderDressCodeSection() {
  const box = document.getElementById("td-dresscode");
  if (!box) return;
  const code = state.trip.destination?.country_code;
  const data = getDressCode(code);
  if (!data) { box.classList.add("hidden"); return; }

  const meta = STRICTNESS_LABELS[data.strictness] || STRICTNESS_LABELS.medium;
  document.getElementById("td-dresscode-emoji").textContent = meta.emoji;
  document.getElementById("td-dresscode-strictness").textContent = meta.label;
  document.getElementById("td-dresscode-strictness").style.color = meta.color;
  document.getElementById("td-dresscode-title").textContent = `Dress code · ${data.title}`;

  const ul = document.getElementById("td-dresscode-rules");
  ul.innerHTML = data.rules.map(r => `<li>${escapeHtml(r)}</li>`).join("");

  // Toggle expand
  const toggle = document.getElementById("td-dresscode-toggle");
  toggle.onclick = () => {
    const open = !ul.classList.contains("hidden");
    ul.classList.toggle("hidden", open);
    toggle.textContent = open ? "▼" : "▲";
    toggle.setAttribute("aria-label", open ? "Espandi regole" : "Comprimi regole");
  };

  box.classList.remove("hidden");
}

async function onCreateMoodBoard() {
  const btn = document.getElementById("btn-mood-board");
  const outfits = state.trip.outfits_by_day || {};
  if (Object.keys(outfits).length === 0) {
    toast("Genera prima gli outfit del viaggio", "default");
    return;
  }
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "🎬 Creazione mood board...";
  try {
    const blob = await buildMoodBoardBlob(state.trip, state.items);
    if (!blob) throw new Error("Impossibile generare immagine");
    const file = new File([blob], `mood-board-${state.trip.id}.png`, { type: "image/png" });
    const shareData = {
      title: state.trip.name || "Mood board viaggio",
      text: `✈️ Il mio mood per ${state.trip.destination?.name || "il prossimo viaggio"}`,
      files: [file],
    };
    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `mood-board-${state.trip.id}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast("Mood board scaricato", "success");
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error(err);
      toast("Errore: " + err.message, "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

async function onDuplicate() {
  if (!confirm(`Duplicare "${state.trip.name || "questo viaggio"}"?\nSarà creato un nuovo viaggio con destinazione e occasioni copiate. Le date e gli outfit saranno da impostare/rigenerare.`)) return;
  try {
    const copy = await duplicateTrip(state.trip.id);
    location.replace(`./trip-detail.html?id=${copy.id}`);
  } catch (err) {
    toast("Errore duplicazione: " + err.message, "error");
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
  document.getElementById("btn-duplicate-trip").addEventListener("click", onDuplicate);
  document.getElementById("btn-freeze-trip").addEventListener("click", onToggleFreeze);
  document.getElementById("btn-delete-trip").addEventListener("click", onDelete);
  document.getElementById("btn-share-wrapped").addEventListener("click", onShareWrapped);
  document.getElementById("btn-mood-board").addEventListener("click", onCreateMoodBoard);
  load();
});
