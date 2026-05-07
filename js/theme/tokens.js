// =============================================================================
// Theme presets - Marty Outfit
// =============================================================================
// Ogni preset e' un oggetto piatto: chiave token -> valore CSS.
// Vengono applicati da theme/manager.js settando document.documentElement.style.
// I preset definiscono SOLO i token che cambiano dal default. I token non
// menzionati restano quelli definiti in css/tokens.css.
// =============================================================================

// Set di base condiviso da tutti i preset "chiari" (per non duplicare codice)
const BASE_LIGHT = {
  "color-bg":           "#ffffff",
  "color-surface":      "#f7f7f8",
  "color-surface-alt":  "#ededef",
  "color-text":         "#1a1a1a",
  "color-text-muted":   "#6a6a6a",
  "color-text-inverse": "#ffffff",
  "color-border":       "#e0e0e2",
  "color-divider":      "#ededef",
  "color-overlay":      "rgba(0, 0, 0, 0.55)",
};

const BASE_DARK = {
  "color-bg":           "#1a1a1a",
  "color-surface":      "#242424",
  "color-surface-alt":  "#2e2e2e",
  "color-text":         "#f0f0f0",
  "color-text-muted":   "#999999",
  "color-text-inverse": "#1a1a1a",
  "color-border":       "#3a3a3a",
  "color-divider":      "#2e2e2e",
  "color-overlay":      "rgba(0, 0, 0, 0.7)",
};

// Stati feedback condivisi (success/warning/error/info) coerenti tra i preset
const STATUS_COLORS = {
  "color-success": "#27ae60",
  "color-warning": "#f39c12",
  "color-error":   "#e74c3c",
  "color-info":    "#3498db",
};

// =============================================================================
// 10 preset
// =============================================================================
export const themes = {

  // 1. Light - bianco/oro classico (era il default originale dell'app)
  light: {
    name: "Light",
    base: "light",
    meta: "#1a1a1a",
    tokens: {
      ...BASE_LIGHT,
      ...STATUS_COLORS,
      "color-primary":        "#d4af37",
      "color-primary-hover":  "#e8c248",
      "color-primary-active": "#b89422",
      "color-secondary":      "#2e2e2e",
      "color-accent":         "#1a1a1a",
      "color-focus":          "#d4af37",
      "shadow-focus":         "0 0 0 3px rgba(212, 175, 55, 0.45)",
    }
  },

  // 2. Dark - nero/oro luxe (era il default originale)
  dark: {
    name: "Dark",
    base: "dark",
    meta: "#1a1a1a",
    tokens: {
      ...BASE_DARK,
      ...STATUS_COLORS,
      "color-primary":        "#d4af37",
      "color-primary-hover":  "#e8c248",
      "color-primary-active": "#b89422",
      "color-secondary":      "#2e2e2e",
      "color-accent":         "#d4af37",
      "color-focus":          "#d4af37",
      "shadow-focus":         "0 0 0 3px rgba(212, 175, 55, 0.5)",
    }
  },

  // 3. Pastel Pink - rosa cipria/crema (femminile, soft)
  pastelPink: {
    name: "Pastel Pink",
    base: "light",
    meta: "#fdf2f4",
    tokens: {
      ...BASE_LIGHT,
      ...STATUS_COLORS,
      "color-bg":             "#fdf2f4",
      "color-surface":        "#f8e3e7",
      "color-surface-alt":    "#f0d4da",
      "color-text":           "#3d2630",
      "color-text-muted":     "#8a6878",
      "color-text-inverse":   "#ffffff",
      "color-border":         "#e8c8d0",
      "color-divider":        "#f0d4da",
      "color-primary":        "#d4738a",
      "color-primary-hover":  "#e88a9e",
      "color-primary-active": "#b85972",
      "color-accent":         "#a04860",
      "color-focus":          "#d4738a",
      "shadow-focus":         "0 0 0 3px rgba(212, 115, 138, 0.4)",
    }
  },

  // 4. Midnight - blu notte/oro (luxe scuro)
  midnight: {
    name: "Midnight",
    base: "dark",
    meta: "#0a1628",
    tokens: {
      ...BASE_DARK,
      ...STATUS_COLORS,
      "color-bg":             "#0a1628",
      "color-surface":        "#142340",
      "color-surface-alt":    "#1e3358",
      "color-text":           "#e8eef8",
      "color-text-muted":     "#8b9bb5",
      "color-text-inverse":   "#0a1628",
      "color-border":         "#2a4470",
      "color-divider":        "#1e3358",
      "color-primary":        "#d4af37",
      "color-primary-hover":  "#e8c248",
      "color-primary-active": "#b89422",
      "color-accent":         "#7eb8ff",
      "color-focus":          "#d4af37",
      "shadow-focus":         "0 0 0 3px rgba(212, 175, 55, 0.5)",
      "color-overlay":        "rgba(10, 22, 40, 0.85)",
    }
  },

  // 5. Sage - verde salvia/beige (sustainable, calmo)
  sage: {
    name: "Sage",
    base: "light",
    meta: "#f4f1e8",
    tokens: {
      ...BASE_LIGHT,
      ...STATUS_COLORS,
      "color-bg":             "#f4f1e8",
      "color-surface":        "#e8e3d3",
      "color-surface-alt":    "#dad3bd",
      "color-text":           "#2d3a28",
      "color-text-muted":     "#6b7a5e",
      "color-text-inverse":   "#ffffff",
      "color-border":         "#c8c0a5",
      "color-divider":        "#dad3bd",
      "color-primary":        "#7a8c5d",
      "color-primary-hover":  "#8fa370",
      "color-primary-active": "#637148",
      "color-accent":         "#a3724a",
      "color-focus":          "#7a8c5d",
      "shadow-focus":         "0 0 0 3px rgba(122, 140, 93, 0.4)",
    }
  },

  // 6. Mono - solo bianco/nero/grigi (minimalista)
  mono: {
    name: "Mono",
    base: "light",
    meta: "#ffffff",
    tokens: {
      ...BASE_LIGHT,
      ...STATUS_COLORS,
      "color-bg":             "#ffffff",
      "color-surface":        "#f5f5f5",
      "color-surface-alt":    "#e5e5e5",
      "color-text":           "#000000",
      "color-text-muted":     "#666666",
      "color-text-inverse":   "#ffffff",
      "color-border":         "#cccccc",
      "color-divider":        "#e5e5e5",
      "color-primary":        "#000000",
      "color-primary-hover":  "#333333",
      "color-primary-active": "#000000",
      "color-secondary":      "#666666",
      "color-accent":         "#000000",
      "color-focus":          "#000000",
      "shadow-focus":         "0 0 0 3px rgba(0, 0, 0, 0.3)",
    }
  },

  // 7. Warm Sunset - arancio/terracotta (caldo, accogliente)
  warmSunset: {
    name: "Warm Sunset",
    base: "light",
    meta: "#fdf4ec",
    tokens: {
      ...BASE_LIGHT,
      ...STATUS_COLORS,
      "color-bg":             "#fdf4ec",
      "color-surface":        "#fae5d3",
      "color-surface-alt":    "#f5d4b8",
      "color-text":           "#3d2419",
      "color-text-muted":     "#8a6850",
      "color-text-inverse":   "#ffffff",
      "color-border":         "#e8c8a8",
      "color-divider":        "#f5d4b8",
      "color-primary":        "#d97a4b",
      "color-primary-hover":  "#e8916a",
      "color-primary-active": "#b85e30",
      "color-accent":         "#a04a25",
      "color-focus":          "#d97a4b",
      "shadow-focus":         "0 0 0 3px rgba(217, 122, 75, 0.4)",
    }
  },

  // 8. Y2K - viola/ciano vivaci (vibe pop)
  y2k: {
    name: "Y2K",
    base: "dark",
    meta: "#1a0d2e",
    tokens: {
      ...BASE_DARK,
      ...STATUS_COLORS,
      "color-bg":             "#1a0d2e",
      "color-surface":        "#2a1a4d",
      "color-surface-alt":    "#3a2870",
      "color-text":           "#f0e8ff",
      "color-text-muted":     "#a890d8",
      "color-text-inverse":   "#1a0d2e",
      "color-border":         "#4a3890",
      "color-divider":        "#3a2870",
      "color-primary":        "#ff4dd2",
      "color-primary-hover":  "#ff6dde",
      "color-primary-active": "#e030b8",
      "color-accent":         "#4dd2ff",
      "color-focus":          "#4dd2ff",
      "shadow-focus":         "0 0 0 3px rgba(77, 210, 255, 0.5)",
    }
  },

  // 9. Matcha - verde matcha/crema (zen, calmo)
  matcha: {
    name: "Matcha",
    base: "light",
    meta: "#f0ebd8",
    tokens: {
      ...BASE_LIGHT,
      ...STATUS_COLORS,
      "color-bg":             "#f0ebd8",
      "color-surface":        "#e3dcc0",
      "color-surface-alt":    "#d3caa3",
      "color-text":           "#2d3a18",
      "color-text-muted":     "#6b7748",
      "color-text-inverse":   "#ffffff",
      "color-border":         "#c0b585",
      "color-divider":        "#d3caa3",
      "color-primary":        "#5d8c3a",
      "color-primary-hover":  "#70a347",
      "color-primary-active": "#48702a",
      "color-accent":         "#3d7028",
      "color-focus":          "#5d8c3a",
      "shadow-focus":         "0 0 0 3px rgba(93, 140, 58, 0.4)",
    }
  },

  // 10. High Contrast - WCAG AAA (accessibilita')
  highContrast: {
    name: "High Contrast",
    base: "dark",
    meta: "#000000",
    tokens: {
      ...BASE_DARK,
      ...STATUS_COLORS,
      "color-bg":             "#000000",
      "color-surface":        "#0a0a0a",
      "color-surface-alt":    "#1a1a1a",
      "color-text":           "#ffffff",
      "color-text-muted":     "#cccccc",
      "color-text-inverse":   "#000000",
      "color-border":         "#ffffff",
      "color-divider":        "#666666",
      "color-primary":        "#ffff00",
      "color-primary-hover":  "#ffff66",
      "color-primary-active": "#cccc00",
      "color-accent":         "#00ffff",
      "color-focus":          "#ffff00",
      "shadow-focus":         "0 0 0 4px rgba(255, 255, 0, 0.7)",
    }
  },
};

// =============================================================================
// Font famiglie disponibili (mappate ai nomi dei file in /fonts/)
// =============================================================================
export const fonts = {
  system: {
    name: "Sistema",
    base:    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    needsLoad: false,
  },
  // Inter, Playfair, DM Sans: variable fonts — un solo .woff2 copre tutti i pesi
  inter: {
    name: "Inter",
    base:    '"Inter", -apple-system, sans-serif',
    heading: '"Inter", -apple-system, sans-serif',
    needsLoad: true,
    files: [{ src: "inter.woff2",    format: "woff2", weight: "100 900" }],
    family: "Inter",
  },
  playfair: {
    name: "Playfair Display",
    base:    '-apple-system, BlinkMacSystemFont, sans-serif',
    heading: '"Playfair Display", Georgia, serif',
    needsLoad: true,
    files: [{ src: "playfair.woff2", format: "woff2", weight: "400 900" }],
    family: "Playfair Display",
  },
  dmsans: {
    name: "DM Sans",
    base:    '"DM Sans", -apple-system, sans-serif',
    heading: '"DM Sans", -apple-system, sans-serif',
    needsLoad: true,
    files: [{ src: "dmsans.woff2",   format: "woff2", weight: "100 1000" }],
    family: "DM Sans",
  },
  jetbrains: {
    name: "JetBrains Mono",
    base:    '"JetBrains Mono", Menlo, monospace',
    heading: '"JetBrains Mono", Menlo, monospace',
    needsLoad: true,
    files: [{ src: "jetbrains.woff",  format: "woff",  weight: "400" }],
    family: "JetBrains Mono",
  },
};

// =============================================================================
// Default user preferences (quando non c'e' nulla salvato)
// =============================================================================
export const defaultPreferences = {
  themeMode:    "light",      // "light" | "dark" | "auto" | "<presetName>"
  font:         "system",     // chiave di fonts{}
  fontSizeScale: 1,           // 0.875 | 1 | 1.125
  density:      1,            // 0.75 | 1 | 1.25
  gridColumns:  2,            // 2 | 3 | 4
  radiusButton: 8,            // 0..32 px
  radiusCard:   14,           // 0..24 px
  radiusInput:  8,            // 0..16 px
  borderWidth:  1,            // 0 | 1 | 2 px
  animationSpeed: "normal",   // "none" | "slow" | "normal" | "fast"
  showLabels:   true,         // mostra etichette icone in nav
  customOverrides: {},        // override manuali sui singoli token (color picker)
  // Behavior preferences
  linkDurationDays: 180,      // 30..720 giorni - dopo questa soglia, alert scadenza link
  shareTemplate: "classic",   // template default per outfit card (classic|dark|pastel|magazine)
  // Bottom nav (5 slot personalizzabili. Slot 2 = centrale ingrandito.)
  bottomNav: ["wardrobe", "calendar", "add_item", "capsules", "outfits"],
  // Menu drawer (icona ⋯ in header): ordine + voci nascoste
  menuOrder: ["diary", "reminders", "notes", "budget", "trips", "live", "palette", "dormant", "analytics", "capsules", "calendar", "taxonomies", "settings", "manual", "system"],
  menuHidden: [],
  // 8 stagioni in ordine cronologico annuale (4 reali + 4 mezze stagioni di
  // transizione). Ogni stagione: { label, icon, enabled, kind }.
  // kind="full" -> sempre attiva (non disabilitabile), nome editabile.
  // kind="half" -> disabilitabile dall'utente, nome editabile.
  seasons: {
    primavera:   { label: "Primavera",   icon: "🌸", enabled: true, kind: "full" },
    primestate:  { label: "Primestate",  icon: "🌼", enabled: true, kind: "half" },
    estate:      { label: "Estate",      icon: "☀️", enabled: true, kind: "full" },
    estunno:     { label: "Estunno",     icon: "🌻", enabled: true, kind: "half" },
    autunno:     { label: "Autunno",     icon: "🍂", enabled: true, kind: "full" },
    autinverno:  { label: "Autinverno",  icon: "🌧️", enabled: true, kind: "half" },
    inverno:     { label: "Inverno",     icon: "❄️", enabled: true, kind: "full" },
    inveravera:  { label: "Inveravera",  icon: "🌱", enabled: true, kind: "half" },
  },
  // Ordine cronologico (annuale) - usato per renderizzare i chip in verticale
  seasonsOrder: ["primavera", "primestate", "estate", "estunno", "autunno", "autinverno", "inverno", "inveravera"],
  // 5 livelli di peso del capo (categorico). I grammi sono modificabili
  // dall'utente in Aspetto -> Pesi. Default = pesi medi tipici di un capo
  // di abbigliamento di quella categoria, piegato bene.
  itemWeights: {
    leggerissimo:  { label: "Leggerissimo", icon: "🪶", grams: 100 },
    leggero:       { label: "Leggero",      icon: "🌬️", grams: 250 },
    medio:         { label: "Medio",         icon: "⚖️", grams: 450 },
    pesante:       { label: "Pesante",       icon: "🧱", grams: 800 },
    pesantissimo:  { label: "Pesantissimo",  icon: "🏋️", grams: 1500 },
  },
  itemWeightsOrder: ["leggerissimo", "leggero", "medio", "pesante", "pesantissimo"],
  // FAB customization (pulsante centrale nella barra inferiore)
  fab: {
    icon: "🛍️",          // emoji o testo singolo carattere; ignorato se logoUrl
    bgColor: "",         // vuoto = usa --color-primary
    iconColor: "",       // vuoto = usa --color-text-inverse
    logoUrl: null,       // se settato, sostituisce icona con immagine
    logoPath: null,      // path Storage per cleanup
  },
  // Icona PWA (cambia l'icona installata dopo reinstall dalla home)
  appIcon: "default",    // "default" | "pink" | "navy" | "mono" | "custom"
};
