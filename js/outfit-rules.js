// =============================================================================
// Outfit Rules Engine (rule-based, no AI esterne)
// =============================================================================
// Engine deterministico per generare outfit basato su regole moda hardcoded.
// Sostituisce/affianca Claude.suggestOutfits per eliminare:
//  - Costi API esterne
//  - Risultati sballati (colori incompatibili, ripetizione capi)
//  - Dipendenza rete
//
// PIPELINE:
//   1. Filtra capi compatibili con occasione/stagione/stile target
//   2. Genera combinazioni (top × bottom × scarpe)
//   3. Score ogni combinazione: colori + formality + stagione + stile + anti-rip
//   4. Multi-top opzionale: aggiunge cardigan/blazer/capospalla compatibile
//   5. Ritorna top N outfit con score breakdown
// =============================================================================

import { listSubcategoriesByCategory } from "./taxonomies.js";

// ====================================================================
// Color theory hardcoded
// ====================================================================
// Mappa colori italiana → categoria temperatura/tono
const COLOR_CATEGORIES = {
  neutro_chiaro:  ["bianco", "panna", "ecru", "crema", "avorio", "ghiaccio", "latte"],
  neutro_medio:   ["beige", "cammello", "tortora", "sabbia", "kaki", "champagne", "nude", "carne"],
  neutro_scuro:   ["nero", "antracite", "grigio scuro", "carbone", "moro"],
  neutro_grigio:  ["grigio", "grigio chiaro", "grigio medio", "argento", "piombo"],
  blu_navy:       ["blu navy", "navy", "blu notte", "blu scuro", "indaco"],
  blu_chiaro:     ["azzurro", "azzurro polvere", "celeste", "blu chiaro", "ciano", "turchese"],
  blu_jeans:      ["blu denim", "denim", "blu jeans", "jeans"],
  // Caldi
  rosso:          ["rosso", "rosso fuoco", "rosso ciliegia", "vermiglio", "scarlatto"],
  arancione:      ["arancione", "ocra", "terracotta", "ruggine", "albicocca", "corallo", "pesca"],
  giallo:         ["giallo", "giallo senape", "senape", "ocra giallo", "ambra", "miele"],
  marrone:        ["marrone", "marrone scuro", "cioccolato", "caffè", "moka", "testa di moro", "noce", "tabacco"],
  bordeaux:       ["bordeaux", "vinaccia", "vino", "amaranto", "granata"],
  rosa:           ["rosa", "rosa pallido", "rosa antico", "rosa polvere", "rosa cipria", "fucsia", "magenta", "malva"],
  // Freddi
  verde:          ["verde", "verde militare", "verde oliva", "verde scuro", "verde foresta", "smeraldo", "verde bottiglia", "salvia", "menta"],
  viola:          ["viola", "viola scuro", "lavanda", "lilla", "prugna", "melanzana", "indaco viola"],
  // Speciali
  metallico:      ["oro", "argento", "rame", "bronzo", "platino"],
  brillante:      ["fluo", "lime", "fucsia acceso", "giallo acido"],
  animalier:      ["leopardo", "zebra", "pitone", "tigrato", "maculato"],
};

// Inversione: colore → categoria
const _COLOR_TO_CATEGORY = {};
for (const [cat, colors] of Object.entries(COLOR_CATEGORIES)) {
  for (const c of colors) _COLOR_TO_CATEGORY[c.toLowerCase()] = cat;
}

const NEUTRAL_CATEGORIES = new Set([
  "neutro_chiaro", "neutro_medio", "neutro_scuro", "neutro_grigio", "blu_navy", "marrone",
]);

const COLD_CATEGORIES = new Set([
  "blu_navy", "blu_chiaro", "blu_jeans", "verde", "viola",
  "neutro_chiaro", "neutro_grigio", "neutro_scuro",
]);

const WARM_CATEGORIES = new Set([
  "rosso", "arancione", "giallo", "marrone", "bordeaux", "rosa",
  "neutro_medio",  // cammello/beige sono caldi
]);

/**
 * Ritorna la categoria-colore per un nome (case-insensitive).
 * Sconosciuti → null (verranno trattati come "neutri di default" nel score).
 */
function colorCategory(name) {
  if (!name) return null;
  return _COLOR_TO_CATEGORY[String(name).toLowerCase().trim()] || null;
}

/**
 * Score della compatibilità cromatica tra capi (max 30).
 *  - Tutti neutri:                 +30
 *  - Stessa temperatura (caldo|freddo) + max 1 accent: +20
 *  - Mix neutro + 1 accent:         +18
 *  - Mix neutro + 2 accent:         +5
 *  - Brillanti multipli:           -15
 *  - Categorie sconosciute (tutte): +10 (neutro presunto)
 */
function scoreColors(items) {
  const categories = items
    .flatMap(it => (it.color_primary || []).map(c => colorCategory(c)))
    .filter(Boolean);
  if (categories.length === 0) return 10;

  let brilliantCount = 0;
  let coldCount = 0;
  let warmCount = 0;
  let neutralCount = 0;
  for (const c of categories) {
    if (c === "brillante") brilliantCount++;
    if (COLD_CATEGORIES.has(c)) coldCount++;
    if (WARM_CATEGORIES.has(c)) warmCount++;
    if (NEUTRAL_CATEGORIES.has(c)) neutralCount++;
  }

  if (brilliantCount >= 2) return -15;

  const accents = categories.filter(c => !NEUTRAL_CATEGORIES.has(c));
  if (accents.length === 0) return 30;  // tutto neutro
  if (accents.length === 1) return 20;  // 1 accent

  // 2+ accent: penalizza miscela calda+fredda
  if (coldCount > 0 && warmCount > 0 && Math.min(coldCount, warmCount) >= 2) return -10;
  if (accents.length === 2) return 8;
  return -5;
}

// ====================================================================
// Coerenza formality (1-5)
// ====================================================================
function scoreFormality(items) {
  const vals = items.map(it => it.formality).filter(v => typeof v === "number" && v >= 1 && v <= 5);
  if (vals.length < 2) return 5;  // dato mancante, neutrale
  const range = Math.max(...vals) - Math.min(...vals);
  if (range === 0) return 15;
  if (range === 1) return 12;
  if (range === 2) return 5;
  if (range === 3) return -5;
  return -15;  // range >= 4 troppo incoerente
}

// ====================================================================
// Coerenza stagione (8 stagioni Marti)
// ====================================================================
function scoreSeason(items, targetSeasons = null) {
  const sets = items.map(it => new Set(it.season || []));
  if (sets.some(s => s.size === 0)) return 5;  // mancante

  // Intersezione di tutti
  let inter = null;
  for (const s of sets) {
    if (inter === null) inter = new Set(s);
    else inter = new Set([...inter].filter(x => s.has(x)));
  }
  if (!inter || inter.size === 0) return -20;

  // Se target seasons fornite, valuta che l'outfit includa una delle target
  if (targetSeasons && targetSeasons.length > 0) {
    const match = [...inter].some(s => targetSeasons.includes(s));
    return match ? 20 : -10;
  }
  return 10;
}

// ====================================================================
// Coerenza stile
// ====================================================================
const STYLE_COMPAT = {
  casual:     { casual: 15, elegante: 8, sportivo: 6, streetwear: 6, formale: -10 },
  elegante:   { elegante: 15, formale: 12, casual: 8, sportivo: -8, streetwear: -5 },
  formale:    { formale: 15, elegante: 12, casual: -10, sportivo: -15, streetwear: -10 },
  sportivo:   { sportivo: 15, streetwear: 10, casual: 6, elegante: -8, formale: -15 },
  streetwear: { streetwear: 15, casual: 6, sportivo: 10, elegante: -5, formale: -10 },
};
function scoreStyle(items) {
  const styles = items.map(it => it.style).filter(Boolean);
  if (styles.length < 2) return 5;
  let score = 0;
  for (let i = 0; i < styles.length; i++) {
    for (let j = i + 1; j < styles.length; j++) {
      const a = STYLE_COMPAT[styles[i]];
      const v = (a && a[styles[j]] !== undefined) ? a[styles[j]] : 0;
      score += v;
    }
  }
  // Normalizzo: max ~15 per coppia, min ~-15
  return Math.max(-20, Math.min(20, score / Math.max(1, styles.length - 1)));
}

// ====================================================================
// Anti-ripetizione (localStorage)
// ====================================================================
const LS_KEY_HISTORY = "marti_outfit_history";
const HISTORY_SIZE = 20;  // ultimi N outfit visti
const ITEM_RECENT_PENALTY_SIZE = 12;  // capi visti negli ultimi N

function _loadHistory() {
  try {
    const raw = localStorage.getItem(LS_KEY_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function _saveHistory(arr) {
  try { localStorage.setItem(LS_KEY_HISTORY, JSON.stringify(arr.slice(0, HISTORY_SIZE))); }
  catch {}
}
function _recentItemCounter() {
  const hist = _loadHistory().slice(0, ITEM_RECENT_PENALTY_SIZE);
  const c = new Map();
  for (const o of hist) for (const id of o.item_ids || []) {
    c.set(id, (c.get(id) || 0) + 1);
  }
  return c;
}

/**
 * Aggiunge un outfit alla cronologia recente (per anti-ripetizione future).
 */
export function rememberOutfit(itemIds) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return;
  const hist = _loadHistory();
  hist.unshift({ item_ids: itemIds, t: Date.now() });
  _saveHistory(hist);
}

/** Resetta la cronologia (debug / utente). */
export function clearOutfitHistory() {
  try { localStorage.removeItem(LS_KEY_HISTORY); } catch {}
}

function scoreAntiRepetition(items, recentCounter) {
  let penalty = 0;
  for (const it of items) {
    const c = recentCounter.get(it.id) || 0;
    if (c >= 3) penalty -= 12;
    else if (c === 2) penalty -= 6;
    else if (c === 1) penalty -= 2;
  }
  // Bonus capi mai indossati di recente
  const wearScore = items.reduce((acc, it) => {
    const w = it.wear_count || 0;
    if (w === 0) return acc + 4;     // capi mai indossati: bonus diversita'
    if (w < 3) return acc + 2;
    return acc;
  }, 0);
  return penalty + wearScore;
}

// ====================================================================
// Filtraggio capi per contesto (occasione + stagione)
// ====================================================================
function _normalizeContext(ctxText) {
  const t = (ctxText || "").toLowerCase().trim();
  // Estrazione semplice: cerca parole chiave di occasione e stagione
  const occasions = [];
  const KEY_OCCASIONS = [
    "lavoro", "ufficio", "meeting", "business",
    "aperitivo", "cena", "ristorante", "uscita",
    "festa", "evento", "matrimonio", "cerimonia",
    "casual", "weekend", "passeggiata", "shopping",
    "sport", "palestra", "trekking",
    "mare", "spiaggia", "vacanza",
    "casa",
  ];
  for (const o of KEY_OCCASIONS) {
    if (t.includes(o)) occasions.push(o);
  }

  // Stagioni esplicite dal testo
  const KEY_SEASONS = ["primavera", "estate", "autunno", "inverno",
                       "primestate", "estunno", "autinverno", "inveravera"];
  const seasons = KEY_SEASONS.filter(s => t.includes(s));

  // Formalità inferita
  let formalityMin = null, formalityMax = null;
  if (occasions.some(o => ["matrimonio", "cerimonia", "evento"].includes(o))) formalityMin = 4;
  if (occasions.some(o => ["lavoro", "ufficio", "meeting"].includes(o))) formalityMin = 3;
  if (occasions.some(o => ["aperitivo", "cena", "ristorante"].includes(o))) formalityMin = 2;
  if (occasions.some(o => ["sport", "palestra", "trekking", "casa", "spiaggia"].includes(o))) formalityMax = 2;

  return { rawText: t, occasions, seasons, formalityMin, formalityMax };
}

function _matchesContext(item, ctx) {
  // Stagione (se specificata): l'item deve avere almeno 1 stagione comune
  if (ctx.seasons.length > 0) {
    const itSeasons = item.season || [];
    if (!ctx.seasons.some(s => itSeasons.includes(s))) return false;
  }
  // Occasione (se specificata): l'item deve avere almeno 1 occasion compatibile
  // Tolerant: match parziale su substring
  if (ctx.occasions.length > 0) {
    const itOccs = (item.occasion || []).map(o => o.toLowerCase());
    const occMatch = ctx.occasions.some(reqOcc => itOccs.some(io => io.includes(reqOcc) || reqOcc.includes(io)));
    // Tolerant: se l'item non ha occasion settata, non lo escludo
    if (itOccs.length > 0 && !occMatch) return false;
  }
  // Formality
  if (ctx.formalityMin !== null && typeof item.formality === "number"
      && item.formality < ctx.formalityMin - 1) return false;
  if (ctx.formalityMax !== null && typeof item.formality === "number"
      && item.formality > ctx.formalityMax + 1) return false;
  return true;
}

// ====================================================================
// Multi-top: trova capospalla/cardigan compatibile per il top
// ====================================================================
const LIGHT_TOP_SUBCATEGORIES = new Set([
  "t-shirt", "tshirt", "body", "canotta", "crop top",
  "camicetta", "blusa", "camicia", "polo", "camicia polo",
  "tunica", "bustier",
]);
const LAYER_SUBCATEGORIES = new Set([
  "cardigan", "blazer", "giacca", "giubbotto", "giubbotto di pelle",
  "cappotto", "trench", "bomber", "kimono", "spolverino",
  "piumino", "parka", "impermeabile", "mantella",
]);
const COLD_SEASONS = new Set(["inverno", "autinverno", "inveravera"]);
const MILD_SEASONS = new Set(["primavera", "primestate", "estunno", "autunno"]);

/**
 * Decide se aggiungere un secondo strato sul top e ritorna il candidato.
 * Ritorna null se non serve o nessun capo compatibile.
 */
function findLayerForTop(topItem, allItems, scoredCtx) {
  if (!topItem) return null;
  const sub = (topItem.subcategory || "").toLowerCase();
  const isLight = LIGHT_TOP_SUBCATEGORIES.has(sub);
  if (!isLight) return null;

  // Stagione del contesto: serve secondo strato solo per stagioni fresche o miste
  const topSeasons = new Set(topItem.season || []);
  const ctxSeasons = scoredCtx.seasons.length > 0
    ? new Set(scoredCtx.seasons)
    : topSeasons;
  const needsLayer = [...ctxSeasons].some(s => COLD_SEASONS.has(s) || MILD_SEASONS.has(s));
  if (!needsLayer) return null;

  // Candidati layer: capi capospalla + cardigan
  const candidates = allItems.filter(it => {
    const sb = (it.subcategory || "").toLowerCase();
    const cat = (it.category || "").toLowerCase();
    return cat === "capospalla" || LAYER_SUBCATEGORIES.has(sb);
  });

  if (candidates.length === 0) return null;

  // Best match: colore compatibile + stagione compatibile
  let best = null;
  let bestScore = -Infinity;
  const topCatColors = (topItem.color_primary || []).map(colorCategory).filter(Boolean);
  for (const c of candidates) {
    const cSeasons = c.season || [];
    const seasonMatch = cSeasons.some(s => ctxSeasons.has(s));
    if (!seasonMatch) continue;
    const cColors = (c.color_primary || []).map(colorCategory).filter(Boolean);
    // Score: 2 punti se uno dei suoi colori e' neutro o uguale a quelli del top
    let s = 0;
    for (const cc of cColors) {
      if (NEUTRAL_CATEGORIES.has(cc)) s += 3;
      if (topCatColors.includes(cc)) s += 2;
    }
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

// ====================================================================
// Generazione candidate combinazioni
// ====================================================================
function _byCategory(items, ctx) {
  const groups = { top: [], bottom: [], scarpe: [], vestito: [] };
  for (const it of items) {
    if (!_matchesContext(it, ctx)) continue;
    const c = (it.category || "").toLowerCase();
    if (groups[c]) groups[c].push(it);
  }
  return groups;
}

function _shuffle(arr) {
  // Fisher-Yates inline (no mutate input)
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ====================================================================
// Entry point: suggestOutfits locale
// ====================================================================
/**
 * Genera N outfit per il contesto dato usando solo regole locali.
 *
 * @param {string} contextText - es. "cena informale", "lavoro inverno", ecc.
 * @param {Array} allItems - array completo dei capi del guardaroba
 * @param {object} opts - { count = 3, minScore = 30 }
 * @returns {Array<{title, description, item_ids, score, breakdown}>}
 */
export function suggestOutfitsLocal(contextText, allItems, opts = {}) {
  const count = opts.count || 3;
  const minScore = opts.minScore ?? 20;
  const ctx = _normalizeContext(contextText);
  const recentCounter = _recentItemCounter();

  // Filter + group
  const groups = _byCategory(allItems, ctx);
  let candidates = [];

  // Outfit "vestito" (1 pezzo top+bottom)
  for (const v of _shuffle(groups.vestito).slice(0, 4)) {
    for (const s of _shuffle(groups.scarpe).slice(0, 3)) {
      candidates.push([v, s]);
    }
  }
  // Outfit "top + bottom + scarpe"
  for (const t of _shuffle(groups.top).slice(0, 6)) {
    for (const b of _shuffle(groups.bottom).slice(0, 5)) {
      for (const sh of _shuffle(groups.scarpe).slice(0, 3)) {
        candidates.push([t, b, sh]);
      }
    }
  }

  // Score ogni combinazione
  const scored = candidates.map(items => {
    const colorScore = scoreColors(items);
    const formScore = scoreFormality(items);
    const seasonScore = scoreSeason(items, ctx.seasons);
    const styleScore = scoreStyle(items);
    const antiRep = scoreAntiRepetition(items, recentCounter);
    const total = colorScore + formScore + seasonScore + styleScore + antiRep;
    return { items, total, breakdown: { colors: colorScore, formality: formScore, season: seasonScore, style: styleScore, anti_rep: antiRep } };
  });

  // Ordina decrescente per score, dedup approssimativo (no due outfit identici)
  scored.sort((a, b) => b.total - a.total);
  const seen = new Set();
  const top = [];
  for (const cand of scored) {
    if (cand.total < minScore) break;
    const key = cand.items.map(it => it.id).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    top.push(cand);
    if (top.length >= count) break;
  }

  // Multi-top: se l'outfit ha un top categoria=top, prova ad aggiungere layer
  const result = top.map((cand, idx) => {
    let items = [...cand.items];
    const topItem = items.find(it => (it.category || "").toLowerCase() === "top");
    if (topItem) {
      const layer = findLayerForTop(topItem, allItems, ctx);
      if (layer && !items.find(it => it.id === layer.id)) {
        items.push(layer);
      }
    }
    const title = _outfitTitle(items, ctx, idx);
    return {
      title,
      description: _outfitDescription(cand.breakdown),
      item_ids: items.map(it => it.id),
      score: cand.total,
      breakdown: cand.breakdown,
    };
  });

  // Aggiorna cronologia
  for (const o of result) rememberOutfit(o.item_ids);

  return result;
}

function _outfitTitle(items, ctx, idx) {
  const styles = [...new Set(items.map(it => it.style).filter(Boolean))];
  const dominantStyle = styles[0] || "";
  const occ = ctx.occasions[0] || "";
  const variants = ["Look", "Outfit", "Combinazione", "Mise"];
  const base = variants[idx % variants.length];
  if (occ && dominantStyle) return `${base} ${dominantStyle} ${occ}`;
  if (dominantStyle) return `${base} ${dominantStyle}`;
  if (occ) return `${base} per ${occ}`;
  return `${base} #${idx + 1}`;
}

function _outfitDescription(b) {
  const parts = [];
  if (b.colors >= 20) parts.push("palette armonica");
  else if (b.colors >= 10) parts.push("colori abbinati");
  if (b.formality >= 12) parts.push("livello formalità coerente");
  if (b.season >= 15) parts.push("ideale per la stagione");
  if (b.style >= 10) parts.push("stile uniforme");
  if (b.anti_rep >= 6) parts.push("capi freschi non ripetuti");
  return parts.length ? parts.join(", ") : "buon mix degli elementi";
}
