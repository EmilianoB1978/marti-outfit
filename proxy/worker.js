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

// Prompt per analisi foto: chiediamo JSON strutturato
const ANALYZE_PROMPT = `Analizza questo capo d'abbigliamento e restituisci SOLO un oggetto JSON (nessun testo prima o dopo) con questi campi:

{
  "category": "top|bottom|scarpe|accessori|capospalla|completo",
  "color": "colore principale in italiano (es. 'blu navy', 'bianco', 'beige')",
  "style": "casual|elegante|sportivo|formale|streetwear",
  "season": ["primavera","estate","autunno","inverno"] (array, includi tutte le stagioni adatte),
  "occasion": "occasioni d'uso suggerite, separate da virgola (es. 'lavoro, aperitivo')",
  "description": "breve descrizione del capo in italiano, max 80 caratteri"
}

Rispondi SOLO con il JSON, niente markdown, niente backticks.`;

// Prompt per outfit: input = lista capi + contesto
function buildOutfitPrompt(context, items) {
  return `Sei uno stilista personale. Ho questi capi nel guardaroba:

${items.map(it => `- ID:${it.id} | ${it.category || '?'} | ${it.color || '?'} | ${it.style || '?'} | stagioni: ${(it.season || []).join('/') || '?'} | occasione: ${it.occasion || '?'}`).join('\n')}

Suggeriscimi 2-3 outfit COMPLETI per: "${context}".

Regole:
- Ogni outfit DEVE includere almeno un top + un bottom (oppure un completo) + scarpe se disponibili.
- Usa SOLO gli ID forniti, non inventarli.
- Combina colori e stili in modo armonioso.
- Considera la stagione/occasione del contesto richiesto.

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
  const { context, items } = await req.json();
  if (!context) return errorResponse("Campo 'context' mancante", 400, cors);
  if (!Array.isArray(items) || items.length === 0) {
    return errorResponse("Campo 'items' mancante o vuoto", 400, cors);
  }

  const prompt = buildOutfitPrompt(context, items);

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

    if (!env.ANTHROPIC_API_KEY) {
      return errorResponse("ANTHROPIC_API_KEY non configurata nel Worker", 500, cors);
    }

    try {
      if (url.pathname === "/analyze") return await handleAnalyze(request, env, cors);
      if (url.pathname === "/suggest") return await handleSuggest(request, env, cors);
      return errorResponse("Endpoint non trovato", 404, cors);
    } catch (err) {
      return errorResponse("Errore interno: " + err.message, 500, cors);
    }
  }
};
