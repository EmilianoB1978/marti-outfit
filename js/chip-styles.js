// Personalizzazione visuale delle chip multi-select per le 4 tassonomie:
// colors, colors-secondary (alias colors), patterns, occasions.
//
// Default seed integrato con mappa COLOR_HEX, PATTERN_BG, OCCASION_DEFAULTS.
// Override per-utente salvato in Theme.preferences.chipStyles come dict
// piatto:
//
//   chipStyles: {
//     "colors:rosso":      { bg: "#c0392b", fg: "#fff" },
//     "patterns:righe":    { pattern: "stripes", bg: "#ffe6c2" },
//     "occasions:gala":    { icon: "✨", bg: "#d4af37", fg: "#1a1a1a" },
//   }
//
// Lo style ritornato da getChipStyle() unisce default + override.

import * as Theme from "./theme/manager.js";

// =============================================================================
// Color name -> hex (mappa estesa, italiani)
// =============================================================================
export const COLOR_HEX = {
  "bianco": "#ffffff", "panna": "#fff8e7", "crema": "#f5ecd6",
  "nero": "#1a1a1a",
  "grigio": "#808080",
  "beige": "#d4b896", "cammello": "#c19a6b", "cuoio": "#8b5a2b",
  "marrone": "#6b4423", "testa di moro": "#3d2817",
  "blu navy": "#1c2a48", "blu": "#2a59a8", "azzurro": "#82b4e8", "celeste": "#a0c8e8",
  "denim": "#5478a8", "denim chiaro": "#8aa4c4", "denim scuro": "#2a3a52",
  "rosso": "#c0392b", "bordeaux": "#5a1a1f",
  "rosa": "#f4a8b8", "fucsia": "#d63484",
  "verde": "#2d8b4a", "verde oliva": "#6b8e23",
  "verde salvia": "#9caf88", "verde militare": "#4b5d3a",
  "giallo": "#f1c40f", "arancione": "#e67e22",
  "senape": "#c8a228", "ocra": "#cc7722",
  "viola": "#8b4a8b", "lilla": "#c8a8d8", "prugna": "#5d3a5a",
  "oro": "#d4af37", "argento": "#c0c0c0", "rame": "#b87333",
};

// =============================================================================
// Pattern -> CSS background (gradient / repeating)
// =============================================================================
// Ogni pattern e' un CSS background-image stringa che produce un motivo
// piccolo riconoscibile anche su chip di 24-36px.
export const PATTERN_BG = {
  "tinta unita": null,  // niente background extra
  "righe":       "repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,0.4) 4px 6px)",
  "quadri":      "repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 6px), repeating-linear-gradient(90deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 6px)",
  "floreale":    "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.7) 1.5px, transparent 2px), radial-gradient(circle at 70% 60%, rgba(255,182,193,0.8) 1.5px, transparent 2px)",
  "denim":       "repeating-linear-gradient(135deg, rgba(0,0,0,0.15) 0 1px, transparent 1px 3px)",
  "grafico":     "linear-gradient(135deg, currentColor 50%, rgba(0,0,0,0.3) 50%)",
  "animalier":   "radial-gradient(ellipse 3px 2px at 25% 30%, rgba(0,0,0,0.55) 50%, transparent 51%), radial-gradient(ellipse 2px 1.5px at 70% 70%, rgba(0,0,0,0.55) 50%, transparent 51%)",
  "pois":        "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.85) 1.5px, transparent 2px), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.85) 1.5px, transparent 2px)",
  "tartan":      "repeating-linear-gradient(0deg, rgba(0,0,0,0.3) 0 1px, transparent 1px 5px), repeating-linear-gradient(90deg, rgba(0,0,0,0.3) 0 1px, transparent 1px 5px), repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 8px)",
  "houndstooth": "linear-gradient(45deg, rgba(0,0,0,0.6) 25%, transparent 25% 75%, rgba(0,0,0,0.6) 75%), linear-gradient(45deg, rgba(0,0,0,0.6) 25%, transparent 25% 75%, rgba(0,0,0,0.6) 75%)",
  "altro":       null,
};

// Background di default abbinato ad ogni pattern (se l'utente non l'ha
// scelto, applichiamo questo come bg base).
export const PATTERN_DEFAULT_BG = {
  "tinta unita": "#f5f5f5",
  "righe":       "#fff5e6",
  "quadri":      "#ffe9c8",
  "floreale":    "#ffe0eb",
  "denim":       "#5478a8",
  "grafico":     "#1a1a1a",
  "animalier":   "#d4b896",
  "pois":        "#c0392b",
  "tartan":      "#7a3636",
  "houndstooth": "#ffffff",
  "altro":       "#cccccc",
};

// =============================================================================
// Occasion -> { icon, bg } default
// =============================================================================
export const OCCASION_DEFAULTS = {
  "lavoro":    { icon: "💼", bg: "#3a4453", fg: "#ffffff" },
  "aperitivo": { icon: "🍹", bg: "#e67e22", fg: "#ffffff" },
  "cena":      { icon: "🍽️", bg: "#5a1a1f", fg: "#ffffff" },
  "sport":     { icon: "🏃", bg: "#2d8b4a", fg: "#ffffff" },
  "weekend":   { icon: "🌴", bg: "#82b4e8", fg: "#1a1a1a" },
  "viaggio":   { icon: "✈️", bg: "#1c2a48", fg: "#ffffff" },
  "casa":      { icon: "🏠", bg: "#d4b896", fg: "#1a1a1a" },
  "sera":      { icon: "🌙", bg: "#3d2452", fg: "#ffffff" },
  "gala":      { icon: "✨", bg: "#d4af37", fg: "#1a1a1a" },
  "cerimonia": { icon: "💐", bg: "#f4a8b8", fg: "#1a1a1a" },
  "mare":      { icon: "🌊", bg: "#a0c8e8", fg: "#1a1a1a" },
  "montagna":  { icon: "🏔️", bg: "#4b5d3a", fg: "#ffffff" },
};

// =============================================================================
// Helpers
// =============================================================================

/** Calcola foreground (bianco/nero) per un bg hex usando luminanza. */
export function bestTextFor(hex) {
  if (!hex) return "#1a1a1a";
  const m = String(hex).replace("#", "").match(/.{1,2}/g);
  if (!m || m.length !== 3) return "#1a1a1a";
  const [r, g, b] = m.map(h => parseInt(h, 16));
  // Luminance perceived (formula sRGB approssimata)
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.62 ? "#1a1a1a" : "#ffffff";
}

function key(taxonomy, value) {
  // colors-secondary mappa sullo stesso namespace di colors per condividere lo
  // stile (un capo "rosso" e' sempre rosso, primario o secondario non cambia).
  const tax = (taxonomy === "colors-secondary") ? "colors" : taxonomy;
  return `${tax}:${String(value || "").toLowerCase().trim()}`;
}

/** Stile di default per una voce (senza override utente). */
export function getDefaultStyle(taxonomy, value) {
  const v = String(value || "").toLowerCase().trim();
  if (taxonomy === "colors" || taxonomy === "colors-secondary") {
    const hex = COLOR_HEX[v];
    if (hex) return { bg: hex, fg: bestTextFor(hex) };
    return null;
  }
  if (taxonomy === "patterns") {
    const pattern = PATTERN_BG.hasOwnProperty(v) ? v : null;
    const bg = PATTERN_DEFAULT_BG[v] || "#f5f5f5";
    return { pattern, bg, fg: bestTextFor(bg) };
  }
  if (taxonomy === "occasions") {
    const def = OCCASION_DEFAULTS[v];
    if (def) return { ...def };
    return null;
  }
  return null;
}

/** Stile finale (default + override utente). */
export function getChipStyle(taxonomy, value) {
  const def = getDefaultStyle(taxonomy, value) || {};
  const prefs = Theme.getPreferences().chipStyles || {};
  const override = prefs[key(taxonomy, value)] || {};
  return { ...def, ...override };
}

/** Salva un override (parziale: merge con quello esistente). */
export function setChipStyle(taxonomy, value, patch) {
  const prefs = Theme.getPreferences();
  const all = { ...(prefs.chipStyles || {}) };
  const k = key(taxonomy, value);
  all[k] = { ...(all[k] || {}), ...patch };
  Theme.set("chipStyles", all);
}

/** Reset di un singolo override. */
export function resetChipStyle(taxonomy, value) {
  const prefs = Theme.getPreferences();
  const all = { ...(prefs.chipStyles || {}) };
  const k = key(taxonomy, value);
  if (all[k]) {
    delete all[k];
    Theme.set("chipStyles", all);
  }
}

/** Genera la stringa CSS inline da applicare ad una chip. */
export function styleToCss(style) {
  if (!style) return "";
  const parts = [];
  if (style.bg) parts.push(`background-color:${style.bg}`);
  if (style.fg) parts.push(`color:${style.fg}`);
  if (style.pattern && PATTERN_BG[style.pattern]) {
    // Sovrappone pattern al bg base
    parts.push(`background-image:${PATTERN_BG[style.pattern]}`);
    parts.push(`background-size:8px 8px`);
  }
  return parts.join(";");
}

/** Quando una tassonomia supporta lo styling. */
export function isTaxonomyStylable(taxonomy) {
  return ["colors", "colors-secondary", "patterns", "occasions"].includes(taxonomy);
}
