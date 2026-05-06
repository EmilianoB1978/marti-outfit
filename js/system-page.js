// =============================================================================
// Pagina Impostazioni: Storage stats + Cache + Backup tema + Demo + Reset
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Wardrobe from "./wardrobe.js";
import * as DemoLoader from "./demo-loader.js";

Theme.init();

function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

// =============================================================================
// Storage stats
// =============================================================================
async function loadStorageStats() {
  try {
    const stats = await Wardrobe.getStorageStats();
    document.getElementById("stat-photo-count").textContent = stats.photoCount;
    document.getElementById("stat-cutout-count").textContent = stats.cutoutCount;
    document.getElementById("stat-storage-mb").textContent = stats.estimatedMB;
  } catch (err) {
    console.warn("Storage stats failed:", err);
  }
}

// =============================================================================
// Cache PWA cleanup
// =============================================================================
function initCacheClear() {
  const btn = document.getElementById("btn-clear-cache");
  btn.addEventListener("click", async () => {
    if (!confirm(
      "Pulisci la cache della app?\n\n" +
      "Verranno eliminati i file JS/CSS/HTML in cache locale, " +
      "e l'app si ricaricherà con la versione più recente dal server.\n\n" +
      "Le tue personalizzazioni e i tuoi capi/outfit NON vengono toccati."
    )) return;

    btn.disabled = true;
    btn.textContent = "⏳ Pulizia...";
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      try {
        localStorage.removeItem("marty_imgly_loaded");
        localStorage.removeItem("marty_forecast");
      } catch {}
      toast("Cache pulita. Ricarico...", "success");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error(err);
      toast("Errore: " + err.message, "error");
      btn.disabled = false;
      btn.textContent = "🧹 Pulisci cache (forza aggiornamento)";
    }
  });
}

// =============================================================================
// Backup tema (export / import)
// =============================================================================
function initBackup() {
  document.getElementById("btn-export").addEventListener("click", () => {
    Theme.exportTheme();
    toast("Tema esportato", "success");
  });

  document.getElementById("input-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await Theme.importTheme(file);
      toast("Tema importato", "success");
    } catch (err) {
      console.error(err);
      toast("File non valido: " + err.message, "error");
    }
    e.target.value = "";
  });
}

// =============================================================================
// Demo data
// =============================================================================
function initDemo() {
  const btnLoad = document.getElementById("btn-load-demo");
  const btnRemove = document.getElementById("btn-remove-demo");
  const statusRow = document.getElementById("demo-status");
  const countEl = document.getElementById("demo-count");

  async function syncDemoStatus() {
    try {
      const count = await DemoLoader.countDemo();
      if (count > 0) {
        statusRow.classList.remove("hidden");
        countEl.textContent = `${count} capi demo nel guardaroba`;
        btnRemove.classList.remove("hidden");
        btnLoad.disabled = true;
        btnLoad.textContent = "✓ Demo già caricati";
      } else {
        statusRow.classList.add("hidden");
        btnRemove.classList.add("hidden");
        btnLoad.disabled = false;
        btnLoad.textContent = "🧪 Carica 30 capi demo";
      }
    } catch (err) { console.warn("Demo count failed:", err); }
  }

  btnLoad.addEventListener("click", async () => {
    if (!confirm("Caricare 30 capi demo nel tuo guardaroba? Potrai rimuoverli in qualsiasi momento.")) return;
    btnLoad.disabled = true;
    btnLoad.textContent = "⏳ Caricamento...";
    try {
      const r = await DemoLoader.loadDemo((cur, tot) => {
        btnLoad.textContent = `⏳ ${cur}/${tot}...`;
      });
      if (r.alreadyLoaded) {
        toast("Demo già presenti", "warning");
      } else {
        toast(`Caricati ${r.added} capi demo`, "success");
      }
      syncDemoStatus();
    } catch (err) {
      console.error(err);
      toast("Errore caricamento: " + err.message, "error");
      btnLoad.disabled = false;
      btnLoad.textContent = "🧪 Carica 30 capi demo";
    }
  });

  btnRemove.addEventListener("click", async () => {
    if (!confirm("Rimuovere tutti i capi demo dal guardaroba? Operazione irreversibile (i capi reali non vengono toccati).")) return;
    btnRemove.disabled = true;
    btnRemove.textContent = "⏳ Rimozione...";
    try {
      const r = await DemoLoader.removeDemo();
      toast(`Rimossi ${r.removed} capi demo`, "success");
      syncDemoStatus();
    } catch (err) {
      console.error(err);
      toast("Errore: " + err.message, "error");
    } finally {
      btnRemove.disabled = false;
      btnRemove.textContent = "🗑️ Rimuovi tutti i demo";
    }
  });

  syncDemoStatus();
}

// =============================================================================
// Reset
// =============================================================================
function initReset() {
  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Resettare tutte le personalizzazioni? I tuoi capi e outfit non vengono toccati.")) return;
    Theme.reset();
    toast("Tutto resettato al tema Light di default", "success");
  });
}

// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  loadStorageStats();
  initCacheClear();
  initBackup();
  initDemo();
  initReset();
});
