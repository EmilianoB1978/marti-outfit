// =============================================================================
// Italian number/currency formatting
// =============================================================================
// 1234.5 -> "1.234,50"
// "1.234,50" -> 1234.5
// =============================================================================

/**
 * Formatta un numero in stile italiano: 1.000,00.
 * @param {number|null|undefined} n
 * @param {object} [opt]
 * @param {number} [opt.decimals=2]
 * @param {boolean} [opt.euro=false] aggiunge prefisso "€ "
 * @returns {string} stringa formattata, "" se input vuoto/non numerico
 */
export function formatNumberIT(n, opt = {}) {
  if (n === null || n === undefined || n === "") return "";
  const num = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(num)) return "";
  const decimals = opt.decimals ?? 2;
  const formatted = num.toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return opt.euro ? `€ ${formatted}` : formatted;
}

/**
 * Versione compatta: "€ 1.234" senza decimali (per stat card).
 */
export function formatEuroITCompact(n) {
  return formatNumberIT(n, { decimals: 0, euro: true });
}

/**
 * Versione full: "€ 1.234,50".
 */
export function formatEuroIT(n) {
  return formatNumberIT(n, { decimals: 2, euro: true });
}

/**
 * Converte stringa formato italiano a numero JS.
 * Accetta entrambi i formati durante l'input:
 *   "1.234,50"   -> 1234.5
 *   "1234,50"    -> 1234.5
 *   "1234.50"    -> 1234.5  (fallback US per chi digita male)
 *   "1234"       -> 1234
 *   ""           -> null
 *   "abc"        -> null
 *
 * Logica: l'ultima virgola O l'ultimo punto sono il separatore decimale.
 * Le altre occorrenze di . o , sono separatori migliaia e si rimuovono.
 */
export function parseNumberIT(s) {
  if (s === null || s === undefined) return null;
  const str = String(s).trim().replace(/[\s€]/g, "");
  if (!str) return null;

  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  let cleaned;

  if (lastComma === -1 && lastDot === -1) {
    cleaned = str;
  } else if (lastComma > lastDot) {
    // virgola e' il decimale, eliminare punti (separatori migliaia)
    cleaned = str.replace(/\./g, "").replace(",", ".");
  } else if (lastComma === -1) {
    // SOLO punto/i, niente virgola.
    // Heuristica per ambiguita' "1.000" (italiano = 1000) vs "12.5" (US = 12.5):
    //  - se ci sono >= 2 punti -> sicuramente migliaia (es. "1.234.567")
    //  - se 1 solo punto seguito da esattamente 3 cifre -> migliaia (es. "1.000")
    //  - altrimenti -> decimale US (es. "12.5", "0.99")
    const dotCount = (str.match(/\./g) || []).length;
    const afterLastDot = str.substring(lastDot + 1);
    const isThousand = dotCount >= 2 || (dotCount === 1 && afterLastDot.length === 3 && /^\d{3}$/.test(afterLastDot));
    cleaned = isThousand ? str.replace(/\./g, "") : str;
  } else {
    // virgola E punto presenti, ma punto e' dopo la virgola (poco comune):
    // tratto punto come decimale, virgola come migliaia
    cleaned = str.replace(/,/g, "");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Sanifica un input mentre l'utente digita: tiene solo cifre, punti, virgole.
 */
export function sanitizeNumericInput(str) {
  return String(str || "").replace(/[^\d.,]/g, "");
}
