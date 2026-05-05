// =============================================================================
// Demo data: 30 capi femminili pre-configurati
// =============================================================================
// Usato dal bottone "Carica 30 capi demo" in Settings -> Backup.
// Ogni capo ha is_demo: true per cleanup veloce.
// Foto da Unsplash CDN (stabili, dimensione 600px).
// URL prodotto fake ma su domini reali per dare l'effetto "vero" + per testare
// l'alert scadenza link (alcuni sono volutamente vecchi di 200+ giorni).
//
// Distribuzione: 8 top, 4 bottom, 5 vestiti, 5 scarpe, 4 capospalla, 4 accessori
// =============================================================================

// Helper: data ISO di N giorni fa
function daysAgo(n) {
  return new Date(Date.now() - n * 86400 * 1000).toISOString();
}

// Helper: URL foto con dimensione 500px e qualita' 70 (~50-80 KB ognuna)
// I demo non sono nel tuo Storage, ma qualita' inferiore = caricamento piu' veloce
// e meno dati cellulare consumati
function unsplash(id) {
  const base = id.startsWith("premium_")
    ? `https://plus.unsplash.com/${id}`
    : `https://images.unsplash.com/${id}`;
  return `${base}?w=500&auto=format&fit=crop&q=70`;
}

export const DEMO_ITEMS = [
  // ============================================================================
  // TOP (8)
  // ============================================================================
  {
    category: "top", subcategory: "blusa",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "seta", style: "elegante",
    formality: 4, season: ["primavera","estate","autunno"], occasion: "lavoro, aperitivo",
    description: "Blusa in seta bianca, taglio fluido",
    price: 119.00,
    link_url: "https://www.massimodutti.com/it/donna/blusa-seta-bianca-001234.html",
    link_added_at: daysAgo(45),
    photo_url: unsplash("photo-1761117228880-df2425bd70da"),
  },
  {
    category: "top", subcategory: "camicetta",
    color: "azzurro", color_primary: "azzurro",
    pattern: "righe", material: "cotone", style: "casual",
    formality: 3, season: ["primavera","estate"], occasion: "lavoro, weekend",
    description: "Camicetta a righe sottili azzurre",
    price: 65.00,
    link_url: "https://www.zara.com/it/it/donna/camicetta-righe-azzurre-002345.html",
    link_added_at: daysAgo(30),
    photo_url: unsplash("photo-1708533096181-dab486856499"),
  },
  {
    category: "top", subcategory: "maglione",
    color: "beige", color_primary: "beige",
    pattern: "tinta unita", material: "cashmere", style: "elegante",
    formality: 4, season: ["autunno","inverno"], occasion: "lavoro, viaggio",
    description: "Maglione in cashmere beige scollo a V",
    price: 199.00,
    link_url: "https://www.cosstores.com/it_it/donna/cashmere-beige-v-neck-005678.html",
    link_added_at: daysAgo(60),
    photo_url: unsplash("photo-1582599926390-b4350d5dcd6b"),
  },
  {
    category: "top", subcategory: "cardigan",
    color: "rosa", color_primary: "rosa", color_secondary: "panna",
    pattern: "tinta unita", material: "lana", style: "casual",
    formality: 3, season: ["autunno","inverno","primavera"], occasion: "casual, casa",
    description: "Cardigan rosa cipria lavorato a maglia",
    price: 89.90,
    link_url: "https://www.massimodutti.com/it/donna/cardigan-rosa-cipria-009876.html",
    link_added_at: daysAgo(15),
    photo_url: unsplash("photo-1759873821400-389aa110eeef"),
  },
  {
    category: "top", subcategory: "t-shirt",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "cotone", style: "minimal",
    formality: 1, season: ["primavera","estate"], occasion: "casual, weekend",
    description: "T-shirt bianca basica in cotone organico",
    price: 19.90,
    link_url: "https://www.cosstores.com/it_it/donna/t-shirt-organic-cotton-001.html",
    link_added_at: daysAgo(220),  // SCADUTO
    photo_url: unsplash("photo-1611235116156-0cbda6649efb"),
  },
  {
    category: "top", subcategory: "blusa",
    color: "rosa", color_primary: "rosa",
    pattern: "floreale", material: "seta", style: "elegante",
    formality: 4, season: ["primavera","estate"], occasion: "aperitivo, sera",
    description: "Blusa floreale in chiffon rosa",
    price: 95.00,
    link_url: "https://www.maxmara.com/it/donna/blusa-floreale-rosa-007890.html",
    link_added_at: daysAgo(7),
    photo_url: unsplash("photo-1761121317492-57feee4fc674"),
  },
  {
    category: "top", subcategory: "dolcevita",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "lana", style: "minimal",
    formality: 3, season: ["autunno","inverno"], occasion: "lavoro, sera",
    description: "Dolcevita nero in lana merino slim",
    price: 79.00,
    link_url: "https://www.uniqlo.com/it/it/donna/dolcevita-merino-nero-E12345.html",
    link_added_at: daysAgo(180),  // in scadenza
    photo_url: unsplash("photo-1613891737415-be7670d21c19"),
  },
  {
    category: "top", subcategory: "top",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "lino", style: "casual",
    formality: 2, season: ["primavera","estate"], occasion: "weekend, mare",
    description: "Top in lino bianco con maniche corte",
    price: 49.00,
    link_url: null,  // un capo senza link, per test
    link_added_at: null,
    photo_url: unsplash("photo-1582599926390-b4350d5dcd6b"),
  },

  // ============================================================================
  // BOTTOM (4)
  // ============================================================================
  {
    category: "bottom", subcategory: "jeans",
    color: "denim", color_primary: "denim",
    pattern: "denim", material: "denim", style: "casual",
    formality: 2, season: ["primavera","autunno","inverno"], occasion: "casual, weekend",
    description: "Jeans skinny vita alta lavaggio medio",
    price: 79.00,
    link_url: "https://www.levi.com/it/it/donna/skinny-vita-alta-medium-wash-001.html",
    link_added_at: daysAgo(120),
    photo_url: unsplash("photo-1475178626620-a4d074967452"),
  },
  {
    category: "bottom", subcategory: "pantaloni",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "altro", style: "elegante",
    formality: 4, season: ["primavera","estate","autunno"], occasion: "lavoro, sera",
    description: "Pantaloni palazzo neri vita alta",
    price: 99.00,
    link_url: "https://www.zara.com/it/it/donna/pantaloni-palazzo-neri-005678.html",
    link_added_at: daysAgo(35),
    photo_url: unsplash("photo-1763558978011-55404124a148"),
  },
  {
    category: "bottom", subcategory: "gonna",
    color: "beige", color_primary: "beige",
    pattern: "tinta unita", material: "altro", style: "elegante",
    formality: 4, season: ["primavera","estate","autunno"], occasion: "lavoro, aperitivo",
    description: "Gonna midi beige a tubino con spacco",
    price: 79.90,
    link_url: "https://www.massimodutti.com/it/donna/gonna-midi-beige-008901.html",
    link_added_at: daysAgo(50),
    photo_url: unsplash("photo-1556747439-3b96858b9d8d"),
  },
  {
    category: "bottom", subcategory: "gonna",
    color: "denim", color_primary: "denim",
    pattern: "denim", material: "denim", style: "casual",
    formality: 2, season: ["primavera","estate"], occasion: "weekend, casual",
    description: "Mini gonna di jeans lavaggio chiaro",
    price: 55.00,
    link_url: "https://www.hm.com/it_it/productpage.0123987001.html",
    link_added_at: daysAgo(250),  // SCADUTO
    photo_url: unsplash("photo-1582800093065-3bca10dd2c98"),
  },

  // ============================================================================
  // VESTITI (5)
  // ============================================================================
  {
    category: "vestito", subcategory: "abito",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "altro", style: "elegante",
    formality: 5, season: ["autunno","inverno","primavera"], occasion: "sera, gala, lavoro",
    description: "Abito tubino nero scollo tondo, taglio classico",
    price: 199.00,
    link_url: "https://www.maxmara.com/it/donna/tubino-nero-classico-001234.html",
    link_added_at: daysAgo(40),
    photo_url: unsplash("photo-1515372039744-b8f02a3ae446"),
  },
  {
    category: "vestito", subcategory: "abito",
    color: "rosa", color_primary: "rosa",
    pattern: "floreale", material: "altro", style: "casual",
    formality: 3, season: ["primavera","estate"], occasion: "aperitivo, weekend",
    description: "Abito midi a fiori rosa con cintura in vita",
    price: 129.00,
    link_url: "https://www.zara.com/it/it/donna/abito-midi-floreale-009012.html",
    link_added_at: daysAgo(20),
    photo_url: unsplash("photo-1671848633245-79cc98b0dbe8"),
  },
  {
    category: "vestito", subcategory: "abito",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "lino", style: "boho",
    formality: 3, season: ["primavera","estate"], occasion: "mare, viaggio, weekend",
    description: "Abito lungo bianco in lino, stile boho",
    price: 159.00,
    link_url: "https://www.massimodutti.com/it/donna/abito-lungo-lino-bianco-007890.html",
    link_added_at: daysAgo(10),
    photo_url: unsplash("photo-1602010069450-0a62034f235c"),
  },
  {
    category: "vestito", subcategory: "abito",
    color: "rosso", color_primary: "rosso",
    pattern: "tinta unita", material: "altro", style: "elegante",
    formality: 5, season: ["autunno","inverno","primavera"], occasion: "sera, gala",
    description: "Mini abito rosso aderente da sera",
    price: 189.00,
    link_url: "https://www.maxmara.com/it/donna/mini-abito-rosso-005678.html",
    link_added_at: daysAgo(95),
    photo_url: unsplash("photo-1599662875272-64de8289f6d8"),
  },
  {
    category: "vestito", subcategory: "abito",
    color: "blu navy", color_primary: "blu navy",
    pattern: "tinta unita", material: "altro", style: "elegante",
    formality: 4, season: ["primavera","autunno"], occasion: "lavoro, aperitivo",
    description: "Abito chemisier blu navy con cintura",
    price: 119.00,
    link_url: "https://www.massimodutti.com/it/donna/chemisier-navy-003456.html",
    link_added_at: daysAgo(195),  // in scadenza
    photo_url: unsplash("photo-1495385794356-15371f348c31"),
  },

  // ============================================================================
  // SCARPE (5)
  // ============================================================================
  {
    category: "scarpe", subcategory: "decolleté",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "pelle", style: "elegante",
    formality: 5, season: ["primavera","estate","autunno","inverno"], occasion: "lavoro, sera, cerimonia",
    description: "Décolleté nere in pelle tacco 8cm",
    price: 159.00,
    link_url: "https://www.geox.com/it/it/donna/decolleté-nere-pelle-D001.html",
    link_added_at: daysAgo(60),
    photo_url: unsplash("photo-1543163521-1bf539c55dd2"),
  },
  {
    category: "scarpe", subcategory: "ballerine",
    color: "panna", color_primary: "panna",
    pattern: "tinta unita", material: "pelle", style: "casual",
    formality: 3, season: ["primavera","estate","autunno"], occasion: "lavoro, casual",
    description: "Ballerine panna con punta arrotondata",
    price: 79.00,
    link_url: "https://www.repetto.com/it/donna/ballerine-panna-pelle-002.html",
    link_added_at: daysAgo(30),
    photo_url: unsplash("photo-1676300816371-e02ca73af33c"),
  },
  {
    category: "scarpe", subcategory: "sneakers",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "pelle", style: "casual",
    formality: 2, season: ["primavera","estate","autunno"], occasion: "casual, weekend",
    description: "Sneakers bianche minimal in pelle",
    price: 95.00,
    link_url: "https://www.adidas.it/donna/stan-smith-bianche-W001.html",
    link_added_at: daysAgo(150),
    photo_url: unsplash("photo-1597350584914-55bb62285896"),
  },
  {
    category: "scarpe", subcategory: "stivali",
    color: "marrone", color_primary: "marrone",
    pattern: "tinta unita", material: "pelle", style: "casual",
    formality: 3, season: ["autunno","inverno"], occasion: "casual, viaggio",
    description: "Stivali marroni al ginocchio in pelle",
    price: 220.00,
    link_url: "https://www.geox.com/it/it/donna/stivali-marroni-ginocchio-W002.html",
    link_added_at: daysAgo(8),
    photo_url: unsplash("photo-1611233299310-f6276ff55307"),
  },
  {
    category: "scarpe", subcategory: "sandali",
    color: "oro", color_primary: "oro",
    pattern: "tinta unita", material: "pelle", style: "elegante",
    formality: 4, season: ["primavera","estate"], occasion: "sera, gala, mare",
    description: "Sandali con tacco oro listini sottili",
    price: 139.00,
    link_url: "https://www.zara.com/it/it/donna/sandali-tacco-oro-001234.html",
    link_added_at: daysAgo(220),  // SCADUTO
    photo_url: unsplash("photo-1535043934128-cf0b28d52f95"),
  },

  // ============================================================================
  // CAPOSPALLA (4)
  // ============================================================================
  {
    category: "capospalla", subcategory: "trench",
    color: "beige", color_primary: "beige",
    pattern: "tinta unita", material: "cotone", style: "elegante",
    formality: 4, season: ["primavera","autunno"], occasion: "lavoro, viaggio",
    description: "Trench beige classico double-breasted",
    price: 350.00,
    link_url: "https://www.burberry.com/it/donna/trench-classico-beige-005678.html",
    link_added_at: daysAgo(100),
    photo_url: unsplash("photo-1676716105765-e19fe6a01851"),
  },
  {
    category: "capospalla", subcategory: "blazer",
    color: "panna", color_primary: "panna",
    pattern: "tinta unita", material: "lana", style: "elegante",
    formality: 4, season: ["primavera","autunno","inverno"], occasion: "lavoro, sera",
    description: "Blazer panna oversize in lana",
    price: 249.00,
    link_url: "https://www.massimodutti.com/it/donna/blazer-panna-oversize-009876.html",
    link_added_at: daysAgo(25),
    photo_url: unsplash("photo-1604914509335-9001944f23d5"),
  },
  {
    category: "capospalla", subcategory: "giacca",
    color: "denim", color_primary: "denim",
    pattern: "denim", material: "denim", style: "casual",
    formality: 2, season: ["primavera","autunno"], occasion: "casual, weekend",
    description: "Giacca di jeans corta lavaggio chiaro",
    price: 89.00,
    link_url: "https://www.levi.com/it/it/donna/giacca-jeans-corta-light-W003.html",
    link_added_at: daysAgo(280),  // SCADUTO da molto
    photo_url: unsplash("photo-1543076447-215ad9ba6923"),
  },
  {
    category: "capospalla", subcategory: "cappotto",
    color: "cammello", color_primary: "cammello",
    pattern: "tinta unita", material: "lana", style: "elegante",
    formality: 4, season: ["autunno","inverno"], occasion: "lavoro, viaggio, sera",
    description: "Cappotto color cammello lungo in lana",
    price: 399.00,
    link_url: "https://www.maxmara.com/it/donna/cappotto-cammello-lungo-001234.html",
    link_added_at: daysAgo(15),
    photo_url: unsplash("photo-1521510895919-46920266ddb3"),
  },

  // ============================================================================
  // ACCESSORI (4)
  // ============================================================================
  {
    category: "accessori", subcategory: "borsa",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "pelle", style: "elegante",
    formality: 4, season: ["primavera","estate","autunno","inverno"], occasion: "lavoro, sera",
    description: "Borsa a tracolla nera in pelle",
    price: 259.00,
    link_url: "https://www.coccinelle.com/it/donna/borsa-tracolla-nera-001.html",
    link_added_at: daysAgo(50),
    photo_url: unsplash("photo-1537440437066-c585a62baf1f"),
  },
  {
    category: "accessori", subcategory: "borsa",
    color: "marrone", color_primary: "marrone",
    pattern: "tinta unita", material: "pelle", style: "casual",
    formality: 3, season: ["primavera","estate","autunno","inverno"], occasion: "casual, viaggio",
    description: "Tote bag marrone in pelle morbida",
    price: 189.00,
    link_url: "https://www.coccinelle.com/it/donna/tote-marrone-pelle-002.html",
    link_added_at: daysAgo(180),  // in scadenza
    photo_url: unsplash("photo-1656396795249-8efb9bdebf51"),
  },
  {
    category: "accessori", subcategory: "foulard",
    color: "rosso", color_primary: "rosso", color_secondary: "oro",
    pattern: "grafico", material: "seta", style: "elegante",
    formality: 4, season: ["primavera","autunno","inverno"], occasion: "lavoro, sera, cerimonia",
    description: "Foulard di seta stampa baroque rosso/oro",
    price: 149.00,
    link_url: "https://www.hermes.com/it/donna/foulard-seta-baroque-001234.html",
    link_added_at: daysAgo(75),
    photo_url: unsplash("photo-1517472292914-9570a594783b"),
  },
  {
    category: "accessori", subcategory: "occhiali",
    color: "marrone", color_primary: "marrone",
    pattern: "tinta unita", material: "altro", style: "casual",
    formality: 3, season: ["primavera","estate"], occasion: "casual, mare",
    description: "Occhiali da sole tartaruga oversize",
    price: 119.00,
    link_url: "https://www.persol.com/it/donna/wayfarer-tartaruga-W005.html",
    link_added_at: daysAgo(95),
    photo_url: unsplash("photo-1572635196237-14b3f281503f"),
  },
];
