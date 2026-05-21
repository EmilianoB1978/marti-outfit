// =============================================================================
// App: orchestrazione UI, eventi, navigazione
// =============================================================================

import { isConfigured } from "./firebase-config.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as Claude from "./claude-api.js";
import * as BgRemoval from "./bg-removal.js";
import * as OutfitExtract from "./multi-item-extractor.js";
import * as PhotoOutfit from "./photo-outfit-composer.js";
import * as Theme from "./theme/manager.js";
import * as Weather from "./weather.js";
import * as Haptic from "./haptic.js";
import * as Search from "./search.js";
import * as Taxonomies from "./taxonomies.js";
import * as ChipStyles from "./chip-styles.js";
import * as ColorMatch from "./color-match.js";
import * as ShareOutfit from "./share-outfit.js";
import * as DormantMod from "./dormant.js";
import * as TodayOutfit from "./today-outfit.js";
import { renderBottomNav, NAV_DESTINATIONS, MENU_DRAWER_KEYS } from "./bottom-nav.js";
import { formatNumberIT, parseNumberIT, sanitizeNumericInput } from "./it-format.js";
import { addTransaction as addBudgetTransaction, monthKey, formatMonth as formatBudgetMonth, getBudget, computeSummary as computeBudgetSummary } from "./budget-data.js";
import { renderHomeHubCard } from "./home-hub-card.js";
import { renderTopMonthBanner } from "./top-month-banner.js";

// Init theme manager PRIMA di qualsiasi altra cosa: applica colori/font/density
// al documento prima del primo paint per evitare flash visivo.
try { Theme.init(); } catch (err) { console.error("Theme.init failed:", err); }

// Stato in memoria (non serve store/redux per uso single-user)
const state = {
  items: [],          // tutti i capi caricati
  savedOutfits: [],   // outfit salvati
  currentOutfits: [], // outfit appena generati (non ancora salvati)
  filters: {},        // filtri attivi sulla griglia
  armoFilter: null,   // null | 'good' (in palette) | 'out' (fuori palette)
  editingId: null,    // null = nuovo capo, string = modifica capo esistente
  pendingPhoto: null, // { blob, base64, dataUrl } in attesa di salvataggio
  pendingCutout: null, // Blob PNG/WebP del cutout senza sfondo, in attesa di upload
};

// =============================================================================
// Toast helper
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
// Boot: verifica config + caricamento iniziale
// =============================================================================
async function boot() {
  // Cancello il safety timer (boot e' partito davvero)
  if (window.__splashSafetyTimer) clearTimeout(window.__splashSafetyTimer);

  if (!isConfigured) {
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
    return;
  }

  // Mostro l'app con skeleton subito (nasconde lo splash, fa sentire l'app reattiva)
  document.getElementById("splash").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  renderSkeletonWardrobe();

  try {
    const [items, savedOutfits] = await Promise.all([
      Wardrobe.listItems(),
      Outfit.listSavedOutfits()
    ]);
    state.items = items;
    state.savedOutfits = savedOutfits;

    // Carico le tassonomie (con migrazione automatica dai capi esistenti
    // alla prima volta) e popolo i select/datalist del modal
    await Taxonomies.load(items);
    populateTaxonomyOptions();

    renderWardrobe();
    renderFilters();
    renderSavedOutfits();
    renderTodayOutfit();
    renderDormantBanner();
    renderHomeHubCard().catch(err => console.warn("home hub card:", err));
    renderTopMonthBanner().catch(err => console.warn("top month banner:", err));
    runBootChecks().catch(err => console.warn("boot checks:", err));
  } catch (err) {
    console.error("Errore boot:", err);
    toast("Errore caricamento dati", "error");
  }

}

// =============================================================================
// Today's Outfit card (algoritmo deterministico, no AI)
// =============================================================================
async function renderTodayOutfit() {
  const card = document.getElementById("today-outfit-card");
  if (!card) return;

  if (state.items.length < 3) {
    card.classList.add("hidden");
    return;
  }

  if (TodayOutfit.isDismissedToday()) {
    card.classList.add("hidden");
    return;
  }

  const outfitItems = await TodayOutfit.getTodayOutfit(state.items);
  if (outfitItems.length < 2) {
    card.classList.add("hidden");
    return;
  }

  const today = new Date().toLocaleDateString("it-IT", {
    weekday: "long", day: "numeric", month: "long"
  });

  card.innerHTML = `
    <div class="today-card-header">
      <div>
        <div class="today-card-label">Outfit del giorno</div>
        <div class="today-card-date">${escapeHtml(today)}</div>
      </div>
      <button class="btn-icon" id="today-dismiss" aria-label="Nascondi">✕</button>
    </div>
    <div class="today-card-thumbs">
      ${outfitItems.map(it => `
        <div class="today-thumb">
          ${it.photo_url
            ? `<img src="${it.photo_url}" alt="" loading="lazy" />`
            : '👕'}
        </div>
      `).join("")}
    </div>
    <div class="today-card-actions">
      <button class="btn btn--primary btn--block" id="today-worn">
        ✓ Lo indosso oggi
      </button>
      <button class="btn btn--ghost btn--sm" id="today-regen">🎲 Nuovo</button>
    </div>
  `;
  card.classList.remove("hidden");

  document.getElementById("today-dismiss").addEventListener("click", () => {
    TodayOutfit.dismissToday();
    card.classList.add("hidden");
  });

  document.getElementById("today-worn").addEventListener("click", async () => {
    try {
      await Wardrobe.markOutfitAsWorn(outfitItems.map(i => i.id), state.items);
      state.items = await Wardrobe.listItems();
      TodayOutfit.dismissToday();
      renderWardrobe();
      renderDormantBanner();
      card.classList.add("hidden");
      toast(`✓ Outfit del giorno indossato (${outfitItems.length} capi)`, "success");
    } catch (err) {
      toast("Errore", "error");
    }
  });

  // "Nuovo": rigenera con un offset alla data (cycle 1 sec come bias del seed)
  document.getElementById("today-regen").addEventListener("click", async () => {
    // Dato che l'algoritmo e' deterministico per data, per "rinfrescare"
    // lo eseguo con una data offset (oggi + sec offset). Cumulativo per re-tap.
    if (!card._regenOffset) card._regenOffset = 0;
    card._regenOffset += 1;
    const offsetDate = new Date(Date.now() + card._regenOffset * 86400000);
    const newItems = await TodayOutfit.getTodayOutfit(state.items, offsetDate);
    // Ri-render solo i thumbnails
    const thumbs = card.querySelector(".today-card-thumbs");
    thumbs.innerHTML = newItems.map(it => `
      <div class="today-thumb">
        ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : '👕'}
      </div>
    `).join("");
    // Riconnetto handler "lo indosso" coi nuovi items
    document.getElementById("today-worn").onclick = async () => {
      try {
        await Wardrobe.markOutfitAsWorn(newItems.map(i => i.id), state.items);
        state.items = await Wardrobe.listItems();
        TodayOutfit.dismissToday();
        renderWardrobe();
        renderDormantBanner();
        card.classList.add("hidden");
        toast(`✓ Indossato (${newItems.length} capi)`, "success");
      } catch (err) { toast("Errore", "error"); }
    };
  });
}

// =============================================================================
// Modal "Condividi outfit": scelta template + opzioni + preview live
// =============================================================================
let _shareCurrentOutfit = null;
let _previewDebTimer = null;

// Stato share modal (selezione corrente template + filtro)
let _shareSelection = { type: "builtin", key: "classic", userTemplateConfig: null };
let _currentFilter = "none";

async function openShareModal(outfit) {
  _shareCurrentOutfit = outfit;

  const prefs = Theme.getPreferences();
  document.getElementById("share-custom-title").value = "";
  document.getElementById("share-include-date").checked = true;
  document.getElementById("share-include-watermark").checked = true;
  document.getElementById("share-include-links").checked = true;
  document.getElementById("share-include-hashtags").checked = true;

  _currentFilter = "none";
  _shareSelection = { type: "builtin", key: prefs.shareTemplate || "classic", userTemplateConfig: null };

  await renderTemplateGrid();
  await renderUserTemplatesGrid();
  renderFilterChips();

  // Listeners
  ["share-custom-title", "share-include-date", "share-include-watermark"].forEach(id => {
    const el = document.getElementById(id);
    el.removeEventListener("change", schedulePreviewRefresh);
    el.addEventListener("change", schedulePreviewRefresh);
  });
  const titleInput = document.getElementById("share-custom-title");
  titleInput.removeEventListener("input", schedulePreviewRefresh);
  titleInput.addEventListener("input", schedulePreviewRefresh);

  // Mostra il bottone "Stories" solo su iOS (deep link supportato)
  const igBtn = document.getElementById("btn-share-instagram");
  if (igBtn) igBtn.hidden = !ShareOutfit.isInstagramSupported();

  document.getElementById("modal-share").classList.remove("hidden");
  schedulePreviewRefresh();
}

async function renderTemplateGrid() {
  const grid = document.getElementById("share-templates-grid");
  const { TEMPLATES } = await import("./share-templates.js");

  grid.innerHTML = Object.entries(TEMPLATES).map(([key, tpl]) => {
    const active = _shareSelection.type === "builtin" && _shareSelection.key === key;
    return `
      <button class="share-template-card ${active ? 'is-active' : ''}" data-template="${key}">
        <div class="share-template-preview" style="background: ${tpl.preview};">
          <div class="share-template-accent" style="background: ${tpl.accent};"></div>
        </div>
        <div class="share-template-name">${tpl.name}</div>
        <div class="share-template-desc">${tpl.description}</div>
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".share-template-card").forEach(card => {
    card.addEventListener("click", () => {
      _shareSelection = { type: "builtin", key: card.dataset.template, userTemplateConfig: null };
      Theme.set("shareTemplate", card.dataset.template);
      // Ri-render entrambe le grid per togliere active dalla user grid
      renderTemplateGrid();
      renderUserTemplatesGrid();
      schedulePreviewRefresh();
    });
  });
}

async function renderUserTemplatesGrid() {
  const grid = document.getElementById("share-user-templates");
  const UT = await import("./share-user-templates.js");
  await UT.load();
  const userTpls = UT.get();

  // Card "Nuovo" + i template salvati
  const newCard = `
    <button class="share-template-card share-template-card--add" id="btn-new-custom-template">
      <div class="share-template-preview share-template-preview--add">
        <span style="font-size: 40px;">+</span>
      </div>
      <div class="share-template-name">Nuovo</div>
      <div class="share-template-desc">Crea il tuo template</div>
    </button>
  `;

  const userCards = userTpls.map(t => {
    const active = _shareSelection.type === "user" && _shareSelection.key === t.id;
    const bg = t.config.background;
    const previewBg = bg.type === "gradient"
      ? `linear-gradient(135deg, ${bg.color1 || '#fff'} 0%, ${bg.color2 || '#eee'} 100%)`
      : bg.color || "#ffffff";
    return `
      <button class="share-template-card share-template-card--user ${active ? 'is-active' : ''}" data-uid="${t.id}">
        <div class="share-template-preview" style="background: ${previewBg};">
          <div class="share-template-accent" style="background: ${t.config.accent || '#d4af37'};"></div>
          <button class="share-template-edit" data-edit="${t.id}" aria-label="Modifica">✏️</button>
        </div>
        <div class="share-template-name">${escapeHtml(t.name)}</div>
        <div class="share-template-desc">Template tuo</div>
      </button>
    `;
  }).join("");

  grid.innerHTML = newCard + userCards;

  grid.querySelector("#btn-new-custom-template").addEventListener("click", () => openBuilder(null));
  grid.querySelectorAll("[data-edit]").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = b.dataset.edit;
      const t = userTpls.find(x => x.id === id);
      if (t) openBuilder(t);
    });
  });
  grid.querySelectorAll(".share-template-card--user").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-edit]")) return;
      const id = card.dataset.uid;
      const t = userTpls.find(x => x.id === id);
      if (!t) return;
      _shareSelection = { type: "user", key: id, userTemplateConfig: t.config };
      renderTemplateGrid();
      renderUserTemplatesGrid();
      schedulePreviewRefresh();
    });
  });
}

function renderFilterChips() {
  const row = document.getElementById("share-filters-row");
  // Lista filtri (chiavi di PHOTO_FILTERS)
  import("./share-templates.js").then(({ PHOTO_FILTERS }) => {
    row.innerHTML = Object.entries(PHOTO_FILTERS).map(([key, f]) => `
      <button class="filter-chip ${key === _currentFilter ? 'active' : ''}" data-filter="${key}">
        ${f.label}
      </button>
    `).join("");
    row.querySelectorAll(".filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        _currentFilter = chip.dataset.filter;
        row.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        schedulePreviewRefresh();
      });
    });
  });
}

function closeShareModal() {
  document.getElementById("modal-share").classList.add("hidden");
  _shareCurrentOutfit = null;
}

function schedulePreviewRefresh() {
  clearTimeout(_previewDebTimer);
  _previewDebTimer = setTimeout(refreshSharePreview, 200);
}

async function refreshSharePreview() {
  if (!_shareCurrentOutfit) return;
  const img = document.getElementById("share-preview-img");
  const loading = document.getElementById("share-preview-loading");
  loading.classList.remove("hidden");

  const opts = collectShareOptions();
  try {
    const dataUrl = await ShareOutfit.generatePreview(_shareCurrentOutfit, state.items, opts);
    if (dataUrl) {
      img.src = dataUrl;
      img.style.display = "block";
    }
  } catch (err) {
    console.error("Preview fail:", err);
  } finally {
    loading.classList.add("hidden");
  }
}

function collectShareOptions() {
  return {
    template: _shareSelection.type === "user" ? "custom" : _shareSelection.key,
    userTemplateConfig: _shareSelection.userTemplateConfig,
    customTitle: document.getElementById("share-custom-title").value.trim(),
    includeDate: document.getElementById("share-include-date").checked,
    includeWatermark: document.getElementById("share-include-watermark").checked,
    includeLinks: document.getElementById("share-include-links").checked,
    includeHashtags: document.getElementById("share-include-hashtags").checked,
    filter: _currentFilter,
  };
}

async function confirmShare() {
  if (!_shareCurrentOutfit) return;
  const btn = document.getElementById("btn-confirm-share");
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const opts = collectShareOptions();
    const result = await ShareOutfit.shareOutfit(_shareCurrentOutfit, state.items, opts);
    if (result.method === "share") {
      toast("Condiviso", "success");
      closeShareModal();
    } else if (result.method === "fallback") {
      toast(result.clipboardOk
        ? "Scaricato + caption negli appunti"
        : "Immagine scaricata", "success");
      closeShareModal();
    } else if (result.method === "cancelled") {
      // utente ha annullato il share sheet, lasciamo aperto
    }
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "📤 Condividi";
  }
}

async function confirmShareToInstagram() {
  if (!_shareCurrentOutfit) return;
  const btn = document.getElementById("btn-share-instagram");
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const opts = collectShareOptions();
    const result = await ShareOutfit.shareOutfitToInstagramStories(
      _shareCurrentOutfit, state.items, opts
    );
    if (result.method === "instagram") {
      toast("Aperto in Instagram Stories ✨", "success");
      closeShareModal();
    } else if (result.method === "share") {
      toast("Condiviso", "success");
      closeShareModal();
    } else if (result.method === "fallback") {
      toast("Instagram non disponibile — immagine scaricata", "warn");
      closeShareModal();
    }
    // 'cancelled' = lasciamo aperto
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "📸 Stories";
  }
}

// =============================================================================
// PERSONALIZZA BARRA INFERIORE
// =============================================================================
function populateNavSlots() {
  const prefs = Theme.getPreferences();
  const current = prefs.bottomNav || ["wardrobe", "calendar", "capsules", "outfits"];
  const allDestinations = Object.entries(NAV_DESTINATIONS);

  for (let i = 0; i < 4; i++) {
    const sel = document.getElementById(`nav-slot-${i}`);
    sel.innerHTML = allDestinations.map(([key, d]) =>
      `<option value="${key}">${d.icon} ${d.label}</option>`
    ).join("");
    sel.value = current[i] || "wardrobe";
  }
}

function openCustomizeNav() {
  populateNavSlots();
  document.getElementById("modal-customize-nav").classList.remove("hidden");
}

function closeCustomizeNav() {
  document.getElementById("modal-customize-nav").classList.add("hidden");
}

function saveCustomizeNav() {
  const slots = [];
  for (let i = 0; i < 4; i++) {
    slots.push(document.getElementById(`nav-slot-${i}`).value);
  }
  Theme.set("bottomNav", slots);
  // Re-render barra
  renderBottomNav(switchPage, openAddItem);
  closeCustomizeNav();
  toast("Barra aggiornata", "success");
}

function resetCustomizeNav() {
  Theme.set("bottomNav", ["wardrobe", "calendar", "capsules", "outfits"]);
  populateNavSlots();
  renderBottomNav(switchPage, openAddItem);
  toast("Default ripristinato", "success");
}

// =============================================================================
// CUSTOM TEMPLATE BUILDER
// =============================================================================
let _builderEditing = null;     // null = creazione, oggetto = modifica
let _builderDebTimer = null;

// State degli overlays in editing
let _builderOverlays = [];

function openBuilder(template) {
  _builderEditing = template;
  const config = template ? template.config : {
    aspectRatio: "1:1",
    background: { type: "gradient", color1: "#ffffff", color2: "#f0ebde", direction: "vertical" },
    pattern: { type: "none", color: "#d4af37", density: 30 },
    title: { font: "system", weight: "bold", size: 56, color: "#1a1a1a", align: "center", italic: false, y: 110 },
    date: { color: "#888" },
    accent: "#d4af37",
    line: { show: true },
    emoji: "",
    photoStyle: { radius: 12, borderColor: "#e0e0e0", borderWidth: 2, gap: 24, padding: 60, shadow: false, cardBg: "#fff" },
    watermark: { text: "✨ Marti Outfit", color: "#aaaaaa", font: "system" },
    overlays: [],
  };

  document.getElementById("ct-name").value = template ? template.name : "";

  // Aspect ratio
  document.querySelector(`input[name="ct-aspect"][value="${config.aspectRatio || '1:1'}"]`).checked = true;

  // Background
  document.querySelector(`input[name="ct-bg-type"][value="${config.background.type}"]`).checked = true;
  document.getElementById("ct-bg-color1").value = config.background.color1 || config.background.color || "#ffffff";
  document.getElementById("ct-bg-color2").value = config.background.color2 || "#f0ebde";
  document.getElementById("ct-bg-direction").value = config.background.direction || "vertical";

  // Pattern
  document.getElementById("ct-pattern-type").value = config.pattern?.type || "none";
  document.getElementById("ct-pattern-color").value = config.pattern?.color || "#d4af37";
  document.getElementById("ct-pattern-density").value = config.pattern?.density || 30;
  document.getElementById("ct-pattern-density-val").textContent = config.pattern?.density || 30;

  // Title
  document.getElementById("ct-title-font").value = config.title.font || "system";
  document.getElementById("ct-title-color").value = config.title.color || "#1a1a1a";
  document.getElementById("ct-title-size").value = config.title.size || 56;
  document.getElementById("ct-title-size-val").textContent = config.title.size || 56;
  document.querySelector(`input[name="ct-title-align"][value="${config.title.align || 'center'}"]`).checked = true;
  document.getElementById("ct-title-italic").checked = !!config.title.italic;

  // Accent
  document.getElementById("ct-accent").value = config.accent || "#d4af37";
  document.getElementById("ct-line").checked = config.line?.show !== false;
  document.getElementById("ct-emoji").value = config.emoji || "";

  // Photo
  document.getElementById("ct-photo-radius").value = config.photoStyle.radius || 0;
  document.getElementById("ct-photo-radius-val").textContent = config.photoStyle.radius || 0;
  document.getElementById("ct-photo-border").value = config.photoStyle.borderWidth || 0;
  document.getElementById("ct-photo-border-val").textContent = config.photoStyle.borderWidth || 0;
  document.getElementById("ct-photo-border-color").value = config.photoStyle.borderColor || "#e0e0e0";
  document.getElementById("ct-photo-gap").value = config.photoStyle.gap || 24;
  document.getElementById("ct-photo-gap-val").textContent = config.photoStyle.gap || 24;
  document.getElementById("ct-photo-shadow").checked = !!config.photoStyle.shadow;

  // Watermark
  document.getElementById("ct-wm-text").value = config.watermark?.text || "✨ Marti Outfit";
  document.getElementById("ct-wm-color").value = config.watermark?.color || "#aaaaaa";

  // Overlays
  _builderOverlays = JSON.parse(JSON.stringify(config.overlays || []));
  renderOverlaysList();

  toggleGradientFields();
  document.getElementById("btn-delete-builder").classList.toggle("hidden", !template);
  document.getElementById("modal-builder").classList.remove("hidden");
  scheduleBuilderPreview();
}

function closeBuilder() {
  document.getElementById("modal-builder").classList.add("hidden");
  _builderEditing = null;
}

function toggleGradientFields() {
  const isGradient = document.querySelector('input[name="ct-bg-type"]:checked').value === "gradient";
  document.getElementById("ct-bg-color2-row").classList.toggle("hidden", !isGradient);
  document.getElementById("ct-bg-direction-row").classList.toggle("hidden", !isGradient);
}

function readBuilderConfig() {
  return {
    aspectRatio: document.querySelector('input[name="ct-aspect"]:checked').value,
    background: {
      type: document.querySelector('input[name="ct-bg-type"]:checked').value,
      color1: document.getElementById("ct-bg-color1").value,
      color: document.getElementById("ct-bg-color1").value,
      color2: document.getElementById("ct-bg-color2").value,
      direction: document.getElementById("ct-bg-direction").value,
    },
    pattern: {
      type: document.getElementById("ct-pattern-type").value,
      color: document.getElementById("ct-pattern-color").value,
      density: +document.getElementById("ct-pattern-density").value,
    },
    title: {
      font: document.getElementById("ct-title-font").value,
      color: document.getElementById("ct-title-color").value,
      size: +document.getElementById("ct-title-size").value,
      align: document.querySelector('input[name="ct-title-align"]:checked').value,
      italic: document.getElementById("ct-title-italic").checked,
      weight: "bold",
      y: 110,
    },
    date: { color: "#888" },
    accent: document.getElementById("ct-accent").value,
    line: { show: document.getElementById("ct-line").checked, color: document.getElementById("ct-accent").value },
    emoji: document.getElementById("ct-emoji").value.trim(),
    photoStyle: {
      radius: +document.getElementById("ct-photo-radius").value,
      borderWidth: +document.getElementById("ct-photo-border").value,
      borderColor: document.getElementById("ct-photo-border-color").value,
      gap: +document.getElementById("ct-photo-gap").value,
      padding: 60,
      shadow: document.getElementById("ct-photo-shadow").checked,
      cardBg: "#ffffff",
    },
    watermark: {
      text: document.getElementById("ct-wm-text").value,
      color: document.getElementById("ct-wm-color").value,
      font: "system",
    },
    overlays: _builderOverlays || [],
  };
}

// =============================================================================
// OVERLAYS MANAGEMENT (text, sticker, shape, logo)
// =============================================================================
const POSITION_LABELS = {
  "tl":"↖ Alto sx", "tc":"↑ Alto", "tr":"↗ Alto dx",
  "ml":"← Centro sx", "mc":"· Centro", "mr":"→ Centro dx",
  "bl":"↙ Basso sx", "bc":"↓ Basso", "br":"↘ Basso dx",
};

function renderOverlaysList() {
  const list = document.getElementById("ct-overlays-list");
  if (_builderOverlays.length === 0) {
    list.innerHTML = `<p class="settings-hint" style="text-align:center; padding: var(--space-3); margin:0;">Nessun overlay. Aggiungi uno qui sotto.</p>`;
    return;
  }
  list.innerHTML = _builderOverlays.map((o, idx) => {
    const icon = ({text:"📝",sticker:"✨",logo:"🖼️",shape:"⬤"})[o.type] || "·";
    const label = o.type === "text" ? `"${(o.text||'').slice(0,30)}"`
      : o.type === "sticker" ? o.emoji
      : o.type === "logo" ? "Logo"
      : o.shape || "Forma";
    return `
      <div class="overlay-row" data-idx="${idx}">
        <span class="overlay-icon">${icon}</span>
        <div class="overlay-info">
          <div class="overlay-label">${escapeHtml(label)}</div>
          <div class="overlay-pos">${POSITION_LABELS[o.position] || ""}</div>
        </div>
        <div class="overlay-controls">
          <button class="btn-icon" data-overlay-edit="${idx}" aria-label="Modifica">✏️</button>
          <button class="btn-icon" data-overlay-del="${idx}" aria-label="Elimina">🗑️</button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-overlay-edit]").forEach(b => {
    b.addEventListener("click", () => editOverlay(+b.dataset.overlayEdit));
  });
  list.querySelectorAll("[data-overlay-del]").forEach(b => {
    b.addEventListener("click", () => {
      _builderOverlays.splice(+b.dataset.overlayDel, 1);
      renderOverlaysList();
      scheduleBuilderPreview();
    });
  });
}

async function addTextOverlay() {
  const text = prompt("Testo da sovrapporre:");
  if (!text) return;
  const pos = await pickPosition();
  if (!pos) return;
  _builderOverlays.push({
    type: "text", text, position: pos, size: 36, color: "#1a1a1a",
    font: "system", weight: "600", italic: false, outline: false,
  });
  renderOverlaysList();
  scheduleBuilderPreview();
}

async function addStickerOverlay() {
  const emoji = prompt("Emoji sticker (es. ✨ ♡ 🌸 ☀️ 🦋):");
  if (!emoji) return;
  const pos = await pickPosition();
  if (!pos) return;
  _builderOverlays.push({ type: "sticker", emoji: emoji.trim(), position: pos, size: 100 });
  renderOverlaysList();
  scheduleBuilderPreview();
}

async function addShapeOverlay() {
  const shape = prompt("Forma: circle / square / line", "circle");
  if (!shape) return;
  const pos = await pickPosition();
  if (!pos) return;
  _builderOverlays.push({ type: "shape", shape: shape.trim(), position: pos, size: 80, color: "#d4af37" });
  renderOverlaysList();
  scheduleBuilderPreview();
}

async function uploadLogoOverlay(file) {
  if (!file) return;
  toast("Caricamento logo...", "default");
  try {
    const Logo = await import("./share-logo.js");
    const { url } = await Logo.uploadLogo(file);
    const pos = await pickPosition();
    if (!pos) return;
    _builderOverlays.push({ type: "logo", imageUrl: url, position: pos, size: 150, opacity: 0.9 });
    renderOverlaysList();
    scheduleBuilderPreview();
    toast("Logo aggiunto", "success");
  } catch (err) {
    console.error(err);
    toast("Errore upload logo: " + err.message, "error");
  }
}

function pickPosition() {
  return new Promise((resolve) => {
    const positions = ["tl","tc","tr","ml","mc","mr","bl","bc","br"];
    const chosen = prompt(
      "Posizione (digitare):\n" +
      positions.map(p => `${p} = ${POSITION_LABELS[p]}`).join("\n"),
      "br"
    );
    if (!chosen || !positions.includes(chosen.trim())) {
      resolve(null);
    } else {
      resolve(chosen.trim());
    }
  });
}

function editOverlay(idx) {
  const o = _builderOverlays[idx];
  if (!o) return;
  // Edit semplice: prompt per ognuno dei campi principali
  if (o.type === "text") {
    const newText = prompt("Testo:", o.text);
    if (newText !== null) o.text = newText;
    const newSize = prompt("Dimensione (16-100):", o.size);
    if (newSize) o.size = +newSize;
    const newColor = prompt("Colore (hex es #d4af37):", o.color);
    if (newColor) o.color = newColor;
  } else if (o.type === "sticker") {
    const newEmoji = prompt("Emoji:", o.emoji);
    if (newEmoji) o.emoji = newEmoji;
    const newSize = prompt("Dimensione (40-200):", o.size);
    if (newSize) o.size = +newSize;
  } else if (o.type === "logo") {
    const newSize = prompt("Larghezza logo (60-300):", o.size);
    if (newSize) o.size = +newSize;
    const newOp = prompt("Opacita' (0.1-1):", o.opacity);
    if (newOp) o.opacity = parseFloat(newOp);
  } else if (o.type === "shape") {
    const newColor = prompt("Colore (hex):", o.color);
    if (newColor) o.color = newColor;
    const newSize = prompt("Dimensione:", o.size);
    if (newSize) o.size = +newSize;
  }
  // Posizione (qualsiasi tipo)
  const newPos = prompt("Posizione (tl/tc/tr/ml/mc/mr/bl/bc/br):", o.position);
  if (newPos) o.position = newPos.trim();

  renderOverlaysList();
  scheduleBuilderPreview();
}

function scheduleBuilderPreview() {
  clearTimeout(_builderDebTimer);
  _builderDebTimer = setTimeout(refreshBuilderPreview, 200);
}

async function refreshBuilderPreview() {
  if (!_shareCurrentOutfit) return;
  const img = document.getElementById("ct-preview-img");
  const loading = document.getElementById("ct-preview-loading");
  loading.classList.remove("hidden");

  const config = readBuilderConfig();
  try {
    const dataUrl = await ShareOutfit.generatePreview(_shareCurrentOutfit, state.items, {
      template: "custom",
      customConfig: config,
      filter: _currentFilter,
    });
    if (dataUrl) {
      img.src = dataUrl;
      img.style.display = "block";
    }
  } catch (err) {
    console.error("Builder preview fail:", err);
  } finally {
    loading.classList.add("hidden");
  }
}

async function saveBuilder() {
  const name = document.getElementById("ct-name").value.trim();
  if (!name) {
    toast("Inserisci un nome", "error");
    return;
  }
  const UT = await import("./share-user-templates.js");
  const template = _builderEditing || {};
  template.name = name;
  template.config = readBuilderConfig();
  await UT.save(template);
  toast(_builderEditing ? "Template aggiornato" : "Template salvato", "success");
  closeBuilder();
  // Refresh user templates grid in share modal
  await renderUserTemplatesGrid();
  // Auto-seleziona il nuovo template
  _shareSelection = { type: "user", key: template.id, userTemplateConfig: template.config };
  await renderTemplateGrid();
  await renderUserTemplatesGrid();
  schedulePreviewRefresh();
}

async function deleteBuilderTemplate() {
  if (!_builderEditing) return;
  if (!confirm(`Eliminare il template "${_builderEditing.name}"?`)) return;
  const UT = await import("./share-user-templates.js");
  await UT.remove(_builderEditing.id);
  toast("Template eliminato", "success");
  closeBuilder();
  // Reset selection se era selezionato
  if (_shareSelection.type === "user" && _shareSelection.key === _builderEditing.id) {
    _shareSelection = { type: "builtin", key: "classic", userTemplateConfig: null };
  }
  await renderUserTemplatesGrid();
  await renderTemplateGrid();
  schedulePreviewRefresh();
}

// =============================================================================
// Banner "capi a riposo" (compare se ci sono 3+ dormienti)
// =============================================================================
function renderDormantBanner() {
  const banner = document.getElementById("dormant-banner");
  if (!banner) return;
  const dormants = DormantMod.getDormantItems(state.items);
  if (dormants.length < 3) {
    banner.classList.add("hidden");
    return;
  }
  document.getElementById("dormant-banner-title").textContent =
    `${dormants.length} capi a riposo`;
  banner.classList.remove("hidden");
}

// =============================================================================
// Link prodotto: stato basato su durata configurata in Settings
// Ritorna: 'none' | 'ok' | 'warning' | 'expired'
// =============================================================================
function computeLinkStatus(item) {
  if (!item.link_url || !item.link_added_at) return "none";

  const prefs = Theme.getPreferences ? Theme.getPreferences() : { linkDurationDays: 180 };
  const days = prefs.linkDurationDays || 180;

  const added = new Date(item.link_added_at).getTime();
  const expires = added + days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const remaining = expires - now;

  if (remaining <= 0) return "expired";
  if (remaining <= 14 * 24 * 60 * 60 * 1000) return "warning";  // <= 14 giorni
  return "ok";
}

// Render del banner status del link nel modal capo
function renderLinkStatus(item) {
  const wrap = document.getElementById("link-status");
  const openBtn = document.getElementById("btn-open-link");

  if (!item || !item.link_url) {
    wrap.classList.add("hidden");
    openBtn.classList.add("hidden");
    return;
  }

  // Mostra il bottone "apri" se c'e' un URL valido nel form
  openBtn.classList.remove("hidden");

  const status = computeLinkStatus(item);
  if (status === "none") {
    wrap.classList.add("hidden");
    return;
  }

  const prefs = Theme.getPreferences();
  const days = prefs.linkDurationDays || 180;
  const added = new Date(item.link_added_at);
  const addedFmt = added.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  const remainingDays = Math.ceil((added.getTime() + days * 86400000 - Date.now()) / 86400000);

  let cls = "link-status-ok";
  let text = "";
  if (status === "expired") {
    cls = "link-status-expired";
    text = `⚠️ Link probabilmente scaduto · aggiunto il ${addedFmt} · aggiorna o rimuovi`;
  } else if (status === "warning") {
    cls = "link-status-warning";
    text = `⏰ In scadenza · ${remainingDays} giorni rimanenti · aggiunto il ${addedFmt}`;
  } else {
    cls = "link-status-ok";
    text = `✓ Aggiunto il ${addedFmt} · ancora valido per ${remainingDays} giorni`;
  }

  wrap.className = "link-status " + cls;
  wrap.textContent = text;
  wrap.classList.remove("hidden");
}

// =============================================================================
// Popola select e datalist dalle tassonomie utente (con marker "+ Nuovo...")
// =============================================================================
function populateTaxonomyOptions() {
  // SELECT con icona/label (categorie hanno struttura ricca)
  populateSelect("field-category", Taxonomies.listValues("categories").map(c => ({
    value: c.value, label: `${c.icon || '🏷️'} ${c.label}`
  })));

  // SELECT single-value (lo stile resta singolo)
  populateSelect("field-style",     Taxonomies.listSimpleValues("styles"));

  // MULTI-CHIP: un capo puo' avere piu' colori / pattern / materiali / occasioni
  renderMultiChips("field-color");
  renderMultiChips("field-color-secondary");
  renderMultiChips("field-pattern");
  renderMultiChips("field-material");
  renderMultiChips("field-occasion");
  // Stagione: chip toggleabili (8 stagioni dinamiche)
  renderSeasonChips();

  // Peso: 5 chip single-select
  renderWeightChips();

  // SELECT cascade: sub-categoria filtrata per categoria scelta
  refreshSubcategorySelect();
}

// =============================================================================
// Multi-chip generico (colors / patterns / materials / occasions)
// =============================================================================
// Render: legge la taxonomy indicata in data-tax, popola chip toggleabili.
// Selezione multi-select. Ultima chip = "+ Aggiungi" che apre prompt.
// =============================================================================
function renderMultiChips(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const tax = root.dataset.tax;
  const values = Taxonomies.listSimpleValues(tax);
  const selected = new Set(getSelectedMulti(rootId));
  // Applica chip-styles personalizzati (colors, colors-secondary, patterns,
  // occasions). Per le altre tassonomie ChipStyles ritorna {} -> nessun
  // styling extra, render legacy.
  const chipTax = (tax === "colors" && rootId === "field-color-secondary")
    ? "colors-secondary" : tax;
  const stylable = ChipStyles.isTaxonomyStylable(chipTax);

  const chips = values.map(v => {
    let styleAttr = "";
    let iconPrefix = "";
    if (stylable) {
      const st = ChipStyles.getChipStyle(chipTax, v);
      const css = ChipStyles.styleToCss(st);
      if (css) styleAttr = ` style="${css}"`;
      if (st && st.icon) iconPrefix = `<span class="multi-chip-icon">${st.icon}</span> `;
    }
    return `<button type="button" class="multi-chip${selected.has(v) ? " is-active" : ""}${stylable ? " multi-chip-styled" : ""}" data-val="${escapeHtml(v)}"${styleAttr}>
      ${iconPrefix}${escapeHtml(capitalize(v))}
    </button>`;
  }).join("");
  root.innerHTML = chips +
    `<button type="button" class="multi-chip multi-chip-add" data-action="add-new">+ Aggiungi</button>`;
}

// Helper: normalizza un valore in array (string -> [string], null -> [])
function toArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (v === null || v === undefined || v === "") return [];
  // Stringhe legacy con virgole o pipe (es. "lavoro, aperitivo")
  return String(v).split(/[,|]/).map(s => s.trim()).filter(Boolean);
}

function getSelectedMulti(rootId) {
  const root = document.getElementById(rootId);
  if (!root) return [];
  return Array.from(root.querySelectorAll(".multi-chip.is-active"))
    .map(c => c.dataset.val)
    .filter(Boolean);
}

function setSelectedMulti(rootId, arr) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const set = new Set((arr || []).map(s => String(s)));
  root.querySelectorAll(".multi-chip").forEach(c => {
    if (!c.dataset.val) return;
    c.classList.toggle("is-active", set.has(c.dataset.val));
  });
}

async function onMultiChipClick(rootId, e) {
  const root = document.getElementById(rootId);
  const btn = e.target.closest(".multi-chip");
  if (!btn) return;
  if (btn.dataset.action === "add-new") {
    const tax = root.dataset.tax;
    const newVal = prompt(`Nuovo valore per ${taxonomyLabel(tax)}:`);
    if (!newVal || !newVal.trim()) return;
    const trimmed = newVal.trim();
    try {
      await Taxonomies.addValue(tax, trimmed);
      renderMultiChips(rootId);
      // Auto-attiva il nuovo valore
      const current = getSelectedMulti(rootId);
      setSelectedMulti(rootId, [...current, trimmed]);
      toast(`Aggiunto "${trimmed}"`, "success");
    } catch (err) {
      toast("Errore aggiunta", "error");
    }
    return;
  }
  if (btn.dataset.val) btn.classList.toggle("is-active");
}

// =============================================================================
// Single-chip peso del capo (5 livelli con grammi modificabili in Settings)
// =============================================================================
// =============================================================================
// Menu drawer grid (card 3-col personalizzabili da Settings -> Menu)
// =============================================================================
function renderMenuGrid() {
  const grid = document.getElementById("menu-grid");
  if (!grid) return;
  const prefs = Theme.getPreferences();
  const allowed = new Set(MENU_DRAWER_KEYS);
  const hidden = new Set(prefs.menuHidden || []);
  const order = (prefs.menuOrder || []).filter(k => allowed.has(k));
  // Aggiungi le destinazioni "nuove" non ancora presenti in menuOrder (es.
  // dopo aggiornamento app che introduce sezioni nuove)
  for (const k of MENU_DRAWER_KEYS) {
    if (!order.includes(k)) order.push(k);
  }
  const visible = order.filter(k => !hidden.has(k));
  grid.innerHTML = visible.map(key => {
    const dest = NAV_DESTINATIONS[key];
    if (!dest) return "";
    return `<a class="menu-card" href="${dest.href}" data-key="${key}">
      <span class="menu-card-icon">${dest.icon}</span>
      <span class="menu-card-label">${escapeHtml(dest.label)}</span>
      <span class="menu-card-badge" data-badge-for="${key}" hidden></span>
    </a>`;
  }).join("");
  // Badge dinamici (lazy, fail-soft)
  refreshMenuBadges();
}

// Badge dinamici sulle card menu (Reminders pending today, Diary streak)
async function refreshMenuBadges() {
  try {
    const [reminders, entries] = await Promise.all([
      import("./reminders-data.js").then(m => m.listReminders()).catch(() => []),
      import("./diary-data.js").then(m => m.listEntries()).catch(() => []),
    ]);
    const remindersBadge = document.querySelector('[data-badge-for="reminders"]');
    if (remindersBadge) {
      const { bucketOf } = await import("./reminders-data.js");
      const today = reminders.filter(r => r.status !== "done" && (bucketOf(r) === "today" || bucketOf(r) === "overdue")).length;
      if (today > 0) {
        remindersBadge.textContent = today;
        remindersBadge.hidden = false;
      }
    }
    const diaryBadge = document.querySelector('[data-badge-for="diary"]');
    if (diaryBadge) {
      const { computeStreak, todayId } = await import("./diary-data.js");
      const today = todayId();
      const hasToday = entries.some(e => e.id === today);
      if (!hasToday) {
        diaryBadge.textContent = "✍️";
        diaryBadge.hidden = false;
        diaryBadge.classList.add("menu-card-badge-soft");
      } else {
        const streak = computeStreak(entries);
        if (streak > 0) {
          diaryBadge.textContent = `${streak} 🔥`;
          diaryBadge.hidden = false;
          diaryBadge.classList.add("menu-card-badge-soft");
        }
      }
    }
  } catch (_) { /* fail-soft */ }
}

function renderWeightChips() {
  const root = document.getElementById("field-weight");
  if (!root) return;
  const prefs = Theme.getPreferences();
  const order = prefs.itemWeightsOrder || ["leggerissimo","leggero","medio","pesante","pesantissimo"];
  const map = prefs.itemWeights || {};
  const current = root.dataset.value || "";
  root.innerHTML = order.map(key => {
    const w = map[key];
    if (!w) return "";
    const active = current === key ? " is-active" : "";
    return `<button type="button" class="weight-chip${active}" data-key="${key}" aria-label="${escapeHtml(w.label)}">
      <span class="weight-chip-icon">${w.icon || ""}</span>
      <span class="weight-chip-label">${escapeHtml(w.label || key)}</span>
      <span class="weight-chip-grams">${Number(w.grams) || 0}g</span>
    </button>`;
  }).join("");
}
function getSelectedWeight() {
  const root = document.getElementById("field-weight");
  return root && root.dataset.value ? root.dataset.value : null;
}
function setSelectedWeight(key) {
  const root = document.getElementById("field-weight");
  if (!root) return;
  root.dataset.value = key || "";
  root.querySelectorAll(".weight-chip").forEach(b => {
    b.classList.toggle("is-active", b.dataset.key === key);
  });
}

// Toggle "Registra in budget": visibile solo se prezzo > 0 E capo nuovo
async function updateBudgetToggleVisibility() {
  const wrap = document.getElementById("field-budget-toggle-wrap");
  const lbl = document.getElementById("budget-toggle-month-label");
  if (!wrap) return;
  const isNew = !state.editingId;
  const price = parseNumberIT(document.getElementById("field-price")?.value || "");
  const hasPrice = price !== null && price > 0;
  if (isNew && hasPrice) {
    wrap.classList.remove("hidden");
    if (lbl) lbl.textContent = formatBudgetMonth(monthKey());
    refreshBudgetImpact(price);
  } else {
    wrap.classList.add("hidden");
    const imp = document.getElementById("budget-impact");
    if (imp) { imp.classList.add("hidden"); imp.innerHTML = ""; }
  }
}

/**
 * Mostra impatto del prezzo sul budget mese corrente:
 * - Se non c'e' budget impostato: nessun banner
 * - Se rientra: 'Spenderai 60% del budget'
 * - Se sfori: '⚠ Questo capo ti farebbe sforare di 27€'
 */
async function refreshBudgetImpact(price) {
  const box = document.getElementById("budget-impact");
  if (!box) return;
  let budget;
  try { budget = await getBudget(monthKey()); } catch { return; }
  if (!budget || (!budget.budget && !budget.rollover_in)) {
    box.classList.add("hidden"); box.innerHTML = ""; return;
  }
  const summary = computeBudgetSummary(budget);
  const newSpent = summary.spent + price;
  const overshoot = newSpent - summary.available;
  const newPct = summary.available > 0 ? Math.round((newSpent / summary.available) * 100) : 100;

  if (overshoot > 0) {
    box.className = "budget-impact is-danger";
    box.innerHTML = `🚨 Con questo capo sfori di <strong>${formatNumberIT(overshoot, { decimals: 0, euro: true })}</strong> il budget ${formatBudgetMonth(monthKey())}.`;
  } else if (newPct >= 80) {
    box.className = "budget-impact is-warning";
    box.innerHTML = `⚠️ Arriverai al <strong>${newPct}%</strong> del budget di ${formatBudgetMonth(monthKey())} (resterà ${formatNumberIT(summary.available - newSpent, { decimals: 0, euro: true })}).`;
  } else {
    box.className = "budget-impact is-info";
    box.innerHTML = `💡 Userai il <strong>${newPct}%</strong> del budget · ti resterà ${formatNumberIT(summary.available - newSpent, { decimals: 0, euro: true })}.`;
  }
  box.classList.remove("hidden");
}

// =============================================================================
// Multi-chip stagione (8 stagioni: 4 reali + 4 mezze stagioni di transizione).
// I chip sono renderizzati dinamicamente in base a prefs.seasons.
// =============================================================================
function renderSeasonChips() {
  const root = document.getElementById("field-season");
  if (!root) return;
  const prefs = Theme.getPreferences();
  const order = prefs.seasonsOrder || ["primavera","primestate","estate","estunno","autunno","autinverno","inverno","inveravera"];
  const map = prefs.seasons || {};

  // Conserva selezione corrente prima del rerender
  const previouslyActive = new Set(getSelectedSeasons());

  // Render: griglia 2 colonne (reale | mezza). Se la mezza e' disabilitata,
  // emetto uno slot vuoto per non spezzare l'accoppiamento.
  const html = order.map(key => {
    const s = map[key];
    if (!s) return "";
    if (s.enabled === false) return `<div class="season-chip-empty"></div>`;
    const half = s.kind === "half" ? " is-half" : "";
    const active = previouslyActive.has(key) ? " is-active" : "";
    return `<button type="button" class="season-chip${half}${active}" data-season="${key}">
      <span class="season-chip-icon">${escapeHtml(s.icon || "")}</span>
      <span class="season-chip-label">${escapeHtml(s.label || key)}</span>
    </button>`;
  }).join("");

  root.innerHTML = html;
}

function getSelectedSeasons() {
  const root = document.getElementById("field-season");
  if (!root) return [];
  return Array.from(root.querySelectorAll(".season-chip.is-active"))
    .map(c => c.dataset.season);
}
function setSelectedSeasons(arr) {
  const root = document.getElementById("field-season");
  if (!root) return;
  const set = new Set((arr || []).map(s => String(s).toLowerCase()));
  root.querySelectorAll(".season-chip").forEach(chip => {
    chip.classList.toggle("is-active", set.has(chip.dataset.season));
  });
}

// =============================================================================
// Refresh field-subcategory <select> filtrato per la categoria attualmente
// selezionata. Cascade: cambiando "field-category" il select si restringe alle
// sub pertinenti (con fallback a tutte se categoria vuota o sconosciuta).
// Mantiene la selezione attuale se ancora valida, altrimenti la resetta.
// =============================================================================
function refreshSubcategorySelect() {
  const catEl = document.getElementById("field-category");
  const cat = catEl ? catEl.value : "";
  const sel = document.getElementById("field-subcategory");
  if (!sel) return;

  // Senza categoria scelta -> sub DISABLED, vuoto, ghost
  if (!cat) {
    sel.innerHTML = '<option value="">Scegli prima una categoria</option>';
    sel.value = "";
    sel.disabled = true;
    return;
  }

  // Con categoria scelta -> popola con le sub pertinenti, abilita
  sel.disabled = false;
  const userSubs = Array.from(new Set(
    state.items.map(it => (it.subcategory || "").trim()).filter(Boolean)
  ));
  const list = Taxonomies.getSubcategoriesForCategory(cat, userSubs);
  populateSelect("field-subcategory", list);

  // Aggiorno il placeholder con il count visibile
  const emptyOpt = sel.querySelector('option[value=""]');
  if (emptyOpt) {
    const realCount = sel.querySelectorAll('option').length - 2; // -1 vuoto, -1 sentinel
    emptyOpt.textContent = `— Scegli sotto-categoria (${realCount}) —`;
  }
}

// Setta il value di un <select>; se il value non esiste tra le option,
// inserisce una nuova option dinamicamente (in modo che valori legacy/custom
// salvati prima delle taxonomies non vengano persi visualmente).
function setSelectValueOrAdd(id, value) {
  const sel = document.getElementById(id);
  if (!sel) return;
  if (!value) { sel.value = ""; return; }
  const exists = Array.from(sel.options).some(o => o.value === value);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = capitalize(value);
    // Inseriscila prima del sentinel "+ Aggiungi nuovo..." (ultimo)
    const sentinel = sel.querySelector('option[value="__add_new__"]');
    sel.insertBefore(opt, sentinel || null);
  }
  sel.value = value;
}

function populateSelect(id, values) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const currentValue = sel.value;

  // Mantieni l'opzione vuota all'inizio
  const opts = ['<option value="">— Scegli —</option>'];

  // Se il currentValue NON e' tra i values (legacy/custom), lo aggiungo
  // comunque come option per non perderlo silenziosamente.
  const valueStrings = values.map(v => typeof v === "string" ? v : v.value);
  if (currentValue && currentValue !== "__add_new__" && !valueStrings.includes(currentValue)) {
    opts.push(`<option value="${escapeHtml(currentValue)}">${escapeHtml(capitalize(currentValue))}</option>`);
  }

  for (const v of values) {
    if (typeof v === "string") {
      opts.push(`<option value="${escapeHtml(v)}">${capitalize(v)}</option>`);
    } else {
      opts.push(`<option value="${escapeHtml(v.value)}">${escapeHtml(v.label)}</option>`);
    }
  }

  // Sentinel "+ Aggiungi nuovo..."
  opts.push('<option value="__add_new__" style="font-style:italic">+ Aggiungi nuovo…</option>');

  sel.innerHTML = opts.join("");
  sel.value = currentValue;  // ripristino valore precedente se presente
}

function populateMultiSelect(id, values) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const previouslySelected = Array.from(sel.selectedOptions).map(o => o.value);

  sel.innerHTML = values.map(v =>
    `<option value="${escapeHtml(v)}">${capitalize(v)}</option>`
  ).join("");

  Array.from(sel.options).forEach(o => {
    o.selected = previouslySelected.includes(o.value);
  });
}

function populateDatalist(id, values) {
  const dl = document.getElementById(id);
  if (!dl) return;
  dl.innerHTML = values.map(v => `<option value="${escapeHtml(v)}"></option>`).join("");
}

// Handler per "+ Aggiungi nuovo..." su tutti i select
async function handleSelectAddNew(selectId, taxonomy) {
  const sel = document.getElementById(selectId);
  const newValue = prompt(`Nuovo valore per ${taxonomyLabel(taxonomy)}:`);
  if (!newValue || !newValue.trim()) {
    sel.value = "";
    return;
  }
  const trimmed = newValue.trim();
  try {
    await Taxonomies.addValue(taxonomy, trimmed);
    populateTaxonomyOptions();
    // Seleziono il nuovo valore appena aggiunto.
    // Le liste sono ora ordinate alfabeticamente, quindi devo cercare per nome.
    if (taxonomy === "categories") {
      const allCats = Taxonomies.listValues("categories");
      const justAdded = allCats.find(c => c.label.toLowerCase() === trimmed.toLowerCase());
      sel.value = justAdded ? justAdded.value : "";
    } else {
      sel.value = trimmed;
    }
    // Se l'aggiunta e' una sotto-categoria, ripopola anche il select cascade
    // (potrebbe entrare nella lista filtrata della categoria attuale).
    if (taxonomy === "subcategories") {
      refreshSubcategorySelect();
      sel.value = trimmed;
    }
    toast(`Aggiunto "${trimmed}"`, "success");
  } catch (err) {
    console.error(err);
    toast("Errore aggiunta", "error");
    sel.value = "";
  }
}

function taxonomyLabel(t) {
  return ({
    categories: "categoria",
    subcategories: "sotto-categoria",
    colors: "colore",
    occasions: "occasione",
    patterns: "pattern",
    materials: "materiale",
    styles: "stile",
  }[t] || t);
}

// =============================================================================
// Skeleton loading: ghost cards mentre fetcho i dati
// =============================================================================
function renderSkeletonWardrobe() {
  const grid = document.getElementById("wardrobe-grid");
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="item-card skeleton-card">
      <div class="skeleton skeleton--card"></div>
      <div class="item-info">
        <div class="skeleton skeleton--text" style="width: 60%"></div>
        <div class="skeleton skeleton--text" style="width: 40%"></div>
      </div>
    </div>
  `).join("");
}

// =============================================================================
// Rendering: griglia capi
// =============================================================================
// Formatta created_at (Firestore Timestamp | Date | seconds | ISO string)
// come "mag '26" (3 lettere mese + apostrofo + anno 2 cifre, in italiano).
// Mostra/aggiorna l'hint "ghost" per la sotto-categoria suggerita dall'AI.
// Il bottone appare SOTTO la select #field-subcategory, in stile italico
// grigio. Click → setta il valore nella select + nasconde l'hint. Cambio
// manuale della select → nasconde l'hint automaticamente.
function _setAiSubcategoryHint(suggestion) {
  const hint = document.getElementById("ai-subcategory-hint");
  const subSel = document.getElementById("field-subcategory");
  if (!hint || !subSel) return;

  const clean = (suggestion || "").trim();
  if (!clean) {
    hint.classList.add("hidden");
    hint.hidden = true;
    return;
  }

  hint.textContent = `💡 AI suggerisce: ${clean} — tocca per usare`;
  hint.dataset.value = clean;
  hint.classList.remove("hidden");
  hint.hidden = false;

  // Click sull'hint → applica il suggerimento + auto-hide
  hint.onclick = () => {
    setSelectValueOrAdd("field-subcategory", clean);
    _hideAiSubcategoryHint();
  };
  // Cambio manuale dell'utente → auto-hide
  subSel.addEventListener("change", _hideAiSubcategoryHint, { once: true });
}

function _hideAiSubcategoryHint() {
  const hint = document.getElementById("ai-subcategory-hint");
  if (!hint) return;
  hint.classList.add("hidden");
  hint.hidden = true;
  hint.onclick = null;
  delete hint.dataset.value;
}

function _formatCardInsertDate(ts) {
  if (!ts) return "";
  let d = null;
  if (typeof ts.toDate === "function") d = ts.toDate();
  else if (typeof ts.seconds === "number") d = new Date(ts.seconds * 1000);
  else if (ts instanceof Date) d = ts;
  else if (typeof ts === "string" || typeof ts === "number") {
    const x = new Date(ts);
    if (!isNaN(x.getTime())) d = x;
  }
  if (!d) return "";
  // "mag '26"
  const month = d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
  const yy = String(d.getFullYear()).slice(-2);
  return `${month} '${yy}`;
}

function renderWardrobe() {
  const grid = document.getElementById("wardrobe-grid");
  const empty = document.getElementById("empty-state");

  let filtered = Wardrobe.filterItems(state.items, state.filters);
  // Filtro armocromia: se attivo, mostra solo capi in palette o vicini
  if (state.armoFilter) {
    filtered = filtered.filter(it => {
      const m = ColorMatch.matchItemColor(it);
      if (!m) return false;
      if (state.armoFilter === "in")    return m.status === "in";
      if (state.armoFilter === "good")  return m.status === "in" || m.status === "near";
      if (state.armoFilter === "out")   return m.status === "out" || m.status === "avoid";
      return true;
    });
  }

  if (state.items.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Nessun capo per questo filtro</div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const wearCount = item.wear_count || 0;
    const linkStatus = computeLinkStatus(item);
    let linkBadge = "";
    if (linkStatus === "expired") linkBadge = `<div class="item-link-badge is-expired" title="Link scaduto">⚠️</div>`;
    else if (linkStatus === "ok" || linkStatus === "warning") linkBadge = `<div class="item-link-badge" title="Link prodotto">🔗</div>`;
    // Data inserimento (mese + anno 2 cifre, italiano). created_at e' un
    // Firestore Timestamp: ha .toDate() oppure .seconds (legacy). Fallback
    // a stringa ISO. Stile discreto (badge piccolo angolo basso destra).
    const dateLabel = _formatCardInsertDate(item.created_at);
    const dateBadge = dateLabel
      ? `<div class="item-date-badge" title="Inserito ${dateLabel}">${dateLabel}</div>`
      : "";
    return `
    <div class="item-card" data-id="${item.id}">
      ${item.photo_url
        ? `<img class="item-photo" src="${item.photo_url}" alt="" loading="lazy" />`
        : `<div class="item-photo" style="display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">👕</div>`
      }
      ${linkBadge}
      ${wearCount > 0 ? `<div class="item-wear-badge">👕 ${wearCount}</div>` : ''}
      ${dateBadge}
      <div class="item-info">
        <div class="item-category">${item.category || "—"}</div>
        <div class="item-tags">
          ${item.color ? `<span class="item-tag">${escapeHtml(item.color)}</span>` : ""}
          ${item.style ? `<span class="item-tag">${item.style}</span>` : ""}
        </div>
      </div>
    </div>
  `;
  }).join("");

  // Click sui capi -> apri modale modifica
  grid.querySelectorAll(".item-card").forEach(card => {
    card.addEventListener("click", (e) => {
      // Se l'utente ha cliccato un'azione swipe, non aprire il modal
      if (e.target.closest(".swipe-action")) return;
      openEditItem(card.dataset.id);
    });
    attachSwipeActions(card);
  });
}

/**
 * Aggancia swipe-left a un item-card per rivelare azioni rapide
 * (✓ Indossato / 🗑️ Elimina). Ripristina posizione su tap fuori.
 */
function attachSwipeActions(card) {
  let startX = null;
  let dx = 0;
  let active = false;

  // Wrappo il contenuto se non l'ho gia' fatto
  if (!card.querySelector(".swipe-actions")) {
    const actions = document.createElement("div");
    actions.className = "swipe-actions";
    actions.innerHTML = `
      <button class="swipe-action swipe-action-worn" aria-label="Indossato oggi">✓</button>
      <button class="swipe-action swipe-action-delete" aria-label="Elimina">🗑️</button>
    `;
    card.appendChild(actions);

    actions.querySelector(".swipe-action-worn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const item = state.items.find(i => i.id === card.dataset.id);
      if (!item) return;
      try {
        const updated = await Wardrobe.markItemAsWorn(card.dataset.id, item);
        Object.assign(item, updated);
        Haptic.success();
        renderWardrobe();
        toast("✓ Marcato come indossato", "success");
      } catch (err) { toast("Errore", "error"); }
    });

    actions.querySelector(".swipe-action-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Eliminare definitivamente questo capo?")) return;
      const item = state.items.find(i => i.id === card.dataset.id);
      try {
        await Wardrobe.deleteItem(card.dataset.id, item?.photo_path, item?.cutout_path);
        state.items = state.items.filter(i => i.id !== card.dataset.id);
        Haptic.pulse();
        renderWardrobe();
        renderFilters();
        toast("Capo eliminato", "success");
      } catch (err) { toast("Errore", "error"); }
    });
  }

  card.addEventListener("touchstart", e => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    dx = 0;
    active = true;
  });
  card.addEventListener("touchmove", e => {
    if (!active || startX === null) return;
    dx = e.touches[0].clientX - startX;
    if (dx < 0) {
      card.style.transform = `translateX(${Math.max(dx, -120)}px)`;
    }
  });
  card.addEventListener("touchend", () => {
    if (!active) return;
    active = false;
    if (dx < -60) {
      card.style.transform = "translateX(-120px)";
      card.classList.add("is-swiped");
    } else {
      card.style.transform = "";
      card.classList.remove("is-swiped");
    }
    startX = null;
  });
}

// =============================================================================
// Rendering: filtri (chip)
// =============================================================================
function renderFilters() {
  const bar = document.getElementById("filter-bar");
  const categories = [...new Set(state.items.map(i => i.category).filter(Boolean))];

  const chips = [
    { label: "Tutti", value: null, group: null },
    ...categories.map(c => ({ label: capitalize(c), value: c, group: "category" }))
  ];

  bar.innerHTML = chips.map((chip, i) => {
    const active = chip.value === null
      ? Object.keys(state.filters).length === 0
      : state.filters.category === chip.value;
    return `<button class="filter-chip ${active ? 'active' : ''}" data-idx="${i}">${chip.label}</button>`;
  }).join("");

  // Chip filtro armocromia (solo se test completato)
  const armoData = Theme.getPreferences().armocromia;
  if (armoData?.seasonKey) {
    const opts = [
      { key: "good", label: "🎨 Solo palette", title: "Solo capi della tua stagione" },
      { key: "out",  label: "🚫 Fuori palette", title: "Capi che ti spengono" },
    ];
    for (const o of opts) {
      const active = state.armoFilter === o.key;
      const btn = document.createElement("button");
      btn.className = `filter-chip filter-chip-armo ${active ? "active" : ""}`;
      btn.title = o.title;
      btn.textContent = o.label;
      btn.addEventListener("click", () => {
        state.armoFilter = (state.armoFilter === o.key) ? null : o.key;
        renderFilters();
        renderWardrobe();
      });
      bar.appendChild(btn);
    }
  }

  bar.querySelectorAll(".filter-chip").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      const chip = chips[i];
      if (chip.value === null) {
        state.filters = {};
      } else {
        state.filters = { [chip.group]: chip.value };
      }
      renderFilters();
      renderWardrobe();
    });
  });
}

// =============================================================================
// Modale: aggiungi/modifica capo
// =============================================================================
function openAddItem() {
  state.editingId = null;
  state.pendingPhoto = null;
  state.pendingCutout = null;

  document.getElementById("modal-title").textContent = "Nuovo capo";
  document.getElementById("btn-delete-item").classList.add("hidden");
  document.getElementById("wear-stats-section").classList.add("hidden");
  document.getElementById("item-quick-actions")?.classList.add("hidden");
  document.getElementById("photo-preview").innerHTML = '<span class="photo-placeholder">📷</span>';
  document.getElementById("btn-analyze").classList.add("hidden");
  document.getElementById("btn-bg-removal")?.classList.add("hidden");
  document.getElementById("analyze-status").textContent = "";
  const bgStatus = document.getElementById("bg-removal-status");
  if (bgStatus) bgStatus.textContent = "";
  _hideAiSubcategoryHint();

  // Reset form: select single-value e textarea/input
  ["field-category", "field-subcategory", "field-style",
   "field-notes", "field-price", "field-link"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  // Reset multi-chips (5 campi)
  ["field-color", "field-color-secondary", "field-pattern", "field-material", "field-occasion"]
    .forEach(id => setSelectedMulti(id, []));
  setSelectedSeasons([]);
  setSelectedWeight("");

  // Reset toggle budget (default attivo, mostrato solo se prezzo > 0)
  const budgetToggle = document.getElementById("field-budget-toggle");
  if (budgetToggle) budgetToggle.checked = true;
  updateBudgetToggleVisibility();

  // Cascade: reset filtraggio sub-categoria a "tutte" (categoria vuota)
  refreshSubcategorySelect();

  // Reset slider formality (0 = non specificato)
  document.getElementById("field-formality").value = 0;
  document.getElementById("formality-value").textContent = "—";

  // Reset link status (nascondi)
  document.getElementById("link-status").classList.add("hidden");
  document.getElementById("btn-open-link").classList.add("hidden");

  document.getElementById("modal-item").classList.remove("hidden");
}

function openEditItem(id) {
  const item = state.items.find(i => i.id === id);
  if (!item) return;

  state.editingId = id;
  state.pendingPhoto = null;
  state.pendingCutout = null;

  document.getElementById("modal-title").textContent = "Modifica capo";
  document.getElementById("btn-delete-item").classList.remove("hidden");
  document.getElementById("item-quick-actions")?.classList.remove("hidden");
  // Preferisco mostrare il cutout se gia' presente (visuale piu' pulita)
  const previewSrc = item.cutout_url || item.photo_url;
  document.getElementById("photo-preview").innerHTML = previewSrc
    ? `<img src="${previewSrc}" alt="" />`
    : '<span class="photo-placeholder">📷</span>';
  document.getElementById("btn-analyze").classList.add("hidden");
  // Mostra il pulsante "Rimuovi sfondo" SEMPRE in edit se il capo ha una foto.
  // Anche se il cutout esiste gia', l'utente puo' voler rigenerarlo (es. foto
  // sostituita, qualita' bassa, ecc.). Etichetta dinamica per chiarezza.
  const bgBtnEdit = document.getElementById("btn-bg-removal");
  if (bgBtnEdit) {
    if (item.photo_url) {
      bgBtnEdit.classList.remove("hidden");
      bgBtnEdit.textContent = item.cutout_url
        ? "✨ Rigenera sfondo"
        : "✨ Rimuovi sfondo";
    } else {
      bgBtnEdit.classList.add("hidden");
    }
  }
  const bgStatusEdit = document.getElementById("bg-removal-status");
  if (bgStatusEdit) bgStatusEdit.textContent = "";
  _hideAiSubcategoryHint();

  // Cascade: refresh subcategory in base alla categoria del capo PRIMA di settarla
  setSelectValueOrAdd("field-category", item.category || "");
  refreshSubcategorySelect();
  setSelectValueOrAdd("field-subcategory", item.subcategory || "");
  setSelectValueOrAdd("field-style", item.style || "");
  // Multi-chips: gestisce sia formato nuovo (array) che legacy (stringa)
  setSelectedMulti("field-color",            toArray(item.color_primary || item.color));
  setSelectedMulti("field-color-secondary",  toArray(item.color_secondary));
  setSelectedMulti("field-pattern",          toArray(item.pattern));
  setSelectedMulti("field-material",         toArray(item.material));
  setSelectedMulti("field-occasion",         toArray(item.occasion));
  document.getElementById("field-notes").value = item.notes || "";
  document.getElementById("field-price").value = item.price !== null && item.price !== undefined ? formatNumberIT(item.price) : "";
  document.getElementById("field-link").value = item.link_url || "";

  // Slider formality (1-5, oppure 0 se non specificato)
  const formality = item.formality || 0;
  document.getElementById("field-formality").value = formality;
  document.getElementById("formality-value").textContent =
    formality === 0 ? "—" : `${formality}/5`;

  // Link status (banner con stato scadenza)
  renderLinkStatus(item);

  setSelectedSeasons(Array.isArray(item.season) ? item.season : []);
  setSelectedWeight(item.weight_class || "");
  // In modifica il toggle budget e' nascosto (la spesa, se serviva, e'
  // gia' stata registrata al primo save).
  updateBudgetToggleVisibility();

  // Wear stats sezione (visibile in modifica, nascosta in nuovo)
  renderWearStats(item);
  document.getElementById("wear-stats-section").classList.remove("hidden");

  // Info palette armocromia (se test completato)
  renderArmocromiaInfo(item);

  document.getElementById("modal-item").classList.remove("hidden");
}

function renderArmocromiaInfo(item) {
  const host = document.getElementById("item-armo-info");
  if (!host) return;
  const m = ColorMatch.matchItemColor(item);
  if (!m) {
    host.classList.add("hidden");
    host.innerHTML = "";
    return;
  }
  const meta = ColorMatch.statusMeta(m.status);
  const tip = m.status === "in"
    ? "Questo capo è perfetto per la tua stagione."
    : m.status === "near"
      ? "Vicino alla palette. Va bene, ma esistono colori più adatti."
      : m.status === "out"
        ? "Fuori palette: ti spegne. Indossalo lontano dal viso (pantaloni, scarpe)."
        : "Da evitare vicino al viso: usa solo come accessorio.";
  host.classList.remove("hidden");
  host.innerHTML = `
    <div class="armo-info-row">
      <span class="armo-info-emoji">${meta.emoji}</span>
      <div class="armo-info-text">
        <div class="armo-info-status" style="color:${meta.color}">${meta.label}</div>
        <div class="armo-info-score">Match ${m.score}/100</div>
      </div>
      ${m.closest ? `<div class="armo-info-swatch" style="background:${m.closest}" title="Colore palette piu' vicino: ${m.closest}"></div>` : ""}
    </div>
    <p class="armo-info-tip">${tip}</p>
  `;
}

// Render della sezione "Indossato N volte" + bottone "Indossato oggi"
function renderWearStats(item) {
  const count = item.wear_count || 0;
  document.getElementById("wear-stats-count").textContent =
    count === 0 ? "Mai indossato" : `Indossato ${count} ${count === 1 ? 'volta' : 'volte'}`;
  document.getElementById("wear-stats-last").textContent = item.last_worn_at
    ? `Ultima volta: ${new Date(item.last_worn_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}`
    : "—";
}

// Marca il capo corrente come "indossato oggi"
async function markCurrentItemAsWorn() {
  if (!state.editingId) return;
  const item = state.items.find(i => i.id === state.editingId);
  if (!item) return;

  try {
    const updated = await Wardrobe.markItemAsWorn(state.editingId, item);
    Object.assign(item, updated);  // patch in memoria
    renderWearStats(item);
    renderWardrobe();  // riaggiorna badge griglia
    toast("✓ Marcato come indossato oggi", "success");
  } catch (err) {
    console.error(err);
    toast("Errore aggiornamento", "error");
  }
}

function closeModal() {
  document.getElementById("modal-item").classList.add("hidden");
  state.editingId = null;
  state.pendingPhoto = null;
  state.pendingCutout = null;
}

// =============================================================================
// Foto handling: input -> resize -> preview -> show analyze button
// =============================================================================
async function handlePhotoSelected(file) {
  if (!file) return;

  try {
    const status = document.getElementById("analyze-status");
    status.textContent = "Elaborazione foto...";

    const result = await Claude.resizeImage(file);
    state.pendingPhoto = result;

    // Preview
    const preview = document.getElementById("photo-preview");
    preview.innerHTML = `<img src="data:image/jpeg;base64,${result.base64}" alt="" />`;

    // Foto nuova caricata: scarto eventuale cutout precedente
    state.pendingCutout = null;
    const bgStatusReset = document.getElementById("bg-removal-status");
    if (bgStatusReset) bgStatusReset.textContent = "";

    // Mostro pulsanti analizza + rimuovi sfondo
    document.getElementById("btn-analyze").classList.remove("hidden");
    document.getElementById("btn-bg-removal")?.classList.remove("hidden");
    status.textContent = "";
  } catch (err) {
    console.error("Errore foto:", err);
    toast("Errore caricamento foto", "error");
  }
}

// =============================================================================
// Analizza foto con Claude e popola i campi del form
// =============================================================================
async function analyzePendingPhoto() {
  if (!state.pendingPhoto) return;

  const btn = document.getElementById("btn-analyze");
  const status = document.getElementById("analyze-status");

  btn.disabled = true;
  status.textContent = "🤖 Analisi AI in corso...";

  try {
    // Passo a Claude la lista delle sotto-categorie ESISTENTI per evitare
    // che ne inventi di nuove. Se l'utente ha gia' scelto una categoria,
    // passo solo le sub di quella categoria (lista corta = matching migliore).
    const chosenCat = (document.getElementById("field-category").value || "").toLowerCase().trim();
    let availableSubs;
    if (chosenCat) {
      const usedSubs = state.items.map(it => (it.subcategory || "").trim()).filter(Boolean);
      availableSubs = Taxonomies.getSubcategoriesForCategory(chosenCat, usedSubs);
    } else {
      availableSubs = Taxonomies.listSimpleValues("subcategories");
    }

    const tags = await Claude.analyzeGarment(state.pendingPhoto.base64, availableSubs);

    // Se l'AI restituisce valori non in tassonomia, li aggiungo
    // automaticamente. ECCEZIONE: subcategories NON viene auto-aggiunta -
    // il valore proposto da Claude diventa un suggerimento "ghost" cliccabile
    // (vedi _setAiSubcategoryHint). Se l'utente conferma e la sub non esiste,
    // saveItem chiedera' esplicitamente l'autorizzazione alla creazione.
    const autoAddIfMissing = async (taxonomy, value) => {
      if (!value) return;
      const existing = Taxonomies.listSimpleValues(taxonomy).map(v => v.toLowerCase());
      if (!existing.includes(String(value).toLowerCase())) {
        await Taxonomies.addValue(taxonomy, value);
      }
    };
    const autoAddMulti = async (taxonomy, values) => {
      const arr = toArray(values);
      for (const v of arr) await autoAddIfMissing(taxonomy, v);
    };
    await Promise.all([
      autoAddIfMissing("styles", tags.style),
      // subcategories: NON auto-add (richiesta utente: prima usare esistenti)
      autoAddMulti("patterns",  tags.pattern),
      autoAddMulti("materials", tags.material),
      autoAddMulti("colors",    tags.color_primary || tags.color),
      autoAddMulti("colors",    tags.color_secondary),
      autoAddMulti("occasions", tags.occasion),
    ]);
    populateTaxonomyOptions();

    // Helper: setta solo se il campo e' vuoto (non sovrascrivere user input)
    const setIfEmpty = (id, value) => {
      if (!value) return;
      const el = document.getElementById(id);
      if (!el.value) el.value = value;
    };

    // Campi base
    setIfEmpty("field-category", tags.category);
    // Cascade: refresha le opzioni della sub in base alla categoria appena
    // settata. Senza questo, l'hint sotto suggerirebbe valori ma la select
    // potrebbe non contenerli ancora.
    refreshSubcategorySelect();
    // Sotto-categoria: NON compilo direttamente. Mostro un hint "ghost"
    // cliccabile sotto la select (richiesta Martina: AI compila categoria
    // ma lascia in ghost la sub, senza nemmeno selezionarla).
    _setAiSubcategoryHint(tags.subcategory);
    setIfEmpty("field-style", tags.style);

    // Multi-chips: unisce i valori AI con quelli gia' attivi (se presenti).
    // Accetta sia string che array dall'AI.
    const mergeMulti = (rootId, aiValue) => {
      const arr = toArray(aiValue);
      if (arr.length === 0) return;
      const existing = getSelectedMulti(rootId);
      // Auto-add alla taxonomy + selezione
      setSelectedMulti(rootId, [...new Set([...existing, ...arr])]);
    };
    mergeMulti("field-color",            tags.color_primary || tags.color);
    mergeMulti("field-color-secondary",  tags.color_secondary);
    mergeMulti("field-pattern",          tags.pattern);
    mergeMulti("field-material",         tags.material);
    mergeMulti("field-occasion",         tags.occasion);

    // Formality (slider): l'AI ritorna numero 1-5
    if (tags.formality && +document.getElementById("field-formality").value === 0) {
      const f = Math.max(1, Math.min(5, parseInt(tags.formality)));
      document.getElementById("field-formality").value = f;
      document.getElementById("formality-value").textContent = `${f}/5`;
    }

    // Stagioni (multi-select)
    if (Array.isArray(tags.season)) {
      // Unisce le stagioni gia' attive con quelle dedotte dall'AI
      setSelectedSeasons([...new Set([...getSelectedSeasons(), ...tags.season])]);
    }

    // Salvo la descrizione AI come "note di contesto" (utile al motore outfit)
    setIfEmpty("field-notes", tags.description);

    status.textContent = "✓ Tag suggeriti dall'AI - controlla e modifica";
    toast("Tag generati", "success");
  } catch (err) {
    console.error("Errore analisi:", err);
    status.textContent = "Analisi fallita: " + err.message;
    toast("Analisi AI fallita", "error");
  } finally {
    btn.disabled = false;
  }
}

// =============================================================================
// Rimuovi sfondo dalla foto del capo (locale via @imgly, no API)
// =============================================================================
// Funziona sia in "nuovo capo" (foto in state.pendingPhoto) sia in "modifica
// capo" (foto gia' su Storage in state.editingId -> item.photo_url).
// In edit, salvo subito il cutout su Firebase via uploadAndSaveCutout.
// In nuovo capo, tengo il blob in state.pendingCutout e lo salvo in saveItem.
async function removeBgFromPendingPhoto() {
  const btn = document.getElementById("btn-bg-removal");
  const status = document.getElementById("bg-removal-status");
  const preview = document.getElementById("photo-preview");

  btn.disabled = true;

  try {
    // Determino la URL pubblica della foto sorgente. Il server-side fa
    // bg-removal via HF API, quindi la foto deve essere su URL fetchabile
    // (non blob: locale). In flow "Nuovo capo" la foto non e' ancora su
    // Firebase: la carico ORA e mi tengo url+path per riuso in saveItem
    // (evito doppio upload).
    let sourceUrl = null;

    if (state.pendingPhoto && state.pendingPhoto.blob) {
      if (state.pendingPhoto.uploaded && state.pendingPhoto.uploaded.url) {
        // Gia' uploadata da un tentativo precedente: riuso
        sourceUrl = state.pendingPhoto.uploaded.url;
      } else {
        status.textContent = "📤 Carico la foto...";
        const { url, path } = await Wardrobe.uploadPhoto(state.pendingPhoto.blob);
        state.pendingPhoto.uploaded = { url, path };
        sourceUrl = url;
      }
    } else if (state.editingId) {
      const item = state.items.find(i => i.id === state.editingId);
      if (item && item.photo_url) sourceUrl = item.photo_url;
    }

    if (!sourceUrl) {
      toast("Carica prima una foto", "error");
      btn.disabled = false;
      return;
    }

    status.textContent = "✨ Rimozione sfondo in corso...";

    const cutoutBlob = await BgRemoval.removeBackgroundSmart(sourceUrl, (p) => {
      const pct = Math.round(p * 100);
      status.textContent = `✨ Rimozione sfondo: ${pct}%`;
    });

    // Preview con cutout (PNG trasparente)
    const cutoutUrl = URL.createObjectURL(cutoutBlob);
    preview.innerHTML = `<img src="${cutoutUrl}" alt="" />`;

    if (state.editingId) {
      // Edit mode: salvo subito su Storage + Firestore
      status.textContent = "💾 Salvataggio cutout...";
      const url = await Wardrobe.uploadAndSaveCutout(state.editingId, cutoutBlob);
      // Aggiorno l'item in memoria
      const item = state.items.find(i => i.id === state.editingId);
      if (item) item.cutout_url = url;
      status.textContent = "✓ Sfondo rimosso e salvato";
      btn.classList.add("hidden");  // gia' salvato, nascondo
      toast("Sfondo rimosso", "success");
    } else {
      // Nuovo capo: tengo il blob, sara' uploadato in saveItem
      state.pendingCutout = cutoutBlob;
      status.textContent = "✓ Sfondo rimosso (verra' salvato col capo)";
      toast("Sfondo rimosso", "success");
    }
  } catch (err) {
    console.error("Errore rimozione sfondo:", err);
    status.textContent = "Errore: " + (err.message || "rimozione fallita");
    toast("Rimozione sfondo fallita: " + (err.message || ""), "error");
  } finally {
    btn.disabled = false;
  }
}

// =============================================================================
// Estrazione multi-capo da foto outfit
// =============================================================================
// State runtime per il modal review: tiene le estrazioni con cleanup info
// per cancellare le foto sorgenti non confermate.
const _outfitExtractState = {
  sourceObjectUrl: null,   // blob: URL della foto outfit (cleanup su revoke)
  extracted: [],           // array di {photo_url, photo_path, cutout_blob, tags, selected}
};

async function handleOutfitPhotoSelected(file) {
  if (!file) return;

  // Subito chiudo il modal "Nuovo capo" e apro il modal review come placeholder
  document.getElementById("modal-item").classList.add("hidden");
  const extractModal = document.getElementById("modal-outfit-extract");
  extractModal.classList.remove("hidden");

  const statusEl = document.getElementById("outfit-extract-status");
  const previewEl = document.getElementById("outfit-extract-preview");
  const progressEl = document.getElementById("outfit-extract-progress");
  const listEl = document.getElementById("outfit-extract-list");

  // Reset stato precedente
  await cleanupOutfitExtractState();
  listEl.innerHTML = "";
  progressEl.classList.add("hidden");
  progressEl.textContent = "";
  previewEl.classList.remove("hidden");
  statusEl.textContent = "📐 Preparazione foto...";

  try {
    // Step 1: resize + base64 per Claude
    const resized = await Claude.resizeImage(file);
    previewEl.innerHTML = `<img src="data:image/jpeg;base64,${resized.base64}" alt="" />`;

    // Step 2: blob: URL solo per UI (preview). La foto vera viene uploadata
    // dentro extractAll come reference per gpt-image-1.
    const sourceObjectUrl = URL.createObjectURL(resized.blob);
    _outfitExtractState.sourceObjectUrl = sourceObjectUrl;

    // Step 3: chiama Claude per identificare i capi + image_prompt per ognuno
    statusEl.textContent = "🤖 Analisi AI dell'outfit...";
    const { garments } = await Claude.analyzeOutfit(resized.base64);

    if (!garments || garments.length === 0) {
      statusEl.textContent = "Nessun capo rilevato. Prova con una foto piu' chiara.";
      return;
    }

    statusEl.textContent = `✨ ${garments.length} capi rilevati. Generazione foto in corso (~10-15s per capo)...`;
    progressEl.classList.remove("hidden");

    // Step 4: per ogni capo, genera foto-prodotto via OpenAI gpt-image-1
    const results = await OutfitExtract.extractAll(resized.blob, garments, (i, total, label, result) => {
      if (i < 0) {
        // Step di setup (upload outfit reference)
        progressEl.textContent = label;
        return;
      }
      progressEl.textContent = `Capo ${i + 1}/${total}: ${label}`;
      if (label === "ok" && result) {
        appendExtractedItemCard(result, i);
      } else if (label === "errore" && result) {
        appendExtractedErrorCard(result, i);
      }
    });

    // Salvo lo state per il save finale
    _outfitExtractState.extracted = results.filter(r => !r.error).map(r => ({
      ...r,
      selected: true,  // default: tutti selezionati
    }));

    progressEl.classList.add("hidden");
    const ok = _outfitExtractState.extracted.length;
    const ko = results.length - ok;
    statusEl.textContent = `✓ ${ok} capi estratti${ko ? ` (${ko} falliti)` : ""}. Tocca per deselezionare prima di salvare.`;
  } catch (err) {
    console.error("[outfit-extract] errore:", err);
    statusEl.textContent = "Errore: " + (err.message || "operazione fallita");
    toast("Estrazione outfit fallita: " + (err.message || ""), "error");
  }
}

function appendExtractedItemCard(result, index) {
  const listEl = document.getElementById("outfit-extract-list");

  const cutoutObjUrl = URL.createObjectURL(result.cutout_blob);
  const t = result.tags || {};
  const category = t.category || "?";
  const sub = t.subcategory || "";
  const colors = (t.color_primary || []).join(", ");
  const tagSummary = [colors, (t.pattern || []).join("/"), (t.material || []).join("/")]
    .filter(Boolean).join(" · ");

  const card = document.createElement("div");
  card.className = "outfit-extract-item";
  card.dataset.index = index;
  card.innerHTML = `
    <div class="outfit-extract-thumb">
      <img src="${cutoutObjUrl}" alt="" />
    </div>
    <div class="outfit-extract-meta">
      <span class="cat">${category}</span>
      ${sub ? `<span class="sub">${sub}</span>` : ""}
      ${tagSummary ? `<span class="tags">${tagSummary}</span>` : ""}
    </div>
    <input type="checkbox" class="outfit-extract-toggle" checked aria-label="Includi nel salvataggio" />
  `;

  // Toggle handler: aggiorna il flag selected nello state
  const toggle = card.querySelector(".outfit-extract-toggle");
  toggle.addEventListener("change", () => {
    const r = _outfitExtractState.extracted[index];
    if (r) r.selected = toggle.checked;
  });

  listEl.appendChild(card);
}

function appendExtractedErrorCard(result, index) {
  const listEl = document.getElementById("outfit-extract-list");
  const t = result.tags || {};
  const card = document.createElement("div");
  card.className = "outfit-extract-item is-error";
  card.innerHTML = `
    <div class="outfit-extract-thumb">⚠️</div>
    <div class="outfit-extract-meta">
      <span class="cat">${t.category || "Capo"} ${index + 1}</span>
      <span class="sub">${result.error || "Errore"}</span>
    </div>
  `;
  listEl.appendChild(card);
}

// Salva i capi selezionati: createItem per ognuno + uploadAndSaveCutout
async function saveExtractedItems() {
  const selected = _outfitExtractState.extracted.filter(r => r.selected);
  if (selected.length === 0) {
    toast("Nessun capo selezionato", "warning");
    return;
  }

  const saveBtn = document.getElementById("btn-outfit-extract-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "...";

  const statusEl = document.getElementById("outfit-extract-status");

  let saved = 0;
  let errors = 0;

  for (let i = 0; i < selected.length; i++) {
    const r = selected[i];
    statusEl.textContent = `💾 Salvataggio ${i + 1}/${selected.length}...`;

    try {
      const t = r.tags || {};
      const payload = {
        photo_url: r.photo_url,
        photo_path: r.photo_path,
        category: t.category || null,
        subcategory: t.subcategory || null,
        color: (t.color_primary || [])[0] || null,
        color_primary: t.color_primary || [],
        color_secondary: t.color_secondary || [],
        pattern: t.pattern || [],
        material: t.material || [],
        style: t.style || null,
        formality: typeof t.formality === "number" ? t.formality : null,
        season: t.season || [],
        occasion: t.occasion || [],
        description: t.description || null,
      };

      const newItem = await Wardrobe.createItem(payload);

      // Upload cutout (il blob ce l'ho gia' in memoria)
      try {
        const cutoutUrl = await Wardrobe.uploadAndSaveCutout(newItem.id, r.cutout_blob);
        newItem.cutout_url = cutoutUrl;
      } catch (cuErr) {
        console.warn("[outfit-extract] cutout upload fallito (non bloccante):", cuErr);
      }

      // Aggiorno la lista in memoria per refresh UI sotto
      state.items.unshift(newItem);
      saved++;
    } catch (err) {
      console.error("[outfit-extract] save fallito:", err);
      errors++;
    }
  }

  // Anche i capi NON selezionati: pulisco la photo orfana da Storage
  const unselected = _outfitExtractState.extracted.filter(r => !r.selected);
  for (const r of unselected) {
    await OutfitExtract.deleteStoragePath(r.photo_path);
  }

  // Reset state e refresh UI
  _outfitExtractState.extracted = [];
  await cleanupOutfitExtractState();

  toast(`✓ ${saved} capi salvati${errors ? ` (${errors} errori)` : ""}`, saved > 0 ? "success" : "error");
  document.getElementById("modal-outfit-extract").classList.add("hidden");
  renderWardrobe();
  saveBtn.disabled = false;
  saveBtn.textContent = "Salva";
}

async function closeOutfitExtractModal() {
  // Se l'utente chiude senza salvare, cancello tutte le photo gia' uploadate
  if (_outfitExtractState.extracted.length > 0) {
    const ok = await fmConfirm("Scartare tutti i capi estratti?", { danger: true });
    if (!ok) return;
    for (const r of _outfitExtractState.extracted) {
      await OutfitExtract.deleteStoragePath(r.photo_path);
    }
    _outfitExtractState.extracted = [];
  }
  await cleanupOutfitExtractState();
  document.getElementById("modal-outfit-extract").classList.add("hidden");
}

// Pulisce l'object URL della foto sorgente (libera memoria)
async function cleanupOutfitExtractState() {
  if (_outfitExtractState.sourceObjectUrl) {
    URL.revokeObjectURL(_outfitExtractState.sourceObjectUrl);
    _outfitExtractState.sourceObjectUrl = null;
  }
}

// Helper conferma minimo (no dipendenza esterna)
function fmConfirm(message, opts = {}) {
  return new Promise(resolve => {
    const ok = window.confirm(message);
    resolve(ok);
  });
}

// =============================================================================
// Salva capo (create o update)
// =============================================================================
async function saveItem() {
  const priceRaw = document.getElementById("field-price").value;
  const price = parseNumberIT(priceRaw);  // gestisce formato italiano "1.234,50"
  const formalityRaw = +document.getElementById("field-formality").value;
  const formality = formalityRaw >= 1 && formalityRaw <= 5 ? formalityRaw : null;
  // Multi-select: array di stringhe (vuoto = nessun valore selezionato)
  const colorsPrimary   = getSelectedMulti("field-color");
  const colorsSecondary = getSelectedMulti("field-color-secondary");
  const patterns        = getSelectedMulti("field-pattern");
  const materials       = getSelectedMulti("field-material");
  const occasions       = getSelectedMulti("field-occasion");

  const newLink = document.getElementById("field-link").value.trim() || null;

  // Determino se aggiornare il timestamp del link:
  // - se l'utente aggiunge/modifica il link rispetto a prima -> nuovo timestamp
  // - se non l'ha toccato -> mantengo il vecchio timestamp
  let linkAddedAt = null;
  if (newLink) {
    const existing = state.editingId ? state.items.find(i => i.id === state.editingId) : null;
    if (existing && existing.link_url === newLink && existing.link_added_at) {
      // Stesso link di prima → mantengo timestamp originale
      linkAddedAt = existing.link_added_at;
    } else {
      // Link nuovo o cambiato → timestamp adesso
      linkAddedAt = new Date().toISOString();
    }
  }

  const data = {
    category: document.getElementById("field-category").value || null,
    subcategory: document.getElementById("field-subcategory").value.trim() || null,
    // Multi-select: salvo come array. 'color' = primo colore principale per
    // retrocompat con vecchi renderer che si aspettano string.
    color:           colorsPrimary[0] || null,
    color_primary:   colorsPrimary,
    color_secondary: colorsSecondary,
    pattern:         patterns,
    material:        materials,
    occasion:        occasions,
    style: document.getElementById("field-style").value || null,
    formality,
    season: getSelectedSeasons(),
    weight_class: getSelectedWeight(),
    notes: document.getElementById("field-notes").value.trim() || null,
    price: (price !== null && !isNaN(price)) ? price : null,
    link_url: newLink,
    link_added_at: linkAddedAt,
  };

  // Filter via __add_new__ sui campi single-select rimasti
  if (data.category === "__add_new__")    data.category = null;
  if (data.subcategory === "__add_new__") data.subcategory = null;
  if (data.style === "__add_new__")       data.style = null;

  // GATE sottocategoria: se la sub e' NUOVA (non esiste ne' in built-in
  // CATEGORY_TO_SUBCATEGORIES ne' nella taxonomy del DB), chiedo conferma
  // esplicita prima di crearla. L'utente puo':
  //  - confermare → crea la sub + (se categoria nota) associa parent
  //  - rifiutare → il capo viene salvato con subcategory=null
  if (data.subcategory) {
    const knownSubs = Taxonomies.listSimpleValues("subcategories")
      .map(v => v.toLowerCase());
    const knownBuiltIn = new Set();
    Object.values(Taxonomies.CATEGORY_TO_SUBCATEGORIES || {}).forEach(arr => {
      arr.forEach(s => knownBuiltIn.add(s.toLowerCase()));
    });
    const lower = data.subcategory.toLowerCase();
    const isKnown = knownSubs.includes(lower) || knownBuiltIn.has(lower);
    if (!isKnown) {
      const catLabel = data.category ? `"${data.category}"` : "questa categoria";
      const ok = window.confirm(
        `La sotto-categoria "${data.subcategory}" non esiste ancora.\n\n` +
        `Vuoi crearla nuova in ${catLabel}?\n\n` +
        `Annulla → il capo verra' salvato senza sotto-categoria.`
      );
      if (!ok) {
        data.subcategory = null;
      } else if (data.category) {
        // L'utente conferma: associo il parent cosi' apparira' nella
        // categoria giusta in tab Categorie.
        try { Taxonomies.setSubcategoryParent(data.subcategory, data.category); }
        catch {}
      }
    }
  }

  // Auto-save dei valori NUOVI scritti nei campi free-text dentro le tassonomie
  // (silenzioso, niente prompt: l'utente l'ha gia' digitato o confermato sopra).
  const autoAdd = async (taxonomy, value) => {
    if (!value) return;
    const existing = Taxonomies.listSimpleValues(taxonomy).map(v => v.toLowerCase());
    if (!existing.includes(value.toLowerCase())) {
      await Taxonomies.addValue(taxonomy, value);
    }
  };
  try {
    const tasks = [autoAdd("subcategories", data.subcategory)];
    // I 5 campi multi-select ora sono array: aggiungo ognuno alla taxonomy
    (data.color_primary   || []).forEach(c => tasks.push(autoAdd("colors", c)));
    (data.color_secondary || []).forEach(c => tasks.push(autoAdd("colors", c)));
    (data.pattern         || []).forEach(p => tasks.push(autoAdd("patterns", p)));
    (data.material        || []).forEach(m => tasks.push(autoAdd("materials", m)));
    (data.occasion        || []).forEach(o => tasks.push(autoAdd("occasions", o)));
    await Promise.all(tasks);
    populateTaxonomyOptions();
  } catch (err) {
    console.warn("Auto-add taxonomy failed (non bloccante):", err);
  }

  const btn = document.getElementById("btn-save-item");
  btn.disabled = true;
  btn.textContent = "...";

  try {
    // Upload foto se presente. Se l'utente aveva gia' premuto "Rimuovi sfondo"
    // prima del Salva, la foto e' gia' su Storage (state.pendingPhoto.uploaded):
    // riuso URL+path invece di re-uploadare lo stesso file.
    if (state.pendingPhoto) {
      if (state.pendingPhoto.uploaded && state.pendingPhoto.uploaded.url) {
        data.photo_url = state.pendingPhoto.uploaded.url;
        data.photo_path = state.pendingPhoto.uploaded.path;
      } else {
        const { url, path } = await Wardrobe.uploadPhoto(state.pendingPhoto.blob);
        data.photo_url = url;
        data.photo_path = path;
      }
    }

    if (state.editingId) {
      await Wardrobe.updateItem(state.editingId, data);
      Haptic.tap();
      toast("Capo aggiornato", "success");
    } else {
      if (!data.photo_url && !state.pendingPhoto) {
        toast("Aggiungi una foto", "error");
        btn.disabled = false; btn.textContent = "Salva";
        return;
      }
      const newItem = await Wardrobe.createItem(data);
      Haptic.success();

      // Se abbiamo un cutout pendente (sfondo gia' rimosso prima del save),
      // lo carichiamo su Storage e linkiamo al capo appena creato.
      if (state.pendingCutout) {
        try {
          const cutoutUrl = await Wardrobe.uploadAndSaveCutout(newItem.id, state.pendingCutout);
          newItem.cutout_url = cutoutUrl;
        } catch (cuErr) {
          console.warn("Upload cutout fallito (non bloccante):", cuErr);
        }
      }

      // Se il prezzo e' > 0 e il toggle 'Registra in budget' e' attivo,
      // crea automaticamente una transazione nel budget del mese corrente.
      const budgetToggle = document.getElementById("field-budget-toggle");
      if (data.price && data.price > 0 && budgetToggle && budgetToggle.checked) {
        try {
          const subcat = data.subcategory || data.category || "Capo";
          const colorPart = (data.color_primary && data.color_primary.length)
            ? " " + data.color_primary[0] : "";
          const label = capitalize(subcat) + colorPart;
          await addBudgetTransaction(monthKey(), {
            label,
            amount: data.price,
            date: new Date().toISOString().slice(0, 10),
            item_id: newItem?.id || null,
            link: data.link_url || null,
          });
          toast(`Capo aggiunto · spesa registrata in budget`, "success");
        } catch (err) {
          console.warn("Budget add fail:", err);
          toast("Capo aggiunto · errore registrazione budget", "default");
        }
      } else {
        toast("Capo aggiunto", "success");
      }
    }

    // Ricarico la lista (semplice e affidabile)
    state.items = await Wardrobe.listItems();
    renderWardrobe();
    renderFilters();
    closeModal();
  } catch (err) {
    console.error("Errore salvataggio:", err);
    toast("Errore salvataggio", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Salva";
  }
}

// =============================================================================
// Elimina capo
// =============================================================================
async function deleteCurrentItem() {
  if (!state.editingId) return;
  if (!confirm("Eliminare definitivamente questo capo?")) return;

  const item = state.items.find(i => i.id === state.editingId);
  try {
    await Wardrobe.deleteItem(state.editingId, item?.photo_path, item?.cutout_path);
    state.items = state.items.filter(i => i.id !== state.editingId);
    renderWardrobe();
    renderFilters();
    closeModal();
    toast("Capo eliminato", "success");
  } catch (err) {
    console.error("Errore eliminazione:", err);
    toast("Errore eliminazione", "error");
  }
}

// =============================================================================
// Generazione outfit
// =============================================================================
async function generateOutfit() {
  const context = document.getElementById("outfit-context").value.trim();
  if (!context) {
    toast("Inserisci un'occasione", "error");
    return;
  }
  if (state.items.length < 2) {
    toast("Aggiungi almeno 2 capi al guardaroba", "error");
    return;
  }

  const btn = document.getElementById("btn-generate-outfit");
  btn.disabled = true;
  btn.textContent = "✨ Generazione...";

  try {
    // Recupero il meteo se l'utente ha attivato la posizione (Settings → Meteo)
    let weatherCtx = null;
    const loc = Weather.getCachedLocation();
    if (loc) {
      try {
        const forecast = await Weather.getForecast(loc);
        weatherCtx = Weather.buildWeatherContext(forecast);
      } catch (err) {
        console.warn("Forecast non disponibile, procedo senza:", err);
      }
    }

    const outfits = await Claude.suggestOutfits(context, state.items, weatherCtx);
    state.currentOutfits = outfits.map(o => ({ ...o, context }));
    renderCurrentOutfits();
    toast(`${outfits.length} outfit generati${weatherCtx ? " (meteo incluso)" : ""}`, "success");
  } catch (err) {
    console.error("Errore generazione outfit:", err);
    toast("Errore generazione: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ Genera outfit";
  }
}

function renderCurrentOutfits() {
  const container = document.getElementById("outfit-results");

  if (state.currentOutfits.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = state.currentOutfits.map((outfit, idx) => {
    const items = (outfit.item_ids || [])
      .map(id => state.items.find(it => it.id === id))
      .filter(Boolean);

    return `
      <div class="outfit-card">
        <h3>${escapeHtml(outfit.title || "Outfit")}</h3>
        ${outfit.description ? `<p class="outfit-desc">${escapeHtml(outfit.description)}</p>` : ""}
        <div class="outfit-items">
          ${items.map(it => `
            <div class="outfit-item">
              ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : "👕"}
            </div>
          `).join("")}
        </div>
        <div class="outfit-actions">
          <button class="btn-secondary" data-save="${idx}">⭐ Salva</button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-save]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = +btn.dataset.save;
      try {
        const saved = await Outfit.saveOutfit(state.currentOutfits[idx]);
        state.savedOutfits.unshift(saved);
        renderSavedOutfits();
        toast("Outfit salvato", "success");
      } catch (err) {
        console.error(err);
        toast("Errore salvataggio outfit", "error");
      }
    });
  });
}

function renderSavedOutfits() {
  const container = document.getElementById("saved-outfits");

  if (state.savedOutfits.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px">Nessun outfit salvato</p>`;
    return;
  }

  container.innerHTML = state.savedOutfits.map(outfit => {
    const items = (outfit.item_ids || [])
      .map(id => state.items.find(it => it.id === id))
      .filter(Boolean);

    // Score armocromia (solo se test fatto)
    const armoScore = ColorMatch.outfitPaletteScore(outfit.item_ids || [], state.items);
    const scoreStatus = ColorMatch.outfitScoreStatus(armoScore?.score);
    const armoBadge = (armoScore && scoreStatus)
      ? `<span class="outfit-armo-badge" title="${scoreStatus.label}: ${armoScore.score}/100 della tua palette" style="background:${scoreStatus.color}22;color:${scoreStatus.color}">${scoreStatus.emoji} ${armoScore.score}%</span>`
      : "";

    return `
      <div class="outfit-card">
        <div class="outfit-card-head">
          <h3>${escapeHtml(outfit.title || "Outfit")}</h3>
          ${armoBadge}
        </div>
        ${outfit.context ? `<p class="outfit-desc">📍 ${escapeHtml(outfit.context)}</p>` : ""}
        <div class="outfit-items">
          ${items.map(it => `
            <div class="outfit-item">
              ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : "👕"}
            </div>
          `).join("")}
        </div>
        <div class="outfit-actions">
          <button class="btn-worn" data-worn="${outfit.id}">✓ Indossato</button>
          <button class="btn-secondary" data-share="${outfit.id}">📸 Condividi</button>
          <button class="btn-secondary" data-del="${outfit.id}">🗑️</button>
        </div>
      </div>
    `;
  }).join("");

  // Condividi outfit -> apre modal scelta template + opzioni
  container.querySelectorAll("[data-share]").forEach(btn => {
    btn.addEventListener("click", () => {
      const outfit = state.savedOutfits.find(o => o.id === btn.dataset.share);
      if (outfit) openShareModal(outfit);
    });
  });

  // "Indossato oggi" → incrementa wearCount su tutti i capi dell'outfit
  container.querySelectorAll("[data-worn]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const outfit = state.savedOutfits.find(o => o.id === btn.dataset.worn);
      if (!outfit) return;
      btn.disabled = true;
      btn.textContent = "...";
      try {
        await Wardrobe.markOutfitAsWorn(outfit.item_ids || [], state.items);
        // Refresh items per riflettere wearCount aggiornati
        state.items = await Wardrobe.listItems();
        renderWardrobe();
        toast(`✓ Outfit indossato (${(outfit.item_ids || []).length} capi)`, "success");
      } catch (err) {
        console.error(err);
        toast("Errore: " + err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "✓ Indossato oggi";
      }
    });
  });

  container.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Eliminare questo outfit salvato?")) return;
      try {
        await Outfit.deleteSavedOutfit(btn.dataset.del);
        state.savedOutfits = state.savedOutfits.filter(o => o.id !== btn.dataset.del);
        renderSavedOutfits();
      } catch (err) {
        toast("Errore eliminazione", "error");
      }
    });
  });
}

// =============================================================================
// Style Shuffle (3.7) - genera 3 outfit random con animazione slot-machine
// =============================================================================

// Categorie richieste per un outfit valido (fallback graceful se mancano)
const SHUFFLE_REQUIRED = ["top", "bottom", "scarpe"];
const SHUFFLE_OPTIONAL = ["accessori"];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Costruisce un outfit pescando 1 capo per ogni categoria richiesta
function composeRandomOutfit() {
  const items = state.items;

  // Caso 1: c'e' un "completo" -> usa quello + scarpe + opzionali
  const completi = items.filter(it => it.category === "completo");
  let chosen = [];

  if (completi.length > 0 && Math.random() < 0.3) {
    chosen.push(pickRandom(completi));
    const scarpe = items.filter(it => it.category === "scarpe");
    if (scarpe.length) chosen.push(pickRandom(scarpe));
  } else {
    // Caso 2: top + bottom + scarpe
    for (const cat of SHUFFLE_REQUIRED) {
      const pool = items.filter(it => it.category === cat);
      if (pool.length) chosen.push(pickRandom(pool));
    }
  }

  // Aggiungo 0-1 accessorio random (50% chance)
  if (Math.random() < 0.5) {
    const acc = items.filter(it => it.category === "accessori");
    if (acc.length) chosen.push(pickRandom(acc));
  }

  return chosen;
}

const SHUFFLE_TITLES = [
  "Casual chic", "Look essenziale", "Vibes urbane",
  "Pulito e raffinato", "Outfit del giorno", "Combo del momento",
  "Easy & cool", "Stile spontaneo",
];

async function generateShuffleOutfits() {
  if (state.items.length < 2) {
    toast("Aggiungi almeno 2 capi al guardaroba", "error");
    return;
  }

  const container = document.getElementById("shuffle-results");
  // Render 3 card con slot vuoti
  const outfits = [
    composeRandomOutfit(),
    composeRandomOutfit(),
    composeRandomOutfit(),
  ];

  container.innerHTML = outfits.map((items, idx) => {
    const slots = items.map((_, i) => `<div class="shuffle-slot is-spinning" data-card="${idx}" data-slot="${i}"></div>`).join("");
    return `
      <div class="shuffle-card">
        <div class="shuffle-card-title">${SHUFFLE_TITLES[Math.floor(Math.random() * SHUFFLE_TITLES.length)]}</div>
        <div class="shuffle-card-items" data-items="${idx}">${slots}</div>
      </div>
    `;
  }).join("");

  // Animazione slot machine: cycling random per 1 secondo, poi settle
  const SPIN_DURATION = 1000;
  const SPIN_INTERVAL = 80;
  const allItemUrls = state.items.filter(it => it.photo_url).map(it => it.photo_url);

  const spinTimers = [];
  document.querySelectorAll(".shuffle-slot").forEach(slot => {
    const t = setInterval(() => {
      const url = pickRandom(allItemUrls);
      if (url) slot.innerHTML = `<img src="${url}" alt="" />`;
    }, SPIN_INTERVAL);
    spinTimers.push(t);
  });

  // Dopo SPIN_DURATION ms, settle ogni slot al capo finale
  setTimeout(() => {
    spinTimers.forEach(t => clearInterval(t));
    outfits.forEach((items, cardIdx) => {
      items.forEach((item, slotIdx) => {
        const slot = container.querySelector(`[data-card="${cardIdx}"][data-slot="${slotIdx}"]`);
        if (slot) {
          slot.classList.remove("is-spinning");
          slot.innerHTML = item.photo_url
            ? `<img src="${item.photo_url}" alt="" />`
            : '👕';
        }
      });
    });

    // Pulsante "Salva" e "Indossato" per ogni outfit
    container.querySelectorAll(".shuffle-card").forEach((card, idx) => {
      const items = outfits[idx];
      const actions = document.createElement("div");
      actions.className = "outfit-actions";
      actions.style.marginTop = "var(--space-3)";
      actions.innerHTML = `
        <button class="btn-secondary" data-shuffle-save="${idx}">⭐ Salva</button>
        <button class="btn-worn" data-shuffle-worn="${idx}">✓ Indossato oggi</button>
      `;
      card.appendChild(actions);

      actions.querySelector("[data-shuffle-save]").addEventListener("click", async () => {
        try {
          const saved = await Outfit.saveOutfit({
            title: card.querySelector(".shuffle-card-title").textContent,
            description: "Generato da Sorprendimi",
            item_ids: items.map(it => it.id),
            context: "shuffle"
          });
          state.savedOutfits.unshift(saved);
          renderSavedOutfits();
          toast("Outfit salvato", "success");
        } catch (err) {
          toast("Errore salvataggio", "error");
        }
      });

      actions.querySelector("[data-shuffle-worn]").addEventListener("click", async () => {
        try {
          await Wardrobe.markOutfitAsWorn(items.map(it => it.id), state.items);
          state.items = await Wardrobe.listItems();
          renderWardrobe();
          toast(`✓ Outfit indossato`, "success");
        } catch (err) {
          toast("Errore: " + err.message, "error");
        }
      });
    });
  }, SPIN_DURATION);
}

// =============================================================================
// Navigazione: bottom nav
// =============================================================================
function switchPage(pageName) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(`page-${pageName}`).classList.add("active");

  document.querySelectorAll(".nav-btn[data-page]").forEach(b => {
    b.classList.toggle("active", b.dataset.page === pageName);
  });

  document.getElementById("page-title").textContent =
    pageName === "wardrobe" ? "Guardaroba" : "Outfit AI";
}

// =============================================================================
// Utility
// =============================================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// =============================================================================
// Incolla foto dalla clipboard (Safari/altra app -> tap lungo foto -> Copia)
// =============================================================================
async function pastePhotoFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast("Lettura clipboard non supportata sul browser", "error");
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find(t => t.startsWith("image/"));
      if (!imgType) continue;
      const blob = await item.getType(imgType);
      await handlePhotoSelected(new File([blob], "pasted.jpg", { type: imgType }));
      toast("✓ Foto incollata. Lancio analisi AI...", "success");
      // Auto-trigger AI subito dopo la paste, cosi' l'utente non deve toccare
      // un secondo bottone. analyzePhoto() e' la funzione esistente.
      setTimeout(() => {
        try { analyzePendingPhoto(); } catch (e) { console.warn("Auto-analyze fail:", e); }
      }, 200);
      return;
    }
    toast("Clipboard non contiene un'immagine. Copia un'immagine prima (tap lungo → Copia)", "default");
  } catch (err) {
    console.error(err);
    toast("Impossibile leggere clipboard: " + err.message, "error");
  }
}

// =============================================================================
// Event bindings
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Bottom nav (dinamica, leggi da theme prefs)
  try {
    renderBottomNav(switchPage, openAddItem);
    // Re-render se cambia la configurazione
    if (typeof Theme.subscribe === "function") {
      Theme.subscribe(() => {
        try { renderBottomNav(switchPage, openAddItem); } catch (e) { console.error("renderBottomNav fail:", e); }
        try { renderSeasonChips(); } catch (e) { console.error("renderSeasonChips fail:", e); }
        try { renderWeightChips(); } catch (e) { console.error("renderWeightChips fail:", e); }
      });
    }
  } catch (err) {
    console.error("Bottom nav setup fail (non blocco il boot):", err);
  }

  // Incolla foto da clipboard (con auto-analisi AI)
  const btnPastePhoto = document.getElementById("btn-paste-photo");
  if (btnPastePhoto) btnPastePhoto.addEventListener("click", pastePhotoFromClipboard);

  // Forza aggiornamento PWA (utile quando il SW e' bloccato su versione vecchia)
  const btnForceUpdate = document.getElementById("btn-force-update");
  if (btnForceUpdate) btnForceUpdate.addEventListener("click", async () => {
    if (!confirm("Forzo aggiornamento app?\nIl service worker e tutte le cache verranno cancellate, l'app si ricarichera'. I tuoi capi e outfit (su Firebase) non vengono toccati.")) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (err) { console.error("Force update fail:", err); }
    location.reload();
  });

  // Chip stagione: toggle is-active al click
  const seasonRoot = document.getElementById("field-season");
  if (seasonRoot) {
    seasonRoot.addEventListener("click", (e) => {
      const chip = e.target.closest(".season-chip");
      if (!chip) return;
      chip.classList.toggle("is-active");
    });
  }

  // Chip peso: single-select (deselezionabile ritappando)
  const weightRoot = document.getElementById("field-weight");
  if (weightRoot) {
    weightRoot.addEventListener("click", (e) => {
      const chip = e.target.closest(".weight-chip");
      if (!chip) return;
      const key = chip.dataset.key;
      const current = weightRoot.dataset.value || "";
      setSelectedWeight(current === key ? "" : key);
    });
  }

  // Multi-chips: 5 campi in multi-select (colore principale/secondario,
  // pattern, materiali, occasioni). Stesso handler condiviso.
  ["field-color", "field-color-secondary", "field-pattern", "field-material", "field-occasion"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", (e) => onMultiChipClick(id, e));
    });

  // Foto inputs
  document.getElementById("input-photo-camera").addEventListener("change", e => {
    handlePhotoSelected(e.target.files[0]);
    e.target.value = ""; // permette di riselezionare la stessa foto
  });
  document.getElementById("input-photo-gallery").addEventListener("change", e => {
    handlePhotoSelected(e.target.files[0]);
    e.target.value = "";
  });

  // Bottoni modale
  document.getElementById("btn-analyze").addEventListener("click", analyzePendingPhoto);
  document.getElementById("btn-bg-removal")?.addEventListener("click", removeBgFromPendingPhoto);
  document.getElementById("btn-save-item").addEventListener("click", saveItem);

  // Estrazione multi-capo da foto outfit intero
  document.getElementById("input-outfit-photo")?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";  // permette di riselezionare la stessa foto
    if (f) handleOutfitPhotoSelected(f);
  });
  document.getElementById("btn-outfit-extract-save")?.addEventListener("click", saveExtractedItems);
  document.getElementById("btn-outfit-extract-close")?.addEventListener("click", closeOutfitExtractModal);

  // Composer "Foto outfit": apre il modal con galleria sfondi
  const btnPhotoOutfit = document.getElementById("btn-photo-outfit");
  if (btnPhotoOutfit) {
    btnPhotoOutfit.addEventListener("click", () => PhotoOutfit.open());
  }
  document.getElementById("po-close")?.addEventListener("click", () => PhotoOutfit.close());
  document.getElementById("po-save-btn")?.addEventListener("click", () => PhotoOutfit.save());
  // Input file dentro il modal (camera + galleria)
  document.getElementById("po-input-camera")?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) PhotoOutfit.onPhotoSelected(f);
  });
  document.getElementById("po-input-gallery")?.addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) PhotoOutfit.onPhotoSelected(f);
  });
  document.getElementById("btn-delete-item").addEventListener("click", deleteCurrentItem);
  document.getElementById("btn-mark-worn").addEventListener("click", markCurrentItemAsWorn);

  // Quick actions cross-feature dal modal capo (reminders/notes pre-compilati)
  const quickActionsEl = document.getElementById("item-quick-actions");
  if (quickActionsEl) {
    quickActionsEl.addEventListener("click", async (e) => {
      const btn = e.target.closest(".quick-action-chip");
      if (!btn) return;
      const action = btn.dataset.action;
      const item = state.items.find(i => i.id === state.editingId);
      if (!item) {
        toast("Apri prima un capo per usare l'azione rapida", "warn");
        return;
      }
      btn.disabled = true;
      try {
        const { handleItemQuickAction } = await import("./item-quick-actions.js");
        const res = await handleItemQuickAction(action, item);
        if (res?.kind === "reminder") toast(res.message, "success");
        // se kind=navigate, l'azione fa gia' il redirect
      } catch (err) {
        console.error(err);
        toast("Errore: " + err.message, "warn");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Share modal binding
  document.getElementById("btn-cancel-share").addEventListener("click", closeShareModal);
  document.getElementById("btn-confirm-share").addEventListener("click", confirmShare);
  document.getElementById("btn-share-instagram")?.addEventListener("click", confirmShareToInstagram);
  document.getElementById("share-include-links").addEventListener("change", () => {
    // Le opzioni link/hashtag NON ri-generano la preview perché sono solo nella caption
  });

  // Builder modal binding
  document.getElementById("btn-cancel-builder").addEventListener("click", closeBuilder);
  document.getElementById("btn-save-builder").addEventListener("click", saveBuilder);
  document.getElementById("btn-delete-builder").addEventListener("click", deleteBuilderTemplate);

  // Tutti i controlli del builder ri-generano la preview
  const builderInputs = [
    "ct-bg-color1", "ct-bg-color2", "ct-bg-direction",
    "ct-pattern-type", "ct-pattern-color",
    "ct-title-font", "ct-title-color", "ct-title-italic",
    "ct-accent", "ct-line", "ct-emoji",
    "ct-photo-border-color", "ct-photo-shadow",
    "ct-wm-text", "ct-wm-color",
  ];
  builderInputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", scheduleBuilderPreview);
    el.addEventListener("input", scheduleBuilderPreview);
  });

  // Slider con display live + preview
  const sliders = [
    { id: "ct-title-size",       valId: "ct-title-size-val" },
    { id: "ct-photo-radius",     valId: "ct-photo-radius-val" },
    { id: "ct-photo-border",     valId: "ct-photo-border-val" },
    { id: "ct-photo-gap",        valId: "ct-photo-gap-val" },
    { id: "ct-pattern-density",  valId: "ct-pattern-density-val" },
  ];
  sliders.forEach(({ id, valId }) => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      document.getElementById(valId).textContent = el.value;
      scheduleBuilderPreview();
    });
  });

  // Radio button bg-type e title-align e aspect
  document.querySelectorAll('input[name="ct-bg-type"]').forEach(r => {
    r.addEventListener("change", () => { toggleGradientFields(); scheduleBuilderPreview(); });
  });
  document.querySelectorAll('input[name="ct-title-align"]').forEach(r => {
    r.addEventListener("change", scheduleBuilderPreview);
  });
  document.querySelectorAll('input[name="ct-aspect"]').forEach(r => {
    r.addEventListener("change", scheduleBuilderPreview);
  });

  // Bottoni overlay (aggiungi text/sticker/shape/logo)
  document.getElementById("btn-add-text").addEventListener("click", addTextOverlay);
  document.getElementById("btn-add-sticker").addEventListener("click", addStickerOverlay);
  document.getElementById("btn-add-shape").addEventListener("click", addShapeOverlay);
  document.getElementById("input-upload-logo").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) uploadLogoOverlay(file);
    e.target.value = "";
  });

  // Slider formality: aggiorno il display live
  const formalitySlider = document.getElementById("field-formality");
  formalitySlider.addEventListener("input", () => {
    const v = +formalitySlider.value;
    document.getElementById("formality-value").textContent = v === 0 ? "—" : `${v}/5`;
  });

  // Listener "+ Aggiungi nuovo..." sui select del modal capo
  // (solo i campi rimasti single-select)
  const taxLinks = [
    ["field-category",     "categories"],
    ["field-style",        "styles"],
    ["field-subcategory",  "subcategories"],
  ];
  taxLinks.forEach(([selectId, taxonomy]) => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.addEventListener("change", () => {
      if (sel.value === "__add_new__") {
        handleSelectAddNew(selectId, taxonomy);
      }
    });
  });

  // Cascade: quando cambia categoria, ripopola field-subcategory filtrato.
  // Conserva la selezione corrente solo se compatibile con la nuova categoria.
  document.getElementById("field-category").addEventListener("change", () => {
    const subEl = document.getElementById("field-subcategory");
    const previousSub = subEl.value;
    refreshSubcategorySelect();
    // Verifica se previousSub e' tra le option valide della nuova lista
    const stillValid = Array.from(subEl.options).some(o => o.value === previousSub);
    subEl.value = stillValid ? previousSub : "";
  });

  // Prezzo: sanifica input (solo cifre, punti, virgole) e formatta su blur
  // + toggle "Registra in budget" visibile solo se prezzo > 0 e capo nuovo
  const priceField = document.getElementById("field-price");
  if (priceField) {
    priceField.addEventListener("input", () => {
      const cleaned = sanitizeNumericInput(priceField.value);
      if (cleaned !== priceField.value) priceField.value = cleaned;
      updateBudgetToggleVisibility();
    });
    priceField.addEventListener("blur", () => {
      const num = parseNumberIT(priceField.value);
      priceField.value = num !== null ? formatNumberIT(num) : "";
      updateBudgetToggleVisibility();
    });
  }

  // Link prodotto: bottone "Apri" e visibilità reattiva
  const fieldLink = document.getElementById("field-link");
  const btnOpenLink = document.getElementById("btn-open-link");
  fieldLink.addEventListener("input", () => {
    const url = fieldLink.value.trim();
    if (url && /^https?:\/\//i.test(url)) {
      btnOpenLink.classList.remove("hidden");
    } else {
      btnOpenLink.classList.add("hidden");
    }
  });
  btnOpenLink.addEventListener("click", () => {
    const url = fieldLink.value.trim();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });

  // Outfit
  document.getElementById("btn-generate-outfit").addEventListener("click", generateOutfit);
  document.getElementById("btn-shuffle").addEventListener("click", generateShuffleOutfits);

  // Menu drawer (icona ⋯ in header)
  const menuDrawer = document.getElementById("menu-drawer");
  document.getElementById("btn-menu").addEventListener("click", () => {
    renderMenuGrid();
    menuDrawer.classList.remove("hidden");
  });
  menuDrawer.addEventListener("click", (e) => {
    if (e.target === menuDrawer) menuDrawer.classList.add("hidden");
  });
  // Render iniziale (cosi' il primo apri non flicca)
  try { renderMenuGrid(); } catch {}

  // (Personalizza barra ora dentro Aspetto -> tab Barra)

  // Ricerca globale
  document.getElementById("btn-search").addEventListener("click", () => {
    Haptic.tap();
    Search.openSearch();
  });

  // Cmd+K / Ctrl+K shortcut (desktop)
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      Search.openSearch();
    }
  });

  // Evento "apri item dal search" -> apre il modal modifica
  window.addEventListener("marty:open-item", (e) => {
    openEditItem(e.detail.id);
  });

  // Evento dall'action-tree (+ centrale): azioni che richiedono callback locali
  window.addEventListener("marty:tree-action", (e) => {
    const action = e.detail?.action;
    if (action === "open_add_item") {
      openAddItem();
    }
  });

  // Pull-to-refresh sulla home
  setupPullToRefresh();

  // Boot
  boot();
});

// =============================================================================
// Pull-to-refresh: swipe down dall'inizio della scroll area
// =============================================================================
function setupPullToRefresh() {
  const main = document.querySelector(".app-main");
  const indicator = document.getElementById("ptr-indicator");
  const text = document.getElementById("ptr-text");
  const THRESHOLD = 80;

  let startY = null;
  let pulling = false;
  let dy = 0;

  main.addEventListener("touchstart", (e) => {
    // Solo se siamo in cima della scroll area
    if (main.scrollTop > 0) return;
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    pulling = true;
    dy = 0;
  });

  main.addEventListener("touchmove", (e) => {
    if (!pulling || startY === null) return;
    dy = e.touches[0].clientY - startY;
    if (dy > 0 && main.scrollTop === 0) {
      const v = Math.min(dy * 0.5, 100);
      indicator.style.transform = `translateY(${v}px)`;
      indicator.style.opacity = Math.min(dy / THRESHOLD, 1);
      text.textContent = dy > THRESHOLD ? "↻ Rilascia per ricaricare" : "↓ Tira giù per ricaricare";
    }
  });

  main.addEventListener("touchend", async () => {
    if (!pulling) return;
    pulling = false;

    if (dy > THRESHOLD) {
      text.textContent = "⏳ Aggiornamento...";
      indicator.style.transform = "translateY(60px)";
      try {
        Haptic.tap();
        const items = await Wardrobe.listItems();
        state.items = items;
        renderWardrobe();
        renderFilters();
        toast("Aggiornato", "success");
      } catch (err) {
        toast("Errore", "error");
      }
    }

    indicator.style.transform = "";
    indicator.style.opacity = "";
    startY = null;
    dy = 0;
  });
}

// =============================================================================
// Boot checks: notifiche reminder scaduti + warning streak diary
// =============================================================================
// Eseguito asincrono dopo il render iniziale; tutto fail-soft.
async function runBootChecks() {
  // 1. Reminders scaduti -> notifica nativa se permesso, altrimenti toast
  try {
    const { listReminders, bucketOf, tryNotifyDue, REMINDER_TYPES } =
      await import("./reminders-data.js");
    const items = await listReminders();
    const overdue = items.filter(r => r.status !== "done" && bucketOf(r) === "overdue");
    if (overdue.length > 0) {
      // Tenta notifica nativa per quelli mai notificati
      tryNotifyDue(items);
      // Toast in-app se non gia' visto in questa sessione
      if (!sessionStorage.getItem("__bootRemNotified")) {
        const first = overdue[0];
        const meta = REMINDER_TYPES[first.type] || REMINDER_TYPES.manual;
        const msg = overdue.length === 1
          ? `${meta.icon} Promemoria scaduto: ${first.title}`
          : `⚠️ ${overdue.length} promemoria scaduti`;
        toast(msg, "warn");
        sessionStorage.setItem("__bootRemNotified", "1");
      }
    }
  } catch (_) { /* fail-soft */ }

  // 2. Cambio stagione (autunno: 1-15 ott / primavera: 1-15 apr): suggest
  // di creare il reminder se non ne ho gia' uno attivo. One-shot per anno.
  try {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    const inWindow = (month === 10 && day <= 15) || (month === 4 && day <= 15);
    if (inWindow) {
      const year = now.getFullYear();
      const seasonKey = month === 10 ? "autumn" : "spring";
      const flag = `__seasonReminder_${year}_${seasonKey}`;
      if (!localStorage.getItem(flag)) {
        const { listReminders, createReminder } = await import("./reminders-data.js");
        const items = await listReminders();
        const hasActiveSeason = items.some(r =>
          r.type === "season" && r.status !== "done"
        );
        if (!hasActiveSeason) {
          const seasonLabel = seasonKey === "autumn"
            ? "Cambio armadio: tira fuori l'invernale"
            : "Cambio armadio: tira fuori il primaverile";
          const ok = confirm(`🍂 È tempo di cambio stagione! Vuoi creare un promemoria "${seasonLabel}"?`);
          localStorage.setItem(flag, "1"); // One-shot anche se rifiuta
          if (ok) {
            const due = new Date();
            due.setDate(due.getDate() + 2);
            due.setHours(10, 0, 0, 0);
            await createReminder({
              type: "season",
              title: seasonLabel,
              dueAt: due,
              priority: "medium",
            });
            toast("🍂 Promemoria cambio stagione creato", "success");
          }
        }
      }
    }
  } catch (_) { /* fail-soft */ }

  // 3. Streak warning: se streak attivo, oggi non ho scritto, e sono dopo le 22:00
  try {
    const { listEntries, computeStreak, todayId } = await import("./diary-data.js");
    const entries = await listEntries();
    const streak = computeStreak(entries);
    if (streak < 2) return; // streak minimo 2 per warning sensato
    const today = todayId();
    const hasToday = entries.some(e => e.id === today);
    if (hasToday) return;
    const hour = new Date().getHours();
    if (hour < 22) return;
    if (sessionStorage.getItem("__bootStreakWarn")) return;
    toast(`🔥 Stai per perdere lo streak di ${streak} giorni! Apri il diario.`, "warn");
    sessionStorage.setItem("__bootStreakWarn", "1");
  } catch (_) { /* fail-soft */ }
}

// Esporto helpers chiamati inline da HTML (onclick)
window.WardrobeUI = {
  openAddItem,
  closeModal
};
