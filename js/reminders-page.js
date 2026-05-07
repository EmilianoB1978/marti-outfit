// Pagina lista Promemoria + bottom sheet creazione + suggerimenti dall'armadio
import {
  listReminders, createReminder, updateReminder, deleteReminder,
  completeReminder, snoozeReminder, bucketOf, countByBucket,
  REMINDER_TYPES, ensureNotificationPermission, tryNotifyDue,
} from "./reminders-data.js";
import { listItems as listGarments } from "./wardrobe.js";
import { listNotes } from "./notes-data.js";

function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) {
    // Crea on-demand se la pagina non lo ha
    const t = document.createElement("div");
    t.id = "toast";
    t.className = "toast show " + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
    return;
  }
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast hidden"; }, 2400);
}

let state = {
  items: [],
  bucket: "all",
  garments: [],
  notes: [],
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

// Boot --------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  bindUI();
  await refresh();
  // Tenta notifiche per promemoria gia' scaduti
  if ("Notification" in window && Notification.permission === "granted") {
    tryNotifyDue(state.items);
  }
});

function bindUI() {
  $("#fab-add").addEventListener("click", () => openSheet());
  $("#btn-cancel").addEventListener("click", closeSheet);
  $("#sheet-overlay").addEventListener("click", closeSheet);
  $("#reminder-form").addEventListener("submit", onSubmit);
  $("#btn-perm").addEventListener("click", onTogglePerm);

  $("#reminders-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".reminder-tab");
    if (!tab) return;
    state.bucket = tab.dataset.bucket;
    $$(".reminder-tab").forEach(t => t.classList.toggle("is-active", t === tab));
    renderList();
  });

  // Tipi nel form
  const typesEl = $("#rem-types");
  typesEl.innerHTML = Object.entries(REMINDER_TYPES).map(([k, v]) =>
    `<button type="button" class="rem-type" data-type="${k}">
      <span class="rem-type-icon">${v.icon}</span>
      <span class="rem-type-label">${v.label}</span>
    </button>`
  ).join("");
  typesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".rem-type");
    if (!btn) return;
    $$(".rem-type").forEach(b => b.classList.toggle("is-active", b === btn));
    typesEl.dataset.value = btn.dataset.type;
  });
  // Default a "manual"
  typesEl.dataset.value = "manual";
  typesEl.querySelector('[data-type="manual"]').classList.add("is-active");
}

async function onTogglePerm() {
  const res = await ensureNotificationPermission();
  if (res === "granted") toast("Notifiche attive 🔔", "success");
  else if (res === "denied") toast("Notifiche bloccate dal browser", "warn");
  else toast("Permesso non concesso", "warn");
}

async function refresh() {
  const [items, garments, notes] = await Promise.all([
    listReminders({ force: true }),
    listGarments().catch(() => []),
    listNotes().catch(() => []),
  ]);
  state.items = items;
  state.garments = garments;
  state.notes = notes;
  updateCounts();
  renderSuggestions();
  renderList();
}

function updateCounts() {
  const c = countByBucket(state.items);
  $$(".rt-badge").forEach(b => {
    const k = b.dataset.count;
    b.textContent = c[k] || 0;
    b.style.display = (c[k] || 0) > 0 ? "" : "none";
  });
}

function renderList() {
  const wrap = $("#reminders-list");
  let items = state.items;
  if (state.bucket === "all") {
    items = items.filter(r => r.status !== "done");
  } else if (state.bucket === "done") {
    items = items.filter(r => r.status === "done");
  } else {
    items = items.filter(r => r.status !== "done" && bucketOf(r) === state.bucket);
  }
  if (items.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${state.bucket === "done" ? "✅" : "⏰"}</div>
      <p class="empty-text">${state.bucket === "done" ? "Nessun promemoria completato" : "Nessun promemoria"}</p>
    </div>`;
    return;
  }
  wrap.innerHTML = items.map(renderRow).join("");
  wrap.querySelectorAll("[data-action]").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onAction(b.dataset.action, b.dataset.id);
    });
  });
  wrap.querySelectorAll(".reminder-row").forEach(r => {
    r.addEventListener("click", () => openSheet(r.dataset.id));
  });
}

function renderRow(r) {
  const meta = REMINDER_TYPES[r.type] || REMINDER_TYPES.manual;
  const due = r.dueAt ? r.dueAt.toDate() : null;
  const dueText = due ? formatRelative(due) : "Senza data";
  const isOverdue = due && due < new Date() && r.status !== "done";
  const garment = r.garmentId ? state.garments.find(g => g.id === r.garmentId) : null;
  return `<div class="reminder-row${r.status === "done" ? " is-done" : ""}${isOverdue ? " is-overdue" : ""}" data-id="${r.id}">
    <div class="reminder-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
    <div class="reminder-body">
      <div class="reminder-title">${escapeHtml(r.title)}</div>
      <div class="reminder-meta">
        <span class="reminder-due${isOverdue ? " is-overdue" : ""}">${dueText}</span>
        ${garment ? `<span class="reminder-garment">· ${escapeHtml(garment.subcategory || garment.category || "Capo")}</span>` : ""}
        ${r.repeat && r.repeat !== "none" ? `<span class="reminder-repeat">· 🔁 ${r.repeat}</span>` : ""}
      </div>
    </div>
    <div class="reminder-actions">
      ${r.status !== "done" ? `<button class="rem-act" data-action="done" data-id="${r.id}" aria-label="Fatto">✓</button>` : ""}
      ${r.status !== "done" ? `<button class="rem-act" data-action="snooze" data-id="${r.id}" aria-label="Posticipa">⏱</button>` : ""}
      <button class="rem-act rem-act-danger" data-action="delete" data-id="${r.id}" aria-label="Elimina">×</button>
    </div>
  </div>`;
}

async function onAction(action, id) {
  if (action === "done") {
    await completeReminder(id);
    toast("✅ Fatto!", "success");
  } else if (action === "snooze") {
    await snoozeReminder(id, 24);
    toast("⏱ Posticipato a domani", "success");
  } else if (action === "delete") {
    if (!confirm("Eliminare questo promemoria?")) return;
    await deleteReminder(id);
    toast("Eliminato", "success");
  }
  await refresh();
}

// Suggerimenti dall'armadio ----------------------------------------
function renderSuggestions() {
  const suggestions = computeSuggestions();
  const box = $("#reminders-suggest");
  const list = $("#suggest-list");
  if (!suggestions.length) { box.hidden = true; return; }
  box.hidden = false;
  list.innerHTML = suggestions.map(s => `
    <button type="button" class="suggest-card" data-suggest-key="${s.key}">
      <span class="suggest-icon">${s.icon}</span>
      <span class="suggest-text">${escapeHtml(s.text)}</span>
      <span class="suggest-cta">+ Crea</span>
    </button>
  `).join("");
  list.querySelectorAll(".suggest-card").forEach(card => {
    card.addEventListener("click", () => {
      const key = card.dataset.suggestKey;
      const s = suggestions.find(x => x.key === key);
      if (s) openSheetPrefill(s.prefill);
    });
  });
}

function computeSuggestions() {
  const out = [];
  const now = new Date();
  // 1. Capi non indossati da molto -> riprova
  const dormant = (state.garments || [])
    .filter(g => {
      const last = g.last_worn_at ? new Date(g.last_worn_at) : null;
      if (!last) return false;
      const days = (now - last) / 86400000;
      return days > 60;
    })
    .slice(0, 2);
  for (const g of dormant) {
    out.push({
      key: `dormant-${g.id}`,
      icon: "👕",
      text: `Riprova "${g.subcategory || g.category || "capo"}" (non indossato da oltre 60gg)`,
      prefill: {
        type: "garment",
        title: `Riprova: ${g.subcategory || g.category || "capo"}`,
        garmentId: g.id,
        dueAt: addDays(now, 1),
        priority: "low",
      },
    });
  }
  // 2. Note tipo tailor con pickup_date -> ritira
  const tailorNotes = (state.notes || []).filter(n => n.type === "tailor" && n.data?.pickup_date);
  for (const n of tailorNotes.slice(0, 3)) {
    const exists = state.items.some(r => r.noteId === n.id && r.status !== "done");
    if (exists) continue;
    out.push({
      key: `tailor-${n.id}`,
      icon: "✂️",
      text: `Ritira da sarta: ${n.title || "lavoro"}`,
      prefill: {
        type: "tailor",
        title: `Ritira: ${n.title || "lavoro sarta"}`,
        noteId: n.id,
        dueAt: new Date(n.data.pickup_date),
        priority: "high",
      },
    });
  }
  // 3. Note tipo gift con event_date prossimo -> reminder T-7gg
  const giftNotes = (state.notes || []).filter(n => n.type === "gift" && n.data?.event_date);
  for (const n of giftNotes.slice(0, 3)) {
    const ev = new Date(n.data.event_date);
    const days = (ev - now) / 86400000;
    if (days > 0 && days < 60) {
      const exists = state.items.some(r => r.noteId === n.id && r.status !== "done");
      if (exists) continue;
      out.push({
        key: `gift-${n.id}`,
        icon: "🎁",
        text: `Compra regalo: ${n.title || "evento"} (tra ${Math.round(days)}gg)`,
        prefill: {
          type: "gift",
          title: `Regalo: ${n.title || "evento"}`,
          noteId: n.id,
          dueAt: addDays(ev, -7),
          priority: "high",
        },
      });
    }
  }
  return out.slice(0, 4);
}

// Sheet -------------------------------------------------------------
function openSheet(id) {
  $("#sheet-overlay").hidden = false;
  $("#sheet-create").hidden = false;
  document.body.style.overflow = "hidden";

  if (id) {
    const r = state.items.find(x => x.id === id);
    if (!r) return;
    $("#rem-id").value = r.id;
    $("#rem-title").value = r.title || "";
    $("#rem-notes").value = r.notes || "";
    $("#rem-priority").value = r.priority || "medium";
    $("#rem-repeat").value = r.repeat || "none";
    $("#rem-due").value = r.dueAt ? toLocalInput(r.dueAt.toDate()) : "";
    $("#rem-garment-id").value = r.garmentId || "";
    $("#rem-note-id").value = r.noteId || "";
    selectType(r.type || "manual");
  } else {
    resetForm();
  }
  setTimeout(() => $("#rem-title").focus(), 100);
}

function openSheetPrefill(p) {
  resetForm();
  $("#rem-title").value = p.title || "";
  $("#rem-due").value = p.dueAt ? toLocalInput(new Date(p.dueAt)) : "";
  $("#rem-priority").value = p.priority || "medium";
  $("#rem-garment-id").value = p.garmentId || "";
  $("#rem-note-id").value = p.noteId || "";
  selectType(p.type || "manual");
  $("#sheet-overlay").hidden = false;
  $("#sheet-create").hidden = false;
  document.body.style.overflow = "hidden";
}

function selectType(type) {
  $$(".rem-type").forEach(b => b.classList.toggle("is-active", b.dataset.type === type));
  $("#rem-types").dataset.value = type;
}

function resetForm() {
  $("#reminder-form").reset();
  $("#rem-id").value = "";
  $("#rem-garment-id").value = "";
  $("#rem-note-id").value = "";
  selectType("manual");
}

function closeSheet() {
  $("#sheet-overlay").hidden = true;
  $("#sheet-create").hidden = true;
  document.body.style.overflow = "";
}

async function onSubmit(e) {
  e.preventDefault();
  const id = $("#rem-id").value;
  const payload = {
    type: $("#rem-types").dataset.value || "manual",
    title: $("#rem-title").value.trim(),
    notes: $("#rem-notes").value.trim(),
    dueAt: $("#rem-due").value || null,
    priority: $("#rem-priority").value,
    repeat: $("#rem-repeat").value,
    garmentId: $("#rem-garment-id").value || null,
    noteId: $("#rem-note-id").value || null,
  };
  if (!payload.title) return;
  try {
    if (id) {
      await updateReminder(id, payload);
      toast("Aggiornato", "success");
    } else {
      await createReminder(payload);
      toast("Promemoria creato", "success");
    }
    closeSheet();
    await refresh();
  } catch (err) {
    console.error(err);
    toast("Errore: " + err.message, "warn");
  }
}

// Helpers -----------------------------------------------------------
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}
function toLocalInput(d) {
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60000);
  return local.toISOString().slice(0, 16);
}
function formatRelative(d) {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const dueDay = new Date(d); dueDay.setHours(0, 0, 0, 0);
  const diff = Math.round((dueDay - today) / 86400000);
  const t = d.toTimeString().slice(0, 5);
  if (diff < -1) return `${Math.abs(diff)} giorni fa, ${t}`;
  if (diff === -1) return `Ieri, ${t}`;
  if (diff === 0) return `Oggi, ${t}`;
  if (diff === 1) return `Domani, ${t}`;
  if (diff <= 7) return `${["Dom","Lun","Mar","Mer","Gio","Ven","Sab"][d.getDay()]}, ${t}`;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) + `, ${t}`;
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}
