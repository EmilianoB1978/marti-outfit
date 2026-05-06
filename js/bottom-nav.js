// =============================================================================
// Bottom navigation: 4 slot personalizzabili (2 sx + FAB + 2 dx)
// =============================================================================
// L'utente sceglie quali 4 destinazioni mettere in barra dal pannello
// Settings -> Personalizza barra. Salvate in theme prefs.bottomNav.
// =============================================================================

import * as Theme from "./theme/manager.js";

// Destinazioni disponibili (chiave -> { icon, label, type, page|href })
export const NAV_DESTINATIONS = {
  wardrobe:    { icon: "👕",  label: "Guardaroba",   type: "section", page: "wardrobe" },
  outfits:     { icon: "✨",  label: "Outfit",       type: "section", page: "outfits" },
  calendar:    { icon: "📅",  label: "Calendario",   type: "link",    href: "./calendar.html" },
  capsules:    { icon: "🎒",  label: "Capsule",      type: "link",    href: "./capsules.html" },
  analytics:   { icon: "📊",  label: "Statistiche",  type: "link",    href: "./analytics.html" },
  settings:    { icon: "🎨",  label: "Aspetto",      type: "link",    href: "./settings.html" },
  manual:      { icon: "📖",  label: "Aiuto",        type: "link",    href: "./manual.html" },
  taxonomies:  { icon: "🏷️",  label: "Tag",          type: "link",    href: "./taxonomies.html" },
  dormant:     { icon: "💤",  label: "A riposo",     type: "link",    href: "./dormant.html" },
  live:        { icon: "🤳",  label: "Live",         type: "link",    href: "./live-memory.html" },
  palette:     { icon: "🎨",  label: "Palette",      type: "link",    href: "./palette.html" },
};

/**
 * Rende la <nav class="bottom-nav"> in base alla configurazione utente.
 * @param {function} onSection - callback(pageKey) per tap su section button
 * @param {function} onFab - callback() per tap su +
 */
export function renderBottomNav(onSection, onFab) {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  const prefs = Theme.getPreferences();
  const keys = (prefs.bottomNav || ["wardrobe", "calendar", "capsules", "outfits"]).slice(0, 4);
  while (keys.length < 4) keys.push("wardrobe");

  // 4 slot: [0] [1] FAB [2] [3]
  const buildBtn = (key, isActive) => {
    const dest = NAV_DESTINATIONS[key];
    if (!dest) return "";
    const cls = "nav-btn" + (isActive ? " active" : "");
    if (dest.type === "section") {
      return `<button class="${cls}" data-page="${dest.page}" aria-label="${dest.label}">
        <span class="nav-icon">${dest.icon}</span>
        <span class="nav-label">${dest.label}</span>
      </button>`;
    } else {
      return `<a class="${cls}" href="${dest.href}" aria-label="${dest.label}">
        <span class="nav-icon">${dest.icon}</span>
        <span class="nav-label">${dest.label}</span>
      </a>`;
    }
  };

  // Default active: wardrobe (se presente in barra)
  const defaultPage = keys.find(k => NAV_DESTINATIONS[k]?.page === "wardrobe") ? "wardrobe" : null;

  // FAB customization: bg color, icon color, logo image
  const fab = prefs.fab || {};
  const fabStyles = [];
  if (fab.bgColor) fabStyles.push(`--fab-bg: ${fab.bgColor}`);
  if (fab.iconColor) fabStyles.push(`--fab-icon: ${fab.iconColor}`);
  const fabStyle = fabStyles.length ? `style="${fabStyles.join('; ')}"` : "";
  const fabContent = fab.logoUrl
    ? `<img class="nav-fab-logo" src="${fab.logoUrl}" alt="" />`
    : `<span class="nav-icon-fab">+</span>`;

  nav.innerHTML = `
    ${buildBtn(keys[0], NAV_DESTINATIONS[keys[0]]?.page === defaultPage)}
    ${buildBtn(keys[1], NAV_DESTINATIONS[keys[1]]?.page === defaultPage)}
    <button class="nav-btn fab" id="btn-add-item" ${fabStyle} aria-label="Aggiungi capo">
      ${fabContent}
    </button>
    ${buildBtn(keys[2], NAV_DESTINATIONS[keys[2]]?.page === defaultPage)}
    ${buildBtn(keys[3], NAV_DESTINATIONS[keys[3]]?.page === defaultPage)}
  `;

  // Bind dei click sui section button
  nav.querySelectorAll(".nav-btn[data-page]").forEach(btn => {
    btn.addEventListener("click", () => onSection(btn.dataset.page));
  });

  // Bind FAB
  const fab = nav.querySelector("#btn-add-item");
  if (fab) fab.addEventListener("click", onFab);
}
