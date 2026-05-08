// =============================================================================
// Pagina /inspirations.html — feed + gestione profili Instagram salvati
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Taxonomies from "./taxonomies.js";
import * as ChipStyles from "./chip-styles.js";
import {
  listProfiles, addProfile, deleteProfile, reorderProfiles,
  listPosts, addPost, deletePost, updatePost,
  parseInstagramUrl,
} from "./inspirations-data.js";

Theme.init();

const state = {
  profiles: [],
  posts: [],
  currentTab: "feed",
  filterUsername: null,
  filterStyle: null,
  filterSeason: null,
  filterOccasion: null,
  filterTag: null,
  // Modal stato (add o edit)
  modalEditingId: null,
  modalDraft: null,
};

const $ = (s) => document.querySelector(s);

// =============================================================================
function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function humanizeError(err) {
  const msg = err?.message || String(err);
  if (/permission|insufficient|denied/i.test(msg)) {
    return "Permessi Firebase: aggiungi le regole 'inspirationProfiles' e 'inspirationPosts' nella console Firebase.";
  }
  if (/network|offline|failed to fetch/i.test(msg)) {
    return "Sei offline o la connessione è instabile. Riprova tra poco.";
  }
  return msg;
}

// =============================================================================
// Boot
// =============================================================================
async function boot() {
  // Carica tassonomie (per il modal con stili/stagioni/occasioni)
  try { await Taxonomies.load(); } catch (_) {}
  await refreshAll();
  bindUI();
}

async function refreshAll() {
  try {
    const [profiles, posts] = await Promise.all([
      listProfiles().catch(() => []),
      listPosts().catch(() => []),
    ]);
    state.profiles = profiles;
    state.posts = posts;
    renderProfiles();
    renderStories();
    renderFilters();
    renderPosts();
  } catch (err) {
    console.error(err);
    toast("Errore caricamento ispirazioni", "error");
  }
}

function bindUI() {
  document.querySelectorAll(".settings-tabs .tab").forEach(t => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".settings-tabs .tab").forEach(x => x.classList.remove("is-active"));
      document.querySelectorAll(".settings-tab-panel").forEach(p => p.classList.remove("is-active"));
      t.classList.add("is-active");
      const id = t.dataset.tab;
      document.getElementById(`tab-${id}`).classList.add("is-active");
      state.currentTab = id;
    });
  });

  $("#btn-add-post").addEventListener("click", onAddPost);
  $("#insp-post-input").addEventListener("keydown", e => {
    if (e.key === "Enter") onAddPost();
  });
  $("#btn-add-profile").addEventListener("click", onAddProfile);
  $("#insp-profile-input").addEventListener("keydown", e => {
    if (e.key === "Enter") onAddProfile();
  });
  $("#insp-modal-close").addEventListener("click", closeModal);
  $("#insp-modal").addEventListener("click", e => {
    if (e.target === $("#insp-modal")) closeModal();
  });
  $("#btn-info").addEventListener("click", showInfo);
}

function showInfo() {
  alert(`Come funziona la sezione Ispirazioni:

1. Salva le tue influencer preferite nella tab "👤 Influencer".

2. Quando vedi un post Instagram che ti ispira:
   • Tap sui ⋯ (in alto a destra del post) → "Copia link"
   • Torna qui → Feed → "+ Aggiungi" e incolla l'URL

3. Si apre un modal dove:
   • Scegli a quale influencer associare il post
   • Aggiungi tag di stile, stagioni e occasioni (sincronizzati con
     "Categorie e tag")
   • Aggiungi tag personali e note

4. Filtri il feed per influencer, stile, stagione, occasione o tag.`);
}

// =============================================================================
// Add post / profile
// =============================================================================
async function onAddPost() {
  const input = $("#insp-post-input");
  const value = input.value.trim();
  if (!value) {
    toast("Incolla un URL post Instagram", "warn");
    return;
  }
  // Smart fallback: URL profilo nella tab Feed -> chiede di salvarlo come influencer
  const parsed = parseInstagramUrl(value);
  if (parsed?.type === "profile") {
    const ok = confirm(
      `Hai incollato il profilo @${parsed.username}, non un singolo post.\n\n` +
      `Vuoi aggiungerlo alle tue Influencer?`
    );
    if (ok) {
      try {
        const profile = await addProfile(value);
        input.value = "";
        state.profiles = [...state.profiles, profile];
        renderProfiles();
        renderStories();
        toast(`✓ @${profile.username} aggiunta alle Influencer`, "success");
      } catch (err) {
        toast(humanizeError(err), "error");
      }
    }
    return;
  }
  if (parsed?.type === "share") {
    toast("Hai incollato un link 'Condividi'. Usa ⋯ → 'Copia link' su Instagram.", "warn");
    return;
  }
  if (!parsed || !parsed.postId) {
    toast("URL non valido. Deve essere un post o reel Instagram.", "error");
    return;
  }

  // Apri modal di editing per scegliere influencer + tassonomie + note
  openEditModal(null, {
    sourceUrl: value,
    parsed,
    profileUsername: parsed.username || state.filterUsername || null,
    styles: [],
    seasons: [],
    occasions: [],
    tags: [],
    notes: "",
  });
}

async function onAddProfile() {
  const input = $("#insp-profile-input");
  const value = input.value.trim();
  if (!value) {
    toast("Incolla un URL profilo o uno @username", "warn");
    return;
  }
  const btn = $("#btn-add-profile");
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const profile = await addProfile(value);
    input.value = "";
    state.profiles = [...state.profiles, profile];
    renderProfiles();
    renderStories();
    toast(`✓ @${profile.username} aggiunta`, "success");
  } catch (err) {
    console.error("[inspirations] addProfile error:", err);
    toast(humanizeError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Aggiungi";
  }
}

// =============================================================================
// Render PROFILES
// =============================================================================
function renderProfiles() {
  const wrap = $("#insp-profiles");
  if (state.profiles.length === 0) {
    wrap.innerHTML = `<div class="insp-empty">
      <div class="insp-empty-icon">👤</div>
      <p>Nessuna influencer salvata.</p>
      <p class="insp-empty-hint">Aggiungi @username o l'URL di un profilo Instagram.</p>
    </div>`;
    return;
  }
  const sorted = [...state.profiles].sort((a, b) => (a.order || 0) - (b.order || 0));
  wrap.innerHTML = sorted.map(p => {
    const postCount = state.posts.filter(x => x.profileUsername === p.username).length;
    return `<div class="insp-profile-row" data-id="${p.id}" data-username="${p.username}">
      <div class="insp-avatar">${p.username.charAt(0).toUpperCase()}</div>
      <div class="insp-profile-info">
        <div class="insp-profile-name">@${escapeHtml(p.username)}</div>
        <div class="insp-profile-count">${postCount} post salvat${postCount === 1 ? "o" : "i"}</div>
      </div>
      <a class="insp-profile-link" href="${escapeHtml(p.profileUrl || `https://www.instagram.com/${p.username}/`)}" target="_blank" rel="noopener noreferrer" title="Apri su Instagram">↗</a>
      <button class="insp-profile-del" data-id="${p.id}" aria-label="Rimuovi">🗑️</button>
    </div>`;
  }).join("");

  wrap.querySelectorAll(".insp-profile-del").forEach(b => {
    b.addEventListener("click", async () => {
      const id = b.dataset.id;
      if (!confirm("Rimuovere questa influencer? I post salvati restano.")) return;
      try {
        await deleteProfile(id);
        state.profiles = state.profiles.filter(x => x.id !== id);
        renderProfiles();
        renderStories();
        toast("Rimossa", "success");
      } catch (err) {
        toast(humanizeError(err), "error");
      }
    });
  });
}

// =============================================================================
// Render STORIES
// =============================================================================
function renderStories() {
  const wrap = $("#insp-stories");
  if (state.profiles.length === 0) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";
  const all = `<button class="insp-story ${state.filterUsername === null ? "is-active" : ""}" data-filter="all">
    <div class="insp-story-avatar insp-story-all">✨</div>
    <span class="insp-story-label">Tutti</span>
  </button>`;
  const items = state.profiles.map(p => `
    <button class="insp-story ${state.filterUsername === p.username ? "is-active" : ""}" data-filter="${escapeHtml(p.username)}">
      <div class="insp-story-avatar">${p.username.charAt(0).toUpperCase()}</div>
      <span class="insp-story-label">@${escapeHtml(p.username)}</span>
    </button>
  `).join("");
  wrap.innerHTML = all + items;

  wrap.querySelectorAll(".insp-story").forEach(b => {
    b.addEventListener("click", () => {
      const f = b.dataset.filter;
      state.filterUsername = f === "all" ? null : f;
      renderStories();
      renderPosts();
    });
  });
}

// =============================================================================
// Render FILTERS (stili/stagioni/occasioni/tag) — solo se hanno valori
// =============================================================================
function renderFilters() {
  const wrap = $("#insp-filters");
  const allTags      = new Set();
  const allStyles    = new Set();
  const allSeasons   = new Set();
  const allOccasions = new Set();
  for (const p of state.posts) {
    for (const t of (p.tags      || [])) allTags.add(t);
    for (const t of (p.styles    || [])) allStyles.add(t);
    for (const t of (p.seasons   || [])) allSeasons.add(t);
    for (const t of (p.occasions || [])) allOccasions.add(t);
  }
  const total = allTags.size + allStyles.size + allSeasons.size + allOccasions.size;
  if (total === 0) { wrap.hidden = true; wrap.innerHTML = ""; return; }
  wrap.hidden = false;
  const groups = [];
  if (allStyles.size > 0) {
    groups.push(renderFilterGroup("Stili",     "filterStyle",    allStyles,    "styles"));
  }
  if (allSeasons.size > 0) {
    groups.push(renderFilterGroup("Stagioni",  "filterSeason",   allSeasons,   null));
  }
  if (allOccasions.size > 0) {
    groups.push(renderFilterGroup("Occasioni", "filterOccasion", allOccasions, "occasions"));
  }
  if (allTags.size > 0) {
    groups.push(renderFilterGroup("Tag",       "filterTag",      allTags,      null));
  }
  wrap.innerHTML = groups.join("");
  wrap.querySelectorAll("[data-filter-key]").forEach(b => {
    b.addEventListener("click", () => {
      const k = b.dataset.filterKey;
      const v = b.dataset.filterValue;
      state[k] = state[k] === v ? null : v;
      renderFilters();
      renderPosts();
    });
  });
}
function renderFilterGroup(label, stateKey, valuesSet, taxonomyKey) {
  const arr = Array.from(valuesSet).sort();
  const chips = arr.map(v => {
    let css = "";
    if (taxonomyKey) {
      const st = ChipStyles.getChipStyle(taxonomyKey, v);
      const inline = ChipStyles.styleToCss(st);
      if (inline) css = ` style="${inline}"`;
    }
    const active = state[stateKey] === v ? " is-active" : "";
    return `<button class="insp-tag${active}" data-filter-key="${stateKey}" data-filter-value="${escapeHtml(v)}"${css}>${escapeHtml(v)}</button>`;
  }).join("");
  return `<div class="insp-filter-group">
    <div class="insp-filter-label">${label}</div>
    <div class="insp-tag-row">${chips}</div>
  </div>`;
}

// =============================================================================
// Render POSTS
// =============================================================================
function renderPosts() {
  const wrap = $("#insp-posts");
  let posts = state.posts;
  if (state.filterUsername) posts = posts.filter(p => p.profileUsername === state.filterUsername);
  if (state.filterStyle)    posts = posts.filter(p => (p.styles    || []).includes(state.filterStyle));
  if (state.filterSeason)   posts = posts.filter(p => (p.seasons   || []).includes(state.filterSeason));
  if (state.filterOccasion) posts = posts.filter(p => (p.occasions || []).includes(state.filterOccasion));
  if (state.filterTag)      posts = posts.filter(p => (p.tags      || []).includes(state.filterTag));

  if (posts.length === 0) {
    const filtersActive = state.filterUsername || state.filterStyle || state.filterSeason || state.filterOccasion || state.filterTag;
    wrap.innerHTML = `<div class="insp-empty">
      <div class="insp-empty-icon">📸</div>
      <p>${filtersActive ? "Nessun post per questo filtro" : "Nessun post salvato"}</p>
      ${filtersActive ? "" : `<p class="insp-empty-hint">Incolla l'URL di un post Instagram qui sopra.</p>`}
    </div>`;
    return;
  }

  wrap.innerHTML = posts.map(p => {
    const chipsHtml = renderPostChips(p);
    return `<div class="insp-post-card" data-id="${p.id}">
      <blockquote class="instagram-media"
        data-instgrm-captioned
        data-instgrm-permalink="${escapeHtml(p.url)}"
        data-instgrm-version="14"
        style="background:#fff; border:0; margin:0; max-width:540px; min-width:280px; padding:0; width:100%;"></blockquote>
      <div class="insp-post-actions">
        ${p.profileUsername
          ? `<span class="insp-post-username">@${escapeHtml(p.profileUsername)}</span>`
          : `<span class="insp-post-username insp-post-username-none">⚠ Nessuna influencer</span>`}
        <button class="insp-post-action" data-action="edit" data-id="${p.id}" aria-label="Modifica">✏️</button>
        <button class="insp-post-action" data-action="open" data-id="${p.id}" aria-label="Apri">↗</button>
        <button class="insp-post-action" data-action="del"  data-id="${p.id}" aria-label="Rimuovi">🗑️</button>
      </div>
      ${chipsHtml ? `<div class="insp-post-chips">${chipsHtml}</div>` : ""}
    </div>`;
  }).join("");

  if (window.instgrm?.Embeds?.process) {
    try { window.instgrm.Embeds.process(); } catch (_) {}
  }

  wrap.querySelectorAll(".insp-post-action").forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onPostAction(b.dataset.action, b.dataset.id);
    });
  });
}

function renderPostChips(post) {
  const groups = [
    { key: "styles",    taxonomy: "styles",    values: post.styles    || [] },
    { key: "seasons",   taxonomy: null,        values: post.seasons   || [] },  // seasons no chip-style
    { key: "occasions", taxonomy: "occasions", values: post.occasions || [] },
  ];
  const tagChips = (post.tags || []).map(t => `<span class="insp-tag-mini">#${escapeHtml(t)}</span>`).join("");
  const taxoChips = groups.flatMap(g => g.values.map(v => {
    let css = "";
    if (g.taxonomy) {
      const st = ChipStyles.getChipStyle(g.taxonomy, v);
      const inline = ChipStyles.styleToCss(st);
      if (inline) css = ` style="${inline}"`;
    }
    return `<span class="insp-chip-styled"${css}>${escapeHtml(v)}</span>`;
  })).join("");
  return taxoChips + tagChips;
}

async function onPostAction(action, id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  if (action === "open") {
    window.open(post.url, "_blank", "noopener");
  } else if (action === "edit") {
    openEditModal(id, {
      profileUsername: post.profileUsername || null,
      styles:    Array.isArray(post.styles)    ? [...post.styles]    : [],
      seasons:   Array.isArray(post.seasons)   ? [...post.seasons]   : [],
      occasions: Array.isArray(post.occasions) ? [...post.occasions] : [],
      tags:      Array.isArray(post.tags)      ? [...post.tags]      : [],
      notes:     post.notes || "",
    });
  } else if (action === "del") {
    if (!confirm("Rimuovere questo post dalle ispirazioni?")) return;
    try {
      await deletePost(id);
      state.posts = state.posts.filter(p => p.id !== id);
      renderStories();
      renderFilters();
      renderPosts();
      toast("Rimosso", "success");
    } catch (err) {
      toast(humanizeError(err), "error");
    }
  }
}

// =============================================================================
// Modal grafico add/edit post (influencer + stili + stagioni + occasioni + tag)
// =============================================================================
function openEditModal(id, draft) {
  state.modalEditingId = id;
  state.modalDraft = draft;
  $("#insp-modal-title").textContent = id ? "Modifica post" : "Salva post";
  renderModalBody();
  $("#insp-modal").classList.remove("hidden");
}

function closeModal() {
  $("#insp-modal").classList.add("hidden");
  state.modalEditingId = null;
  state.modalDraft = null;
}

function renderModalBody() {
  const d = state.modalDraft || {};
  const stylesOpts    = Taxonomies.listSimpleValues("styles");
  const seasonsOpts   = Taxonomies.listSimpleValues("seasons");
  const occasionsOpts = Taxonomies.listSimpleValues("occasions");

  const profilePicker = state.profiles.length > 0
    ? `<div class="insp-modal-profile-grid">
        ${state.profiles.map(p => `
          <button type="button" class="insp-modal-profile${d.profileUsername === p.username ? " is-active" : ""}" data-username="${escapeHtml(p.username)}">
            <span class="insp-modal-profile-avatar">${p.username.charAt(0).toUpperCase()}</span>
            <span class="insp-modal-profile-name">@${escapeHtml(p.username)}</span>
          </button>
        `).join("")}
        <button type="button" class="insp-modal-profile insp-modal-profile-none${!d.profileUsername ? " is-active" : ""}" data-username="">
          <span class="insp-modal-profile-avatar insp-modal-profile-avatar-none">—</span>
          <span class="insp-modal-profile-name">Nessuna</span>
        </button>
      </div>`
    : `<p class="insp-modal-hint">Nessuna influencer salvata. Aggiungile dalla tab "👤 Influencer".</p>`;

  $("#insp-modal-body").innerHTML = `
    <div class="insp-modal-section">
      <h3 class="insp-modal-section-title">👤 Influencer</h3>
      ${profilePicker}
    </div>

    ${stylesOpts.length > 0 ? `
    <div class="insp-modal-section">
      <h3 class="insp-modal-section-title">✨ Stile</h3>
      ${renderModalChipPicker("styles", stylesOpts, d.styles, "styles")}
    </div>` : ""}

    ${seasonsOpts.length > 0 ? `
    <div class="insp-modal-section">
      <h3 class="insp-modal-section-title">🌍 Stagioni</h3>
      ${renderModalChipPicker("seasons", seasonsOpts, d.seasons, null)}
    </div>` : ""}

    ${occasionsOpts.length > 0 ? `
    <div class="insp-modal-section">
      <h3 class="insp-modal-section-title">📅 Occasioni</h3>
      ${renderModalChipPicker("occasions", occasionsOpts, d.occasions, "occasions")}
    </div>` : ""}

    <div class="insp-modal-section">
      <h3 class="insp-modal-section-title">🏷️ Tag personali</h3>
      <input type="text" id="insp-modal-tags" placeholder="separati da virgola: minimal, lavoro..." value="${escapeHtml((d.tags || []).join(", "))}" />
    </div>

    <div class="insp-modal-section">
      <h3 class="insp-modal-section-title">📝 Note</h3>
      <textarea id="insp-modal-notes" rows="2" placeholder="Note personali sul look...">${escapeHtml(d.notes || "")}</textarea>
    </div>

    <div class="insp-modal-actions">
      <button type="button" class="btn btn--ghost" id="insp-modal-cancel">Annulla</button>
      <button type="button" class="btn btn--primary" id="insp-modal-save">${state.modalEditingId ? "Salva modifiche" : "Salva post"}</button>
    </div>
  `;

  // Bind profile picker
  $("#insp-modal-body").querySelectorAll(".insp-modal-profile").forEach(b => {
    b.addEventListener("click", () => {
      const u = b.dataset.username;
      state.modalDraft.profileUsername = u || null;
      $("#insp-modal-body").querySelectorAll(".insp-modal-profile").forEach(x => x.classList.remove("is-active"));
      b.classList.add("is-active");
    });
  });
  // Bind chip multi-select
  $("#insp-modal-body").querySelectorAll(".insp-modal-chip").forEach(b => {
    b.addEventListener("click", () => {
      const group = b.dataset.group;
      const value = b.dataset.value;
      const arr = state.modalDraft[group] || [];
      const idx = arr.indexOf(value);
      if (idx === -1) arr.push(value); else arr.splice(idx, 1);
      state.modalDraft[group] = arr;
      b.classList.toggle("is-active");
    });
  });
  // Save / Cancel
  $("#insp-modal-cancel").addEventListener("click", closeModal);
  $("#insp-modal-save").addEventListener("click", saveModal);
}

function renderModalChipPicker(group, options, selected, taxonomyKey) {
  const sel = new Set(selected || []);
  return `<div class="insp-modal-chip-row">
    ${options.map(v => {
      let css = "";
      if (taxonomyKey) {
        const st = ChipStyles.getChipStyle(taxonomyKey, v);
        const inline = ChipStyles.styleToCss(st);
        if (inline) css = ` style="${inline}"`;
      }
      const active = sel.has(v) ? " is-active" : "";
      return `<button type="button" class="insp-modal-chip${active}" data-group="${group}" data-value="${escapeHtml(v)}"${css}>${escapeHtml(capitalize(v))}</button>`;
    }).join("")}
  </div>`;
}

async function saveModal() {
  const d = state.modalDraft;
  if (!d) return;
  // Read inputs
  d.tags = ($("#insp-modal-tags").value || "")
    .split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  d.notes = ($("#insp-modal-notes").value || "").trim();

  const btn = $("#insp-modal-save");
  btn.disabled = true;
  btn.textContent = "...";
  try {
    if (state.modalEditingId) {
      // Edit esistente
      await updatePost(state.modalEditingId, {
        profileUsername: d.profileUsername || null,
        styles: d.styles || [],
        seasons: d.seasons || [],
        occasions: d.occasions || [],
        tags: d.tags || [],
        notes: d.notes || "",
      });
      // Aggiorna in-memory
      const post = state.posts.find(p => p.id === state.modalEditingId);
      if (post) {
        post.profileUsername = d.profileUsername || null;
        post.styles = d.styles || [];
        post.seasons = d.seasons || [];
        post.occasions = d.occasions || [];
        post.tags = d.tags || [];
        post.notes = d.notes || "";
      }
      toast("✓ Post aggiornato", "success");
    } else {
      // Nuovo post
      const post = await addPost(d.sourceUrl, {
        profileUsername: d.profileUsername || null,
        styles: d.styles || [],
        seasons: d.seasons || [],
        occasions: d.occasions || [],
        tags: d.tags || [],
        notes: d.notes || "",
      });
      state.posts = [post, ...state.posts];
      $("#insp-post-input").value = "";
      // Auto-create profile se username mancante in lista
      if (post.profileUsername && !state.profiles.some(p => p.username === post.profileUsername)) {
        state.profiles = await listProfiles();
        renderProfiles();
      }
      toast("✓ Post salvato", "success");
    }
    renderStories();
    renderFilters();
    renderPosts();
    closeModal();
  } catch (err) {
    console.error("[inspirations] save modal:", err);
    toast(humanizeError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = state.modalEditingId ? "Salva modifiche" : "Salva post";
  }
}

// =============================================================================
window.addEventListener("DOMContentLoaded", boot);
