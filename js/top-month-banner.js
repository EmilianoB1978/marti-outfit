// Top Capi del Mese — banner sulla home complementare al Dormant.
// Mostra i 3 capi piu' indossati negli ultimi 30 giorni in base a
// wear_history, con count e tap → apre modal capo.

import { listItems } from "./wardrobe.js";

let mounted = false;

export async function renderTopMonthBanner() {
  if (mounted) return;
  mounted = true;
  const root = document.getElementById("top-month-banner");
  if (!root) return;

  const items = await listItems().catch(() => []);
  const cutoff = Date.now() - 30 * 86400 * 1000;

  // Conta wears nel periodo
  const counts = items.map(it => {
    const hist = it.wear_history;
    if (!Array.isArray(hist) || hist.length === 0) return null;
    let n = 0;
    for (const ts of hist) {
      let t = 0;
      if (ts?.seconds) t = ts.seconds * 1000;
      else if (typeof ts === "string") t = new Date(ts).getTime();
      else if (ts instanceof Date) t = ts.getTime();
      else if (typeof ts === "number") t = ts;
      if (t > cutoff) n++;
    }
    return n > 0 ? { item: it, count: n } : null;
  }).filter(Boolean);

  if (counts.length < 3) {
    root.classList.add("hidden");
    return;
  }
  counts.sort((a, b) => b.count - a.count);
  const top = counts.slice(0, 3);

  root.innerHTML = `
    <div class="top-month-banner-head">
      <span class="top-month-icon">⭐</span>
      <div class="top-month-text">
        <div class="top-month-title">I tuoi capi piu' indossati</div>
        <div class="top-month-sub">Ultimi 30 giorni</div>
      </div>
    </div>
    <div class="top-month-list">
      ${top.map((t, i) => `
        <button type="button" class="top-month-item" data-id="${t.item.id}" aria-label="Apri capo">
          <span class="top-month-rank">${i + 1}</span>
          <div class="top-month-thumb">
            ${t.item.photo_url
              ? `<img src="${t.item.photo_url}" alt="" loading="lazy">`
              : `<span class="top-month-thumb-placeholder">👕</span>`}
          </div>
          <div class="top-month-info">
            <div class="top-month-name">${escapeHtml(t.item.subcategory || t.item.category || "Capo")}</div>
            <div class="top-month-count">${t.count}× nel mese</div>
          </div>
        </button>
      `).join("")}
    </div>
  `;
  root.classList.remove("hidden");

  root.querySelectorAll(".top-month-item").forEach(btn => {
    btn.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("marty:open-item", { detail: { id: btn.dataset.id } }));
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
