// =============================================================================
// Ricerca globale (capi + outfit + capsule)
// =============================================================================

import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as Capsules from "./capsules.js";

let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 1000;  // 30s

/**
 * Carica tutti i dati cercabili (cached) e ritorna { items, outfits, capsules }.
 */
async function getSearchData() {
  if (cachedData && (Date.now() - cacheTime) < CACHE_TTL) return cachedData;

  const [items, outfits, capsules] = await Promise.all([
    Wardrobe.listItems(),
    Outfit.listSavedOutfits(),
    Capsules.listCapsules(),
  ]);

  cachedData = { items, outfits, capsules };
  cacheTime = Date.now();
  return cachedData;
}

/** Normalizza una stringa per fuzzy match (rimuove accenti, lowercase). */
function normalize(s) {
  if (!s) return "";
  return String(s).toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Verifica se il "haystack" contiene il "needle" (case+accent insensitive). */
function matches(haystack, needle) {
  return normalize(haystack).includes(needle);
}

/**
 * Cerca tra capi, outfit, capsule. Ritorna 3 array di risultati.
 */
async function performSearch(query) {
  const q = normalize(query);
  if (q.length < 2) return { items: [], outfits: [], capsules: [] };

  const data = await getSearchData();

  const itemMatches = data.items.filter(it =>
    matches(it.category, q) ||
    matches(it.subcategory, q) ||
    matches(it.color || it.color_primary, q) ||
    matches(it.color_secondary, q) ||
    matches(it.style, q) ||
    matches(it.pattern, q) ||
    matches(it.material, q) ||
    matches(it.occasion, q) ||
    matches(it.notes, q) ||
    matches(it.description, q) ||
    (Array.isArray(it.season) && it.season.some(s => matches(s, q)))
  );

  const outfitMatches = data.outfits.filter(o =>
    matches(o.title, q) ||
    matches(o.context, q) ||
    matches(o.description, q)
  );

  const capsuleMatches = data.capsules.filter(c =>
    matches(c.name, q) ||
    matches(c.icon, q)
  );

  return {
    items: itemMatches.slice(0, 8),
    outfits: outfitMatches.slice(0, 5),
    capsules: capsuleMatches.slice(0, 5),
  };
}

/**
 * Apre l'overlay di ricerca full-screen.
 */
export function openSearch() {
  if (document.getElementById("search-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "search-overlay";
  overlay.className = "search-overlay";
  overlay.innerHTML = `
    <div class="search-header">
      <span class="search-icon">🔍</span>
      <input type="text" class="search-input" id="search-input" placeholder="Cerca capi, outfit, capsule..." autocomplete="off" />
      <button class="btn-icon" id="search-close" aria-label="Chiudi">✕</button>
    </div>
    <div class="search-results" id="search-results">
      <p class="search-hint">Scrivi almeno 2 caratteri per cercare.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#search-input");
  const results = overlay.querySelector("#search-results");

  // Focus immediato (con delay per iOS che ritarda la tastiera)
  setTimeout(() => input.focus(), 100);

  // Debounce input
  let debTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debTimer);
    debTimer = setTimeout(() => doSearch(input.value), 200);
  });

  // Chiudi
  function close() { overlay.remove(); }
  overlay.querySelector("#search-close").addEventListener("click", close);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) close();
  });

  // Esc per chiudere
  function onKey(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); }
  }
  document.addEventListener("keydown", onKey);

  async function doSearch(query) {
    if (query.trim().length < 2) {
      results.innerHTML = `<p class="search-hint">Scrivi almeno 2 caratteri per cercare.</p>`;
      return;
    }

    results.innerHTML = `<p class="search-hint">⏳ Ricerca...</p>`;

    try {
      const r = await performSearch(query);
      renderResults(r, results);
    } catch (err) {
      console.error(err);
      results.innerHTML = `<p class="search-hint">Errore: ${err.message}</p>`;
    }
  }
}

function renderResults({ items, outfits, capsules }, container) {
  const total = items.length + outfits.length + capsules.length;
  if (total === 0) {
    container.innerHTML = `<p class="search-hint">Nessun risultato. Prova un altro termine.</p>`;
    return;
  }

  let html = "";

  if (items.length > 0) {
    html += `<div class="search-section"><div class="search-section-title">👕 Capi (${items.length})</div>`;
    html += items.map(it => `
      <div class="search-result" data-type="item" data-id="${it.id}">
        <div class="search-result-thumb">
          ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : '👕'}
        </div>
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(it.subcategory || it.category || 'Capo')}</div>
          <div class="search-result-sub">${[it.color || it.color_primary, it.style].filter(Boolean).map(escapeHtml).join(' · ')}</div>
        </div>
      </div>
    `).join("");
    html += `</div>`;
  }

  if (outfits.length > 0) {
    html += `<div class="search-section"><div class="search-section-title">✨ Outfit (${outfits.length})</div>`;
    html += outfits.map(o => `
      <div class="search-result" data-type="outfit" data-id="${o.id}">
        <div class="search-result-thumb">✨</div>
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(o.title)}</div>
          <div class="search-result-sub">${escapeHtml(o.context || '')}</div>
        </div>
      </div>
    `).join("");
    html += `</div>`;
  }

  if (capsules.length > 0) {
    html += `<div class="search-section"><div class="search-section-title">🎒 Capsule (${capsules.length})</div>`;
    html += capsules.map(c => `
      <a class="search-result" href="./capsule-detail.html?id=${c.id}">
        <div class="search-result-thumb">${escapeHtml(c.icon || '🎒')}</div>
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(c.name)}</div>
          <div class="search-result-sub">${(c.item_ids || []).length} capi</div>
        </div>
      </a>
    `).join("");
    html += `</div>`;
  }

  container.innerHTML = html;

  // Click handlers per item/outfit (apre il modal/scrolla nella pagina)
  container.querySelectorAll(".search-result[data-type='item']").forEach(el => {
    el.addEventListener("click", () => {
      // Notifico la pagina che l'utente vuole aprire l'item
      document.getElementById("search-overlay")?.remove();
      window.dispatchEvent(new CustomEvent("marty:open-item", { detail: { id: el.dataset.id } }));
    });
  });
  container.querySelectorAll(".search-result[data-type='outfit']").forEach(el => {
    el.addEventListener("click", () => {
      document.getElementById("search-overlay")?.remove();
      // Vai al tab Outfit
      const btn = document.querySelector('.nav-btn[data-page="outfits"]');
      if (btn) btn.click();
    });
  });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
