// =============================================================================
// Taxonomies management page controller
// =============================================================================
// Gestisce le tassonomie del guardaroba (categorie, sotto-categorie, colori,
// pattern, materiali, stili, stagioni, occasioni). Per le tassonomie
// "stylable" (colors / colors-secondary / patterns / occasions / categories)
// integra anche un editor di look (sfondo, motivo, emoji) accanto alla riga.

import * as Theme from "./theme/manager.js";
import * as Taxonomies from "./taxonomies.js";
import * as Wardrobe from "./wardrobe.js";
import * as ChipStyles from "./chip-styles.js";

Theme.init();

const STRUCTURED = ["categories"];

const state = {
  currentTax: "categories",
  expanded: null,   // valore della row con pannello look aperto, null se nessuno
  // Set delle categorie con sotto-categorie espanse (tab Categorie).
  // Default: vuoto = tutte collassate.
  expandedCats: new Set(),
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

function capWord(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function toHex(c) {
  if (typeof c !== "string") return "#cccccc";
  if (c.startsWith("#") && (c.length === 7 || c.length === 4)) {
    if (c.length === 4) return "#" + c.slice(1).split("").map(x => x + x).join("");
    return c.toLowerCase();
  }
  return "#cccccc";
}

// =============================================================================
// Boot
// =============================================================================
async function boot() {
  let items = [];
  try { items = await Wardrobe.listItems(); } catch (err) {}
  await Taxonomies.load(items);
  // Auto-assignment delle sotto-categorie orfane via euristica keyword
  // (categoria parent dedotta da pattern come "stivale*" → scarpe).
  // Si esegue una sola volta per session, silenzioso se non c'e' nulla da fare.
  try {
    const { assigned } = Taxonomies.autoAssignOrphans();
    if (assigned > 0) {
      // Toast informativo dopo il primo render (lasciamo passare 600ms cosi'
      // l'utente vede la pagina caricata prima del messaggio).
      setTimeout(() => {
        toast(`🪄 Assegnate automaticamente ${assigned} sotto-categorie`, "success");
      }, 600);
    }
  } catch (err) {
    console.warn("[taxonomies-page] autoAssignOrphans failed", err);
  }
  render();
}

// =============================================================================
// Render
// =============================================================================
function render() {
  const tax = state.currentTax;
  const list = document.getElementById("tax-list");

  // Tab Categorie: render speciale ad albero con sotto-categorie indented
  if (tax === "categories") {
    renderCategoriesTree(list);
    return;
  }

  const values = Taxonomies.listValues(tax);

  if (values.length === 0) {
    list.innerHTML = `<p class="empty-state-inline">Nessun valore. Aggiungi il primo qui sopra.</p>`;
    return;
  }

  const stylable = ChipStyles.isTaxonomyStylable(tax);

  list.innerHTML = values.map(v => renderRow(tax, v, stylable)).join("");

  // Bind edit/delete/look toggle
  list.querySelectorAll(".tax-row-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRename(btn.closest(".tax-row").dataset.value);
    });
  });
  list.querySelectorAll(".tax-row-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete(btn.closest(".tax-row").dataset.value);
    });
  });
  list.querySelectorAll(".tax-row-look").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = btn.closest(".tax-row").dataset.value;
      toggleLookPanel(value);
    });
  });
  // Bind controlli pannello look (se aperto)
  if (state.expanded) bindLookPanel(state.expanded);
}

// =============================================================================
// Render albero Categorie con sotto-categorie indented
// =============================================================================
function renderCategoriesTree(list) {
  const categories = Taxonomies.listValues("categories");
  const subsByCategory = Taxonomies.listSubcategoriesByCategory();
  const stylable = ChipStyles.isTaxonomyStylable("categories");

  if (categories.length === 0) {
    list.innerHTML = `<p class="empty-state-inline">Nessuna categoria.</p>`;
    return;
  }

  // Toolbar: bottoni globali "Espandi tutto / Comprimi tutto"
  const toolbar = `
    <div class="tax-tree-toolbar">
      <button class="tax-tree-toolbar-btn" data-action="expand-all">⬇ Espandi tutto</button>
      <button class="tax-tree-toolbar-btn" data-action="collapse-all">⬆ Comprimi tutto</button>
    </div>
  `;

  // Per ogni categoria principale, una "card" con le sue sotto-categorie
  const blocks = categories.map(catItem => {
    const isExpanded = state.expandedCats.has(catItem.value);
    const subs = subsByCategory[catItem.value] || [];
    const subCount = subs.length;

    // Wrappo la categoria row con un chevron toggle. Il renderRow esistente
    // produce gia' il markup .tax-row con bottoni edit/delete/look: lascio
    // tutto invariato e aggiungo il chevron come adornment cliccabile.
    const catRow = renderRow("categories", catItem, stylable);
    const chevron = `<button class="tax-cat-chevron" data-cat="${escapeHtml(catItem.value)}" aria-label="${isExpanded ? 'Comprimi' : 'Espandi'}" aria-expanded="${isExpanded}">${isExpanded ? '▼' : '▶'}</button>`;
    const countBadge = subCount > 0 ? `<span class="tax-cat-count">${subCount}</span>` : "";

    const subRows = subs.map(sub => `
      <div class="tax-subrow" data-value="${escapeHtml(sub)}" data-parent="${escapeHtml(catItem.value)}">
        <span class="tax-subrow-bullet">└</span>
        <span class="tax-subrow-label">${escapeHtml(sub)}</span>
        <button class="btn-icon tax-subrow-edit" aria-label="Rinomina sotto-categoria">✏️</button>
        <button class="btn-icon tax-subrow-delete" aria-label="Elimina sotto-categoria">🗑️</button>
      </div>
    `).join("");
    return `
      <div class="tax-cat-block${isExpanded ? '' : ' is-collapsed'}">
        <div class="tax-cat-header" data-cat="${escapeHtml(catItem.value)}">
          ${chevron}
          ${catRow}
          ${countBadge}
        </div>
        <div class="tax-subgroup">
          ${subRows}
          <button class="tax-subgroup-add" data-parent="${escapeHtml(catItem.value)}">
            + Aggiungi sotto-categoria
          </button>
        </div>
      </div>
    `;
  });

  // Sub orfane (senza categoria associata)
  const orphans = subsByCategory.altre || [];
  if (orphans.length) {
    const isOrphanExpanded = state.expandedCats.has("__orphans__");
    const orphanRows = orphans.map(sub => `
      <div class="tax-subrow" data-value="${escapeHtml(sub)}" data-parent="">
        <span class="tax-subrow-bullet">⚠</span>
        <span class="tax-subrow-label">${escapeHtml(sub)}</span>
        <button class="btn-icon tax-subrow-assign" aria-label="Assegna a categoria">→</button>
        <button class="btn-icon tax-subrow-delete" aria-label="Elimina">🗑️</button>
      </div>
    `).join("");
    blocks.push(`
      <div class="tax-cat-block tax-cat-block-orphan${isOrphanExpanded ? '' : ' is-collapsed'}">
        <div class="tax-cat-orphan-header" data-cat="__orphans__">
          <button class="tax-cat-chevron" data-cat="__orphans__" aria-label="${isOrphanExpanded ? 'Comprimi' : 'Espandi'}" aria-expanded="${isOrphanExpanded}">${isOrphanExpanded ? '▼' : '▶'}</button>
          <span>⚠️ Sotto-categorie senza categoria</span>
          <span class="tax-cat-count">${orphans.length}</span>
        </div>
        <div class="tax-subgroup">${orphanRows}</div>
      </div>
    `);
  }

  list.innerHTML = toolbar + blocks.join("");

  // Bind: bottoni globali Espandi tutto / Comprimi tutto
  list.querySelectorAll(".tax-tree-toolbar-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "expand-all") {
        state.expandedCats = new Set(categories.map(c => c.value));
      } else if (action === "collapse-all") {
        state.expandedCats = new Set();
      }
      render();
    });
  });

  // Bind: chevron + intera area header → toggle accordion
  list.querySelectorAll(".tax-cat-chevron").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const cat = btn.dataset.cat;
      if (state.expandedCats.has(cat)) state.expandedCats.delete(cat);
      else state.expandedCats.add(cat);
      render();
    });
  });
  // Click sulla label categoria (non sui bottoni) → toggle. Comodo target piu' grande.
  list.querySelectorAll(".tax-cat-block .tax-row-label").forEach(labelEl => {
    labelEl.style.cursor = "pointer";
    labelEl.addEventListener("click", (e) => {
      // Se l'utente ha cliccato un btn-icon dentro la row, lascia perdere
      if (e.target.closest(".btn-icon")) return;
      e.stopPropagation();
      const block = labelEl.closest(".tax-cat-block");
      const header = block && block.querySelector(".tax-cat-header");
      const cat = header && header.dataset.cat;
      if (!cat) return;
      if (state.expandedCats.has(cat)) state.expandedCats.delete(cat);
      else state.expandedCats.add(cat);
      render();
    });
  });

  // Bind: categoria (edit/delete/look)
  list.querySelectorAll(".tax-row-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRename(btn.closest(".tax-row").dataset.value);
    });
  });
  list.querySelectorAll(".tax-row-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete(btn.closest(".tax-row").dataset.value);
    });
  });
  list.querySelectorAll(".tax-row-look").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = btn.closest(".tax-row").dataset.value;
      toggleLookPanel(value);
    });
  });
  if (state.expanded) bindLookPanel(state.expanded);

  // Bind: sotto-categoria edit/delete/assign
  list.querySelectorAll(".tax-subrow-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const row = btn.closest(".tax-subrow");
      onRenameSubcategory(row.dataset.value, row.dataset.parent);
    });
  });
  list.querySelectorAll(".tax-subrow-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const row = btn.closest(".tax-subrow");
      onDeleteSubcategory(row.dataset.value);
    });
  });
  list.querySelectorAll(".tax-subrow-assign").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const row = btn.closest(".tax-subrow");
      onAssignSubcategory(row.dataset.value);
    });
  });

  // Bind: "+ Aggiungi sotto-categoria" per ogni categoria
  list.querySelectorAll(".tax-subgroup-add").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onAddSubcategory(btn.dataset.parent);
    });
  });
}

async function onAddSubcategory(parentCategory) {
  const name = prompt(`Nuova sotto-categoria di "${parentCategory}":`);
  if (!name || !name.trim()) return;
  const clean = name.trim();
  try {
    const added = await Taxonomies.addValue("subcategories", clean);
    Taxonomies.setSubcategoryParent(clean, parentCategory);
    if (!added) {
      // Esisteva gia' come valore: comunque associo il parent
      toast(`"${clean}" associata a ${parentCategory}`, "success");
    } else {
      toast(`Aggiunta "${clean}" sotto ${parentCategory}`, "success");
    }
    render();
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "error");
  }
}

async function onRenameSubcategory(oldValue, parentCategory) {
  const newValue = prompt("Nuovo nome:", oldValue);
  if (!newValue || newValue.trim() === "" || newValue.trim() === oldValue) return;
  try {
    await Taxonomies.renameValue("subcategories", oldValue, newValue.trim());
    // Sposta anche il mapping parent
    Taxonomies.removeSubcategoryParent(oldValue);
    if (parentCategory) Taxonomies.setSubcategoryParent(newValue.trim(), parentCategory);
    render();
    toast("Rinominata", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

async function onDeleteSubcategory(value) {
  if (!confirm(`Eliminare la sotto-categoria "${value}"?`)) return;
  try {
    await Taxonomies.removeValue("subcategories", value);
    Taxonomies.removeSubcategoryParent(value);
    render();
    toast("Eliminata", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

// Stato runtime del modal "Assegna categoria" per sotto-categorie orfane.
let _assignOrphanSub = null;

function onAssignSubcategory(value) {
  _assignOrphanSub = value;

  // Popolo il dropdown con le categorie correnti (label + value)
  const sel = document.getElementById("assign-orphan-cat");
  const categories = Taxonomies.listValues("categories");
  const guess = Taxonomies.guessParentCategory(value);  // suggerimento euristico
  sel.innerHTML = '<option value="">— Seleziona —</option>' +
    categories.map(c => {
      const sel = (c.value === guess) ? " selected" : "";
      const labelStr = c.label || c.value;
      return `<option value="${escapeHtml(c.value)}"${sel}>${escapeHtml(labelStr)}</option>`;
    }).join("");

  document.getElementById("assign-orphan-sub").textContent = value;
  document.getElementById("assign-orphan-modal").classList.remove("hidden");
}

function closeAssignOrphanModal() {
  document.getElementById("assign-orphan-modal").classList.add("hidden");
  _assignOrphanSub = null;
}

function confirmAssignOrphan() {
  const sub = _assignOrphanSub;
  const cat = document.getElementById("assign-orphan-cat").value;
  if (!sub) {
    closeAssignOrphanModal();
    return;
  }
  if (!cat) {
    toast("Seleziona una categoria", "error");
    return;
  }
  try {
    Taxonomies.setSubcategoryParent(sub, cat);
    closeAssignOrphanModal();
    render();
    toast(`"${sub}" assegnata a ${cat}`, "success");
  } catch (err) {
    console.error(err);
    toast("Errore assegnazione", "error");
  }
}

function renderRow(tax, item, stylable) {
  const isStruct = STRUCTURED.includes(tax);
  const value = isStruct ? item.value : item;
  const label = isStruct ? item.label : item;
  const builtIn = isStruct ? item.builtIn : false;
  const expanded = state.expanded === value;

  // Anteprima look (se stylable)
  let preview = "";
  if (stylable) {
    const st = ChipStyles.getChipStyle(tax, value);
    const css = ChipStyles.styleToCss(st);
    // Per categories l'icon di default arriva da DEFAULT_TAXONOMIES.icon, ma
    // qui usiamo solo la chip-style icon (bg + fg + opzionale emoji).
    const icon = st?.icon ? `${st.icon} ` : (isStruct ? `${item.icon || ''} ` : '');
    preview = `<span class="tax-row-preview" style="${css}">${escapeHtml(icon)}</span>`;
  } else if (isStruct) {
    preview = `<span class="tax-row-icon">${escapeHtml(item.icon || '🏷️')}</span>`;
  }

  const lookBtn = stylable
    ? `<button class="btn-icon tax-row-look${expanded ? ' is-active' : ''}" aria-label="Look" title="Personalizza look">🎨</button>`
    : "";

  const builtInBadge = builtIn ? '<span class="tax-row-builtin">built-in</span>' : '';

  const lookPanel = (stylable && expanded) ? renderLookPanel(tax, value) : "";

  return `<div class="tax-row${expanded ? ' tax-row-expanded' : ''}" data-value="${escapeHtml(value)}">
    <div class="tax-row-main">
      ${preview}
      <span class="tax-row-label">${escapeHtml(label)}</span>
      ${builtInBadge}
      ${lookBtn}
      <button class="btn-icon tax-row-edit" aria-label="Rinomina">✏️</button>
      <button class="btn-icon tax-row-delete" aria-label="Elimina">🗑️</button>
    </div>
    ${lookPanel}
  </div>`;
}

function renderLookPanel(tax, value) {
  const caps = ChipStyles.styleCapsFor(tax);
  const style = ChipStyles.getChipStyle(tax, value);
  const bg = (style && style.bg) ? toHex(style.bg) : "#cccccc";
  const icon = style?.icon || "";
  const pattern = style?.pattern || "tinta unita";
  const patternOpts = Object.keys(ChipStyles.PATTERN_BG)
    .map(p => `<option value="${escapeHtml(p)}"${pattern === p ? ' selected' : ''}>${escapeHtml(p)}</option>`).join("");

  return `<div class="tax-look-panel">
    <div class="tax-look-row">
      ${caps.color ? `
        <label class="tax-look-field">
          <span class="tax-look-label">Sfondo</span>
          <input type="color" class="tax-look-color" value="${bg}" data-field="bg" />
        </label>` : ""}
      ${caps.icon ? `
        <label class="tax-look-field">
          <span class="tax-look-label">Emoji</span>
          <input type="text" class="tax-look-icon" value="${escapeHtml(icon)}" maxlength="2" placeholder="🌟" data-field="icon" />
        </label>` : ""}
      ${caps.pattern ? `
        <label class="tax-look-field tax-look-field-pattern">
          <span class="tax-look-label">Motivo</span>
          <select class="tax-look-pattern" data-field="pattern">${patternOpts}</select>
        </label>` : ""}
      <button type="button" class="btn-icon tax-look-reset" data-action="look-reset" aria-label="Ripristina">↺</button>
    </div>
  </div>`;
}

function bindLookPanel(value) {
  const row = document.querySelector(`.tax-row[data-value="${cssEscape(value)}"]`);
  if (!row) return;
  const tax = state.currentTax;

  row.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("input", () => {
      const field = input.dataset.field;
      const patch = {};
      if (field === "bg") {
        patch.bg = input.value;
        patch.fg = ChipStyles.bestTextFor(input.value);
      } else if (field === "icon") {
        patch.icon = input.value.trim();
      } else if (field === "pattern") {
        patch.pattern = input.value;
      }
      ChipStyles.setChipStyle(tax, value, patch);
      // Aggiorna SOLO la preview della row, non re-render del pannello (mantiene focus)
      updateRowPreview(row, tax, value);
    });
  });

  const resetBtn = row.querySelector('[data-action="look-reset"]');
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      ChipStyles.resetChipStyle(tax, value);
      // Re-render della row + pannello (per riportare i picker ai default)
      render();
    });
  }
}

function updateRowPreview(row, tax, value) {
  const preview = row.querySelector(".tax-row-preview");
  if (!preview) return;
  const st = ChipStyles.getChipStyle(tax, value);
  const css = ChipStyles.styleToCss(st);
  preview.setAttribute("style", css);
  if (st?.icon) preview.textContent = st.icon + " ";
  else preview.textContent = "";
}

function toggleLookPanel(value) {
  state.expanded = (state.expanded === value) ? null : value;
  render();
}

// CSS.escape polyfill per attributi quotati
function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, m => "\\" + m);
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
    if (state.expanded === value) state.expanded = null;
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
// Adatta placeholder + hint a seconda della tab attiva
function updateAddRowForTab(tax) {
  const input = document.getElementById("tax-new-input");
  const hint = document.getElementById("tax-hint");
  if (input) {
    if (tax === "categories") input.placeholder = "Nuova categoria (es. accessori, capospalla)...";
    else input.placeholder = `Aggiungi nuovo valore (${tax})...`;
  }
  if (hint) {
    if (tax === "categories") {
      hint.innerHTML = `Le <strong>sotto-categorie</strong> appaiono indentate sotto la rispettiva categoria. Tocca "+ Aggiungi sotto-categoria" per crearne una nuova nella categoria scelta.`;
    } else {
      hint.textContent = "Gestisci i valori usati nei tag dei tuoi capi. Puoi aggiungere, rinominare o eliminare.";
    }
  }
}

function initTabs() {
  document.querySelectorAll(".settings-tabs .tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".settings-tabs .tab").forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.currentTax = tab.dataset.tax;
      state.expanded = null;
      updateAddRowForTab(state.currentTax);
      render();
    });
  });
  updateAddRowForTab(state.currentTax);
}

// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  document.getElementById("tax-add-btn").addEventListener("click", onAdd);
  document.getElementById("tax-new-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onAdd();
  });

  // Wire del modal "Assegna sotto-categoria orfana a categoria"
  const closeBtn = document.getElementById("assign-orphan-close");
  const cancelBtn = document.getElementById("assign-orphan-cancel");
  const confirmBtn = document.getElementById("assign-orphan-confirm");
  if (closeBtn) closeBtn.addEventListener("click", closeAssignOrphanModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeAssignOrphanModal);
  if (confirmBtn) confirmBtn.addEventListener("click", confirmAssignOrphan);

  boot();
});
