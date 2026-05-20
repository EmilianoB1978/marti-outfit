// =============================================================================
// Theme manager - Marti Outfit
// =============================================================================
// Applica il tema al documento, gestisce persistenza, esporta/importa,
// reagisce a prefers-color-scheme se la modalita' attiva e' "auto".
// Pattern: stato in memoria + setProperty su document.documentElement.
// =============================================================================

import { themes, fonts, defaultPreferences } from "./tokens.js";

const STORAGE_KEY = "marty_theme_v1";

// Velocita' animazione: mappa nomi -> millisecondi
const ANIM_SPEED_MAP = {
  none:   "0ms",
  slow:   "400ms",
  normal: "200ms",
  fast:   "100ms",
};

// =============================================================================
// Stato modulo (singleton)
// =============================================================================
let prefs = { ...defaultPreferences };
let mediaQueryDark = null;       // MediaQueryList per "auto" mode
let listeners = new Set();        // callback per UI reattiva (Settings page)
let loadedFonts = new Set();      // famiglie font gia' iniettate (lazy load)

// =============================================================================
// Init - chiamato da js/app.js prima del rendering
// =============================================================================
export function init() {
  prefs = loadFromStorage();
  applyAll();
  watchSystemTheme();
}

// =============================================================================
// Applica tutto: tema attivo + font + scale + density + radius + animazioni
// =============================================================================
function applyAll() {
  applyThemeColors();
  applyFont();
  applyDimensions();
  applyAnimations();
  applyMetaThemeColor();
  notifyListeners();
}

// =============================================================================
// Applica i COLORI del tema attivo
// =============================================================================
function applyThemeColors() {
  const root = document.documentElement;
  const preset = resolveThemeMode(prefs.themeMode);
  const theme = themes[preset] || themes.light;

  // Set di base dal preset
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(`--${key}`, value);
  }

  // Override manuali utente (color picker)
  for (const [key, value] of Object.entries(prefs.customOverrides || {})) {
    if (value) root.style.setProperty(`--${key}`, value);
  }

  // Class su <html> per eventuali selettori CSS specifici tema (es. illustrazioni)
  root.dataset.theme = preset;
  root.dataset.themeBase = theme.base;
}

// =============================================================================
// Risolve "auto" -> light o dark seguendo l'OS
// =============================================================================
function resolveThemeMode(mode) {
  if (mode === "auto") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }
  return mode;  // light | dark | <preset>
}

// =============================================================================
// Listener prefers-color-scheme (solo attivo se mode === "auto")
// =============================================================================
function watchSystemTheme() {
  if (mediaQueryDark) return;  // gia' watchato
  mediaQueryDark = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => {
    if (prefs.themeMode === "auto") applyAll();
  };
  // Compat: addEventListener moderno + fallback addListener (Safari < 14)
  if (mediaQueryDark.addEventListener) {
    mediaQueryDark.addEventListener("change", handler);
  } else {
    mediaQueryDark.addListener(handler);
  }
}

// =============================================================================
// Applica FONT (lazy loading se non e' "system")
// =============================================================================
function applyFont() {
  const root = document.documentElement;
  const fontDef = fonts[prefs.font] || fonts.system;

  if (fontDef.needsLoad && !loadedFonts.has(prefs.font)) {
    injectFontFace(prefs.font, fontDef);
    loadedFonts.add(prefs.font);
  }

  root.style.setProperty("--font-family-base", fontDef.base);
  root.style.setProperty("--font-family-heading", fontDef.heading);
}

// Inietta runtime un <style> con @font-face per il font selezionato.
// I font variabili usano un range di weight (es. "100 900"), i regular un peso fisso.
function injectFontFace(key, fontDef) {
  const style = document.createElement("style");
  style.dataset.font = key;
  const family = fontDef.family || key;

  style.textContent = (fontDef.files || []).map(f => `
@font-face {
  font-family: "${family}";
  src: url("./fonts/${f.src}") format("${f.format || 'woff2'}");
  font-weight: ${f.weight || 400};
  font-style: normal;
  font-display: swap;
}`).join("\n");

  document.head.appendChild(style);
}

// =============================================================================
// Applica scale, density, radius, grid columns, border width
// =============================================================================
function applyDimensions() {
  const root = document.documentElement;
  root.style.setProperty("--font-size-scale", prefs.fontSizeScale);
  root.style.setProperty("--density", prefs.density);
  root.style.setProperty("--radius-button", `${prefs.radiusButton}px`);
  root.style.setProperty("--radius-card",   `${prefs.radiusCard}px`);
  root.style.setProperty("--radius-input",  `${prefs.radiusInput}px`);
  root.style.setProperty("--border-width",  `${prefs.borderWidth}px`);
  root.style.setProperty("--grid-columns",  prefs.gridColumns);
}

// =============================================================================
// Applica velocita' animazioni
// =============================================================================
function applyAnimations() {
  const root = document.documentElement;
  const speed = ANIM_SPEED_MAP[prefs.animationSpeed] || ANIM_SPEED_MAP.normal;
  root.style.setProperty("--animation-speed", speed);
  // Class flag per disabilitare completamente quando "none"
  root.classList.toggle("no-animations", prefs.animationSpeed === "none");
}

// =============================================================================
// Aggiorna <meta name="theme-color"> per status bar iOS
// =============================================================================
function applyMetaThemeColor() {
  const preset = resolveThemeMode(prefs.themeMode);
  const theme = themes[preset] || themes.light;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = theme.meta || "#1a1a1a";
}

// =============================================================================
// API pubblica - usata da Settings UI e console
// =============================================================================

/** Cambia un singolo campo di preferences e applica subito */
export function set(key, value) {
  prefs = { ...prefs, [key]: value };
  saveToStorage();
  applyAll();
}

/** Cambia piu' campi insieme (es. apply preset completo) */
export function update(partial) {
  prefs = { ...prefs, ...partial };
  saveToStorage();
  applyAll();
}

/** Override singolo token (color picker custom) */
export function overrideToken(tokenName, value) {
  prefs.customOverrides = { ...prefs.customOverrides, [tokenName]: value };
  saveToStorage();
  applyAll();
}

/** Rimuove tutti gli override e torna al preset puro */
export function clearOverrides() {
  prefs.customOverrides = {};
  saveToStorage();
  applyAll();
}

/** Reset totale a default (light) */
export function reset() {
  prefs = { ...defaultPreferences };
  saveToStorage();
  applyAll();
}

/** Snapshot dello stato corrente (per UI reattiva) */
export function getPreferences() {
  return { ...prefs };
}

/** Lista preset disponibili */
export function getPresets() {
  return Object.entries(themes).map(([key, t]) => ({
    key, name: t.name, base: t.base, meta: t.meta
  }));
}

/** Lista font disponibili */
export function getFonts() {
  return Object.entries(fonts).map(([key, f]) => ({ key, name: f.name }));
}

/** Esporta tema corrente come JSON scaricabile */
export function exportTheme() {
  const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `marty-theme-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Importa tema da JSON (file utente) */
export async function importTheme(file) {
  const text = await file.text();
  const incoming = JSON.parse(text);
  // Filter: accetta solo le chiavi note di defaultPreferences (sicurezza)
  const safe = {};
  for (const k of Object.keys(defaultPreferences)) {
    if (k in incoming) safe[k] = incoming[k];
  }
  update(safe);
}

/** Subscribe a cambiamenti tema (per UI reattiva Settings) */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  listeners.forEach(fn => { try { fn(prefs); } catch (e) { console.error(e); } });
}

// =============================================================================
// Persistenza localStorage
// =============================================================================
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPreferences };
    const saved = JSON.parse(raw);
    // Merge con default (per future versioni con nuovi campi)
    return { ...defaultPreferences, ...saved };
  } catch (err) {
    console.warn("[theme] Storage corrotto, uso default:", err);
    return { ...defaultPreferences };
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn("[theme] Salvataggio storage fallito:", err);
  }
}

// =============================================================================
// Esposizione globale per debug da console
// =============================================================================
if (typeof window !== "undefined") {
  window.MartyTheme = {
    init, set, update, overrideToken, clearOverrides, reset,
    getPreferences, getPresets, getFonts, exportTheme, importTheme, subscribe,
  };
}
