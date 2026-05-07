// =============================================================================
// Armocromia Wrapped: immagine 1080x1080 condivisibile della tua stagione
// + statistiche guardaroba + palette. Pattern Trip/Diary Wrapped.
// =============================================================================

export async function openArmoWrapped({ season, stats, items, gaps }) {
  const overlay = document.createElement("div");
  overlay.id = "armo-wrapped-overlay";
  overlay.className = "armo-wrapped-overlay";
  overlay.innerHTML = `
    <div class="armo-wrapped-modal">
      <header class="armo-wrapped-header">
        <button class="btn-icon" id="armo-wrapped-close" aria-label="Chiudi">✕</button>
        <h2>Armocromia Wrapped</h2>
        <span></span>
      </header>
      <div class="armo-wrapped-body">
        <p class="armo-wrapped-loading">⏳ Sto preparando il tuo Wrapped...</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#armo-wrapped-close").addEventListener("click", close);
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  try {
    const blob = await buildWrappedBlob(season, stats, items, gaps);
    const url = URL.createObjectURL(blob);
    overlay.querySelector(".armo-wrapped-body").innerHTML = `
      <img class="armo-wrapped-image" src="${url}" alt="Armocromia Wrapped" />
      <div class="armo-wrapped-actions">
        <button class="btn btn-gold btn--block" id="armo-wrapped-share">📤 Condividi</button>
        <button class="btn btn-ghost btn--block" id="armo-wrapped-download" style="margin-top:8px;">💾 Salva immagine</button>
      </div>
    `;
    overlay.querySelector("#armo-wrapped-share").addEventListener("click", async () => {
      try {
        const file = new File([blob], `armocromia-wrapped.png`, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Armocromia Wrapped — ${season.name}` });
        } else {
          downloadBlob(blob, "armocromia-wrapped.png");
        }
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      }
    });
    overlay.querySelector("#armo-wrapped-download").addEventListener("click", () => {
      downloadBlob(blob, "armocromia-wrapped.png");
    });
  } catch (err) {
    console.error(err);
    overlay.querySelector(".armo-wrapped-body").innerHTML =
      `<p style="text-align:center;padding:40px;color:#ef4444">❌ Errore: ${err.message}</p>`;
  }
}

// =============================================================================
// Canvas 1080x1080 con palette, stats e branding
// =============================================================================
async function buildWrappedBlob(season, stats, items, gaps) {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Sfondo: gradient ricco basato sui primi 3 colori della palette
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0,    season.palette[0] || "#1a1a1a");
  grad.addColorStop(0.5, mix(season.palette[1] || "#2a2a2a", "#1a1a1a", 0.5));
  grad.addColorStop(1,    season.palette[2] || "#0a0a0a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Overlay scuro per dare contrasto
  ctx.fillStyle = "rgba(15, 10, 20, 0.55)";
  ctx.fillRect(0, 0, W, H);

  // Sfere decorative
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.beginPath(); ctx.arc(W * 0.15, H * 0.2, 200, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.beginPath(); ctx.arc(W * 0.88, H * 0.85, 280, 0, Math.PI * 2); ctx.fill();

  // === HEADER ===
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🎨 ARMOCROMIA WRAPPED", W / 2, 90);

  // === STAGIONE ===
  ctx.font = "120px -apple-system, system-ui, sans-serif";
  ctx.fillText(season.emoji, W / 2, 220);

  ctx.font = "bold 64px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(season.name, W / 2, 310);

  ctx.font = "500 22px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText(season.family, W / 2, 350);

  // === PALETTE (8 cerchi) ===
  const swatchSize = 84;
  const swatchGap = 14;
  const swatchTotal = 8 * swatchSize + 7 * swatchGap;
  const swatchStartX = (W - swatchTotal) / 2;
  const swatchY = 410;
  for (let i = 0; i < 8; i++) {
    const hex = season.palette[i] || season.palette[0];
    const cx = swatchStartX + i * (swatchSize + swatchGap) + swatchSize / 2;
    // Ombra
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath(); ctx.arc(cx, swatchY + swatchSize / 2 + 4, swatchSize / 2, 0, Math.PI * 2); ctx.fill();
    // Cerchio colore
    ctx.fillStyle = hex;
    ctx.beginPath(); ctx.arc(cx, swatchY + swatchSize / 2, swatchSize / 2, 0, Math.PI * 2); ctx.fill();
    // Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath(); ctx.arc(cx - 12, swatchY + swatchSize / 2 - 12, 14, 0, Math.PI * 2); ctx.fill();
    // Bordo bianco sottile
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, swatchY + swatchSize / 2, swatchSize / 2, 0, Math.PI * 2); ctx.stroke();
  }

  // === STATS GUARDAROBA ===
  if (stats && stats.applicable > 0) {
    const statsY = 600;
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    roundRect(ctx, 90, statsY, W - 180, 200, 22);
    ctx.fill();

    // Big % in palette
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 110px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${stats.percent}%`, W / 2, statsY + 110);

    ctx.font = "500 22px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillText("DEL TUO GUARDAROBA È IN PALETTE", W / 2, statsY + 145);

    // Breakdown
    ctx.font = "500 18px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.fillText(
      `${stats.in} perfetti  ·  ${stats.near} vicini  ·  ${stats.out + stats.avoid} fuori`,
      W / 2, statsY + 180
    );
  }

  // === GAP TEASER (se presenti) ===
  if (gaps && gaps.length > 0) {
    const gapY = 850;
    ctx.fillStyle = "rgba(255, 215, 100, 0.12)";
    roundRect(ctx, 90, gapY, W - 180, 100, 18);
    ctx.fill();

    ctx.font = "bold 22px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "#fcd34d";
    ctx.textAlign = "center";
    ctx.fillText("🛍️ CATEGORIE DA RINFORZARE", W / 2, gapY + 38);

    ctx.font = "500 18px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    const gapText = gaps.slice(0, 3).map(g => `${g.icon} ${g.label}`).join("   ·   ");
    ctx.fillText(gapText, W / 2, gapY + 72);
  }

  // === FOOTER ===
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "500 20px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("📔 Marty Outfit", W / 2, 1020);

  return await new Promise(resolve => canvas.toBlob(b => resolve(b), "image/png"));
}

// =============================================================================
// Helpers
// =============================================================================
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function mix(hex1, hex2, ratio) {
  const a = parseHex(hex1), b = parseHex(hex2);
  if (!a || !b) return hex1;
  const r = Math.round(a[0] * (1 - ratio) + b[0] * ratio);
  const g = Math.round(a[1] * (1 - ratio) + b[1] * ratio);
  const bl = Math.round(a[2] * (1 - ratio) + b[2] * ratio);
  return "#" + [r, g, bl].map(n => n.toString(16).padStart(2, "0")).join("");
}

function parseHex(hex) {
  const m = hex.replace("#", "").match(/.{1,2}/g);
  if (!m || m.length !== 3) return null;
  return m.map(x => parseInt(x, 16));
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
