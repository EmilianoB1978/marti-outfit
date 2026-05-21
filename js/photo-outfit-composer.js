// =============================================================================
// Photo Outfit Composer (v2 — editor interattivo)
// =============================================================================
// Pipeline per creare un outfit a partire da una foto reale di Martina vestita:
//   1. Upload temporaneo su Firebase Storage (URL pubblico necessario per
//      remove.bg server-side)
//   2. POST al Worker /remove-bg con type=person → PNG cutout
//      (Martina isolata su sfondo trasparente)
//   3. L'utente sceglie uno sfondo dalla galleria
//   4. EDITOR LIVE: sfondo + cutout overlay con touch/mouse:
//        - 1 dito drag → sposta cutout
//        - 2 dita pinch → scala cutout
//        - slider zoom + bottoni +/- per fine-tuning
//        - reset ↺ per centrare e auto-fit
//   5. Save → canvas 1200×1500 con le trasformazioni correnti, upload come
//      outfit visuale standard via Outfit.saveVisualOutfit
//
// Editor state in pixel relativi allo stage UI; al save vengono ridimensionati
// proporzionalmente al canvas 1200×1500.
// =============================================================================

import {
  storage, storageRef, uploadBytes, getDownloadURL, deleteObject
} from "./firebase-config.js";
import * as Outfit from "./outfit.js";
import { getBackgroundsGrouped } from "./background-library.js";

const WORKER_URL = "https://marty-outfit-proxy.e-barbierato.workers.dev";
const REMOVE_BG_ENDPOINT = WORKER_URL + "/remove-bg";

// Dimensioni canvas output (4:5 portrait, ottimizzato per outfit a figura intera)
const OUT_W = 1200;
const OUT_H = 1500;

// Stato runtime del composer
const _state = {
  sourcePath: null,
  sourceUrl: null,
  cutoutBlob: null,
  cutoutObjectUrl: null,
  selectedBgUrl: null,
  // Editor transform (px rispetto al centro dello stage UI)
  tx: 0,
  ty: 0,
  scale: 1.0,   // 1.0 = auto-fit baseline
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

// ============================================================================
// Apri / Chiudi modal
// ============================================================================
export function open() {
  _resetState();
  const modal = document.getElementById("modal-photo-outfit");
  if (!modal) return;
  modal.classList.remove("hidden");

  document.getElementById("po-preview").innerHTML =
    `<span class="po-preview-placeholder">📸<br><small>Carica una foto allo specchio</small></span>`;
  _resetEditor();
  _setStatus("");
  _renderBackgroundGallery();
  _refreshSaveBtn();
  _attachEditorListeners();
}

export function close() {
  _cleanupTempStorage().catch(() => {});
  _detachEditorListeners();
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
  _state.tx = 0;
  _state.ty = 0;
  _state.scale = 1.0;
}

function _resetEditor() {
  document.getElementById("po-edit-bg").src = "";
  document.getElementById("po-edit-fg").src = "";
  document.getElementById("po-edit-controls")?.classList.add("hidden");
  const placeholder = document.querySelector(".po-edit-placeholder");
  if (placeholder) placeholder.style.display = "block";
  _state.tx = 0;
  _state.ty = 0;
  _state.scale = 1.0;
  const slider = document.getElementById("po-edit-zoom");
  if (slider) slider.value = "100";
}

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
    const filename = `outfits/tmp_source_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`;
    const ref = storageRef(storage, filename);
    await uploadBytes(ref, file, { contentType: file.type || "image/jpeg" });
    const url = await getDownloadURL(ref);
    _state.sourcePath = filename;
    _state.sourceUrl = url;

    document.getElementById("po-preview").innerHTML =
      `<img src="${url}" alt="foto sorgente" />`;

    _setStatus("✨ Rimozione sfondo (persona)...");
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
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const cutoutBlob = await res.blob();
    _state.cutoutBlob = cutoutBlob;
    _state.cutoutObjectUrl = URL.createObjectURL(cutoutBlob);

    _setStatus("✓ Sfondo rimosso. Scegli uno sfondo dalla galleria sotto.");
    _showEditorIfReady();
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
          <button type="button" class="po-bg-thumb" data-url="${b.url}" data-label="${_escapeAttr(b.label)}" title="${_escapeAttr(b.label)}">
            <img src="${b.thumb_url}" alt="${_escapeAttr(b.label)}" loading="lazy" onerror="this.parentElement.style.display='none'" />
          </button>
        `).join("")}
      </div>
    </details>
  `).join("");

  root.querySelectorAll(".po-bg-thumb").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = btn.dataset.url;
      _state.selectedBgUrl = url;
      root.querySelectorAll(".po-bg-thumb").forEach(t => t.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      _showEditorIfReady();
      _refreshSaveBtn();
    });
  });
}

// ============================================================================
// Step 3: editor live (DOM, niente canvas)
// ============================================================================
function _showEditorIfReady() {
  if (!_state.cutoutObjectUrl || !_state.selectedBgUrl) return;

  const stageEl = document.getElementById("po-edit-stage");
  const bgEl = document.getElementById("po-edit-bg");
  const fgEl = document.getElementById("po-edit-fg");
  const controls = document.getElementById("po-edit-controls");
  const placeholder = stageEl?.querySelector(".po-edit-placeholder");

  if (placeholder) placeholder.style.display = "none";
  bgEl.src = _state.selectedBgUrl;
  fgEl.src = _state.cutoutObjectUrl;
  controls?.classList.remove("hidden");

  // Reset transform user (centra + zoom 1.0)
  _state.tx = 0;
  _state.ty = 0;
  _state.scale = 1.0;
  const slider = document.getElementById("po-edit-zoom");
  if (slider) slider.value = "100";
  _applyTransform();
}

function _applyTransform() {
  const fg = document.getElementById("po-edit-fg");
  if (!fg) return;
  // Base CSS: bottom:2%, left:50%, transform: translateX(-50%)
  // Aggiungo user translate + scale. Origin: 50% 100% (scala dal basso).
  fg.style.transform = `translate(calc(-50% + ${_state.tx}px), ${_state.ty}px) scale(${_state.scale})`;
}

// ============================================================================
// Touch/Mouse gestures + slider zoom
// ============================================================================
let _editorListenersAttached = false;
let _active = null;  // gesture state { type, ... }

function _attachEditorListeners() {
  if (_editorListenersAttached) return;
  const fg = document.getElementById("po-edit-fg");
  if (!fg) return;
  fg.addEventListener("touchstart", _onTouchStart, { passive: false });
  fg.addEventListener("touchmove",  _onTouchMove,  { passive: false });
  fg.addEventListener("touchend",   _onTouchEnd);
  fg.addEventListener("touchcancel", _onTouchEnd);
  fg.addEventListener("mousedown",  _onMouseDown);

  document.getElementById("po-edit-zoom")?.addEventListener("input", _onZoomSlider);
  document.getElementById("po-edit-zoom-in")?.addEventListener("click", () => _bumpZoom(+10));
  document.getElementById("po-edit-zoom-out")?.addEventListener("click", () => _bumpZoom(-10));
  document.getElementById("po-edit-reset")?.addEventListener("click", _resetEditorTransform);

  _editorListenersAttached = true;
}

function _detachEditorListeners() {
  // Best-effort: gli element vengono rimossi quando il modal viene chiuso.
  // I listener su #po-edit-fg restano (single instance), niente leak.
  _editorListenersAttached = false;
  _active = null;
}

function _onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    _active = {
      type: "drag",
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      origX: _state.tx,
      origY: _state.ty,
    };
  } else if (e.touches.length === 2) {
    const t1 = e.touches[0], t2 = e.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    _active = {
      type: "pinch",
      startDist: Math.hypot(dx, dy),
      origScale: _state.scale,
      // accompagno il drag a 2 dita anche
      cx0: (t1.clientX + t2.clientX) / 2,
      cy0: (t1.clientY + t2.clientY) / 2,
      origX: _state.tx,
      origY: _state.ty,
    };
  }
}

function _onTouchMove(e) {
  if (!_active) return;
  e.preventDefault();
  if (_active.type === "drag" && e.touches.length === 1) {
    const dx = e.touches[0].clientX - _active.startX;
    const dy = e.touches[0].clientY - _active.startY;
    _state.tx = _active.origX + dx;
    _state.ty = _active.origY + dy;
    _applyTransform();
  } else if (_active.type === "pinch" && e.touches.length === 2) {
    const t1 = e.touches[0], t2 = e.touches[1];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    const dist = Math.hypot(dx, dy);
    const newScale = Math.max(0.2, Math.min(3.0, _active.origScale * (dist / _active.startDist)));
    _state.scale = newScale;
    // Pan accompagnante: segue lo spostamento del centro tra le dita
    const cx = (t1.clientX + t2.clientX) / 2;
    const cy = (t1.clientY + t2.clientY) / 2;
    _state.tx = _active.origX + (cx - _active.cx0);
    _state.ty = _active.origY + (cy - _active.cy0);
    _applyTransform();
    const slider = document.getElementById("po-edit-zoom");
    if (slider) slider.value = String(Math.round(newScale * 100));
  }
}

function _onTouchEnd(e) {
  if (e.touches.length === 0) _active = null;
  else if (_active?.type === "pinch" && e.touches.length === 1) {
    _active = {
      type: "drag",
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      origX: _state.tx,
      origY: _state.ty,
    };
  }
}

function _onMouseDown(e) {
  e.preventDefault();
  const startX = e.clientX, startY = e.clientY;
  const origX = _state.tx, origY = _state.ty;
  function onMove(ev) {
    _state.tx = origX + (ev.clientX - startX);
    _state.ty = origY + (ev.clientY - startY);
    _applyTransform();
  }
  function onUp() {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function _onZoomSlider(e) {
  const v = parseInt(e.target.value, 10);
  if (isNaN(v)) return;
  _state.scale = Math.max(0.2, Math.min(3.0, v / 100));
  _applyTransform();
}

function _bumpZoom(deltaPct) {
  const slider = document.getElementById("po-edit-zoom");
  if (!slider) return;
  const newPct = Math.max(20, Math.min(250, parseInt(slider.value, 10) + deltaPct));
  slider.value = String(newPct);
  _state.scale = newPct / 100;
  _applyTransform();
}

function _resetEditorTransform() {
  _state.tx = 0;
  _state.ty = 0;
  _state.scale = 1.0;
  const slider = document.getElementById("po-edit-zoom");
  if (slider) slider.value = "100";
  _applyTransform();
}

// ============================================================================
// Step 4: render canvas finale + save
// ============================================================================
async function _renderFinalBlob() {
  if (!_state.cutoutObjectUrl || !_state.selectedBgUrl) {
    throw new Error("Mancano cutout o sfondo");
  }
  const bgImg = await _loadImage(_state.selectedBgUrl);
  const cutoutImg = await _loadImage(_state.cutoutObjectUrl);

  const canvas = document.createElement("canvas");
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  _drawCoverImage(ctx, bgImg, OUT_W, OUT_H);

  // Calcolo posizione/scala finale replicando il layout del DOM editor:
  //   - CSS base: bottom: 2%, height: 96% dello stage, center horizontal,
  //     transform-origin: 50% 100% (scala "dal basso")
  //   - User transform: translate(tx, ty) px (in coord stage UI) + scale
  //
  // Per la conversione stage-UI → canvas, prendo la larghezza dello stage
  // corrente; se non disponibile (es. modal chiuso) uso fallback 240x300.
  const stageEl = document.getElementById("po-edit-stage");
  const rect = stageEl ? stageEl.getBoundingClientRect() : { width: 240, height: 300 };
  const stageW = rect.width || 240;
  const stageH = rect.height || (stageW * 5 / 4);

  // Altezza base del cutout sullo stage: 96% di stageH
  const baseStageCutH = stageH * 0.96;
  // userScale moltiplica
  const finalStageCutH = baseStageCutH * _state.scale;
  const finalStageCutW = finalStageCutH * (cutoutImg.naturalWidth / cutoutImg.naturalHeight);

  // Conversione stage → canvas (assumiamo proporzioni 4:5 identiche)
  const k = OUT_H / stageH;
  const drawH = finalStageCutH * k;
  const drawW = finalStageCutW * k;

  // Posizione bottom-aligned con margine 2%
  // bottomY (in canvas) corrisponde a 98% di OUT_H per il bordo inferiore
  // del cutout PRIMA di applicare lo user translate y
  const bottomY = OUT_H * 0.98 + _state.ty * k;
  const dy = bottomY - drawH;
  const centerX = OUT_W / 2 + _state.tx * k;
  const dx = centerX - drawW / 2;

  ctx.drawImage(cutoutImg, dx, dy, drawW, drawH);

  return new Promise(res => canvas.toBlob(b => res(b), "image/png", 0.92));
}

function _drawCoverImage(ctx, img, w, h) {
  const ar = img.naturalWidth / img.naturalHeight;
  const targetAr = w / h;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (ar > targetAr) {
    sw = img.naturalHeight * targetAr;
    sx = (img.naturalWidth - sw) / 2;
  } else {
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

export async function save() {
  if (!_state.cutoutObjectUrl || !_state.selectedBgUrl) {
    _toast("Carica foto e scegli uno sfondo", "warning");
    return;
  }
  const titleEl = document.getElementById("po-title");
  const title = (titleEl && titleEl.value.trim()) || "Outfit foto";

  _showOverlay(true);
  _setStatus("🎨 Composizione immagine...");
  try {
    const compositeBlob = await _renderFinalBlob();

    _setStatus("💾 Salvataggio outfit...");
    await Outfit.saveVisualOutfit({
      title,
      item_ids: [],
      layout: [],
      compositeBlob,
      context: "foto-outfit",
    });
    _toast("Outfit salvato", "success");

    await _cleanupTempStorage();
    _state.sourcePath = null;
    close();
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
  btn.disabled = !(_state.cutoutObjectUrl && _state.selectedBgUrl);
}

function _escapeAttr(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
