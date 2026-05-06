// =============================================================================
// Settings page controller - Marty Outfit
// =============================================================================
// Cablo gli elementi della UI con il theme manager.
// Pattern: ad ogni evento input/change, chiamo Theme.set/update/overrideToken;
// poi mi sottoscrivo a Theme.subscribe per riallineare la UI quando lo stato
// cambia da fonti esterne (es. tap su preset reset overrides).
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Weather from "./weather.js";
import * as DemoLoader from "./demo-loader.js";
import * as Wardrobe from "./wardrobe.js";

// Inizializzo il theme manager (legge localStorage, applica al documento)
Theme.init();

// =============================================================================
// Toast helper (riusato dall'app principale)
// =============================================================================
function toast(message, type = "default") {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2500);
}

// =============================================================================
// Tabs navigation
// =============================================================================
function initTabs() {
  const tabs = document.querySelectorAll(".settings-tabs .tab");
  const panels = document.querySelectorAll(".settings-tab-panel");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("is-active"));
      panels.forEach(p => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      const id = tab.dataset.tab;
      document.getElementById(`tab-${id}`).classList.add("is-active");
      // Persisto la tab nel hash per deep link
      history.replaceState(null, "", `#${id}`);
    });
  });

  // Apri tab dal hash all'avvio (es. ?#colors)
  const initial = location.hash.replace("#", "");
  if (initial) {
    const btn = document.querySelector(`.tab[data-tab="${initial}"]`);
    if (btn) btn.click();
  }
}

// =============================================================================
// TAB 1: TEMI PREDEFINITI
// =============================================================================
function initPresets() {
  const grid = document.getElementById("preset-grid");
  const toggleAuto = document.getElementById("toggle-auto");

  // Render dei preset come card con mini-preview 2x2
  function renderPresets() {
    const prefs = Theme.getPreferences();
    const presets = Theme.getPresets();

    grid.innerHTML = presets.map(p => {
      const isActive = prefs.themeMode === p.key;
      // Recupero i colori per la mini-preview leggendoli dai tokens del preset
      // (uso dei placeholder se manca, evita JS lookup)
      return `
        <button class="preset-card ${isActive ? 'is-active' : ''}" data-preset="${p.key}" aria-label="Tema ${p.name}">
          <div class="preset-swatch preset-${p.key}"></div>
          <div class="preset-name">${p.name}</div>
          ${isActive ? '<div class="preset-active-mark">✓</div>' : ''}
        </button>
      `;
    }).join("");

    grid.querySelectorAll(".preset-card").forEach(card => {
      card.addEventListener("click", () => {
        const key = card.dataset.preset;
        // Quando l'utente sceglie un preset, disabilito 'auto' e azzero overrides
        Theme.update({ themeMode: key, customOverrides: {} });
        toggleAuto.checked = false;
        toast(`Tema "${card.querySelector('.preset-name').textContent}" applicato`, "success");
      });
    });
  }

  // Toggle "Sync con OS"
  toggleAuto.addEventListener("change", () => {
    if (toggleAuto.checked) {
      Theme.set("themeMode", "auto");
      toast("Sincronizzazione con il sistema attiva", "success");
    } else {
      // Se viene disattivato, ripristino l'ultimo preset esplicito o light
      Theme.set("themeMode", "light");
    }
  });

  // Stato iniziale del toggle
  function syncToggleAuto() {
    toggleAuto.checked = Theme.getPreferences().themeMode === "auto";
  }

  renderPresets();
  syncToggleAuto();

  // Riallineo UI quando il tema cambia da fonti esterne
  Theme.subscribe(() => {
    renderPresets();
    syncToggleAuto();
  });
}

// =============================================================================
// TAB 2: COLORI
// =============================================================================

// Palette swatch quick-pick per colore primario
const PRIMARY_SWATCHES = [
  "#d4af37", "#1a1a1a", "#e74c3c", "#27ae60", "#3498db",
  "#9b59b6", "#ff6b9d", "#ff8c42", "#16a085", "#2c3e50",
  "#f1c40f", "#34495e",
];

function initColors() {
  const grid = document.getElementById("swatch-grid-primary");
  const pPrimary = document.getElementById("picker-primary");
  const pAccent  = document.getElementById("picker-accent");
  const pBg      = document.getElementById("picker-bg");
  const pText    = document.getElementById("picker-text");

  // Render swatch grid
  grid.innerHTML = PRIMARY_SWATCHES.map(color => `
    <button class="swatch swatch--lg" data-color="${color}" style="background:${color}" aria-label="Colore ${color}"></button>
  `).join("");
  grid.querySelectorAll(".swatch").forEach(sw => {
    sw.addEventListener("click", () => {
      Theme.overrideToken("color-primary", sw.dataset.color);
      toast("Colore principale aggiornato", "success");
    });
  });

  // Sync color picker con valore corrente del CSS variable
  function syncPickers() {
    const css = getComputedStyle(document.documentElement);
    pPrimary.value = hexFromCss(css.getPropertyValue("--color-primary"));
    pAccent.value  = hexFromCss(css.getPropertyValue("--color-accent"));
    pBg.value      = hexFromCss(css.getPropertyValue("--color-bg"));
    pText.value    = hexFromCss(css.getPropertyValue("--color-text"));
  }

  // Bind change su ogni picker
  pPrimary.addEventListener("input", e => Theme.overrideToken("color-primary", e.target.value));
  pAccent.addEventListener("input",  e => Theme.overrideToken("color-accent",  e.target.value));
  pBg.addEventListener("input",      e => Theme.overrideToken("color-bg",      e.target.value));
  pText.addEventListener("input",    e => Theme.overrideToken("color-text",    e.target.value));

  document.getElementById("btn-clear-overrides").addEventListener("click", () => {
    Theme.clearOverrides();
    toast("Personalizzazioni colore rimosse", "success");
  });

  syncPickers();
  Theme.subscribe(syncPickers);
}

// Converte un valore CSS color (rgb / hex / hsl) in hex per i picker.
// Approccio robusto: setto come background di un elemento temp e leggo computed.
function hexFromCss(value) {
  if (!value) return "#000000";
  value = value.trim();
  if (value.startsWith("#")) {
    // Espande #abc -> #aabbcc
    if (value.length === 4) {
      return "#" + value.slice(1).split("").map(c => c+c).join("");
    }
    return value.slice(0, 7);
  }
  // rgb / rgba -> hex
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    return "#" + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, "0")).join("");
  }
  return "#000000";
}

// =============================================================================
// TAB 3: FORME
// =============================================================================
function initShapes() {
  const sliders = [
    { id: "slider-radius-button", value: "value-radius-button", key: "radiusButton" },
    { id: "slider-radius-card",   value: "value-radius-card",   key: "radiusCard"   },
    { id: "slider-radius-input",  value: "value-radius-input",  key: "radiusInput"  },
  ];

  function syncSliders() {
    const prefs = Theme.getPreferences();
    sliders.forEach(({ id, value, key }) => {
      const slider = document.getElementById(id);
      const display = document.getElementById(value);
      slider.value = prefs[key];
      display.textContent = `${prefs[key]}px`;
    });
    document.querySelectorAll('input[name="border"]').forEach(r => {
      r.checked = String(r.value) === String(prefs.borderWidth);
    });
  }

  sliders.forEach(({ id, value, key }) => {
    const slider = document.getElementById(id);
    const display = document.getElementById(value);
    slider.addEventListener("input", () => {
      const v = +slider.value;
      display.textContent = `${v}px`;
      Theme.set(key, v);
    });
  });

  // Bordi (radio 0/1/2 px)
  document.querySelectorAll('input[name="border"]').forEach(r => {
    r.addEventListener("change", () => {
      if (r.checked) Theme.set("borderWidth", +r.value);
    });
  });

  syncSliders();
  Theme.subscribe(syncSliders);
}

// =============================================================================
// TAB 4: TIPOGRAFIA
// =============================================================================
function initTypo() {
  const list = document.getElementById("font-list");
  const fonts = Theme.getFonts();

  list.innerHTML = fonts.map(f => `
    <button class="font-card" data-font="${f.key}">
      <div class="font-card-name" style="font-family: var(--font-preview-${f.key}, inherit)">${f.name}</div>
      <div class="font-card-sample" style="font-family: var(--font-preview-${f.key}, inherit)">Aa Bb 123 - Outfit</div>
    </button>
  `).join("");

  // Imposto preview font-family come variabile CSS specifica (non altero il tema attivo)
  list.querySelectorAll(".font-card").forEach(card => {
    card.addEventListener("click", () => {
      Theme.set("font", card.dataset.font);
      toast(`Font "${card.querySelector('.font-card-name').textContent}" applicato`, "success");
    });
  });

  function syncFontUI() {
    const prefs = Theme.getPreferences();
    list.querySelectorAll(".font-card").forEach(card => {
      card.classList.toggle("is-active", card.dataset.font === prefs.font);
    });
    document.querySelectorAll('input[name="font-size"]').forEach(r => {
      r.checked = parseFloat(r.value) === parseFloat(prefs.fontSizeScale);
    });
  }

  // Font size scale radios
  document.querySelectorAll('input[name="font-size"]').forEach(r => {
    r.addEventListener("change", () => {
      if (r.checked) Theme.set("fontSizeScale", parseFloat(r.value));
    });
  });

  syncFontUI();
  Theme.subscribe(syncFontUI);
}

// =============================================================================
// TAB 5: LAYOUT
// =============================================================================
function initLayout() {
  const animSelect = document.getElementById("select-animation");
  const colsButtons = document.querySelectorAll("#grid-cols-preview button");

  function syncLayoutUI() {
    const prefs = Theme.getPreferences();
    document.querySelectorAll('input[name="density"]').forEach(r => {
      r.checked = parseFloat(r.value) === parseFloat(prefs.density);
    });
    colsButtons.forEach(b => {
      b.classList.toggle("is-active", +b.dataset.cols === +prefs.gridColumns);
    });
    animSelect.value = prefs.animationSpeed;
  }

  document.querySelectorAll('input[name="density"]').forEach(r => {
    r.addEventListener("change", () => {
      if (r.checked) Theme.set("density", parseFloat(r.value));
    });
  });

  colsButtons.forEach(b => {
    b.addEventListener("click", () => Theme.set("gridColumns", +b.dataset.cols));
  });

  animSelect.addEventListener("change", () => Theme.set("animationSpeed", animSelect.value));

  syncLayoutUI();
  Theme.subscribe(syncLayoutUI);
}

// =============================================================================
// TAB 6: BACKUP
// =============================================================================
function initBackup() {
  document.getElementById("btn-export").addEventListener("click", () => {
    Theme.exportTheme();
    toast("Tema esportato", "success");
  });

  document.getElementById("input-import").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await Theme.importTheme(file);
      toast("Tema importato", "success");
    } catch (err) {
      console.error(err);
      toast("File non valido: " + err.message, "error");
    }
    e.target.value = "";  // reset input
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    if (!confirm("Resettare tutte le personalizzazioni? I tuoi capi e outfit non vengono toccati.")) return;
    Theme.reset();
    toast("Tutto resettato al tema Light di default", "success");
  });

  // ============================================================================
  // Pulisci cache PWA: unregister SW + delete tutte le Cache Storage
  // (le tue preferenze in localStorage e i tuoi dati Firestore restano intatti)
  // ============================================================================
  const btnClearCache = document.getElementById("btn-clear-cache");
  btnClearCache.addEventListener("click", async () => {
    if (!confirm(
      "Pulisci la cache della app?\n\n" +
      "Verranno eliminati i file JS/CSS/HTML in cache locale, e l'app si " +
      "ricaricherà con la versione più recente dal server.\n\n" +
      "Le tue personalizzazioni (tema, fonts, ecc.) e i tuoi capi/outfit " +
      "NON vengono toccati."
    )) return;

    btnClearCache.disabled = true;
    btnClearCache.textContent = "⏳ Pulizia in corso...";

    try {
      // 1. Cancello tutte le Cache Storage (shell PWA, font, ecc.)
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }

      // 2. Unregister tutti i service worker registrati
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }

      // 3. Brevi flag in localStorage che invalidare aiuta (model imgly, weather)
      try {
        localStorage.removeItem("marty_imgly_loaded");
        localStorage.removeItem("marty_forecast");
      } catch {}

      toast("Cache pulita. Ricarico l'app...", "success");

      // 4. Reload dopo un attimo per mostrare il toast
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      console.error("Errore pulizia cache:", err);
      toast("Errore: " + err.message, "error");
      btnClearCache.disabled = false;
      btnClearCache.textContent = "🧹 Pulisci cache (forza aggiornamento)";
    }
  });

  // ============================================================================
  // Demo data: load / remove / count
  // ============================================================================
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
    } catch (err) {
      console.warn("Demo count failed:", err);
    }
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
      const r = await DemoLoader.removeDemo((cur, tot) => {
        btnRemove.textContent = `⏳ ${cur}/${tot}...`;
      });
      toast(`Rimossi ${r.removed} capi demo`, "success");
      syncDemoStatus();
    } catch (err) {
      console.error(err);
      toast("Errore rimozione: " + err.message, "error");
    } finally {
      btnRemove.disabled = false;
      btnRemove.textContent = "🗑️ Rimuovi tutti i demo";
    }
  });

  syncDemoStatus();

  // ============================================================================
  // Storage stats (calcolato al caricamento del tab Backup)
  // ============================================================================
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
  loadStorageStats();
}

// =============================================================================
// TAB 7: METEO (location + forecast preview)
// =============================================================================
function initWeather() {
  const btnGeo = document.getElementById("btn-use-geo");
  const btnCity = document.getElementById("btn-set-city");
  const btnClear = document.getElementById("btn-clear-weather");
  const inputCity = document.getElementById("input-city");
  const status = document.getElementById("weather-status");

  async function syncStatus() {
    const loc = Weather.getCachedLocation();
    if (!loc) {
      status.classList.add("hidden");
      btnClear.classList.add("hidden");
      return;
    }

    btnClear.classList.remove("hidden");
    try {
      const forecast = await Weather.getForecast(loc);
      const desc = Weather.describeWeatherCode(forecast.daily.weatherCode);
      status.innerHTML = `
        <span class="weather-emoji">${desc.emoji}</span>
        <div class="weather-info">
          <div class="weather-temp">${forecast.daily.min.toFixed(0)}° / ${forecast.daily.max.toFixed(0)}°C</div>
          <div class="weather-desc">${desc.label} · ${escapeHtml(loc.label)}</div>
        </div>
      `;
      status.classList.remove("hidden");
    } catch (err) {
      status.innerHTML = `<div style="padding:var(--space-3); color: var(--color-error)">Errore meteo: ${err.message}</div>`;
      status.classList.remove("hidden");
    }
  }

  btnGeo.addEventListener("click", async () => {
    btnGeo.disabled = true;
    btnGeo.textContent = "...";
    try {
      const loc = await Weather.requestGeolocation();
      Weather.setCachedLocation(loc);
      toast("Posizione salvata", "success");
      syncStatus();
    } catch (err) {
      toast("Geolocalizzazione fallita: " + err.message, "error");
    } finally {
      btnGeo.disabled = false;
      btnGeo.textContent = "📍 Attiva";
    }
  });

  btnCity.addEventListener("click", async () => {
    const city = inputCity.value.trim();
    if (!city) return;
    btnCity.disabled = true;
    try {
      const loc = await Weather.geocode(city);
      Weather.setCachedLocation(loc);
      toast(`Posizione: ${loc.label}`, "success");
      inputCity.value = "";
      syncStatus();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btnCity.disabled = false;
    }
  });

  btnClear.addEventListener("click", () => {
    Weather.clearCachedLocation();
    toast("Posizione rimossa", "success");
    syncStatus();
  });

  syncStatus();
}

// =============================================================================
// TAB: LINK (durata avviso scadenza)
// =============================================================================
function initLinks() {
  const slider = document.getElementById("slider-link-duration");
  const display = document.getElementById("value-link-duration");

  function formatDuration(days) {
    if (days >= 365) {
      const years = Math.round(days / 365 * 10) / 10;
      return `${days} g (${years} anni)`;
    }
    if (days >= 30) {
      const months = Math.round(days / 30);
      return `${days} g (${months} mesi)`;
    }
    return `${days} giorni`;
  }

  function syncSlider() {
    const prefs = Theme.getPreferences();
    const v = prefs.linkDurationDays || 180;
    slider.value = v;
    display.textContent = formatDuration(v);
  }

  slider.addEventListener("input", () => {
    display.textContent = formatDuration(+slider.value);
  });
  slider.addEventListener("change", () => {
    Theme.set("linkDurationDays", +slider.value);
  });

  syncSlider();
  Theme.subscribe(syncSlider);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initPresets();
  initColors();
  initShapes();
  initTypo();
  initLayout();
  initWeather();
  initLinks();
  initFAB();
  initBackup();
});

// =============================================================================
// FAB customization (Layout tab)
// =============================================================================
function initFAB() {
  const bgInput = document.getElementById("fab-bg-color");
  const iconInput = document.getElementById("fab-icon-color");
  const fileInput = document.getElementById("input-fab-logo");
  const btnRemoveLogo = document.getElementById("btn-remove-fab-logo");
  const btnReset = document.getElementById("btn-reset-fab");
  const preview = document.getElementById("fab-preview");
  const previewSub = document.getElementById("fab-preview-sub");
  const logoCurrent = document.getElementById("fab-logo-current");
  const logoImg = document.getElementById("fab-logo-img");

  function readDefaults() {
    const css = getComputedStyle(document.documentElement);
    return {
      bg: css.getPropertyValue("--color-primary").trim() || "#d4af37",
      icon: css.getPropertyValue("--color-text-inverse").trim() || "#ffffff",
    };
  }

  function syncUI() {
    const prefs = Theme.getPreferences();
    const fab = prefs.fab || {};
    const def = readDefaults();

    bgInput.value = hexFromCss(fab.bgColor || def.bg);
    iconInput.value = hexFromCss(fab.iconColor || def.icon);

    // Anteprima
    preview.style.background = fab.bgColor || def.bg;
    preview.style.color = fab.iconColor || def.icon;
    if (fab.logoUrl) {
      preview.innerHTML = `<img src="${fab.logoUrl}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
      logoCurrent.classList.remove("hidden");
      logoImg.src = fab.logoUrl;
      previewSub.textContent = "Logo personalizzato attivo";
    } else {
      preview.innerHTML = `<span style="font-size: 28px; font-weight: 700;">+</span>`;
      logoCurrent.classList.add("hidden");
      previewSub.textContent = "Tap sul + dalla home apre 'Nuovo capo'";
    }
  }

  bgInput.addEventListener("input", () => {
    const prefs = Theme.getPreferences();
    Theme.set("fab", { ...(prefs.fab || {}), bgColor: bgInput.value });
    syncUI();
  });
  iconInput.addEventListener("input", () => {
    const prefs = Theme.getPreferences();
    Theme.set("fab", { ...(prefs.fab || {}), iconColor: iconInput.value });
    syncUI();
  });

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    toast("Caricamento logo...", "default");
    try {
      const Logo = await import("./share-logo.js");
      const { url, path } = await Logo.uploadLogo(file);
      const prefs = Theme.getPreferences();
      // Cleanup logo precedente
      const oldPath = prefs.fab?.logoPath;
      if (oldPath) {
        try { await Logo.deleteLogo(oldPath); } catch {}
      }
      Theme.set("fab", { ...(prefs.fab || {}), logoUrl: url, logoPath: path });
      syncUI();
      toast("Logo caricato", "success");
    } catch (err) {
      console.error(err);
      toast("Errore upload: " + err.message, "error");
    } finally {
      e.target.value = "";
    }
  });

  btnRemoveLogo.addEventListener("click", async () => {
    const prefs = Theme.getPreferences();
    const oldPath = prefs.fab?.logoPath;
    if (oldPath) {
      try {
        const Logo = await import("./share-logo.js");
        await Logo.deleteLogo(oldPath);
      } catch {}
    }
    Theme.set("fab", { ...(prefs.fab || {}), logoUrl: null, logoPath: null });
    syncUI();
    toast("Logo rimosso", "success");
  });

  btnReset.addEventListener("click", async () => {
    const prefs = Theme.getPreferences();
    const oldPath = prefs.fab?.logoPath;
    if (oldPath) {
      try {
        const Logo = await import("./share-logo.js");
        await Logo.deleteLogo(oldPath);
      } catch {}
    }
    Theme.set("fab", { bgColor: "", iconColor: "", logoUrl: null, logoPath: null });
    syncUI();
    toast("FAB ripristinato al default", "success");
  });

  syncUI();
  Theme.subscribe(syncUI);
}
