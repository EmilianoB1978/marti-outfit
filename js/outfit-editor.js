// =============================================================================
// Outfit editor: canvas drag&drop con touch gestures + bg removal
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Wardrobe from "./wardrobe.js";
import * as Outfit from "./outfit.js";
import * as BgRemoval from "./bg-removal.js";

Theme.init();

// =============================================================================
// State
// =============================================================================
const state = {
  items: [],            // tutti i capi del guardaroba
  canvasItems: [],      // {id, item, x, y, scale, rotation, zIndex, el}
  selected: null,       // riferimento all'oggetto canvasItem selezionato
  modelReady: false,    // imgly model gia' scaricato
  nextZIndex: 1,
};

const STORAGE_KEY_MODEL_READY = "marty_imgly_loaded";

// =============================================================================
// Utility
// =============================================================================
function toast(message, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

function showProcessing(text) {
  document.getElementById("processing-text").textContent = text || "Elaborazione...";
  document.getElementById("processing-overlay").classList.remove("hidden");
}
function hideProcessing() {
  document.getElementById("processing-overlay").classList.add("hidden");
}

// =============================================================================
// Boot
// =============================================================================
async function init() {
  state.items = await Wardrobe.listItems();
  renderStrip();

  // Se il modello e' gia' stato caricato in passato, skip splash
  state.modelReady = localStorage.getItem(STORAGE_KEY_MODEL_READY) === "1";
}

// =============================================================================
// Strip dei capi (bottom)
// =============================================================================
function renderStrip() {
  const container = document.getElementById("editor-strip-items");
  if (state.items.length === 0) {
    container.innerHTML = `<div class="editor-strip-empty">Aggiungi prima dei capi al tuo guardaroba</div>`;
    return;
  }
  container.innerHTML = state.items.map(it => `
    <button class="strip-item" data-id="${it.id}" aria-label="Aggiungi ${it.category || 'capo'}">
      ${it.photo_url
        ? `<img src="${it.photo_url}" alt="" loading="lazy" />`
        : '<span>👕</span>'}
    </button>
  `).join("");

  container.querySelectorAll(".strip-item").forEach(btn => {
    btn.addEventListener("click", () => addItemToCanvas(btn.dataset.id));
  });
}

// =============================================================================
// Aggiunge un item al canvas (gestisce bg removal lazy)
// =============================================================================
async function addItemToCanvas(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item || !item.photo_url) {
    toast("Capo senza foto", "error");
    return;
  }

  // Se gia' c'e' un cutout, lo uso direttamente
  if (item.cutout_url) {
    placeOnCanvas(item, item.cutout_url);
    return;
  }

  // Bg removal: prima volta = preload del modello (se non gia' fatto)
  if (!state.modelReady) {
    await preloadModel();
    if (!state.modelReady) return;  // utente ha annullato o errore
  }

  // Process del cutout
  showProcessing("Rimozione sfondo...");
  try {
    const cutoutBlob = await BgRemoval.removeBackground(item.photo_url, frac => {
      document.getElementById("processing-text").textContent = `Rimozione sfondo... ${Math.round(frac * 100)}%`;
    });
    const cutoutUrl = await Wardrobe.uploadAndSaveCutout(itemId, cutoutBlob);
    item.cutout_url = cutoutUrl;
    placeOnCanvas(item, cutoutUrl);
  } catch (err) {
    console.error("Bg removal failed:", err);
    toast("Rimozione sfondo fallita, uso foto originale", "warning");
    // Fallback: uso la foto originale (con sfondo)
    placeOnCanvas(item, item.photo_url);
  } finally {
    hideProcessing();
  }
}

// =============================================================================
// Preload del modello (con UI splash)
// =============================================================================
async function preloadModel() {
  const splash = document.getElementById("model-setup");
  const bar = document.getElementById("model-progress-bar");
  const text = document.getElementById("model-progress-text");

  splash.classList.remove("hidden");

  try {
    await BgRemoval.preload(frac => {
      const pct = Math.round(frac * 100);
      bar.style.width = `${pct}%`;
      text.textContent = `${pct}%`;
    });
    state.modelReady = true;
    localStorage.setItem(STORAGE_KEY_MODEL_READY, "1");
    splash.classList.add("hidden");
    toast("Editor pronto!", "success");
  } catch (err) {
    console.error("Preload failed:", err);
    toast("Caricamento modello fallito: " + err.message, "error");
    splash.classList.add("hidden");
  }
}

// =============================================================================
// Posiziona un item sul canvas
// =============================================================================
function placeOnCanvas(item, imageUrl) {
  document.getElementById("canvas-empty")?.classList.add("hidden");

  const canvas = document.getElementById("editor-canvas");
  const rect = canvas.getBoundingClientRect();

  // Posiziono al centro con una piccola randomizzazione per evitare overlap esatto
  const cx = rect.width / 2 + (Math.random() - 0.5) * 60;
  const cy = rect.height / 2 + (Math.random() - 0.5) * 60;

  const canvasItem = {
    id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    item,
    imageUrl,
    x: cx,
    y: cy,
    scale: 1,
    rotation: 0,
    zIndex: state.nextZIndex++,
  };

  const el = document.createElement("div");
  el.className = "canvas-item";
  el.dataset.id = canvasItem.id;
  el.style.zIndex = canvasItem.zIndex;
  el.innerHTML = `
    <img src="${imageUrl}" alt="" draggable="false" />
    <button class="canvas-item-delete" aria-label="Rimuovi">✕</button>
  `;
  canvas.appendChild(el);
  canvasItem.el = el;

  state.canvasItems.push(canvasItem);
  applyTransform(canvasItem);
  attachGestures(canvasItem);
  selectItem(canvasItem);

  // Delete button
  el.querySelector(".canvas-item-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    removeFromCanvas(canvasItem);
  });
}

function applyTransform(ci) {
  ci.el.style.transform = `translate(${ci.x}px, ${ci.y}px) translate(-50%, -50%) scale(${ci.scale}) rotate(${ci.rotation}rad)`;
}

function removeFromCanvas(ci) {
  ci.el.remove();
  state.canvasItems = state.canvasItems.filter(x => x !== ci);
  if (state.selected === ci) state.selected = null;
  if (state.canvasItems.length === 0) {
    document.getElementById("canvas-empty")?.classList.remove("hidden");
  }
}

function selectItem(ci) {
  state.canvasItems.forEach(x => x.el.classList.toggle("is-selected", x === ci));
  state.selected = ci;
  // Bring-to-front: aumento zIndex
  ci.zIndex = state.nextZIndex++;
  ci.el.style.zIndex = ci.zIndex;
}

// =============================================================================
// Touch gestures (1-finger drag, 2-finger pinch+rotate)
// =============================================================================
function attachGestures(ci) {
  const el = ci.el;
  let active = null;  // { startTouches, startState }

  function onTouchStart(e) {
    e.preventDefault();
    e.stopPropagation();
    selectItem(ci);

    if (e.touches.length === 1) {
      // 1 dito = drag
      active = {
        type: "drag",
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        origX: ci.x,
        origY: ci.y,
      };
    } else if (e.touches.length === 2) {
      // 2 dita = pinch + rotate
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      active = {
        type: "transform",
        startDist: Math.hypot(dx, dy),
        startAngle: Math.atan2(dy, dx),
        origScale: ci.scale,
        origRotation: ci.rotation,
        // Centro fra i due tocchi al momento del start
        startCenterX: (t1.clientX + t2.clientX) / 2,
        startCenterY: (t1.clientY + t2.clientY) / 2,
        origX: ci.x,
        origY: ci.y,
      };
    }
  }

  function onTouchMove(e) {
    if (!active) return;
    e.preventDefault();

    if (active.type === "drag" && e.touches.length === 1) {
      const dx = e.touches[0].clientX - active.startX;
      const dy = e.touches[0].clientY - active.startY;
      ci.x = active.origX + dx;
      ci.y = active.origY + dy;
      applyTransform(ci);
    }
    else if (active.type === "transform" && e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      // Scale = nuova distanza / iniziale, vincolato 0.3 - 4
      ci.scale = Math.max(0.3, Math.min(4, active.origScale * (dist / active.startDist)));
      ci.rotation = active.origRotation + (angle - active.startAngle);

      // Anche translate per seguire il centro delle dita
      const newCenterX = (t1.clientX + t2.clientX) / 2;
      const newCenterY = (t1.clientY + t2.clientY) / 2;
      ci.x = active.origX + (newCenterX - active.startCenterX);
      ci.y = active.origY + (newCenterY - active.startCenterY);

      applyTransform(ci);
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length === 0) active = null;
    else if (active && active.type === "transform" && e.touches.length === 1) {
      // Da pinch torno a drag
      active = {
        type: "drag",
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        origX: ci.x,
        origY: ci.y,
      };
    }
  }

  el.addEventListener("touchstart", onTouchStart, { passive: false });
  el.addEventListener("touchmove",  onTouchMove,  { passive: false });
  el.addEventListener("touchend",   onTouchEnd);
  el.addEventListener("touchcancel", onTouchEnd);

  // Mouse events fallback (desktop testing)
  el.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    selectItem(ci);
    const startX = e.clientX, startY = e.clientY;
    const origX = ci.x, origY = ci.y;
    function onMove(ev) {
      ci.x = origX + (ev.clientX - startX);
      ci.y = origY + (ev.clientY - startY);
      applyTransform(ci);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

// Click sul canvas vuoto deseleziona
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("editor-canvas").addEventListener("click", (e) => {
    if (e.target.id === "editor-canvas" || e.target.id === "canvas-empty") {
      state.canvasItems.forEach(x => x.el.classList.remove("is-selected"));
      state.selected = null;
    }
  });
});

// =============================================================================
// Salva la composizione (canvas + Firestore)
// =============================================================================
async function saveComposition() {
  if (state.canvasItems.length === 0) {
    toast("Aggiungi almeno un capo", "error");
    return;
  }

  const title = prompt("Nome dell'outfit:", "Outfit visuale");
  if (!title) return;

  const btn = document.getElementById("btn-save-composition");
  btn.disabled = true;
  btn.textContent = "...";

  try {
    showProcessing("Generazione immagine...");
    const compositeBlob = await renderToCanvas();

    showProcessing("Salvataggio...");
    const layout = state.canvasItems.map(ci => ({
      item_id: ci.item.id,
      x: ci.x, y: ci.y,
      scale: ci.scale, rotation: ci.rotation,
      z_index: ci.zIndex,
    }));

    const item_ids = [...new Set(state.canvasItems.map(ci => ci.item.id))];

    await Outfit.saveVisualOutfit({
      title,
      item_ids,
      layout,
      compositeBlob,
    });

    toast("Outfit salvato!", "success");
    setTimeout(() => window.location.href = "./index.html#outfits", 800);
  } catch (err) {
    console.error(err);
    toast("Errore salvataggio: " + err.message, "error");
    btn.disabled = false;
    btn.textContent = "Salva";
  } finally {
    hideProcessing();
  }
}

/**
 * Render della composizione corrente in un canvas e ritorna il blob PNG.
 * Calcola la bounding box di tutti i pezzi per non sprecare pixel.
 */
async function renderToCanvas() {
  const canvas = document.getElementById("editor-canvas");
  const rect = canvas.getBoundingClientRect();

  const out = document.createElement("canvas");
  out.width = Math.round(rect.width);
  out.height = Math.round(rect.height);
  const ctx = out.getContext("2d");

  // Sfondo bianco (fissi per outfit visuali, evita trasparenza nello share)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);

  // Renderizzo gli item ordinati per zIndex
  const sorted = [...state.canvasItems].sort((a, b) => a.zIndex - b.zIndex);
  for (const ci of sorted) {
    const img = await loadImage(ci.imageUrl);
    ctx.save();
    ctx.translate(ci.x, ci.y);
    ctx.rotate(ci.rotation);
    ctx.scale(ci.scale, ci.scale);
    // Disegno centrato (img naturali, mantieni proporzioni)
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    // Vincolo larghezza max 200 per render compatto (lo scale gia' applica il dimensionamento)
    const targetW = Math.min(w, 200);
    const targetH = (targetW / w) * h;
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  }

  return new Promise(resolve => {
    out.toBlob(blob => resolve(blob), "image/png", 0.9);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-save-composition").addEventListener("click", saveComposition);
  init();
});
