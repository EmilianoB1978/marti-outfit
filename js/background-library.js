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
// CRITERI DI SELEZIONE (v2 — feedback Martina):
// - Eye-level: NIENTE vedute aeree, panorami dall'alto, vette
// - Pavimento/sentiero/sabbia visibile nel PRIMO PIANO (Martina deve
//   "appoggiare i piedi" credibilmente)
// - Profondita' di campo coerente con persona a figura intera
// - No close-up di cibo/bicchieri/oggetti
// - Sfondo non affollato (no folla in primo piano)
//
// Format URL: https://images.unsplash.com/photo-{id}?w=1200&h=1500&fit=crop&q=80
// (4:5 portrait, ottimo per outfit a figura intera)
// =============================================================================

const W = 1200, H = 1500;
function unsplashUrl(id, w = W, h = H) {
  return `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=80`;
}
function thumbUrl(id) {
  return unsplashUrl(id, 400, 500);
}

export const BACKGROUND_CATEGORIES = [
  { key: "mare",       icon: "🏖️", label: "Mare / Spiaggia" },
  { key: "montagna",   icon: "🥾", label: "Sentieri / Trekking" },
  { key: "natura",     icon: "🌳", label: "Natura / Parco" },
  { key: "citta",      icon: "🏙️", label: "Strade Città" },
  { key: "ufficio",    icon: "💼", label: "Ufficio / Business" },
  { key: "casa",       icon: "🏠", label: "Casa / Interno" },
  { key: "ristorante", icon: "🍽️", label: "Ristorante / Sala" },
  { key: "festa",      icon: "🎉", label: "Festa / Locale" },
  { key: "cafe",       icon: "☕", label: "Café / Dehors" },
  { key: "shopping",   icon: "🛍️", label: "Shopping / Centro" },
];

const PHOTOS = [
  // ====== Mare / Spiaggia (eye-level con sabbia/lungomare in primo piano) ======
  { id: "1507525428034-b723cf961d3e", category: "mare", label: "Palme sulla sabbia", occasions: ["vacanza", "mare"], styles: ["casual"] },
  { id: "1473496169904-658ba7c44d8a", category: "mare", label: "Vialetto tropicale", occasions: ["vacanza", "mare"], styles: ["casual"] },
  { id: "1519046904884-53103b34b206", category: "mare", label: "Spiaggia bianca", occasions: ["vacanza", "mare"], styles: ["casual"] },
  { id: "1493558103817-58b2924bce98", category: "mare", label: "Lungomare al tramonto", occasions: ["vacanza", "aperitivo"], styles: ["casual"] },
  { id: "1454391304352-2bf4678b1a7a", category: "mare", label: "Pontile al mare", occasions: ["vacanza", "weekend"], styles: ["casual"] },

  // ====== Sentieri / Trekking (sentieri eye-level, NO vette aeree) ======
  { id: "1551632811-561732d1e306", category: "montagna", label: "Sentiero boscoso", occasions: ["weekend", "trekking"], styles: ["casual", "sportivo"] },
  { id: "1486325212027-8081e485255e", category: "montagna", label: "Camminata nel bosco", occasions: ["weekend", "trekking"], styles: ["casual"] },
  { id: "1469474968028-56623f02e42e", category: "montagna", label: "Campo soleggiato", occasions: ["weekend", "picnic"], styles: ["casual"] },
  { id: "1487530811176-3780de880c2d", category: "montagna", label: "Sentiero in salita", occasions: ["weekend", "trekking"], styles: ["sportivo"] },
  { id: "1551649002-da97fafb52cf", category: "montagna", label: "Rifugio in legno", occasions: ["weekend", "trekking"], styles: ["casual"] },

  // ====== Natura / Parco (vialetti pedonali) ======
  { id: "1518495973542-4542c06a5843", category: "natura", label: "Bosco illuminato", occasions: ["weekend", "passeggiata"], styles: ["casual"] },
  { id: "1499529112087-3cb3b73cec95", category: "natura", label: "Vialetto del parco", occasions: ["weekend", "passeggiata"], styles: ["casual"] },
  { id: "1441974231531-c6227db76b6e", category: "natura", label: "Sentiero foresta", occasions: ["weekend", "passeggiata"], styles: ["casual"] },
  { id: "1505666287802-931dc83948e9", category: "natura", label: "Vialetto autunnale", occasions: ["weekend", "passeggiata"], styles: ["casual"] },
  { id: "1500382017468-9049fed747ef", category: "natura", label: "Campo verde", occasions: ["weekend", "picnic"], styles: ["casual"] },

  // ====== Città (strade urbane, piazze, vicoli a livello pedonale) ======
  { id: "1502602898657-3e91760cbb34", category: "citta", label: "Parigi vicolo", occasions: ["vacanza", "weekend"], styles: ["elegante", "casual"] },
  { id: "1513635269975-59663e0ac1ad", category: "citta", label: "Londra strada", occasions: ["vacanza", "weekend"], styles: ["elegante", "casual"] },
  { id: "1499856871958-5b9627545d1a", category: "citta", label: "Strada al crepuscolo", occasions: ["aperitivo", "weekend"], styles: ["casual", "elegante"] },
  { id: "1519501025264-65ba15a82390", category: "citta", label: "Piazza europea", occasions: ["weekend", "shopping"], styles: ["elegante"] },
  { id: "1444084316824-dc26d6657664", category: "citta", label: "Centro storico", occasions: ["weekend", "vacanza"], styles: ["casual", "elegante"] },

  // ====== Ufficio / Business (open space con pavimento in primo piano) ======
  { id: "1497366754035-f200968a6e72", category: "ufficio", label: "Open space moderno", occasions: ["lavoro", "meeting"], styles: ["formale", "elegante"] },
  { id: "1497366216548-37526070297c", category: "ufficio", label: "Studio luminoso", occasions: ["lavoro"], styles: ["formale", "elegante"] },
  { id: "1556761175-5973dc0f32e7",    category: "ufficio", label: "Sala riunioni", occasions: ["lavoro", "meeting"], styles: ["formale", "elegante"] },
  { id: "1497032628192-86f99bcd76bc", category: "ufficio", label: "Corridoio uffici", occasions: ["lavoro"], styles: ["formale"] },
  { id: "1568992687947-868a62a9f521", category: "ufficio", label: "Reception loft", occasions: ["lavoro", "meeting"], styles: ["formale", "elegante"] },

  // ====== Casa / Interno (prospettiva eye-level dall'angolo della stanza) ======
  { id: "1502672260266-1c1ef2d93688", category: "casa", label: "Salotto scandi", occasions: ["casa", "weekend"], styles: ["casual"] },
  { id: "1493663284031-b7e3aefcae8e", category: "casa", label: "Cucina luminosa", occasions: ["casa"], styles: ["casual"] },
  { id: "1493809842364-78817add7ffb", category: "casa", label: "Living moderno", occasions: ["casa", "weekend"], styles: ["casual"] },
  { id: "1505691938895-1758d7feb511", category: "casa", label: "Camera elegante", occasions: ["casa"], styles: ["casual"] },
  { id: "1556228453-efd6c1ff04f6", category: "casa", label: "Studio minimal", occasions: ["casa", "weekend"], styles: ["casual"] },

  // ====== Ristorante / Sala (vista interna eye-level, niente close-up) ======
  { id: "1517248135467-4c7edcad34c4", category: "ristorante", label: "Bistrot serale", occasions: ["cena", "aperitivo"], styles: ["elegante", "casual"] },
  { id: "1414235077428-338989a2e8c0", category: "ristorante", label: "Ristorante elegante", occasions: ["cena", "evento"], styles: ["elegante", "formale"] },
  { id: "1559339352-11d035aa65de",    category: "ristorante", label: "Sala apparecchiata", occasions: ["cena", "evento"], styles: ["elegante", "formale"] },
  { id: "1521017432531-fbd92d768814", category: "ristorante", label: "Trattoria luce", occasions: ["cena", "aperitivo"], styles: ["casual", "elegante"] },
  { id: "1559329007-40df8a9345d8",    category: "ristorante", label: "Rooftop con vista", occasions: ["cena", "aperitivo"], styles: ["elegante"] },

  // ====== Festa / Locale (interno club con prospettiva eye-level) ======
  { id: "1492684223066-81342ee5ff30", category: "festa", label: "Club luci colorate", occasions: ["festa", "evento"], styles: ["elegante", "streetwear"] },
  { id: "1493676304819-0d7a8d026dcf", category: "festa", label: "Lounge bar", occasions: ["festa", "aperitivo"], styles: ["elegante"] },
  { id: "1561489413-985b06da5bee", category: "festa", label: "Discoteca soft", occasions: ["festa"], styles: ["elegante", "streetwear"] },
  { id: "1543007630-9710e4a00a20", category: "festa", label: "Festa terrazza", occasions: ["festa", "aperitivo"], styles: ["elegante", "casual"] },
  { id: "1574391884720-bbc049ec09ad", category: "festa", label: "Cocktail bar", occasions: ["festa", "aperitivo"], styles: ["elegante"] },

  // ====== Café / Dehors (tavolini e sale bar con prospettiva) ======
  { id: "1453614512568-c4024d13c247", category: "cafe", label: "Café tavolini", occasions: ["weekend", "aperitivo"], styles: ["casual"] },
  { id: "1442512595331-e89e73853f31", category: "cafe", label: "Café terrazza", occasions: ["weekend", "aperitivo"], styles: ["casual"] },
  { id: "1559925393-8be0ec4767c8",    category: "cafe", label: "Dehors arredato", occasions: ["aperitivo", "weekend"], styles: ["casual", "elegante"] },
  { id: "1559925393-cbdb340dc8b3", category: "cafe", label: "Bar mattutino", occasions: ["weekend"], styles: ["casual"] },
  { id: "1545195643-7ab15ec23167", category: "cafe", label: "Caffetteria moderna", occasions: ["weekend", "aperitivo"], styles: ["casual"] },

  // ====== Shopping (strade commerciali eye-level) ======
  { id: "1481437156560-3205f6a55735", category: "shopping", label: "Centro storico shopping", occasions: ["weekend", "shopping"], styles: ["casual", "elegante"] },
  { id: "1519567241046-7f570eee3ce6", category: "shopping", label: "Via dello shopping", occasions: ["shopping"], styles: ["casual", "streetwear"] },
  { id: "1483985988355-763728e1935b", category: "shopping", label: "Galleria commerciale", occasions: ["shopping"], styles: ["casual", "elegante"] },
  { id: "1604176354204-9268737828e4", category: "shopping", label: "Vetrine illuminate", occasions: ["shopping", "weekend"], styles: ["elegante"] },
  { id: "1607082348824-0a96f2a4b9da", category: "shopping", label: "Window shopping", occasions: ["shopping", "weekend"], styles: ["casual", "elegante"] },
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
