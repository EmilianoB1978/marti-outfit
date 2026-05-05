// =============================================================================
// Color palette extraction (k-means clustering, no AI)
// =============================================================================
// Algoritmo: k-means su pixel ridotti dell'immagine -> trova K colori dominanti.
// Distance: Euclidea in spazio RGB (semplice, sufficiente per match outfit).
// =============================================================================

const SAMPLE_SIZE = 100;     // resize a 100x100 = 10000 pixel
const ITERATIONS = 12;
const DEFAULT_K = 5;

/** Converti RGB → hex */
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, "0")).join("");
}

/** Converti hex → [r, g, b] */
export function hexToRgb(hex) {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/** Distanza Euclidea fra due colori RGB (0-441 max) */
export function colorDistance(c1, c2) {
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return Math.sqrt(dr*dr + dg*dg + db*db);
}

/** Carica un'immagine da URL come <img> */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Carica i pixel da un'immagine (Image o File) ridimensionata. */
async function getPixels(input) {
  let img;
  if (input instanceof Blob || input instanceof File) {
    const url = URL.createObjectURL(input);
    img = await loadImage(url);
    URL.revokeObjectURL(url);
  } else if (typeof input === "string") {
    img = await loadImage(input);
  } else {
    img = input;
  }

  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const data = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;

  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 128) continue;  // skip pixel trasparenti
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Skip pixel quasi neri o quasi bianchi (probabili sfondi)
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 18) continue;     // troppo nero
    if (min > 245) continue;    // troppo bianco
    pixels.push([r, g, b]);
  }
  return pixels;
}

/** Initial centroids: prendo K pixel "spread" via random sampling */
function initCentroids(pixels, k) {
  const centroids = [];
  const used = new Set();
  while (centroids.length < k && used.size < pixels.length) {
    const idx = Math.floor(Math.random() * pixels.length);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push([...pixels[idx]]);
  }
  return centroids;
}

/**
 * K-means clustering. Ritorna array di {color [r,g,b], hex, count, percentage}
 * ordinato per dominanza (count DESC).
 */
export async function extractPalette(input, k = DEFAULT_K) {
  const pixels = await getPixels(input);
  if (pixels.length === 0) return [];

  let centroids = initCentroids(pixels, k);
  let assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Assegna ogni pixel al centroide piu' vicino
    for (let i = 0; i < pixels.length; i++) {
      let bestK = 0, bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = colorDistance(pixels[i], centroids[c]);
        if (d < bestDist) { bestDist = d; bestK = c; }
      }
      assignments[i] = bestK;
    }

    // Aggiorna centroidi come media dei pixel assegnati
    const sums = centroids.map(() => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }
    centroids = sums.map((s, c) => counts[c] > 0
      ? [s[0]/counts[c], s[1]/counts[c], s[2]/counts[c]]
      : centroids[c]);
  }

  // Conta finale + ordina per dominanza
  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;
  const total = pixels.length;

  return centroids.map((c, i) => ({
    rgb: [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])],
    hex: rgbToHex(c[0], c[1], c[2]),
    count: counts[i],
    percentage: (counts[i] / total) * 100,
  })).sort((a, b) => b.count - a.count);
}

/**
 * Calcola il "match score" tra una palette target e una palette di un capo.
 * Score in 0..100: 100 = match perfetto, 0 = colori opposti.
 *
 * Per ogni colore della palette target, trova il piu' simile nel capo
 * e somma le distanze (pesate per dominanza). Score = 100 - normalizzato.
 */
export function paletteMatchScore(target, itemPalette) {
  if (!target || !itemPalette || itemPalette.length === 0) return 0;
  let totalWeightedDist = 0;
  let totalWeight = 0;

  for (const tColor of target) {
    let bestDist = Infinity;
    for (const iColor of itemPalette) {
      const d = colorDistance(tColor.rgb, iColor.rgb);
      if (d < bestDist) bestDist = d;
    }
    const weight = tColor.percentage / 100;
    totalWeightedDist += bestDist * weight;
    totalWeight += weight;
  }
  const avgDist = totalWeightedDist / (totalWeight || 1);
  // 441 e' la distanza max in RGB. Normalizzo a 100.
  return Math.max(0, Math.round(100 - (avgDist / 441) * 100));
}
