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
// PARSER URL Instagram → { username, postId, type } | null
//                       o { type: 'share', shareCode } per i link share/
// =============================================================================
// Accetta:
//   https://www.instagram.com/chiaraferragni/                → profilo
//   https://www.instagram.com/p/ABC123/                       → post
//   https://www.instagram.com/reel/ABC123/                    → reel
//   https://www.instagram.com/tv/ABC123/                      → IGTV
//   https://www.instagram.com/USER/p/ABC123/                  → post alt
//   https://www.instagram.com/USER/reel/ABC123/               → reel alt
//   https://www.instagram.com/share/ABC123/                   → share link
//   https://www.instagram.com/share/p/ABC123/                 → share link post
//   https://www.instagram.com/share/reel/ABC123/              → share link reel
//   chiaraferragni  /  @chiaraferragni                        → username
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
    if (userMatch) return { type: "profile", username: userMatch[1].toLowerCase(), postId: null };
    return null;
  }

  if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./, ""))) return null;

  const path = url.pathname.replace(/^\/+|\/+$/g, "");
  const parts = path.split("/");

  // /p/POSTID, /reel/POSTID, /tv/POSTID
  if (parts[0] === "p" || parts[0] === "reel" || parts[0] === "tv") {
    if (!parts[1]) return null;
    return {
      type: parts[0] === "p" ? "post" : parts[0],
      postId: parts[1],
      username: null,
      url: cleanUrl(url),
    };
  }

  // /share/p/POSTID, /share/reel/POSTID — versione esplicita
  if (parts[0] === "share" && (parts[1] === "p" || parts[1] === "reel" || parts[1] === "tv")) {
    if (!parts[2]) return null;
    return {
      type: parts[1] === "p" ? "post" : parts[1],
      postId: parts[2],
      username: null,
      url: `https://www.instagram.com/${parts[1]}/${parts[2]}/`,
    };
  }

  // /share/SHORTCODE — link offuscato Instagram (richiede redirect server-side
  // per ottenere il vero URL). Non gestibile lato client. Restituisco un tipo
  // dedicato per dare un errore chiaro all'utente.
  if (parts[0] === "share" && parts[1]) {
    return { type: "share", shareCode: parts[1], url: cleanUrl(url) };
  }

  // /USERNAME (profilo)
  if (parts.length === 1) {
    return { type: "profile", username: parts[0].toLowerCase(), postId: null };
  }
  // /USERNAME/p/POSTID
  if (parts.length >= 3 && (parts[1] === "p" || parts[1] === "reel" || parts[1] === "tv")) {
    return {
      type: parts[1] === "p" ? "post" : parts[1],
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
  if (!parsed) {
    console.warn("[inspirations] URL non parsabile:", input);
    throw new Error("URL non valido. Deve essere un link Instagram.");
  }
  if (parsed.type === "share") {
    throw new Error(
      "Hai incollato un link 'Condividi'. Apri il post in Instagram, tap sui ⋯ in alto a destra → 'Copia link', poi torna qui."
    );
  }
  if (parsed.type === "profile") {
    throw new Error("Hai incollato un URL profilo. Per i profili usa la tab '👤 Influencer'.");
  }
  if (parsed.type !== "post" && parsed.type !== "reel" && parsed.type !== "tv") {
    throw new Error("Tipo di link non supportato. Usa l'URL di un post o reel.");
  }
  if (!parsed.postId) throw new Error("Impossibile estrarre l'ID del post dall'URL");

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

export async function updatePostProfile(id, profileUsername) {
  await updateDoc(doc(db, COL_POSTS, id), {
    profileUsername: profileUsername || null,
  });
}
