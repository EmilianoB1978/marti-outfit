// =============================================================================
// Action Tree: + centrale che fa "fiorire" un albero magico con 6 frutti.
// =============================================================================
// Design organico: SVG fa SOLO tronco e rami (con gradient, drop-shadow,
// curve quadratiche morbide). I frutti, le foglie, le label e le particelle
// di sfondo sono HTML/CSS — più ricchi visivamente e meno fragili come
// animazione (no problema SVG transform-override).
// =============================================================================

import * as Theme from "./theme/manager.js";

// =============================================================================
// Pool destinazioni "create" disponibili sull'albero
// =============================================================================
export const TREE_DESTINATIONS = {
  add_item:     { icon: "🛍️", label: "Nuovo capo",     action: "open_add_item",     accent: "#f5d76a" },
  add_outfit:   { icon: "✨", label: "Nuovo outfit",   href:   "./outfit-editor.html", accent: "#f9a8d4" },
  add_note:     { icon: "📝", label: "Nuova nota",     action: "open_new_note",     accent: "#fde68a" },
  add_reminder: { icon: "⏰", label: "Promemoria",     action: "open_new_reminder", accent: "#93c5fd" },
  diary_today:  { icon: "📔", label: "Diario oggi",    action: "open_diary_today",  accent: "#c4b5fd" },
  add_capsule:  { icon: "🎒", label: "Nuova capsule",  href:   "./capsule-detail.html?new=1", accent: "#86efac" },
  add_trip:     { icon: "✈️", label: "Nuovo viaggio",  href:   "./trips.html?new=1",  accent: "#7dd3fc" },
  add_budget:   { icon: "💰", label: "Spesa",          href:   "./budget.html?new=1", accent: "#fdba74" },
  mood_today:   { icon: "😊", label: "Mood oggi",      action: "open_mood_quick",   accent: "#fda4af" },
  add_calendar: { icon: "📅", label: "Pianifica",      href:   "./calendar.html",   accent: "#fcd34d" },
};

export const DEFAULT_TREE_MENU = [
  "add_item", "add_outfit", "add_note",
  "add_reminder", "diary_today", "add_capsule",
];

// =============================================================================
// Posizioni dei frutti (in percentuale rispetto allo stage 320x520).
// Layout: 3 livelli, alternato sx/dx, ogni frutto a fine ramo.
// =============================================================================
const FRUIT_POSITIONS = [
  // Livello 1 (basso) — rami corti
  { left: "16%", top: "78%", branch: "low-left",  delay: 700 },
  { left: "76%", top: "78%", branch: "low-right", delay: 780 },
  // Livello 2 (medio) — rami medi
  { left: "10%", top: "52%", branch: "mid-left",  delay: 880 },
  { left: "82%", top: "52%", branch: "mid-right", delay: 960 },
  // Livello 3 (alto) — rami corti vicini alla chioma
  { left: "20%", top: "25%", branch: "top-left",  delay: 1080 },
  { left: "72%", top: "25%", branch: "top-right", delay: 1160 },
];

// =============================================================================
// Particelle decorative emoji che floatano sullo sfondo
// =============================================================================
const PARTICLES = [
  { emoji: "✨", x: "10%", y: "15%", delay: 200, size: 22 },
  { emoji: "🌸", x: "85%", y: "20%", delay: 400, size: 24 },
  { emoji: "✨", x: "8%",  y: "60%", delay: 600, size: 18 },
  { emoji: "🌟", x: "90%", y: "55%", delay: 800, size: 20 },
  { emoji: "🌸", x: "12%", y: "85%", delay: 1000, size: 20 },
  { emoji: "✨", x: "88%", y: "82%", delay: 1200, size: 22 },
  { emoji: "🍃", x: "15%", y: "40%", delay: 1400, size: 22 },
  { emoji: "🍃", x: "82%", y: "38%", delay: 1500, size: 24 },
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

  // Bind chiusura
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
  // Bind frutti
  _overlayEl.querySelectorAll(".at-fruit").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      handleFruitClick(el.dataset.key, el);
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

function handleFruitClick(key, fruitEl) {
  const dest = getTreeDest(key);
  if (!dest) return;
  if (fruitEl) fruitEl.classList.add("at-fruit-picked");
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
  }, 240);
}

// =============================================================================
// Render
// =============================================================================
function renderHtml(menu) {
  const fruits = menu.map((key, idx) => {
    const dest = getTreeDest(key);
    const pos = FRUIT_POSITIONS[idx];
    if (!dest || !pos) return "";
    return `
      <div class="at-fruit at-fruit-${pos.branch}"
           data-key="${esc(key)}"
           style="left:${pos.left}; top:${pos.top}; --accent:${esc(dest.accent)}; --delay:${pos.delay}ms;">
        <div class="at-fruit-bubble">
          <span class="at-fruit-glow"></span>
          <span class="at-fruit-icon">${esc(dest.icon)}</span>
        </div>
        <span class="at-fruit-label">${esc(dest.label)}</span>
      </div>
    `;
  }).join("");

  const particles = PARTICLES.map(p => `
    <span class="at-particle"
          style="left:${p.x}; top:${p.y}; font-size:${p.size}px; --delay:${p.delay}ms;">${p.emoji}</span>
  `).join("");

  return `
    <div class="at-backdrop"></div>
    <div class="at-stage">
      ${particles}

      <svg class="at-tree-svg" viewBox="0 0 320 520" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id="atTrunkGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stop-color="#9a7048" />
            <stop offset="50%" stop-color="#724a28" />
            <stop offset="100%" stop-color="#4a2f17" />
          </linearGradient>
          <linearGradient id="atBranchGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#8a5e3a" />
            <stop offset="100%" stop-color="#5e3d20" />
          </linearGradient>
          <radialGradient id="atFoliageGrad" cx="0.5" cy="0.4" r="0.6">
            <stop offset="0%"  stop-color="#a8e29a" />
            <stop offset="60%" stop-color="#5fb273" />
            <stop offset="100%" stop-color="#2f7c45" />
          </radialGradient>
          <filter id="atTrunkShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="3" flood-color="#000" flood-opacity="0.35" />
          </filter>
          <filter id="atFoliageShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#1c4422" flood-opacity="0.4" />
          </filter>
        </defs>

        <!-- Tronco principale: curva sinuosa dal basso alla chioma -->
        <path class="at-trunk"
              d="M 160 520 C 156 460, 168 410, 158 350 S 152 240, 162 170 S 158 110, 160 70"
              stroke="url(#atTrunkGrad)" stroke-width="18" stroke-linecap="round" fill="none"
              filter="url(#atTrunkShadow)" />

        <!-- Rami livello 1 (basso, lunghi) -->
        <path class="at-branch at-branch-low-left"  d="M 160 420 Q 110 415, 60 405" />
        <path class="at-branch at-branch-low-right" d="M 160 420 Q 210 415, 260 405" />

        <!-- Rami livello 2 (medio, lunghi) -->
        <path class="at-branch at-branch-mid-left"  d="M 160 290 Q 105 280, 40 268" />
        <path class="at-branch at-branch-mid-right" d="M 160 290 Q 215 280, 280 268" />

        <!-- Rami livello 3 (alto, corti vicini alla chioma) -->
        <path class="at-branch at-branch-top-left"  d="M 160 160 Q 120 145, 80 130" />
        <path class="at-branch at-branch-top-right" d="M 160 160 Q 200 145, 240 130" />

        <!-- Chioma in cima: 3 cerchi sovrapposti che simulano una nuvola di foglie -->
        <g class="at-foliage" filter="url(#atFoliageShadow)">
          <circle cx="160" cy="60"  r="38" fill="url(#atFoliageGrad)" />
          <circle cx="130" cy="76"  r="30" fill="url(#atFoliageGrad)" />
          <circle cx="190" cy="76"  r="30" fill="url(#atFoliageGrad)" />
          <circle cx="145" cy="48"  r="22" fill="url(#atFoliageGrad)" />
          <circle cx="178" cy="48"  r="22" fill="url(#atFoliageGrad)" />
        </g>

        <!-- Erba in basso al tronco (sembra il terreno) -->
        <ellipse class="at-ground" cx="160" cy="510" rx="80" ry="10" fill="url(#atFoliageGrad)" opacity="0.55" />
      </svg>

      ${fruits}
    </div>

    <button type="button" class="at-close" aria-label="Chiudi">
      <span class="at-close-x">×</span>
    </button>

    <div class="at-hint">tocca un frutto · tap fuori per chiudere</div>
  `;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
