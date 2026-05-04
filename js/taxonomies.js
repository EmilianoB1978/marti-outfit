// =============================================================================
// Taxonomies: gestione valori personalizzabili (categorie, colori, pattern...)
// =============================================================================
// Storage: documento singolo Firestore 'settings/taxonomies' con tutti i valori.
// Cache in memoria, sync su tutti i device.
// =============================================================================

import {
  db,
  doc, getDoc, setDoc, serverTimestamp,
} from "./firebase-config.js";

const DOC_PATH = ["settings", "taxonomies"];

// =============================================================================
// Default values (built-in seed)
// =============================================================================
export const DEFAULT_TAXONOMIES = {
  categories: [
    { value: "top",        label: "Top",        icon: "👕", builtIn: true },
    { value: "bottom",     label: "Bottom",     icon: "👖", builtIn: true },
    { value: "scarpe",     label: "Scarpe",     icon: "👟", builtIn: true },
    { value: "accessori",  label: "Accessori",  icon: "👜", builtIn: true },
    { value: "capospalla", label: "Capospalla", icon: "🧥", builtIn: true },
    { value: "completo",   label: "Completo",   icon: "🤵", builtIn: true },
  ],
  subcategories: [
    "t-shirt","camicia","polo","felpa","maglione","gilet","top",
    "jeans","pantaloni","chinos","leggings","gonna","shorts",
    "sneakers","stivali","mocassini","sandali","scarpe eleganti",
    "cappello","sciarpa","cintura","borsa","occhiali","orologio",
    "blazer","giacca","cappotto","piumino","trench",
    "abito","completo",
  ],
  colors: [
    "bianco","nero","grigio","beige","panna","crema",
    "blu navy","blu","azzurro","celeste",
    "rosso","bordeaux","rosa","fucsia",
    "verde","verde oliva","verde salvia","verde militare",
    "giallo","arancione","senape","ocra",
    "marrone","cammello","cuoio","testa di moro",
    "viola","lilla","prugna",
    "denim","denim chiaro","denim scuro",
  ],
  patterns: [
    "tinta unita","righe","quadri","floreale","denim",
    "grafico","animalier","pois","tartan","houndstooth","altro",
  ],
  materials: [
    "cotone","denim","lana","pelle","lino","sintetico",
    "cashmere","seta","maglia","velluto","jersey","altro",
  ],
  styles: [
    "casual","elegante","sportivo","formale","streetwear",
    "boho","minimal","preppy","grunge","vintage",
  ],
  seasons: [
    "primavera","estate","autunno","inverno",
  ],
  occasions: [
    "lavoro","aperitivo","cena","sport","weekend","viaggio",
    "casa","sera","gala","cerimonia","mare","montagna",
  ],
};

// Tassonomie strutturate (con value/label/icon/builtIn) vs semplici (string[])
const STRUCTURED = ["categories"];

// =============================================================================
// Cache in memoria (singleton)
// =============================================================================
let _cache = null;
let _loadPromise = null;

/**
 * Carica le tassonomie da Firestore. Se non esistono, le inizializza con i
 * default (e con i valori gia' usati dai capi esistenti se passati).
 * @param {Array} existingItems - opzionale, capi gia' nel guardaroba per migrare
 */
export async function load(existingItems = null) {
  if (_cache) return _cache;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const ref = doc(db, ...DOC_PATH);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      _cache = snap.data();
      // Sanity: se manca qualche tassonomia (es. nuove aggiunte in futuro), la riempio
      let needsSave = false;
      for (const key of Object.keys(DEFAULT_TAXONOMIES)) {
        if (!_cache[key]) {
          _cache[key] = [...DEFAULT_TAXONOMIES[key]];
          needsSave = true;
        }
      }
      if (needsSave) await persist();
    } else {
      // Prima volta: creo dal default + capi esistenti
      _cache = JSON.parse(JSON.stringify(DEFAULT_TAXONOMIES));

      if (existingItems && existingItems.length > 0) {
        addFromItems(existingItems);
      }

      await persist();
    }

    return _cache;
  })();

  return _loadPromise;
}

/** Forza un reload da Firestore (usato dopo modifiche cross-device). */
export async function reload() {
  _cache = null;
  _loadPromise = null;
  return load();
}

/** Snapshot delle tassonomie in cache. */
export function get() {
  return _cache || JSON.parse(JSON.stringify(DEFAULT_TAXONOMIES));
}

/** Lista valori di una taxonomy (string[] per le semplici, oggetti per categories). */
export function listValues(taxonomy) {
  const t = get()[taxonomy];
  return Array.isArray(t) ? [...t] : [];
}

/** Lista solo i value (string) per dropdown/select. */
export function listSimpleValues(taxonomy) {
  const t = listValues(taxonomy);
  if (STRUCTURED.includes(taxonomy)) return t.map(x => x.value);
  return t;
}

/** Lista label per il display (usata in UI). */
export function listLabels(taxonomy) {
  const t = listValues(taxonomy);
  if (STRUCTURED.includes(taxonomy)) return t.map(x => x.label);
  return t;
}

// =============================================================================
// Modifiche
// =============================================================================

/** Aggiunge un valore se non esiste (case-insensitive). Ritorna true se aggiunto. */
export async function addValue(taxonomy, value) {
  if (!value || !taxonomy || !_cache) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;

  if (STRUCTURED.includes(taxonomy)) {
    const exists = _cache[taxonomy].some(x => x.value.toLowerCase() === trimmed.toLowerCase());
    if (exists) return false;
    _cache[taxonomy].push({
      value: trimmed.toLowerCase().replace(/\s+/g, "_"),
      label: trimmed,
      icon: "🏷️",
      builtIn: false,
    });
  } else {
    const lower = trimmed.toLowerCase();
    if (_cache[taxonomy].some(v => v.toLowerCase() === lower)) return false;
    _cache[taxonomy].push(trimmed);
  }

  await persist();
  return true;
}

/** Rinomina un valore esistente. Per categories rinomina solo il label. */
export async function renameValue(taxonomy, oldValue, newValue) {
  if (!_cache || !oldValue || !newValue) return false;
  const trimmed = String(newValue).trim();
  if (!trimmed) return false;

  if (STRUCTURED.includes(taxonomy)) {
    const item = _cache[taxonomy].find(x => x.value === oldValue);
    if (!item) return false;
    item.label = trimmed;
  } else {
    const idx = _cache[taxonomy].findIndex(v => v === oldValue);
    if (idx === -1) return false;
    _cache[taxonomy][idx] = trimmed;
  }

  await persist();
  return true;
}

/** Elimina un valore. */
export async function removeValue(taxonomy, value) {
  if (!_cache) return false;
  if (STRUCTURED.includes(taxonomy)) {
    _cache[taxonomy] = _cache[taxonomy].filter(x => x.value !== value);
  } else {
    _cache[taxonomy] = _cache[taxonomy].filter(v => v !== value);
  }
  await persist();
  return true;
}

/** Riordina (riceve nuova lista nello stesso formato). */
export async function reorder(taxonomy, newList) {
  if (!_cache || !Array.isArray(newList)) return false;
  _cache[taxonomy] = newList;
  await persist();
  return true;
}

/**
 * Cerca nei capi esistenti valori non ancora in tassonomia e li aggiunge.
 * Utile per la migrazione iniziale.
 */
function addFromItems(items) {
  if (!_cache) return;
  const collect = (key) => new Set();
  const found = {
    subcategories: new Set(),
    colors: new Set(),
    patterns: new Set(),
    materials: new Set(),
    styles: new Set(),
    occasions: new Set(),
  };
  for (const it of items) {
    if (it.subcategory)     found.subcategories.add(it.subcategory.trim());
    if (it.color)           found.colors.add(it.color.trim());
    if (it.color_primary)   found.colors.add(it.color_primary.trim());
    if (it.color_secondary) found.colors.add(it.color_secondary.trim());
    if (it.pattern)         found.patterns.add(it.pattern.trim());
    if (it.material)        found.materials.add(it.material.trim());
    if (it.style)           found.styles.add(it.style.trim());
    if (it.occasion) {
      // L'occasione e' un campo libero che puo' contenere virgole
      it.occasion.split(",").forEach(o => {
        const t = o.trim();
        if (t) found.occasions.add(t);
      });
    }
  }
  for (const [tax, set] of Object.entries(found)) {
    set.forEach(v => {
      if (!v) return;
      const lower = v.toLowerCase();
      if (!_cache[tax].some(x => String(x).toLowerCase() === lower)) {
        _cache[tax].push(v);
      }
    });
  }
}

// =============================================================================
// Persistenza
// =============================================================================
async function persist() {
  if (!_cache) return;
  const ref = doc(db, ...DOC_PATH);
  await setDoc(ref, { ..._cache, updated_at: serverTimestamp() });
}
