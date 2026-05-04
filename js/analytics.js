// =============================================================================
// Analytics page - calcola e visualizza statistiche del guardaroba
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";

Theme.init();

// Colori per i pie chart (palette discreta, accessibile)
const CHART_PALETTE = [
  "#d4af37", "#3498db", "#27ae60", "#e74c3c", "#9b59b6",
  "#f39c12", "#1abc9c", "#e67e22", "#34495e", "#16a085",
];

const state = {
  items: [],
  outfits: [],
};

// =============================================================================
// Boot
// =============================================================================
async function load() {
  try {
    const [items, outfits] = await Promise.all([
      Wardrobe.listItems(),
      Outfit.listSavedOutfits(),
    ]);
    state.items = items;
    state.outfits = outfits;
    render();
  } catch (err) {
    console.error(err);
    document.getElementById("stat-total").textContent = "errore";
  }
}

// =============================================================================
// Render generale
// =============================================================================
function render() {
  renderStatCards();
  renderTopWorn();
  renderDeadStock();
  renderPieChart("chart-categories", "legend-categories", "category");
  renderPieChart("chart-styles", "legend-styles", "style");
  renderCostPerWear();
}

// =============================================================================
// Stat cards (4 numeri grossi)
// =============================================================================
function renderStatCards() {
  const total = state.items.length;
  const totalValue = state.items.reduce((sum, it) => sum + (it.price || 0), 0);
  const outfits = state.outfits.length;
  const totalWears = state.items.reduce((sum, it) => sum + (it.wear_count || 0), 0);

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-value").textContent = totalValue > 0
    ? `€${totalValue.toFixed(0)}`
    : "—";
  document.getElementById("stat-outfits").textContent = outfits;
  document.getElementById("stat-wears").textContent = totalWears;
}

// =============================================================================
// Top 5 piu' indossati
// =============================================================================
function renderTopWorn() {
  const sorted = state.items
    .filter(it => (it.wear_count || 0) > 0)
    .sort((a, b) => (b.wear_count || 0) - (a.wear_count || 0))
    .slice(0, 5);

  const container = document.getElementById("top-worn");

  if (sorted.length === 0) {
    container.innerHTML = `<p class="empty-state-inline">Marca i tuoi outfit come "indossati" per iniziare a tracciare.</p>`;
    return;
  }

  container.innerHTML = sorted.map((it, idx) => `
    <div class="ranked-row">
      <div class="ranked-num">${idx + 1}</div>
      <div class="ranked-photo">
        ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : '👕'}
      </div>
      <div class="ranked-info">
        <div class="ranked-title">${escapeHtml(it.category || 'Capo')}${it.color ? ' · ' + escapeHtml(it.color) : ''}</div>
        <div class="ranked-sub">Indossato ${it.wear_count} ${it.wear_count === 1 ? 'volta' : 'volte'}</div>
      </div>
      <div class="ranked-stat">${it.wear_count}×</div>
    </div>
  `).join("");
}

// =============================================================================
// Pezzi morti (mai indossati o non da X mesi)
// =============================================================================
function renderDeadStock() {
  const now = Date.now();
  const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

  const deadStock = state.items.filter(it => {
    const wears = it.wear_count || 0;
    if (wears === 0) return true;
    if (it.last_worn_at) {
      const last = new Date(it.last_worn_at).getTime();
      return (now - last) > SIX_MONTHS_MS;
    }
    return false;
  }).slice(0, 10);

  const container = document.getElementById("dead-stock");

  if (deadStock.length === 0) {
    container.innerHTML = `<p class="empty-state-inline">Tutti i tuoi capi sono in rotazione. 🎉</p>`;
    return;
  }

  container.innerHTML = deadStock.map(it => {
    const lastWorn = it.last_worn_at
      ? `Ultima volta: ${formatDateIT(it.last_worn_at)}`
      : "Mai indossato";
    return `
      <div class="ranked-row">
        <div class="ranked-photo">
          ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : '👕'}
        </div>
        <div class="ranked-info">
          <div class="ranked-title">${escapeHtml(it.category || 'Capo')}${it.color ? ' · ' + escapeHtml(it.color) : ''}</div>
          <div class="ranked-sub">${lastWorn}</div>
        </div>
      </div>
    `;
  }).join("");
}

// =============================================================================
// Pie chart SVG custom (no librerie)
// =============================================================================
function renderPieChart(svgId, legendId, field) {
  const counts = {};
  state.items.forEach(it => {
    const k = it[field] || "Non specificato";
    counts[k] = (counts[k] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, n]) => s + n, 0);

  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);

  if (total === 0) {
    svg.innerHTML = `<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" fill="var(--color-text-muted)" font-size="12">Nessun dato</text>`;
    legend.innerHTML = "";
    return;
  }

  // Calcolo gli archi: ogni slice e' un <path d="M..."> da centro a centro lungo un arco
  const RADIUS = 80;
  let cumulativeAngle = -Math.PI / 2;  // parto dall'alto

  const paths = entries.map(([key, count], idx) => {
    const angle = (count / total) * Math.PI * 2;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const x1 = Math.cos(startAngle) * RADIUS;
    const y1 = Math.sin(startAngle) * RADIUS;
    const x2 = Math.cos(endAngle) * RADIUS;
    const y2 = Math.sin(endAngle) * RADIUS;

    const largeArc = angle > Math.PI ? 1 : 0;
    const color = CHART_PALETTE[idx % CHART_PALETTE.length];

    // Caso particolare: una sola categoria al 100% -> disegno un cerchio pieno
    if (entries.length === 1) {
      return `<circle cx="0" cy="0" r="${RADIUS}" fill="${color}" />`;
    }

    return `<path d="M 0 0 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${color}" />`;
  });

  svg.innerHTML = paths.join("");

  legend.innerHTML = entries.map(([key, count], idx) => {
    const pct = ((count / total) * 100).toFixed(0);
    const color = CHART_PALETTE[idx % CHART_PALETTE.length];
    return `
      <div class="chart-legend-item">
        <span class="chart-legend-dot" style="background: ${color}"></span>
        <span class="chart-legend-label">${escapeHtml(capitalize(key))}</span>
        <span class="chart-legend-value">${count} (${pct}%)</span>
      </div>
    `;
  }).join("");
}

// =============================================================================
// Cost-per-wear: ranking dei capi per CPW (prezzo / wear_count)
// =============================================================================
function renderCostPerWear() {
  const withPrice = state.items
    .filter(it => it.price && it.price > 0)
    .map(it => {
      const wears = Math.max(it.wear_count || 0, 0);
      const cpw = wears > 0 ? it.price / wears : it.price;  // se mai indossato, CPW = prezzo intero
      return { ...it, cpw, wears };
    })
    .sort((a, b) => a.cpw - b.cpw);  // ASC: piu' conveniente prima

  const container = document.getElementById("cost-per-wear");

  if (withPrice.length === 0) {
    container.innerHTML = `<p class="empty-state-inline">Aggiungi il prezzo ai tuoi capi (campo opzionale nel modulo) per vedere il cost-per-wear.</p>`;
    return;
  }

  container.innerHTML = withPrice.slice(0, 10).map(it => `
    <div class="ranked-row">
      <div class="ranked-photo">
        ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : '👕'}
      </div>
      <div class="ranked-info">
        <div class="ranked-title">${escapeHtml(it.category || 'Capo')}${it.color ? ' · ' + escapeHtml(it.color) : ''}</div>
        <div class="ranked-sub">€${it.price.toFixed(2)} · ${it.wears} ${it.wears === 1 ? 'uso' : 'usi'}</div>
      </div>
      <div class="ranked-stat">€${it.cpw.toFixed(2)}/uso</div>
    </div>
  `).join("");
}

// =============================================================================
// Utility
// =============================================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function formatDateIT(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

// =============================================================================
document.addEventListener("DOMContentLoaded", load);
