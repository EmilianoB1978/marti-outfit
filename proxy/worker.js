// =============================================================================
// Cloudflare Worker - Proxy Claude API
// =============================================================================
// Custodisce la ANTHROPIC_API_KEY e fa da intermediario tra il frontend
// (PWA su GitHub Pages) e Claude API.
//
// Setup:
//   1. Vai su https://dash.cloudflare.com -> Workers & Pages -> Create
//   2. Crea un Worker (es. nome "my-wardrobe-proxy")
//   3. Incolla questo codice
//   4. Settings -> Variables -> Add (encrypted):
//        ANTHROPIC_API_KEY = sk-ant-...
//        ALLOWED_ORIGIN = https://tuonome.github.io
//   5. Deploy. Poi metti l'URL del Worker in js/claude-api.js
// =============================================================================

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// Prompt per analisi foto: chiediamo JSON strutturato ricco
const ANALYZE_PROMPT = `Analizza questo capo d'abbigliamento e restituisci SOLO un oggetto JSON (nessun testo prima o dopo) con questi campi:

{
  "category": "top|bottom|scarpe|accessori|capospalla|completo",
  "subcategory": "tipo specifico in italiano (es. 't-shirt', 'jeans slim', 'sneakers', 'blazer', 'maglione girocollo', 'gonna a tubo')",
  "color_primary": "colore principale in italiano (es. 'blu navy', 'bianco panna', 'beige sabbia')",
  "color_secondary": "secondo colore se presente, altrimenti null",
  "color": "alias di color_primary (per compatibilita')",
  "pattern": "tinta unita|righe|quadri|floreale|denim|grafico|animalier|altro",
  "material": "cotone|denim|lana|pelle|lino|sintetico|cashmere|seta|maglia|altro",
  "style": "casual|elegante|sportivo|formale|streetwear",
  "formality": numero 1-5 (1=molto casual home/sport, 3=neutro, 5=molto formale gala/cerimonia),
  "season": ["primavera","estate","autunno","inverno"] (array, includi tutte le stagioni adatte),
  "occasion": "occasioni d'uso suggerite, separate da virgola (es. 'lavoro, aperitivo')",
  "description": "breve descrizione visiva del capo in italiano, max 80 caratteri (es. 'maglietta cotone bianco taglio classico')"
}

Importante:
- Sii preciso ma sintetico
- Se non riesci a determinare un campo, usa null (non inventare)
- formality DEVE essere un numero (1, 2, 3, 4 o 5), non una stringa

Rispondi SOLO con il JSON, niente markdown, niente backticks.`;

// Prompt per outfit: input = lista capi + contesto + meteo opzionale
function buildOutfitPrompt(context, items, weather) {
  // Formato compatto delle features rilevanti (formality, material, pattern se presenti)
  const fmtItem = (it) => {
    const parts = [
      `ID:${it.id}`,
      it.category || '?',
      it.subcategory ? `(${it.subcategory})` : null,
      it.color_primary || it.color || '?',
      it.style || '?',
      it.formality ? `formalita':${it.formality}/5` : null,
      it.material || null,
      it.pattern || null,
      `stagioni:${(it.season || []).join('/') || '?'}`,
    ].filter(Boolean);
    return `- ${parts.join(' | ')}`;
  };

  return `Sei uno stilista personale. Ho questi capi nel guardaroba:

${items.map(fmtItem).join('\n')}

Suggeriscimi 2-3 outfit COMPLETI per: "${context}".${weather ? '\n\n' + weather + ' Considera questo per la scelta dei capi (es. con pioggia evita scarpe in tela, con caldo preferisci tessuti leggeri).' : ''}

Regole:
- Ogni outfit DEVE includere almeno un top + un bottom (oppure un completo) + scarpe se disponibili.
- Usa SOLO gli ID forniti, non inventarli.
- Combina colori e stili in modo armonioso.
- Considera la stagione/occasione del contesto richiesto.
- Se l'occasione e' formale, preferisci capi con formalita' alta (4-5).
- Se l'occasione e' casual, preferisci 1-3.
- Evita di mischiare materiali troppo diversi (es. pelle pesante con lino estivo).

Rispondi SOLO con un oggetto JSON (nessun testo prima o dopo, nessun markdown):

{
  "outfits": [
    {
      "title": "nome outfit (es. 'Casual chic')",
      "description": "perche' funziona per l'occasione (max 100 caratteri)",
      "item_ids": ["id1", "id2", ...]
    }
  ]
}`;
}

// =============================================================================
// Helpers
// =============================================================================
function corsHeaders(origin, allowedOrigin) {
  // Se ALLOWED_ORIGIN non e' configurato, accetto tutti (utile in dev)
  const allow = allowedOrigin && allowedOrigin !== "*" ? allowedOrigin : (origin || "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors }
  });
}

function errorResponse(message, status, cors) {
  return jsonResponse({ error: message }, status, cors);
}

// Estrae un oggetto JSON dalla risposta di Claude, anche se c'e' rumore intorno.
function extractJson(text) {
  // Rimuove eventuali code fences ```json ... ```
  const cleaned = text.replace(/```(?:json)?\s*|\s*```/g, "").trim();
  // Trova il primo { e l'ultimo } (semplice ma robusto)
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("JSON non trovato nella risposta Claude");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

// =============================================================================
// Endpoint: POST /analyze
// =============================================================================
async function handleAnalyze(req, env, cors) {
  const { image, mimeType } = await req.json();
  if (!image) return errorResponse("Campo 'image' mancante", 400, cors);

  const claudeRes = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType || "image/jpeg", data: image }
          },
          { type: "text", text: ANALYZE_PROMPT }
        ]
      }]
    })
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    return errorResponse("Claude API: " + errText, claudeRes.status, cors);
  }

  const data = await claudeRes.json();
  const text = data.content?.[0]?.text || "";

  try {
    const tags = extractJson(text);
    return jsonResponse({ tags }, 200, cors);
  } catch (err) {
    return errorResponse("Risposta Claude non parseabile: " + text.slice(0, 200), 500, cors);
  }
}

// =============================================================================
// Endpoint: POST /suggest
// =============================================================================
async function handleSuggest(req, env, cors) {
  const { context, items, weather } = await req.json();
  if (!context) return errorResponse("Campo 'context' mancante", 400, cors);
  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse("Campo 'items' mancante o vuoto", 400, cors);
  }

  const prompt = buildOutfitPrompt(context, items, weather);

  const claudeRes = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    return errorResponse("Claude API: " + errText, claudeRes.status, cors);
  }

  const data = await claudeRes.json();
  const text = data.content?.[0]?.text || "";

  try {
    const parsed = extractJson(text);
    // Filtra eventuali ID inventati che non corrispondono ai capi reali
    const validIds = new Set(items.map(it => it.id));
    const outfits = (parsed.outfits || []).map(o => ({
      ...o,
      item_ids: (o.item_ids || []).filter(id => validIds.has(id))
    })).filter(o => o.item_ids.length > 0);

    return jsonResponse({ outfits }, 200, cors);
  } catch (err) {
    return errorResponse("Risposta Claude non parseabile: " + text.slice(0, 200), 500, cors);
  }
}

// =============================================================================
// Endpoint: GET /scrape?url=...
// Estrae metadata prodotto da una pagina e-commerce (Zalando, Zara, H&M, ...)
// Sources (priorita'):
//   1. JSON-LD <script type="application/ld+json"> con @type Product
//   2. Open Graph + meta product:* tags
// Restituisce { title, description, image_url, price, currency, brand,
//               color, material, source_url }
// =============================================================================
async function handleScrape(req, cors) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) return errorResponse("Param 'url' mancante", 400, cors);

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return errorResponse("URL non valido", 400, cors);
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return errorResponse("Solo http/https", 400, cors);
  }

  // Provo fetch con due profili browser. Se uno fallisce, fallback all'altro.
  const profiles = [
    {
      // Desktop Mac Chrome - meno bloccato dei mobile UA su molti shop
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "it-IT,it;q=0.9,en;q=0.5",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    },
    {
      // Mobile iOS Safari (originale)
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "it-IT,it;q=0.9,en;q=0.5",
    },
  ];

  let html = null;
  for (const headers of profiles) {
    try {
      const r = await fetch(parsed.href, {
        headers, redirect: "follow",
        cf: { cacheTtl: 300 },
      });
      if (r.ok) {
        const txt = await r.text();
        // Heuristic: pagina valida se >2KB e non contiene "Access Denied"
        if (txt.length > 2000 && !/Access Denied|Akamai|distil_r_captcha/i.test(txt.slice(0, 5000))) {
          html = txt;
          break;
        }
      }
    } catch { /* prova prossimo profilo */ }
  }

  if (!html) {
    // Ritorno comunque 200 con dati vuoti + flag, cosi' il client puo' aprire
    // il modal "Nuovo capo" col link gia' compilato e l'utente edita a mano.
    return jsonResponse({
      title: null, description: null, image_url: null,
      price: null, currency: null, brand: null,
      color: null, material: null, source_url: parsed.href,
      _blocked: true,
    }, 200, cors);
  }

  const data = extractProductData(html, parsed.href);
  return jsonResponse(data, 200, cors);
}

// Estrae dati prodotto da HTML grezzo (JSON-LD prima, OG meta come fallback).
function extractProductData(html, sourceUrl) {
  const result = {
    title: null, description: null, image_url: null,
    price: null, currency: null, brand: null,
    color: null, material: null, source_url: sourceUrl,
  };

  // 1. JSON-LD: cerco tutti gli script ld+json e prendo il primo Product
  const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = ldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const products = collectProducts(parsed);
      if (products.length > 0) {
        const p = products[0];
        result.title       = result.title       || textOf(p.name);
        result.description = result.description || textOf(p.description);
        result.image_url   = result.image_url   || firstImageUrl(p.image);
        result.brand       = result.brand       || textOf(p.brand?.name || p.brand);
        result.color       = result.color       || textOf(p.color);
        result.material    = result.material    || textOf(p.material);
        const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
        if (offer) {
          result.price    = result.price    || (offer.price !== undefined ? Number(offer.price) : null);
          result.currency = result.currency || textOf(offer.priceCurrency);
        }
      }
    } catch { /* JSON malformato, prosegui */ }
  }

  // 2. Open Graph / meta come fallback per i campi vuoti
  const og = (prop) => extractMeta(html, `property=["']${prop}["']`) || extractMeta(html, `name=["']${prop}["']`);
  result.title       = result.title       || og("og:title")        || extractTitleTag(html);
  result.description = result.description || og("og:description")  || og("description");
  result.image_url   = result.image_url   || og("og:image")        || og("twitter:image");
  result.brand       = result.brand       || og("product:brand")   || og("og:brand");
  if (!result.price) {
    const p = og("product:price:amount") || og("og:price:amount");
    if (p) result.price = Number(p);
  }
  if (!result.currency) {
    result.currency = og("product:price:currency") || og("og:price:currency");
  }
  if (!result.color)    result.color    = og("product:color");
  if (!result.material) result.material = og("product:material");

  // Normalizzazioni
  if (result.image_url && result.image_url.startsWith("//")) {
    result.image_url = "https:" + result.image_url;
  }
  if (result.title) result.title = decodeHtmlEntities(result.title.trim());
  if (result.description) result.description = decodeHtmlEntities(result.description.trim()).slice(0, 500);
  if (result.brand) result.brand = decodeHtmlEntities(result.brand.trim());

  return result;
}

// Raccoglie tutti i nodi Product da un JSON-LD, gestendo @graph e array
function collectProducts(node) {
  const out = [];
  const visit = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (n["@graph"]) visit(n["@graph"]);
    const t = n["@type"];
    const isProduct = (Array.isArray(t) ? t : [t]).some(x => x === "Product");
    if (isProduct) out.push(n);
  };
  visit(node);
  return out;
}

function textOf(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(", ") || null;
  return null;
}

function firstImageUrl(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length) return firstImageUrl(v[0]);
  if (typeof v === "object" && v.url) return v.url;
  return null;
}

function extractMeta(html, attrPattern) {
  const re = new RegExp(`<meta[^>]+${attrPattern}[^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  if (m) return m[1];
  // alt order: content prima di property
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attrPattern}`, "i");
  const m2 = html.match(re2);
  return m2 ? m2[1] : null;
}

function extractTitleTag(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : null;
}

function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

// =============================================================================
// Endpoint: GET /scrape-image?url=...
// Scarica immagine e la rispedisce (bypass CORS per upload Storage).
// =============================================================================
async function handleScrapeImage(req, cors) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) return errorResponse("Param 'url' mancante", 400, cors);

  let parsed;
  try { parsed = new URL(target); } catch { return errorResponse("URL non valido", 400, cors); }
  if (!/^https?:$/.test(parsed.protocol)) return errorResponse("Solo http/https", 400, cors);

  const imgRes = await fetch(parsed.href, {
    headers: {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Referer": parsed.origin + "/",
    },
    cf: { cacheTtl: 86400 },
  }).catch(() => null);

  if (!imgRes || !imgRes.ok) {
    return errorResponse("Immagine non disponibile", 502, cors);
  }

  const ct = imgRes.headers.get("content-type") || "image/jpeg";
  if (!ct.startsWith("image/")) {
    return errorResponse("Risposta non e' un'immagine", 502, cors);
  }

  return new Response(imgRes.body, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=86400",
      ...cors,
    },
  });
}

// =============================================================================
// Entrypoint Worker
// =============================================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      // GET endpoints (scraping pubblico, no API key)
      if (request.method === "GET") {
        if (url.pathname === "/scrape")       return await handleScrape(request, cors);
        if (url.pathname === "/scrape-image") return await handleScrapeImage(request, cors);
        return errorResponse("Endpoint GET non trovato", 404, cors);
      }

      if (request.method !== "POST") {
        return errorResponse("Method not allowed", 405, cors);
      }

      if (!env.ANTHROPIC_API_KEY) {
        return errorResponse("ANTHROPIC_API_KEY non configurata nel Worker", 500, cors);
      }

      if (url.pathname === "/analyze") return await handleAnalyze(request, env, cors);
      if (url.pathname === "/suggest") return await handleSuggest(request, env, cors);
      return errorResponse("Endpoint non trovato", 404, cors);
    } catch (err) {
      return errorResponse("Errore interno: " + err.message, 500, cors);
    }
  }
};
