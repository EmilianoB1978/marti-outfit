// =============================================================================
// Notes — pagina lista
// =============================================================================

import * as Theme from "./theme/manager.js";
import { listNotes, createNote, NOTE_TYPES, searchNotes, extractAllTags } from "./notes-data.js";

Theme.init();

const state = {
  notes: [],
  filteredNotes: [],
  query: "",
  activeTag: null,
};

function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast hidden"; }, 2400);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Estrae preview testo da body HTML / plain
function previewText(body, maxLen = 100) {
  if (!body) return "";
  // Strip HTML tags, mantieni il testo
  const text = String(body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

function getCoverImage(note) {
  if (Array.isArray(note.attachments) && note.attachments.length > 0 && note.attachments[0].url) {
    return note.attachments[0].url;
  }
  // Per wishlist: usa image_url dei dati strutturati
  if (note.type === "wishlist" && note.data?.image_url) return note.data.image_url;
  if (note.type === "tailor" && note.data?.image_url) return note.data.image_url;
  return null;
}

// =============================================================================
// Render
// =============================================================================
async function load() {
  const list = document.getElementById("notes-list");
  list.innerHTML = `<div class="notes-loading">⏳</div>`;
  try {
    state.notes = await listNotes();
  } catch (err) {
    console.error(err);
    list.innerHTML = `<div class="notes-empty">Errore caricamento</div>`;
    return;
  }
  applyFilters();
  renderTagsFilter();
}

function applyFilters() {
  let filtered = state.notes;
  if (state.query) {
    filtered = searchNotes(filtered, state.query);
  }
  if (state.activeTag) {
    filtered = filtered.filter(n => (n.tags || []).includes(state.activeTag));
  }
  state.filteredNotes = filtered;
  renderList();
}

function renderList() {
  const list = document.getElementById("notes-list");
  if (state.filteredNotes.length === 0) {
    list.innerHTML = `<div class="notes-empty">
      ${state.notes.length === 0
        ? "<strong>Nessuna nota ancora</strong><br><small>Tap sul + per crearne una</small>"
        : "<strong>Nessun risultato</strong><br><small>Prova a cambiare filtro o cercare altro</small>"}
    </div>`;
    return;
  }

  list.innerHTML = state.filteredNotes.map(n => renderCard(n)).join("");
  list.querySelectorAll(".note-card").forEach(card => {
    card.addEventListener("click", () => {
      location.href = `./note-detail.html?id=${encodeURIComponent(card.dataset.id)}`;
    });
  });
}

function renderCard(n) {
  const typeMeta = NOTE_TYPES.find(t => t.key === n.type) || NOTE_TYPES[0];
  const cover = getCoverImage(n);
  const preview = previewText(n.body, 120);
  const tags = (n.tags || []).slice(0, 3).map(t =>
    `<span class="note-tag">${escapeHtml(t)}</span>`
  ).join("");

  // Meta extra contestuale per tipo (con badge stato)
  let extraMeta = "";
  if (n.type === "wishlist") {
    const d = n.data || {};
    const stat = d.status || "wanted";
    const statBadge = stat === "bought" ? "✓ Comprato"
                    : stat === "watching" ? "👀 Aspetto saldo"
                    : "💭 Lo desidero";
    const price = d.target_price ? `🎯 ${formatEur(d.target_price)}` : "";
    extraMeta = `<div class="note-extra-meta">${statBadge}${price ? " · " + price : ""}</div>`;
  } else if (n.type === "tailor") {
    const d = n.data || {};
    const stat = d.status || "in_progress";
    const today = new Date().toISOString().slice(0, 10);
    const isLate = d.due_date && d.due_date < today && stat !== "picked_up";
    const statBadge = stat === "picked_up" ? "✓ Ritirato"
                    : stat === "ready" ? "🎉 Pronto"
                    : isLate ? "🔔 In ritardo"
                    : "🧵 In lavorazione";
    const date = d.due_date ? `⏱ ${formatDate(d.due_date)}` : "";
    extraMeta = `<div class="note-extra-meta${isLate ? ' is-danger' : ''}">${statBadge}${date ? " · " + date : ""}</div>`;
  } else if (n.type === "gift") {
    const d = n.data || {};
    const stat = d.status || "idea";
    const today = new Date().toISOString().slice(0, 10);
    const isLate = d.deadline && d.deadline < today && stat !== "gifted";
    const statBadge = stat === "gifted" ? "✓ Regalato"
                    : stat === "bought" ? "🛍️ Comprato"
                    : "💭 Idea";
    const date = d.deadline ? `🎁 ${formatDate(d.deadline)}` : "";
    extraMeta = `<div class="note-extra-meta${isLate ? ' is-danger' : ''}">${statBadge}${date ? " · " + date : ""}</div>`;
  } else if (n.type === "moodboard") {
    const d = n.data || {};
    const tags = [d.season, d.occasion].filter(Boolean).join(" · ");
    if (tags) extraMeta = `<div class="note-extra-meta">${escapeHtml(tags)}</div>`;
  }

  return `<article class="note-card${n.pinned ? ' is-pinned' : ''}" data-id="${escapeHtml(n.id)}">
    ${cover ? `<div class="note-cover"><img src="${escapeHtml(cover)}" alt="" loading="lazy" /></div>` : ""}
    <div class="note-card-body">
      <div class="note-card-head">
        <span class="note-type-icon">${typeMeta.icon}</span>
        ${n.pinned ? '<span class="note-pin-badge">📌</span>' : ""}
      </div>
      ${n.title ? `<div class="note-card-title">${escapeHtml(n.title)}</div>` : ""}
      ${preview ? `<div class="note-card-preview">${escapeHtml(preview)}</div>` : ""}
      ${extraMeta}
      ${tags ? `<div class="note-card-tags">${tags}</div>` : ""}
    </div>
  </article>`;
}

function renderTagsFilter() {
  const box = document.getElementById("notes-tags-filter");
  const tags = extractAllTags(state.notes);
  if (tags.length === 0) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const all = `<button class="note-tag-chip${!state.activeTag ? ' is-active' : ''}" data-tag="">Tutti</button>`;
  const list = tags.map(t =>
    `<button class="note-tag-chip${state.activeTag === t ? ' is-active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join("");
  box.innerHTML = all + list;
  box.querySelectorAll(".note-tag-chip").forEach(b => {
    b.addEventListener("click", () => {
      state.activeTag = b.dataset.tag || null;
      box.querySelectorAll(".note-tag-chip").forEach(x =>
        x.classList.toggle("is-active", x === b)
      );
      applyFilters();
    });
  });
}

function formatEur(n) {
  const num = Number(n) || 0;
  return "€ " + num.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
const MONTHS_ABBR = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MONTHS_ABBR[d.getMonth()]}`;
}

// =============================================================================
// FAB + bottom sheet "tipo nota"
// =============================================================================
function openTypeSheet() {
  const list = document.getElementById("notes-type-list");
  list.innerHTML = NOTE_TYPES.map(t =>
    `<button type="button" class="notes-type-item" data-type="${t.key}">
      <span class="notes-type-icon">${t.icon}</span>
      <div class="notes-type-info">
        <strong>${escapeHtml(t.label)}</strong>
        <small>${escapeHtml(t.desc)}</small>
      </div>
      <span class="notes-type-arrow">→</span>
    </button>`
  ).join("");
  list.querySelectorAll(".notes-type-item").forEach(b => {
    b.addEventListener("click", () => onCreateOfType(b.dataset.type));
  });
  document.getElementById("notes-type-sheet").classList.remove("hidden");
}
function closeTypeSheet() {
  document.getElementById("notes-type-sheet").classList.add("hidden");
}

async function onCreateOfType(type) {
  closeTypeSheet();
  try {
    const note = await createNote({ type, title: "", body: "", tags: [], data: {} });
    location.href = `./note-detail.html?id=${encodeURIComponent(note.id)}&new=1`;
  } catch (err) {
    toast("Errore creazione nota", "error");
  }
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-add-note").addEventListener("click", openTypeSheet);
  document.getElementById("notes-sheet-backdrop").addEventListener("click", closeTypeSheet);

  document.getElementById("notes-search-input").addEventListener("input", (e) => {
    state.query = e.target.value;
    applyFilters();
  });

  load();
});
