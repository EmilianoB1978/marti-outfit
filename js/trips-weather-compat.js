// =============================================================================
// Compatibilità capo-clima: warning quando il capo nell'outfit del giorno
// non è coerente col meteo previsto
// =============================================================================
// Logica deterministica (no AI): tabella ranges per categoria/material/
// weight_class. Il profilo termico personale (thermal_offset) shifta
// le soglie.
// =============================================================================

// Range temperatura "comfort" per material (in °C)
// I valori indicano: sotto MIN il capo e' troppo leggero, sopra MAX troppo
// pesante. Margine ±2°C per non essere troppo restrittivi.
const MATERIAL_COMFORT = {
  // Estivi
  lino:        { min: 18, max: 99 },
  seta:        { min: 16, max: 30 },
  cotone:      { min: 12, max: 32 },
  jersey:      { min: 14, max: 30 },
  // Mezza stagione
  denim:       { min: 8,  max: 28 },
  maglia:      { min: 6,  max: 22 },
  velluto:     { min: 5,  max: 22 },
  sintetico:   { min: 0,  max: 30 },
  // Invernali
  lana:        { min: -10, max: 18 },
  cashmere:    { min: -10, max: 16 },
  pelle:       { min: -5,  max: 20 },
};

// Range per weight_class (peso del capo come 5 livelli)
const WEIGHT_COMFORT = {
  leggerissimo: { min: 18, max: 99 },
  leggero:      { min: 14, max: 32 },
  medio:        { min: 8,  max: 26 },
  pesante:      { min: -5, max: 20 },
  pesantissimo: { min: -20, max: 14 },
};

// Range per categoria (fallback se manca material/weight)
const CATEGORY_COMFORT = {
  capospalla:   { min: -20, max: 18 },  // un capospalla a 25° e' fuori posto
  scarpe:       { min: -20, max: 99 },  // scarpe sempre ok (sub-cat conta)
  vestito:      { min: 14, max: 32 },
  top:          { min: 10, max: 32 },
  bottom:       { min: 5,  max: 30 },
  accessori:    { min: -20, max: 99 },
  completo:     { min: 0,  max: 28 },
};

// Sottocategorie con range piu' specifici (override)
const SUBCATEGORY_COMFORT = {
  // Top estivi
  "t-shirt":     { min: 16, max: 99 },
  "canotta":     { min: 22, max: 99 },
  "crop top":    { min: 22, max: 99 },
  // Top invernali
  "maglione":    { min: -10, max: 16 },
  "cardigan":    { min: 8,  max: 22 },
  "dolcevita":   { min: -5, max: 16 },
  "felpa":       { min: 5,  max: 22 },
  // Bottom
  "shorts":      { min: 18, max: 99 },
  "bermuda":     { min: 18, max: 99 },
  "leggings":    { min: 5,  max: 24 },
  "jeans":       { min: 5,  max: 28 },
  // Capospalla
  "piumino":     { min: -20, max: 8 },
  "cappotto":    { min: -10, max: 12 },
  "trench":      { min: 6,  max: 18 },
  "blazer":      { min: 10, max: 24 },
  "bomber":      { min: 5,  max: 18 },
  // Scarpe
  "sandali":     { min: 22, max: 99 },
  "infradito":   { min: 25, max: 99 },
  "stivali":     { min: -20, max: 14 },
  "stivaletti":  { min: -5,  max: 18 },
  "ballerine":   { min: 14, max: 28 },
};

/**
 * Calcola il range "comfort" effettivo di un capo, combinando:
 * 1. sottocategoria (piu' specifica) se presente
 * 2. material (qualsiasi del array, prendiamo quello piu' restrittivo)
 * 3. weight_class
 * 4. categoria (fallback)
 *
 * Ritorna { min, max } in °C.
 */
export function itemComfortRange(item) {
  // Default ampio
  let min = -20, max = 99;

  // 1. Sottocategoria
  const sub = String(item.subcategory || "").toLowerCase().trim();
  if (sub && SUBCATEGORY_COMFORT[sub]) {
    return SUBCATEGORY_COMFORT[sub];
  }

  // 2. Categoria
  const cat = String(item.category || "").toLowerCase().trim();
  if (CATEGORY_COMFORT[cat]) {
    min = CATEGORY_COMFORT[cat].min;
    max = CATEGORY_COMFORT[cat].max;
  }

  // 3. Materiale (intersezione con range esistente — restringe sempre)
  const mats = Array.isArray(item.material) ? item.material : (item.material ? [item.material] : []);
  for (const m of mats) {
    const r = MATERIAL_COMFORT[String(m).toLowerCase()];
    if (r) {
      min = Math.max(min, r.min);
      max = Math.min(max, r.max);
    }
  }

  // 4. Weight class
  if (item.weight_class && WEIGHT_COMFORT[item.weight_class]) {
    const r = WEIGHT_COMFORT[item.weight_class];
    min = Math.max(min, r.min);
    max = Math.min(max, r.max);
  }

  return { min, max };
}

/**
 * Verifica se un capo e' compatibile col meteo del giorno.
 *
 * @param {object} item
 * @param {{tmin, tmax}} weather - meteo giornaliero (forecast o medie)
 * @param {number} thermalOffset - profilo termico utente (-3..+3)
 * @returns {{compatible:boolean, severity:'ok'|'too_light'|'too_heavy', message:string}}
 */
export function checkItemWeatherCompat(item, weather, thermalOffset = 0) {
  if (!weather || weather.tmin == null || weather.tmax == null) {
    return { compatible: true, severity: "ok", message: "" };
  }
  const range = itemComfortRange(item);
  // Profilo termico: freddolosa (-3) -> alza il min comfort di 3°
  // (vuoi capi piu' coprenti). caldolosa (+3) -> abbassa il max.
  const adjMin = range.min - thermalOffset;
  const adjMax = range.max - thermalOffset;

  // Confronta con la temp media del giorno
  const dayAvg = (weather.tmin + weather.tmax) / 2;

  if (dayAvg < adjMin - 2) {
    return {
      compatible: false,
      severity: "too_light",
      message: `Troppo leggero per ${Math.round(dayAvg)}°C`,
    };
  }
  if (dayAvg > adjMax + 2) {
    return {
      compatible: false,
      severity: "too_heavy",
      message: `Troppo pesante per ${Math.round(dayAvg)}°C`,
    };
  }
  return { compatible: true, severity: "ok", message: "" };
}

/**
 * Per ogni giorno del viaggio, ritorna l'array degli itemId problematici.
 * @returns {object} { "YYYY-MM-DD": [{itemId, severity, message}, ...] }
 */
export function buildCompatibilityMap(trip, items, weatherData) {
  const result = {};
  if (!weatherData) return result;

  const itemsById = new Map(items.map(i => [i.id, i]));
  const outfits = trip.outfits_by_day || {};
  const offset = Number(trip.thermal_offset) || 0;

  // Build lookup by date for forecast; per historical applichiamo a tutti i giorni
  let getWeatherForDate;
  if (weatherData.source === "forecast" && weatherData.daily) {
    const byDate = new Map(weatherData.daily.map(d => [d.date, d]));
    getWeatherForDate = (date) => byDate.get(date) || null;
  } else if (weatherData.source === "historical" && weatherData.historical) {
    const h = weatherData.historical;
    getWeatherForDate = () => ({ tmin: h.tmin_avg, tmax: h.tmax_avg });
  } else {
    return result;
  }

  for (const [date, itemIds] of Object.entries(outfits)) {
    const w = getWeatherForDate(date);
    if (!w) continue;
    const issues = [];
    for (const id of itemIds) {
      const item = itemsById.get(id);
      if (!item) continue;
      const c = checkItemWeatherCompat(item, w, offset);
      if (!c.compatible) issues.push({ itemId: id, ...c });
    }
    if (issues.length) result[date] = issues;
  }
  return result;
}
