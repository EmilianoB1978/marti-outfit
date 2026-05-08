// =============================================================================
// Pagina /inspirations.html — feed + gestione profili Instagram salvati
// =============================================================================

import * as Theme from "./theme/manager.js";
import {
  listProfiles, addProfile, deleteProfile, reorderProfiles,
  listPosts, addPost, deletePost, updatePostTags,
  parseInstagramUrl,
} from "./inspirations-data.js";

Theme.init();

const state = {
  profiles: [],
  posts: [],
  currentTab: "feed",
  filterUsername: null,  // null = tutti
  filterTag: null,
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

// =============================================================================
// Boot
// =============================================================================
async function boot() {
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
  // Tabs
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

  // Add post
  $("#btn-add-post").addEventListener("click", onAddPost);
  $("#insp-post-input").addEventListener("keydown", e => {
    if (e.key === "Enter") onAddPost();
  });
  // Add profile
  $("#btn-add-profile").addEventListener("click", onAddProfile);
  $("#insp-profile-input").addEventListener("keydown", e => {
    if (e.key === "Enter") onAddProfile();
  });
  // Modal close
  $("#insp-modal-close").addEventListener("click", closeModal);
  $("#insp-modal").addEventListener("click", e => {
    if (e.target === $("#insp-modal")) closeModal();
  });
  $("#btn-info").addEventListener("click", showInfo);
}

function showInfo() {
  alert(`Come funziona la sezione Ispirazioni:

1. Salva le tue influencer preferite nella tab "👤 Influencer" (incolla URL profilo o @username).

2. Quando vedi un post Instagram che ti ispira:
   • Tap sui "..." in Instagram → "Copia link"
   • Torna qui → Feed → "+ Aggiungi" e incolla l'URL

3. I post vengono mostrati con l'embed ufficiale Instagram (immagine + caption + autore live).

4. Tap su un post per vederlo grande, salvarlo come ispirazione outfit, o aprirlo direttamente in Instagram.

Nota: Instagram non permette di leggere automaticamente il feed di un account altrui. Quindi i post vanno aggiunti uno per uno (è veloce).`);
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
  const btn = $("#btn-add-post");
  btn.disabled = true;
  btn.textContent = "...";
  try {
    const post = await addPost(value);
    input.value = "";
    state.posts = [post, ...state.posts];
    if (post.profileUsername && !state.profiles.some(p => p.username === post.profileUsername)) {
      state.profiles = await listProfiles();
      renderProfiles();
      renderStories();
    }
    renderPosts();
    toast("✓ Post salvato", "success");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Aggiungi";
  }
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
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Aggiungi";
  }
}

// =============================================================================
// Render PROFILES (lista profili)
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
      <div class="insp-avatar" data-username="${p.username}">${p.username.charAt(0).toUpperCase()}</div>
      <div class="insp-profile-info">
        <div class="insp-profile-name">@${escapeHtml(p.username)}</div>
        <div class="insp-profile-count">${postCount} post salvat${postCount === 1 ? "o" : "i"}</div>
      </div>
      <a class="insp-profile-link" href="${escapeHtml(p.profileUrl || `https://www.instagram.com/${p.username}/`)}" target="_blank" rel="noopener noreferrer" title="Apri su Instagram">↗</a>
      <button class="insp-profile-del" data-id="${p.id}" aria-label="Rimuovi">🗑️</button>
    </div>`;
  }).join("");

  wrap.querySelectorAll(".insp-profile-del").forEach(b => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = b.dataset.id;
      if (!confirm("Rimuovere questa influencer? I post salvati restano.")) return;
      try {
        await deleteProfile(id);
        state.profiles = state.profiles.filter(x => x.id !== id);
        renderProfiles();
        renderStories();
        toast("Rimossa", "success");
      } catch (err) {
        toast("Errore: " + err.message, "error");
      }
    });
  });
}

// =============================================================================
// Render STORIES (cerchi avatar in cima al feed)
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
// Render FILTERS (tag)
// =============================================================================
function renderFilters() {
  const wrap = $("#insp-filters");
  const allTags = new Set();
  for (const p of state.posts) {
    for (const t of (p.tags || [])) allTags.add(t);
  }
  if (allTags.size === 0) { wrap.hidden = true; wrap.innerHTML = ""; return; }
  wrap.hidden = false;
  const tagsArr = Array.from(allTags).sort();
  wrap.innerHTML = `<div class="insp-tag-row">
    ${tagsArr.map(t => `<button class="insp-tag${state.filterTag === t ? " is-active" : ""}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`).join("")}
  </div>`;
  wrap.querySelectorAll(".insp-tag").forEach(b => {
    b.addEventListener("click", () => {
      state.filterTag = state.filterTag === b.dataset.tag ? null : b.dataset.tag;
      renderFilters();
      renderPosts();
    });
  });
}

// =============================================================================
// Render POSTS (griglia con embed Instagram)
// =============================================================================
function renderPosts() {
  const wrap = $("#insp-posts");
  let posts = state.posts;
  if (state.filterUsername) posts = posts.filter(p => p.profileUsername === state.filterUsername);
  if (state.filterTag)      posts = posts.filter(p => (p.tags || []).includes(state.filterTag));

  if (posts.length === 0) {
    wrap.innerHTML = `<div class="insp-empty">
      <div class="insp-empty-icon">📸</div>
      <p>${state.filterUsername || state.filterTag ? "Nessun post per questo filtro" : "Nessun post salvato"}</p>
      ${(state.filterUsername || state.filterTag) ? "" : `<p class="insp-empty-hint">Incolla l'URL di un post Instagram qui sopra. Aprilo in Instagram, "..." → "Copia link" → torna qui e incolla.</p>`}
    </div>`;
    return;
  }

  wrap.innerHTML = posts.map(p => `
    <div class="insp-post-card" data-id="${p.id}">
      <blockquote class="instagram-media"
        data-instgrm-captioned
        data-instgrm-permalink="${escapeHtml(p.url)}"
        data-instgrm-version="14"
        style="background:#fff; border:0; margin:0; max-width:540px; min-width:280px; padding:0; width:100%;"></blockquote>
      <div class="insp-post-actions">
        ${p.profileUsername ? `<span class="insp-post-username">@${escapeHtml(p.profileUsername)}</span>` : ""}
        <div class="insp-post-tags">
          ${(p.tags || []).map(t => `<span class="insp-tag-mini">#${escapeHtml(t)}</span>`).join("")}
        </div>
        <button class="insp-post-action" data-action="open" data-id="${p.id}" aria-label="Apri">↗</button>
        <button class="insp-post-action" data-action="tags" data-id="${p.id}" aria-label="Tag">🏷️</button>
        <button class="insp-post-action" data-action="del" data-id="${p.id}" aria-label="Rimuovi">🗑️</button>
      </div>
    </div>
  `).join("");

  // Re-process embed Instagram (lo script.embed.js espone window.instgrm.Embeds.process)
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

async function onPostAction(action, id) {
  const post = state.posts.find(p => p.id === id);
  if (!post) return;
  if (action === "open") {
    window.open(post.url, "_blank", "noopener");
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
      toast("Errore: " + err.message, "error");
    }
  } else if (action === "tags") {
    const current = (post.tags || []).join(", ");
    const newTags = prompt("Tag (separati da virgola). Es: minimal, lavoro, primavera", current);
    if (newTags === null) return;
    const arr = newTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    try {
      await updatePostTags(id, arr);
      post.tags = arr;
      renderFilters();
      renderPosts();
      toast("Tag aggiornati", "success");
    } catch (err) {
      toast("Errore: " + err.message, "error");
    }
  }
}

function closeModal() {
  $("#insp-modal").classList.add("hidden");
}

// =============================================================================
window.addEventListener("DOMContentLoaded", boot);
