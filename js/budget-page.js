// =============================================================================
// Budget — pagina mensile + transazioni + chiusura con rollover
// =============================================================================

import * as Theme from "./theme/manager.js";
import {
  monthKey, prevMonthKey, nextMonthKey, formatMonth,
  getBudget, ensureBudget, setMonthlyBudget, addTransaction, deleteTransaction,
  closeMonth, reopenMonth, computeSummary, listBudgets, computeBudgetStats,
} from "./budget-data.js";
import { listItems } from "./wardrobe.js";
import { formatNumberIT, parseNumberIT, sanitizeNumericInput } from "./it-format.js";

Theme.init();

const state = {
  currentMonth: monthKey(),     // 'YYYY-MM'
  budget: null,
};

// =============================================================================
// Toast
// =============================================================================
function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast hidden"; }, 2400);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// =============================================================================
// Render
// =============================================================================
async function load() {
  document.getElementById("bg-month-name").textContent = formatMonth(state.currentMonth);
  document.getElementById("bg-summary").innerHTML = `<div class="bg-summary-loading">⏳</div>`;

  try {
    state.budget = await ensureBudget(state.currentMonth);
  } catch (err) {
    console.error(err);
    toast("Errore caricamento budget", "error");
    return;
  }

  renderSummary();
  renderRolloverBanner();
  renderClosedBanner();
  renderTransactions();
  renderCloseButtons();
}

function computeProactiveAlert(b, summary) {
  // Solo per il mese corrente E budget non chiuso
  if (b.month !== monthKey() || b.closed) return null;
  if (b.budget <= 0 && b.rollover_in === 0) return null;

  const today = new Date();
  const dayOfMonth = today.getDate();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - dayOfMonth;
  const dayProgress = dayOfMonth / lastDay; // 0..1

  // Sforamento gia' avvenuto
  if (summary.delta < 0) {
    return {
      kind: "danger",
      icon: "🚨",
      message: `Hai già sforato di <strong>${formatNumberIT(Math.abs(summary.delta), { decimals: 0, euro: true })}</strong>. Mancano <strong>${daysLeft}</strong> ${daysLeft === 1 ? "giorno" : "giorni"} alla fine del mese.`,
    };
  }

  // Proiezione: se mantieni questo ritmo, sforerai?
  if (summary.spent > 0 && dayProgress > 0.15) {
    const projected = summary.spent / dayProgress;
    const overshoot = projected - summary.available;
    if (overshoot > 0 && overshoot >= summary.available * 0.05) {
      return {
        kind: "warning",
        icon: "⚠️",
        message: `Stai spendendo più del previsto. A questo ritmo arriverai a <strong>${formatNumberIT(projected, { decimals: 0, euro: true })}</strong> a fine mese (sforando di ~${formatNumberIT(overshoot, { decimals: 0, euro: true })}).`,
      };
    }
  }

  // 80%+ del budget speso
  if (summary.pct >= 80) {
    return {
      kind: "warning",
      icon: "⚠️",
      message: `Hai usato <strong>${summary.pct}%</strong> del budget. Mancano <strong>${daysLeft}</strong> ${daysLeft === 1 ? "giorno" : "giorni"} e <strong>${formatNumberIT(summary.delta, { decimals: 0, euro: true })}</strong>.`,
    };
  }

  // Sotto la metà del mese e già 50%+ speso
  if (dayProgress < 0.5 && summary.pct >= 50) {
    return {
      kind: "info",
      icon: "💡",
      message: `Hai speso <strong>${summary.pct}%</strong> del budget e siamo solo a metà mese. Tieni il ritmo!`,
    };
  }

  return null;
}

function renderSummary() {
  const b = state.budget;
  const s = computeSummary(b);
  const isClosed = !!b.closed;
  const alert = computeProactiveAlert(b, s);

  // Stato semaforo
  let statusClass = "is-good";
  if (s.delta < 0) statusClass = "is-over";
  else if (s.pct >= 80) statusClass = "is-warning";

  const html = `
    <div class="bg-summary-card ${statusClass}">
      <div class="bg-summary-row">
        <button class="bg-budget-set" id="btn-edit-budget" aria-label="Modifica budget">
          <span class="bg-summary-label">Budget mensile</span>
          <span class="bg-summary-value">${formatNumberIT(b.budget || 0, { decimals: 0, euro: true })}</span>
        </button>
        ${b.rollover_in ? `
          <div class="bg-rollover-pill ${b.rollover_in > 0 ? 'is-positive' : 'is-negative'}">
            ${b.rollover_in > 0 ? "+ " : "− "}${formatNumberIT(Math.abs(b.rollover_in), { decimals: 0, euro: true })}<br>
            <small>dal mese scorso</small>
          </div>
        ` : ""}
      </div>

      <div class="bg-summary-bar">
        <div class="bg-summary-bar-fill" style="width: ${Math.min(100, s.pct)}%"></div>
      </div>

      <div class="bg-summary-stats">
        <div class="bg-stat">
          <span class="bg-stat-label">Speso</span>
          <span class="bg-stat-value">${formatNumberIT(s.spent, { decimals: 2, euro: true })}</span>
        </div>
        <div class="bg-stat">
          <span class="bg-stat-label">Disponibile</span>
          <span class="bg-stat-value">${formatNumberIT(s.available, { decimals: 0, euro: true })}</span>
        </div>
        <div class="bg-stat">
          <span class="bg-stat-label">${s.delta >= 0 ? "Resta" : "Sforato"}</span>
          <span class="bg-stat-value bg-stat-delta">${formatNumberIT(Math.abs(s.delta), { decimals: 2, euro: true })}</span>
        </div>
      </div>

      ${isClosed ? `<div class="bg-locked-tag">🔒 Mese chiuso</div>` : ""}
    </div>
    ${alert ? `<div class="bg-alert bg-alert--${alert.kind}">
      <span class="bg-alert-icon">${alert.icon}</span>
      <span class="bg-alert-msg">${alert.message}</span>
    </div>` : ""}
  `;
  document.getElementById("bg-summary").innerHTML = html;

  // Click su "Budget mensile" -> prompt edit
  const editBtn = document.getElementById("btn-edit-budget");
  if (editBtn && !isClosed) {
    editBtn.addEventListener("click", onEditBudget);
  } else if (editBtn) {
    editBtn.disabled = true;
  }
}

function renderRolloverBanner() {
  const box = document.getElementById("bg-rollover-in");
  const b = state.budget;
  if (!b.rollover_in || b.rollover_in === 0) {
    box.classList.add("hidden");
    return;
  }
  const positive = b.rollover_in > 0;
  box.classList.remove("hidden");
  box.classList.toggle("is-positive", positive);
  box.classList.toggle("is-negative", !positive);
  const prevName = formatMonth(prevMonthKey(state.currentMonth));
  if (positive) {
    box.innerHTML = `🌟 <strong>${formatNumberIT(b.rollover_in, { decimals: 0, euro: true })}</strong> avanzati da ${prevName} — sono già nel disponibile.`;
  } else {
    box.innerHTML = `⚠️ Da ${prevName} arriva uno sforamento di <strong>${formatNumberIT(Math.abs(b.rollover_in), { decimals: 0, euro: true })}</strong>: il budget effettivo questo mese è ridotto.`;
  }
}

function renderClosedBanner() {
  const box = document.getElementById("bg-closed-banner");
  const b = state.budget;
  if (!b.closed) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const action = b.rollover_out > 0 ? `${formatNumberIT(b.rollover_out, { decimals: 0, euro: true })} avanzo rollati al mese successivo`
    : b.rollover_out < 0 ? `${formatNumberIT(b.rollover_out, { decimals: 0, euro: true })} sforamento rollato al mese successivo`
    : "Delta azzerato";
  box.innerHTML = `🔒 Mese chiuso · ${action}`;
}

function renderTransactions() {
  const list = document.getElementById("bg-tx-list");
  const txs = (state.budget.transactions || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (txs.length === 0) {
    list.innerHTML = `<div class="bg-tx-empty">Nessuna spesa registrata. Tap "+ Aggiungi spesa".</div>`;
    return;
  }
  list.innerHTML = txs.map(tx => `
    <div class="bg-tx-row" data-id="${escapeHtml(tx.id)}">
      <div class="bg-tx-info">
        <div class="bg-tx-label">${escapeHtml(tx.label)}</div>
        <div class="bg-tx-meta">
          ${escapeHtml(formatTxDate(tx.date))}
          ${tx.link ? `· <a href="${escapeHtml(tx.link)}" target="_blank" rel="noopener">link</a>` : ""}
        </div>
      </div>
      <div class="bg-tx-amount">${formatNumberIT(tx.amount, { decimals: 2, euro: true })}</div>
      <button class="bg-tx-del" data-action="del-tx" data-id="${escapeHtml(tx.id)}" aria-label="Elimina">✕</button>
    </div>
  `).join("");
  list.querySelectorAll('[data-action="del-tx"]').forEach(b => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onDeleteTx(b.dataset.id);
    });
  });
}

function formatTxDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"][d.getMonth()]}`;
}

function renderCloseButtons() {
  const closeBtn = document.getElementById("btn-close-month");
  const reopenBtn = document.getElementById("btn-reopen-month");
  const isClosed = !!state.budget.closed;
  const isCurrent = state.currentMonth === monthKey();
  // Mostra "Chiudi" solo se mese non chiuso (in qualunque mese, anche corrente)
  closeBtn.classList.toggle("hidden", isClosed);
  // Mostra "Riapri" solo se mese chiuso
  reopenBtn.classList.toggle("hidden", !isClosed);
}

// =============================================================================
// Handlers
// =============================================================================
async function onEditBudget() {
  const cur = state.budget.budget || 0;
  const input = prompt(`Budget per ${formatMonth(state.currentMonth)} (€):`, String(cur));
  if (input === null) return;
  const num = parseNumberIT(input);
  if (num === null || num < 0) { toast("Importo non valido", "error"); return; }
  try {
    await setMonthlyBudget(state.currentMonth, num);
    state.budget.budget = num;
    renderSummary();
    toast("✓ Budget aggiornato", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

function openTxModal() {
  document.getElementById("tx-label").value = "";
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("tx-link").value = "";
  document.getElementById("modal-tx").classList.remove("hidden");
  setTimeout(() => document.getElementById("tx-label").focus(), 100);
  refreshTxSaveEnabled();
}

function closeTxModal() {
  document.getElementById("modal-tx").classList.add("hidden");
}

function refreshTxSaveEnabled() {
  const lbl = document.getElementById("tx-label").value.trim();
  const amt = parseNumberIT(document.getElementById("tx-amount").value);
  document.getElementById("btn-tx-save").disabled = !(lbl && amt > 0);
}

async function onSaveTx() {
  const label = document.getElementById("tx-label").value.trim();
  const amount = parseNumberIT(document.getElementById("tx-amount").value);
  const date = document.getElementById("tx-date").value || new Date().toISOString().slice(0, 10);
  const link = document.getElementById("tx-link").value.trim() || null;
  if (!label || !amount) return;
  try {
    await addTransaction(state.currentMonth, { label, amount, date, link });
    closeTxModal();
    await load();
    toast("✓ Spesa aggiunta", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

async function onDeleteTx(txId) {
  if (!confirm("Eliminare questa spesa?")) return;
  try {
    await deleteTransaction(state.currentMonth, txId);
    await load();
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

function openCloseMonthModal() {
  const s = computeSummary(state.budget);
  const monthName = formatMonth(state.currentMonth);
  const nextName = formatMonth(nextMonthKey(state.currentMonth));

  let summaryHtml = `<div class="cm-stats">
    <div><span>Budget+rollover:</span><strong>${formatNumberIT(s.available, { decimals: 0, euro: true })}</strong></div>
    <div><span>Speso:</span><strong>${formatNumberIT(s.spent, { decimals: 2, euro: true })}</strong></div>
    <div class="cm-delta ${s.delta >= 0 ? 'is-positive' : 'is-negative'}">
      <span>${s.delta >= 0 ? "Avanzo" : "Sforamento"}:</span>
      <strong>${s.delta >= 0 ? "+" : "−"}${formatNumberIT(Math.abs(s.delta), { decimals: 2, euro: true })}</strong>
    </div>
  </div>`;

  let q;
  let rolloverLabel;
  if (s.delta > 0) {
    q = `Hai avanzato <strong>${formatNumberIT(s.delta, { decimals: 0, euro: true })}</strong> a ${monthName}. Cosa fai?`;
    rolloverLabel = `Aggiungi a ${nextName}`;
  } else if (s.delta < 0) {
    q = `Hai sforato di <strong>${formatNumberIT(Math.abs(s.delta), { decimals: 0, euro: true })}</strong>. Vuoi rifarteli su ${nextName}?`;
    rolloverLabel = `Sottrai da ${nextName}`;
  } else {
    q = `Bilancio in pari! Niente da rollare.`;
    rolloverLabel = `Chiudi senza rollover`;
  }

  document.getElementById("cm-summary").innerHTML = summaryHtml;
  document.getElementById("cm-question").innerHTML = q;
  document.getElementById("cm-rollover-label").textContent = rolloverLabel;
  document.getElementById("modal-close-month").classList.remove("hidden");
}

function closeCloseMonthModal() {
  document.getElementById("modal-close-month").classList.add("hidden");
}

async function onCloseMonth(action) {
  try {
    await closeMonth(state.currentMonth, action);
    closeCloseMonthModal();
    await load();
    toast(action === "rollover" ? "🔒 Mese chiuso · delta rollato" : "🔒 Mese chiuso · delta azzerato", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

// =============================================================================
// STATS — sezione storica collassabile
// =============================================================================
async function loadAndRenderStats() {
  const body = document.getElementById("bg-stats-body");
  body.innerHTML = `<div class="bg-summary-loading">⏳</div>`;
  try {
    const [allBudgets, items] = await Promise.all([
      listBudgets(),
      listItems().catch(() => []),
    ]);
    const stats = computeBudgetStats(allBudgets, items);
    renderStats(stats);
  } catch (err) {
    body.innerHTML = `<p class="bg-tx-empty">Errore caricamento statistiche</p>`;
  }
}

function renderStats(stats) {
  const body = document.getElementById("bg-stats-body");

  if (stats.monthly.length === 0) {
    body.innerHTML = `<p class="bg-tx-empty">Nessuno storico ancora — chiudi qualche mese e torna qui!</p>`;
    return;
  }

  // Mini grafico a barre degli ultimi 12 mesi
  const last12 = stats.monthly.slice(-12);
  const maxSpent = Math.max(...last12.map(m => m.spent), 1);
  const barsHtml = last12.map(m => {
    const h = Math.round((m.spent / maxSpent) * 100);
    const monthShort = m.month.slice(5) + "/" + m.month.slice(2, 4);
    return `<div class="bg-bar-col" title="${escapeHtml(m.month + ': ' + formatNumberIT(m.spent, { decimals: 0, euro: true }))}">
      <div class="bg-bar-track"><div class="bg-bar-fill" style="height:${h}%"></div></div>
      <span class="bg-bar-label">${escapeHtml(monthShort)}</span>
    </div>`;
  }).join("");

  // Top 3 mesi
  const topHtml = stats.topMonths.slice(0, 3).map((m, i) => {
    const medal = ["🥇", "🥈", "🥉"][i];
    return `<li>${medal} ${escapeHtml(formatMonth(m.month))} · <strong>${formatNumberIT(m.spent, { decimals: 0, euro: true })}</strong></li>`;
  }).join("");

  // Categoria breakdown (se disponibile)
  let catHtml = "";
  if (stats.categoryBreakdown && stats.categoryBreakdown.length > 0) {
    const totalCat = stats.categoryBreakdown.reduce((s, c) => s + c.total, 0);
    catHtml = `
      <h4 class="bg-stats-h4">Distribuzione per categoria</h4>
      <ul class="bg-cat-list">
        ${stats.categoryBreakdown.slice(0, 6).map(c => {
          const pct = totalCat > 0 ? Math.round((c.total / totalCat) * 100) : 0;
          return `<li>
            <span class="bg-cat-name">${escapeHtml(capitalize(c.cat))}</span>
            <span class="bg-cat-bar"><span class="bg-cat-fill" style="width:${pct}%"></span></span>
            <span class="bg-cat-total">${formatNumberIT(c.total, { decimals: 0, euro: true })}</span>
          </li>`;
        }).join("")}
      </ul>
    `;
  }

  body.innerHTML = `
    <div class="bg-stats-grid">
      <div class="bg-stats-card">
        <span class="bg-stats-label">Media ultimi 6 mesi</span>
        <span class="bg-stats-value">${formatNumberIT(stats.avg6, { decimals: 0, euro: true })}</span>
      </div>
      <div class="bg-stats-card">
        <span class="bg-stats-label">Spesa anno ${new Date().getFullYear()}</span>
        <span class="bg-stats-value">${formatNumberIT(stats.yearTotal, { decimals: 0, euro: true })}</span>
      </div>
      <div class="bg-stats-card">
        <span class="bg-stats-label">Budget rispettato</span>
        <span class="bg-stats-value">${stats.respectedPct == null ? "—" : stats.respectedPct + "%"}</span>
        ${stats.respectedCount > 0 ? `<small>${stats.respectedCount} ${stats.respectedCount === 1 ? "mese" : "mesi"} chiusi</small>` : ""}
      </div>
    </div>

    <h4 class="bg-stats-h4">Spesa ultimi 12 mesi</h4>
    <div class="bg-bars">${barsHtml}</div>

    ${stats.topMonths.length > 0 ? `
      <h4 class="bg-stats-h4">Mesi più costosi</h4>
      <ul class="bg-top-list">${topHtml}</ul>
    ` : ""}

    ${catHtml}
  `;
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

async function onReopenMonth() {
  if (!confirm("Riaprire questo mese? Eventuali rollover al mese successivo verranno sottratti.")) return;
  try {
    await reopenMonth(state.currentMonth);
    await load();
    toast("🔓 Mese riaperto", "success");
  } catch (err) {
    toast("Errore: " + err.message, "error");
  }
}

// =============================================================================
// Boot
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-prev-month").addEventListener("click", async () => {
    state.currentMonth = prevMonthKey(state.currentMonth);
    await load();
  });
  document.getElementById("btn-next-month").addEventListener("click", async () => {
    state.currentMonth = nextMonthKey(state.currentMonth);
    await load();
  });
  document.getElementById("btn-add-tx").addEventListener("click", openTxModal);
  document.getElementById("btn-tx-cancel").addEventListener("click", closeTxModal);
  document.getElementById("btn-tx-save").addEventListener("click", onSaveTx);
  document.getElementById("tx-label").addEventListener("input", refreshTxSaveEnabled);
  document.getElementById("tx-amount").addEventListener("input", (e) => {
    e.target.value = sanitizeNumericInput(e.target.value);
    refreshTxSaveEnabled();
  });
  document.getElementById("btn-close-month").addEventListener("click", openCloseMonthModal);
  document.getElementById("btn-cm-cancel").addEventListener("click", closeCloseMonthModal);
  document.getElementById("btn-cm-rollover").addEventListener("click", () => onCloseMonth("rollover"));
  document.getElementById("btn-cm-reset").addEventListener("click", () => onCloseMonth("reset"));
  document.getElementById("btn-reopen-month").addEventListener("click", onReopenMonth);

  // Stats toggle (lazy: carica solo al primo apri)
  const statsToggle = document.getElementById("btn-stats-toggle");
  let statsLoaded = false;
  statsToggle.addEventListener("click", async () => {
    const body = document.getElementById("bg-stats-body");
    const open = !body.classList.contains("hidden");
    body.classList.toggle("hidden", open);
    statsToggle.setAttribute("aria-expanded", String(!open));
    statsToggle.querySelector(".bg-stats-arrow").textContent = open ? "▼" : "▲";
    if (!open && !statsLoaded) {
      statsLoaded = true;
      await loadAndRenderStats();
    }
  });

  load();
});
