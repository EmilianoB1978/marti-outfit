// =============================================================================
// Action Tree (timeline edition): + centrale che apre una timeline verticale
// con 6 step di creazione rapida, alternati sx/dx.
// =============================================================================
// Concept: linea verticale centrale che cresce dall'alto al basso, gli step
// entrano in cascata con slide laterale e fade. Ogni step ha cerchio outline
// con icona + titolo + sub-label esplicativo.
// =============================================================================

import * as Theme from "./theme/manager.js";

// =============================================================================
// Pool destinazioni "create" disponibili sulla timeline
// =============================================================================
export const TREE_DESTINATIONS = {
  add_item:     {
    icon: "🛍️", label: "Nuovo capo", sub: "Aggiungi al guardaroba",
    accent: "#f5d76a", soft: "#fff8e0",
    action: "open_add_item",
  },
  add_outfit:   {
    icon: "✨", label: "Nuovo outfit", sub: "Componi un look",
    accent: "#f9a8d4", soft: "#ffe9f5",
    href: "./outfit-editor.html",
  },
  add_note:     {
    icon: "📝", label: "Nuova nota", sub: "Wishlist · sarta · regali",
    accent: "#fde68a", soft: "#fff9d6",
    action: "open_new_note",
  },
  add_reminder: {
    icon: "⏰", label: "Promemoria", sub: "Lavare · ritirare · provare",
    accent: "#93c5fd", soft: "#dbeafe",
    action: "open_new_reminder",
  },
  diary_today:  {
    icon: "📔", label: "Diario oggi", sub: "Mood · pensieri · foto",
    accent: "#c4b5fd", soft: "#ede9fe",
    action: "open_diary_today",
  },
  add_capsule:  {
    icon: "🎒", label: "Nuova capsule", sub: "Pacchetto outfit a tema",
    accent: "#86efac", soft: "#dcfce7",
    href: "./capsule-detail.html?new=1",
  },
  add_trip:     {
    icon: "✈️", label: "Nuovo viaggio", sub: "Pianifica un guardaroba",
    accent: "#7dd3fc", soft: "#e0f2fe",
    href: "./trips.html?new=1",
  },
  add_budget:   {
    icon: "💰", label: "Spesa budget", sub: "Registra un acquisto",
    accent: "#fdba74", soft: "#ffedd5",
    href: "./budget.html?new=1",
  },
  mood_today:   {
    icon: "😊", label: "Mood oggi", sub: "Come ti senti?",
    accent: "#fda4af", soft: "#ffe4e6",
    action: "open_mood_quick",
  },
  add_calendar: {
    icon: "📅", label: "Pianifica", sub: "Outfit per un giorno",
    accent: "#fcd34d", soft: "#fef3c7",
    href: "./calendar.html",
  },
};

export const DEFAULT_TREE_MENU = [
  "add_item", "add_outfit", "add_note",
  "add_reminder", "diary_today", "add_capsule",
];

// =============================================================================
// State
// =============================================================================
let _isOpen = false;
let _overlayEl = null;

function getTreeDest(key) { return TREE_DESTINATIONS[key] || null; }

function getTreeMenu() {
  const prefs = Theme.getPreferences();
  let arr = (prefs.treeMenu || DEFAULT_TREE_MENU).slice(0, 6);
  arr = arr.filter(k => !!TREE_DESTINATIONS[k]);
  for (const def of DEFAULT_TREE_MENU) {
    if (arr.length >= 6) break;
    if (!arr.includes(def)) arr.push(def);
  }
  return arr.slice(0, 6);
}

// =============================================================================
// Open / Close
// =============================================================================
export function openActionTree() {
  if (_isOpen) return;
  _isOpen = true;

  const menu = getTreeMenu();
  _overlayEl = document.createElement("div");
  _overlayEl.className = "action-tree-overlay";
  _overlayEl.innerHTML = renderHtml(menu);
  document.body.appendChild(_overlayEl);

  requestAnimationFrame(() => {
    _overlayEl.classList.add("is-open");
  });

  _overlayEl.addEventListener("click", (e) => {
    if (e.target === _overlayEl || e.target.classList.contains("at-backdrop")) {
      closeActionTree();
    }
  });
  const closeBtn = _overlayEl.querySelector(".at-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeActionTree();
    });
  }
  _overlayEl.querySelectorAll(".at-step").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      handleStepClick(el.dataset.key, el);
    });
  });
  document.addEventListener("keydown", _onKey);
  document.body.classList.add("at-noscroll");
}

export function closeActionTree() {
  if (!_isOpen || !_overlayEl) return;
  _isOpen = false;
  _overlayEl.classList.remove("is-open");
  _overlayEl.classList.add("is-closing");
  document.removeEventListener("keydown", _onKey);
  document.body.classList.remove("at-noscroll");
  setTimeout(() => {
    _overlayEl?.remove();
    _overlayEl = null;
  }, 320);
}

function _onKey(e) { if (e.key === "Escape") closeActionTree(); }

function handleStepClick(key, stepEl) {
  const dest = getTreeDest(key);
  if (!dest) return;
  if (stepEl) stepEl.classList.add("at-step-active");
  setTimeout(() => {
    closeActionTree();
    setTimeout(() => {
      if (dest.action === "open_diary_today") {
        const d = new Date();
        const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        location.href = `./diary-detail.html?date=${id}`;
        return;
      }
      if (dest.action === "open_new_note") { location.href = "./notes.html?new=1"; return; }
      if (dest.action === "open_new_reminder") { location.href = "./reminders.html?new=1"; return; }
      if (dest.action === "open_mood_quick") { location.href = "./index.html#mood"; return; }
      if (dest.href) { location.href = dest.href; return; }
      if (dest.action) {
        window.dispatchEvent(new CustomEvent("marty:tree-action", {
          detail: { action: dest.action, key },
        }));
      }
    }, 80);
  }, 220);
}

// =============================================================================
// Render
// =============================================================================
function renderHtml(menu) {
  // Calcola gradient della linea verticale: un segmento di colore per step
  const segPercent = 100 / menu.length;
  const trackStops = menu.map((key, idx) => {
    const dest = getTreeDest(key);
    const accent = dest?.accent || "#d4af37";
    const start = (idx * segPercent).toFixed(2);
    const end   = ((idx + 1) * segPercent).toFixed(2);
    return `${accent} ${start}%, ${accent} ${end}%`;
  }).join(", ");

  const steps = menu.map((key, idx) => {
    const dest = getTreeDest(key);
    if (!dest) return "";
    const side = idx % 2 === 0 ? "left" : "right";
    const top = 12 + idx * 14;  // 12, 26, 40, 54, 68, 82 (%)
    const delay = 600 + idx * 160;
    // Sui side "left" il cerchio viene a destra del testo, sui "right" il
    // cerchio viene a sinistra del testo (pattern timeline classico)
    const blockText = `<div class="at-step-text">
      <div class="at-step-title">${esc(dest.label)}</div>
      <div class="at-step-sub">${esc(dest.sub || "")}</div>
    </div>`;
    const blockCircle = `<div class="at-step-circle">
      <span class="at-step-icon">${esc(dest.icon)}</span>
    </div>`;
    const inner = side === "left"
      ? `${blockText}${blockCircle}`
      : `${blockCircle}${blockText}`;
    return `<div class="at-step at-step-${side}"
                 data-key="${esc(key)}"
                 style="top:${top}%; --accent:${esc(dest.accent)}; --accent-soft:${esc(dest.soft || "#ffffff")}; --delay:${delay}ms;">
      ${inner}
      <div class="at-step-connector"></div>
      <div class="at-step-arrow"></div>
    </div>`;
  }).join("");

  return `
    <div class="at-backdrop"></div>
    <div class="at-stage">
      <div class="at-track" style="background: linear-gradient(180deg, ${trackStops});"></div>
      <div class="at-start"></div>
      ${steps}
      <div class="at-end"></div>
    </div>

    <button type="button" class="at-close" aria-label="Chiudi">
      <span class="at-close-x">×</span>
    </button>

    <div class="at-hint">tocca un cerchio · tap fuori per chiudere</div>
  `;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
