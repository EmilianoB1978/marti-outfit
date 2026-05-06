// =============================================================================
// Trips outfit generator (deterministic, no AI)
// =============================================================================
// Genera outfit_by_day per un viaggio basandosi su:
//  - Stagione inferita dalle date del viaggio
//  - Occasioni dichiarate dal viaggio (round-robin sui giorni)
//  - Anti-ripetizione: capi pesati per uso (meno usato = piu' probabile)
//  - Compatibilita' formality / occasion del capo
//
// Algoritmo: PRNG seeded (mulberry32) -> stesso seed = stesso outfit, "shuffle"
// rigenera con seed nuovo. Risultato: { "YYYY-MM-DD": [item_id, ...], ... }
// =============================================================================

// Mappa occasione viaggio -> formality target (range)
const OCCASION_FORMALITY = {
  business:   { min: 3, max: 5, prefStyles: ["formale", "elegante"] },
  casual:     { min: 1, max: 3, prefStyles: ["casual", "streetwear"] },
  cena:       { min: 3, max: 5, prefStyles: ["elegante", "casual"] },
  cerimonia:  { min: 4, max: 5, prefStyles: ["formale", "elegante"] },
  mare:       { min: 1, max: 2, prefStyles: ["casual", "sportivo"] },
  montagna:   { min: 1, max: 3, prefStyles: ["sportivo", "casual"] },
  sport:      { min: 1, max: 2, prefStyles: ["sportivo"] },
  citta:      { min: 2, max: 4, prefStyles: ["casual", "elegante"] },
  avventura:  { min: 1, max: 2, prefStyles: ["sportivo", "casual"] },
  relax:      { min: 1, max: 2, prefStyles: ["casual"] },
};

const KIND_KEYS = {
  TOP:        ["top"],
  BOTTOM:     ["bottom"],
  SCARPE:     ["scarpe"],
  CAPOSPALLA: ["capospalla"],
  ACCESSORI:  ["accessori"],
  VESTITO:    ["vestito"],
  COMPLETO:   ["completo"],
};

// =============================================================================
// API pubblica
// =============================================================================

/**
 * @param {object} trip - { start_date, end_date, occasions, ... }
 * @param {array}  items - lista capi del guardaroba
 * @param {object} opts  - { seed?: number, excludeIds?: Set<string> }
 *   excludeIds: capi gia' "prenotati" da altri viaggi sovrapposti
 * @returns {object} { "YYYY-MM-DD": [itemId, ...], ... }
 */
export function generateTripOutfits(trip, items, opts = {}) {
  const seed = opts.seed || Date.now();
  const rng = mulberry32(seed);
  const excludeIds = opts.excludeIds || new Set();

  const tripSeasons = inferSeasons(trip.start_date);
  const occasions = (trip.occasions && trip.occasions.length) ? trip.occasions : ["casual"];

  // 1. Filtra capi che hanno foto, stagione compatibile e NON sono prenotati
  const candidates = items.filter(it => {
    if (!it.photo_url) return false;
    if (excludeIds.has(it.id)) return false;
    // Se il capo ha stagioni dichiarate, almeno una deve matchare
    if (Array.isArray(it.season) && it.season.length > 0) {
      return it.season.some(s => tripSeasons.includes(String(s).toLowerCase()));
    }
    return true;  // capo senza stagione = jolly, sempre ok
  });

  // 2. Bucket per categoria
  const buckets = makeBuckets(candidates);

  // 3. Lista giorni
  const days = listDays(trip.start_date, trip.end_date);

  // 4. Per ogni giorno: scegli occasione e componi outfit
  const used = new Map();   // item_id -> count globale (anti-ripetizione)
  const result = {};

  days.forEach((dayISO, idx) => {
    const occKey = pickOccasionForDay(occasions, idx);
    const items = composeOutfit(buckets, used, occKey, rng);
    result[dayISO] = items;
  });

  return { outfits: result, occasionByDay: buildOccasionMap(days, occasions) };
}

// =============================================================================
// Internals
// =============================================================================

function makeBuckets(items) {
  const out = { top: [], bottom: [], scarpe: [], capospalla: [], accessori: [], vestito: [], completo: [] };
  for (const it of items) {
    const cat = String(it.category || "").toLowerCase();
    if (out[cat]) out[cat].push(it);
  }
  return out;
}

function pickOccasionForDay(occasions, dayIdx) {
  return occasions[dayIdx % occasions.length];
}

function buildOccasionMap(days, occasions) {
  const m = {};
  days.forEach((d, i) => { m[d] = pickOccasionForDay(occasions, i); });
  return m;
}

/**
 * Compone un singolo outfit: top+bottom (o vestito/completo) + scarpe
 * + eventuale capospalla + eventuale accessorio.
 */
function composeOutfit(buckets, used, occKey, rng) {
  const out = [];
  const occMeta = OCCASION_FORMALITY[occKey] || OCCASION_FORMALITY.casual;

  // Filter pool by formality + style preference
  const filtered = filterByOccasion(buckets, occMeta);

  // Decisione struttura: vestito unico (30%) | completo (50% se business/cerimonia) | top+bottom
  let pickedBase = false;

  if (filtered.completo.length > 0 && (occKey === "business" || occKey === "cerimonia") && rng() < 0.5) {
    const it = pickWeighted(filtered.completo, used, rng);
    if (it) { out.push(it); pickedBase = true; }
  }
  if (!pickedBase && filtered.vestito.length > 0 && rng() < 0.30) {
    const it = pickWeighted(filtered.vestito, used, rng);
    if (it) { out.push(it); pickedBase = true; }
  }
  if (!pickedBase) {
    if (filtered.top.length > 0)    out.push(pickWeighted(filtered.top, used, rng));
    if (filtered.bottom.length > 0) out.push(pickWeighted(filtered.bottom, used, rng));
  }

  // Scarpe
  if (filtered.scarpe.length > 0) {
    const sh = pickWeighted(filtered.scarpe, used, rng);
    if (sh) out.push(sh);
  }

  // Capospalla (40% prob)
  if (filtered.capospalla.length > 0 && rng() < 0.40) {
    const cs = pickWeighted(filtered.capospalla, used, rng);
    if (cs) out.push(cs);
  }

  // Accessorio (30% prob)
  if (filtered.accessori.length > 0 && rng() < 0.30) {
    const ac = pickWeighted(filtered.accessori, used, rng);
    if (ac) out.push(ac);
  }

  // Conta gli usi
  for (const it of out) {
    if (!it) continue;
    used.set(it.id, (used.get(it.id) || 0) + 1);
  }
  return out.filter(Boolean).map(it => it.id);
}

/**
 * Filtra ogni bucket per compatibilita' con l'occasione (formality+style).
 * Se il filtro lascia vuoto, fallback al bucket originale.
 */
function filterByOccasion(buckets, occMeta) {
  const out = {};
  for (const key of Object.keys(buckets)) {
    const all = buckets[key];
    const filtered = all.filter(it => isCompatible(it, occMeta));
    out[key] = filtered.length ? filtered : all;
  }
  return out;
}

function isCompatible(item, occMeta) {
  // Formality range
  if (item.formality && (item.formality < occMeta.min || item.formality > occMeta.max)) {
    return false;
  }
  // Style preferenze (soft check: se il capo ha uno style diverso dai preferiti
  // ma non e' duro mismatch, ammettiamo)
  if (item.style && occMeta.prefStyles.length) {
    const itStyle = String(item.style).toLowerCase();
    if (!occMeta.prefStyles.includes(itStyle)) {
      // Soft: -1 punto ma non escluso. Per ora ammettiamo, il pickWeighted
      // dara' lievi preferenze attraverso 'used' counter.
    }
  }
  return true;
}

/**
 * Sceglie un capo dal pool con peso = 1 / (1 + countUsato).
 * Capi mai usati hanno peso 1, usati 1 volta peso 0.5, ecc. -> rotazione.
 */
function pickWeighted(pool, used, rng) {
  if (!pool || pool.length === 0) return null;
  const weights = pool.map(it => 1 / (1 + (used.get(it.id) || 0)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pool[0];
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// =============================================================================
// Date utilities
// =============================================================================
function listDays(startISO, endISO) {
  const out = [];
  if (!startISO || !endISO) return out;
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Inferisce le 8 stagioni di Marty compatibili con la data nord-emisfero.
 * Multi-stagione = mese di transizione include anche la mezza stagione adiacente.
 */
function inferSeasons(startISO) {
  if (!startISO) return ["primavera", "estate", "autunno", "inverno"];
  const m = new Date(startISO + "T00:00:00").getMonth() + 1;
  if (m === 12 || m === 1)        return ["inverno", "autinverno", "inveravera"];
  if (m === 2)                    return ["inverno", "inveravera"];
  if (m === 3)                    return ["inveravera", "primavera"];
  if (m === 4 || m === 5)         return ["primavera", "primestate"];
  if (m === 6)                    return ["primestate", "estate"];
  if (m === 7 || m === 8)         return ["estate", "estunno"];
  if (m === 9)                    return ["estunno", "autunno"];
  if (m === 10 || m === 11)       return ["autunno", "autinverno"];
  return ["primavera", "estate", "autunno", "inverno"];
}

/**
 * Mulberry32 PRNG seedabile (deterministico).
 */
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================================
// Rigenerazione di un singolo giorno
// =============================================================================
/**
 * Rigenera SOLO l'outfit di un giorno mantenendo gli altri.
 */
export function regenerateDay(trip, items, dayISO, currentOutfits, opts = {}) {
  const seed = opts.seed || Date.now();
  const rng = mulberry32(seed);
  const excludeIds = opts.excludeIds || new Set();
  const tripSeasons = inferSeasons(trip.start_date);
  const candidates = items.filter(it => {
    if (!it.photo_url) return false;
    if (excludeIds.has(it.id)) return false;
    if (Array.isArray(it.season) && it.season.length > 0) {
      return it.season.some(s => tripSeasons.includes(String(s).toLowerCase()));
    }
    return true;
  });
  const buckets = makeBuckets(candidates);
  const occasions = (trip.occasions && trip.occasions.length) ? trip.occasions : ["casual"];
  const days = listDays(trip.start_date, trip.end_date);
  const dayIdx = days.indexOf(dayISO);
  const occKey = pickOccasionForDay(occasions, dayIdx);

  // Conta usi degli altri giorni per anti-ripetizione
  const used = new Map();
  for (const [d, ids] of Object.entries(currentOutfits || {})) {
    if (d === dayISO) continue;
    for (const id of ids) used.set(id, (used.get(id) || 0) + 1);
  }
  return composeOutfit(buckets, used, occKey, rng);
}
