// =============================================================================
// Action Tree: + centrale della bottom-nav che fa crescere un albero
// con 6 "frutti" cliccabili per le azioni rapide di creazione.
// =============================================================================
// Animazione coreografata:
//   1. Backdrop fade-in (200ms)
//   2. Tronco che cresce dal basso via stroke-dashoffset (700ms cubic-bezier)
//   3. Rami che si aprono in cascata dal basso verso l'alto (3 livelli x 2)
//   4. Foglioline decorative che spuntano random (delays scaglionati)
//   5. Frutti (cerchi con icona+label) che fanno pop con bounce a fine ramo
//   6. + che ruota in × (chiusura con animazione inversa)
// =============================================================================

import * as Theme from "./theme/manager.js";

// =============================================================================
// Pool destinazioni "create" disponibili sull'albero
// =============================================================================
export const TREE_DESTINATIONS = {
  add_item:     { icon: "🛍️", label: "Nuovo capo",     action: "open_add_item",     accent: "#d4af37" },
  add_outfit:   { icon: "✨", label: "Nuovo outfit",   href:   "./outfit-editor.html", accent: "#f472b6" },
  add_note:     { icon: "📝", label: "Nuova nota",     action: "open_new_note",     accent: "#facc15" },
  add_reminder: { icon: "⏰", label: "Promemoria",     action: "open_new_reminder", accent: "#60a5fa" },
  diary_today:  { icon: "📔", label: "Diario oggi",    action: "open_diary_today",  accent: "#a78bfa" },
  add_capsule:  { icon: "🎒", label: "Nuova capsule",  href:   "./capsule-detail.html?new=1", accent: "#34d399" },
  add_trip:     { icon: "✈️", label: "Nuovo viaggio",  href:   "./trips.html?new=1",  accent: "#0ea5e9" },
  add_budget:   { icon: "💰", label: "Spesa",          href:   "./budget.html?new=1", accent: "#fb923c" },
  mood_today:   { icon: "😊", label: "Mood oggi",      action: "open_mood_quick",   accent: "#fb7185" },
  add_calendar: { icon: "📅", label: "Pianifica",      href:   "./calendar.html",   accent: "#fbbf24" },
};

export const DEFAULT_TREE_MENU = [
  "add_item", "add_outfit", "add_note",
  "add_reminder", "diary_today", "add_capsule",
];

// =============================================================================
// Posizioni dei "frutti" sull'albero (SVG viewBox 400x600).
// Ordine: dal basso verso l'alto, alternato sx/dx (1 sx, 2 dx, 3 sx, ecc.)
// =============================================================================
const FRUIT_POSITIONS = [
  { x: 92,  y: 472, branchEnd: { x: 92,  y: 472 }, branchStart: { x: 200, y: 538 }, ctrlX: 132, ctrlY: 528, side: "left",  level: 1 },
  { x: 308, y: 472, branchEnd: { x: 308, y: 472 }, branchStart: { x: 200, y: 538 }, ctrlX: 268, ctrlY: 528, side: "right", level: 1 },
  { x: 76,  y: 332, branchEnd: { x: 76,  y: 332 }, branchStart: { x: 200, y: 408 }, ctrlX: 124, ctrlY: 388, side: "left",  level: 2 },
  { x: 324, y: 332, branchEnd: { x: 324, y: 332 }, branchStart: { x: 200, y: 408 }, ctrlX: 276, ctrlY: 388, side: "right", level: 2 },
  { x: 96,  y: 198, branchEnd: { x: 96,  y: 198 }, branchStart: { x: 200, y: 280 }, ctrlX: 138, ctrlY: 252, side: "left",  level: 3 },
  { x: 304, y: 198, branchEnd: { x: 304, y: 198 }, branchStart: { x: 200, y: 280 }, ctrlX: 262, ctrlY: 252, side: "right", level: 3 },
];

// =============================================================================
// Foglioline decorative (piccoli ovali ruotati che spuntano lungo i rami)
// =============================================================================
const DECORATIVE_LEAVES = [
  { x: 160, y: 510, rot: -25, delay: 600 },
  { x: 240, y: 510, rot: 25,  delay: 700 },
  { x: 145, y: 410, rot: -35, delay: 900 },
  { x: 255, y: 410, rot: 35,  delay: 1000 },
  { x: 175, y: 350, rot: -10, delay: 1100 },
  { x: 225, y: 350, rot: 10,  delay: 1200 },
  { x: 156, y: 270, rot: -28, delay: 1300 },
  { x: 244, y: 270, rot: 28,  delay: 1400 },
  { x: 200, y: 175, rot: 0,   delay: 1550 },
  { x: 175, y: 165, rot: -45, delay: 1600 },
  { x: 225, y: 165, rot: 45,  delay: 1650 },
];

// =============================================================================
// State
// =============================================================================
let _isOpen = false;
let _overlayEl = null;
let _onActionFn = null;

// =============================================================================
// Utility: lookup destinazione (con fallback per chiavi obsolete)
// =============================================================================
function getTreeDest(key) {
  return TREE_DESTINATIONS[key] || null;
}

function getTreeMenu() {
  const prefs = Theme.getPreferences();
  let arr = (prefs.treeMenu || DEFAULT_TREE_MENU).slice(0, 6);
  // Filtra chiavi obsolete + completa fino a 6 con default
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
export function openActionTree(opts = {}) {
  if (_isOpen) return;
  _isOpen = true;
  _onActionFn = opts.onAction || null;

  const menu = getTreeMenu();
  _overlayEl = document.createElement("div");
  _overlayEl.className = "action-tree-overlay";
  _overlayEl.innerHTML = renderTreeSvg(menu);
  document.body.appendChild(_overlayEl);

  // Trigger animazione (next frame)
  requestAnimationFrame(() => {
    _overlayEl.classList.add("is-open");
  });

  // Bind chiusura
  _overlayEl.addEventListener("click", (e) => {
    if (e.target === _overlayEl || e.target.classList.contains("at-backdrop")) {
      closeActionTree();
    }
  });
  // Tap sul + grande in basso (che e' diventato ×)
  const closeBtn = _overlayEl.querySelector(".at-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeActionTree();
    });
  }
  // Bind frutti
  _overlayEl.querySelectorAll(".at-fruit").forEach(g => {
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = g.dataset.key;
      handleFruitClick(key, g);
    });
  });
  // Esc chiude
  document.addEventListener("keydown", _onKey);
  // Body scroll lock
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
  }, 350);
}

function _onKey(e) {
  if (e.key === "Escape") closeActionTree();
}

function handleFruitClick(key, fruitEl) {
  const dest = getTreeDest(key);
  if (!dest) return;
  // Animazione di "raccolta" del frutto (scale up + fade out)
  if (fruitEl) {
    fruitEl.classList.add("at-fruit-picked");
  }
  setTimeout(() => {
    closeActionTree();
    setTimeout(() => {
      // Casi speciali con redirect dinamico
      if (dest.action === "open_diary_today") {
        const d = new Date();
        const id = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        location.href = `./diary-detail.html?date=${id}`;
        return;
      }
      if (dest.action === "open_new_note") {
        location.href = "./notes.html?new=1";
        return;
      }
      if (dest.action === "open_new_reminder") {
        location.href = "./reminders.html?new=1";
        return;
      }
      if (dest.action === "open_mood_quick") {
        location.href = "./index.html#mood";
        return;
      }
      if (dest.href) {
        location.href = dest.href;
        return;
      }
      if (dest.action) {
        if (_onActionFn) _onActionFn(dest.action);
        window.dispatchEvent(new CustomEvent("marty:tree-action", {
          detail: { action: dest.action, key },
        }));
      }
    }, 80);
  }, 220);
}

// =============================================================================
// SVG render
// =============================================================================
function renderTreeSvg(menu) {
  const fruits = menu.map((key, idx) => {
    const dest = getTreeDest(key);
    const pos = FRUIT_POSITIONS[idx];
    if (!dest || !pos) return "";
    const branchD = `M ${pos.branchStart.x} ${pos.branchStart.y} Q ${pos.ctrlX} ${pos.ctrlY} ${pos.x} ${pos.y}`;
    const branchDelay = 700 + idx * 110;
    const fruitDelay = branchDelay + 280;
    const labelDelay = fruitDelay + 80;
    const branchWidth = pos.level === 1 ? 7 : pos.level === 2 ? 5.5 : 4.5;
    return `
      <path class="at-branch" d="${branchD}" style="--delay:${branchDelay}ms" stroke-width="${branchWidth}" />
      <g class="at-fruit" data-key="${esc(key)}" transform="translate(${pos.x}, ${pos.y})" style="--fruit-delay:${fruitDelay}ms">
        <circle class="at-fruit-shadow" cx="0" cy="3" r="30" />
        <circle class="at-fruit-circle" cx="0" cy="0" r="30" fill="${esc(dest.accent || "#fff8e7")}" />
        <circle class="at-fruit-highlight" cx="-9" cy="-9" r="8" />
        <text class="at-fruit-icon" x="0" y="9" text-anchor="middle">${esc(dest.icon)}</text>
      </g>
      <g class="at-fruit-label" transform="translate(${pos.x}, ${pos.y + 56})" style="--label-delay:${labelDelay}ms">
        <rect class="at-fruit-label-bg" x="-44" y="-12" width="88" height="22" rx="11" />
        <text class="at-fruit-label-text" x="0" y="3" text-anchor="middle">${esc(dest.label)}</text>
      </g>
    `;
  }).join("");

  const leaves = DECORATIVE_LEAVES.map(l => `
    <ellipse class="at-leaf" cx="${l.x}" cy="${l.y}" rx="6" ry="11"
             transform="rotate(${l.rot} ${l.x} ${l.y})"
             style="--delay:${l.delay}ms" />
  `).join("");

  return `
    <div class="at-backdrop"></div>
    <svg class="at-svg" viewBox="0 0 400 660" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="at-trunk-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#7c5a3a" />
          <stop offset="1" stop-color="#4a3520" />
        </linearGradient>
        <linearGradient id="at-leaf-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#7fc187" />
          <stop offset="1" stop-color="#3d8b4f" />
        </linearGradient>
        <radialGradient id="at-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="rgba(255,235,180,0.45)" />
          <stop offset="1" stop-color="rgba(255,235,180,0)" />
        </radialGradient>
        <filter id="at-soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <!-- Glow di sfondo dietro la chioma -->
      <ellipse class="at-glow" cx="200" cy="280" rx="220" ry="200" fill="url(#at-glow)" />

      <!-- Tronco principale curvo -->
      <path class="at-trunk" d="M 200 600 Q 196 540 202 480 Q 208 420 198 350 Q 188 280 202 220 Q 210 165 200 110"
            stroke="url(#at-trunk-grad)" stroke-width="14" stroke-linecap="round" fill="none" />

      <!-- Texture corteccia (linee verticali sottili che ondeggiano) -->
      <path class="at-bark" d="M 196 590 Q 192 530 198 470 Q 204 410 196 340" stroke="rgba(0,0,0,0.18)" stroke-width="1.5" stroke-linecap="round" fill="none" />
      <path class="at-bark" d="M 204 590 Q 208 530 202 470 Q 196 410 204 340" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-linecap="round" fill="none" />

      <!-- Rami + frutti dinamici dal menu utente -->
      ${fruits}

      <!-- Foglioline decorative -->
      ${leaves}

      <!-- Pomello finale in cima all'albero -->
      <circle class="at-top-leaf" cx="200" cy="100" r="14" fill="url(#at-leaf-grad)" />
      <circle class="at-top-leaf" cx="180" cy="115" r="11" fill="url(#at-leaf-grad)" />
      <circle class="at-top-leaf" cx="220" cy="115" r="11" fill="url(#at-leaf-grad)" />
    </svg>

    <button type="button" class="at-close" aria-label="Chiudi">
      <span class="at-close-x">+</span>
    </button>

    <div class="at-hint">tocca un frutto · tap fuori per chiudere</div>
  `;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
