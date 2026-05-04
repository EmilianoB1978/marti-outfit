// =============================================================================
// Weather: integrazione Open-Meteo (gratuita, senza API key)
// =============================================================================
// API: https://open-meteo.com/
// Endpoint: GET /v1/forecast?latitude=...&longitude=...&current=temperature_2m,...
// Caching: lat/lon in localStorage, forecast cached 1 ora.
// =============================================================================

const API = "https://api.open-meteo.com/v1/forecast";
const CACHE_KEY_LOCATION = "marty_location";
const CACHE_KEY_FORECAST = "marty_forecast";
const FORECAST_TTL_MS = 60 * 60 * 1000;  // 1 ora

/** Ritorna {lat, lon, label} dalla cache o null. */
export function getCachedLocation() {
  try {
    const raw = localStorage.getItem(CACHE_KEY_LOCATION);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Salva location nella cache. */
export function setCachedLocation(loc) {
  localStorage.setItem(CACHE_KEY_LOCATION, JSON.stringify(loc));
}

/** Cancella la cache della location. */
export function clearCachedLocation() {
  localStorage.removeItem(CACHE_KEY_LOCATION);
  localStorage.removeItem(CACHE_KEY_FORECAST);
}

/**
 * Chiede la geolocalizzazione al browser. Risolve con {lat, lon} o reject.
 * Usa watchPosition con timeout corto (10s).
 */
export function requestGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalizzazione non supportata"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        label: "La mia posizione",
      }),
      err => reject(err),
      { timeout: 10000, maximumAge: 60 * 60 * 1000 }
    );
  });
}

/**
 * Geocoding semplice (Open-Meteo geocoding API).
 * @param {string} cityName - es. "Roma" o "Milano"
 * @returns {Promise<{lat, lon, label}>}
 */
export async function geocode(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=it&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Errore geocoding");
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`Citta' "${cityName}" non trovata`);
  }
  const r = data.results[0];
  return {
    lat: r.latitude,
    lon: r.longitude,
    label: `${r.name}${r.country ? ', ' + r.country : ''}`,
  };
}

/**
 * Recupera il forecast (current + giorno) per una location.
 * Usa cache locale di 1 ora.
 * @returns {Promise<{current, daily, location}>}
 */
export async function getForecast(location) {
  // Check cache
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY_FORECAST) || "null");
    if (cached
        && cached.location?.lat === location.lat
        && cached.location?.lon === location.lon
        && (Date.now() - cached.fetchedAt) < FORECAST_TTL_MS) {
      return cached;
    }
  } catch {}

  // Fetch da Open-Meteo
  const params = new URLSearchParams({
    latitude: location.lat,
    longitude: location.lon,
    current: "temperature_2m,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    timezone: "auto",
    forecast_days: 1,
  });

  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error("Errore Open-Meteo");
  const data = await res.json();

  const result = {
    location,
    current: {
      temp:        data.current.temperature_2m,
      weatherCode: data.current.weather_code,
      windSpeed:   data.current.wind_speed_10m,
      isDay:       data.current.is_day === 1,
    },
    daily: {
      max:           data.daily.temperature_2m_max[0],
      min:           data.daily.temperature_2m_min[0],
      precipitation: data.daily.precipitation_sum[0],
      weatherCode:   data.daily.weather_code[0],
    },
    fetchedAt: Date.now(),
  };

  localStorage.setItem(CACHE_KEY_FORECAST, JSON.stringify(result));
  return result;
}

/** Mappa weather_code WMO -> emoji + descrizione italiana. */
export function describeWeatherCode(code, isDay = true) {
  const map = {
    0:  { emoji: isDay ? "☀️" : "🌙", label: "Sereno" },
    1:  { emoji: isDay ? "🌤️" : "🌙", label: "Per lo piu' sereno" },
    2:  { emoji: "⛅", label: "Parzialmente nuvoloso" },
    3:  { emoji: "☁️", label: "Coperto" },
    45: { emoji: "🌫️", label: "Nebbia" },
    48: { emoji: "🌫️", label: "Nebbia gelata" },
    51: { emoji: "🌦️", label: "Pioviggine leggera" },
    53: { emoji: "🌦️", label: "Pioviggine moderata" },
    55: { emoji: "🌧️", label: "Pioviggine intensa" },
    61: { emoji: "🌦️", label: "Pioggia leggera" },
    63: { emoji: "🌧️", label: "Pioggia moderata" },
    65: { emoji: "🌧️", label: "Pioggia forte" },
    71: { emoji: "🌨️", label: "Neve leggera" },
    73: { emoji: "🌨️", label: "Neve moderata" },
    75: { emoji: "❄️", label: "Neve forte" },
    77: { emoji: "🌨️", label: "Granelli di neve" },
    80: { emoji: "🌦️", label: "Rovesci leggeri" },
    81: { emoji: "🌧️", label: "Rovesci moderati" },
    82: { emoji: "⛈️", label: "Rovesci forti" },
    85: { emoji: "🌨️", label: "Rovesci di neve leggeri" },
    86: { emoji: "❄️", label: "Rovesci di neve forti" },
    95: { emoji: "⛈️", label: "Temporale" },
    96: { emoji: "⛈️", label: "Temporale con grandine" },
    99: { emoji: "⛈️", label: "Temporale forte con grandine" },
  };
  return map[code] || { emoji: "❓", label: "Sconosciuto" };
}

/** Costruisce una stringa breve da iniettare nel prompt Claude. */
export function buildWeatherContext(forecast) {
  if (!forecast) return "";
  const desc = describeWeatherCode(forecast.daily.weatherCode);
  return `Meteo oggi: ${desc.label}, ${forecast.daily.min.toFixed(0)}-${forecast.daily.max.toFixed(0)}°C${forecast.daily.precipitation > 0 ? ', precipitazioni ' + forecast.daily.precipitation.toFixed(1) + 'mm' : ''}.`;
}
