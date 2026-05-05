// =============================================================================
// Pagina Live & Memory: scatta foto live e visualizza timeline sessioni
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as Sessions from "./wear-sessions.js";

Theme.init();

const state = {
  sessions: [],
  items: [],
  outfits: [],
  // Stato della session in editing (modal nuova)
  editing: { photos: [], itemIds: [], outfit_id: null, notes: "", location: null },
};

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

function fmtDateTime(d) {
  const date = new Date(d);
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
    + " · "
    + date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// =============================================================================
async function load() {
  const [sessions, items, outfits] = await Promise.all([
    Sessions.listSessions(),
    Wardrobe.listItems(),
    Outfit.listSavedOutfits(),
  ]);
  state.sessions = sessions;
  state.items = items;
  state.outfits = outfits;
  renderTimeline();
}

function renderTimeline() {
  const list = document.getElementById("live-sessions-list");
  const empty = document.getElementById("live-empty");
  if (state.sessions.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.sessions.map(s => {
    const cover = (s.photos && s.photos[0]) ? s.photos[0].url : null;
    const created = s.created_at?.toDate?.() || s.created_at;
    return `
      <button class="live-session-card" data-id="${s.id}">
        <div class="live-session-cover">
          ${cover ? `<img src="${cover}" alt="" loading="lazy" />` : '<div class="live-session-placeholder">📸</div>'}
          <div class="live-session-photo-count">${(s.photos || []).length} foto</div>
        </div>
        <div class="live-session-info">
          <div class="live-session-date">${created ? fmtDateTime(created) : "—"}</div>
          ${s.notes ? `<div class="live-session-notes">${escapeHtml(s.notes)}</div>` : ''}
          ${s.location?.label ? `<div class="live-session-location">📍 ${escapeHtml(s.location.label)}</div>` : ''}
        </div>
      </button>
    `;
  }).join("");

  list.querySelectorAll(".live-session-card").forEach(card => {
    card.addEventListener("click", () => openSessionDetail(card.dataset.id));
  });
}

// =============================================================================
// New session modal
// =============================================================================
function openNewSession() {
  state.editing = { photos: [], itemIds: [], outfit_id: null, notes: "", location: null };

  // Reset form
  document.getElementById("live-notes").value = "";
  document.getElementById("live-location-display").textContent = "";

  // Popola dropdown outfit
  const sel = document.getElementById("select-outfit");
  sel.innerHTML = `<option value="">— Nessuno —</option>` +
    state.outfits.map(o => `<option value="${o.id}">${escapeHtml(o.title)}</option>`).join("");

  // Popola griglia capi (multi-select)
  renderItemsPicker();
  renderPhotosGrid();

  document.getElementById("modal-live").classList.remove("hidden");
}

function closeNewSession() {
  document.getElementById("modal-live").classList.add("hidden");
}

function renderItemsPicker() {
  const grid = document.getElementById("live-items-picker");
  grid.innerHTML = state.items.map(it => {
    const selected = state.editing.itemIds.includes(it.id);
    return `
      <div class="item-card capsule-picker-item ${selected ? 'is-selected' : ''}" data-id="${it.id}">
        ${it.photo_url
          ? `<img class="item-photo" src="${it.photo_url}" alt="" loading="lazy" />`
          : `<div class="item-photo" style="display:flex;align-items:center;justify-content:center;font-size:32px;opacity:0.3">👕</div>`}
        ${selected ? '<div class="capsule-picker-mark">✓</div>' : ''}
        <div class="item-info">
          <div class="item-category" style="font-size: 10px;">${escapeHtml(it.subcategory || it.category || '—')}</div>
        </div>
      </div>
    `;
  }).join("");
  grid.querySelectorAll(".capsule-picker-item").forEach(card => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      const idx = state.editing.itemIds.indexOf(id);
      if (idx >= 0) state.editing.itemIds.splice(idx, 1);
      else state.editing.itemIds.push(id);
      renderItemsPicker();
    });
  });
}

function renderPhotosGrid() {
  const grid = document.getElementById("live-photos-grid");
  if (state.editing.photos.length === 0) {
    grid.innerHTML = `<p class="settings-hint" style="text-align:center; padding: var(--space-3);">Nessuna foto. Tap "Scatta" o "Galleria".</p>`;
    return;
  }
  grid.innerHTML = state.editing.photos.map((p, idx) => `
    <div class="live-photo-thumb">
      <img src="${p.url}" alt="" />
      <button class="live-photo-remove" data-idx="${idx}" aria-label="Rimuovi">✕</button>
    </div>
  `).join("");
  grid.querySelectorAll(".live-photo-remove").forEach(b => {
    b.addEventListener("click", () => {
      state.editing.photos.splice(+b.dataset.idx, 1);
      renderPhotosGrid();
    });
  });
}

// =============================================================================
// Capture photos
// =============================================================================
async function handleCapture(file) {
  if (!file) return;
  toast("Caricamento foto...", "default");
  try {
    const photo = await Sessions.uploadLivePhoto(file);
    state.editing.photos.push(photo);
    renderPhotosGrid();
    toast("Foto caricata", "success");
  } catch (err) {
    console.error(err);
    toast("Errore upload: " + err.message, "error");
  }
}

// =============================================================================
// Geolocation
// =============================================================================
async function addLocation() {
  if (!navigator.geolocation) {
    toast("Geolocalizzazione non supportata", "error");
    return;
  }
  toast("Lettura posizione...", "default");
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
    });
    state.editing.location = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      label: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
    };
    document.getElementById("live-location-display").textContent =
      `📍 ${state.editing.location.label}`;
    toast("Posizione aggiunta", "success");
  } catch (err) {
    toast("Geolocalizzazione fallita", "error");
  }
}

// =============================================================================
// Save
// =============================================================================
async function saveSession() {
  if (state.editing.photos.length === 0) {
    toast("Aggiungi almeno una foto", "error");
    return;
  }
  state.editing.notes = document.getElementById("live-notes").value.trim() || null;
  state.editing.outfit_id = document.getElementById("select-outfit").value || null;

  try {
    // Se c'e' un outfit selezionato, prendo i suoi item_ids
    let itemIds = state.editing.itemIds;
    if (state.editing.outfit_id) {
      const out = state.outfits.find(o => o.id === state.editing.outfit_id);
      if (out) itemIds = [...new Set([...(out.item_ids || []), ...itemIds])];
    }

    await Sessions.createSession({
      outfit_id: state.editing.outfit_id,
      item_ids: itemIds,
      photos: state.editing.photos,
      location: state.editing.location,
      notes: state.editing.notes,
    });

    // Marca capi indossati se ci sono
    if (itemIds.length > 0) {
      try { await Wardrobe.markOutfitAsWorn(itemIds, state.items); } catch (err) { console.warn(err); }
    }

    toast("Sessione salvata", "success");
    closeNewSession();
    await load();
  } catch (err) {
    console.error(err);
    toast("Errore salvataggio: " + err.message, "error");
  }
}

// =============================================================================
// Session detail
// =============================================================================
function openSessionDetail(id) {
  const s = state.sessions.find(x => x.id === id);
  if (!s) return;

  const created = s.created_at?.toDate?.() || s.created_at;
  document.getElementById("session-detail-title").textContent =
    created ? fmtDateTime(created) : "Sessione";

  const body = document.getElementById("session-detail-body");
  const itemThumbs = (s.item_ids || [])
    .map(iid => state.items.find(it => it.id === iid))
    .filter(Boolean);

  body.innerHTML = `
    ${s.notes ? `<p style="margin-bottom: var(--space-3); font-style: italic;">"${escapeHtml(s.notes)}"</p>` : ''}
    ${s.location?.label ? `<p class="settings-hint">📍 ${escapeHtml(s.location.label)}</p>` : ''}

    <h3 class="settings-section-title">Foto (${(s.photos || []).length})</h3>
    <div class="live-photos-grid">
      ${(s.photos || []).map(p => `
        <a href="${p.url}" target="_blank" rel="noopener">
          <div class="live-photo-thumb">
            <img src="${p.url}" alt="" loading="lazy" />
          </div>
        </a>
      `).join("")}
    </div>

    ${itemThumbs.length > 0 ? `
      <h3 class="settings-section-title">Capi indossati</h3>
      <div class="outfit-items">
        ${itemThumbs.map(it => `
          <div class="outfit-item">
            ${it.photo_url ? `<img src="${it.photo_url}" alt="" />` : '👕'}
          </div>
        `).join("")}
      </div>
    ` : ''}
  `;

  document.getElementById("modal-session-detail").classList.remove("hidden");
  document.getElementById("btn-delete-session").onclick = async () => {
    if (!confirm("Eliminare questa sessione e le sue foto?")) return;
    try {
      await Sessions.deleteSession(id);
      document.getElementById("modal-session-detail").classList.add("hidden");
      toast("Sessione eliminata", "success");
      await load();
    } catch (err) {
      toast("Errore", "error");
    }
  };
}

// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-new-live-session").addEventListener("click", openNewSession);
  document.getElementById("btn-cancel-live").addEventListener("click", closeNewSession);
  document.getElementById("btn-save-live").addEventListener("click", saveSession);
  document.getElementById("btn-add-location").addEventListener("click", addLocation);

  document.getElementById("input-live-camera").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (file) handleCapture(file); e.target.value = "";
  });
  document.getElementById("input-live-gallery").addEventListener("change", (e) => {
    const file = e.target.files[0]; if (file) handleCapture(file); e.target.value = "";
  });

  document.getElementById("btn-close-session-detail").addEventListener("click", () => {
    document.getElementById("modal-session-detail").classList.add("hidden");
  });

  load();
});
