// =============================================================================
// Background library per outfit foto
// =============================================================================
// Catalogo di sfondi via Unsplash CDN per la modalità "Carica foto outfit".
// Quando l'utente carica una foto di Martina vestita, dopo bg-removal puo'
// scegliere uno di questi sfondi per il composite finale.
//
// Le URL puntano direttamente al CDN Unsplash (images.unsplash.com) che
// supporta CORS (Access-Control-Allow-Origin: *), quindi le immagini
// possono essere disegnate su canvas senza problemi di "tainted canvas".
//
// Formato URL: https://images.unsplash.com/photo-{id}?w=1200&h=1500&fit=crop&q=80
// (crop verticale 4:5 ottimizzato per ritratto outfit a figura intera)
//
// Categorie con icona + tag occasione/stile per filtraggio futuro.
// =============================================================================

const W = 1200, H = 1500;
function unsplashUrl(id, w = W, h = H) {
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=80`;
}
function thumbUrl(id) {
  return unsplashUrl(id, 400, 500);
}

export const BACKGROUND_CATEGORIES = [
  { key: "mare",     icon: "🏖️", label: "Mare / Spiaggia" },
  { key: "montagna", icon: "🏔️", label: "Montagna" },
  { key: "natura",   icon: "🌳", label: "Natura / Parco" },
  { key: "citta",    icon: "🏙️", label: "Città" },
  { key: "ufficio",  icon: "💼", label: "Ufficio / Business" },
  { key: "casa",     icon: "🏠", label: "Casa / Domestico" },
  { key: "ristorante", icon: "🍽️", label: "Ristorante / Cena" },
  { key: "festa",    icon: "🎉", label: "Festa / Drink" },
  { key: "cafe",     icon: "☕", label: "Café / Aperitivo" },
  { key: "shopping", icon: "🛍️", label: "Shopping / Centro" },
];

/**
 * Lista degli sfondi disponibili. Ogni voce:
 *   - id:       Unsplash photo ID (parte dopo "photo-")
 *   - category: chiave da BACKGROUND_CATEGORIES
 *   - label:    breve descrizione italiana
 *   - occasions: array di occasion compatibili (per filtraggio)
 *   - styles:    array di style compatibili
 *
 * Ogni URL viene generata via unsplashUrl(id) on-demand.
 */
const PHOTOS = [
  // ====== Mare / Spiaggia ======
  { id: "1507525428034-b723cf961d3e", category: "mare", label: "Spiaggia caraibica", occasions: ["vacanza", "mare", "aperitivo"], styles: ["casual"] },
  { id: "1519046904884-53103b34b206", category: "mare", label: "Mare turchese", occasions: ["vacanza", "mare"], styles: ["casual"] },
  { id: "1473496169904-658ba7c44d8a", category: "mare", label: "Palmeti tropicali", occasions: ["vacanza", "mare"], styles: ["casual"] },
  { id: "1502082553048-f009c37129b9", category: "mare", label: "Oceano roccioso", occasions: ["vacanza", "mare"], styles: ["casual"] },
  { id: "1454391304352-2bf4678b1a7a", category: "mare", label: "Pier sul mare", occasions: ["vacanza", "aperitivo"], styles: ["casual"] },

  // ====== Montagna ======
  { id: "1464822759023-fed622ff2c3b", category: "montagna", label: "Vetta panoramica", occasions: ["vacanza", "trekking"], styles: ["casual", "sportivo"] },
  { id: "1454496522488-7a8e488e8606", category: "montagna", label: "Lago alpino", occasions: ["vacanza", "trekking"], styles: ["casual", "sportivo"] },
  { id: "1483728642387-6c3bdd6c93e5", category: "montagna", label: "Picchi al tramonto", occasions: ["vacanza", "trekking"], styles: ["casual"] },
  { id: "1506905925346-21bda4d32df4", category: "montagna", label: "Montagna all'alba", occasions: ["vacanza", "trekking"], styles: ["casual"] },
  { id: "1519681393784-d120267933ba", category: "montagna", label: "Vetta innevata", occasions: ["vacanza", "neve"], styles: ["casual", "sportivo"] },

  // ====== Natura / Parco ======
  { id: "1441974231531-c6227db76b6e", category: "natura", label: "Bosco luce", occasions: ["weekend", "passeggiata"], styles: ["casual"] },
  { id: "1518495973542-4542c06a5843", category: "natura", label: "Foresta verde", occasions: ["weekend", "passeggiata"], styles: ["casual"] },
  { id: "1469474968028-56623f02e42e", category: "natura", label: "Campagna soleggiata", occasions: ["weekend", "picnic"], styles: ["casual"] },
  { id: "1499529112087-3cb3b73cec95", category: "natura", label: "Vialetto del parco", occasions: ["weekend", "passeggiata"], styles: ["casual"] },
  { id: "1497436072909-60f360e1d4b1", category: "natura", label: "Lago sereno", occasions: ["weekend", "vacanza"], styles: ["casual"] },

  // ====== Città ======
  { id: "1480714378408-67cf0d13bc1b", category: "citta", label: "Skyline notturno", occasions: ["aperitivo", "cena", "evento"], styles: ["elegante", "casual"] },
  { id: "1502602898657-3e91760cbb34", category: "citta", label: "Parigi", occasions: ["vacanza", "weekend"], styles: ["elegante", "casual"] },
  { id: "1499856871958-5b9627545d1a", category: "citta", label: "Strada al crepuscolo", occasions: ["aperitivo", "weekend"], styles: ["casual", "elegante"] },
  { id: "1518684079-3c830dcef090",    category: "citta", label: "Milano architettura", occasions: ["lavoro", "weekend"], styles: ["elegante"] },
  { id: "1513635269975-59663e0ac1ad", category: "citta", label: "Londra centro", occasions: ["vacanza", "weekend"], styles: ["casual", "elegante"] },

  // ====== Ufficio / Business ======
  { id: "1497366216548-37526070297c", category: "ufficio", label: "Ufficio moderno", occasions: ["lavoro", "meeting"], styles: ["formale", "elegante"] },
  { id: "1497366811353-6870744d04b2", category: "ufficio", label: "Scrivania workstation", occasions: ["lavoro"], styles: ["formale", "casual"] },
  { id: "1521737604893-d14cc237f11d", category: "ufficio", label: "Open space", occasions: ["lavoro", "meeting"], styles: ["formale", "elegante"] },
  { id: "1556761175-5973dc0f32e7",    category: "ufficio", label: "Sala riunioni", occasions: ["lavoro", "meeting", "evento"], styles: ["formale", "elegante"] },
  { id: "1497032628192-86f99bcd76bc", category: "ufficio", label: "Corridoio uffici", occasions: ["lavoro"], styles: ["formale", "elegante"] },

  // ====== Casa / Domestico ======
  { id: "1502672260266-1c1ef2d93688", category: "casa", label: "Salotto moderno", occasions: ["casa", "weekend"], styles: ["casual"] },
  { id: "1493663284031-b7e3aefcae8e", category: "casa", label: "Cucina luminosa", occasions: ["casa", "weekend"], styles: ["casual"] },
  { id: "1493809842364-78817add7ffb", category: "casa", label: "Living confortevole", occasions: ["casa"], styles: ["casual"] },
  { id: "1505691938895-1758d7feb511", category: "casa", label: "Camera arredata", occasions: ["casa"], styles: ["casual"] },
  { id: "1556228720-195a672e8a03",    category: "casa", label: "Interno scandi", occasions: ["casa", "weekend"], styles: ["casual"] },

  // ====== Ristorante / Cena ======
  { id: "1414235077428-338989a2e8c0", category: "ristorante", label: "Ristorante interno", occasions: ["cena", "evento"], styles: ["elegante", "formale"] },
  { id: "1517248135467-4c7edcad34c4", category: "ristorante", label: "Bar serale", occasions: ["cena", "aperitivo"], styles: ["elegante", "casual"] },
  { id: "1559339352-11d035aa65de",    category: "ristorante", label: "Tavola apparecchiata", occasions: ["cena", "evento"], styles: ["elegante", "formale"] },
  { id: "1551218372-a8789b81b253",    category: "ristorante", label: "Cena elegante", occasions: ["cena", "evento"], styles: ["elegante", "formale"] },
  { id: "1559329007-40df8a9345d8",    category: "ristorante", label: "Rooftop dining", occasions: ["cena", "evento", "aperitivo"], styles: ["elegante"] },

  // ====== Festa / Drink ======
  { id: "1492684223066-81342ee5ff30", category: "festa", label: "Club luci", occasions: ["festa", "evento"], styles: ["elegante", "streetwear"] },
  { id: "1429962714451-bb934ecdc4ec", category: "festa", label: "Festa atmosfera", occasions: ["festa"], styles: ["elegante", "casual"] },
  { id: "1514525253161-7a46d19cd819", category: "festa", label: "Drink in mano", occasions: ["festa", "aperitivo"], styles: ["elegante", "casual"] },
  { id: "1530103862676-de8c9debad1d", category: "festa", label: "Concerto", occasions: ["festa", "evento"], styles: ["streetwear", "casual"] },
  { id: "1493676304819-0d7a8d026dcf", category: "festa", label: "Bar lounge", occasions: ["festa", "aperitivo"], styles: ["elegante"] },

  // ====== Café / Aperitivo ======
  { id: "1453614512568-c4024d13c247", category: "cafe", label: "Café interno", occasions: ["weekend", "aperitivo"], styles: ["casual"] },
  { id: "1521017432531-fbd92d768814", category: "cafe", label: "Aperitivo italiano", occasions: ["aperitivo"], styles: ["casual", "elegante"] },
  { id: "1554118811-1e0d58224f24",    category: "cafe", label: "Cappuccino al bar", occasions: ["weekend"], styles: ["casual"] },
  { id: "1442512595331-e89e73853f31", category: "cafe", label: "Café esterno", occasions: ["weekend", "aperitivo"], styles: ["casual"] },
  { id: "1559925393-8be0ec4767c8",    category: "cafe", label: "Dehors locale", occasions: ["aperitivo", "weekend"], styles: ["casual"] },

  // ====== Shopping / Centro ======
  { id: "1481437156560-3205f6a55735", category: "shopping", label: "Centro storico", occasions: ["weekend", "shopping"], styles: ["casual", "elegante"] },
  { id: "1519567241046-7f570eee3ce6", category: "shopping", label: "Strada shopping", occasions: ["shopping", "weekend"], styles: ["casual", "streetwear"] },
  { id: "1483985988355-763728e1935b", category: "shopping", label: "Centro commerciale", occasions: ["shopping"], styles: ["casual"] },
  { id: "1573855619003-97b4799dcd8b", category: "shopping", label: "Vetrina boutique", occasions: ["shopping", "weekend"], styles: ["elegante"] },
  { id: "1607082348824-0a96f2a4b9da", category: "shopping", label: "Window shopping", occasions: ["shopping"], styles: ["casual", "elegante"] },
];

/**
 * Ritorna lista completa con URL pre-generate (full + thumbnail).
 */
export function getAllBackgrounds() {
  return PHOTOS.map(p => ({
    ...p,
    url: unsplashUrl(p.id),
    thumb_url: thumbUrl(p.id),
  }));
}

/**
 * Ritorna sfondi filtrati per categoria.
 */
export function getBackgroundsByCategory(category) {
  return getAllBackgrounds().filter(b => b.category === category);
}

/**
 * Raggruppa per categoria, mantenendo l'ordine di BACKGROUND_CATEGORIES.
 */
export function getBackgroundsGrouped() {
  const all = getAllBackgrounds();
  return BACKGROUND_CATEGORIES.map(cat => ({
    ...cat,
    items: all.filter(b => b.category === cat.key),
  }));
}
