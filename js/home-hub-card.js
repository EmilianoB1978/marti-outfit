// Home hub card: integra Promemoria di oggi + Diario (streak / scrivi) + Note pinned
// Carica i dati in parallelo, mostra solo i tile rilevanti, fail-soft.

import { listReminders, bucketOf, REMINDER_TYPES } from "./reminders-data.js";
import { listEntries, todayId, computeStreak, MOODS, getOrCreateEntry, updateEntry } from "./diary-data.js";
import { listNotes } from "./notes-data.js";
import * as Theme from "./theme/manager.js";
import { SEASONS } from "./armocromia-data.js";
import { paletteStats } from "./color-match.js";
import { listItems } from "./wardrobe.js";

let mounted = false;

export async function renderHomeHubCard() {
  if (mounted) return;
  mounted = true;
  const root = document.getElementById("today-hub-card");
  if (!root) return;

  // Lazy load in parallelo, fail-soft per ogni source
  const [reminders, entries, notes, items] = await Promise.all([
    listReminders().catch(() => []),
    listEntries().catch(() => []),
    listNotes().catch(() => []),
    listItems().catch(() => []),
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
  if (!hasToday) {
    // Quick mood capture: 1 tap registra entry con mood (no editor)
    const moodChips = MOODS.map(m =>
      `<button type="button" class="hub-mood-chip" data-mood="${m.key}" title="${m.label}" aria-label="${m.label}">${m.emoji}</button>`
    ).join("");
    tiles.push(`
      <div class="hub-tile hub-tile-diary hub-tile-mood">
        <div class="hub-tile-icon hub-tile-icon-diary">📔</div>
        <div class="hub-tile-body hub-mood-body">
          <div class="hub-tile-label">Come stai oggi?</div>
          <div class="hub-mood-row" id="hub-mood-row">${moodChips}</div>
        </div>
        <a href="./diary-detail.html?date=${today}" class="hub-tile-arrow" aria-label="Apri editor diario">›</a>
      </div>
    `);
  } else if (streak > 0) {
    tiles.push(`
      <a href="./diary-detail.html?date=${today}" class="hub-tile hub-tile-diary">
        <div class="hub-tile-icon hub-tile-icon-diary">📔</div>
        <div class="hub-tile-body">
          <div class="hub-tile-label">Streak ${streak} giorn${streak === 1 ? "o" : "i"} 🔥</div>
          <div class="hub-tile-sub">Tap per modificare la pagina di oggi</div>
        </div>
        <span class="hub-tile-arrow">›</span>
      </a>
    `);
  }

  // Tile armocromia (se test fatto)
  const armoData = Theme.getPreferences().armocromia;
  if (armoData?.seasonKey && SEASONS[armoData.seasonKey] && items.length >= 5) {
    const season = SEASONS[armoData.seasonKey];
    const stats = paletteStats(items);
    if (stats.applicable >= 3) {
      tiles.push(`
        <a href="./armocromia.html" class="hub-tile hub-tile-armo">
          <div class="hub-tile-icon" style="background:${season.palette[0]}33;color:${season.palette[0]}">${season.emoji}</div>
          <div class="hub-tile-body">
            <div class="hub-tile-label">${escapeHtml(season.name)} · ${stats.percent}% in palette</div>
            <div class="hub-tile-sub">${stats.in} perfetti · ${stats.near} vicini · ${stats.out + stats.avoid} fuori</div>
          </div>
          <span class="hub-tile-arrow">›</span>
        </a>
      `);
    }
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

  // Bind quick mood capture
  const moodRow = root.querySelector("#hub-mood-row");
  if (moodRow) {
    moodRow.addEventListener("click", async (e) => {
      const btn = e.target.closest(".hub-mood-chip");
      if (!btn) return;
      const mood = btn.dataset.mood;
      btn.classList.add("is-selected");
      btn.disabled = true;
      try {
        await getOrCreateEntry(today);
        await updateEntry(today, { mood });
        // Sostituisci card con success state
        const tile = btn.closest(".hub-tile-mood");
        const moodDef = MOODS.find(m => m.key === mood);
        if (tile && moodDef) {
          tile.outerHTML = `<a href="./diary-detail.html?date=${today}" class="hub-tile hub-tile-diary">
            <div class="hub-tile-icon hub-tile-icon-diary">${moodDef.emoji}</div>
            <div class="hub-tile-body">
              <div class="hub-tile-label">Mood salvato: ${moodDef.label}</div>
              <div class="hub-tile-sub">Tap per scrivere i pensieri</div>
            </div>
            <span class="hub-tile-arrow">›</span>
          </a>`;
        }
      } catch (err) {
        btn.classList.remove("is-selected");
        btn.disabled = false;
        console.error("quick mood capture:", err);
      }
    });
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
