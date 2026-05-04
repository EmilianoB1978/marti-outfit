// =============================================================================
// App: orchestrazione UI, eventi, navigazione
// =============================================================================

import { isConfigured } from "./firebase-config.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as Claude from "./claude-api.js";
import * as Theme from "./theme/manager.js";
import * as Weather from "./weather.js";

// Init theme manager PRIMA di qualsiasi altra cosa: applica colori/font/density
// al documento prima del primo paint per evitare flash visivo.
Theme.init();

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
  if (!isConfigured) {
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("setup-screen").classList.remove("hidden");
    return;
  }

  try {
    // Caricamento parallelo dati
    const [items, savedOutfits] = await Promise.all([
      Wardrobe.listItems(),
      Outfit.listSavedOutfits()
    ]);
    state.items = items;
    state.savedOutfits = savedOutfits;

    renderWardrobe();
    renderFilters();
    renderSavedOutfits();

    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  } catch (err) {
    console.error("Errore boot:", err);
    toast("Errore caricamento dati", "error");
    // Mostro comunque l'app vuota
    document.getElementById("splash").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  }
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
    return `
    <div class="item-card" data-id="${item.id}">
      ${item.photo_url
        ? `<img class="item-photo" src="${item.photo_url}" alt="" loading="lazy" />`
        : `<div class="item-photo" style="display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">👕</div>`
      }
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
    card.addEventListener("click", () => {
      openEditItem(card.dataset.id);
    });
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

  // Reset form (incluso prezzo)
  ["field-category", "field-color", "field-style", "field-occasion", "field-notes", "field-price"].forEach(id => {
    document.getElementById(id).value = "";
  });
  Array.from(document.getElementById("field-season").options).forEach(o => o.selected = false);

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

  document.getElementById("field-category").value = item.category || "";
  document.getElementById("field-color").value = item.color || "";
  document.getElementById("field-style").value = item.style || "";
  document.getElementById("field-occasion").value = item.occasion || "";
  document.getElementById("field-notes").value = item.notes || "";
  document.getElementById("field-price").value = item.price ?? "";

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

    // Popola campi senza sovrascrivere quelli gia' compilati dall'utente
    if (tags.category && !document.getElementById("field-category").value) {
      document.getElementById("field-category").value = tags.category;
    }
    if (tags.color && !document.getElementById("field-color").value) {
      document.getElementById("field-color").value = tags.color;
    }
    if (tags.style && !document.getElementById("field-style").value) {
      document.getElementById("field-style").value = tags.style;
    }
    if (tags.occasion && !document.getElementById("field-occasion").value) {
      document.getElementById("field-occasion").value = tags.occasion;
    }
    if (Array.isArray(tags.season)) {
      Array.from(document.getElementById("field-season").options).forEach(o => {
        if (tags.season.includes(o.value)) o.selected = true;
      });
    }

    // Salvo la descrizione AI come "note di contesto" (utile al motore outfit)
    if (tags.description) {
      const notesEl = document.getElementById("field-notes");
      if (!notesEl.value) notesEl.value = tags.description;
    }

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
  const price = priceRaw ? parseFloat(priceRaw) : null;

  const data = {
    category: document.getElementById("field-category").value || null,
    color: document.getElementById("field-color").value.trim() || null,
    style: document.getElementById("field-style").value || null,
    season: Array.from(document.getElementById("field-season").selectedOptions).map(o => o.value),
    occasion: document.getElementById("field-occasion").value.trim() || null,
    notes: document.getElementById("field-notes").value.trim() || null,
    price: (price !== null && !isNaN(price)) ? price : null,
  };

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
      toast("Capo aggiornato", "success");
    } else {
      if (!data.photo_url && !state.pendingPhoto) {
        toast("Aggiungi una foto", "error");
        btn.disabled = false; btn.textContent = "Salva";
        return;
      }
      await Wardrobe.createItem(data);
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
    await Wardrobe.deleteItem(state.editingId, item?.photo_path);
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
          <button class="btn-worn" data-worn="${outfit.id}">✓ Indossato oggi</button>
          <button class="btn-secondary" data-del="${outfit.id}">🗑️</button>
        </div>
      </div>
    `;
  }).join("");

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
// Event bindings
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Bottom nav
  document.querySelectorAll(".nav-btn[data-page]").forEach(btn => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });

  // FAB "+"
  document.getElementById("btn-add-item").addEventListener("click", openAddItem);

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

  // Outfit
  document.getElementById("btn-generate-outfit").addEventListener("click", generateOutfit);
  document.getElementById("btn-shuffle").addEventListener("click", generateShuffleOutfits);

  // Menu drawer (icona ⋯ in header)
  const menuDrawer = document.getElementById("menu-drawer");
  document.getElementById("btn-menu").addEventListener("click", () => {
    menuDrawer.classList.remove("hidden");
  });
  // Click sul fondo (overlay) chiude il drawer; click sul pannello no
  menuDrawer.addEventListener("click", (e) => {
    if (e.target === menuDrawer) menuDrawer.classList.add("hidden");
  });

  // Boot
  boot();
});

// Esporto helpers chiamati inline da HTML (onclick)
window.WardrobeUI = {
  openAddItem,
  closeModal
};
