// =============================================================================
// Onboarding: 3 slide al primo avvio
// =============================================================================

const STORAGE_KEY = "marty_onboarded_v1";

const SLIDES = [
  {
    icon: "👕",
    title: "Aggiungi i tuoi capi",
    body: "Scatta una foto a ogni capo del tuo guardaroba. L'AI analizza categoria, colore, stile in pochi secondi. Tu rifinisci se vuoi.",
  },
  {
    icon: "🎨",
    title: "Personalizza l'app",
    body: "10 temi pronti, 4 famiglie di font, slider per forme e densità. Marty si adatta al TUO gusto, non viceversa.",
  },
  {
    icon: "✨",
    title: "Ricevi outfit perfetti",
    body: "Scrivi l'occasione (es. \"cena formale\") e l'AI ti propone 2-3 outfit completi dal tuo guardaroba. Considera anche meteo e formalità.",
  },
];

/** Mostra il tour. force=true = bypassa flag localStorage. */
export function showOnboarding(force = false) {
  if (!force && localStorage.getItem(STORAGE_KEY) === "1") return;

  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  overlay.innerHTML = `
    <div class="onboarding-panel">
      <div class="onboarding-slides" id="ob-slides">
        ${SLIDES.map((s, i) => `
          <div class="onboarding-slide" data-idx="${i}">
            <div class="onboarding-icon">${s.icon}</div>
            <h2>${s.title}</h2>
            <p>${s.body}</p>
          </div>
        `).join("")}
      </div>

      <div class="onboarding-dots" id="ob-dots">
        ${SLIDES.map((_, i) => `<button class="onboarding-dot${i === 0 ? ' is-active' : ''}" data-idx="${i}" aria-label="Slide ${i+1}"></button>`).join("")}
      </div>

      <div class="onboarding-actions">
        <button class="btn btn--ghost" id="ob-skip">Salta</button>
        <button class="btn btn--primary" id="ob-next">Avanti →</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  let current = 0;
  const slidesEl = overlay.querySelector("#ob-slides");
  const dots = overlay.querySelectorAll(".onboarding-dot");
  const btnNext = overlay.querySelector("#ob-next");

  function goTo(idx) {
    if (idx < 0 || idx >= SLIDES.length) return;
    current = idx;
    slidesEl.style.transform = `translateX(-${idx * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
    btnNext.textContent = idx === SLIDES.length - 1 ? "🚀 Inizia" : "Avanti →";
  }

  // Click su dot
  dots.forEach(d => d.addEventListener("click", () => goTo(+d.dataset.idx)));

  // Pulsante avanti / inizia
  btnNext.addEventListener("click", () => {
    if (current < SLIDES.length - 1) {
      goTo(current + 1);
    } else {
      finish();
    }
  });

  // Salta
  overlay.querySelector("#ob-skip").addEventListener("click", finish);

  // Swipe support (touch)
  let startX = 0;
  slidesEl.addEventListener("touchstart", e => { startX = e.touches[0].clientX; });
  slidesEl.addEventListener("touchend", e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && current < SLIDES.length - 1) goTo(current + 1);
    else if (dx > 0 && current > 0) goTo(current - 1);
  });

  function finish() {
    localStorage.setItem(STORAGE_KEY, "1");
    overlay.classList.add("is-leaving");
    setTimeout(() => overlay.remove(), 300);
  }
}
