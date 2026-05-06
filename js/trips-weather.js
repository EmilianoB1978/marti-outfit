// =============================================================================
// Trip Weather: forecast attuale (16gg) + storico (medie 3 anni stesso mese)
// =============================================================================
// Open-Meteo API (gratis, no key).
// - Forecast:        api.open-meteo.com/v1/forecast (1-16 giorni nel futuro)
// - Historical:      archive-api.open-meteo.com/v1/archive (dal 1940)
// =============================================================================

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL  = "https://archive-api.open-meteo.com/v1/archive";

/**
 * Forecast giornaliero per le date del viaggio. Funziona se start_date e'
 * entro 16 giorni dal "now". Oltre, usa fetchHistoricalAverage.
 *
 * @returns {Promise<{daily: [{date, tmin, tmax, precipitation, uv_max, weather_code}], source: 'forecast'}>}
 */
export async function fetchForecast(lat, lon, startISO, endISO) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,uv_index_max,weather_code,apparent_temperature_max,apparent_temperature_min",
    timezone: "auto",
    start_date: startISO,
    end_date: endISO,
  });
  const r = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if (!r.ok) throw new Error(`Forecast ${r.status}`);
  const data = await r.json();
  return normalizeDaily(data, "forecast");
}

/**
 * Media storica per un mese specifico (es. "giugno" -> ultimi 3 anni stesso
 * mese): utile quando il viaggio e' >16 giorni nel futuro.
 *
 * @param {number} monthIndex 0-11 (gennaio=0)
 * @returns {Promise<{historical: {tmin_avg, tmax_avg, precip_avg, rain_days_avg, uv_avg}, source: 'historical'}>}
 */
export async function fetchHistoricalAverage(lat, lon, monthIndex) {
  const now = new Date();
  const Y = now.getFullYear();
  // 3 anni precedenti, stesso mese
  const years = [Y - 1, Y - 2, Y - 3];
  const months = String(monthIndex + 1).padStart(2, "0");

  const responses = await Promise.all(years.map(year => {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const start = `${year}-${months}-01`;
    const end   = `${year}-${months}-${String(lastDay).padStart(2, "0")}`;
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lon,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,uv_index_max",
      timezone: "auto",
      start_date: start,
      end_date: end,
    });
    return fetch(`${ARCHIVE_URL}?${params.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }));

  // Aggrega tutte le giornate dei 3 anni e calcola medie
  const all = { tmax: [], tmin: [], precip: [], rainHours: [], uv: [] };
  for (const data of responses) {
    if (!data || !data.daily) continue;
    const d = data.daily;
    (d.temperature_2m_max || []).forEach(v => v != null && all.tmax.push(v));
    (d.temperature_2m_min || []).forEach(v => v != null && all.tmin.push(v));
    (d.precipitation_sum  || []).forEach(v => v != null && all.precip.push(v));
    (d.precipitation_hours || []).forEach(v => v != null && all.rainHours.push(v));
    (d.uv_index_max       || []).forEach(v => v != null && all.uv.push(v));
  }

  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const rainDays = all.precip.filter(v => v >= 1).length;
  const totalDays = all.precip.length;
  const rainPct = totalDays > 0 ? rainDays / totalDays : 0;

  return {
    source: "historical",
    historical: {
      tmin_avg:    round1(avg(all.tmin)),
      tmax_avg:    round1(avg(all.tmax)),
      precip_avg:  round1(avg(all.precip)),
      uv_avg:      round1(avg(all.uv)),
      rain_pct:    round2(rainPct),
      rain_days_per_month: Math.round(rainPct * 30),  // estrapolato a mese 30gg
    },
  };
}

/**
 * Helper "smart": sceglie automaticamente se usare forecast o historical
 * in base alla distanza temporale. Salva il risultato cosi' lo riutilizziamo.
 */
export async function fetchTripWeather(trip) {
  if (!trip || !trip.destination?.lat || !trip.start_date) return null;
  const today = new Date();
  const start = new Date(trip.start_date + "T00:00:00");
  const daysAhead = Math.round((start - today) / 86400000);

  if (daysAhead <= 16 && daysAhead >= -1 && trip.end_date) {
    try {
      return await fetchForecast(trip.destination.lat, trip.destination.lon, trip.start_date, trip.end_date);
    } catch (e) { /* fallback a historical */ }
  }
  // Historical (medie del mese)
  return await fetchHistoricalAverage(
    trip.destination.lat,
    trip.destination.lon,
    new Date(trip.start_date + "T00:00:00").getMonth()
  );
}

// =============================================================================
// Internals
// =============================================================================
function normalizeDaily(data, source) {
  if (!data || !data.daily || !data.daily.time) return { daily: [], source };
  const d = data.daily;
  const out = [];
  for (let i = 0; i < d.time.length; i++) {
    out.push({
      date:           d.time[i],
      tmin:           round1(d.temperature_2m_min?.[i]),
      tmax:           round1(d.temperature_2m_max?.[i]),
      apparent_min:   round1(d.apparent_temperature_min?.[i]),
      apparent_max:   round1(d.apparent_temperature_max?.[i]),
      precipitation:  round1(d.precipitation_sum?.[i]),
      precip_hours:   d.precipitation_hours?.[i],
      uv_max:         round1(d.uv_index_max?.[i]),
      weather_code:   d.weather_code?.[i],
    });
  }
  return { daily: out, source };
}

function round1(n) { return n == null || isNaN(n) ? null : Math.round(n * 10) / 10; }
function round2(n) { return n == null || isNaN(n) ? null : Math.round(n * 100) / 100; }

// WMO weather codes -> emoji (set ridotto)
export function weatherEmoji(code) {
  if (code == null) return "🌤";
  if (code === 0) return "☀️";
  if (code <= 3)  return "⛅";
  if (code <= 48) return "🌫";
  if (code <= 67) return "🌧";
  if (code <= 77) return "🌨";
  if (code <= 82) return "🌧";
  if (code <= 86) return "🌨";
  return "⛈";
}
