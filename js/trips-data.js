// =============================================================================
// Trips: modello Trip + CRUD Firestore + helper Open-Meteo Geocoding
// =============================================================================
// Collection Firestore: 'trips' (singolo utente, no auth filter — single user).
// =============================================================================

import {
  db, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from "./firebase-config.js";

const COLLECTION = "trips";

// =============================================================================
// Modello Trip (riferimento, non enforced)
// =============================================================================
// {
//   id: auto,
//   name:        "Roma giugno 2026",       // user-edited
//   destination: { name, country_code, country, lat, lon, timezone, population, admin1 },
//   start_date:  "2026-06-15",             // YYYY-MM-DD
//   end_date:    "2026-06-20",
//   days:        6,                        // computed
//   occasions:   ["business","cena"],       // tag chip
//   status:      "planning|active|done|frozen",
//   laundry_available: false,              // toggle utente
//   thermal_offset: 0,                     // -3..+3 °C, profilo termico
//   outfits_by_day: { "2026-06-15": outfit_id, ... },
//   packed_items:  [item_id, ...],
//   notes:         "",
//   created_at:    timestamp,
//   updated_at:    timestamp,
// }
// =============================================================================

export const OCCASION_OPTIONS = [
  { key: "business",   icon: "💼", label: "Business" },
  { key: "casual",     icon: "👟", label: "Casual" },
  { key: "cena",       icon: "🍷", label: "Cena fuori" },
  { key: "cerimonia",  icon: "💒", label: "Cerimonia" },
  { key: "mare",       icon: "🏖️", label: "Mare" },
  { key: "montagna",   icon: "⛰️", label: "Montagna" },
  { key: "sport",      icon: "🏃", label: "Sport" },
  { key: "citta",      icon: "🏙️", label: "Visita città" },
  { key: "avventura",  icon: "🎒", label: "Avventura" },
  { key: "relax",      icon: "🧖", label: "Relax/Spa" },
];

// =============================================================================
// CRUD
// =============================================================================
export async function listTrips() {
  const q = query(collection(db, COLLECTION), orderBy("start_date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getTrip(id) {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function createTrip(data) {
  const days = computeDays(data.start_date, data.end_date);
  const payload = {
    name:               data.name || `${data.destination?.name || "Viaggio"} ${formatMonth(data.start_date)}`,
    destination:        data.destination || null,
    start_date:         data.start_date,
    end_date:           data.end_date,
    days,
    occasions:          Array.isArray(data.occasions) ? data.occasions : [],
    status:             "planning",
    laundry_available:  !!data.laundry_available,
    thermal_offset:     Number(data.thermal_offset) || 0,
    outfits_by_day:     {},
    packed_items:       [],
    notes:              data.notes || "",
    created_at:         serverTimestamp(),
    updated_at:         serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), payload);
  return { id: ref.id, ...payload };
}

export async function updateTrip(id, partial) {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { ...partial, updated_at: serverTimestamp() });
}

export async function deleteTrip(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}

// =============================================================================
// Helpers
// =============================================================================
function computeDays(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

const MONTHS_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
function formatMonth(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return MONTHS_IT[d.getMonth()] + " " + d.getFullYear();
}

export function formatTripDates(startISO, endISO) {
  if (!startISO || !endISO) return "";
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameYear = s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${s.getDate()}–${e.getDate()} ${MONTHS_IT[e.getMonth()]} ${e.getFullYear()}`;
  }
  if (sameYear) {
    return `${s.getDate()} ${MONTHS_IT[s.getMonth()]} – ${e.getDate()} ${MONTHS_IT[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${MONTHS_IT[s.getMonth()]} ${s.getFullYear()} – ${e.getDate()} ${MONTHS_IT[e.getMonth()]} ${e.getFullYear()}`;
}

// =============================================================================
// Open-Meteo Geocoding API (gratis, no key)
// https://open-meteo.com/en/docs/geocoding-api
// =============================================================================
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Cerca destinazioni per nome città. Ritorna max 'count' risultati.
 * @param {string} q - query es. "Tokyo", "Roma"
 * @param {number} count - default 5
 */
export async function searchDestinations(q, count = 6) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=${count}&language=it&format=json`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).map(normalizeDestination);
  } catch {
    return [];
  }
}

function normalizeDestination(raw) {
  return {
    name:         raw.name,
    country_code: raw.country_code,
    country:      raw.country,
    lat:          raw.latitude,
    lon:          raw.longitude,
    elevation:    raw.elevation,
    timezone:     raw.timezone,
    population:   raw.population,
    admin1:       raw.admin1 || null,   // regione/stato (es. "Lazio")
  };
}
