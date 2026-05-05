// =============================================================================
// Pagina Palette Match: estrai palette da foto + suggerisci capi/outfit
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Wardrobe from "./wardrobe.js";
import * as Palette from "./color-palette.js";

Theme.init();

const state = {
  items: [],          // tutti i capi
  itemPalettes: new Map(),  // id -> palette estratta dalla foto del capo
  targetPalette: null,
  matches: [],        // [{ item, score }]
};

function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

// =============================================================================
// Boot
// =============================================================================
async function init() {
  state.items = await Wardrobe.listItems();
}

// =============================================================================
// Estrazione palette dalla foto caricata
// =============================================================================
async function processImage(file) {
  document.getElementById("palette-upload").classList.add("hidden");

  // Mostra immagine sorgente
  const url = URL.createObjectURL(file);
  document.getElementById("palette-source-img").src = url;

  document.getElementById("palette-result").classList.remove("hidden");
  document.getElementById("palette-match-summary").textContent = "⏳ Estrazione palette...";
  document.getElementById("palette-swatches").innerHTML = "";
  document.getElementById("palette-matches").innerHTML = "";
  document.getElementById("palette-outfit-result").innerHTML = "";

  try {
    const palette = await Palette.extractPalette(file, 5);
    state.targetPalette = palette;
    renderPalette(palette);

    // Trova i match nei capi
    document.getElementById("palette-match-summary").textContent = "⏳ Confronto coi tuoi capi...";
    await findMatches();
  } catch (err) {
    console.error(err);
    toast("Errore estrazione palette: " + err.message, "error");
  }
}

function renderPalette(palette) {
  const container = document.getElementById("palette-swatches");
  container.innerHTML = palette.map(c => `
    <div class="palette-swatch" style="background: ${c.hex};">
      <span class="palette-swatch-pct">${Math.round(c.percentage)}%</span>
      <span class="palette-swatch-hex">${c.hex}</span>
    </div>
  `).join("");
}

// =============================================================================
// Match: estrai palette di ogni capo + calcola score
// =============================================================================
async function findMatches() {
  const itemsWithPhotos = state.items.filter(it => it.photo_url);
  const matches = [];

  for (const item of itemsWithPhotos) {
    let itemPalette;
    if (state.itemPalettes.has(item.id)) {
      itemPalette = state.itemPalettes.get(item.id);
    } else {
      try {
        itemPalette = await Palette.extractPalette(item.photo_url, 4);
        state.itemPalettes.set(item.id, itemPalette);
      } catch (err) {
        console.warn("Palette estrazione fallita per", item.id, err);
        continue;
      }
    }
    const score = Palette.paletteMatchScore(state.targetPalette, itemPalette);
    matches.push({ item, score, itemPalette });
  }

  matches.sort((a, b) => b.score - a.score);
  state.matches = matches;
  renderMatches(matches);
}

function renderMatches(matches) {
  const container = document.getElementById("palette-matches");
  const summary = document.getElementById("palette-match-summary");

  if (matches.length === 0) {
    summary.textContent = "Nessun capo con foto nel guardaroba.";
    container.innerHTML = "";
    return;
  }

  // Top 12 match
  const top = matches.slice(0, 12);
  const avgScore = Math.round(top.reduce((s, m) => s + m.score, 0) / top.length);

  summary.textContent = `Top ${top.length} capi · match medio ${avgScore}/100`;

  container.innerHTML = top.map(m => `
    <div class="palette-match-card">
      <div class="palette-match-photo">
        <img src="${m.item.photo_url}" alt="" loading="lazy" />
        <div class="palette-match-score">${m.score}</div>
      </div>
      <div class="palette-match-mini">
        ${m.itemPalette.slice(0, 3).map(c => `<span style="background:${c.hex}"></span>`).join("")}
      </div>
      <div class="palette-match-name">${escapeHtml(m.item.subcategory || m.item.category || "Capo")}</div>
    </div>
  `).join("");
}

// =============================================================================
// Genera outfit usando solo i capi top match
// =============================================================================
function generateOutfitFromMatches() {
  if (state.matches.length === 0) {
    toast("Nessun match disponibile", "error");
    return;
  }

  // Pesco capi top per categoria essenziale
  const topMatches = state.matches.filter(m => m.score > 50);
  if (topMatches.length < 2) {
    toast("Pochi capi compatibili nella tua palette", "error");
    return;
  }

  // Scelgo 1 top + 1 bottom + 1 scarpe + accessorio (o vestito + scarpe)
  const pickByCategory = (cat) => {
    const cands = topMatches.filter(m => m.item.category === cat);
    return cands.length > 0 ? cands[0] : null;
  };

  const outfit = [];
  const vestito = pickByCategory("vestito");
  const completo = pickByCategory("completo");

  if (vestito || completo) {
    outfit.push((vestito || completo).item);
  } else {
    const top = pickByCategory("top");
    const bottom = pickByCategory("bottom");
    if (top) outfit.push(top.item);
    if (bottom) outfit.push(bottom.item);
  }
  const scarpe = pickByCategory("scarpe");
  if (scarpe) outfit.push(scarpe.item);
  const accessori = pickByCategory("accessori");
  if (accessori) outfit.push(accessori.item);
  const capospalla = pickByCategory("capospalla");
  if (capospalla) outfit.push(capospalla.item);

  renderOutfitResult(outfit);
}

function renderOutfitResult(items) {
  const container = document.getElementById("palette-outfit-result");
  if (items.length === 0) {
    container.innerHTML = `<p class="empty-state-inline">Non sono riuscita a comporre un outfit. Aggiungi piu' capi.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="outfit-card">
      <h3>Outfit dalla tua ispirazione</h3>
      <p class="outfit-desc">Composto con ${items.length} capi che richiamano la palette</p>
      <div class="outfit-items">
        ${items.map(it => `
          <div class="outfit-item">
            ${it.photo_url ? `<img src="${it.photo_url}" alt="" loading="lazy" />` : '👕'}
          </div>
        `).join("")}
      </div>
      <div class="outfit-actions">
        <button class="btn btn--secondary btn--sm" id="btn-save-palette-outfit">⭐ Salva</button>
      </div>
    </div>
  `;

  document.getElementById("btn-save-palette-outfit").addEventListener("click", async () => {
    try {
      const Outfit = await import("./outfit.js");
      await Outfit.saveOutfit({
        title: "Da Palette Match",
        description: "Generato da una foto di ispirazione",
        item_ids: items.map(it => it.id),
        context: "palette",
      });
      toast("Outfit salvato", "success");
    } catch (err) {
      toast("Errore salvataggio", "error");
    }
  });
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("palette-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) processImage(file);
  });

  document.getElementById("btn-new-palette").addEventListener("click", () => {
    document.getElementById("palette-result").classList.add("hidden");
    document.getElementById("palette-upload").classList.remove("hidden");
    document.getElementById("palette-input").value = "";
  });

  document.getElementById("btn-generate-palette-outfit").addEventListener("click", generateOutfitFromMatches);

  init();
});
