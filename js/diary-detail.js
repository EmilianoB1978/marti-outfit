// Diary detail: editor entry singola + outfit del giorno + auto-save
import {
  getOrCreateEntry, updateEntry, deleteEntry, formatItalianDate,
  uploadDiaryPhoto, removeDiaryPhoto, MOODS, idToDate, findWornGarments,
} from "./diary-data.js";
import { listItems as listGarments } from "./wardrobe.js";

let state = {
  id: null,
  entry: null,
  garments: [],
  saveTimer: null,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

window.goBack = () => { history.back(); };

window.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.search);
  state.id = params.get("date");
  if (!state.id || !/^\d{4}-\d{2}-\d{2}$/.test(state.id)) {
    alert("Data non valida");
    history.back();
    return;
  }

  $("#entry-date-title").textContent = capitalize(formatItalianDate(state.id));

  // Render mood selector
  $("#mood-list").innerHTML = MOODS.map(m =>
    `<button type="button" class="diary-mood-btn" data-mood="${m.key}" title="${m.label}" aria-label="${m.label}">${m.emoji}</button>`
  ).join("");

  bindUI();
  await load();
});

function bindUI() {
  $("#mood-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".diary-mood-btn");
    if (!btn) return;
    const m = btn.dataset.mood;
    const newMood = state.entry?.mood === m ? null : m;
    $$(".diary-mood-btn").forEach(b => b.classList.toggle("is-active", b.dataset.mood === newMood));
    state.entry.mood = newMood;
    queueSave();
  });

  $("#entry-title").addEventListener("input", () => {
    state.entry.title = $("#entry-title").value;
    queueSave();
  });
  $("#entry-body").addEventListener("input", () => {
    state.entry.body = $("#entry-body").innerHTML;
    queueSave();
  });
  $("#entry-tags").addEventListener("input", () => {
    state.entry.tags = $("#entry-tags").value
      .split(",").map(t => t.trim()).filter(Boolean);
    queueSave();
  });

  $("#btn-add-photo").addEventListener("click", () => $("#file-photo").click());
  $("#file-photo").addEventListener("change", onPhotoSelected);

  $("#btn-delete").addEventListener("click", async () => {
    if (!confirm("Eliminare questa pagina del diario? L'azione è irreversibile.")) return;
    try {
      await deleteEntry(state.id);
      history.back();
    } catch (err) {
      alert("Errore: " + err.message);
    }
  });

  // Save on blur immediato per sicurezza
  window.addEventListener("beforeunload", () => {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      doSave();
    }
  });
}

async function load() {
  state.entry = await getOrCreateEntry(state.id);
  state.garments = await listGarments().catch(() => []);

  $("#entry-title").value = state.entry.title || "";
  $("#entry-body").innerHTML = state.entry.body || "";
  $("#entry-tags").value = (state.entry.tags || []).join(", ");
  if (state.entry.mood) {
    const btn = $(`.diary-mood-btn[data-mood="${state.entry.mood}"]`);
    if (btn) btn.classList.add("is-active");
  }

  renderPhotos();
  renderOutfit();
}

function renderPhotos() {
  const grid = $("#diary-photos-grid");
  const photos = state.entry.photos || [];
  grid.innerHTML = photos.map((p, i) => `
    <div class="diary-photo-thumb" data-idx="${i}">
      <img src="${p.url}" alt="">
      <button type="button" class="diary-photo-remove" data-idx="${i}" aria-label="Rimuovi">×</button>
    </div>
  `).join("");
  grid.querySelectorAll(".diary-photo-remove").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      const p = photos[idx];
      if (p?.path) await removeDiaryPhoto(p.path);
      state.entry.photos = photos.filter((_, i) => i !== idx);
      renderPhotos();
      queueSave();
    });
  });
}

function renderOutfit() {
  const sec = $("#diary-outfit-section");
  const grid = $("#diary-outfit-grid");
  const worn = findWornGarments(state.garments, state.id);
  if (worn.length === 0) { sec.hidden = true; return; }
  sec.hidden = false;
  grid.innerHTML = worn.map(g => `
    <div class="diary-outfit-thumb">
      ${g.photo_url ? `<img src="${g.photo_url}" alt="">` : `<div class="diary-outfit-placeholder">👕</div>`}
      <span class="diary-outfit-label">${escapeHtml(g.subcategory || g.category || "")}</span>
    </div>
  `).join("");
}

async function onPhotoSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  showHint("⏳ Caricamento foto...");
  try {
    const photo = await uploadDiaryPhoto(file);
    state.entry.photos = [...(state.entry.photos || []), photo];
    renderPhotos();
    await doSave();
    showHint("✅ Foto aggiunta");
  } catch (err) {
    showHint("❌ Errore upload");
    console.error(err);
  } finally {
    e.target.value = "";
  }
}

function queueSave() {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  showHint("✏️ ...");
  state.saveTimer = setTimeout(doSave, 800);
}

async function doSave() {
  state.saveTimer = null;
  if (!state.entry) return;
  try {
    await updateEntry(state.id, {
      title: state.entry.title || "",
      body: state.entry.body || "",
      mood: state.entry.mood || null,
      tags: state.entry.tags || [],
      photos: state.entry.photos || [],
    });
    showHint("💾 Salvato automaticamente");
  } catch (err) {
    console.error(err);
    showHint("❌ Errore salvataggio");
  }
}

function showHint(msg) {
  const el = $("#saved-hint");
  if (el) el.textContent = msg;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
