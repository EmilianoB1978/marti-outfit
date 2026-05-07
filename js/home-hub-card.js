// Home hub card: integra Promemoria di oggi + Diario (streak / scrivi) + Note pinned
// Carica i dati in parallelo, mostra solo i tile rilevanti, fail-soft.

import { listReminders, bucketOf, REMINDER_TYPES } from "./reminders-data.js";
import { listEntries, todayId, computeStreak } from "./diary-data.js";
import { listNotes } from "./notes-data.js";

let mounted = false;

export async function renderHomeHubCard() {
  if (mounted) return;
  mounted = true;
  const root = document.getElementById("today-hub-card");
  if (!root) return;

  // Lazy load in parallelo, fail-soft per ogni source
  const [reminders, entries, notes] = await Promise.all([
    listReminders().catch(() => []),
    listEntries().catch(() => []),
    listNotes().catch(() => []),
  ]);

  const todayReminders = reminders.filter(r =>
    r.status !== "done" && (bucketOf(r) === "today" || bucketOf(r) === "overdue")
  );
  const overdueCount = reminders.filter(r => r.status !== "done" && bucketOf(r) === "overdue").length;
  const todayCount = todayReminders.length;

  const streak = computeStreak(entries);
  const today = todayId();
  const hasToday = entries.some(e => e.id === today);

  const pinnedNotes = (notes || []).filter(n => n.pinned).slice(0, 1);

  // Se non c'e' nulla da mostrare, hide
  if (todayCount === 0 && streak === 0 && pinnedNotes.length === 0 && hasToday) {
    root.classList.add("hidden");
    return;
  }

  const tiles = [];

  // Tile Promemoria
  if (todayCount > 0) {
    const first = todayReminders[0];
    const meta = REMINDER_TYPES[first.type] || REMINDER_TYPES.manual;
    tiles.push(`
      <a href="./reminders.html" class="hub-tile hub-tile-reminders${overdueCount > 0 ? " is-urgent" : ""}">
        <div class="hub-tile-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
        <div class="hub-tile-body">
          <div class="hub-tile-label">${overdueCount > 0 ? "⚠️ " : ""}${todayCount} promemoria oggi</div>
          <div class="hub-tile-sub">${escapeHtml(first.title)}</div>
        </div>
        <span class="hub-tile-arrow">›</span>
      </a>
    `);
  }

  // Tile Diario
  if (!hasToday || streak > 0) {
    const cta = hasToday
      ? `Streak ${streak} giorn${streak === 1 ? "o" : "i"} 🔥`
      : `Scrivi nel diario`;
    const sub = hasToday
      ? `Tap per modificare la pagina di oggi`
      : (streak > 0 ? `Non spezzare lo streak (${streak} 🔥)` : `Inizia il tuo diario`);
    tiles.push(`
      <a href="./diary-detail.html?date=${today}" class="hub-tile hub-tile-diary">
        <div class="hub-tile-icon hub-tile-icon-diary">📔</div>
        <div class="hub-tile-body">
          <div class="hub-tile-label">${cta}</div>
          <div class="hub-tile-sub">${sub}</div>
        </div>
        <span class="hub-tile-arrow">›</span>
      </a>
    `);
  }

  // Tile nota pinnata
  if (pinnedNotes.length > 0) {
    const n = pinnedNotes[0];
    tiles.push(`
      <a href="./note-detail.html?id=${n.id}" class="hub-tile hub-tile-note">
        <div class="hub-tile-icon hub-tile-icon-note">📌</div>
        <div class="hub-tile-body">
          <div class="hub-tile-label">${escapeHtml(n.title || "Nota")}</div>
          <div class="hub-tile-sub">Pinnata</div>
        </div>
        <span class="hub-tile-arrow">›</span>
      </a>
    `);
  }

  if (tiles.length === 0) {
    root.classList.add("hidden");
    return;
  }

  root.innerHTML = tiles.join("");
  root.classList.remove("hidden");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
