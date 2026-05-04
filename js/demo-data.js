// =============================================================================
// Demo data: 30 capi pre-configurati per popolare il guardaroba
// =============================================================================
// Usato dal bottone "Carica 30 capi demo" in Settings -> Backup.
// Ogni capo ha is_demo: true per cleanup veloce con "Rimuovi tutti i demo".
// Foto da Unsplash CDN (stabili). URL prodotto fake ma su domini reali per
// dare l'effetto "vero" + per testare l'alert scadenza link (alcuni sono
// volutamente vecchi di 200+ giorni).
// =============================================================================

// Helper: data ISO di N giorni fa
function daysAgo(n) {
  return new Date(Date.now() - n * 86400 * 1000).toISOString();
}

// Helper: URL foto con dimensione 600px
function unsplash(id) {
  // id puo' essere "photo-XXX" o "premium_photo-XXX" gia' completo
  const base = id.startsWith("premium_")
    ? `https://plus.unsplash.com/${id}`
    : `https://images.unsplash.com/${id}`;
  return `${base}?w=600&auto=format&fit=crop&q=80`;
}

export const DEMO_ITEMS = [
  // ============================================================================
  // TOP (9)
  // ============================================================================
  {
    category: "top", subcategory: "t-shirt",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "cotone", style: "casual",
    formality: 1, season: ["primavera","estate"], occasion: "casa, weekend",
    description: "T-shirt bianca basica in cotone, taglio classico",
    price: 19.90,
    link_url: "https://www.zara.com/it/it/t-shirt-cotone-basic-bianca-p001234.html",
    link_added_at: daysAgo(15),
    photo_url: unsplash("photo-1521572163474-6864f9cf17ab"),
  },
  {
    category: "top", subcategory: "camicia",
    color: "blu", color_primary: "blu", color_secondary: null,
    pattern: "tinta unita", material: "cotone", style: "elegante",
    formality: 4, season: ["primavera","autunno"], occasion: "lavoro, aperitivo",
    description: "Camicia blu Oxford slim fit",
    price: 59.90,
    link_url: "https://www2.hm.com/it_it/productpage.0987654003.html",
    link_added_at: daysAgo(45),
    photo_url: unsplash("photo-1589310243389-96a5483213a8"),
  },
  {
    category: "top", subcategory: "camicia",
    color: "azzurro", color_primary: "azzurro",
    pattern: "righe", material: "cotone", style: "casual",
    formality: 3, season: ["primavera","estate"], occasion: "lavoro, casual",
    description: "Camicia azzurra a righe sottili",
    price: 49.00,
    link_url: "https://www.uniqlo.com/it/it/products/E456789-000",
    link_added_at: daysAgo(220), // SCADUTO per test alert
    photo_url: unsplash("photo-1601522089844-8ac5e2ae6773"),
  },
  {
    category: "top", subcategory: "maglione",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "lana", style: "elegante",
    formality: 4, season: ["autunno","inverno"], occasion: "lavoro, sera",
    description: "Maglione nero girocollo in lana merino",
    price: 89.90,
    link_url: "https://www.cosstores.com/it_it/men/knitwear/product.000111.html",
    link_added_at: daysAgo(60),
    photo_url: unsplash("photo-1618354691373-d851c5c3a990"),
  },
  {
    category: "top", subcategory: "maglione",
    color: "beige", color_primary: "beige",
    pattern: "tinta unita", material: "cashmere", style: "elegante",
    formality: 4, season: ["autunno","inverno"], occasion: "sera, viaggio",
    description: "Maglione beige in cashmere puro",
    price: 199.00,
    link_url: "https://www.zalando.it/cashmere-beige-pullover-987654.html",
    link_added_at: daysAgo(7),
    photo_url: unsplash("photo-1521567097888-2c5fc40a8660"),
  },
  {
    category: "top", subcategory: "felpa",
    color: "grigio", color_primary: "grigio",
    pattern: "tinta unita", material: "cotone", style: "casual",
    formality: 1, season: ["autunno","inverno"], occasion: "casa, sport",
    description: "Felpa grigia con cappuccio",
    price: 39.90,
    link_url: "https://www.asos.com/it/asos-design/grey-hoodie-1234567/",
    link_added_at: daysAgo(90),
    photo_url: unsplash("photo-1556821840-3a63f95609a7"),
  },
  {
    category: "top", subcategory: "felpa",
    color: "nero", color_primary: "nero",
    pattern: "grafico", material: "cotone", style: "streetwear",
    formality: 1, season: ["autunno","inverno","primavera"], occasion: "casa, weekend",
    description: "Felpa nera con stampa grafica fronte",
    price: 49.00,
    link_url: "https://www.ovs.it/p/felpa-grafica-nera/PROD123",
    link_added_at: daysAgo(10),
    photo_url: unsplash("photo-1620799140188-3b2a02fd9a77"),
  },
  {
    category: "top", subcategory: "polo",
    color: "blu navy", color_primary: "blu navy",
    pattern: "tinta unita", material: "cotone", style: "casual",
    formality: 3, season: ["primavera","estate"], occasion: "lavoro, aperitivo",
    description: "Polo blu navy in cotone piquet",
    price: 59.90,
    link_url: "https://www.lacoste.com/it/lacoste/uomo/polo-classic-fit-blu-navy.html",
    link_added_at: daysAgo(180),  // in scadenza
    photo_url: unsplash("photo-1531036623495-da918d4029bb"),
  },
  {
    category: "top", subcategory: "t-shirt",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "cotone", style: "minimal",
    formality: 2, season: ["primavera","estate","autunno"], occasion: "casual, weekend",
    description: "T-shirt bianca premium oversized",
    price: 35.00,
    link_url: null,  // un capo senza link, per test
    link_added_at: null,
    photo_url: unsplash("photo-1581655353564-df123a1eb820"),
  },

  // ============================================================================
  // BOTTOM (6)
  // ============================================================================
  {
    category: "bottom", subcategory: "jeans",
    color: "denim", color_primary: "denim",
    pattern: "denim", material: "denim", style: "casual",
    formality: 2, season: ["primavera","autunno","inverno"], occasion: "casual, weekend",
    description: "Jeans blu slim fit, lavaggio medio",
    price: 79.90,
    link_url: "https://www.levi.com/it/it/jeans-501-slim-medium-wash-001234.html",
    link_added_at: daysAgo(120),
    photo_url: unsplash("photo-1714143136372-ddaf8b606da7"),
  },
  {
    category: "bottom", subcategory: "jeans",
    color: "nero", color_primary: "nero",
    pattern: "denim", material: "denim", style: "casual",
    formality: 3, season: ["autunno","inverno"], occasion: "lavoro, aperitivo",
    description: "Jeans neri skinny",
    price: 69.00,
    link_url: "https://www.diesel.com/it/it/uomo/jeans/black-skinny-PROD789.html",
    link_added_at: daysAgo(35),
    photo_url: unsplash("photo-1516271099866-de31ba93ee4b"),
  },
  {
    category: "bottom", subcategory: "jeans",
    color: "azzurro", color_primary: "azzurro",
    pattern: "denim", material: "denim", style: "casual",
    formality: 1, season: ["primavera","estate"], occasion: "weekend, mare",
    description: "Jeans azzurro chiaro lavaggio vintage",
    price: 89.00,
    link_url: "https://www.gap.com/it/uomo/jeans-light-wash-vintage.html",
    link_added_at: daysAgo(250),  // SCADUTO
    photo_url: unsplash("photo-1604176354204-9268737828e4"),
  },
  {
    category: "bottom", subcategory: "chinos",
    color: "beige", color_primary: "beige",
    pattern: "tinta unita", material: "cotone", style: "elegante",
    formality: 3, season: ["primavera","estate","autunno"], occasion: "lavoro, aperitivo",
    description: "Chinos beige slim fit",
    price: 65.00,
    link_url: "https://www.dockers.com/it/uomo/chino-slim-beige-DK001.html",
    link_added_at: daysAgo(50),
    photo_url: unsplash("photo-1584865288642-42078afe6942"),
  },
  {
    category: "bottom", subcategory: "chinos",
    color: "blu navy", color_primary: "blu navy",
    pattern: "tinta unita", material: "cotone", style: "elegante",
    formality: 3, season: ["primavera","autunno"], occasion: "lavoro, casual",
    description: "Chinos blu navy slim",
    price: 65.00,
    link_url: "https://www.uniqlo.com/it/it/products/E789012-000",
    link_added_at: daysAgo(20),
    photo_url: unsplash("photo-1763451291540-860eefd7dc29"),
  },
  {
    category: "bottom", subcategory: "pantaloni",
    color: "grigio", color_primary: "grigio",
    pattern: "tinta unita", material: "lana", style: "formale",
    formality: 5, season: ["autunno","inverno"], occasion: "lavoro, cerimonia",
    description: "Pantaloni grigio carbone in lana, taglio dritto",
    price: 149.00,
    link_url: "https://www.canalibrand.com/it/uomo/pantaloni-grigio-carbone-PROD001.html",
    link_added_at: daysAgo(75),
    photo_url: unsplash("photo-1777391288260-4fa838e43a97"),
  },

  // ============================================================================
  // SCARPE (5)
  // ============================================================================
  {
    category: "scarpe", subcategory: "sneakers",
    color: "bianco", color_primary: "bianco",
    pattern: "tinta unita", material: "pelle", style: "casual",
    formality: 2, season: ["primavera","estate","autunno"], occasion: "casual, weekend",
    description: "Sneakers bianche in pelle minimal",
    price: 95.00,
    link_url: "https://www.adidas.it/stan-smith-bianche-PROD456.html",
    link_added_at: daysAgo(60),
    photo_url: unsplash("photo-1597350584914-55bb62285896"),
  },
  {
    category: "scarpe", subcategory: "sneakers",
    color: "bianco", color_primary: "bianco", color_secondary: "nero",
    pattern: "tinta unita", material: "sintetico", style: "sportivo",
    formality: 1, season: ["primavera","estate"], occasion: "sport, casual",
    description: "Sneakers running bianche con dettagli neri",
    price: 120.00,
    link_url: "https://www.nike.com/it/t/air-max-running-white-black-12345",
    link_added_at: daysAgo(30),
    photo_url: unsplash("photo-1544441892-794166f1e3be"),
  },
  {
    category: "scarpe", subcategory: "stivali",
    color: "marrone", color_primary: "marrone",
    pattern: "tinta unita", material: "pelle", style: "casual",
    formality: 3, season: ["autunno","inverno"], occasion: "casual, viaggio",
    description: "Stivali pelle marrone con suola robusta",
    price: 189.00,
    link_url: "https://www.timberland.it/uomo/stivali-pelle-marrone-001.html",
    link_added_at: daysAgo(150),
    photo_url: unsplash("photo-1605812860427-4024433a70fd"),
  },
  {
    category: "scarpe", subcategory: "stivali",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "pelle", style: "elegante",
    formality: 4, season: ["autunno","inverno"], occasion: "lavoro, sera",
    description: "Stivali Chelsea neri in pelle",
    price: 220.00,
    link_url: "https://www.drmartens.com/it/it/chelsea-boots-black-leather-PROD123.html",
    link_added_at: daysAgo(8),
    photo_url: unsplash("photo-1534233650908-b471f2350922"),
  },
  {
    category: "scarpe", subcategory: "sneakers",
    color: "grigio", color_primary: "grigio",
    pattern: "tinta unita", material: "sintetico", style: "casual",
    formality: 2, season: ["primavera","autunno"], occasion: "casual, weekend",
    description: "Sneakers grigio chiaro casual",
    price: 75.00,
    link_url: "https://www.newbalance.it/it/grey-casual-sneakers-NB574.html",
    link_added_at: daysAgo(195),  // in scadenza/scaduto
    photo_url: unsplash("photo-1600269452121-4f2416e55c28"),
  },

  // ============================================================================
  // CAPOSPALLA (4)
  // ============================================================================
  {
    category: "capospalla", subcategory: "giacca",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "pelle", style: "streetwear",
    formality: 3, season: ["primavera","autunno"], occasion: "casual, sera",
    description: "Giacca in pelle nera, biker style",
    price: 290.00,
    link_url: "https://www.allsaints.com/it/uomo/giacca-pelle-biker-AS001.html",
    link_added_at: daysAgo(40),
    photo_url: unsplash("photo-1551028719-00167b16eac5"),
  },
  {
    category: "capospalla", subcategory: "trench",
    color: "beige", color_primary: "beige",
    pattern: "tinta unita", material: "cotone", style: "elegante",
    formality: 4, season: ["primavera","autunno"], occasion: "lavoro, viaggio",
    description: "Trench beige classico double-breasted",
    price: 350.00,
    link_url: "https://www.burberry.com/it/uomo/trench-classico-beige-001234.html",
    link_added_at: daysAgo(100),
    photo_url: unsplash("photo-1676716105765-e19fe6a01851"),
  },
  {
    category: "capospalla", subcategory: "giacca",
    color: "denim", color_primary: "denim",
    pattern: "denim", material: "denim", style: "casual",
    formality: 2, season: ["primavera","autunno"], occasion: "casual, weekend",
    description: "Giacca di jeans classica, lavaggio medio",
    price: 99.00,
    link_url: "https://www.levi.com/it/it/giacca-jeans-trucker-medium-wash-002345.html",
    link_added_at: daysAgo(280),  // SCADUTO da molto
    photo_url: unsplash("photo-1543076447-215ad9ba6923"),
  },
  {
    category: "capospalla", subcategory: "blazer",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "lana", style: "formale",
    formality: 5, season: ["autunno","inverno","primavera"], occasion: "lavoro, cerimonia",
    description: "Blazer nero in lana, taglio sartoriale",
    price: 280.00,
    link_url: "https://www.boggi.com/it/uomo/blazer-nero-lana-BG001.html",
    link_added_at: daysAgo(25),
    photo_url: unsplash("photo-1592343516109-362f7bd871aa"),
  },

  // ============================================================================
  // ACCESSORI (4)
  // ============================================================================
  {
    category: "accessori", subcategory: "cintura",
    color: "marrone", color_primary: "marrone",
    pattern: "tinta unita", material: "pelle", style: "elegante",
    formality: 4, season: ["primavera","estate","autunno","inverno"], occasion: "lavoro, casual",
    description: "Cintura in pelle marrone con fibbia metallo",
    price: 49.90,
    link_url: "https://www.fossil.com/it/it/men/belts/brown-leather-belt-PROD001.html",
    link_added_at: daysAgo(180),
    photo_url: unsplash("photo-1664286074176-5206ee5dc878"),
  },
  {
    category: "accessori", subcategory: "borsa",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "pelle", style: "elegante",
    formality: 4, season: ["primavera","estate","autunno","inverno"], occasion: "lavoro, viaggio",
    description: "Borsa tracolla in pelle nera",
    price: 159.00,
    link_url: "https://www.coach.com/it/uomo/borsa-tracolla-pelle-nera-COACH001.html",
    link_added_at: daysAgo(15),
    photo_url: unsplash("photo-1598532163257-ae3c6b2524b6"),
  },
  {
    category: "accessori", subcategory: "occhiali",
    color: "nero", color_primary: "nero",
    pattern: "tinta unita", material: "altro", style: "casual",
    formality: 3, season: ["primavera","estate"], occasion: "casual, mare",
    description: "Occhiali da sole aviator neri",
    price: 89.00,
    link_url: "https://www.ray-ban.com/it/aviator-classic-nero-RB3025.html",
    link_added_at: daysAgo(220),  // SCADUTO
    photo_url: unsplash("photo-1511499767150-a48a237f0083"),
  },
  {
    category: "accessori", subcategory: "occhiali",
    color: "marrone", color_primary: "marrone",
    pattern: "tinta unita", material: "altro", style: "casual",
    formality: 3, season: ["primavera","estate"], occasion: "casual",
    description: "Occhiali da sole wayfarer tartaruga",
    price: 79.00,
    link_url: "https://www.persol.com/it/uomo/wayfarer-tartaruga-PERS001.html",
    link_added_at: daysAgo(95),
    photo_url: unsplash("photo-1572635196237-14b3f281503f"),
  },

  // ============================================================================
  // COMPLETI (2)
  // ============================================================================
  {
    category: "completo", subcategory: "completo",
    color: "grigio", color_primary: "grigio",
    pattern: "tinta unita", material: "lana", style: "formale",
    formality: 5, season: ["autunno","inverno","primavera"], occasion: "lavoro, cerimonia",
    description: "Completo grigio antracite due pezzi, lana",
    price: 599.00,
    link_url: "https://www.suitsupply.com/it_it/completi/grigio-antracite-001234.html",
    link_added_at: daysAgo(50),
    photo_url: unsplash("photo-1618886614638-80e3c103d31a"),
  },
  {
    category: "completo", subcategory: "completo",
    color: "blu navy", color_primary: "blu navy",
    pattern: "tinta unita", material: "lana", style: "formale",
    formality: 5, season: ["autunno","inverno","primavera"], occasion: "cerimonia, gala",
    description: "Completo blu navy due pezzi, taglio italiano",
    price: 749.00,
    link_url: "https://www.lubiam.it/uomo/completi/blu-navy-italian-cut-LB001.html",
    link_added_at: daysAgo(180),
    photo_url: unsplash("photo-1617137968427-85924c800a22"),
  },
];
