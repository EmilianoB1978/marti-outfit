// =============================================================================
// Taxonomies management page controller
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Taxonomies from "./taxonomies.js";
import * as Wardrobe from "./wardrobe.js";

Theme.init();

const STRUCTURED = ["categories"];

const state = {
  currentTax: "categories",
};

// =============================================================================
function toast(message, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// =============================================================================
// Boot
// =============================================================================
async function boot() {
  // Carico anche i capi esistenti per la migrazione iniziale
  let items = [];
  try {
    items = await Wardrobe.listItems();
  } catch (err) { /* OK se il guardaroba e' vuoto */ }

  await Taxonomies.load(items);
  render();
}

// =============================================================================
// Render
// =============================================================================
function render() {
  const tax = state.currentTax;
  const list = document.getElementById("tax-list");
  const values = Taxonomies.listValues(tax);

  if (values.length === 0) {
    list.innerHTML = `<p class="empty-state-inline">Nessun valore. Aggiungi il primo qui sopra.</p>`;
    return;
  }

  if (STRUCTURED.includes(tax)) {
    // Render con icon (per categories)
    list.innerHTML = values.map(item => `
      <div class="tax-row" data-value="${escapeHtml(item.value)}">
        <span class="tax-row-icon">${escapeHtml(item.icon || '🏷️')}</span>
        <span class="tax-row-label">${escapeHtml(item.label)}</span>
        ${item.builtIn ? '<span class="tax-row-builtin">built-in</span>' : ''}
        <button class="btn-icon tax-row-edit" aria-label="Rinomina">✏️</button>
        <button class="btn-icon tax-row-delete" aria-label="Elimina">🗑️</button>
      </div>
    `).join("");
  } else {
    // Render plain string
    list.innerHTML = values.map(v => `
      <div class="tax-row" data-value="${escapeHtml(v)}">
        <span class="tax-row-label">${escapeHtml(v)}</span>
        <button class="btn-icon tax-row-edit" aria-label="Rinomina">✏️</button>
        <button class="btn-icon tax-row-delete" aria-label="Elimina">🗑️</button>
      </div>
    `).join("");
  }

  list.querySelectorAll(".tax-row-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = btn.closest(".tax-row").dataset.value;
      onRename(value);
    });
  });

  list.querySelectorAll(".tax-row-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = btn.closest(".tax-row").dataset.value;
      onDelete(value);
    });
  });
}

// =============================================================================
// Add / Rename / Delete
// =============================================================================
async function onAdd() {
  const input = document.getElementById("tax-new-input");
  const value = input.value.trim();
  if (!value) {
    toast("Inserisci un valore", "error");
    return;
  }

  try {
    const added = await Taxonomies.addValue(state.currentTax, value);
    if (!added) {
      toast("Esiste già un valore uguale", "error");
      return;
    }
    input.value = "";
    render();
    toast(`Aggiunto "${value}"`, "success");
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "error");
  }
}

async function onRename(oldValue) {
  const newValue = prompt("Nuovo nome:", getDisplayValue(oldValue));
  if (!newValue || newValue.trim() === "") return;

  try {
    await Taxonomies.renameValue(state.currentTax, oldValue, newValue.trim());
    render();
    toast("Rinominato", "success");
  } catch (err) {
    toast("Errore", "error");
  }
}

async function onDelete(value) {
  // Per i built-in chiedo conferma extra
  const tax = state.currentTax;
  let isBuiltIn = false;
  if (STRUCTURED.includes(tax)) {
    const item = Taxonomies.listValues(tax).find(x => x.value === value);
    isBuiltIn = item?.builtIn;
  }

  const msg = isBuiltIn
    ? `"${getDisplayValue(value)}" è un valore built-in. Eliminandolo non potrà più essere selezionato in nuovi capi (i capi esistenti restano col tag). Procedere?`
    : `Eliminare "${getDisplayValue(value)}"?`;

  if (!confirm(msg)) return;

  try {
    await Taxonomies.removeValue(tax, value);
    render();
    toast("Eliminato", "success");
  } catch (err) {
    toast("Errore", "error");
  }
}

function getDisplayValue(value) {
  if (STRUCTURED.includes(state.currentTax)) {
    const item = Taxonomies.listValues(state.currentTax).find(x => x.value === value);
    return item?.label || value;
  }
  return value;
}

// =============================================================================
// Tabs
// =============================================================================
function initTabs() {
  document.querySelectorAll(".settings-tabs .tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".settings-tabs .tab").forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.currentTax = tab.dataset.tax;
      render();
    });
  });
}

// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  document.getElementById("tax-add-btn").addEventListener("click", onAdd);
  document.getElementById("tax-new-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onAdd();
  });
  boot();
});
