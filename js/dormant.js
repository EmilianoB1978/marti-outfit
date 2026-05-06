// =============================================================================
// Dormant items: capi non indossati da X giorni (default 60)
// =============================================================================
// Identifica i "pezzi morti" e propone azioni: indossali, archivia, vendi.
// =============================================================================

const DORMANT_THRESHOLD_DAYS = 60;

/** Ritorna gli item che non sono stati indossati da DORMANT_THRESHOLD_DAYS+ */
export function getDormantItems(items, thresholdDays = DORMANT_THRESHOLD_DAYS) {
  const now = Date.now();
  const cutoff = now - thresholdDays * 86400 * 1000;

  return items.filter(it => {
    const wears = it.wear_count || 0;
    if (wears === 0) {
      // Mai indossato: dormante se creato > threshold giorni fa
      const created = it.created_at?.toMillis?.() ?? Date.parse(it.created_at) ?? null;
      if (!created) return false;
      return created < cutoff;
    }
    if (it.last_worn_at) {
      const last = Date.parse(it.last_worn_at);
      return last < cutoff;
    }
    return false;
  });
}

/** Etichetta "indossato N volte, ultima volta DD/MM/YY" */
export function describeWear(item) {
  const wears = item.wear_count || 0;
  if (wears === 0) return "Mai indossato";
  if (item.last_worn_at) {
    const d = new Date(item.last_worn_at);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return `Ultima volta ${days}gg fa (${wears} usi)`;
  }
  return `Indossato ${wears} volte`;
}

/**
 * Esporta una lista di capi come CSV per Vinted/Subito/etc.
 * Colonne: subcategoria, colore, materiale, prezzo, link foto.
 */
export function exportToCSV(items) {
  const rows = [
    ["Categoria", "Sotto-categoria", "Colore", "Materiale", "Stile",
     "Prezzo €", "Foto URL", "Note"]
  ];
  const j = (v) => Array.isArray(v) ? v.join(", ") : (v || "");
  for (const it of items) {
    rows.push([
      it.category || "",
      it.subcategory || "",
      j(it.color_primary || it.color),
      j(it.material),
      it.style || "",
      it.price != null ? it.price.toFixed(2) : "",
      it.photo_url || "",
      it.description || it.notes || "",
    ]);
  }
  const csv = rows.map(r => r.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `capi-da-vendere-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeCsv(s) {
  const str = String(s ?? "");
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
