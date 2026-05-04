// =============================================================================
// Pagina dettaglio Capsule
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Capsules from "./capsules.js";
import * as Wardrobe from "./wardrobe.js";
import * as ClaudeAPI from "./claude-api.js";

Theme.init();

const state = {
  capsule: null,
  items: [],
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
// Get id da query string
// =============================================================================
function getCapsuleId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// =============================================================================
// Load capsule + tutti i capi
// =============================================================================
async function load() {
  const id = getCapsuleId();
  if (!id) {
    toast("Capsule non trovata", "error");
    return;
  }

  try {
    const [allCapsules, allItems] = await Promise.all([
      Capsules.listCapsules(),
      Wardrobe.listItems(),
    ]);

    state.capsule = allCapsules.find(c => c.id === id);
    state.items = allItems;

    if (!state.capsule) {
      toast("Capsule non trovata", "error");
      setTimeout(() => window.location.href = "./capsules.html", 1000);
      return;
    }

    render();
  } catch (err) {
    console.error(err);
    toast("Errore caricamento", "error");
  }
}

// =============================================================================
// Render
// =============================================================================
function render() {
  const c = state.capsule;
  document.getElementById("capsule-title").textContent = c.name;

  const header = document.getElementById("capsule-header");
  header.style.setProperty("--capsule-accent", c.accent_color || "#d4af37");
  header.innerHTML = `
    <div class="capsule-detail-icon">${escapeHtml(c.icon)}</div>
    <input type="text" id="capsule-rename" class="capsule-detail-name" value="${escapeHtml(c.name)}" />
  `;

  // Bind rename
  document.getElementById("capsule-rename").addEventListener("blur", async (e) => {
    const newName = e.target.value.trim();
    if (newName && newName !== c.name) {
      await Capsules.updateCapsule(c.id, { name: newName });
      c.name = newName;
      document.getElementById("capsule-title").textContent = newName;
      toast("Nome aggiornato", "success");
    }
  });

  const itemIds = c.item_ids || [];
  document.getElementById("capsule-count").textContent = itemIds.length;

  // Render griglia capi: tutti i capi del guardaroba, evidenziati se nella capsule
  const grid = document.getElementById("picker-grid");
  grid.innerHTML = state.items.map(it => {
    const inCapsule = itemIds.includes(it.id);
    return `
      <div class="item-card capsule-picker-item ${inCapsule ? 'is-selected' : ''}" data-id="${it.id}">
        ${it.photo_url
          ? `<img class="item-photo" src="${it.photo_url}" alt="" loading="lazy" />`
          : `<div class="item-photo" style="display:flex;align-items:center;justify-content:center;font-size:48px;opacity:0.3">👕</div>`
        }
        ${inCapsule ? '<div class="capsule-picker-mark">✓</div>' : ''}
        <div class="item-info">
          <div class="item-category">${escapeHtml(it.category || '—')}</div>
        </div>
      </div>
    `;
  }).join("");

  grid.querySelectorAll(".capsule-picker-item").forEach(card => {
    card.addEventListener("click", () => toggleItem(card.dataset.id));
  });
}

// =============================================================================
// Toggle item nella capsule
// =============================================================================
async function toggleItem(itemId) {
  const c = state.capsule;
  try {
    const newIds = await Capsules.toggleItemInCapsule(c.id, itemId, c.item_ids || []);
    c.item_ids = newIds;
    render();
  } catch (err) {
    console.error(err);
    toast("Errore aggiornamento", "error");
  }
}

// =============================================================================
// Genera outfit dalla capsule
// =============================================================================
async function generateOutfit() {
  const c = state.capsule;
  const ids = c.item_ids || [];
  if (ids.length < 2) {
    toast("Aggiungi almeno 2 capi alla capsule", "error");
    return;
  }

  const capsuleItems = state.items.filter(it => ids.includes(it.id));
  const context = prompt(`Per quale occasione? (es. "cena informale")\n\nUseremo solo i ${ids.length} capi della capsule "${c.name}".`);
  if (!context) return;

  const btn = document.getElementById("btn-generate-outfit");
  btn.disabled = true;
  btn.textContent = "✨ Generazione...";

  try {
    const outfits = await ClaudeAPI.suggestOutfits(context, capsuleItems);
    showOutfitResults(outfits, capsuleItems);
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ Genera outfit con questa capsule";
  }
}

function showOutfitResults(outfits, capsuleItems) {
  const body = document.getElementById("outfit-result-body");
  if (!outfits || outfits.length === 0) {
    body.innerHTML = `<p style="text-align:center;padding:40px;color:var(--color-text-muted)">L'AI non ha trovato combinazioni utili.</p>`;
  } else {
    body.innerHTML = outfits.map(o => {
      const items = (o.item_ids || [])
        .map(id => capsuleItems.find(it => it.id === id))
        .filter(Boolean);
      return `
        <div class="outfit-card">
          <h3>${escapeHtml(o.title || 'Outfit')}</h3>
          ${o.description ? `<p class="outfit-desc">${escapeHtml(o.description)}</p>` : ''}
          <div class="outfit-items">
            ${items.map(it => `
              <div class="outfit-item">
                ${it.photo_url ? `<img src="${it.photo_url}" alt="" />` : '👕'}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join("");
  }
  document.getElementById("modal-outfit-result").classList.remove("hidden");
}

// =============================================================================
// Elimina capsule
// =============================================================================
async function deleteCapsule() {
  if (!state.capsule) return;
  if (!confirm(`Eliminare la capsule "${state.capsule.name}"? I capi non vengono toccati.`)) return;

  try {
    await Capsules.deleteCapsule(state.capsule.id);
    toast("Capsule eliminata", "success");
    setTimeout(() => window.location.href = "./capsules.html", 800);
  } catch (err) {
    console.error(err);
    toast("Errore eliminazione", "error");
  }
}

// =============================================================================
// Utility
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
  document.getElementById("btn-generate-outfit").addEventListener("click", generateOutfit);
  document.getElementById("btn-delete-capsule").addEventListener("click", deleteCapsule);
  document.getElementById("btn-close-outfit").addEventListener("click", () => {
    document.getElementById("modal-outfit-result").classList.add("hidden");
  });
  load();
});
