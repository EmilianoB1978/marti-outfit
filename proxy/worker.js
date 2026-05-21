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
//        ANTHROPIC_API_KEY  = sk-ant-... (per /analyze, /suggest, /analyze-outfit)
//        REMOVE_BG_API_KEY  = ...        (per /remove-bg)
//        OPENAI_API_KEY     = sk-...     (per /generate-garment, opzionale)
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
const OPENAI_IMAGES_EDIT_API = "https://api.openai.com/v1/images/edits";
const OPENAI_IMAGE_MODEL = "gpt-image-1";
// Cloudflare Workers AI: flux-1-schnell e' text-to-image gratuito (10k Neurons
// gratis/giorno = ~400 immagini/giorno). Richiede AI binding nel Worker
// (Settings -> Bindings -> Workers AI -> Variable name: AI).
const CF_AI_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

// Prompt per analisi foto: chiediamo JSON strutturato ricco. La lista delle
// sotto-categorie disponibili viene iniettata dinamicamente dal client (campo
// available_subcategories nel body) e appesa al prompt per istruire Claude
// a preferire valori esistenti invece di inventarne.
const ANALYZE_PROMPT = `Analizza questo capo d'abbigliamento e restituisci SOLO un oggetto JSON (nessun testo prima o dopo) con questi campi:

{
  "category": "top|bottom|vestito|scarpe|accessori|capospalla|completo",
  "subcategory": "tipo specifico in italiano. REGOLA: se il capo corrisponde a una delle sotto-categorie esistenti elencate sotto, USA esattamente quel valore. Solo se nessuna sotto-categoria esistente descrive il capo, proponi un nome nuovo in italiano minuscolo, conciso (1-3 parole)",
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

// Prompt per analisi outfit completo: identifica tutti i capi e prepara
// una descrizione visuale dettagliata per la generazione AI delle foto-prodotto.
const ANALYZE_OUTFIT_PROMPT = `Analizza questa foto di una persona vestita e identifica TUTTI i capi indossati visibili: top, bottom, scarpe, accessori (borse, cinture, occhiali, gioielli grandi), capospalla.

Per ogni capo:
1. Estrai i tag di catalogazione (categoria, colori, pattern, ecc.)
2. Scrivi una "image_prompt" in INGLESE che descriva il SOLO capo nel dettaglio visivo: forma, taglio, lunghezza, vestibilita', colori esatti (con riferimenti hex o nome preciso es. 'burgundy', 'cream'), texture/materiale visibile, dettagli (bottoni, tasche, cuciture, scollo), eventuale stampa o pattern. Sii MOLTO descrittivo: questo prompt viene usato per generare un'immagine product-shot del capo isolato.

Schema JSON di output (SOLO JSON, niente markdown, niente backticks):

{
  "garments": [
    {
      "category": "top|bottom|scarpe|accessori|capospalla|completo",
      "subcategory": "tipo specifico in italiano (es. 'camicia polo', 'pantaloni palazzo', 'sneakers')",
      "color_primary": ["array colori principali in italiano"],
      "color_secondary": [],
      "pattern": ["tinta unita|righe|quadri|floreale|denim|grafico|animalier|pois|tartan|altro"],
      "material": ["cotone|denim|lana|pelle|lino|sintetico|cashmere|seta|maglia|velluto|jersey|altro"],
      "style": "casual|elegante|sportivo|formale|streetwear",
      "formality": 1-5,
      "season": ["primavera|primestate|estate|estunno|autunno|autinverno|inverno|inveravera"],
      "occasion": ["array"],
      "description": "max 80 caratteri in italiano",
      "image_prompt": "Descrizione dettagliata in INGLESE del SOLO capo per generation AI (60-120 parole, molto specifica sui dettagli visivi)"
    }
  ]
}

Importante:
- formality DEVE essere numero (non stringa). Se non riconosci un dato, null.
- image_prompt deve essere in inglese e descrivere SOLO il capo (no persona, no contesto)
- Se la foto NON contiene una persona vestita, ritorna garments: []`;

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
  const { image, mimeType, available_subcategories } = await req.json();
  if (!image) return errorResponse("Campo 'image' mancante", 400, cors);

  // Costruisco il prompt aggiungendo la lista delle sub disponibili (se
  // fornita dal client). Questo guida Claude a riutilizzare valori esistenti
  // invece di inventarne nuovi a ogni capo.
  let finalPrompt = ANALYZE_PROMPT;
  if (Array.isArray(available_subcategories) && available_subcategories.length > 0) {
    const list = available_subcategories
      .filter(s => typeof s === "string" && s.trim())
      .map(s => `- ${s.trim()}`)
      .join("\n");
    finalPrompt += `\n\nSotto-categorie ESISTENTI (preferiscine UNA da questa lista se descrive il capo, anche se non perfetta):\n${list}\n\nProponi un nuovo valore SOLO se nessuna voce di questa lista e' applicabile.`;
  }

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
          { type: "text", text: finalPrompt }
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
  const { image, mimeType, available_subcategories } = await req.json();
  if (!image) return errorResponse("Campo 'image' mancante", 400, cors);

  // Stesso meccanismo di /analyze: appendi la lista sub esistenti al prompt
  // per evitare che Claude inventi nomi nuovi a ogni outfit.
  let finalPrompt = ANALYZE_OUTFIT_PROMPT;
  if (Array.isArray(available_subcategories) && available_subcategories.length > 0) {
    const list = available_subcategories
      .filter(s => typeof s === "string" && s.trim())
      .map(s => `- ${s.trim()}`)
      .join("\n");
    finalPrompt += `\n\nSotto-categorie ESISTENTI nel guardaroba (USA queste se descrivono il capo, anche se non perfette):\n${list}\n\nProponi una NUOVA sotto-categoria SOLO se nessuna voce della lista e' applicabile.`;
  }

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
          { type: "text", text: finalPrompt }
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
// Generazione via Cloudflare Workers AI (flux-1-schnell, gratuito)
// =============================================================================
async function generateViaCloudflareAI(prompt, env, cors) {
  if (!env.AI) {
    return errorResponse(
      "Workers AI binding 'AI' non configurato. Worker Settings -> Bindings -> Add Workers AI -> Variable name: AI.",
      503, cors
    );
  }

  // Wrap del prompt utente con direttive di stile e-commerce
  const fullPrompt =
    "Professional e-commerce product photography of a single fashion garment, " +
    "isolated on a pure clean background, front view, flat lay or invisible " +
    "mannequin style, studio lighting, no person, no model, no hands, no body " +
    "parts, no shadows, sharp focus, high detail, magazine quality. " +
    "Garment description: " + prompt;

  let aiResponse;
  try {
    // Workers AI binding ritorna un Response stream (image/png o image/jpeg)
    // oppure { image: base64 } a seconda del modello. flux-1-schnell ritorna
    // { image: base64 } come JSON.
    aiResponse = await env.AI.run(CF_AI_IMAGE_MODEL, {
      prompt: fullPrompt,
      // steps default = 4 (flux-schnell, ottimizzato per velocita')
    });
  } catch (err) {
    return errorResponse("Workers AI error: " + (err.message || String(err)), 502, cors);
  }

  // aiResponse puo' essere:
  //   - { image: "<base64>" } (modelli text-to-image moderni)
  //   - ReadableStream / Uint8Array (modelli legacy)
  let pngBytes;
  if (aiResponse && typeof aiResponse === "object" && aiResponse.image) {
    const bin = atob(aiResponse.image);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    pngBytes = buf.buffer;
  } else if (aiResponse instanceof ReadableStream) {
    pngBytes = await new Response(aiResponse).arrayBuffer();
  } else if (aiResponse instanceof Uint8Array) {
    pngBytes = aiResponse.buffer;
  } else {
    return errorResponse("Workers AI: formato risposta non riconosciuto", 502, cors);
  }

  return new Response(pngBytes, {
    status: 200,
    headers: { "Content-Type": "image/png", ...cors },
  });
}

// =============================================================================
// Endpoint: POST /generate-garment
// =============================================================================
// Genera la foto-prodotto di un singolo capo.
//
// Provider scelto in base al campo 'provider' (default 'cf' = gratuito):
//   - 'cf': Cloudflare Workers AI con flux-1-schnell (TEXT-to-image, gratuito
//           fino a ~400 immagini/giorno). Non vede la foto originale, genera
//           dal solo prompt testuale. Buona qualita' per "capo generico".
//   - 'openai': OpenAI gpt-image-1 con images/edits (image-to-image, ~$0.05/img).
//               Vede la foto originale come reference, fedelta' al capo maggiore.
//
// Body JSON: {
//   "imageUrl": "<URL pubblico della foto outfit>" (usato solo se provider='openai'),
//   "prompt": "<descrizione visuale dettagliata del SOLO capo, in inglese>",
//   "provider": "cf|openai" (default "cf"),
//   "quality": "low|medium|high" (solo provider='openai', default "low")
// }
// Response: PNG binary con sfondo trasparente (Content-Type: image/png)
async function handleGenerateGarment(req, env, cors) {
  const { imageUrl, prompt, provider, quality } = await req.json();
  if (!prompt) return errorResponse("Campo 'prompt' mancante", 400, cors);

  // Dispatch al provider scelto
  const chosen = (provider || "cf").toLowerCase();
  if (chosen === "cf") {
    return await generateViaCloudflareAI(prompt, env, cors);
  }
  if (chosen !== "openai") {
    return errorResponse(`Provider sconosciuto: '${chosen}'. Usa 'cf' o 'openai'.`, 400, cors);
  }

  // Provider 'openai' richiede anche imageUrl come reference
  if (!imageUrl) return errorResponse("Campo 'imageUrl' mancante per provider 'openai'", 400, cors);
  if (!env.OPENAI_API_KEY) {
    return errorResponse(
      "OPENAI_API_KEY non configurata. Crea API key su platform.openai.com e aggiungila come Encrypted Variable nel Worker.",
      503, cors
    );
  }

  // Step 1: scarico la foto outfit come blob
  let imageBytes;
  let imageMime = "image/png";
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return errorResponse(`Foto outfit non scaricabile (HTTP ${imgRes.status})`, 502, cors);
    }
    imageBytes = await imgRes.arrayBuffer();
    imageMime = imgRes.headers.get("Content-Type") || "image/png";
  } catch (err) {
    return errorResponse("Errore download foto: " + err.message, 502, cors);
  }

  // Step 2: chiama OpenAI gpt-image-1 in modalita' "edit" (image-to-image)
  //   - input image: la foto outfit intera (reference)
  //   - prompt: descrizione del SOLO capo da generare isolato
  //   - background: "transparent" -> PNG con alpha (no remove.bg necessario)
  //   - quality: "low" di default per contenere i costi
  //   - size: "1024x1024" e' il minimo supportato da gpt-image-1
  //
  // Wrappiamo il prompt utente con un envelope che chiarisce il task a
  // gpt-image-1, riducendo la possibilita' che generi la persona o lo sfondo.
  const fullPrompt =
    "From the reference photo, generate a clean professional e-commerce " +
    "product shot showing ONLY the following garment, completely isolated, " +
    "on a transparent background, front view, flat lay or invisible mannequin " +
    "style, no person, no model, no hands, no body parts, no other items. " +
    "Match the garment's exact shape, color, fabric and details. " +
    "Garment description: " + prompt;

  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("image", new Blob([imageBytes], { type: imageMime }), "outfit.png");
  form.append("prompt", fullPrompt);
  form.append("background", "transparent");
  form.append("size", "1024x1024");
  form.append("quality", (quality || "low"));
  form.append("output_format", "png");
  form.append("n", "1");

  let oaRes;
  try {
    oaRes = await fetch(OPENAI_IMAGES_EDIT_API, {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY },
      body: form,
    });
  } catch (err) {
    return errorResponse("Errore connessione OpenAI: " + err.message, 502, cors);
  }

  if (!oaRes.ok) {
    let detail;
    try {
      const j = await oaRes.json();
      detail = (j.error && (j.error.message || j.error.code)) || JSON.stringify(j);
    } catch {
      try { detail = await oaRes.text(); } catch { detail = "(no body)"; }
    }
    return errorResponse(`OpenAI (${oaRes.status}): ${detail.slice(0, 400)}`, oaRes.status, cors);
  }

  // Step 3: la response e' JSON { data: [{ b64_json | url }] }
  const oa = await oaRes.json();
  const item = oa && oa.data && oa.data[0];
  if (!item) return errorResponse("OpenAI: risposta senza data", 502, cors);

  let pngBytes;
  if (item.b64_json) {
    // base64 → ArrayBuffer
    const bin = atob(item.b64_json);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    pngBytes = buf.buffer;
  } else if (item.url) {
    const r = await fetch(item.url);
    pngBytes = await r.arrayBuffer();
  } else {
    return errorResponse("OpenAI: nessun b64_json o url nella risposta", 502, cors);
  }

  return new Response(pngBytes, {
    status: 200,
    headers: { "Content-Type": "image/png", ...cors },
  });
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
      if (url.pathname === "/generate-garment") return await handleGenerateGarment(request, env, cors);
      if (url.pathname === "/suggest") return await handleSuggest(request, env, cors);
      return errorResponse("Endpoint non trovato", 404, cors);
    } catch (err) {
      return errorResponse("Errore interno: " + err.message, 500, cors);
    }
  }
};
