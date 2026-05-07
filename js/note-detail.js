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
// Typed section: 4 template verticali (wishlist, sarta, mood board, regali)
// =============================================================================
function renderTypedSection() {
  const box = document.getElementById("nd-typed-section");
  const t = state.note.type;
  if (t === "free") { box.innerHTML = ""; return; }
  const data = state.note.data || {};

  if (t === "wishlist") box.innerHTML = renderWishlistTpl(data);
  else if (t === "tailor") box.innerHTML = renderTailorTpl(data);
  else if (t === "moodboard") box.innerHTML = renderMoodboardTpl(data);
  else if (t === "gift") box.innerHTML = renderGiftTpl(data);
  else { box.innerHTML = ""; return; }

  // Bind input listeners su tutti i campi del template
  box.querySelectorAll("[data-field]").forEach(el => {
    el.addEventListener("input", onTypedFieldChange);
    el.addEventListener("change", onTypedFieldChange);
  });
  // Bind chip selector (status / occasion / season)
  box.querySelectorAll(".typed-chip").forEach(c => {
    c.addEventListener("click", () => {
      const group = c.dataset.chipGroup;
      const value = c.dataset.chipValue;
      box.querySelectorAll(`[data-chip-group="${group}"]`).forEach(x => x.classList.toggle("is-active", x === c));
      ensureData()[group] = value;
      scheduleSave();
      // Re-render in caso di cambi che impattano il banner (es. status sarta)
      if (t === "tailor" && group === "status") {
        renderTypedSection();
      }
    });
  });

  // CTA specifiche
  if (t === "wishlist") {
    const ctaBuy = box.querySelector("[data-action='wish-bought']");
    if (ctaBuy) ctaBuy.addEventListener("click", onWishlistMarkBought);
  }
}

function ensureData() {
  if (!state.note.data) state.note.data = {};
  return state.note.data;
}

function onTypedFieldChange(e) {
  const field = e.target.dataset.field;
  if (!field) return;
  let val = e.target.value;
  if (e.target.type === "number") val = val === "" ? null : Number(val);
  ensureData()[field] = val;
  scheduleSave();
}

// =============================================================================
// 1. WISHLIST capo
// =============================================================================
function renderWishlistTpl(d) {
  const status = d.status || "wanted";
  const isBought = status === "bought";
  return `
    <h4 class="nd-typed-h4">🛍️ Wishlist capo</h4>
    <div class="typed-grid">
      <label class="typed-row">
        <span>Cosa stai desiderando</span>
        <input type="text" data-field="item_name" value="${escAttr(d.item_name)}" placeholder="es. Stivali Marsell neri" maxlength="80" />
      </label>
      <label class="typed-row">
        <span>Link prodotto</span>
        <input type="url" data-field="link_url" value="${escAttr(d.link_url)}" placeholder="https://..." />
      </label>
      <label class="typed-row">
        <span>Negozio</span>
        <input type="text" data-field="store" value="${escAttr(d.store)}" placeholder="es. Zalando, Vinted, da Lucia..." maxlength="40" />
      </label>
      <div class="typed-row-pair">
        <label class="typed-row">
          <span>Prezzo target (€)</span>
          <input type="number" inputmode="decimal" step="1" min="0" data-field="target_price" value="${d.target_price ?? ""}" placeholder="100" />
        </label>
        <label class="typed-row">
          <span>Prezzo attuale (€)</span>
          <input type="number" inputmode="decimal" step="1" min="0" data-field="current_price" value="${d.current_price ?? ""}" placeholder="—" />
        </label>
      </div>
      <div class="typed-row">
        <span>Stato</span>
        <div class="typed-chips">
          <button type="button" class="typed-chip${status === 'wanted' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="wanted">💭 Lo desidero</button>
          <button type="button" class="typed-chip${status === 'watching' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="watching">👀 Aspetto saldo</button>
          <button type="button" class="typed-chip${status === 'bought' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="bought">✓ Comprato</button>
        </div>
      </div>
      ${renderWishlistInsight(d)}
      ${isBought ? `<button type="button" class="btn btn--gold btn--block" data-action="wish-bought">📦 Aggiungi al guardaroba</button>` : ""}
    </div>
  `;
}

function renderWishlistInsight(d) {
  const target = Number(d.target_price);
  const current = Number(d.current_price);
  if (!target || !current || isNaN(target) || isNaN(current)) return "";
  if (current <= target) {
    return `<div class="typed-insight typed-insight--success">🎉 È sotto il tuo prezzo target! (${formatEur(current)} ≤ ${formatEur(target)})</div>`;
  }
  const diff = current - target;
  const pct = Math.round((diff / target) * 100);
  return `<div class="typed-insight typed-insight--warn">📈 Costa ${formatEur(diff)} (${pct}%) sopra il target. Aspetta un saldo.</div>`;
}

async function onWishlistMarkBought() {
  // Apre la home con query string per pre-popolare il modal "Nuovo capo"
  // con i dati della wishlist. Per ora salva un flag e naviga: index.html
  // potrebbe leggerli al boot in futuro. Per adesso fornisce un toast con
  // istruzioni semplici.
  toast("Apri 'Nuovo capo' e ri-incolla i dati della wishlist", "default");
  setTimeout(() => location.href = "./index.html", 800);
}

// =============================================================================
// 2. SARTA / RITOCCHI
// =============================================================================
function renderTailorTpl(d) {
  const status = d.status || "in_progress";
  return `
    <h4 class="nd-typed-h4">✂️ Sarta / Ritocchi</h4>
    ${renderTailorBanner(d)}
    <div class="typed-grid">
      <label class="typed-row">
        <span>Capo</span>
        <input type="text" data-field="garment_label" value="${escAttr(d.garment_label)}" placeholder="es. Pantaloni grigi Zara" maxlength="80" />
      </label>
      <label class="typed-row">
        <span>Cosa modificare</span>
        <textarea data-field="what_to_modify" rows="3" placeholder="es. Accorciare orlo di 4cm, stringere fianchi...">${escapeHtml(d.what_to_modify || "")}</textarea>
      </label>
      <div class="typed-row-pair">
        <label class="typed-row">
          <span>Preventivo (€)</span>
          <input type="number" inputmode="decimal" step="1" min="0" data-field="estimate" value="${d.estimate ?? ""}" placeholder="20" />
        </label>
        <label class="typed-row">
          <span>Data ritiro</span>
          <input type="date" data-field="due_date" value="${escAttr(d.due_date)}" />
        </label>
      </div>
      <label class="typed-row">
        <span>Sarta / Lavanderia</span>
        <input type="text" data-field="provider" value="${escAttr(d.provider)}" placeholder="es. Sarta Anna, Ratti..." maxlength="40" />
      </label>
      <div class="typed-row">
        <span>Stato</span>
        <div class="typed-chips">
          <button type="button" class="typed-chip${status === 'in_progress' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="in_progress">🧵 In lavorazione</button>
          <button type="button" class="typed-chip${status === 'ready' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="ready">✓ Pronto</button>
          <button type="button" class="typed-chip${status === 'picked_up' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="picked_up">📦 Ritirato</button>
        </div>
      </div>
    </div>
  `;
}

function renderTailorBanner(d) {
  if (d.status === "picked_up") {
    return `<div class="typed-insight typed-insight--success">✓ Lavoro concluso e ritirato</div>`;
  }
  if (!d.due_date) return "";
  const today = new Date().toISOString().slice(0, 10);
  if (d.status === "ready") {
    return `<div class="typed-insight typed-insight--info">🎉 Pronto da ritirare!</div>`;
  }
  if (d.due_date < today) {
    const overdue = Math.round((new Date(today + "T00:00:00") - new Date(d.due_date + "T00:00:00")) / 86400000);
    return `<div class="typed-insight typed-insight--danger">🔔 In ritardo di ${overdue} ${overdue === 1 ? "giorno" : "giorni"}</div>`;
  }
  const days = Math.round((new Date(d.due_date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  if (days <= 3) {
    return `<div class="typed-insight typed-insight--warn">⏱ Ritiro tra ${days} ${days === 1 ? "giorno" : "giorni"}</div>`;
  }
  return "";
}

// =============================================================================
// 3. MOOD BOARD
// =============================================================================
function renderMoodboardTpl(d) {
  const seasons = ["primavera", "estate", "autunno", "inverno"];
  const occasions = ["casual", "elegante", "lavoro", "cerimonia", "mare", "città"];
  const curSeason = d.season || "";
  const curOccasion = d.occasion || "";
  return `
    <h4 class="nd-typed-h4">💄 Mood board look</h4>
    <p class="typed-hint">Carica foto di ispirazione (Pinterest, Instagram, riviste) usando il bottone 📷 sopra. Tag la stagione e l'occasione per ritrovare la nota più tardi.</p>
    <div class="typed-grid">
      <div class="typed-row">
        <span>Stagione</span>
        <div class="typed-chips">
          ${seasons.map(s =>
            `<button type="button" class="typed-chip${curSeason === s ? ' is-active' : ''}" data-chip-group="season" data-chip-value="${s}">${capitalize(s)}</button>`
          ).join("")}
        </div>
      </div>
      <div class="typed-row">
        <span>Occasione</span>
        <div class="typed-chips">
          ${occasions.map(o =>
            `<button type="button" class="typed-chip${curOccasion === o ? ' is-active' : ''}" data-chip-group="occasion" data-chip-value="${o}">${capitalize(o)}</button>`
          ).join("")}
        </div>
      </div>
      <label class="typed-row">
        <span>Note di stile</span>
        <textarea data-field="style_notes" rows="3" placeholder="es. Palette terra + senape, accessori oro, layering...">${escapeHtml(d.style_notes || "")}</textarea>
      </label>
    </div>
  `;
}

// =============================================================================
// 4. REGALI
// =============================================================================
function renderGiftTpl(d) {
  const status = d.status || "idea";
  const occasions = [
    { key: "compleanno", icon: "🎂", label: "Compleanno" },
    { key: "natale",     icon: "🎄", label: "Natale" },
    { key: "anniversario", icon: "💕", label: "Anniversario" },
    { key: "matrimonio", icon: "💒", label: "Matrimonio" },
    { key: "altro",      icon: "🎁", label: "Altro" },
  ];
  const curOcc = d.occasion || "";
  return `
    <h4 class="nd-typed-h4">🎁 Regalo</h4>
    ${renderGiftBanner(d)}
    <div class="typed-grid">
      <label class="typed-row">
        <span>Per chi</span>
        <input type="text" data-field="recipient" value="${escAttr(d.recipient)}" placeholder="es. Lucia, Mamma..." maxlength="40" />
      </label>
      <div class="typed-row">
        <span>Occasione</span>
        <div class="typed-chips">
          ${occasions.map(o =>
            `<button type="button" class="typed-chip${curOcc === o.key ? ' is-active' : ''}" data-chip-group="occasion" data-chip-value="${o.key}">${o.icon} ${o.label}</button>`
          ).join("")}
        </div>
      </div>
      <div class="typed-row-pair">
        <label class="typed-row">
          <span>Budget (€)</span>
          <input type="number" inputmode="decimal" step="1" min="0" data-field="budget" value="${d.budget ?? ""}" placeholder="50" />
        </label>
        <label class="typed-row">
          <span>Deadline</span>
          <input type="date" data-field="deadline" value="${escAttr(d.deadline)}" />
        </label>
      </div>
      <label class="typed-row">
        <span>Idee</span>
        <textarea data-field="ideas" rows="4" placeholder="es. Profumo Diptyque, Libro 'Atomic Habits', Kit ricamo...">${escapeHtml(d.ideas || "")}</textarea>
      </label>
      <div class="typed-row">
        <span>Stato</span>
        <div class="typed-chips">
          <button type="button" class="typed-chip${status === 'idea' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="idea">💭 Idea</button>
          <button type="button" class="typed-chip${status === 'bought' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="bought">🛍️ Comprato</button>
          <button type="button" class="typed-chip${status === 'gifted' ? ' is-active' : ''}" data-chip-group="status" data-chip-value="gifted">✓ Regalato</button>
        </div>
      </div>
    </div>
  `;
}

function renderGiftBanner(d) {
  if (d.status === "gifted") {
    return `<div class="typed-insight typed-insight--success">✓ Regalo consegnato</div>`;
  }
  if (!d.deadline) return "";
  const today = new Date().toISOString().slice(0, 10);
  if (d.deadline < today) {
    return `<div class="typed-insight typed-insight--danger">🔔 Deadline superata!</div>`;
  }
  const days = Math.round((new Date(d.deadline + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
  if (days === 0) return `<div class="typed-insight typed-insight--warn">🎁 È oggi!</div>`;
  if (days <= 7) return `<div class="typed-insight typed-insight--warn">⏱ Mancano ${days} ${days === 1 ? "giorno" : "giorni"}</div>`;
  return "";
}

// =============================================================================
// Helpers
// =============================================================================
function escAttr(v) { return String(v ?? "").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function formatEur(n) {
  const num = Number(n) || 0;
  return "€ " + num.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
