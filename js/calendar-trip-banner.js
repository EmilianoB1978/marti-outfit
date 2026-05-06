// =============================================================================
// Calendar — banner "prossimo viaggio" in cima
// =============================================================================
// Trova il viaggio piu' imminente (status != frozen, end >= oggi) e lo
// mostra come card cliccabile gradient oro. Aggiorna live il countdown.
// =============================================================================

import { listTrips, formatTripDates } from "./trips-data.js";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function countryFlag(code) {
  if (!code || code.length !== 2) return "✈️";
  const A = 0x1F1E6, base = "A".charCodeAt(0);
  const c = code.toUpperCase();
  return String.fromCodePoint(A + (c.charCodeAt(0) - base)) +
         String.fromCodePoint(A + (c.charCodeAt(1) - base));
}

function pickNextTrip(trips, today) {
  // Priorita': in corso > prossimo (start futuro) > nessuno
  const active = trips.find(t => t.status !== "frozen" && t.start_date && t.end_date &&
                                 t.start_date <= today && t.end_date >= today);
  if (active) return { trip: active, kind: "active" };

  const upcoming = trips
    .filter(t => t.status !== "frozen" && t.start_date && t.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (upcoming) return { trip: upcoming, kind: "upcoming" };

  return null;
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function render() {
  const card = document.getElementById("next-trip-card");
  if (!card) return;

  listTrips().then(trips => {
    const today = todayISO();
    const found = pickNextTrip(trips, today);
    if (!found) { card.classList.add("hidden"); return; }

    const { trip, kind } = found;
    card.href = `./trip-detail.html?id=${encodeURIComponent(trip.id)}`;
    document.getElementById("next-trip-flag").textContent = countryFlag(trip.destination?.country_code);
    document.getElementById("next-trip-name").textContent = trip.name || trip.destination?.name || "Viaggio";
    document.getElementById("next-trip-meta").textContent =
      `${trip.destination?.name || ""} · ${formatTripDates(trip.start_date, trip.end_date)}`;

    const eyebrow = document.getElementById("next-trip-eyebrow");
    const cd = document.getElementById("next-trip-countdown");

    if (kind === "active") {
      eyebrow.textContent = "Sei in viaggio";
      const dayN = daysBetween(trip.start_date, today) + 1;
      const totDays = trip.days || (daysBetween(trip.start_date, trip.end_date) + 1);
      cd.innerHTML = `<span class="ntc-num">${dayN}</span><span class="ntc-tot">/${totDays}</span><span class="ntc-lbl">giorno</span>`;
    } else {
      eyebrow.textContent = "Prossimo viaggio";
      const days = daysBetween(today, trip.start_date);
      if (days === 0) {
        cd.innerHTML = `<span class="ntc-num">OGGI!</span>`;
      } else if (days === 1) {
        cd.innerHTML = `<span class="ntc-num">DOMANI</span>`;
      } else {
        cd.innerHTML = `<span class="ntc-num">−${days}</span><span class="ntc-lbl">giorni</span>`;
      }
    }
    card.classList.remove("hidden");
  }).catch(err => {
    console.warn("Banner viaggio:", err);
    card.classList.add("hidden");
  });
}

document.addEventListener("DOMContentLoaded", render);
