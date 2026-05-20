// =============================================================================
// Settings page controller - Marti Outfit
// =============================================================================
// Cablo gli elementi della UI con il theme manager.
// Pattern: ad ogni evento input/change, chiamo Theme.set/update/overrideToken;
// poi mi sottoscrivo a Theme.subscribe per riallineare la UI quando lo stato
// cambia da fonti esterne (es. tap su preset reset overrides).
// =============================================================================

import * as Theme from "./theme/manager.js";
import * as Weather from "./weather.js";
import { NAV_DESTINATIONS, renderBottomNav } from "./bottom-nav.js";

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
  initBar();
  initWeather();
  initLinks();
  initFAB();
  initAppIcon();
  initSeasons();
  initWeights();
  initMenu();
  initTree();
});

// =============================================================================
// Tab "🌳 Albero": personalizza i 6 frutti del + centrale.
// =============================================================================
async function initTree() {
  const root = document.getElementById("tree-editor");
  const btnPreview = document.getElementById("btn-tree-preview");
  const btnReset = document.getElementById("btn-reset-tree");
  if (!root) return;

  // Lazy import per non appesantire boot
  const ActionTree = await import("./action-tree.js");
  const DEST = ActionTree.TREE_DESTINATIONS;
  const DEFAULT = ActionTree.DEFAULT_TREE_MENU;

  function getMenu() {
    const arr = (Theme.getPreferences().treeMenu || DEFAULT).slice(0, 6);
    while (arr.length < 6) arr.push(DEFAULT[arr.length] || DEFAULT[0]);
    return arr.slice(0, 6);
  }

  function render() {
    const menu = getMenu();
    root.innerHTML = menu.map((key, idx) => {
      const dest = DEST[key] || DEST[DEFAULT[idx]];
      const opts = Object.entries(DEST).map(([k, d]) =>
        `<option value="${k}"${k === key ? " selected" : ""}>${d.icon} ${d.label}</option>`
      ).join("");
      return `<div class="tree-edit-row" data-idx="${idx}">
        <span class="tree-edit-pos">${idx + 1}</span>
        <span class="tree-edit-icon">${dest?.icon || "🌟"}</span>
        <select class="tree-edit-select">${opts}</select>
      </div>`;
    }).join("");
    bind();
  }

  function bind() {
    root.querySelectorAll(".tree-edit-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const idx = Number(sel.closest(".tree-edit-row").dataset.idx);
        const menu = getMenu();
        menu[idx] = sel.value;
        Theme.set("treeMenu", menu);
        // Aggiorna l'icona della row senza re-render full
        const newDest = DEST[sel.value];
        sel.closest(".tree-edit-row").querySelector(".tree-edit-icon").textContent = newDest?.icon || "🌟";
      });
    });
  }

  if (btnPreview) {
    btnPreview.addEventListener("click", () => {
      ActionTree.openActionTree();
    });
  }
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (!confirm("Ripristinare i 6 frutti di default?")) return;
      Theme.set("treeMenu", [...DEFAULT]);
      render();
      toast("Albero ripristinato", "success");
    });
  }

  render();
}

// =============================================================================
// Menu drawer editor (riordina + nascondi voci)
// =============================================================================
function initMenu() {
  const root = document.getElementById("menu-editor");
  const btnReset = document.getElementById("btn-reset-menu");
  if (!root) return;

  const ALL_KEYS = ["armocromia", "inspirations", "calendar", "trips", "budget", "notes", "reminders", "diary", "outfit_history", "capsules",
    "analytics", "live", "palette", "dormant", "taxonomies", "settings", "system", "manual"];

  function getList() {
    const prefs = Theme.getPreferences();
    const order = (prefs.menuOrder || []).filter(k => ALL_KEYS.includes(k));
    for (const k of ALL_KEYS) if (!order.includes(k)) order.push(k);
    return order;
  }

  function isHidden(key) {
    return (Theme.getPreferences().menuHidden || []).includes(key);
  }

  function render() {
    const order = getList();
    root.innerHTML = order.map((key, i) => {
      const dest = NAV_DESTINATIONS[key];
      if (!dest) return "";
      const hidden = isHidden(key);
      return `<div class="menu-edit-row${hidden ? ' is-hidden' : ''}" data-key="${key}">
        <span class="menu-edit-icon">${dest.icon}</span>
        <span class="menu-edit-label">${dest.label}</span>
        <div class="menu-edit-actions">
          <button class="menu-edit-arrow" data-action="up" data-idx="${i}" ${i === 0 ? "disabled" : ""} aria-label="Sposta su">↑</button>
          <button class="menu-edit-arrow" data-action="down" data-idx="${i}" ${i === order.length - 1 ? "disabled" : ""} aria-label="Sposta giù">↓</button>
          <button class="menu-edit-vis" data-action="toggle" data-key="${key}" aria-label="${hidden ? 'Mostra' : 'Nascondi'}">${hidden ? '👁' : '🙈'}</button>
        </div>
      </div>`;
    }).join("");
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const order = getList();
    if (action === "up" || action === "down") {
      const idx = Number(btn.dataset.idx);
      const target = action === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= order.length) return;
      [order[idx], order[target]] = [order[target], order[idx]];
      Theme.set("menuOrder", order);
      render();
    } else if (action === "toggle") {
      const key = btn.dataset.key;
      const hidden = (Theme.getPreferences().menuHidden || []).slice();
      if (hidden.includes(key)) Theme.set("menuHidden", hidden.filter(k => k !== key));
      else Theme.set("menuHidden", [...hidden, key]);
      render();
    }
  });

  btnReset.addEventListener("click", () => {
    Theme.set("menuOrder", ["armocromia", "inspirations", "diary", "outfit_history", "reminders", "notes", "budget", "trips", "live", "palette", "dormant", "analytics", "capsules", "calendar", "taxonomies", "settings", "manual", "system"]);
    Theme.set("menuHidden", []);
    render();
    toast("Menu ripristinato al default", "success");
  });

  render();
  Theme.subscribe(render);
}

// =============================================================================
// 5 livelli peso del capo: editor nome (label) + grammi
// =============================================================================
function initWeights() {
  const root = document.getElementById("weights-editor");
  const btnReset = document.getElementById("btn-reset-weights");
  if (!root) return;

  const DEFAULTS = {
    leggerissimo:  { label: "Leggerissimo", icon: "🪶", grams: 100 },
    leggero:       { label: "Leggero",      icon: "🌬️", grams: 250 },
    medio:         { label: "Medio",         icon: "⚖️", grams: 450 },
    pesante:       { label: "Pesante",       icon: "🧱", grams: 800 },
    pesantissimo:  { label: "Pesantissimo",  icon: "🏋️", grams: 1500 },
  };
  const ORDER = ["leggerissimo","leggero","medio","pesante","pesantissimo"];

  function escAttr(s) { return String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

  function render() {
    const prefs = Theme.getPreferences();
    const map = prefs.itemWeights || DEFAULTS;
    root.innerHTML = ORDER.map(key => {
      const w = map[key] || DEFAULTS[key];
      return `<div class="weight-edit-row">
        <span class="weight-edit-icon">${w.icon || ""}</span>
        <input type="text" class="form-control weight-edit-name" data-key="${key}" value="${escAttr(w.label)}" maxlength="24" />
        <div class="weight-edit-grams-wrap">
          <input type="number" class="form-control weight-edit-grams" data-key="${key}" value="${Number(w.grams) || 0}" min="0" max="9999" step="10" inputmode="numeric" />
          <span class="weight-edit-unit">g</span>
        </div>
      </div>`;
    }).join("");
  }

  // Salva sia su 'input' (real-time, anti-bug iOS che skippa change su blur)
  // sia su 'change' (per i numerici dopo blur). Debounce 600ms su input.
  let _saveTimer = null;
  function saveFromEvent(e) {
    const isName = e.target.classList.contains("weight-edit-name");
    const isGrams = e.target.classList.contains("weight-edit-grams");
    if (!isName && !isGrams) return;
    const key = e.target.dataset.key;
    const prefs = Theme.getPreferences();
    const map = { ...(prefs.itemWeights || DEFAULTS) };
    const cur = map[key] || DEFAULTS[key];
    if (isName) {
      map[key] = { ...cur, label: e.target.value.trim() || DEFAULTS[key].label };
    } else {
      const g = Math.max(0, Math.min(9999, Number(e.target.value) || 0));
      map[key] = { ...cur, grams: g };
    }
    Theme.set("itemWeights", map);
  }
  root.addEventListener("input", (e) => {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => saveFromEvent(e), 600);
  });
  // Flush immediato anche su blur/change (evita perdere ultima modifica
  // se l'utente naviga via prima dei 600ms)
  root.addEventListener("change", (e) => {
    clearTimeout(_saveTimer);
    saveFromEvent(e);
    if (e.target.classList.contains("weight-edit-grams")) {
      const g = Math.max(0, Math.min(9999, Number(e.target.value) || 0));
      e.target.value = g;
    }
  });
  // Salva anche se l'utente cambia tab/chiude pagina
  window.addEventListener("beforeunload", () => {
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      const focused = document.activeElement;
      if (focused && (focused.classList.contains("weight-edit-name") || focused.classList.contains("weight-edit-grams"))) {
        saveFromEvent({ target: focused });
      }
    }
  });

  btnReset.addEventListener("click", () => {
    Theme.set("itemWeights", JSON.parse(JSON.stringify(DEFAULTS)));
    render();
    toast("Pesi ripristinati al default", "success");
  });

  render();
  Theme.subscribe(render);
}

// =============================================================================
// 8 stagioni: editor nomi/icone + toggle on/off mezze stagioni
// =============================================================================
function initSeasons() {
  const root = document.getElementById("seasons-editor");
  const btnReset = document.getElementById("btn-reset-seasons");
  if (!root) return;

  const DEFAULTS = {
    primavera:   { label: "Primavera",   icon: "🌸", enabled: true, kind: "full" },
    primestate:  { label: "Primestate",  icon: "🌼", enabled: true, kind: "half" },
    estate:      { label: "Estate",      icon: "☀️", enabled: true, kind: "full" },
    estunno:     { label: "Estunno",     icon: "🌻", enabled: true, kind: "half" },
    autunno:     { label: "Autunno",     icon: "🍂", enabled: true, kind: "full" },
    autinverno:  { label: "Autinverno",  icon: "🌧️", enabled: true, kind: "half" },
    inverno:     { label: "Inverno",     icon: "❄️", enabled: true, kind: "full" },
    inveravera:  { label: "Inveravera",  icon: "🌱", enabled: true, kind: "half" },
  };
  const ORDER = ["primavera","primestate","estate","estunno","autunno","autinverno","inverno","inveravera"];

  function render() {
    const prefs = Theme.getPreferences();
    const seasons = prefs.seasons || DEFAULTS;
    root.innerHTML = ORDER.map(key => {
      const s = seasons[key] || DEFAULTS[key];
      const half = s.kind === "half";
      const disabledRow = (half && !s.enabled) ? " disabled" : "";
      const trailing = half
        ? `<button type="button" class="season-edit-toggle${s.enabled ? " is-on" : ""}" data-key="${key}" role="switch" aria-checked="${s.enabled}" aria-label="${s.enabled ? "Disattiva" : "Attiva"} ${escAttr(s.label)}"></button>`
        : `<span class="season-edit-lock" aria-label="Sempre attiva">SEMPRE</span>`;
      return `<div class="season-edit-row${half ? " is-half" : ""}${disabledRow}">
        <span class="season-edit-icon">${s.icon || ""}</span>
        <input type="text" class="form-control season-edit-name" data-key="${key}" value="${escAttr(s.label)}" maxlength="24" />
        ${trailing}
      </div>`;
    }).join("");
  }

  function escAttr(s) {
    return String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  // Salvataggio: edit nome (input change)
  root.addEventListener("change", (e) => {
    const inp = e.target.closest(".season-edit-name");
    if (!inp) return;
    const key = inp.dataset.key;
    const newLabel = inp.value.trim() || DEFAULTS[key].label;
    const prefs = Theme.getPreferences();
    const seasons = { ...(prefs.seasons || DEFAULTS) };
    seasons[key] = { ...(seasons[key] || DEFAULTS[key]), label: newLabel };
    Theme.set("seasons", seasons);
  });

  // Toggle on/off (solo mezze stagioni)
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".season-edit-toggle");
    if (!btn || btn.disabled) return;
    const key = btn.dataset.key;
    const prefs = Theme.getPreferences();
    const seasons = { ...(prefs.seasons || DEFAULTS) };
    const cur = seasons[key] || DEFAULTS[key];
    seasons[key] = { ...cur, enabled: !cur.enabled };
    Theme.set("seasons", seasons);
    render();
    toast(seasons[key].enabled ? `${seasons[key].label} attiva` : `${seasons[key].label} disattivata`, "success");
  });

  btnReset.addEventListener("click", () => {
    Theme.set("seasons", JSON.parse(JSON.stringify(DEFAULTS)));
    render();
    toast("Stagioni ripristinate al default", "success");
  });

  render();
  Theme.subscribe(render);
}

// =============================================================================
// TAB: BARRA INFERIORE (personalizzazione 4 slot)
// =============================================================================
function initBar() {
  const allDestinations = Object.entries(NAV_DESTINATIONS);
  const DEFAULT_NAV = ["wardrobe", "calendar", "add_item", "capsules", "outfits"];

  function populate() {
    const prefs = Theme.getPreferences();
    // Migrazione: vecchio formato 4 slot -> 5 slot inserendo add_item al centro
    let current = prefs.bottomNav || DEFAULT_NAV;
    if (current.length === 4) {
      current = [current[0], current[1], "add_item", current[2], current[3]];
    }
    while (current.length < 5) current.push("wardrobe");

    for (let i = 0; i < 5; i++) {
      const sel = document.getElementById(`nav-slot-${i}`);
      if (!sel) continue;
      sel.innerHTML = allDestinations.map(([key, d]) =>
        `<option value="${key}">${d.icon} ${d.label}</option>`
      ).join("");
      sel.value = current[i] || "wardrobe";
    }
  }

  document.getElementById("btn-save-bar").addEventListener("click", () => {
    const slots = [];
    for (let i = 0; i < 5; i++) {
      slots.push(document.getElementById(`nav-slot-${i}`).value);
    }
    Theme.set("bottomNav", slots);
    toast("Barra aggiornata", "success");
  });

  document.getElementById("btn-reset-bar").addEventListener("click", () => {
    Theme.set("bottomNav", DEFAULT_NAV.slice());
    populate();
    toast("Default ripristinato", "success");
  });

  populate();
  Theme.subscribe(populate);
}

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

  const iconGrid = document.getElementById("fab-icon-grid");

  function syncUI() {
    const prefs = Theme.getPreferences();
    const fab = prefs.fab || {};
    const def = readDefaults();
    const currentIcon = fab.icon || "🛍️";

    bgInput.value = hexFromCss(fab.bgColor || def.bg);
    iconInput.value = hexFromCss(fab.iconColor || def.icon);

    // Highlight icona attiva nella griglia
    if (iconGrid) {
      iconGrid.querySelectorAll(".fab-icon-opt").forEach(btn => {
        btn.classList.toggle("is-active", btn.dataset.icon === currentIcon && !fab.logoUrl);
      });
    }

    // Anteprima
    preview.style.background = fab.bgColor || def.bg;
    preview.style.color = fab.iconColor || def.icon;
    if (fab.logoUrl) {
      preview.innerHTML = `<img src="${fab.logoUrl}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
      logoCurrent.classList.remove("hidden");
      logoImg.src = fab.logoUrl;
      previewSub.textContent = "Logo personalizzato attivo";
    } else {
      preview.innerHTML = `<span style="font-size: 28px; line-height: 1;">${currentIcon}</span>`;
      logoCurrent.classList.add("hidden");
      previewSub.textContent = `Icona attuale: ${currentIcon}`;
    }
  }

  if (iconGrid) {
    iconGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".fab-icon-opt");
      if (!btn) return;
      const prefs = Theme.getPreferences();
      Theme.set("fab", { ...(prefs.fab || {}), icon: btn.dataset.icon });
      syncUI();
    });
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
    Theme.set("fab", { icon: "🛍️", bgColor: "", iconColor: "", logoUrl: null, logoPath: null });
    syncUI();
    toast("FAB ripristinato al default", "success");
  });

  syncUI();
  Theme.subscribe(syncUI);
}

// =============================================================================
// App icon (PWA) variant picker (Layout tab)
// =============================================================================
function initAppIcon() {
  const grid = document.getElementById("appicon-grid");
  const activeLabel = document.getElementById("appicon-active");
  if (!grid) return;

  const VARIANTS = {
    default: { label: "Classico", suffix: "" },
    pink:    { label: "Rosa cipria", suffix: "-pink" },
    navy:    { label: "Navy", suffix: "-navy" },
    mono:    { label: "Mono", suffix: "-mono" },
  };

  function applyToManifestLinks(variant) {
    const cfg = VARIANTS[variant] || VARIANTS.default;
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    if (apple) apple.href = `./icons/apple-touch-icon${cfg.suffix}.png`;

    // Genera manifest dinamico con URL assoluti (blob URL non risolve path relativi)
    fetch('./manifest.json').then(r => r.json()).then(m => {
      const base = new URL('./', location.href).href;
      m.start_url = new URL(m.start_url || './index.html', base).href;
      m.scope = new URL(m.scope || './', base).href;
      m.icons = (m.icons || []).map(ic => {
        const sizeMatch = (ic.src || '').match(/icon-(\d+)/);
        if (!sizeMatch) return ic;
        return { ...ic, src: new URL(`icons/icon-${sizeMatch[1]}${cfg.suffix}.png`, base).href };
      });
      const blob = new Blob([JSON.stringify(m)], { type: 'application/manifest+json' });
      const link = document.querySelector('link[rel="manifest"]');
      if (link) link.href = URL.createObjectURL(blob);
    }).catch(() => {});
  }

  function syncUI() {
    const prefs = Theme.getPreferences();
    const variant = prefs.appIcon || "default";
    grid.querySelectorAll(".appicon-opt").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.variant === variant);
    });
    if (activeLabel) {
      activeLabel.innerHTML = `Variante attiva: <strong>${VARIANTS[variant]?.label || "Classico"}</strong>. Per applicarla all'icona già installata, rimuovi dalla home e re-installa da Safari.`;
    }
    applyToManifestLinks(variant);
  }

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".appicon-opt");
    if (!btn) return;
    Theme.set("appIcon", btn.dataset.variant);
    syncUI();
    toast("Icona app aggiornata", "success");
  });

  syncUI();
  Theme.subscribe(syncUI);
}
