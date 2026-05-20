// =============================================================================
// User templates: template personalizzati salvati su Firestore
// Schema: settings/share_templates document = { templates: [...] }
// =============================================================================

import {
  db, doc, getDoc, setDoc, serverTimestamp,
} from "./firebase-config.js";

const DOC_PATH = ["settings", "share_templates"];

let _cache = null;

export async function load() {
  if (_cache) return _cache;
  const ref = doc(db, ...DOC_PATH);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    _cache = snap.data().templates || [];
  } else {
    _cache = [];
  }
  return _cache;
}

export function get() {
  return _cache || [];
}

export async function save(template) {
  if (!_cache) await load();
  // Genera id se manca
  if (!template.id) {
    template.id = "ut_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  }
  // Update or insert
  const idx = _cache.findIndex(t => t.id === template.id);
  if (idx >= 0) _cache[idx] = template;
  else _cache.push(template);

  await persist();
  return template;
}

export async function remove(id) {
  if (!_cache) await load();
  _cache = _cache.filter(t => t.id !== id);
  await persist();
}

async function persist() {
  const ref = doc(db, ...DOC_PATH);
  await setDoc(ref, { templates: _cache, updated_at: serverTimestamp() });
}

/**
 * Template di partenza (preset rapidi che l'utente puo' modificare).
 */
export const STARTER_PRESETS = [
  {
    name: "Custom 1",
    config: {
      background: { type: "solid", color: "#ffffff" },
      title: { font: "system", weight: "bold", size: 56, color: "#1a1a1a", align: "center", y: 110 },
      date:  { color: "#888" },
      accent: "#d4af37",
      line: { show: true, color: "#d4af37", width: 3 },
      emoji: "",
      photoStyle: { radius: 12, borderColor: "#e0e0e0", borderWidth: 2, cardBg: "#fff", padding: 60, gap: 24, shadow: false },
      watermark: { text: "✨ Marti Outfit", color: "#aaa", font: "system" },
    },
  },
];
