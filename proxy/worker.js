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
//        ANTHROPIC_API_KEY  = sk-ant-... (per /analyze, /suggest)
//        REMOVE_BG_API_KEY  = ...        (per /remove-bg) - opzionale
//        ALLOWED_ORIGIN     = https://tuonome.github.io
//   5. Deploy. Poi metti l'URL del Worker in js/claude-api.js
//
// REMOVE_BG_API_KEY:
//   - Crea account gratuito su https://www.remove.bg/users/sign_up
//   - Profilo (alto dx) -> My API Key -> Show/Copia
//   - Free tier: 50 immagini/mese (poi $0.20/img). Per uso personale e' ok.
//   - Hugging Face Inference API gratuita dismessa nel 2025: alternative
//     valutate (Photoroom, Replicate, HF Spaces) ma remove.bg ha free tier
//     piu' ampio e qualita' superiore per fashion.
// =============================================================================

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const REMOVE_BG_API = "https://api.remove.bg/v1.0/removebg";

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

// Prompt per analisi outfit completo: identifica tutti i capi indossati
// con bounding box per crop separato + tag di catalogazione.
const ANALYZE_OUTFIT_PROMPT = `Analizza questa foto di una persona vestita e identifica TUTTI i capi indossati visibili: top, bottom, scarpe, accessori (borse, cinture, occhiali, gioielli grandi), capospalla.

Per ogni capo restituisci la posizione (bounding box) e i tag di catalogazione.

REGOLE bounding box (CRITICHE per qualita' del crop):
- Coordinate NORMALIZZATE 0-1 in formato [x, y, w, h] dove (0,0)=alto-sinistra (1,1)=basso-destra
- Il bbox deve essere il piu' STRETTO POSSIBILE attorno al SOLO capo (no padding, ci pensa il sistema)
- Per un top: SOLO la zona del busto+braccia, NON includere il volto sopra ne' i pantaloni sotto
- Per un bottom: SOLO la zona dei pantaloni/gonna, NON includere il top sopra ne' le scarpe sotto
- Per le scarpe: SOLO i piedi, includere entrambe le scarpe in un unico bbox
- Per accessori piccoli (occhiali, gioielli): bbox MINIMO 8% di lato per evitare crop troppo piccoli
- I bbox di capi diversi possono sovrapporsi leggermente (es. top + capospalla)
- Ignora viso, mani, capelli, sfondo
- Se la foto NON contiene una persona vestita (es. capo singolo a terra), ritorna garments: []

Schema JSON di output (SOLO JSON, niente markdown, niente backticks):

{
  "garments": [
    {
      "bbox": [x, y, w, h],
      "category": "top|bottom|scarpe|accessori|capospalla|completo",
      "subcategory": "tipo specifico (es. 'camicetta', 'pantaloni palazzo', 'sneakers')",
      "color_primary": ["array colori principali in italiano"],
      "color_secondary": [],
      "pattern": ["tinta unita|righe|quadri|floreale|denim|grafico|animalier|pois|tartan|altro"],
      "material": ["cotone|denim|lana|pelle|lino|sintetico|cashmere|seta|maglia|velluto|jersey|altro"],
      "style": "casual|elegante|sportivo|formale|streetwear",
      "formality": 1-5,
      "season": ["primavera|primestate|estate|estunno|autunno|autinverno|inverno|inveravera"],
      "occasion": ["array"],
      "description": "max 80 caratteri"
    }
  ]
}

Importante: formality DEVE essere numero (non stringa). Se non riconosci un dato, null.`;

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
// Endpoint: POST /analyze-outfit
// =============================================================================
// Body: { "image": "<base64>", "mimeType": "image/jpeg" }
// Output: { "garments": [{ bbox, category, ...tags }] }
async function handleAnalyzeOutfit(req, env, cors) {
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
      max_tokens: 2000,  // outfit completo = piu' capi = output piu' lungo di /analyze
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType || "image/jpeg", data: image }
          },
          { type: "text", text: ANALYZE_OUTFIT_PROMPT }
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
    const parsed = extractJson(text);
    const garments = Array.isArray(parsed.garments) ? parsed.garments : [];
    return jsonResponse({ garments }, 200, cors);
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
// Provider: remove.bg API
//   - Endpoint: POST https://api.remove.bg/v1.0/removebg
//   - Auth: header X-Api-Key
//   - Body: multipart/form-data con campi:
//       image_url   (URL pubblica) OPPURE image_file (binary)
//       size        (auto = default, preserva risoluzione fino a 4 MP free)
//       format      (auto, png, jpg, zip)
//   - Response: PNG binary con sfondo trasparente
//   - Rate limit free: 50 immagini/mese, 1 chiamata/sec
async function handleRemoveBg(req, env, cors) {
  if (!env.REMOVE_BG_API_KEY) {
    return errorResponse(
      "REMOVE_BG_API_KEY non configurato. Crea account gratuito su remove.bg, copia API Key dal profilo, aggiungila come Encrypted Variable nel Worker.",
      503, cors
    );
  }

  const { imageUrl, type } = await req.json();
  if (!imageUrl) return errorResponse("Campo 'imageUrl' mancante", 400, cors);

  // remove.bg accetta direttamente una URL pubblica: niente download intermedio.
  // Parametro 'type' opzionale:
  //   - 'auto' (default): detection automatica - va bene per capo singolo gia' isolato
  //   - 'product': vestiti/oggetti - usare quando l'immagine contiene una persona
  //                ma vogliamo isolare SOLO il prodotto/capo (es. crop da outfit)
  //   - 'person': estrae la persona intera (NON usare per capi singoli)
  // Valori ammessi remove.bg: auto|person|product|car|animal|graphic|transportation|other
  const form = new FormData();
  form.append("image_url", imageUrl);
  form.append("size", "auto");
  form.append("format", "png");
  if (type && ["product", "person", "auto", "car", "animal", "graphic", "transportation", "other"].includes(type)) {
    form.append("type", type);
  }

  let rbRes;
  try {
    rbRes = await fetch(REMOVE_BG_API, {
      method: "POST",
      headers: {
        "X-Api-Key": env.REMOVE_BG_API_KEY,
        // NB: NON settare Content-Type quando si usa FormData (il browser/runtime
        // aggiunge il boundary multipart corretto in automatico).
      },
      body: form,
    });
  } catch (err) {
    return errorResponse("Errore connessione remove.bg: " + err.message, 502, cors);
  }

  if (!rbRes.ok) {
    let detail;
    try {
      // remove.bg ritorna JSON con { errors: [{ title, code, detail }] }
      const j = await rbRes.json();
      detail = (j.errors && j.errors[0])
        ? `${j.errors[0].title || ''} ${j.errors[0].detail || ''}`.trim()
        : JSON.stringify(j);
    } catch {
      try { detail = await rbRes.text(); } catch { detail = "(no body)"; }
    }
    // 402 = credito esaurito (50/mese free); 403 = chiave invalida; 400 = URL non valida
    return errorResponse(`remove.bg (${rbRes.status}): ${detail.slice(0, 300)}`, rbRes.status, cors);
  }

  // PNG binary cutout
  const cutoutBytes = await rbRes.arrayBuffer();
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
      if (url.pathname === "/analyze-outfit") return await handleAnalyzeOutfit(request, env, cors);
      if (url.pathname === "/suggest") return await handleSuggest(request, env, cors);
      return errorResponse("Endpoint non trovato", 404, cors);
    } catch (err) {
      return errorResponse("Errore interno: " + err.message, 500, cors);
    }
  }
};
