// =============================================================================
// Color matching: match cromatico tra colori-capo (nomi italiani) e palette
// armocromia dell'utente. Usato per badge guardaroba + filtro "solo palette".
// =============================================================================

import * as Theme from "./theme/manager.js";
import { COLOR_HEX } from "./chip-styles.js";
import { SEASONS } from "./armocromia-data.js";

// =============================================================================
// Distanza cromatica RGB euclidea pesata (approssimazione perceptual semplice)
// Riferimento: https://www.compuphase.com/cmetric.htm — formula "redmean"
// che e' un compromesso tra accuratezza e velocita', migliore della pura RGB.
// =============================================================================
function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  const m = hex.replace("#", "").match(/.{1,2}/g);
  if (!m || m.length !== 3) return null;
  return m.map(h => parseInt(h, 16));
}

export function colorDistance(hex1, hex2) {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return Infinity;
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  // redmean weighted euclidean
  const d = Math.sqrt(
    (2 + rmean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rmean) / 256) * db * db
  );
  return d;
}

// Range tipico colorDistance redmean: 0 (uguale) → ~750 (estremi).
// Soglie calibrate sui colori italiani della tassonomia Marty:
const THRESHOLD_IN   = 110;   // < soglia → in palette
const THRESHOLD_NEAR = 200;   // < soglia → vicino, > → fuori

// =============================================================================
// Risolve il nome italiano del colore (o un array di nomi) al miglior HEX
// disponibile. Considera anche eventuali override utente da chip-styles.
// =============================================================================
export function colorNameToHex(name) {
  if (!name) return null;
  const k = String(name).toLowerCase().trim();
  // Override utente (chipStyles colors:k)
  const prefs = Theme.getPreferences();
  const override = prefs.chipStyles?.[`colors:${k}`];
  if (override?.bg) return override.bg;
  return COLOR_HEX[k] || null;
}

// =============================================================================
// Match cromatico di un capo con la palette della stagione utente.
// Ritorna { status, score, closest, avoidConflict }
// status:
//   'in'    → colore vicino alla palette (badge verde)
//   'near'  → vicino ma non perfetto (badge giallo)
//   'out'   → lontano dalla palette (badge rosso)
//   'avoid' → match con un colore della lista "avoid" della stagione
//   null    → non valutabile (no test armocromia o colore non riconosciuto)
// =============================================================================
export function matchItemColor(item) {
  const prefs = Theme.getPreferences();
  const armoData = prefs.armocromia;
  if (!armoData?.seasonKey) return null;

  const season = SEASONS[armoData.seasonKey];
  if (!season) return null;

  // Estrai colori del capo (primary + secondary). I capi hanno color/color_primary
  // come singolo string o array; color_secondary array.
  const primaryRaw = item.color_primary || item.color;
  const primaryArr = Array.isArray(primaryRaw) ? primaryRaw : (primaryRaw ? [primaryRaw] : []);
  const secondaryArr = Array.isArray(item.color_secondary)
    ? item.color_secondary
    : (item.color_secondary ? [item.color_secondary] : []);
  const allColors = [...primaryArr, ...secondaryArr];

  if (allColors.length === 0) return null;

  // Per ogni colore del capo, trova la distanza minima da palette e da avoid
  let bestPaletteDist = Infinity;
  let bestPaletteHex = null;
  let bestAvoidDist = Infinity;
  let resolvedSomething = false;

  for (const colorName of allColors) {
    const itemHex = colorNameToHex(colorName);
    if (!itemHex) continue;
    resolvedSomething = true;

    for (const pHex of season.palette) {
      const d = colorDistance(itemHex, pHex);
      if (d < bestPaletteDist) {
        bestPaletteDist = d;
        bestPaletteHex = pHex;
      }
    }
    for (const aHex of (season.avoid || [])) {
      const d = colorDistance(itemHex, aHex);
      if (d < bestAvoidDist) {
        bestAvoidDist = d;
      }
    }
  }

  if (!resolvedSomething) return null;

  // Decision tree: se molto vicino a un colore "avoid" E lontano dalla palette
  // → flag avoid. Altrimenti decidi in/near/out per soglie palette.
  let status;
  if (bestAvoidDist < THRESHOLD_IN && bestPaletteDist > THRESHOLD_IN) {
    status = "avoid";
  } else if (bestPaletteDist < THRESHOLD_IN) {
    status = "in";
  } else if (bestPaletteDist < THRESHOLD_NEAR) {
    status = "near";
  } else {
    status = "out";
  }

  // Score 0..100 (100 = perfetto, 0 = lontanissimo)
  const score = Math.max(0, Math.min(100, Math.round(100 - (bestPaletteDist / THRESHOLD_NEAR) * 100)));

  return {
    status,
    score,
    closest: bestPaletteHex,
    avoidConflict: bestAvoidDist < THRESHOLD_IN,
    distance: bestPaletteDist,
  };
}

// =============================================================================
// Helpers UI
// =============================================================================
export const STATUS_META = {
  in:    { emoji: "🟢", label: "In palette",    short: "IN",   color: "#10b981" },
  near:  { emoji: "🟡", label: "Vicino",        short: "VICINO", color: "#f59e0b" },
  out:   { emoji: "🔴", label: "Fuori palette", short: "OUT",  color: "#ef4444" },
  avoid: { emoji: "🚫", label: "Da evitare",    short: "EVITA", color: "#dc2626" },
};

export function statusMeta(status) {
  return STATUS_META[status] || null;
}

// =============================================================================
// Quanti capi della collezione sono nella palette?
// Ritorna { in, near, out, avoid, total, applicable, percent }
// =============================================================================
export function paletteStats(items) {
  const counts = { in: 0, near: 0, out: 0, avoid: 0, applicable: 0 };
  for (const it of items || []) {
    const m = matchItemColor(it);
    if (!m) continue;
    counts.applicable++;
    if (counts[m.status] !== undefined) counts[m.status]++;
  }
  const total = (items || []).length;
  const goodCount = counts.in + counts.near;
  const percent = counts.applicable > 0
    ? Math.round((goodCount / counts.applicable) * 100)
    : 0;
  return { ...counts, total, percent };
}
