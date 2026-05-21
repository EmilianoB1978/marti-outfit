// =============================================================================
// Photo Outfit Composer
// =============================================================================
// Pipeline per creare un outfit a partire da una foto reale di Martina vestita:
//   1. Upload della foto su Firebase Storage (URL pubblico necessario per
//      remove.bg che lavora server-side)
//   2. POST al Worker /remove-bg con type=person → ritorna PNG cutout
//      (Martina isolata su sfondo trasparente)
//   3. Mostra galleria di ~50 sfondi (Unsplash via background-library.js)
//   4. Composite su canvas: sfondo full-bleed + cutout centrato sopra
//   5. Save su Firestore come outfit visuale (saveVisualOutfit esistente)
//
// IMPORTANTE: usiamo type=person (non type=product) perché qui isoliamo
// effettivamente la persona dalla foto, non un capo.
// =============================================================================

import {
  storage, storageRef, uploadBytes, getDownloadURL, deleteObject
} from "./firebase-config.js";
import * as Outfit from "./outfit.js";
import { getBackgroundsGrouped, BACKGROUND_CATEGORIES } from "./background-library.js";

const WORKER_URL = "https://marty-outfit-proxy.e-barbierato.workers.dev";
const REMOVE_BG_ENDPOINT = WORKER_URL + "/remove-bg";

// Dimensioni canvas output (4:5 portrait, ottimizzato per outfit a figura intera)
const OUT_W = 1200;
const OUT_H = 1500;

// Stato runtime del composer (vive finché il modal è aperto)
const _state = {
  sourcePath: null,    // Firebase Storage path della foto sorgente (cleanup)
  sourceUrl: null,     // URL pubblico della foto sorgente
  cutoutBlob: null,    // PNG cutout (persona su sfondo trasparente)
  cutoutObjectUrl: null,
  selectedBgUrl: null, // URL dello sfondo scelto dalla galleria
  compositeBlob: null, // ultimo composite generato
};

function _toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(_toast._t);
  _toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

function _setStatus(text) {
  const el = document.getElementById("po-status");
  if (el) el.textContent = text || "";
}
function _showOverlay(visible) {
  const ov = document.getElementById("po-busy");
  if (!ov) return;
  if (visible) ov.classList.remove("hidden");
  else ov.classList.add("hidden");
}

/**
 * Apre il modal del composer. La foto e' opzionale: se non passata, l'utente
 * la sceglie nel modal stesso via input file.
 */
export function open() {
  _resetState();
  const modal = document.getElementById("modal-photo-outfit");
  if (!modal) {
    console.error("[photo-outfit] modal #modal-photo-outfit non trovato in index.html");
    return;
  }
  modal.classList.remove("hidden");

  // Reset UI
  document.getElementById("po-preview").innerHTML =
    `<span class="po-preview-placeholder">📸<br><small>Carica una foto allo specchio</small></span>`;
  document.getElementById("po-preview-final").innerHTML = "";
  _setStatus("");
  _renderBackgroundGallery();
  _refreshSaveBtn();
}

export function close() {
  _cleanupTempStorage().catch(() => {});
  _resetState();
  const modal = document.getElementById("modal-photo-outfit");
  if (modal) modal.classList.add("hidden");
}

function _resetState() {
  if (_state.cutoutObjectUrl) {
    URL.revokeObjectURL(_state.cutoutObjectUrl);
    _state.cutoutObjectUrl = null;
  }
  _state.sourcePath = null;
  _state.sourceUrl = null;
  _state.cutoutBlob = null;
  _state.selectedBgUrl = null;
  _state.compositeBlob = null;
}

// Best-effort: cancella la foto sorgente temp da Firebase Storage
async function _cleanupTempStorage() {
  if (!_state.sourcePath) return;
  try {
    await deleteObject(storageRef(storage, _state.sourcePath));
  } catch (err) {
    console.warn("[photo-outfit] cleanup storage failed", err);
  }
}

// ============================================================================
// Step 1: upload foto + bg-removal
// ============================================================================
export async function onPhotoSelected(file) {
  if (!file) return;

  _showOverlay(true);
  _setStatus("📤 Upload foto in corso...");

  try {
    // Upload come temp; verra' cancellato a chiusura modal
    const filename = `outfits/tmp_source_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
    const ref = storageRef(storage, filename);
    await uploadBytes(ref, file, { contentType: file.type || "image/jpeg" });
    const url = await getDownloadURL(ref);
    _state.sourcePath = filename;
    _state.sourceUrl = url;

    // Preview immediato della sorgente
    document.getElementById("po-preview").innerHTML =
      `<img src="${url}" alt="foto sorgente" />`;

    _setStatus("✨ Rimozione sfondo (persona)...");

    // Chiamata Worker remove.bg con type=person (isola persona, non vestito)
    const res = await fetch(REMOVE_BG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url, type: "person" }),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j.error || JSON.stringify(j);
      } catch { try { detail = await res.text(); } catch { detail = ""; } }
      throw new Error(`Worker /remove-bg HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const cutoutBlob = await res.blob();
    _state.cutoutBlob = cutoutBlob;
    _state.cutoutObjectUrl = URL.createObjectURL(cutoutBlob);

    _setStatus("✓ Sfondo rimosso. Scegli uno sfondo dalla galleria sotto.");

    // Se l'utente aveva gia' scelto uno sfondo, ricomponi
    if (_state.selectedBgUrl) {
      await _recomposite();
    } else {
      // Mostra solo il cutout senza sfondo
      document.getElementById("po-preview-final").innerHTML =
        `<img src="${_state.cutoutObjectUrl}" alt="cutout" />`;
    }
    _refreshSaveBtn();
  } catch (err) {
    console.error("[photo-outfit] bg-removal failed", err);
    _setStatus("Errore: " + (err.message || "rimozione fallita"));
    _toast("Rimozione sfondo fallita", "error");
  } finally {
    _showOverlay(false);
  }
}

// ============================================================================
// Step 2: galleria sfondi
// ============================================================================
function _renderBackgroundGallery() {
  const root = document.getElementById("po-bg-gallery");
  if (!root) return;

  const groups = getBackgroundsGrouped();

  root.innerHTML = groups.map(g => `
    <details class="po-bg-group" open>
      <summary>${g.icon} ${g.label} <small>(${g.items.length})</small></summary>
      <div class="po-bg-grid">
        ${g.items.map(b => `
          <button type="button" class="po-bg-thumb" data-url="${b.url}" data-label="${escapeAttr(b.label)}" title="${escapeAttr(b.label)}">
            <img src="${b.thumb_url}" alt="${escapeAttr(b.label)}" loading="lazy" onerror="this.parentElement.style.display='none'" />
          </button>
        `).join("")}
      </div>
    </details>
  `).join("");

  // Click su thumbnail → seleziona + ricomponi
  root.querySelectorAll(".po-bg-thumb").forEach(btn => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      _state.selectedBgUrl = url;
      root.querySelectorAll(".po-bg-thumb").forEach(t => t.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      await _recomposite();
    });
  });
}

// ============================================================================
// Step 3: compositing canvas (sfondo + cutout)
// ============================================================================
async function _recomposite() {
  if (!_state.cutoutBlob) {
    _toast("Carica prima una foto", "error");
    return;
  }
  if (!_state.selectedBgUrl) {
    _toast("Scegli uno sfondo", "warning");
    return;
  }

  _showOverlay(true);
  _setStatus("🎨 Composizione immagine...");

  try {
    const bgImg = await _loadImage(_state.selectedBgUrl);
    const cutoutImg = await _loadImage(_state.cutoutObjectUrl);

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Disegno sfondo coprendo tutta la tela (cover)
    _drawCoverImage(ctx, bgImg, OUT_W, OUT_H);

    // Sovrappongo il cutout centrato, scalato a contain (~92% altezza,
    // mantenendo proporzioni). Lascia un po' di margine in alto/basso.
    const maxH = Math.round(OUT_H * 0.96);
    const maxW = Math.round(OUT_W * 0.85);
    const scale = Math.min(maxH / cutoutImg.naturalHeight, maxW / cutoutImg.naturalWidth);
    const drawW = cutoutImg.naturalWidth * scale;
    const drawH = cutoutImg.naturalHeight * scale;
    const dx = (OUT_W - drawW) / 2;
    // Allineo il cutout verso il basso lasciando 2% di margine inferiore
    const dy = OUT_H - drawH - Math.round(OUT_H * 0.02);
    ctx.drawImage(cutoutImg, dx, dy, drawW, drawH);

    // Genera blob PNG
    const blob = await new Promise(res => canvas.toBlob(b => res(b), "image/png", 0.92));
    _state.compositeBlob = blob;

    // Mostra preview finale
    const url = URL.createObjectURL(blob);
    document.getElementById("po-preview-final").innerHTML =
      `<img src="${url}" alt="composite" />`;

    _setStatus("✓ Pronto. Tocca Salva outfit per memorizzare.");
    _refreshSaveBtn();
  } catch (err) {
    console.error("[photo-outfit] composite failed", err);
    _setStatus("Errore composizione: " + (err.message || ""));
    _toast("Composizione fallita", "error");
  } finally {
    _showOverlay(false);
  }
}

function _drawCoverImage(ctx, img, w, h) {
  const ar = img.naturalWidth / img.naturalHeight;
  const targetAr = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (ar > targetAr) {
    // immagine piu' larga di canvas: crop laterale
    sw = img.naturalHeight * targetAr;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    // immagine piu' alta: crop sopra/sotto
    sh = img.naturalWidth / targetAr;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function _loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Caricamento immagine fallito: " + url));
    img.src = url;
  });
}

// ============================================================================
// Step 4: salva outfit
// ============================================================================
export async function save() {
  if (!_state.compositeBlob) {
    _toast("Genera prima il composite", "warning");
    return;
  }
  const titleEl = document.getElementById("po-title");
  const title = (titleEl && titleEl.value.trim()) || "Outfit foto";

  _showOverlay(true);
  _setStatus("💾 Salvataggio outfit...");
  try {
    const saved = await Outfit.saveVisualOutfit({
      title,
      item_ids: [],          // niente capi collegati: e' una foto pura
      layout: [],
      compositeBlob: _state.compositeBlob,
      context: "foto-outfit",
    });
    _toast("Outfit salvato", "success");
    // Cleanup foto sorgente (non serve piu', e' embeddata nel composite)
    await _cleanupTempStorage();
    _state.sourcePath = null;
    close();
    // Recarica la home pagine outfit se siamo sulla pagina giusta
    if (typeof window.WardrobeUI?.refreshSavedOutfits === "function") {
      window.WardrobeUI.refreshSavedOutfits();
    } else {
      window.location.reload();
    }
  } catch (err) {
    console.error("[photo-outfit] save failed", err);
    _toast("Errore salvataggio: " + (err.message || ""), "error");
  } finally {
    _showOverlay(false);
  }
}

function _refreshSaveBtn() {
  const btn = document.getElementById("po-save-btn");
  if (!btn) return;
  const ready = !!_state.compositeBlob;
  btn.disabled = !ready;
}

function escapeAttr(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
