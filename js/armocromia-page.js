// =============================================================================
// Pagina /armocromia.html — controller del test guidato + risultato.
// =============================================================================
import * as Theme from "./theme/manager.js";
import {
  QUESTIONS, SEASONS, classify,
} from "./armocromia-data.js";

Theme.init();

const state = {
  answers: {},   // questionId -> optionIndex
  current: 0,    // indice domanda corrente (0..13)
  sectionVisible: "intro",  // intro | test | result | saved
};

const $ = (s) => document.querySelector(s);

// =============================================================================
function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

function showSection(name) {
  state.sectionVisible = name;
  for (const s of ["intro", "test", "result", "saved", "import"]) {
    const el = document.getElementById(`ar-${s}`);
    if (!el) continue;
    el.classList.toggle("hidden", s !== name);
  }
}

// =============================================================================
// Boot: se c'e' gia' una stagione salvata, mostra direttamente la card "saved".
// Altrimenti intro.
// =============================================================================
function boot() {
  const saved = Theme.getPreferences().armocromia;
  if (saved && saved.seasonKey && SEASONS[saved.seasonKey]) {
    renderSaved(saved);
    showSection("saved");
  } else {
    showSection("intro");
  }
  bindUI();
}

function bindUI() {
  $("#btn-start").addEventListener("click", () => startTest());
  $("#btn-back").addEventListener("click", () => goBack());
  $("#btn-cancel").addEventListener("click", () => cancelTest());
  $("#btn-info").addEventListener("click", () => showInfo());
  $("#btn-import").addEventListener("click", () => openImport());
  $("#btn-import-cancel").addEventListener("click", () => showSection("intro"));
}

function openImport() {
  const grid = $("#ar-season-grid");
  grid.innerHTML = Object.values(SEASONS).map(s => `
    <button type="button" class="ar-season-card" data-key="${s.key}">
      <div class="ar-season-emoji">${s.emoji}</div>
      <div class="ar-season-name">${s.name}</div>
      <div class="ar-season-mini-palette">
        ${s.palette.slice(0, 6).map(hex => `<span style="background:${hex}"></span>`).join("")}
      </div>
    </button>
  `).join("");
  grid.querySelectorAll(".ar-season-card").forEach(btn => {
    btn.addEventListener("click", () => importSeason(btn.dataset.key));
  });
  showSection("import");
}

function importSeason(key) {
  const season = SEASONS[key];
  if (!season) return;
  if (!confirm(`Confermi "${season.name}" come tua stagione?`)) return;
  const data = {
    seasonKey: key,
    scores: null,           // null = non da test
    confidence: 1,          // import manuale = certezza piena
    completedAt: new Date().toISOString(),
    imported: true,         // flag per distinguere da test
  };
  Theme.set("armocromia", data);
  toast(`✓ ${season.name} salvata come tua stagione`, "success");
  setTimeout(() => {
    renderSaved(data);
    showSection("saved");
  }, 600);
}

function showInfo() {
  alert(`L'armocromia studia quali colori valorizzano una persona in base a 3 caratteristiche:

• Temperatura della pelle (calda/fredda)
• Valore (chiaro/scuro)
• Intensità (brillante/morbido)

Combinando queste 3 dimensioni si ottengono 12 sotto-stagioni. Il test ti chiede 14 domande mirate per identificare la tua.

Per un risultato preciso: luce naturale (vicino a una finestra), senza trucco, capelli nel loro colore naturale.`);
}

// =============================================================================
// Test stepper
// =============================================================================
function startTest() {
  state.answers = {};
  state.current = 0;
  showSection("test");
  renderQuestion();
}

function cancelTest() {
  if (Object.keys(state.answers).length > 0 && !confirm("Annullare il test? Le risposte saranno perse.")) return;
  state.answers = {};
  state.current = 0;
  const saved = Theme.getPreferences().armocromia;
  if (saved && saved.seasonKey) {
    showSection("saved");
  } else {
    showSection("intro");
  }
}

function goBack() {
  if (state.current === 0) {
    cancelTest();
    return;
  }
  state.current--;
  renderQuestion();
}

function renderQuestion() {
  const q = QUESTIONS[state.current];
  const total = QUESTIONS.length;
  const pct = Math.round(((state.current + 1) / total) * 100);
  $("#ar-progress-fill").style.width = `${pct}%`;
  $("#ar-progress-text").textContent = `${state.current + 1} / ${total}`;

  const selected = state.answers[q.id];
  const wrap = $("#ar-question-wrap");
  wrap.innerHTML = `
    <div class="ar-question-emoji">${q.emoji}</div>
    <h2 class="ar-question-text">${escapeHtml(q.text)}</h2>
    <div class="ar-options">
      ${q.options.map((opt, i) => `
        <button class="ar-option${selected === i ? " is-selected" : ""}" type="button" data-idx="${i}">
          <span class="ar-option-letter">${String.fromCharCode(65 + i)}</span>
          <span class="ar-option-text">${escapeHtml(opt.text)}</span>
        </button>
      `).join("")}
    </div>
  `;

  // Animazione di slide-in
  wrap.classList.remove("ar-slide-in");
  void wrap.offsetWidth;  // reflow
  wrap.classList.add("ar-slide-in");

  wrap.querySelectorAll(".ar-option").forEach(btn => {
    btn.addEventListener("click", () => onOptionClick(Number(btn.dataset.idx)));
  });

  // Hide back se prima domanda
  $("#btn-back").style.visibility = state.current === 0 ? "hidden" : "visible";
}

function onOptionClick(idx) {
  const q = QUESTIONS[state.current];
  state.answers[q.id] = idx;
  // Highlight della selezione + auto-avanza dopo 250ms
  $("#ar-question-wrap").querySelectorAll(".ar-option").forEach(b => {
    b.classList.toggle("is-selected", Number(b.dataset.idx) === idx);
  });
  setTimeout(() => {
    if (state.current < QUESTIONS.length - 1) {
      state.current++;
      renderQuestion();
    } else {
      finishTest();
    }
  }, 280);
}

// =============================================================================
// Calcolo + salvataggio + render risultato
// =============================================================================
function finishTest() {
  const result = classify(state.answers);
  const data = {
    seasonKey: result.seasonKey,
    scores: result.scores,
    confidence: result.confidence,
    completedAt: new Date().toISOString(),
  };
  Theme.set("armocromia", data);
  renderResult(result);
  showSection("result");
}

function renderResult(result) {
  const { season, scores, confidence } = result;
  const confidencePct = Math.round(confidence * 100);
  const confLabel = confidence >= 0.75 ? "Alta" : confidence >= 0.55 ? "Media" : "Bassa";
  const confColor = confidence >= 0.75 ? "#10b981" : confidence >= 0.55 ? "#f59e0b" : "#ef4444";

  const wrap = $("#ar-result");
  wrap.innerHTML = `
    <div class="ar-result-hero" style="--season-accent: ${season.palette[0]};">
      <div class="ar-result-emoji">${season.emoji}</div>
      <div class="ar-result-family">${escapeHtml(season.family)}</div>
      <h2 class="ar-result-name">${escapeHtml(season.name)}</h2>
      <p class="ar-result-desc">${escapeHtml(season.description)}</p>
    </div>

    <div class="ar-section-block">
      <h3 class="ar-section-title">🎨 La tua palette</h3>
      <div class="ar-palette-grid">
        ${season.palette.map(hex => `
          <div class="ar-swatch" style="background:${hex}" title="${hex}">
            <span class="ar-swatch-hex">${hex}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="ar-section-block">
      <h3 class="ar-section-title">🚫 Colori da evitare</h3>
      <div class="ar-palette-grid ar-palette-avoid">
        ${(season.avoid || []).map(hex => `
          <div class="ar-swatch ar-swatch-avoid" style="background:${hex}" title="${hex}"></div>
        `).join("")}
      </div>
      <p class="ar-section-hint">Non sono "vietati", semplicemente ti spengono. Usali lontani dal viso (pantaloni, scarpe, accessori).</p>
    </div>

    <div class="ar-section-block">
      <h3 class="ar-section-title">🪞 Caratteristiche fisiche</h3>
      <p class="ar-physical">${escapeHtml(season.physical)}</p>
    </div>

    <div class="ar-section-block">
      <h3 class="ar-section-title">📊 Affidabilità</h3>
      <div class="ar-confidence">
        <div class="ar-conf-bar">
          <div class="ar-conf-fill" style="width:${confidencePct}%; background:${confColor}"></div>
        </div>
        <div class="ar-conf-meta">
          <span>${confLabel}</span>
          <span>${confidencePct}%</span>
        </div>
        <p class="ar-section-hint">Test self-administered. Per maggiore precisione consulta un consulente armocromico professionale con drappi reali.</p>
      </div>
    </div>

    <div class="ar-actions">
      <button class="btn btn--primary btn--block" id="btn-save-result">✓ Salva la mia stagione</button>
      <button class="btn btn--ghost btn--block" id="btn-redo" style="margin-top:8px;">↺ Rifai il test</button>
    </div>
  `;

  $("#btn-save-result").addEventListener("click", () => {
    toast("✓ Stagione salvata. Ora la userai nel guardaroba.", "success");
    setTimeout(() => {
      const saved = Theme.getPreferences().armocromia;
      renderSaved(saved);
      showSection("saved");
    }, 800);
  });
  $("#btn-redo").addEventListener("click", () => startTest());
}

async function renderSaved(saved) {
  const season = SEASONS[saved.seasonKey];
  if (!season) {
    showSection("intro");
    return;
  }
  const date = saved.completedAt ? new Date(saved.completedAt) : null;
  const dateStr = date ? date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "";

  // Lazy load del guardaroba per gap analysis + stats
  let items = [];
  try {
    const Wardrobe = await import("./wardrobe.js");
    items = await Wardrobe.listItems();
  } catch (_) {}

  const ColorMatch = await import("./color-match.js");
  const stats = ColorMatch.paletteStats(items);
  const gaps = ColorMatch.shoppingGaps(items, season);

  const wrap = $("#ar-saved");
  wrap.innerHTML = `
    <div class="ar-result-hero" style="--season-accent: ${season.palette[0]};">
      <div class="ar-result-emoji">${season.emoji}</div>
      <div class="ar-result-family">La tua stagione · ${escapeHtml(season.family)}</div>
      <h2 class="ar-result-name">${escapeHtml(season.name)}</h2>
      <p class="ar-result-desc">${escapeHtml(season.description)}</p>
      ${dateStr ? `<p class="ar-saved-date">${saved.imported ? "Importata" : "Test completato"} il ${dateStr}</p>` : ""}
    </div>

    ${stats.applicable >= 3 ? `
    <div class="ar-section-block">
      <h3 class="ar-section-title">📊 Il tuo guardaroba</h3>
      <div class="ar-stats-grid">
        <div class="ar-stat-card"><div class="ar-stat-num">${stats.percent}%</div><div class="ar-stat-lbl">in palette</div></div>
        <div class="ar-stat-card"><div class="ar-stat-num" style="color:#10b981">${stats.in}</div><div class="ar-stat-lbl">perfetti</div></div>
        <div class="ar-stat-card"><div class="ar-stat-num" style="color:#f59e0b">${stats.near}</div><div class="ar-stat-lbl">vicini</div></div>
        <div class="ar-stat-card"><div class="ar-stat-num" style="color:#ef4444">${stats.out + stats.avoid}</div><div class="ar-stat-lbl">fuori</div></div>
      </div>
    </div>
    ` : ""}

    <div class="ar-section-block">
      <h3 class="ar-section-title">🎨 La tua palette</h3>
      <div class="ar-palette-grid">
        ${season.palette.map(hex => `
          <div class="ar-swatch" style="background:${hex}" title="${hex}">
            <span class="ar-swatch-hex">${hex}</span>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="ar-section-block">
      <h3 class="ar-section-title">🚫 Colori da evitare vicino al viso</h3>
      <div class="ar-palette-grid ar-palette-avoid">
        ${(season.avoid || []).map(hex => `
          <div class="ar-swatch ar-swatch-avoid" style="background:${hex}" title="${hex}"></div>
        `).join("")}
      </div>
    </div>

    ${gaps.length > 0 ? `
    <div class="ar-section-block">
      <h3 class="ar-section-title">🛍️ Cosa manca al tuo guardaroba</h3>
      <div class="ar-gap-list">
        ${gaps.map(g => `
          <div class="ar-gap-card ar-gap-${g.severity}">
            <div class="ar-gap-head">
              <span class="ar-gap-icon">${g.icon}</span>
              <div class="ar-gap-text">
                <div class="ar-gap-title">${escapeHtml(g.label)}</div>
                <div class="ar-gap-msg">${escapeHtml(g.message)}</div>
              </div>
            </div>
            <div class="ar-gap-colors">
              ${g.suggestedColors.map(hex => `
                <div class="ar-gap-color" style="background:${hex}" title="${hex}"></div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
    ` : ""}

    <div class="ar-actions">
      ${stats.applicable >= 3 ? `<button class="btn btn--primary btn--block" id="btn-wrapped">📊 Vedi il tuo Wrapped</button>` : ""}
      <button class="btn btn--ghost btn--block" id="btn-redo-saved" style="margin-top:8px;">↺ Rifai il test</button>
      <button class="btn btn--ghost btn--block" id="btn-clear-saved" style="margin-top:8px; color:#ef4444;">🗑️ Cancella stagione</button>
    </div>
  `;

  const btnWrapped = $("#btn-wrapped");
  if (btnWrapped) {
    btnWrapped.addEventListener("click", async () => {
      const m = await import("./armocromia-wrapped.js");
      m.openArmoWrapped({ season, stats, items, gaps });
    });
  }
  $("#btn-redo-saved").addEventListener("click", () => startTest());
  $("#btn-clear-saved").addEventListener("click", () => {
    if (!confirm("Cancellare la tua stagione armocromia salvata?")) return;
    Theme.set("armocromia", null);
    showSection("intro");
    toast("Stagione cancellata", "success");
  });
}

// =============================================================================
window.addEventListener("DOMContentLoaded", boot);
