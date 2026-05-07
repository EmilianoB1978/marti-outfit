// Reminders data layer: CRUD Firestore + auto-suggestions armadio-aware
// USP: e' l'unico sistema di promemoria che sa cos'hai nell'armadio.
//
// Tipi:
//   manual    - promemoria libero
//   garment   - legato a un capo (lava/ritira/riprova)
//   tailor    - ritiro da sarta (linked a Note type=tailor)
//   gift      - regalo per qualcuno (linked a Note type=gift)
//   wash      - "lava il capo X dopo l'uso"
//   season    - cambio stagione (annuale)
//   outfit    - "indossa l'outfit Y il giorno Z" (linked a Calendar event)
//
// Stato:
//   pending | done | snoozed | cancelled
//
// Notifiche:
//   In-app banner via Notification API (se permesso) + badge count.
//   Web Push e' fuori scope ora (richiede VAPID server-side).

import {
  db,
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp,
} from "./firebase-config.js";

const COL = "reminders";
const cache = { items: null, ts: 0 };
const TTL = 30 * 1000;

export const REMINDER_TYPES = {
  manual:  { icon: "📝", label: "Promemoria",       color: "#9ca3af" },
  garment: { icon: "👕", label: "Capo",              color: "#a78bfa" },
  tailor:  { icon: "✂️", label: "Sarta",             color: "#fb923c" },
  gift:    { icon: "🎁", label: "Regalo",            color: "#f472b6" },
  wash:    { icon: "🧺", label: "Lavaggio",          color: "#60a5fa" },
  season:  { icon: "🍂", label: "Cambio stagione",   color: "#facc15" },
  outfit:  { icon: "👗", label: "Outfit programmato", color: "#34d399" },
};

export const PRIORITIES = {
  low:    { label: "Bassa",   color: "#9ca3af" },
  medium: { label: "Media",   color: "#60a5fa" },
  high:   { label: "Alta",    color: "#f87171" },
};

// CRUD --------------------------------------------------------------

export async function listReminders({ force = false } = {}) {
  if (!force && cache.items && Date.now() - cache.ts < TTL) return cache.items;
  const snap = await getDocs(query(collection(db, COL), orderBy("dueAt", "asc")));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  cache.items = items;
  cache.ts = Date.now();
  return items;
}

export async function getReminder(id) {
  const ref = doc(db, COL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function createReminder(payload) {
  const data = {
    type: payload.type || "manual",
    title: payload.title || "",
    notes: payload.notes || "",
    dueAt: payload.dueAt ? Timestamp.fromDate(new Date(payload.dueAt)) : null,
    priority: payload.priority || "medium",
    status: "pending",
    repeat: payload.repeat || "none", // none|daily|weekly|monthly|yearly
    garmentId: payload.garmentId || null,
    noteId: payload.noteId || null,
    eventId: payload.eventId || null,
    notifySent: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const ref = await addDoc(collection(db, COL), data);
  cache.items = null;
  return ref.id;
}

export async function updateReminder(id, patch) {
  const ref = doc(db, COL, id);
  const data = { ...patch, updatedAt: Timestamp.now() };
  if (patch.dueAt !== undefined) {
    data.dueAt = patch.dueAt ? Timestamp.fromDate(new Date(patch.dueAt)) : null;
  }
  await updateDoc(ref, data);
  cache.items = null;
}

export async function deleteReminder(id) {
  await deleteDoc(doc(db, COL, id));
  cache.items = null;
}

export async function completeReminder(id) {
  const r = await getReminder(id);
  if (!r) return;
  if (r.repeat && r.repeat !== "none" && r.dueAt) {
    // Sposta avanti il dueAt secondo la regola di ripetizione
    const next = nextDueDate(r.dueAt.toDate(), r.repeat);
    await updateReminder(id, { dueAt: next, notifySent: false });
  } else {
    await updateReminder(id, { status: "done", completedAt: Timestamp.now() });
  }
}

function nextDueDate(d, repeat) {
  const nd = new Date(d);
  switch (repeat) {
    case "daily":   nd.setDate(nd.getDate() + 1); break;
    case "weekly":  nd.setDate(nd.getDate() + 7); break;
    case "monthly": nd.setMonth(nd.getMonth() + 1); break;
    case "yearly":  nd.setFullYear(nd.getFullYear() + 1); break;
  }
  return nd;
}

export async function snoozeReminder(id, hours = 24) {
  const r = await getReminder(id);
  if (!r) return;
  const base = r.dueAt ? r.dueAt.toDate() : new Date();
  const next = new Date(base.getTime() + hours * 3600 * 1000);
  await updateReminder(id, { dueAt: next, status: "pending", notifySent: false });
}

// Bucket helpers ----------------------------------------------------

export function bucketOf(reminder, now = new Date()) {
  if (reminder.status === "done") return "done";
  if (!reminder.dueAt) return "no_date";
  const due = reminder.dueAt.toDate();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due); dueDay.setHours(0, 0, 0, 0);
  const diff = (dueDay - today) / (24 * 3600 * 1000);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "week";
  return "later";
}

export function countByBucket(items) {
  const out = { overdue: 0, today: 0, week: 0, later: 0, no_date: 0, done: 0 };
  for (const r of items) out[bucketOf(r)]++;
  return out;
}

// Notifiche locali --------------------------------------------------

export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") return Notification.requestPermission();
  return Notification.permission;
}

export function tryNotifyDue(items) {
  if (!("Notification" in window) || Notification.permission !== "granted") return 0;
  let n = 0;
  const now = Date.now();
  for (const r of items) {
    if (r.status !== "pending" || !r.dueAt || r.notifySent) continue;
    const ts = r.dueAt.toDate ? r.dueAt.toDate().getTime() : new Date(r.dueAt).getTime();
    if (ts <= now) {
      const meta = REMINDER_TYPES[r.type] || REMINDER_TYPES.manual;
      try {
        new Notification(`${meta.icon} ${meta.label}`, {
          body: r.title,
          tag: `reminder-${r.id}`,
          icon: "./icons/icon-192.png",
        });
        updateReminder(r.id, { notifySent: true });
        n++;
      } catch (_) { /* ignore */ }
    }
  }
  return n;
}
