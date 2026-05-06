// =============================================================================
// Viaggi — pagina lista + wizard creazione 3 step
// =============================================================================

import * as Theme from "./theme/manager.js";
import {
  listTrips, createTrip, deleteTrip, searchDestinations, formatTripDates,
  OCCASION_OPTIONS,
} from "./trips-data.js";

Theme.init();

// =============================================================================
// State
// =============================================================================
const state = {
  trips: [],
  // Wizard
  step: 1,
  destination: null,        // {name, country, lat, lon, ...}
  start_date: "",
  end_date: "",
  trip_name: "",
  occasions: [],            // array di key
  searchTimer: null,
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
// Render: lista viaggi / empty / loading
// =============================================================================
async function loadTrips() {
  const loading = document.getElementById("trips-loading");
  const empty = document.getElementById("trips-empty");
  const list = document.getElementById("trips-list");
  loading.classList.remove("hidden");
  empty.classList.add("hidden");
  list.classList.add("hidden");

  try {
    state.trips = await listTrips();
  } catch (err) {
    console.error("Errore caricamento viaggi:", err);
    toast("Errore caricamento viaggi", "error");
    state.trips = [];
  }

  loading.classList.add("hidden");
  if (state.trips.length === 0) {
    empty.classList.remove("hidden");
  } else {
    list.classList.remove("hidden");
    renderTripsList();
  }
}

function renderTripsList() {
  const list = document.getElementById("trips-list");
  const today = todayISO();
  const html = state.trips.map(t => {
    const status = computeStatus(t, today);
    const statusBadge = statusBadgeHtml(status, t, today);
    const occasionsTags = (t.occasions || []).slice(0, 4).map(o => {
      const opt = OCCASION_OPTIONS.find(x => x.key === o);
      return opt ? `<span class="trip-tag">${opt.icon} ${opt.label}</span>` : "";
    }).join("");
    const outfitsCount = Object.keys(t.outfits_by_day || {}).length;
    const outfitsHint = outfitsCount > 0
      ? `<span class="trip-card-hint">✨ ${outfitsCount} outfit pronti</span>`
      : `<span class="trip-card-hint">✨ Outfit da generare</span>`;
    return `<a class="trip-card" href="./trip-detail.html?id=${escapeAttr(t.id)}" data-id="${escapeAttr(t.id)}">
      <div class="trip-card-head">
        <div class="trip-card-title">
          <span class="trip-card-flag">${countryFlag(t.destination?.country_code)}</span>
          <span>${escapeHtml(t.name || t.destination?.name || "Viaggio")}</span>
        </div>
        ${statusBadge}
      </div>
      <div class="trip-card-meta">
        <span>📍 ${escapeHtml(t.destination?.name || "—")}${t.destination?.admin1 ? ", " + escapeHtml(t.destination.admin1) : ""}</span>
        <span>📅 ${escapeHtml(formatTripDates(t.start_date, t.end_date))}</span>
        <span>⏱️ ${t.days || 0} ${t.days === 1 ? "giorno" : "giorni"}</span>
      </div>
      <div class="trip-card-tags">${occasionsTags}</div>
      <div class="trip-card-foot">
        ${outfitsHint}
        <span class="trip-card-arrow">→</span>
      </div>
    </a>`;
  }).join("");
  list.innerHTML = html;
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function computeStatus(t, today) {
  if (t.status === "frozen") return "frozen";
  if (t.status === "done") return "done";
  if (!t.start_date || !t.end_date) return "planning";
  if (today < t.start_date) return "upcoming";
  if (today > t.end_date)  return "done";
  return "active";
}

function statusBadgeHtml(status, t, today) {
  if (status === "upcoming") {
    const days = daysBetween(today, t.start_date);
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

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
}

function countryFlag(code) {
  if (!code || code.length !== 2) return "🌍";
  const A = 0x1F1E6, base = "A".charCodeAt(0);
  const c = code.toUpperCase();
  return String.fromCodePoint(A + (c.charCodeAt(0) - base)) +
         String.fromCodePoint(A + (c.charCodeAt(1) - base));
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function escapeAttr(s) { return escapeHtml(s); }

// =============================================================================
// Wizard: open / close / step navigation
// =============================================================================
function openWizard() {
  // Reset state
  state.step = 1;
  state.destination = null;
  state.start_date = "";
  state.end_date = "";
  state.trip_name = "";
  state.occasions = [];

  document.getElementById("wiz-destination-search").value = "";
  document.getElementById("wiz-destination-results").innerHTML = "";
  document.getElementById("wiz-destination-selected").classList.add("hidden");
  document.getElementById("wiz-start-date").value = "";
  document.getElementById("wiz-end-date").value = "";
  document.getElementById("wiz-trip-name").value = "";
  document.getElementById("wiz-days-info").textContent = "";

  // Min date = oggi
  const today = todayISO();
  document.getElementById("wiz-start-date").min = today;
  document.getElementById("wiz-end-date").min = today;

  renderOccasionGrid();
  goToStep(1);
  document.getElementById("modal-trip-wizard").classList.remove("hidden");
}

function closeWizard() {
  document.getElementById("modal-trip-wizard").classList.add("hidden");
}

function goToStep(n) {
  state.step = n;
  document.querySelectorAll(".wiz-step").forEach(el => {
    el.classList.toggle("is-active", Number(el.dataset.step) === n);
  });
  document.querySelectorAll(".wiz-dot").forEach(el => {
    const dotStep = Number(el.dataset.step);
    el.classList.toggle("is-active", dotStep === n);
    el.classList.toggle("is-done", dotStep < n);
  });
  document.getElementById("btn-wiz-back").hidden = (n === 1);
  const nextBtn = document.getElementById("btn-wiz-next");
  if (n < 3) nextBtn.textContent = "Avanti →";
  else nextBtn.textContent = "✈️ Crea viaggio";

  refreshNextEnabled();

  // Focus iniziale step 1
  if (n === 1) setTimeout(() => document.getElementById("wiz-destination-search").focus(), 100);
}

function refreshNextEnabled() {
  const btn = document.getElementById("btn-wiz-next");
  let ok = false;
  if (state.step === 1) ok = !!state.destination;
  if (state.step === 2) ok = !!state.start_date && !!state.end_date && state.start_date <= state.end_date;
  if (state.step === 3) ok = state.occasions.length > 0;
  btn.disabled = !ok;
}

// =============================================================================
// Step 1: ricerca destinazione (Open-Meteo Geocoding)
// =============================================================================
function setupDestinationSearch() {
  const inp = document.getElementById("wiz-destination-search");
  const results = document.getElementById("wiz-destination-results");
  const selected = document.getElementById("wiz-destination-selected");

  inp.addEventListener("input", () => {
    const q = inp.value.trim();
    selected.classList.add("hidden");
    state.destination = null;
    refreshNextEnabled();
    if (state.searchTimer) clearTimeout(state.searchTimer);
    if (q.length < 2) { results.innerHTML = ""; return; }
    results.innerHTML = '<div class="wiz-search-loading">Cerco...</div>';
    state.searchTimer = setTimeout(async () => {
      const found = await searchDestinations(q, 7);
      if (found.length === 0) {
        results.innerHTML = '<div class="wiz-search-empty">Nessuna città trovata. Prova un altro nome.</div>';
        return;
      }
      results.innerHTML = found.map((d, i) =>
        `<button type="button" class="wiz-dest-item" data-idx="${i}">
          <span class="wiz-dest-flag">${countryFlag(d.country_code)}</span>
          <span class="wiz-dest-info">
            <span class="wiz-dest-name">${escapeHtml(d.name)}</span>
            <span class="wiz-dest-sub">${escapeHtml(d.admin1 ? d.admin1 + ", " : "")}${escapeHtml(d.country || "")}${d.population ? " · " + formatPop(d.population) + " ab." : ""}</span>
          </span>
        </button>`
      ).join("");
      // Salvo i risultati per riferimento
      results.querySelectorAll(".wiz-dest-item").forEach((btn, i) => {
        btn.addEventListener("click", () => selectDestination(found[i]));
      });
    }, 300);
  });
}

function formatPop(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

function selectDestination(dest) {
  state.destination = dest;
  document.getElementById("wiz-destination-results").innerHTML = "";
  document.getElementById("wiz-destination-search").value = dest.name;
  const sel = document.getElementById("wiz-destination-selected");
  sel.innerHTML = `
    <span class="wiz-dest-flag" style="font-size:32px">${countryFlag(dest.country_code)}</span>
    <span class="wiz-dest-info">
      <span class="wiz-dest-name" style="font-size:17px">${escapeHtml(dest.name)}</span>
      <span class="wiz-dest-sub">${escapeHtml(dest.admin1 ? dest.admin1 + ", " : "")}${escapeHtml(dest.country || "")} · 🌐 ${escapeHtml(dest.timezone || "")}</span>
    </span>
    <span class="wiz-dest-check">✓</span>
  `;
  sel.classList.remove("hidden");
  refreshNextEnabled();
}

// =============================================================================
// Step 2: date
// =============================================================================
function setupDates() {
  const start = document.getElementById("wiz-start-date");
  const end = document.getElementById("wiz-end-date");
  const info = document.getElementById("wiz-days-info");
  const name = document.getElementById("wiz-trip-name");

  function recalc() {
    state.start_date = start.value;
    state.end_date = end.value;
    if (state.start_date && state.end_date) {
      if (state.end_date < state.start_date) {
        info.textContent = "⚠️ Il ritorno deve essere dopo la partenza";
        info.className = "wiz-days-info is-error";
      } else {
        const days = daysBetween(state.start_date, state.end_date) + 1;
        info.textContent = `🗓️ ${days} ${days === 1 ? "giorno" : "giorni"} di viaggio`;
        info.className = "wiz-days-info";
      }
    } else {
      info.textContent = "";
    }
    refreshNextEnabled();
  }

  start.addEventListener("change", () => {
    end.min = start.value;   // ritorno >= partenza
    if (end.value && end.value < start.value) end.value = start.value;
    recalc();
  });
  end.addEventListener("change", recalc);
  name.addEventListener("input", () => { state.trip_name = name.value; });
}

// =============================================================================
// Step 3: occasioni
// =============================================================================
function renderOccasionGrid() {
  const grid = document.getElementById("wiz-occasion-grid");
  grid.innerHTML = OCCASION_OPTIONS.map(o =>
    `<button type="button" class="wiz-occ-chip${state.occasions.includes(o.key) ? " is-active" : ""}" data-key="${o.key}">
      <span class="wiz-occ-icon">${o.icon}</span>
      <span class="wiz-occ-label">${escapeHtml(o.label)}</span>
    </button>`
  ).join("");
  grid.querySelectorAll(".wiz-occ-chip").forEach(b => {
    b.addEventListener("click", () => {
      const k = b.dataset.key;
      if (state.occasions.includes(k)) state.occasions = state.occasions.filter(x => x !== k);
      else state.occasions.push(k);
      b.classList.toggle("is-active");
      refreshNextEnabled();
    });
  });
}

// =============================================================================
// Submit
// =============================================================================
async function submitWizard() {
  const btn = document.getElementById("btn-wiz-next");
  btn.disabled = true;
  btn.textContent = "Creo...";
  try {
    const trip = await createTrip({
      name:          state.trip_name,
      destination:   state.destination,
      start_date:    state.start_date,
      end_date:      state.end_date,
      occasions:     state.occasions,
    });
    closeWizard();
    toast("✈️ Viaggio creato! La valigia smart arriva nel prossimo update.", "success");
    await loadTrips();
  } catch (err) {
    console.error("Errore creazione viaggio:", err);
    toast("Errore creazione viaggio: " + err.message, "error");
    btn.disabled = false;
    btn.textContent = "✈️ Crea viaggio";
  }
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Bottoni "Nuovo viaggio"
  document.getElementById("btn-new-trip").addEventListener("click", openWizard);
  document.getElementById("btn-new-trip-empty").addEventListener("click", openWizard);

  // Wizard navigation
  document.getElementById("btn-wiz-cancel").addEventListener("click", () => {
    if (state.destination || state.start_date || state.occasions.length) {
      if (!confirm("Annullare la creazione del viaggio? Le info inserite andranno perse.")) return;
    }
    closeWizard();
  });
  document.getElementById("btn-wiz-back").addEventListener("click", () => {
    if (state.step > 1) goToStep(state.step - 1);
  });
  document.getElementById("btn-wiz-next").addEventListener("click", () => {
    if (state.step < 3) goToStep(state.step + 1);
    else submitWizard();
  });

  setupDestinationSearch();
  setupDates();

  // (Tap su una trip card -> naviga a trip-detail.html?id=ID, gestito dall'<a>)

  loadTrips();
});
