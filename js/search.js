// =============================================================================
// Ricerca globale (capi + outfit + capsule + note + diario + promemoria)
// =============================================================================

import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as Capsules from "./capsules.js";

let cachedData = null;
let cacheTime = 0;
const CACHE_TTL = 30 * 1000;  // 30s

/**
 * Carica tutti i dati cercabili (cached). Tutte le source sono fail-soft:
 * se un modulo non e' disponibile (es. notes-data.js per chi ha disabilitato
 * la sezione), la lista e' vuota ma la ricerca continua a funzionare sulle
 * altre source.
 */
async function getSearchData() {
  if (cachedData && (Date.now() - cacheTime) < CACHE_TTL) return cachedData;

  const [items, outfits, capsules, notes, diary, reminders] = await Promise.all([
    Wardrobe.listItems().catch(() => []),
    Outfit.listSavedOutfits().catch(() => []),
    Capsules.listCapsules().catch(() => []),
    import("./notes-data.js").then(m => m.listNotes()).catch(() => []),
    import("./diary-data.js").then(m => m.listEntries()).catch(() => []),
    import("./reminders-data.js").then(m => m.listReminders()).catch(() => []),
  ]);

  cachedData = { items, outfits, capsules, notes, diary, reminders };
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

/** Verifica se l'haystack contiene il needle (case+accent insensitive). */
function matches(haystack, needle) {
  if (Array.isArray(haystack)) {
    return haystack.some(v => normalize(v).includes(needle));
  }
  return normalize(haystack).includes(needle);
}

/** Strip HTML tags da body rich-text per la ricerca. */
function stripHtml(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function performSearch(query) {
  const q = normalize(query);
  if (q.length < 2) return { items: [], outfits: [], capsules: [], notes: [], diary: [], reminders: [] };

  const data = await getSearchData();

  const itemMatches = data.items.filter(it =>
    matches(it.category, q) || matches(it.subcategory, q) ||
    matches(it.color || it.color_primary, q) || matches(it.color_secondary, q) ||
    matches(it.style, q) || matches(it.pattern, q) || matches(it.material, q) ||
    matches(it.occasion, q) || matches(it.notes, q) || matches(it.description, q) ||
    (Array.isArray(it.season) && it.season.some(s => matches(s, q)))
  );

  const outfitMatches = data.outfits.filter(o =>
    matches(o.title, q) || matches(o.context, q) || matches(o.description, q)
  );

  const capsuleMatches = data.capsules.filter(c =>
    matches(c.name, q) || matches(c.icon, q)
  );

  const noteMatches = data.notes.filter(n =>
    matches(n.title, q) ||
    matches(stripHtml(n.body), q) ||
    matches(n.tags, q)
  );

  const diaryMatches = data.diary.filter(e =>
    matches(e.title, q) ||
    matches(stripHtml(e.body), q) ||
    matches(e.tags, q) ||
    matches(e.id, q)  // permette ricerca per data YYYY-MM-DD
  );

  const reminderMatches = data.reminders.filter(r =>
    r.status !== "done" && (matches(r.title, q) || matches(r.notes, q))
  );

  return {
    items: itemMatches.slice(0, 8),
    outfits: outfitMatches.slice(0, 5),
    capsules: capsuleMatches.slice(0, 5),
    notes: noteMatches.slice(0, 5),
    diary: diaryMatches.slice(0, 5),
    reminders: reminderMatches.slice(0, 5),
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
      <input type="text" class="search-input" id="search-input" placeholder="Cerca ovunque: capi, note, diario, promemoria..." autocomplete="off" />
      <button class="btn-icon" id="search-close" aria-label="Chiudi">✕</button>
    </div>
    <div class="search-results" id="search-results">
      <p class="search-hint">Scrivi almeno 2 caratteri per cercare.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#search-input");
  const results = overlay.querySelector("#search-results");

  setTimeout(() => input.focus(), 100);

  let debTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debTimer);
    debTimer = setTimeout(() => doSearch(input.value), 200);
  });

  function close() { overlay.remove(); }
  overlay.querySelector("#search-close").addEventListener("click", close);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) close();
  });

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

function renderResults({ items, outfits, capsules, notes, diary, reminders }, container) {
  const total = items.length + outfits.length + capsules.length + notes.length + diary.length + reminders.length;
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

  if (notes.length > 0) {
    html += `<div class="search-section"><div class="search-section-title">📝 Note (${notes.length})</div>`;
    html += notes.map(n => {
      const icon = noteIcon(n.type);
      return `
      <a class="search-result" href="./note-detail.html?id=${n.id}">
        <div class="search-result-thumb">${icon}</div>
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(n.title || '(senza titolo)')}</div>
          <div class="search-result-sub">${escapeHtml(stripHtml(n.body).slice(0, 70))}</div>
        </div>
      </a>`;
    }).join("");
    html += `</div>`;
  }

  if (diary.length > 0) {
    html += `<div class="search-section"><div class="search-section-title">📔 Diario (${diary.length})</div>`;
    html += diary.map(e => {
      const dateLabel = formatDateShort(e.id);
      return `
      <a class="search-result" href="./diary-detail.html?date=${e.id}">
        <div class="search-result-thumb">📔</div>
        <div class="search-result-info">
          <div class="search-result-title">${dateLabel} — ${escapeHtml(e.title || '(senza titolo)')}</div>
          <div class="search-result-sub">${escapeHtml(stripHtml(e.body).slice(0, 70))}</div>
        </div>
      </a>`;
    }).join("");
    html += `</div>`;
  }

  if (reminders.length > 0) {
    html += `<div class="search-section"><div class="search-section-title">⏰ Promemoria (${reminders.length})</div>`;
    html += reminders.map(r => `
      <a class="search-result" href="./reminders.html">
        <div class="search-result-thumb">⏰</div>
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(r.title)}</div>
          <div class="search-result-sub">${reminderDueText(r)}</div>
        </div>
      </a>
    `).join("");
    html += `</div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll(".search-result[data-type='item']").forEach(el => {
    el.addEventListener("click", () => {
      document.getElementById("search-overlay")?.remove();
      window.dispatchEvent(new CustomEvent("marty:open-item", { detail: { id: el.dataset.id } }));
    });
  });
  container.querySelectorAll(".search-result[data-type='outfit']").forEach(el => {
    el.addEventListener("click", () => {
      document.getElementById("search-overlay")?.remove();
      const btn = document.querySelector('.nav-btn[data-page="outfits"]');
      if (btn) btn.click();
    });
  });
}

function noteIcon(type) {
  switch (type) {
    case "wishlist": return "🛍️";
    case "tailor": return "✂️";
    case "moodboard": return "💄";
    case "gift": return "🎁";
    default: return "📝";
  }
}

function formatDateShort(id) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id || "")) return id || "";
  const [y, m, d] = id.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function reminderDueText(r) {
  if (!r.dueAt) return "Senza data";
  const due = r.dueAt.toDate ? r.dueAt.toDate() : new Date(r.dueAt);
  const now = new Date();
  const diff = Math.round((due - now) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} giorni fa`;
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  return due.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
