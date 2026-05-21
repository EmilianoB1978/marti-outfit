// =============================================================================
// Cloudflare Worker - Proxy Claude API
// =============================================================================
// Custodisce la ANTHROPIC_API_KEY e fa da intermediario tra il frontend
// (PWA su GitHub Pages) e Claude API.
//
// Setup:
//   1. Vai su https://dash.cloudflare.com -> Workers & Pages -> Create
//   2. Crea un Worker (es. nome "marty-outfit-proxy")
//   3. Incolla questo codice
//   4. Settings -> Variables -> Add (encrypted):
//        ANTHROPIC_API_KEY = sk-ant-... (per /analyze, /suggest)
//        HF_API_TOKEN      = hf_...     (per /remove-bg) - opzionale
//        ALLOWED_ORIGIN    = https://tuonome.github.io
//   5. Deploy. Poi metti l'URL del Worker in js/claude-api.js
//
// HF_API_TOKEN:
//   - Crea account su https://huggingface.co (gratuito)
//   - Settings -> Access Tokens -> New token (read) -> copia
//   - Free tier: ~300 immagini/ora, sufficiente per uso personale
// =============================================================================

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const HF_BG_REMOVAL_MODEL = "briaai/RMBG-1.4";
const HF_INFERENCE_API = "https://api-inference.huggingface.co/models/";

// Prompt per analisi foto: chiediamo JSON strutturato ricco
const ANALYZE_PROMPT = `Analizza questo capo d'abbigliamento e restituisci SOLO un oggetto JSON (nessun testo prima o dopo) con questi campi:

{
  "category": "top|bottom|scarpe|accessori|capospalla|completo",
  "subcategory": "tipo specifico in italiano (es. 't-shirt', 'jeans slim', 'sneakers', 'blazer', 'maglione girocollo', 'gonna a tubo')",
  "color_primary": "array di colori principali in italiano (es. ['blu navy'] o ['bianco', 'rosso']). Sempre array.",
  "color_secondary": "array di colori secondari (se presenti). Sempre array, anche vuoto: [].",
  "color": "alias del primo colore principale (compat) oppure stringa vuota.",
  "pattern": "array di pattern (es. ['tinta unita'] o ['righe', 'floreale']). Valori ammessi: tinta unita|righe|quadri|floreale|denim|grafico|animalier|pois|tartan|altro. Sempre array.",
  "material": "array di materiali (es. ['cotone'] o ['lana', 'cashmere']). Valori ammessi: cotone|denim|lana|pelle|lino|sintetico|cashmere|seta|maglia|velluto|jersey|altro. Sempre array.",
  "style": "casual|elegante|sportivo|formale|streetwear",
  "formality": numero 1-5 (1=molto casual home/sport, 3=neutro, 5=molto formale gala/cerimonia),
  "season": array di stagioni adatte. Valori ammessi (in ordine cronologico annuale, includi tutte quelle che si applicano): "primavera", "primestate" (transizione primavera-estate), "estate", "estunno" (fine estate), "autunno", "autinverno" (autunno freddo), "inverno", "inveravera" (fine inverno).
  "occasion": "array di occasioni d'uso (es. ['lavoro'] o ['lavoro', 'aperitivo', 'cena']). Sempre array.",
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
// Endpoint: POST /remove-bg
// =============================================================================
// Body JSON: { "imageUrl": "<URL pubblico Firebase Storage>" }
// Response: PNG binary con sfondo trasparente (Content-Type: image/png)
// Errori: JSON { error: "..." }
//
// Pipeline:
//   1. Scarica l'immagine dalla URL fornita (deve essere pubblica)
//   2. POST binary -> Hugging Face Inference API (modello briaai/RMBG-1.4)
//   3. HF ritorna PNG con bg trasparente, lo passiamo al client
//
// briaai/RMBG-1.4: modello leggero specializzato in soggetto/sfondo,
// qualita' eccellente su vestiti su qualsiasi sfondo. Gratis su HF.
async function handleRemoveBg(req, env, cors) {
  if (!env.HF_API_TOKEN) {
    return errorResponse(
      "HF_API_TOKEN non configurato. Crea token su huggingface.co/settings/tokens e aggiungilo come Encrypted Variable nel Worker.",
      503, cors
    );
  }

  const { imageUrl } = await req.json();
  if (!imageUrl) return errorResponse("Campo 'imageUrl' mancante", 400, cors);

  // Step 1: scarica immagine sorgente
  let imageBytes;
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return errorResponse(`Foto non scaricabile (HTTP ${imgRes.status})`, 502, cors);
    }
    imageBytes = await imgRes.arrayBuffer();
  } catch (err) {
    return errorResponse("Errore download foto: " + err.message, 502, cors);
  }

  // Step 2: chiama Hugging Face Inference API
  // RMBG-1.4 accetta binary diretto, ritorna PNG cutout binary
  let hfRes;
  try {
    hfRes = await fetch(HF_INFERENCE_API + HF_BG_REMOVAL_MODEL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.HF_API_TOKEN,
        "Content-Type": "application/octet-stream",
        "Accept": "image/png",
        // Se il modello e' "cold" (non in memoria), HF lo carica al primo
        // hit (10-20s). Senza questo header verremmo bouncerati con 503.
        "X-Wait-For-Model": "true",
      },
      body: imageBytes,
    });
  } catch (err) {
    return errorResponse("Errore connessione Hugging Face: " + err.message, 502, cors);
  }

  if (!hfRes.ok) {
    // HF a volte risponde JSON con dettagli errore anche su 200, qui solo non-ok
    let detail;
    try { detail = await hfRes.text(); } catch { detail = "(no body)"; }
    return errorResponse(`Hugging Face API (${hfRes.status}): ${detail.slice(0, 300)}`, hfRes.status, cors);
  }

  // Step 3: passa il PNG binary al client
  const cutoutBytes = await hfRes.arrayBuffer();
  return new Response(cutoutBytes, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
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

    if (request.method !== "POST") {
      return errorResponse("Method not allowed", 405, cors);
    }

    try {
      // /remove-bg richiede solo HF_API_TOKEN (gestito nell'handler).
      // /analyze e /suggest richiedono ANTHROPIC_API_KEY.
      if (url.pathname === "/remove-bg") return await handleRemoveBg(request, env, cors);

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
