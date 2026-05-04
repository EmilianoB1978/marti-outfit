// =============================================================================
// Pagina lista Capsule
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Capsules from "./capsules.js";
import * as Wardrobe from "./wardrobe.js";

Theme.init();

const state = {
  capsules: [],
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
// Caricamento iniziale
// =============================================================================
async function load() {
  try {
    const [capsules, items] = await Promise.all([
      Capsules.listCapsules(),
      Wardrobe.listItems(),
    ]);
    state.capsules = capsules;
    state.items = items;
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
  const list = document.getElementById("capsules-list");
  const empty = document.getElementById("empty-state");

  if (state.capsules.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  list.innerHTML = state.capsules.map(c => {
    const itemCount = (c.item_ids || []).length;
    const previewItems = (c.item_ids || []).slice(0, 4)
      .map(id => state.items.find(it => it.id === id))
      .filter(Boolean);

    return `
      <a href="./capsule-detail.html?id=${c.id}" class="capsule-card" style="--capsule-accent: ${escapeHtml(c.accent_color || '#d4af37')}">
        <div class="capsule-card-header">
          <span class="capsule-card-icon">${escapeHtml(c.icon || '🎒')}</span>
          <div>
            <div class="capsule-card-name">${escapeHtml(c.name || 'Senza nome')}</div>
            <div class="capsule-card-count">${itemCount} ${itemCount === 1 ? 'capo' : 'capi'}</div>
          </div>
        </div>
        ${previewItems.length > 0 ? `
          <div class="capsule-card-preview">
            ${previewItems.map(it => it.photo_url
              ? `<img src="${it.photo_url}" alt="" loading="lazy" />`
              : '<span>👕</span>'
            ).join('')}
          </div>
        ` : ''}
      </a>
    `;
  }).join("");
}

// =============================================================================
// Modal: nuova capsule
// =============================================================================
let pendingIcon = "🎒";

function openNewCapsuleModal() {
  document.getElementById("capsule-name").value = "";
  document.getElementById("capsule-color").value = "#d4af37";
  pendingIcon = "🎒";
  // Highlight icon attiva
  document.querySelectorAll(".icon-option").forEach(b => {
    b.classList.toggle("is-active", b.dataset.icon === "🎒");
  });
  document.getElementById("modal-new-capsule").classList.remove("hidden");
}

function closeNewCapsuleModal() {
  document.getElementById("modal-new-capsule").classList.add("hidden");
}

async function saveCapsule() {
  const name = document.getElementById("capsule-name").value.trim();
  if (!name) {
    toast("Inserisci un nome", "error");
    return;
  }
  const color = document.getElementById("capsule-color").value;

  try {
    const newCapsule = await Capsules.createCapsule({
      name,
      icon: pendingIcon,
      accent_color: color,
      item_ids: [],
    });
    state.capsules.unshift(newCapsule);
    render();
    closeNewCapsuleModal();
    toast("Capsule creata", "success");
    // Vai direttamente al dettaglio per riempirla
    setTimeout(() => {
      window.location.href = `./capsule-detail.html?id=${newCapsule.id}`;
    }, 500);
  } catch (err) {
    console.error(err);
    toast("Errore creazione: " + err.message, "error");
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
  document.getElementById("btn-new-capsule").addEventListener("click", openNewCapsuleModal);
  document.getElementById("btn-new-capsule-empty").addEventListener("click", openNewCapsuleModal);
  document.getElementById("btn-cancel-capsule").addEventListener("click", closeNewCapsuleModal);
  document.getElementById("btn-save-capsule").addEventListener("click", saveCapsule);

  document.querySelectorAll(".icon-option").forEach(btn => {
    btn.addEventListener("click", () => {
      pendingIcon = btn.dataset.icon;
      document.querySelectorAll(".icon-option").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  load();
});
