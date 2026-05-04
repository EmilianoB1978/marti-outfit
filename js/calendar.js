// =============================================================================
// Calendario outfit: vista mensile, assegnazione outfit a giorni
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as Cal from "./calendar-data.js";
import * as Weather from "./weather.js";

Theme.init();

const state = {
  cursorYear: 0,
  cursorMonth: 0,         // 0-11
  entries: new Map(),     // dateKey -> entry
  items: [],              // all wardrobe items (per render outfit thumbnail)
  outfits: [],            // all saved outfits
  selectedDate: null,
};

// Italiano: nomi mesi
const MONTHS_IT = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"
];

// =============================================================================
function toast(message, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

// =============================================================================
// Boot
// =============================================================================
async function init() {
  const now = new Date();
  state.cursorYear = now.getFullYear();
  state.cursorMonth = now.getMonth();

  // Carico in parallelo tutto cio' che mi serve
  const [items, outfits, entries] = await Promise.all([
    Wardrobe.listItems(),
    Outfit.listSavedOutfits(),
    Cal.listEntries(),
  ]);
  state.items = items;
  state.outfits = outfits;
  state.entries = Cal.entriesByDate(entries);

  renderMonth();
  loadWeatherBannerIfAvailable();
}

// =============================================================================
// Render mese
// =============================================================================
function renderMonth() {
  document.getElementById("cal-month-name").textContent =
    `${MONTHS_IT[state.cursorMonth]} ${state.cursorYear}`;

  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";

  // Calcolo: primo del mese, weekday (0=dom in JS, normalizzo a Lun=0)
  const firstOfMonth = new Date(state.cursorYear, state.cursorMonth, 1);
  const lastOfMonth  = new Date(state.cursorYear, state.cursorMonth + 1, 0);
  const daysInMonth  = lastOfMonth.getDate();

  // Padding iniziale (giorni del mese precedente per allineare il primo giorno)
  const jsDow = firstOfMonth.getDay();          // 0=Dom..6=Sab
  const padStart = (jsDow + 6) % 7;             // converto a Lun=0..Dom=6

  for (let i = 0; i < padStart; i++) {
    grid.appendChild(makeEmptyCell());
  }

  // Giorni del mese
  const today = new Date();
  const todayKey = Cal.formatDateKey(today);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(state.cursorYear, state.cursorMonth, day);
    const key  = Cal.formatDateKey(date);
    const entry = state.entries.get(key);
    const isToday = key === todayKey;

    grid.appendChild(makeDayCell(day, key, entry, isToday));
  }
}

function makeEmptyCell() {
  const div = document.createElement("div");
  div.className = "cal-cell cal-cell-empty";
  return div;
}

function makeDayCell(day, dateKey, entry, isToday) {
  const cell = document.createElement("button");
  cell.className = "cal-cell" + (isToday ? " is-today" : "");
  if (entry) cell.classList.add("has-entry", `is-${entry.type}`);

  // Thumbnail outfit se assegnato
  let thumb = "";
  if (entry) {
    const outfit = state.outfits.find(o => o.id === entry.outfit_id);
    if (outfit) {
      const previewItem = (outfit.item_ids || [])
        .map(id => state.items.find(it => it.id === id))
        .filter(Boolean)[0];
      if (previewItem?.photo_url) {
        thumb = `<img class="cal-thumb" src="${previewItem.photo_url}" alt="" loading="lazy" />`;
      }
    }
  }

  cell.innerHTML = `
    <span class="cal-day-num">${day}</span>
    ${thumb}
    ${entry ? `<span class="cal-marker cal-marker-${entry.type}"></span>` : ""}
  `;

  cell.addEventListener("click", () => openAssignModal(dateKey));
  return cell;
}

// =============================================================================
// Modal: assegna outfit a una data
// =============================================================================
function openAssignModal(dateKey) {
  state.selectedDate = dateKey;
  const entry = state.entries.get(dateKey);

  // Title con la data formattata
  const date = new Date(dateKey);
  const formatted = date.toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  document.getElementById("assign-title").textContent = formatted;

  // Mostra outfit corrente se esiste
  const current = document.getElementById("assign-current");
  const removeBtn = document.getElementById("btn-remove-assign");
  if (entry) {
    const outfit = state.outfits.find(o => o.id === entry.outfit_id);
    if (outfit) {
      current.classList.remove("hidden");
      current.innerHTML = `
        <div class="assign-current-label">${entry.type === 'worn' ? '✓ Indossato:' : '📅 Pianificato:'}</div>
        <div class="assign-current-outfit"><strong>${escapeHtml(outfit.title)}</strong></div>
      `;
    }
    removeBtn.classList.remove("hidden");
  } else {
    current.classList.add("hidden");
    removeBtn.classList.add("hidden");
  }

  // Render lista outfit (escluso eventuale corrente)
  renderOutfitList(entry?.outfit_id);

  document.getElementById("modal-assign").classList.remove("hidden");
}

function closeAssignModal() {
  document.getElementById("modal-assign").classList.add("hidden");
  state.selectedDate = null;
}

function renderOutfitList(currentId) {
  const container = document.getElementById("assign-outfit-list");

  if (state.outfits.length === 0) {
    container.innerHTML = `<p class="empty-state-inline">Nessun outfit salvato. Vai alla pagina Outfit per crearne.</p>`;
    return;
  }

  container.innerHTML = state.outfits.map(o => {
    const previewItem = (o.item_ids || [])
      .map(id => state.items.find(it => it.id === id))
      .filter(Boolean)[0];
    const thumb = previewItem?.photo_url
      ? `<img src="${previewItem.photo_url}" alt="" loading="lazy" />`
      : '👕';
    return `
      <button class="ranked-row assign-row${o.id === currentId ? ' is-current' : ''}" data-outfit="${o.id}">
        <div class="ranked-photo">${thumb}</div>
        <div class="ranked-info">
          <div class="ranked-title">${escapeHtml(o.title)}</div>
          <div class="ranked-sub">${(o.item_ids || []).length} capi</div>
        </div>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".assign-row").forEach(btn => {
    btn.addEventListener("click", () => {
      // Marca selezionato
      container.querySelectorAll(".assign-row").forEach(b => b.classList.remove("is-selected"));
      btn.classList.add("is-selected");
    });
  });
}

async function saveAssignment() {
  const dateKey = state.selectedDate;
  const selected = document.querySelector(".assign-row.is-selected");
  if (!selected) {
    toast("Seleziona un outfit", "error");
    return;
  }

  const outfitId = selected.dataset.outfit;
  // Tipo: passato/oggi -> worn, futuro -> planned
  const today = new Date();
  const todayKey = Cal.formatDateKey(today);
  const type = (dateKey <= todayKey) ? "worn" : "planned";

  try {
    const entry = await Cal.setEntry(dateKey, outfitId, type);
    state.entries.set(dateKey, entry);
    renderMonth();
    closeAssignModal();
    toast(type === "worn" ? "Outfit registrato" : "Outfit pianificato", "success");

    // Se "worn" oggi/passato: marco anche i capi come indossati
    if (type === "worn") {
      const outfit = state.outfits.find(o => o.id === outfitId);
      if (outfit) {
        await Wardrobe.markOutfitAsWorn(outfit.item_ids || [], state.items);
      }
    }
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "error");
  }
}

async function removeAssignment() {
  const dateKey = state.selectedDate;
  if (!dateKey) return;
  if (!confirm("Rimuovere la pianificazione di questo giorno?")) return;
  try {
    await Cal.deleteEntry(dateKey);
    state.entries.delete(dateKey);
    renderMonth();
    closeAssignModal();
    toast("Pianificazione rimossa", "success");
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "error");
  }
}

// =============================================================================
// Weather banner
// =============================================================================
async function loadWeatherBannerIfAvailable() {
  const loc = Weather.getCachedLocation();
  if (!loc) return;
  try {
    const forecast = await Weather.getForecast(loc);
    const desc = Weather.describeWeatherCode(forecast.daily.weatherCode);
    const banner = document.getElementById("weather-banner");
    banner.innerHTML = `
      <span class="weather-emoji">${desc.emoji}</span>
      <div class="weather-info">
        <div class="weather-temp">${forecast.daily.min.toFixed(0)}° / ${forecast.daily.max.toFixed(0)}°C</div>
        <div class="weather-desc">${desc.label} · ${escapeHtml(loc.label)}</div>
      </div>
    `;
    banner.classList.remove("hidden");
  } catch (err) {
    console.warn("Forecast fallito:", err);
  }
}

// =============================================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-prev-month").addEventListener("click", () => {
    state.cursorMonth--;
    if (state.cursorMonth < 0) { state.cursorMonth = 11; state.cursorYear--; }
    renderMonth();
  });
  document.getElementById("btn-next-month").addEventListener("click", () => {
    state.cursorMonth++;
    if (state.cursorMonth > 11) { state.cursorMonth = 0; state.cursorYear++; }
    renderMonth();
  });
  document.getElementById("btn-cancel-assign").addEventListener("click", closeAssignModal);
  document.getElementById("btn-save-assign").addEventListener("click", saveAssignment);
  document.getElementById("btn-remove-assign").addEventListener("click", removeAssignment);

  init();
});
