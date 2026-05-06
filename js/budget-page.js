// =============================================================================
// Budget — pagina mensile + transazioni + chiusura con rollover
// =============================================================================

import * as Theme from "./theme/manager.js";
import {
  monthKey, prevMonthKey, nextMonthKey, formatMonth,
  getBudget, ensureBudget, setMonthlyBudget, addTransaction, deleteTransaction,
  closeMonth, reopenMonth, computeSummary,
} from "./budget-data.js";
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

function renderSummary() {
  const b = state.budget;
  const s = computeSummary(b);
  const isClosed = !!b.closed;

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
  load();
});
