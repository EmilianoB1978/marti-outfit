// =============================================================================
// Bottom navigation: 5 slot completamente personalizzabili
// =============================================================================
// L'utente sceglie 5 destinazioni dalla lista. Lo slot centrale (idx 2) e'
// visivamente ingrandito (FAB style 70px), ma la sua funzione la decide
// l'utente: di default e' "Aggiungi capo", ma puo' essere qualsiasi altra
// destinazione (es. Outfit, Live, Calendario).
// Configurazione salvata in theme prefs.bottomNav (array di 5 chiavi).
// =============================================================================

import * as Theme from "./theme/manager.js";

// Destinazioni disponibili (chiave -> { icon, label, type, page|href })
// type "fab" = invoca callback onFab (apre modal "Nuovo capo").
// type "section" = naviga internamente alla pagina.
// type "link" = href esterno (altra pagina HTML).
export const NAV_DESTINATIONS = {
  add_item:    { icon: "🛍️",  label: "Aggiungi",     type: "fab" },
  tree:        { icon: "+",    label: "Crea",         type: "tree" },
  wardrobe:    { icon: "👕",  label: "Guardaroba",   type: "section", page: "wardrobe" },
  outfits:     { icon: "✨",  label: "Outfit",       type: "section", page: "outfits" },
  calendar:    { icon: "📅",  label: "Calendario",   type: "link",    href: "./calendar.html" },
  trips:       { icon: "✈️",  label: "Viaggi",       type: "link",    href: "./trips.html" },
  budget:      { icon: "💰",  label: "Budget",       type: "link",    href: "./budget.html" },
  notes:       { icon: "📝",  label: "Note",         type: "link",    href: "./notes.html" },
  reminders:   { icon: "⏰",  label: "Promemoria",   type: "link",    href: "./reminders.html" },
  diary:       { icon: "📔",  label: "Diario",       type: "link",    href: "./diary.html" },
  outfit_history: { icon: "📍", label: "Storico outfit", type: "link", href: "./outfit-history.html" },
  armocromia:  { icon: "🎨",  label: "Armocromia",   type: "link",    href: "./armocromia.html" },
  capsules:    { icon: "🎒",  label: "Capsule",      type: "link",    href: "./capsules.html" },
  analytics:   { icon: "📊",  label: "Statistiche",  type: "link",    href: "./analytics.html" },
  settings:    { icon: "🎨",  label: "Aspetto",      type: "link",    href: "./settings.html" },
  manual:      { icon: "📖",  label: "Aiuto",        type: "link",    href: "./manual.html" },
  taxonomies:  { icon: "🏷️",  label: "Tag",          type: "link",    href: "./taxonomies.html" },
  dormant:     { icon: "💤",  label: "A riposo",     type: "link",    href: "./dormant.html" },
  live:        { icon: "🤳",  label: "Live",         type: "link",    href: "./live-memory.html" },
  palette:     { icon: "🎨",  label: "Palette",      type: "link",    href: "./palette.html" },
  system:      { icon: "⚙️",  label: "Sistema",      type: "link",    href: "./system.html" },
};

/**
 * Pool delle destinazioni mostrabili nel menu drawer (tutte tranne sezioni
 * interne wardrobe/outfits e l'add_item che è il FAB). Usato per il render
 * della griglia card del menu drawer.
 */
export const MENU_DRAWER_KEYS = [
  "armocromia", "calendar", "trips", "budget", "notes", "reminders", "diary", "outfit_history",
  "capsules", "analytics", "live", "palette",
  "dormant", "taxonomies", "settings", "system", "manual",
];

export const DEFAULT_BOTTOM_NAV = ["wardrobe", "calendar", "tree", "capsules", "outfits"];

/**
 * Rende la <nav class="bottom-nav"> in base alla configurazione utente.
 * Lo slot centrale (idx 2) ha sempre la classe `.fab` per essere ingrandito,
 * indipendentemente dal tipo di destinazione che ci sta dentro.
 *
 * @param {function} onSection - callback(pageKey) per tap su section button
 * @param {function} onFab - callback() per tap su slot di tipo "fab"
 *   (es. add_item, apre modal Nuovo capo)
 */
export function renderBottomNav(onSection, onFab) {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  const prefs = Theme.getPreferences();
  let raw = prefs.bottomNav || DEFAULT_BOTTOM_NAV;
  // Migrazione legacy: vecchio formato 4 slot -> inserisce tree al centro
  if (raw.length === 4) raw = [raw[0], raw[1], "tree", raw[2], raw[3]];
  // Migrazione v105: chi aveva 'add_item' al centro lo aggiorna a 'tree'
  // (l'azione "aggiungi capo" e' ora dentro l'albero come primo frutto)
  if (raw[2] === "add_item") {
    raw = [...raw];
    raw[2] = "tree";
  }
  const keys = raw.slice(0, 5);
  while (keys.length < 5) keys.push("wardrobe");

  // FAB customization: bg color, icon color, logo image
  const fab = prefs.fab || {};
  const fabStyles = [];
  if (fab.bgColor) fabStyles.push(`--fab-bg: ${fab.bgColor}`);
  if (fab.iconColor) fabStyles.push(`--fab-icon: ${fab.iconColor}`);
  const fabStyle = fabStyles.length ? `style="${fabStyles.join('; ')}"` : "";

  // Default active: wardrobe (se presente in barra)
  const defaultPage = keys.find(k => NAV_DESTINATIONS[k]?.page === "wardrobe") ? "wardrobe" : null;

  // Render di un singolo slot. isCenter = slot 2 (centrale) -> classe .fab
  // grande, contenuto piu' grande, no label sotto.
  const buildSlot = (key, isCenter) => {
    const dest = NAV_DESTINATIONS[key];
    if (!dest) return "";

    if (isCenter) {
      // Slot centrale: render FAB grande con icona dest (o logo personale).
      // Per type="fab"/"tree" applico anche custom bg/icon color da prefs.fab.
      const isFabLike = (dest.type === "fab" || dest.type === "tree");
      const customStyle = isFabLike ? fabStyle : "";
      const content = (isFabLike && fab.logoUrl)
        ? `<img class="nav-fab-logo" src="${fab.logoUrl}" alt="" />`
        : `<span class="nav-icon-fab${dest.type === "tree" ? " nav-icon-tree" : ""}">${dest.icon}</span>`;
      if (dest.type === "fab" || dest.type === "tree") {
        return `<button class="nav-btn fab" data-key="${key}" ${customStyle} aria-label="${dest.label}">${content}</button>`;
      } else if (dest.type === "section") {
        return `<button class="nav-btn fab" data-key="${key}" data-page="${dest.page}" aria-label="${dest.label}">${content}</button>`;
      } else {
        return `<a class="nav-btn fab" data-key="${key}" href="${dest.href}" aria-label="${dest.label}">${content}</a>`;
      }
    }

    // Slot laterale: render piccolo con icona + label
    const isActive = dest.page && dest.page === defaultPage;
    const cls = "nav-btn" + (isActive ? " active" : "");
    if (dest.type === "fab") {
      // Edge case: l'utente ha messo Aggiungi su uno slot laterale. Nessun href,
      // tap chiama onFab.
      return `<button class="${cls}" data-key="${key}" aria-label="${dest.label}">
        <span class="nav-icon">${dest.icon}</span>
        <span class="nav-label">${dest.label}</span>
      </button>`;
    } else if (dest.type === "section") {
      return `<button class="${cls}" data-key="${key}" data-page="${dest.page}" aria-label="${dest.label}">
        <span class="nav-icon">${dest.icon}</span>
        <span class="nav-label">${dest.label}</span>
      </button>`;
    } else {
      return `<a class="${cls}" data-key="${key}" href="${dest.href}" aria-label="${dest.label}">
        <span class="nav-icon">${dest.icon}</span>
        <span class="nav-label">${dest.label}</span>
      </a>`;
    }
  };

  nav.innerHTML = keys.map((k, i) => buildSlot(k, i === 2)).join("");

  // Bind click: section -> onSection(page); fab -> onFab(); tree -> openActionTree;
  // link -> default browser
  nav.querySelectorAll(".nav-btn").forEach(btn => {
    const key = btn.dataset.key;
    const dest = NAV_DESTINATIONS[key];
    if (!dest) return;
    if (dest.type === "fab") {
      btn.addEventListener("click", (e) => { e.preventDefault(); onFab(); });
    } else if (dest.type === "tree") {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const m = await import("./action-tree.js");
          m.openActionTree();
        } catch (err) {
          console.error("[action-tree] import fallito:", err);
          alert("Errore caricamento albero: " + err.message);
        }
      });
    } else if (dest.type === "section") {
      btn.addEventListener("click", () => onSection(btn.dataset.page));
    }
    // type "link": <a href> -> il browser naviga di default, niente listener
  });
}
