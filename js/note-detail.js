// =============================================================================
// Note detail — editor full-screen con auto-save debounced
// =============================================================================

import * as Theme from "./theme/manager.js";
import {
  getNote, updateNote, deleteNote, uploadAttachment, NOTE_TYPES,
} from "./notes-data.js";

Theme.init();

const state = {
  note: null,
  saveTimer: null,
  saving: false,
  dirty: false,
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

function getNoteIdFromUrl() {
  return new URLSearchParams(location.search).get("id");
}

function setSaveStatus(text, busy = false) {
  const el = document.getElementById("nd-save-status");
  el.textContent = text;
  el.classList.toggle("is-busy", !!busy);
}

// =============================================================================
// Carica nota
// =============================================================================
async function load() {
  const id = getNoteIdFromUrl();
  if (!id) {
    toast("ID nota mancante", "error");
    setTimeout(() => location.replace("./notes.html"), 1500);
    return;
  }
  try {
    state.note = await getNote(id);
  } catch (err) {
    toast("Errore caricamento", "error");
    return;
  }
  if (!state.note) {
    toast("Nota non trovata", "error");
    setTimeout(() => location.replace("./notes.html"), 1500);
    return;
  }

  renderHeader();
  renderForm();
  renderAttachments();
  renderTypedSection();
  renderTags();

  // Se nuova: focus sul titolo
  const isNew = new URLSearchParams(location.search).get("new") === "1";
  if (isNew) {
    setTimeout(() => document.getElementById("nd-title").focus(), 100);
  }
}

function renderHeader() {
  const meta = NOTE_TYPES.find(t => t.key === state.note.type) || NOTE_TYPES[0];
  document.getElementById("note-type-badge").textContent = `${meta.icon} ${meta.label}`;
  updatePinButton();
}

function updatePinButton() {
  const btn = document.getElementById("btn-pin-note");
  btn.classList.toggle("is-active", !!state.note.pinned);
  btn.title = state.note.pinned ? "Sbloccata dalla cima" : "Blocca in cima";
}

function renderForm() {
  document.getElementById("nd-title").value = state.note.title || "";
  document.getElementById("nd-body").innerHTML = state.note.body || "";
  // Placeholder behavior per contenteditable
  refreshBodyPlaceholder();
}

function refreshBodyPlaceholder() {
  const body = document.getElementById("nd-body");
  const isEmpty = !body.textContent.trim() && !body.querySelector("img");
  body.classList.toggle("is-empty", isEmpty);
}

// =============================================================================
// Allegati
// =============================================================================
function renderAttachments() {
  const box = document.getElementById("nd-attachments");
  const att = state.note.attachments || [];
  if (att.length === 0) { box.innerHTML = ""; return; }
  box.innerHTML = att.map((a, i) => `
    <div class="nd-attach" data-idx="${i}">
      <img src="${escapeHtml(a.url)}" alt="" loading="lazy" />
      <button class="nd-attach-del" data-idx="${i}" aria-label="Rimuovi">✕</button>
    </div>
  `).join("");
  box.querySelectorAll(".nd-attach-del").forEach(b => {
    b.addEventListener("click", () => onDeleteAttachment(Number(b.dataset.idx)));
  });
}

async function onAddPhotos(files) {
  if (!files || files.length === 0) return;
  toast("Caricamento foto...", "default");
  const newAtt = [];
  for (const f of files) {
    try {
      const a = await uploadAttachment(f, f.name || "photo.jpg");
      newAtt.push(a);
    } catch (err) {
      console.error(err);
    }
  }
  if (newAtt.length === 0) { toast("Errore caricamento", "error"); return; }
  state.note.attachments = [...(state.note.attachments || []), ...newAtt];
  renderAttachments();
  scheduleSave();
  toast(`✓ ${newAtt.length} ${newAtt.length === 1 ? "foto" : "foto"} aggiunta`, "success");
}

function onDeleteAttachment(idx) {
  if (!confirm("Rimuovere questa foto?")) return;
  state.note.attachments = (state.note.attachments || []).filter((_, i) => i !== idx);
  renderAttachments();
  scheduleSave();
}

// =============================================================================
// Tag editor
// =============================================================================
function renderTags() {
  const list = document.getElementById("nd-tags-list");
  const tags = state.note.tags || [];
  list.innerHTML = tags.map((t, i) =>
    `<span class="nd-tag-chip">
      ${escapeHtml(t)}
      <button data-idx="${i}" aria-label="Rimuovi">✕</button>
    </span>`
  ).join("");
  list.querySelectorAll("button[data-idx]").forEach(b => {
    b.addEventListener("click", () => {
      state.note.tags.splice(Number(b.dataset.idx), 1);
      renderTags();
      scheduleSave();
    });
  });
}

function onTagInputKeydown(e) {
  if (e.key === "Enter" || e.key === "," || e.key === " ") {
    e.preventDefault();
    const inp = e.target;
    const v = inp.value.trim();
    if (!v) return;
    if (!state.note.tags) state.note.tags = [];
    if (!state.note.tags.includes(v)) {
      state.note.tags.push(v);
      renderTags();
      scheduleSave();
    }
    inp.value = "";
  }
}

// =============================================================================
// Typed section (placeholder; i 4 template verticali arriveranno in step B)
// =============================================================================
function renderTypedSection() {
  const box = document.getElementById("nd-typed-section");
  if (state.note.type === "free") { box.innerHTML = ""; return; }
  // Per ora hint informativo: i campi specifici per tipo arrivano dopo
  const meta = NOTE_TYPES.find(t => t.key === state.note.type);
  if (!meta) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="nd-typed-hint">
    ${meta.icon} <strong>${escapeHtml(meta.label)}</strong> · ${escapeHtml(meta.desc)}
    <small>I campi specifici per questo tipo arrivano nel prossimo update.</small>
  </div>`;
}

// =============================================================================
// Auto-save debounced
// =============================================================================
function scheduleSave() {
  state.dirty = true;
  setSaveStatus("Modifiche in corso...");
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNow, 800);
}

async function saveNow() {
  if (state.saving || !state.dirty) return;
  state.saving = true;
  setSaveStatus("Salvataggio...", true);

  const partial = {
    title: document.getElementById("nd-title").value.trim(),
    body: document.getElementById("nd-body").innerHTML.trim(),
    tags: state.note.tags || [],
    attachments: state.note.attachments || [],
    data: state.note.data || {},
  };
  try {
    await updateNote(state.note.id, partial);
    state.dirty = false;
    setSaveStatus("Salvato");
  } catch (err) {
    setSaveStatus("Errore salvataggio");
    console.error(err);
  } finally {
    state.saving = false;
  }
}

// =============================================================================
// Pin / Delete
// =============================================================================
async function onTogglePin() {
  state.note.pinned = !state.note.pinned;
  updatePinButton();
  try {
    await updateNote(state.note.id, { pinned: state.note.pinned });
    toast(state.note.pinned ? "📌 Bloccata in cima" : "Sbloccata", "success");
  } catch (err) {
    state.note.pinned = !state.note.pinned;
    updatePinButton();
    toast("Errore", "error");
  }
}

async function onDelete() {
  if (!confirm("Eliminare questa nota?")) return;
  try {
    await deleteNote(state.note.id);
    location.replace("./notes.html");
  } catch (err) {
    toast("Errore eliminazione", "error");
  }
}

// =============================================================================
// Toolbar formattazione
// =============================================================================
function setupToolbar() {
  document.querySelectorAll(".nd-toolbar [data-cmd]").forEach(b => {
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const body = document.getElementById("nd-body");
      body.focus();
      try { document.execCommand(b.dataset.cmd, false, null); } catch {}
      scheduleSave();
    });
  });
  document.getElementById("nd-add-checklist").addEventListener("click", (e) => {
    e.preventDefault();
    const body = document.getElementById("nd-body");
    body.focus();
    // Inserisce un checkbox + spazio + testo placeholder a cursore
    const html = `<div class="nd-check-line"><input type="checkbox" disabled> <span contenteditable>Voce checklist</span></div>`;
    document.execCommand("insertHTML", false, html);
    scheduleSave();
  });
  document.getElementById("nd-add-photo").addEventListener("click", () =>
    document.getElementById("nd-photo-input").click()
  );
  document.getElementById("nd-photo-input").addEventListener("change", (e) => {
    onAddPhotos(e.target.files);
    e.target.value = "";
  });
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-pin-note").addEventListener("click", onTogglePin);
  document.getElementById("btn-delete-note").addEventListener("click", onDelete);
  document.getElementById("nd-title").addEventListener("input", scheduleSave);
  document.getElementById("nd-body").addEventListener("input", () => {
    refreshBodyPlaceholder();
    scheduleSave();
  });
  document.getElementById("nd-tag-input").addEventListener("keydown", onTagInputKeydown);

  setupToolbar();

  // Click su checkbox dentro la nota -> toggle (anche se 'disabled' a livello attr,
  // li tratto come decorativi visivi e gestisco lo stato qui)
  document.getElementById("nd-body").addEventListener("click", (e) => {
    const inp = e.target;
    if (inp.tagName === "INPUT" && inp.type === "checkbox") {
      inp.checked = !inp.checked;
      // Salva lo stato come attributo nel DOM (innerHTML lo persiste)
      if (inp.checked) inp.setAttribute("checked", "checked");
      else inp.removeAttribute("checked");
      // Strike-through al testo
      const span = inp.parentElement?.querySelector("span");
      if (span) span.classList.toggle("is-checked", inp.checked);
      scheduleSave();
    }
  });

  // Salva al beforeunload se dirty
  window.addEventListener("beforeunload", () => {
    if (state.dirty) saveNow();
  });

  load();
});
