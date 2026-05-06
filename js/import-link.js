// =============================================================================
// Import capo da link prodotto e-commerce
// =============================================================================
// Tap "🔗 Importa da link" -> textarea per URL -> chiama Worker /scrape
// (estrae JSON-LD/OpenGraph) -> precompila campi modal capo + scarica foto.
//
// Senza AI: solo metadata strutturate. Sufficiente per Zalando, Zara, H&M,
// Mango, COS, Asos e tutti gli e-commerce che pubblicano schema.org/Product.
// =============================================================================

const WORKER_URL = "https://marty-outfit-proxy.e-barbierato.workers.dev";

/**
 * Estrae URL valido dal testo (pulisce spazi, cerca primo http*).
 */
export function extractUrl(text) {
  if (!text) return null;
  const m = String(text).match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

/**
 * Tenta lettura clipboard (richiede gesture utente). Ritorna stringa o null.
 */
export async function tryReadClipboard() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) return null;
    const txt = await navigator.clipboard.readText();
    return txt || null;
  } catch {
    return null;
  }
}

/**
 * Chiama il worker per estrarre i metadati del prodotto.
 * @returns {Promise<{title, description, image_url, price, currency, brand, color, material, source_url}>}
 */
export async function scrapeProduct(url) {
  const r = await fetch(`${WORKER_URL}/scrape?url=${encodeURIComponent(url)}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: "Errore sconosciuto" }));
    throw new Error(err.error || `HTTP ${r.status}`);
  }
  return await r.json();
}

/**
 * Scarica un'immagine via worker (bypass CORS) e ritorna un Blob.
 */
export async function fetchImageBlob(imageUrl) {
  const r = await fetch(`${WORKER_URL}/scrape-image?url=${encodeURIComponent(imageUrl)}`);
  if (!r.ok) throw new Error("Immagine non scaricabile");
  return await r.blob();
}

// =============================================================================
// Mapping euristico: mappa metadati grezzi -> campi normalizzati Trama
// (categoria, sub, ecc.). Senza AI -> regex-based su title + description.
// =============================================================================

const KEYWORD_MAP = {
  category: [
    // Ordine importa: pattern piu' specifici prima
    [["completo", "tailleur", "smoking"],                                       "completo"],
    [["abito", "vestito", "tubino"],                                            "vestito"],
    [["sneakers", "stivali", "stivaletti", "mocassini", "sandali", "decollet", "ballerine", "tacchi", "infradito", "espadrillas", "scarpa"],   "scarpe"],
    [["jeans", "pantalone", "pantaloni", "leggings", "shorts", "bermuda", "gonna", "chinos"], "bottom"],
    [["blazer", "giacca", "cappotto", "piumino", "trench", "bomber", "parka", "spolverino", "kimono"],                                          "capospalla"],
    [["t-shirt", "tshirt", "camicia", "camicetta", "polo", "felpa", "maglione", "cardigan", "gilet", "top ", "dolcevita", "blusa", "tunica", "canotta"], "top"],
    [["cappello", "berretto", "sciarpa", "foulard", "cintura", "borsa", "borsetta", "zaino", "occhiali", "orologio", "guanti", "gioiello"],     "accessori"],
  ],
  subcategory: [
    // Stesse keyword ma valori specifici (sub)
    ["t-shirt", "t-shirt"], ["tshirt", "t-shirt"],
    ["camicetta", "camicetta"], ["camicia", "camicia"],
    ["polo", "polo"], ["felpa", "felpa"],
    ["maglione", "maglione"], ["cardigan", "cardigan"],
    ["gilet", "gilet"], ["dolcevita", "dolcevita"],
    ["jeans", "jeans"], ["chinos", "chinos"],
    ["leggings", "leggings"], ["pantalone", "pantaloni"], ["pantaloni", "pantaloni"],
    ["shorts", "shorts"], ["bermuda", "bermuda"], ["gonna", "gonna"],
    ["sneakers", "sneakers"], ["stivaletti", "stivaletti"], ["stivali", "stivali"],
    ["mocassini", "mocassini"], ["sandali", "sandali"],
    ["decollet", "decolleté"], ["ballerine", "ballerine"], ["tacchi", "tacchi"],
    ["infradito", "infradito"], ["espadrillas", "espadrillas"],
    ["abito lungo", "abito lungo"], ["abito corto", "abito corto"],
    ["abito midi", "abito midi"], ["tubino", "tubino"], ["abito", "abito casual"],
    ["blazer", "blazer"], ["giacca", "giacca"], ["cappotto", "cappotto"],
    ["piumino", "piumino"], ["trench", "trench"], ["bomber", "bomber"],
    ["parka", "parka"],
    ["cappello", "cappello"], ["berretto", "berretto"],
    ["sciarpa", "sciarpa"], ["foulard", "foulard"],
    ["cintura", "cintura"], ["borsetta", "borsetta"], ["borsa", "borsa"],
    ["zaino", "zaino"], ["occhiali", "occhiali"], ["orologio", "orologio"],
    ["guanti", "guanti"],
  ],
  material: [
    ["lana scuro", "lana"],   // alcune denominazioni Zalando
    ["cashmere", "cashmere"], ["lana", "lana"],
    ["cotone", "cotone"], ["denim", "denim"],
    ["pelle ecologica", "sintetico"], ["pelle", "pelle"],
    ["lino", "lino"], ["seta", "seta"], ["velluto", "velluto"],
    ["jersey", "jersey"], ["maglia", "maglia"],
  ],
  pattern: [
    ["righe", "righe"], ["a righe", "righe"],
    ["floreale", "floreale"], ["fiori", "floreale"],
    ["quadri", "quadri"], ["a quadri", "quadri"],
    ["denim", "denim"],
    ["animalier", "animalier"], ["leopard", "animalier"],
    ["pois", "pois"], ["tartan", "tartan"],
    ["tinta unita", "tinta unita"], ["solid", "tinta unita"],
  ],
  colors: [
    "bianco", "nero", "grigio", "beige", "panna", "crema",
    "blu navy", "blu", "azzurro", "celeste",
    "rosso", "bordeaux", "rosa", "fucsia",
    "verde", "verde oliva", "verde salvia", "verde militare",
    "giallo", "arancione", "senape", "ocra",
    "marrone", "cammello", "cuoio",
    "viola", "lilla", "prugna",
    "denim", "oro", "argento",
  ],
};

/**
 * Mappa i metadati grezzi del worker ai campi del modal capo.
 * @param {object} raw - oggetto da scrapeProduct
 * @returns {object} { category, subcategory, color_primary, color_secondary,
 *   material, pattern, price, link_url, notes, _suggestedTitle }
 */
export function mapRawToFields(raw) {
  const text = `${raw.title || ""} ${raw.description || ""}`.toLowerCase();
  const out = {
    category: null,
    subcategory: null,
    color_primary: null,
    color_secondary: null,
    material: raw.material ? raw.material.toLowerCase() : null,
    pattern: null,
    price: typeof raw.price === "number" && !isNaN(raw.price) ? raw.price : null,
    link_url: raw.source_url,
    notes: buildNotesFromRaw(raw),
    _suggestedTitle: raw.title || null,
    _imageUrl: raw.image_url || null,
  };

  // Categoria
  for (const [keys, cat] of KEYWORD_MAP.category) {
    if (keys.some(k => text.includes(k))) { out.category = cat; break; }
  }

  // Sotto-categoria (prendi il primo match)
  for (const [k, sub] of KEYWORD_MAP.subcategory) {
    if (text.includes(k)) { out.subcategory = sub; break; }
  }

  // Colori: dato JSON-LD raw.color (priorita') -> normalizza
  if (raw.color) {
    const cLower = String(raw.color).toLowerCase();
    out.color_primary = matchColor(cLower) || cLower;
  } else {
    out.color_primary = matchColor(text);
  }

  // Materiale (se non gia' da JSON-LD): cerca nel testo
  if (!out.material) {
    for (const [k, mat] of KEYWORD_MAP.material) {
      if (text.includes(k)) { out.material = mat; break; }
    }
  } else {
    // Normalizza: se contiene "lana" usa "lana", ecc.
    for (const [k, mat] of KEYWORD_MAP.material) {
      if (out.material.includes(k)) { out.material = mat; break; }
    }
  }

  // Pattern
  for (const [k, p] of KEYWORD_MAP.pattern) {
    if (text.includes(k)) { out.pattern = p; break; }
  }

  return out;
}

function matchColor(text) {
  const lc = text.toLowerCase();
  // Prova prima i colori composti (es. "blu navy" prima di "blu")
  const ordered = [...KEYWORD_MAP.colors].sort((a, b) => b.length - a.length);
  for (const c of ordered) {
    if (lc.includes(c)) return c;
  }
  return null;
}

function buildNotesFromRaw(raw) {
  const parts = [];
  if (raw.brand) parts.push(`Brand: ${raw.brand}`);
  if (raw.title) parts.push(raw.title);
  if (raw.description && raw.description.length > 0 && raw.description !== raw.title) {
    parts.push(raw.description.slice(0, 200));
  }
  return parts.join(" · ") || null;
}
