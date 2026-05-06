// =============================================================================
// Outfit del giorno: algoritmo deterministico (no AI, niente costi)
// =============================================================================
// Stessa data = stesso suggerimento. Pesato per:
// - capi non indossati da molto (boost)
// - stagione corrente (filtro)
// - meteo (se configurato): se pioggia, evita scarpe in tela
// - capi mai indossati hanno priorita' (rotation)
// =============================================================================

import * as Weather from "./weather.js";

const STORAGE_KEY_DISMISSED = "marty_today_dismissed";

/**
 * Random seedato dalla data corrente (stessa data = stessa sequenza).
 * Mulberry32 PRNG.
 */
function seededRandom(seed) {
  let a = seed;
  return function() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Da Date a int (es. 20260505) usabile come seed */
function dateSeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Stagione corrente (mese-based, semplice) */
function currentSeason(date = new Date()) {
  const m = date.getMonth();
  if (m >= 2 && m <= 4) return "primavera";
  if (m >= 5 && m <= 7) return "estate";
  if (m >= 8 && m <= 10) return "autunno";
  return "inverno";
}

/**
 * Calcola peso di un item per il pick.
 * Pesi piu' alti = piu' probabile essere scelto.
 */
function itemWeight(item, season, weather) {
  let weight = 1;

  // Boost per capi non indossati o non indossati da molto
  const wears = item.wear_count || 0;
  if (wears === 0) weight *= 3;
  else if (item.last_worn_at) {
    const days = (Date.now() - Date.parse(item.last_worn_at)) / 86400000;
    if (days > 60) weight *= 2.5;
    else if (days > 30) weight *= 1.8;
    else if (days < 3) weight *= 0.3;  // appena indossato, riduce
  }

  // Filtro stagione (penalizza se la stagione corrente non e' tra le sue)
  const seasons = Array.isArray(item.season) ? item.season : [];
  if (seasons.length > 0 && !seasons.includes(season)) {
    weight *= 0.2;
  }

  // Meteo (se configurato e c'e' pioggia, penalizza materiali "leggeri")
  if (weather && weather.daily?.precipitation > 1) {
    const mats = Array.isArray(item.material) ? item.material : (item.material ? [item.material] : []);
    if (mats.includes("lino") || mats.includes("seta")) weight *= 0.4;
    if (item.subcategory === "sandali") weight *= 0.1;
    if (item.subcategory === "ballerine") weight *= 0.5;
  }

  return Math.max(0.05, weight);
}

/** Pesca random pesata da un array */
function weightedPick(rng, candidates, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Genera l'outfit del giorno (deterministico).
 * @param {Array} items - tutti i capi del guardaroba
 * @param {Date} date - data per il seed (default oggi)
 * @returns {Array} item dell'outfit
 */
export async function getTodayOutfit(items, date = new Date()) {
  if (!items || items.length === 0) return [];

  const rng = seededRandom(dateSeed(date));
  const season = currentSeason(date);

  // Carica meteo (se configurato)
  let weather = null;
  const loc = Weather.getCachedLocation();
  if (loc) {
    try { weather = await Weather.getForecast(loc); } catch {}
  }

  // Pesco categoria per categoria
  const result = [];

  // Caso 1: 30% chance di iniziare con vestito o completo
  const vestiti = items.filter(it => it.category === "vestito" || it.category === "completo");
  if (vestiti.length > 0 && rng() < 0.3) {
    const ws = vestiti.map(it => itemWeight(it, season, weather));
    const v = weightedPick(rng, vestiti, ws);
    if (v) result.push(v);
  } else {
    // Caso 2: top + bottom
    const tops = items.filter(it => it.category === "top");
    if (tops.length > 0) {
      const ws = tops.map(it => itemWeight(it, season, weather));
      const t = weightedPick(rng, tops, ws);
      if (t) result.push(t);
    }
    const bottoms = items.filter(it => it.category === "bottom");
    if (bottoms.length > 0) {
      const ws = bottoms.map(it => itemWeight(it, season, weather));
      const b = weightedPick(rng, bottoms, ws);
      if (b) result.push(b);
    }
  }

  // Scarpe sempre
  const scarpe = items.filter(it => it.category === "scarpe");
  if (scarpe.length > 0) {
    const ws = scarpe.map(it => itemWeight(it, season, weather));
    const s = weightedPick(rng, scarpe, ws);
    if (s) result.push(s);
  }

  // Capospalla se autunno/inverno o pioggia
  const isCold = season === "autunno" || season === "inverno";
  const wantsOuter = isCold || (weather && weather.daily?.precipitation > 0.5);
  if (wantsOuter) {
    const outerwear = items.filter(it => it.category === "capospalla");
    if (outerwear.length > 0) {
      const ws = outerwear.map(it => itemWeight(it, season, weather));
      const o = weightedPick(rng, outerwear, ws);
      if (o) result.push(o);
    }
  }

  // 50% chance di accessorio
  if (rng() < 0.5) {
    const accessori = items.filter(it => it.category === "accessori");
    if (accessori.length > 0) {
      const ws = accessori.map(it => itemWeight(it, season, weather));
      const a = weightedPick(rng, accessori, ws);
      if (a) result.push(a);
    }
  }

  return result;
}

// =============================================================================
// Dismiss state (la card si nasconde finche' la data non cambia)
// =============================================================================

/** True se l'utente ha dismissato l'outfit di oggi */
export function isDismissedToday() {
  const stored = localStorage.getItem(STORAGE_KEY_DISMISSED);
  if (!stored) return false;
  const today = dateSeed();
  return parseInt(stored) === today;
}

/** Marca l'outfit di oggi come dismissato (la card non si rimostra fino a domani) */
export function dismissToday() {
  localStorage.setItem(STORAGE_KEY_DISMISSED, String(dateSeed()));
}

/** Cancella il dismiss (per testing/refresh manuale) */
export function clearDismiss() {
  localStorage.removeItem(STORAGE_KEY_DISMISSED);
}
