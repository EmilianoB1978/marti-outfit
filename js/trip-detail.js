// =============================================================================
// Trip detail — vista singolo viaggio + generatore outfit
// =============================================================================

import * as Theme from "./theme/manager.js";
import { listItems } from "./wardrobe.js";
import { getTrip, updateTrip, deleteTrip, duplicateTrip, toggleTripFreeze, getReservedItemIds, formatTripDates, tripLegs, findLegForDay, updateTripLegs, searchDestinations } from "./trips-data.js";
import { generateTripOutfits, regenerateDay } from "./trips-generator.js";
import { OCCASION_OPTIONS, LUGGAGE_TYPES, getLuggage, estimateItemsVolume, estimateItemsWeightGrams } from "./trips-data.js";
import { computeWrappedStats, buildWrappedImageBlob } from "./trip-wrapped.js";
import { buildMoodBoardBlob } from "./trip-mood-board.js";
import { getDressCode, STRICTNESS_LABELS } from "./trips-dresscode.js";
import { fetchTripWeather, weatherEmoji } from "./trips-weather.js";
import { buildCompatibilityMap } from "./trips-weather-compat.js";

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
  renderLegsSection();
  renderThermalProfile();
  renderWeatherSection();
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

  // Compat-map: capi che vanno male col meteo del giorno
  const compatMap = state.weatherData
    ? buildCompatibilityMap(state.trip, state.items, state.weatherData)
    : {};

  list.innerHTML = days.map((iso, idx) => {
    const itemIds = outfitsByDay[iso] || [];
    const occKey = occasionsByDay[iso] || (occList.length ? occList[idx % occList.length] : null);
    const occOpt = occKey ? OCCASION_OPTIONS.find(x => x.key === occKey) : null;
    const occBadge = occOpt
      ? `<span class="td-day-occ">${occOpt.icon} ${escapeHtml(occOpt.label)}</span>`
      : "";

    const issues = compatMap[iso] || [];
    const issueByItem = new Map(issues.map(x => [x.itemId, x]));

    const thumbs = itemIds.map(id => {
      const it = state.itemsById.get(id);
      if (!it) return `<div class="td-thumb td-thumb--missing">?</div>`;
      const issue = issueByItem.get(id);
      const warnClass = issue ? ` td-thumb--warn td-thumb--${issue.severity}` : "";
      const warnTitle = issue ? ` title="${escapeHtml(issue.message)}"` : "";
      const warnBadge = issue
        ? `<span class="td-thumb-warn-badge">${issue.severity === "too_light" ? "🥶" : "🥵"}</span>`
        : "";
      if (it.photo_url) return `<div class="td-thumb${warnClass}"${warnTitle}><img src="${it.photo_url}" alt="" loading="lazy" />${warnBadge}</div>`;
      return `<div class="td-thumb td-thumb--placeholder${warnClass}"${warnTitle}>${categoryEmoji(it.category)}${warnBadge}</div>`;
    }).join("");

    const dayWarn = issues.length > 0
      ? `<div class="td-day-warn">⚠️ ${issues.length} ${issues.length === 1 ? "capo" : "capi"} non ideali per il meteo</div>`
      : "";

    return `<article class="td-day-card${issues.length ? ' has-warning' : ''}" data-iso="${iso}">
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
      ${dayWarn}
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
// LEGS — tappe del viaggio (multi-destinazione)
// =============================================================================
function renderLegsSection() {
  const list = document.getElementById("td-legs-list");
  const hint = document.getElementById("td-legs-hint");
  if (!list) return;

  const legs = tripLegs(state.trip);
  const isMulti = Array.isArray(state.trip.legs) && state.trip.legs.length > 0;

  if (legs.length === 0) {
    list.innerHTML = `<div class="td-leg-empty">Aggiungi una tappa per iniziare</div>`;
    hint.textContent = "";
    return;
  }

  list.innerHTML = legs.map((leg, i) => {
    const flag = leg.destination?.country_code ? countryFlagFromCode(leg.destination.country_code) : "📍";
    const days = leg.start_date && leg.end_date
      ? Math.round((new Date(leg.end_date + "T00:00:00") - new Date(leg.start_date + "T00:00:00")) / 86400000) + 1
      : 0;
    const dates = leg.start_date && leg.end_date ? formatTripDates(leg.start_date, leg.end_date) : "—";
    const editable = isMulti;
    return `<div class="td-leg-row${editable ? '' : ' td-leg-row--readonly'}" data-idx="${i}">
      <span class="td-leg-num">${i + 1}</span>
      <span class="td-leg-flag">${flag}</span>
      <div class="td-leg-info">
        <div class="td-leg-name">${escapeHtml(leg.name || leg.destination?.name || "Tappa")}</div>
        <div class="td-leg-meta">${escapeHtml(dates)} · ${days} ${days === 1 ? "giorno" : "giorni"}</div>
      </div>
      ${editable ? `<button class="td-leg-edit" data-action="edit-leg" data-idx="${i}" aria-label="Modifica">✏️</button>` : ""}
    </div>`;
  }).join("");

  hint.textContent = isMulti
    ? `${legs.length} tappe · usa "+" per aggiungerne, ✏️ per modificare.`
    : "Nessuna tappa specifica: il viaggio ha una destinazione singola. Tap '+' per spezzarlo in più tappe (es. Roma 3gg + Praga 2gg).";

  // Bind click sulle edit (solo multi-tappa)
  list.querySelectorAll('[data-action="edit-leg"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openLegModal(Number(btn.dataset.idx));
    });
  });
}

let legState = { editingIdx: -1, destination: null, searchTimer: null };

function openLegModal(editingIdx) {
  legState.editingIdx = editingIdx;
  const isEditing = editingIdx >= 0;
  const legs = tripLegs(state.trip);
  const isMulti = Array.isArray(state.trip.legs) && state.trip.legs.length > 0;
  const leg = isEditing ? legs[editingIdx] : null;

  document.getElementById("leg-modal-title").textContent = isEditing ? "Modifica tappa" : "Nuova tappa";
  document.getElementById("leg-name").value = leg?.name || "";
  document.getElementById("leg-destination-search").value = leg?.destination?.name || "";
  document.getElementById("leg-destination-results").innerHTML = "";

  const sel = document.getElementById("leg-destination-selected");
  if (leg?.destination) {
    legState.destination = leg.destination;
    renderLegSelectedDest(leg.destination);
  } else {
    legState.destination = null;
    sel.classList.add("hidden");
  }

  // Date: se aggiunta nuova in viaggio singolo, suggerisci dopo end_date attuale
  let startMin = state.trip.start_date || todayISO();
  let suggestedStart = "";
  let suggestedEnd = "";
  if (isEditing && leg) {
    suggestedStart = leg.start_date || "";
    suggestedEnd = leg.end_date || "";
  } else if (!isMulti && state.trip.end_date) {
    // Aggiunta tappa #2: la data di start suggerita = end_date attuale + 1
    const next = new Date(state.trip.end_date + "T00:00:00");
    next.setDate(next.getDate() + 1);
    suggestedStart = next.toISOString().slice(0, 10);
    const nextEnd = new Date(next); nextEnd.setDate(nextEnd.getDate() + 2);
    suggestedEnd = nextEnd.toISOString().slice(0, 10);
  }
  document.getElementById("leg-start-date").value = suggestedStart;
  document.getElementById("leg-end-date").value = suggestedEnd;

  // Bottone elimina solo in modifica E se ci sono almeno 2 legs
  const delBtn = document.getElementById("btn-leg-delete");
  delBtn.classList.toggle("hidden", !(isEditing && legs.length >= 2));

  document.getElementById("modal-leg").classList.remove("hidden");
  setTimeout(() => document.getElementById("leg-destination-search").focus(), 100);
  refreshLegSaveEnabled();
}

function closeLegModal() {
  document.getElementById("modal-leg").classList.add("hidden");
}

function renderLegSelectedDest(dest) {
  const sel = document.getElementById("leg-destination-selected");
  sel.innerHTML = `
    <span class="wiz-dest-flag" style="font-size:28px">${countryFlagFromCode(dest.country_code)}</span>
    <span class="wiz-dest-info">
      <span class="wiz-dest-name">${escapeHtml(dest.name)}</span>
      <span class="wiz-dest-sub">${escapeHtml(dest.admin1 ? dest.admin1 + ", " : "")}${escapeHtml(dest.country || "")}</span>
    </span>
    <span class="wiz-dest-check">✓</span>
  `;
  sel.classList.remove("hidden");
}

function refreshLegSaveEnabled() {
  const ok = !!legState.destination
    && document.getElementById("leg-start-date").value
    && document.getElementById("leg-end-date").value
    && document.getElementById("leg-start-date").value <= document.getElementById("leg-end-date").value;
  document.getElementById("btn-leg-save").disabled = !ok;
}

function setupLegModalListeners() {
  const inp = document.getElementById("leg-destination-search");
  const results = document.getElementById("leg-destination-results");
  const sel = document.getElementById("leg-destination-selected");
  inp.addEventListener("input", () => {
    const q = inp.value.trim();
    sel.classList.add("hidden");
    legState.destination = null;
    refreshLegSaveEnabled();
    if (legState.searchTimer) clearTimeout(legState.searchTimer);
    if (q.length < 2) { results.innerHTML = ""; return; }
    results.innerHTML = '<div class="wiz-search-loading">Cerco...</div>';
    legState.searchTimer = setTimeout(async () => {
      const found = await searchDestinations(q, 6);
      if (found.length === 0) {
        results.innerHTML = '<div class="wiz-search-empty">Nessuna città trovata</div>';
        return;
      }
      results.innerHTML = found.map((d, i) =>
        `<button type="button" class="wiz-dest-item" data-idx="${i}">
          <span class="wiz-dest-flag">${countryFlagFromCode(d.country_code)}</span>
          <span class="wiz-dest-info">
            <span class="wiz-dest-name">${escapeHtml(d.name)}</span>
            <span class="wiz-dest-sub">${escapeHtml(d.admin1 ? d.admin1 + ", " : "")}${escapeHtml(d.country || "")}</span>
          </span>
        </button>`
      ).join("");
      results.querySelectorAll(".wiz-dest-item").forEach((btn, i) => {
        btn.addEventListener("click", () => {
          legState.destination = found[i];
          inp.value = found[i].name;
          results.innerHTML = "";
          renderLegSelectedDest(found[i]);
          refreshLegSaveEnabled();
        });
      });
    }, 300);
  });

  document.getElementById("leg-start-date").addEventListener("change", refreshLegSaveEnabled);
  document.getElementById("leg-end-date").addEventListener("change", refreshLegSaveEnabled);

  document.getElementById("btn-leg-cancel").addEventListener("click", closeLegModal);
  document.getElementById("btn-leg-save").addEventListener("click", saveLeg);
  document.getElementById("btn-leg-delete").addEventListener("click", deleteLeg);
  document.getElementById("btn-add-leg").addEventListener("click", () => openLegModal(-1));
}

async function saveLeg() {
  const isEditing = legState.editingIdx >= 0;
  const newLeg = {
    id: isEditing ? (tripLegs(state.trip)[legState.editingIdx]?.id || crypto.randomUUID()) : crypto.randomUUID(),
    name: document.getElementById("leg-name").value.trim() || legState.destination?.name || "Tappa",
    destination: legState.destination,
    start_date: document.getElementById("leg-start-date").value,
    end_date: document.getElementById("leg-end-date").value,
  };
  // Costruisco il nuovo array legs
  const current = Array.isArray(state.trip.legs) && state.trip.legs.length > 0
    ? [...state.trip.legs]
    : tripLegs(state.trip);   // converte main->array singolo
  if (isEditing) {
    current[legState.editingIdx] = newLeg;
  } else {
    current.push(newLeg);
  }
  try {
    await updateTripLegs(state.trip.id, current);
    // Aggiorno state locale
    state.trip.legs = [...current].sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
    state.trip.destination = state.trip.legs[0]?.destination || null;
    state.trip.start_date = state.trip.legs[0]?.start_date || null;
    state.trip.end_date = state.trip.legs[state.trip.legs.length - 1]?.end_date || null;
    closeLegModal();
    renderHeader();
    renderLegsSection();
    renderWeatherSection();
    toast("✓ Tappa salvata", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

async function deleteLeg() {
  if (legState.editingIdx < 0) return;
  if (!confirm("Eliminare questa tappa?")) return;
  const current = [...(state.trip.legs || tripLegs(state.trip))];
  current.splice(legState.editingIdx, 1);
  try {
    if (current.length === 0) {
      // Niente legs -> torna a viaggio singolo (non possibile senza date)
      // In pratica blocchiamo: serve almeno 1 leg
      toast("Devi tenere almeno una tappa", "default");
      return;
    }
    await updateTripLegs(state.trip.id, current);
    state.trip.legs = current;
    state.trip.destination = current[0]?.destination || null;
    state.trip.start_date = current[0]?.start_date || null;
    state.trip.end_date = current[current.length - 1]?.end_date || null;
    closeLegModal();
    renderHeader();
    renderLegsSection();
    renderWeatherSection();
    toast("✓ Tappa eliminata", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

function countryFlagFromCode(code) {
  if (!code || code.length !== 2) return "🌍";
  const A = 0x1F1E6, base = "A".charCodeAt(0);
  const c = code.toUpperCase();
  return String.fromCodePoint(A + (c.charCodeAt(0) - base)) +
         String.fromCodePoint(A + (c.charCodeAt(1) - base));
}

// =============================================================================
// WEATHER — forecast (16gg) o storico (medie 3 anni stesso mese)
// =============================================================================
async function renderWeatherSection() {
  const box = document.getElementById("td-weather");
  if (!box) return;
  if (!state.trip.destination?.lat) { box.classList.add("hidden"); return; }

  // Multi-tappa: TODO mostrare un banner per leg. Per ora mostro solo
  // il primo leg / quello attivo (oggi compreso nel range), per non
  // appesantire l'UI. Il diff cross-leg arriva in iterazione successiva.
  const legs = tripLegs(state.trip);
  const today = todayISO();
  const activeLeg = legs.find(l => l.start_date <= today && l.end_date >= today) || legs[0];
  const tripForWeather = activeLeg
    ? { ...state.trip, destination: activeLeg.destination, start_date: activeLeg.start_date, end_date: activeLeg.end_date }
    : state.trip;

  // Mostra loading state
  box.classList.remove("hidden");
  document.getElementById("td-weather-emoji").textContent = "⏳";
  document.getElementById("td-weather-temps").textContent = "Carico meteo...";
  document.getElementById("td-weather-extra").innerHTML = "";
  document.getElementById("td-weather-source").textContent = "";

  let data;
  try {
    data = await fetchTripWeather(tripForWeather);
  } catch (e) {
    console.warn("Meteo fail:", e);
    box.classList.add("hidden");
    return;
  }
  if (!data) { box.classList.add("hidden"); return; }

  state.weatherData = data;

  // Snapshot persistito: la prima volta che ottengo il meteo, lo salvo
  // sul trip cosi' al prossimo accesso posso fare il diff (last-minute).
  // Lo aggiorno solo se non c'e' o se source/destination sono cambiati.
  detectAndShowWeatherChange(data);

  if (data.source === "forecast" && data.daily?.length) {
    renderForecastBanner(data.daily);
  } else if (data.source === "historical" && data.historical) {
    renderHistoricalBanner(data.historical);
  } else {
    box.classList.add("hidden");
  }

  // Ora che ho il meteo, re-rendero i giorni cosi' i thumb mostrano
  // i warning compatibilita' capo-clima
  if (state.trip.outfits_by_day && Object.keys(state.trip.outfits_by_day).length) {
    renderDays(state.trip.outfits_by_day);
  }
}

/**
 * Confronta lo snapshot meteo precedente con quello fresh.
 * Se ci sono cambiamenti significativi, mostra un alert "🌧 cambia meteo".
 * Salva sempre lo snapshot nuovo.
 */
async function detectAndShowWeatherChange(newData) {
  const old = state.trip.weather_snapshot;
  const summary = summarizeWeather(newData);
  if (!summary) return;
  const newSnapshot = { ...summary, fetched_at: new Date().toISOString() };

  // Se non c'era prima -> salvo e basta (no alert al primo accesso)
  if (!old || !old.summary) {
    try {
      await updateTrip(state.trip.id, {
        weather_snapshot: { summary, fetched_at: newSnapshot.fetched_at },
      });
      state.trip.weather_snapshot = { summary, fetched_at: newSnapshot.fetched_at };
    } catch (e) { /* silenzioso */ }
    return;
  }

  // Diff vs snapshot precedente
  const diffs = computeWeatherDiff(old.summary, summary);
  if (diffs.length > 0) {
    showWeatherChangeAlert(diffs, old.fetched_at);
  }

  // Salvo sempre il nuovo (anche se niente diff: mantiene storia recente)
  try {
    await updateTrip(state.trip.id, {
      weather_snapshot: { summary, fetched_at: newSnapshot.fetched_at },
    });
    state.trip.weather_snapshot = { summary, fetched_at: newSnapshot.fetched_at };
  } catch (e) { /* silenzioso */ }
}

function summarizeWeather(data) {
  if (!data) return null;
  if (data.source === "forecast" && data.daily?.length) {
    const tmins = data.daily.map(d => d.tmin).filter(v => v != null);
    const tmaxs = data.daily.map(d => d.tmax).filter(v => v != null);
    const rainDays = data.daily.filter(d => (d.precipitation || 0) >= 1).length;
    return {
      kind: "forecast",
      tmin: tmins.length ? Math.min(...tmins) : null,
      tmax: tmaxs.length ? Math.max(...tmaxs) : null,
      rain_days: rainDays,
    };
  }
  if (data.source === "historical" && data.historical) {
    return {
      kind: "historical",
      tmin: data.historical.tmin_avg,
      tmax: data.historical.tmax_avg,
      rain_days: data.historical.rain_days_per_month,
    };
  }
  return null;
}

function computeWeatherDiff(oldSum, newSum) {
  if (!oldSum || !newSum) return [];
  if (oldSum.kind !== newSum.kind) return [];   // historical->forecast: niente diff
  const diffs = [];

  const dTmin = (newSum.tmin || 0) - (oldSum.tmin || 0);
  const dTmax = (newSum.tmax || 0) - (oldSum.tmax || 0);
  if (Math.abs(dTmin) >= 3 || Math.abs(dTmax) >= 3) {
    const dir = dTmax < 0 || dTmin < 0 ? "freddo" : "caldo";
    diffs.push({
      type: "temp",
      message: `Temperature scese di ~${Math.round(Math.abs(dTmin))}°` +
               ` (era ${Math.round(oldSum.tmin)}°–${Math.round(oldSum.tmax)}°,` +
               ` ora ${Math.round(newSum.tmin)}°–${Math.round(newSum.tmax)}°). Più ${dir} del previsto.`,
      severity: "high",
    });
  }
  const dRain = (newSum.rain_days || 0) - (oldSum.rain_days || 0);
  if (dRain >= 2) {
    diffs.push({
      type: "rain",
      message: `${dRain} giorni di pioggia in più del previsto. Considera giacca antipioggia.`,
      severity: "medium",
    });
  } else if (dRain <= -2) {
    diffs.push({
      type: "rain",
      message: `${Math.abs(dRain)} giorni di pioggia in meno: previsioni migliorate!`,
      severity: "low",
    });
  }
  return diffs;
}

function showWeatherChangeAlert(diffs, oldFetchedAt) {
  const box = document.getElementById("td-weather");
  if (!box) return;
  // Aggiungo banner sopra al meteo se non gia' presente
  let alertEl = document.getElementById("td-weather-alert");
  if (!alertEl) {
    alertEl = document.createElement("div");
    alertEl.id = "td-weather-alert";
    alertEl.className = "td-weather-alert";
    box.parentNode.insertBefore(alertEl, box);
  }
  const oldDate = oldFetchedAt ? new Date(oldFetchedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "qualche giorno fa";
  const list = diffs.map(d => `<li>${escapeHtml(d.message)}</li>`).join("");
  alertEl.innerHTML = `
    <div class="td-weather-alert-head">
      <span class="td-weather-alert-icon">🔔</span>
      <div>
        <div class="td-weather-alert-title">Le previsioni sono cambiate</div>
        <div class="td-weather-alert-sub">rispetto al check del ${escapeHtml(oldDate)}</div>
      </div>
      <button class="td-weather-alert-close" id="td-weather-alert-close" aria-label="Chiudi">✕</button>
    </div>
    <ul class="td-weather-alert-list">${list}</ul>
  `;
  alertEl.classList.remove("hidden");
  document.getElementById("td-weather-alert-close").onclick = () => alertEl.remove();
}

function renderForecastBanner(daily) {
  // Aggrega min/max + worst code
  const tmins = daily.map(d => d.tmin).filter(v => v != null);
  const tmaxs = daily.map(d => d.tmax).filter(v => v != null);
  const tmin = tmins.length ? Math.min(...tmins) : null;
  const tmax = tmaxs.length ? Math.max(...tmaxs) : null;
  const worstCode = daily.reduce((acc, d) => Math.max(acc, d.weather_code || 0), 0);
  const totalRain = daily.reduce((acc, d) => acc + (d.precipitation || 0), 0);
  const rainDays = daily.filter(d => (d.precipitation || 0) >= 1).length;
  const maxUV = Math.max(...daily.map(d => d.uv_max || 0));

  document.getElementById("td-weather-emoji").textContent = weatherEmoji(worstCode);
  document.getElementById("td-weather-eyebrow").textContent = "Previsioni del viaggio";
  document.getElementById("td-weather-temps").innerHTML =
    `<strong>${tmin}° – ${tmax}°C</strong> medie giornaliere`;

  const extras = [];
  if (rainDays > 0)     extras.push(`🌧 ${rainDays} ${rainDays === 1 ? "giorno" : "giorni"} pioggia`);
  if (totalRain > 5)    extras.push(`💧 ~${Math.round(totalRain)}mm tot`);
  if (maxUV >= 7)       extras.push(`☀️ UV ${Math.round(maxUV)} (alto)`);
  document.getElementById("td-weather-extra").innerHTML =
    extras.map(e => `<span class="td-weather-tag">${e}</span>`).join("");

  document.getElementById("td-weather-source").textContent = "Previsioni live aggiornate";
}

function renderHistoricalBanner(h) {
  document.getElementById("td-weather-emoji").textContent = "📊";
  document.getElementById("td-weather-eyebrow").textContent = "Stagione storica (media 3 anni)";
  document.getElementById("td-weather-temps").innerHTML =
    `<strong>${h.tmin_avg}° – ${h.tmax_avg}°C</strong> di solito`;
  const extras = [];
  if (h.rain_days_per_month > 0)
    extras.push(`🌧 ${h.rain_days_per_month}gg pioggia/mese`);
  if (h.uv_avg >= 6)
    extras.push(`☀️ UV ~${h.uv_avg}`);
  document.getElementById("td-weather-extra").innerHTML =
    extras.map(e => `<span class="td-weather-tag">${e}</span>`).join("");
  document.getElementById("td-weather-source").textContent =
    "Il viaggio è troppo lontano per le previsioni precise — queste sono le medie storiche del mese.";
}

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
    // Re-render giorni con compat-map aggiornata (l'offset shifta soglie)
    if (state.trip.outfits_by_day && Object.keys(state.trip.outfits_by_day).length) {
      renderDays(state.trip.outfits_by_day);
    }
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
  setupLegModalListeners();
  load();
});
