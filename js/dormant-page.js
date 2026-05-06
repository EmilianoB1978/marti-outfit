// =============================================================================
// Pagina "Capi a riposo": list + azioni (indossato, elimina, esporta CSV)
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Wardrobe from "./wardrobe.js";
import * as Dormant from "./dormant.js";
import { formatEuroITCompact } from "./it-format.js";

Theme.init();

const state = { items: [], dormants: [] };

function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// =============================================================================
async function load() {
  state.items = await Wardrobe.listItems();
  state.dormants = Dormant.getDormantItems(state.items);
  render();
}

function render() {
  const list = document.getElementById("dormant-list");
  const empty = document.getElementById("dormant-empty");
  const stats = document.getElementById("dormant-stats");

  // Stats header
  document.getElementById("dormant-count").textContent =
    `${state.dormants.length} ${state.dormants.length === 1 ? 'capo' : 'capi'} a riposo`;
  const totalValue = state.dormants.reduce((s, it) => s + (it.price || 0), 0);
  document.getElementById("dormant-value").textContent = totalValue > 0
    ? `Valore totale stimato: ${formatEuroITCompact(totalValue)}`
    : "Senza prezzo configurato";

  if (state.dormants.length === 0) {
    list.innerHTML = "";
    stats.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  stats.classList.remove("hidden");
  empty.classList.add("hidden");

  list.innerHTML = state.dormants.map(it => `
    <div class="dormant-row" data-id="${it.id}">
      <div class="dormant-photo">
        ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : '👕'}
      </div>
      <div class="dormant-info">
        <div class="dormant-title">${escapeHtml(it.subcategory || it.category || 'Capo')}</div>
        <div class="dormant-sub">${escapeHtml([
          it.color_primary || it.color,
          it.material,
        ].filter(Boolean).join(' · '))}</div>
        <div class="dormant-status">${escapeHtml(Dormant.describeWear(it))}</div>
      </div>
      <div class="dormant-actions">
        <button class="btn btn--secondary btn--sm" data-action="worn" aria-label="Marca come indossato oggi">✓</button>
        <button class="btn btn--ghost btn--sm" data-action="delete" aria-label="Elimina">🗑️</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".dormant-row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector("[data-action='worn']").addEventListener("click", () => onMarkWorn(id));
    row.querySelector("[data-action='delete']").addEventListener("click", () => onDelete(id));
  });
}

async function onMarkWorn(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  try {
    await Wardrobe.markItemAsWorn(id, item);
    toast("✓ Indossato oggi", "success");
    await load();
  } catch (err) {
    toast("Errore", "error");
  }
}

async function onDelete(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`Eliminare "${item.subcategory || item.category}"?`)) return;
  try {
    await Wardrobe.deleteItem(id, item.photo_path, item.cutout_path);
    toast("Eliminato", "success");
    await load();
  } catch (err) {
    toast("Errore", "error");
  }
}

function onExportCSV() {
  if (state.dormants.length === 0) {
    toast("Nessun capo da esportare", "error");
    return;
  }
  Dormant.exportToCSV(state.dormants);
  toast("CSV scaricato", "success");
}

// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-export-csv").addEventListener("click", onExportCSV);
  load();
});
