// =============================================================================
// Viaggi — pagina lista + entry point
// =============================================================================
// Stato attuale: scaffold con empty state. Modello dati Trip + wizard creazione
// + generatore valigia arriveranno in iterazioni successive.
// =============================================================================

import * as Theme from "./theme/manager.js";

Theme.init();

function toast(msg, type = "default") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show " + type;
  setTimeout(() => { el.className = "toast hidden"; }, 2400);
}

function newTripPlaceholder() {
  toast("La creazione viaggi arriva nei prossimi update — la base e' gia' qui ✈️", "default");
}

document.addEventListener("DOMContentLoaded", () => {
  const btnTop   = document.getElementById("btn-new-trip");
  const btnEmpty = document.getElementById("btn-new-trip-empty");
  if (btnTop)   btnTop.addEventListener("click", newTripPlaceholder);
  if (btnEmpty) btnEmpty.addEventListener("click", newTripPlaceholder);
});
