// =============================================================================
// Haptic feedback helper
// =============================================================================
// Usa navigator.vibrate quando supportato (Android, alcuni browser).
// Su iOS Safari e' un no-op (l'API non e' supportata, ma non da' errore).
// =============================================================================

const SUPPORTED = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/**
 * Vibrazione leggera (10ms): feedback per tap di conferma (save, mark worn).
 */
export function tap() {
  if (SUPPORTED) navigator.vibrate(10);
}

/**
 * Vibrazione doppia (10-50-10ms): feedback per azione importante (delete, errore).
 */
export function pulse() {
  if (SUPPORTED) navigator.vibrate([10, 50, 10]);
}

/**
 * Vibrazione di successo (3 colpetti rapidi).
 */
export function success() {
  if (SUPPORTED) navigator.vibrate([15, 30, 15, 30, 15]);
}
