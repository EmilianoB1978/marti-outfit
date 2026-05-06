// =============================================================================
// App: orchestrazione UI, eventi, navigazione
// =============================================================================

import { isConfigured } from "./firebase-config.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as Claude from "./claude-api.js";
import * as Theme from "./theme/manager.js";
import * as Weather from "./weather.js";
import * as Haptic from "./haptic.js";
import * as Search from "./search.js";
import * as Taxonomies from "./taxonomies.js";
import * as ShareOutfit from "./share-outfit.js";
import * as DormantMod from "./dormant.js";
import * as TodayOutfit from "./today-outfit.js";
import { renderBottomNav, NAV_DESTINATIONS } from "./bottom-nav.js";
import { showOnboarding } from "./onboarding.js";
import { formatNumberIT, parseNumberIT, sanitizeNumericInput } from "./it-format.js";
import * as ImportLink from "./import-link.js";

// Init theme manager PRIMA di qualsiasi altra cosa: applica colori/font/density
// al documento prima del primo paint per evitare flash visivo.
try { Theme.init(); } catch (err) { console.error("Theme.init failed:", err); }

// Stato in memoria (non serve store/redux per uso single-user)
const state = {
  items: [],          // tutti i capi caricati
  savedOutfits: [],   // outfit salvati
  currentOutfits: [], // outfit appena generati (non ancora salvati)
  filters: {},        // filtri attivi sulla griglia
  editingId: null,    // null = nuovo capo, string = modifica capo esistente
  pendingPhoto: null, // { blob, base64, dataUrl } in attesa di salvataggio
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
  } catch (err) {
    console.error("Errore boot:", err);
    toast("Errore caricamento dati", "error");
  }

  // Onboarding al primo avvio (dopo che l'app e' visibile)
  setTimeout(() => showOnboarding(false), 600);
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
    btn.textContent = "📸 Condividi";
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
    watermark: { text: "✨ Marty Outfit", color: "#aaaaaa", font: "system" },
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
  document.getElementById("ct-wm-text").value = config.watermark?.text || "✨ Marty Outfit";
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

  // SELECT semplici (string-only) — sempre alfabetici (Taxonomies li ordina gia')
  populateSelect("field-pattern",   Taxonomies.listSimpleValues("patterns"));
  populateSelect("field-material",  Taxonomies.listSimpleValues("materials"));
  populateSelect("field-style",     Taxonomies.listSimpleValues("styles"));
  populateSelect("field-color",     Taxonomies.listSimpleValues("colors"));
  populateSelect("field-color-secondary", Taxonomies.listSimpleValues("colors"));
  populateSelect("field-occasion",  Taxonomies.listSimpleValues("occasions"));
  populateMultiSelect("field-season", Taxonomies.listSimpleValues("seasons"));

  // SELECT cascade: sub-categoria filtrata per categoria scelta
  refreshSubcategorySelect();
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
function renderWardrobe() {
  const grid = document.getElementById("wardrobe-grid");
  const empty = document.getElementById("empty-state");

  const filtered = Wardrobe.filterItems(state.items, state.filters);

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
    return `
    <div class="item-card" data-id="${item.id}">
      ${item.photo_url
        ? `<img class="item-photo" src="${item.photo_url}" alt="" loading="lazy" />`
        : `<div class="item-photo" style="display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">👕</div>`
      }
      ${linkBadge}
      ${wearCount > 0 ? `<div class="item-wear-badge">👕 ${wearCount}</div>` : ''}
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

  document.getElementById("modal-title").textContent = "Nuovo capo";
  document.getElementById("btn-delete-item").classList.add("hidden");
  document.getElementById("wear-stats-section").classList.add("hidden");
  document.getElementById("photo-preview").innerHTML = '<span class="photo-placeholder">📷</span>';
  document.getElementById("btn-analyze").classList.add("hidden");
  document.getElementById("analyze-status").textContent = "";

  // Reset form (tutti i campi)
  ["field-category", "field-subcategory", "field-color", "field-color-secondary",
   "field-pattern", "field-material", "field-style", "field-occasion",
   "field-notes", "field-price", "field-link"].forEach(id => {
    document.getElementById(id).value = "";
  });
  Array.from(document.getElementById("field-season").options).forEach(o => o.selected = false);

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

  document.getElementById("modal-title").textContent = "Modifica capo";
  document.getElementById("btn-delete-item").classList.remove("hidden");
  document.getElementById("photo-preview").innerHTML = item.photo_url
    ? `<img src="${item.photo_url}" alt="" />`
    : '<span class="photo-placeholder">📷</span>';
  document.getElementById("btn-analyze").classList.add("hidden");

  // Cascade: refresh subcategory in base alla categoria del capo PRIMA di settarla
  setSelectValueOrAdd("field-category", item.category || "");
  refreshSubcategorySelect();
  setSelectValueOrAdd("field-subcategory", item.subcategory || "");
  setSelectValueOrAdd("field-color", item.color_primary || item.color || "");
  setSelectValueOrAdd("field-color-secondary", item.color_secondary || "");
  setSelectValueOrAdd("field-pattern", item.pattern || "");
  setSelectValueOrAdd("field-material", item.material || "");
  setSelectValueOrAdd("field-style", item.style || "");
  setSelectValueOrAdd("field-occasion", item.occasion || "");
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

  const seasons = Array.isArray(item.season) ? item.season : [];
  Array.from(document.getElementById("field-season").options).forEach(o => {
    o.selected = seasons.includes(o.value);
  });

  // Wear stats sezione (visibile in modifica, nascosta in nuovo)
  renderWearStats(item);
  document.getElementById("wear-stats-section").classList.remove("hidden");

  document.getElementById("modal-item").classList.remove("hidden");
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

    // Mostro pulsante analizza
    document.getElementById("btn-analyze").classList.remove("hidden");
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
    const tags = await Claude.analyzeGarment(state.pendingPhoto.base64);

    // Se l'AI restituisce valori non in tassonomia (es. nuovo pattern/material),
    // li aggiungo automaticamente prima di selezionarli nei select
    const autoAddIfMissing = async (taxonomy, value) => {
      if (!value) return;
      const existing = Taxonomies.listSimpleValues(taxonomy).map(v => v.toLowerCase());
      if (!existing.includes(String(value).toLowerCase())) {
        await Taxonomies.addValue(taxonomy, value);
      }
    };
    await Promise.all([
      autoAddIfMissing("patterns", tags.pattern),
      autoAddIfMissing("materials", tags.material),
      autoAddIfMissing("styles", tags.style),
      autoAddIfMissing("subcategories", tags.subcategory),
      autoAddIfMissing("colors", tags.color_primary || tags.color),
      autoAddIfMissing("colors", tags.color_secondary),
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
    setIfEmpty("field-subcategory", tags.subcategory);
    setIfEmpty("field-color", tags.color_primary || tags.color);
    setIfEmpty("field-color-secondary", tags.color_secondary);
    setIfEmpty("field-pattern", tags.pattern);
    setIfEmpty("field-material", tags.material);
    setIfEmpty("field-style", tags.style);
    setIfEmpty("field-occasion", tags.occasion);

    // Formality (slider): l'AI ritorna numero 1-5
    if (tags.formality && +document.getElementById("field-formality").value === 0) {
      const f = Math.max(1, Math.min(5, parseInt(tags.formality)));
      document.getElementById("field-formality").value = f;
      document.getElementById("formality-value").textContent = `${f}/5`;
    }

    // Stagioni (multi-select)
    if (Array.isArray(tags.season)) {
      Array.from(document.getElementById("field-season").options).forEach(o => {
        if (tags.season.includes(o.value)) o.selected = true;
      });
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
// Salva capo (create o update)
// =============================================================================
async function saveItem() {
  const priceRaw = document.getElementById("field-price").value;
  const price = parseNumberIT(priceRaw);  // gestisce formato italiano "1.234,50"
  const formalityRaw = +document.getElementById("field-formality").value;
  const formality = formalityRaw >= 1 && formalityRaw <= 5 ? formalityRaw : null;
  const colorPrimary = document.getElementById("field-color").value.trim() || null;

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
    color: colorPrimary,                       // alias per retrocompat
    color_primary: colorPrimary,
    color_secondary: document.getElementById("field-color-secondary").value.trim() || null,
    pattern: document.getElementById("field-pattern").value || null,
    material: document.getElementById("field-material").value || null,
    style: document.getElementById("field-style").value || null,
    formality,
    season: Array.from(document.getElementById("field-season").selectedOptions).map(o => o.value),
    occasion: document.getElementById("field-occasion").value.trim() || null,
    notes: document.getElementById("field-notes").value.trim() || null,
    price: (price !== null && !isNaN(price)) ? price : null,
    link_url: newLink,
    link_added_at: linkAddedAt,
  };

  // Filter via __add_new__ se rimasto per qualche motivo
  if (data.category === "__add_new__")        data.category = null;
  if (data.subcategory === "__add_new__")     data.subcategory = null;
  if (data.color === "__add_new__")           data.color = null;
  if (data.color_primary === "__add_new__")   data.color_primary = null;
  if (data.color_secondary === "__add_new__") data.color_secondary = null;
  if (data.pattern === "__add_new__")         data.pattern = null;
  if (data.material === "__add_new__")        data.material = null;
  if (data.style === "__add_new__")           data.style = null;
  if (data.occasion === "__add_new__")        data.occasion = null;

  // Auto-save dei valori NUOVI scritti nei campi free-text dentro le tassonomie
  // (silenzioso, niente prompt: l'utente l'ha gia' digitato).
  const autoAdd = async (taxonomy, value) => {
    if (!value) return;
    const existing = Taxonomies.listSimpleValues(taxonomy).map(v => v.toLowerCase());
    if (!existing.includes(value.toLowerCase())) {
      await Taxonomies.addValue(taxonomy, value);
    }
  };
  try {
    await Promise.all([
      autoAdd("subcategories", data.subcategory),
      autoAdd("colors",        data.color_primary),
      autoAdd("colors",        data.color_secondary),
      // Le occasioni sono spesso multi-valore separate da virgole: salvo ognuna
      ...((data.occasion || "").split(",").map(o => autoAdd("occasions", o.trim()))),
    ]);
    // Refresh datalist per riflettere eventuali aggiunte
    populateTaxonomyOptions();
  } catch (err) {
    console.warn("Auto-add taxonomy failed (non bloccante):", err);
  }

  const btn = document.getElementById("btn-save-item");
  btn.disabled = true;
  btn.textContent = "...";

  try {
    // Upload foto se presente
    if (state.pendingPhoto) {
      const { url, path } = await Wardrobe.uploadPhoto(state.pendingPhoto.blob);
      data.photo_url = url;
      data.photo_path = path;
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
      await Wardrobe.createItem(data);
      Haptic.success();
      toast("Capo aggiunto", "success");
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

    return `
      <div class="outfit-card">
        <h3>${escapeHtml(outfit.title || "Outfit")}</h3>
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
// Import da link prodotto
// =============================================================================
async function openImportLinkModal() {
  const modal = document.getElementById("modal-import-link");
  const ta = document.getElementById("import-url");
  const status = document.getElementById("import-status");
  ta.value = "";
  status.textContent = "";
  status.className = "import-status";
  modal.classList.remove("hidden");

  // Tenta lettura clipboard automatica (richiede gesture user-initiated, ma
  // openImportLinkModal e' chiamata da un click -> il browser lo accetta).
  const clip = await ImportLink.tryReadClipboard();
  const url = ImportLink.extractUrl(clip);
  if (url) {
    ta.value = url;
    status.textContent = "✓ URL incollato dagli appunti";
    status.className = "import-status success";
  }
  setTimeout(() => ta.focus(), 50);
}

function closeImportLinkModal() {
  document.getElementById("modal-import-link").classList.add("hidden");
}

async function pasteIntoImport() {
  const ta = document.getElementById("import-url");
  const status = document.getElementById("import-status");
  const clip = await ImportLink.tryReadClipboard();
  if (!clip) {
    status.textContent = "Clipboard vuota o accesso negato — incolla manualmente con tap lungo";
    status.className = "import-status error";
    return;
  }
  const url = ImportLink.extractUrl(clip) || clip.trim();
  ta.value = url;
  status.textContent = "✓ Incollato dagli appunti";
  status.className = "import-status success";
}

async function confirmImport() {
  const ta = document.getElementById("import-url");
  const status = document.getElementById("import-status");
  const btn = document.getElementById("btn-confirm-import");

  const url = ImportLink.extractUrl(ta.value);
  if (!url) {
    status.textContent = "Inserisci un URL valido (deve iniziare con http)";
    status.className = "import-status error";
    return;
  }

  btn.disabled = true;
  status.textContent = "Estrazione metadati in corso";
  status.className = "import-status busy";

  try {
    const raw = await ImportLink.scrapeProduct(url);
    const fields = ImportLink.mapRawToFields(raw);

    // Foto (asincrono - dopo aver chiuso il modal di import)
    let photoBlob = null;
    if (fields._imageUrl) {
      status.textContent = "Scarico la foto";
      try {
        photoBlob = await ImportLink.fetchImageBlob(fields._imageUrl);
      } catch (e) {
        console.warn("Foto non disponibile:", e);
      }
    }

    // Apri il modal "Nuovo capo" con i campi pre-compilati
    closeImportLinkModal();
    openAddItem();  // resetta tutti i campi
    applyImportedFields(fields);
    if (photoBlob) {
      await applyImportedPhoto(photoBlob);
    }
    toast(photoBlob ? "✓ Importato (rivedi e salva)" : "✓ Dati importati. Foto non disponibile, aggiungila manualmente", "success");
  } catch (err) {
    console.error("Import fallito:", err);
    status.textContent = `Errore: ${err.message}. Apri il link e compila a mano.`;
    status.className = "import-status error";
    btn.disabled = false;
  }
}

function applyImportedFields(fields) {
  if (fields.category) setSelectValueOrAdd("field-category", fields.category);
  refreshSubcategorySelect();
  if (fields.subcategory) setSelectValueOrAdd("field-subcategory", fields.subcategory);
  if (fields.color_primary)   setSelectValueOrAdd("field-color", fields.color_primary);
  if (fields.color_secondary) setSelectValueOrAdd("field-color-secondary", fields.color_secondary);
  if (fields.material) setSelectValueOrAdd("field-material", fields.material);
  if (fields.pattern)  setSelectValueOrAdd("field-pattern", fields.pattern);
  if (fields.price !== null) {
    document.getElementById("field-price").value = formatNumberIT(fields.price);
  }
  if (fields.link_url) document.getElementById("field-link").value = fields.link_url;
  if (fields.notes)    document.getElementById("field-notes").value = fields.notes;
}

async function applyImportedPhoto(blob) {
  // Wrap il blob come File-like e riusa il flow esistente (resize + preview)
  const file = blob instanceof File ? blob : new File([blob], "imported.jpg", { type: blob.type || "image/jpeg" });
  await handlePhotoSelected(file);
}

// Web Share Target: se l'app si apre con ?url=... o ?text=... (condivisione
// da altre app), apre direttamente il modal di import con l'URL precompilato.
function maybeAutoImportFromShareTarget() {
  try {
    const params = new URLSearchParams(location.search);
    const candidate = params.get("url") || params.get("text") || params.get("title");
    const u = ImportLink.extractUrl(candidate);
    if (!u) return;
    // Pulisci la query string per non riattivare al prossimo refresh
    history.replaceState(null, "", location.pathname);
    setTimeout(async () => {
      await openImportLinkModal();
      const ta = document.getElementById("import-url");
      ta.value = u;
      // Auto-conferma immediata: l'utente ha gia' confermato condividendo
      confirmImport();
    }, 400);
  } catch (e) { console.warn("Share target parse fail:", e); }
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
      });
    }
  } catch (err) {
    console.error("Bottom nav setup fail (non blocco il boot):", err);
  }

  // Import da link: bottone nel modal Nuovo capo + modal dedicato
  const btnImport = document.getElementById("btn-import-link");
  if (btnImport) btnImport.addEventListener("click", openImportLinkModal);
  const btnImportCancel = document.getElementById("btn-cancel-import");
  if (btnImportCancel) btnImportCancel.addEventListener("click", closeImportLinkModal);
  const btnPaste = document.getElementById("btn-paste-import");
  if (btnPaste) btnPaste.addEventListener("click", pasteIntoImport);
  const btnClear = document.getElementById("btn-clear-import");
  if (btnClear) btnClear.addEventListener("click", () => {
    document.getElementById("import-url").value = "";
    const st = document.getElementById("import-status");
    st.textContent = ""; st.className = "import-status";
  });
  const btnConfirmImport = document.getElementById("btn-confirm-import");
  if (btnConfirmImport) btnConfirmImport.addEventListener("click", confirmImport);

  // Web Share Target: se l'app e' aperta con ?url=... -> auto-import
  maybeAutoImportFromShareTarget();

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
  document.getElementById("btn-save-item").addEventListener("click", saveItem);
  document.getElementById("btn-delete-item").addEventListener("click", deleteCurrentItem);
  document.getElementById("btn-mark-worn").addEventListener("click", markCurrentItemAsWorn);

  // Share modal binding
  document.getElementById("btn-cancel-share").addEventListener("click", closeShareModal);
  document.getElementById("btn-confirm-share").addEventListener("click", confirmShare);
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
  const taxLinks = [
    ["field-category",         "categories"],
    ["field-pattern",          "patterns"],
    ["field-material",         "materials"],
    ["field-style",            "styles"],
    ["field-subcategory",      "subcategories"],
    ["field-color",            "colors"],
    ["field-color-secondary",  "colors"],
    ["field-occasion",         "occasions"],
  ];
  taxLinks.forEach(([selectId, taxonomy]) => {
    const sel = document.getElementById(selectId);
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
  const priceField = document.getElementById("field-price");
  if (priceField) {
    priceField.addEventListener("input", () => {
      const cleaned = sanitizeNumericInput(priceField.value);
      if (cleaned !== priceField.value) priceField.value = cleaned;
    });
    priceField.addEventListener("blur", () => {
      const num = parseNumberIT(priceField.value);
      priceField.value = num !== null ? formatNumberIT(num) : "";
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
    menuDrawer.classList.remove("hidden");
  });
  menuDrawer.addEventListener("click", (e) => {
    if (e.target === menuDrawer) menuDrawer.classList.add("hidden");
  });

  // Re-mostra il tour onboarding (dal menu)
  document.getElementById("btn-replay-tour").addEventListener("click", () => {
    menuDrawer.classList.add("hidden");
    showOnboarding(true);
  });

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

// Esporto helpers chiamati inline da HTML (onclick)
window.WardrobeUI = {
  openAddItem,
  closeModal
};
