// =============================================================================
// Ispirazioni: feed Instagram curato da Martina
// =============================================================================
// 2 collezioni Firestore:
//   inspirationProfiles: { username, displayName, addedAt, order }
//   inspirationPosts:    { url, postId, profileUsername, caption?, savedAt, tags[] }
//
// Pattern realistico (no scraping IG): l'utente incolla URL post Instagram
// → estraiamo username + postId → render via embed widget ufficiale Meta.
// =============================================================================

import {
  db, collection, doc, getDocs, addDoc, deleteDoc, updateDoc,
  query, orderBy, Timestamp, serverTimestamp,
} from "./firebase-config.js";

const COL_PROFILES = "inspirationProfiles";
const COL_POSTS    = "inspirationPosts";

// =============================================================================
// PARSER URL Instagram → { username, postId, type }
// =============================================================================
// Accetta:
//   https://www.instagram.com/chiaraferragni/  → profilo
//   https://www.instagram.com/p/ABC123/         → post
//   https://www.instagram.com/reel/ABC123/      → reel
//   https://www.instagram.com/tv/ABC123/        → IGTV
//   chiaraferragni                              → username puro
//   @chiaraferragni                             → username con @
// =============================================================================
export function parseInstagramUrl(input) {
  if (!input) return null;
  const s = String(input).trim();

  // Username puro (con o senza @)
  const userMatch = s.match(/^@?([a-zA-Z0-9._]{1,30})$/);
  if (userMatch && !s.includes("/") && !s.includes(".")) {
    return { type: "profile", username: userMatch[1].toLowerCase(), postId: null };
  }

  // URL completo
  let url;
  try {
    url = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch (_) {
    // Non valido come URL
    if (userMatch) return { type: "profile", username: userMatch[1].toLowerCase(), postId: null };
    return null;
  }

  if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./, ""))) return null;

  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  const parts = path.split("/");

  // /p/POSTID, /reel/POSTID, /tv/POSTID
  if (parts[0] === "p" || parts[0] === "reel" || parts[0] === "tv") {
    return {
      type: parts[0] === "p" ? "post" : parts[0],
      postId: parts[1] || null,
      username: null,  // username non e' nell'URL del post
      url: cleanUrl(url),
    };
  }

  // /USERNAME or /USERNAME/p/POSTID (URL alternativo)
  if (parts.length === 1) {
    return { type: "profile", username: parts[0].toLowerCase(), postId: null };
  }
  if (parts.length >= 3 && (parts[1] === "p" || parts[1] === "reel")) {
    return {
      type: parts[1] === "p" ? "post" : "reel",
      username: parts[0].toLowerCase(),
      postId: parts[2],
      url: cleanUrl(url),
    };
  }

  return null;
}

function cleanUrl(url) {
  // Rimuove query params di tracking (utm_*, igshid, ecc.)
  const clean = `${url.protocol}//${url.hostname}${url.pathname}`;
  return clean.endsWith("/") ? clean : clean + "/";
}

// =============================================================================
// CRUD profili
// =============================================================================
export async function listProfiles() {
  const q = query(collection(db, COL_PROFILES), orderBy("order", "asc"));
  let snap;
  try {
    snap = await getDocs(q);
  } catch (_) {
    snap = await getDocs(collection(db, COL_PROFILES));
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addProfile(input) {
  const parsed = parseInstagramUrl(input);
  if (!parsed) throw new Error("URL o username non valido");
  const username = parsed.username;
  if (!username) throw new Error("Imposta uno username (es. chiaraferragni)");

  // Check duplicati
  const existing = await listProfiles();
  if (existing.some(p => p.username === username)) {
    throw new Error(`@${username} già nelle tue ispirazioni`);
  }

  const order = existing.length > 0
    ? Math.max(...existing.map(p => p.order || 0)) + 1
    : 0;

  const data = {
    username,
    displayName: input.startsWith("@") ? input : username,
    profileUrl: `https://www.instagram.com/${username}/`,
    addedAt: serverTimestamp(),
    order,
  };
  const ref = await addDoc(collection(db, COL_PROFILES), data);
  return { id: ref.id, ...data };
}

export async function deleteProfile(id) {
  await deleteDoc(doc(db, COL_PROFILES, id));
  // Cleanup: cancella anche tutti i post di quel profilo
  // (non lo facciamo qui per evitare side-effect; l'utente può farlo a parte)
}

export async function reorderProfiles(orderedIds) {
  // Aggiorna il campo 'order' di ogni profilo nell'ordine specificato
  await Promise.all(orderedIds.map((id, idx) =>
    updateDoc(doc(db, COL_PROFILES, id), { order: idx })
  ));
}

// =============================================================================
// CRUD post (singoli URL Instagram)
// =============================================================================
export async function listPosts() {
  const q = query(collection(db, COL_POSTS), orderBy("savedAt", "desc"));
  let snap;
  try {
    snap = await getDocs(q);
  } catch (_) {
    snap = await getDocs(collection(db, COL_POSTS));
  }
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addPost(input, opts = {}) {
  const parsed = parseInstagramUrl(input);
  if (!parsed) throw new Error("URL non valido");
  if (parsed.type !== "post" && parsed.type !== "reel" && parsed.type !== "tv") {
    throw new Error("Incolla l'URL di un POST o REEL Instagram (es. https://www.instagram.com/p/ABC123/)");
  }
  if (!parsed.postId) throw new Error("Impossibile estrarre l'ID del post");

  // Check duplicati per postId
  const existing = await listPosts();
  if (existing.some(p => p.postId === parsed.postId)) {
    throw new Error("Post già nelle tue ispirazioni");
  }

  // Se URL ha username, crea anche il profilo (se non esiste)
  let profileUsername = parsed.username || opts.profileUsername || null;
  if (profileUsername) {
    const profiles = await listProfiles();
    if (!profiles.some(p => p.username === profileUsername)) {
      try {
        await addProfile(profileUsername);
      } catch (_) { /* duplicato race condition: ignore */ }
    }
  }

  const data = {
    url: parsed.url || `https://www.instagram.com/p/${parsed.postId}/`,
    postId: parsed.postId,
    type: parsed.type,
    profileUsername: profileUsername || null,
    notes: opts.notes || "",
    tags: Array.isArray(opts.tags) ? opts.tags : [],
    savedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COL_POSTS), data);
  return { id: ref.id, ...data };
}

export async function deletePost(id) {
  await deleteDoc(doc(db, COL_POSTS, id));
}

export async function updatePostTags(id, tags) {
  await updateDoc(doc(db, COL_POSTS, id), { tags: Array.isArray(tags) ? tags : [] });
}
