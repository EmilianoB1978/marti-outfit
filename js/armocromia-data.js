// =============================================================================
// Armocromia: dati delle 12 stagioni + 14 domande + algoritmo di scoring.
// =============================================================================
// Sistema 3 assi:
//   T (Temperatura): + caldo, - freddo
//   V (Valore):      + chiaro, - scuro
//   I (Intensità):   + brillante, - morbido
// Combinazione T/V/I → 12 stagioni mappate via SEASON_LOOKUP.
// =============================================================================

// =============================================================================
// PALETTE delle 12 stagioni (HEX + nome italiano + descrizione)
// =============================================================================
export const SEASONS = {
  spring_bright: {
    key: "spring_bright",
    name: "Primavera Brillante",
    emoji: "🌸",
    family: "Primavera",
    description: "Calda, vivace, contrasto medio-alto. I tuoi colori sono puri e luminosi.",
    physical: "Capelli biondi-dorati, occhi luminosi, pelle chiara con sottofondo pesca, contrasto naturale alto.",
    palette: ["#FF6B35", "#FFD700", "#00B4D8", "#E63946", "#2DC653", "#FF9F1C", "#FFB4A2", "#7209B7"],
    avoid: ["#5A1A1F", "#1C2A48", "#3D2817", "#9CAF88"],
  },
  spring_true: {
    key: "spring_true",
    name: "Primavera Vera",
    emoji: "🌷",
    family: "Primavera",
    description: "Calda pura, dorata, naturale. Nessun grigio nei tuoi colori.",
    physical: "Capelli biondi caldi o ramati, occhi azzurri o verdi caldi, pelle pesca con riflessi dorati.",
    palette: ["#F4A261", "#E76F51", "#52B788", "#FFB700", "#89C2D9", "#D4A373", "#E07856", "#A98467"],
    avoid: ["#000000", "#8B7BA0", "#1C2A48"],
  },
  spring_light: {
    key: "spring_light",
    name: "Primavera Chiara",
    emoji: "🌼",
    family: "Primavera",
    description: "Delicata, pesca, luminosa. Contrasto basso, palette tenue ma calda.",
    physical: "Capelli biondo chiarissimo dorato, occhi azzurro caldo o verde chiaro, pelle diafana con tono pesca.",
    palette: ["#FFCBA4", "#A8DADC", "#FFE5B4", "#B7E4C7", "#FFC8DD", "#F9DCC4", "#FFD8BE", "#C7E9B4"],
    avoid: ["#000000", "#8B0000", "#3D2817"],
  },
  summer_light: {
    key: "summer_light",
    name: "Estate Chiara",
    emoji: "💐",
    family: "Estate",
    description: "Fredda, slavata, delicata. Basso contrasto, sfumature pastello.",
    physical: "Capelli biondo cenere o platino, occhi celesti chiari, pelle rosata diafana.",
    palette: ["#C9B8D7", "#B5C8D8", "#D4B8C1", "#A8C5DA", "#E8D5D5", "#B8D0C8", "#D8B8E8", "#A8B8D8"],
    avoid: ["#000000", "#FF4500", "#5C2E00"],
  },
  summer_true: {
    key: "summer_true",
    name: "Estate Vera",
    emoji: "🪻",
    family: "Estate",
    description: "Fredda pura, grigio-rosata, media intensità. Nessun caldo nei tuoi colori.",
    physical: "Capelli castano cenere o grigi, occhi grigio-azzurri, pelle rosata medio-chiara.",
    palette: ["#8B7BA0", "#6B9BB8", "#C17A8A", "#7BA3A8", "#9E7B9E", "#6B8F7A", "#A48BB8", "#7E97A8"],
    avoid: ["#FF6B35", "#FFD700", "#8B4513"],
  },
  summer_soft: {
    key: "summer_soft",
    name: "Estate Soft",
    emoji: "🌫️",
    family: "Estate",
    description: "Morbida, neutra-fredda, desaturata, nebbiosa. I tuoi colori sono spenti ma freddi.",
    physical: "Capelli biondo cenere o castano cenere, occhi nocciola freddi o grigi, pelle neutra opaca.",
    palette: ["#9E9B8E", "#A8A4B0", "#B0A898", "#8E9E9A", "#C4B5A5", "#A0909E", "#B8A89E", "#9DA8A0"],
    avoid: ["#FF1493", "#00FFFF", "#FFD700"],
  },
  autumn_soft: {
    key: "autumn_soft",
    name: "Autunno Soft",
    emoji: "🍃",
    family: "Autunno",
    description: "Calda-morbida, terrea, media intensità, sfumata. Toni naturali e polverosi.",
    physical: "Capelli biondo dorato scuro o castano caldo, occhi nocciola o verde caldo, pelle dorata opaca.",
    palette: ["#C4956A", "#8B7355", "#9CAF88", "#C9A96E", "#7D8C7C", "#B8836A", "#A48458", "#8E9C7B"],
    avoid: ["#000000", "#FF1493", "#00FFFF"],
  },
  autumn_true: {
    key: "autumn_true",
    name: "Autunno Vero",
    emoji: "🍂",
    family: "Autunno",
    description: "Calda intensa, ruggine, speziata, ricca. Colori della terra e del bosco.",
    physical: "Capelli ramati o castani caldi, occhi marroni o verdi caldi, pelle pesca o olivastra calda.",
    palette: ["#8B4513", "#CD853F", "#6B8E23", "#A0522D", "#DAA520", "#556B2F", "#B8651D", "#7A5230"],
    avoid: ["#000000", "#FF1493", "#A8C5DA"],
  },
  autumn_deep: {
    key: "autumn_deep",
    name: "Autunno Profondo",
    emoji: "🌰",
    family: "Autunno",
    description: "Scura, intensa, calda o neutra, contrasto alto. I tuoi colori sono ricchi e profondi.",
    physical: "Capelli castano scuro o nero caldo, occhi marroni profondi, pelle medio-scura olivastra.",
    palette: ["#3D1A00", "#5C2E00", "#1A3A00", "#4A2800", "#6B3A2A", "#2E3B1E", "#5A2A0F", "#3A2A14"],
    avoid: ["#FFCBA4", "#A8C5DA", "#C9B8D7"],
  },
  winter_deep: {
    key: "winter_deep",
    name: "Inverno Profondo",
    emoji: "🖤",
    family: "Inverno",
    description: "Fredda-scura, contrasto massimo, drammatica. Bianchi, neri e gioiello.",
    physical: "Capelli neri o castano scuro freddo, occhi marrone scuro o neri, pelle olivastra fredda o scura.",
    palette: ["#000000", "#1A1A2E", "#16213E", "#2C003E", "#000D1A", "#1B0000", "#0F0F1A", "#240046"],
    avoid: ["#FFCBA4", "#FFE5B4", "#C9A96E"],
  },
  winter_true: {
    key: "winter_true",
    name: "Inverno Vero",
    emoji: "❄️",
    family: "Inverno",
    description: "Fredda pura, colori netti, nessuna morbidezza. Bianco puro, navy, rubino.",
    physical: "Capelli scuri freddi, occhi azzurri o grigi netti, pelle rosata o olivastra fredda.",
    palette: ["#00008B", "#8B0000", "#006400", "#4B0082", "#008080", "#708090", "#4A0E45", "#0A2A47"],
    avoid: ["#F4A261", "#CD853F", "#C9A96E"],
  },
  winter_bright: {
    key: "winter_bright",
    name: "Inverno Brillante",
    emoji: "💎",
    family: "Inverno",
    description: "Fredda vivace, contrasto alto, colori saturi. Gemme, vivacità, neon.",
    physical: "Capelli scuri, occhi luminosi (azzurro vivido, verde brillante), pelle chiara con contrasto alto.",
    palette: ["#FF1493", "#00FFFF", "#FF4500", "#7B2FBE", "#00CED1", "#FF6600", "#E91E63", "#1E88E5"],
    avoid: ["#C4956A", "#9CAF88", "#FFCBA4"],
  },
};

// =============================================================================
// LOOKUP T/V/I → stagione
// =============================================================================
// La funzione classifySeason() applica regole gerarchiche con tie-breaker per
// gestire bordi (Soft Autumn vs Soft Summer, Bright Spring vs Bright Winter).
export function classifySeason(scores) {
  const { T, V, I } = scores;

  // Determine il dominio di temperatura
  let temp;
  if (T >= 4) temp = "warm";
  else if (T <= -4) temp = "cool";
  else temp = "neutral";

  // Determina il valore
  let value;
  if (V >= 2) value = "light";
  else if (V <= -2) value = "deep";
  else value = "medium";

  // Determina l'intensita'
  let intensity;
  if (I >= 2) intensity = "bright";
  else if (I <= -2) intensity = "soft";
  else intensity = "medium";

  // Lookup table — i casi neutri ricadono sulla famiglia piu' vicina
  // tramite tiebreaker sui due assi secondari
  if (temp === "warm") {
    if (value === "light")  return intensity === "bright" ? "spring_bright" : "spring_light";
    if (value === "deep")   {
      if (intensity === "soft") return "autumn_soft";
      if (intensity === "bright") return "autumn_deep";
      return "autumn_true";
    }
    // medium value caldo
    if (intensity === "bright") return "spring_true";
    if (intensity === "soft")   return "autumn_soft";
    return "autumn_true";
  }

  if (temp === "cool") {
    if (value === "light")  {
      if (intensity === "bright") return "winter_bright";
      return "summer_light";
    }
    if (value === "deep")   {
      if (intensity === "bright") return "winter_bright";
      return "winter_deep";
    }
    // medium value freddo
    if (intensity === "soft")   return "summer_soft";
    if (intensity === "bright") return "winter_true";
    return "summer_true";
  }

  // Neutro — fallback su V e I
  if (value === "light" && intensity === "soft")   return "summer_light";
  if (value === "light" && intensity === "bright") return "spring_bright";
  if (value === "deep" && intensity === "soft")    return "autumn_soft";
  if (value === "deep" && intensity === "bright")  return "winter_deep";
  // Caso medio ambiguo: prendi lato in base al segno residuo di T
  if (T > 0) return intensity === "soft" ? "autumn_soft" : "spring_true";
  return intensity === "soft" ? "summer_soft" : "summer_true";
}

// =============================================================================
// 14 DOMANDE del questionario, ordine ottimizzato per ridurre confusione cognitiva.
// Ogni risposta ha pesi su T/V/I.
// =============================================================================
export const QUESTIONS = [
  {
    id: 1,
    text: "Osserva le vene all'interno del polso in luce naturale. Di che colore appaiono?",
    emoji: "💪",
    options: [
      { text: "Blu o viola",                weights: { T: -2 } },
      { text: "Verdi o giallo-verdi",       weights: { T: +2 } },
      { text: "Mix blu-verde, indistinto",  weights: { T: 0 }, neutral: true },
    ],
  },
  {
    id: 2,
    text: "Provando entrambi i gioielli al viso senza trucco, in luce naturale, quale ti illumina di più?",
    emoji: "💍",
    options: [
      { text: "Argento — pelle più viva",        weights: { T: -2 } },
      { text: "Oro giallo — pelle più sana",     weights: { T: +2 } },
      { text: "Entrambi vanno bene",             weights: { T: 0 }, neutral: true },
    ],
  },
  {
    id: 3,
    text: "Il tuo incarnato naturale ha una sfumatura di fondo:",
    emoji: "🎨",
    options: [
      { text: "Rosata, beige-rosata, cenere",     weights: { T: -2 } },
      { text: "Pesca, dorata, olivastra calda",   weights: { T: +2 } },
      { text: "Beige neutro o avorio",            weights: { T: +1 } },
    ],
  },
  {
    id: 4,
    text: "Quando ti esponi al sole, la tua pelle:",
    emoji: "☀️",
    options: [
      { text: "Si arrossa, non si abbronza facilmente",     weights: { T: -1 } },
      { text: "Si abbronza con tono dorato o ramato",        weights: { T: +2 } },
      { text: "Si abbronza beige-neutro senza dorature",     weights: { T: -1 } },
    ],
  },
  {
    id: 5,
    text: "Confronta capelli, occhi e pelle al naturale. Quanto contrasto vedi?",
    emoji: "👁️",
    options: [
      { text: "Molto: capelli scuri vs pelle chiara, o occhi che spiccano",  weights: { I: +2 } },
      { text: "Poco: tutto si fonde armoniosamente, tinte simili",            weights: { I: -2 } },
      { text: "Medio: qualche contrasto ma non estremo",                       weights: { I: 0 } },
    ],
  },
  {
    id: 6,
    text: "Qual è il tuo colore di capelli naturale (prima di tinture)?",
    emoji: "💇",
    options: [
      { text: "Biondo chiarissimo, cenere, platino",      weights: { T: -1, V: +2 } },
      { text: "Biondo dorato, ramato, rosso fragola",      weights: { T: +1, V: +1 } },
      { text: "Castano medio, castano dorato, rosso scuro", weights: { T: +1, V: -1 } },
      { text: "Bruno scuro o nero",                          weights: { T: -1, V: -2 } },
    ],
  },
  {
    id: 7,
    text: "Qual è il colore dei tuoi occhi?",
    emoji: "👀",
    options: [
      { text: "Azzurro chiaro, grigio-azzurro, blu profondo",  weights: { T: -1, V: +1 } },
      { text: "Verde chiaro, acquamarina, azzurro-verde",       weights: { T: 0, V: +1 } },
      { text: "Nocciola, verde-marrone, ambra",                  weights: { T: +1, V: 0 } },
      { text: "Marrone scuro o quasi nero",                       weights: { T: 0, V: -2 } },
    ],
  },
  {
    id: 8,
    text: "Metti la mano su un foglio bianco puro e poi su crema/avorio. Su quale sfondo la tua pelle sembra più sana?",
    emoji: "📄",
    options: [
      { text: "Bianco puro — armonioso",                         weights: { T: -1, V: +1 } },
      { text: "Crema/avorio — il bianco mi spegne o ingrigisce",   weights: { T: +1, V: 0 } },
      { text: "Nessuna differenza evidente",                       weights: { T: 0, V: 0 } },
    ],
  },
  {
    id: 9,
    text: "Indossando un capo rosso vivo accanto al viso ti senti:",
    emoji: "❤️",
    options: [
      { text: "Illuminata — vibra bene con me",                  weights: { I: +2 } },
      { text: "Schiacciata — il rosso urla troppo",                weights: { I: -2 } },
      { text: "Né l'uno né l'altro — neutro",                      weights: { I: 0 } },
    ],
  },
  {
    id: 10,
    text: "Le tue lentiggini o le venature naturali della pelle sono:",
    emoji: "🌟",
    options: [
      { text: "Lentiggini rossicce o dorate, sottofondo caldo",    weights: { T: +1, I: +1 } },
      { text: "Pelle omogenea, matta o leggermente rosata",         weights: { T: -1, I: -1 } },
      { text: "Pelle senza lentiggini, beige neutro",                weights: { T: 0, I: 0 } },
    ],
  },
  {
    id: 11,
    text: "Quale palette di colori ti senti più a tuo agio a indossare?",
    emoji: "🎭",
    options: [
      { text: "Vividi e puri (rosso acceso, cobalto, smeraldo)",   weights: { I: +2 } },
      { text: "Terrosi e smorzati (cammello, ruggine, senape)",     weights: { T: +1, I: -1 } },
      { text: "Polverosi e delicati (lavanda, cipria, pervinca)",   weights: { T: -1, I: -1 } },
      { text: "Profondi e neutri (borgogna, navy, carbone)",         weights: { V: -1, I: 0 } },
    ],
  },
  {
    id: 12,
    text: "Avvicinando una felpa grigio medio al viso, i tuoi occhi sembrano:",
    emoji: "👚",
    options: [
      { text: "Spegnersi, diventare grigi",                          weights: { I: -1 } },
      { text: "Accendersi, mostrare verde/ambra/hazel",               weights: { T: +1 } },
      { text: "Nessuna differenza",                                    weights: { T: 0 } },
    ],
  },
  {
    id: 13,
    text: "La texture della tua pelle al naturale è:",
    emoji: "✨",
    options: [
      { text: "Diafana, traslucente, si vede il rossore sotto",    weights: { T: -1, V: +1 } },
      { text: "Matta, compatta, dorata o olivastra",                weights: { T: +1, V: -1 } },
      { text: "Luminosa ma non diafana, neutro-rosata",             weights: { T: 0, V: 0 } },
    ],
  },
  {
    id: 14,
    text: "Tieni davanti al viso un foglio verde oliva caldo e uno blu-grigiastro freddo. Quale fa stare meglio la tua pelle?",
    emoji: "🍃",
    options: [
      { text: "Verde oliva — la pelle sembra viva",                weights: { T: +2 } },
      { text: "Blu-grigiastro — il verde oliva mi fa ingiallire",   weights: { T: -2 } },
      { text: "Entrambi mi stanno abbastanza",                       weights: { T: 0 } },
    ],
  },
];

// =============================================================================
// Calcola scores accumulati dalle risposte
// =============================================================================
export function computeScores(answers) {
  // answers = { questionId: optionIndex }
  const scores = { T: 0, V: 0, I: 0 };
  let neutralCount = 0;

  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    if (typeof idx !== "number" || !q.options[idx]) continue;
    const opt = q.options[idx];
    if (opt.neutral) neutralCount++;
    for (const ax of ["T", "V", "I"]) {
      if (typeof opt.weights[ax] === "number") {
        scores[ax] += opt.weights[ax];
      }
    }
  }

  return { ...scores, neutralCount };
}

// =============================================================================
// Confidence: stima qualita' del risultato (0..1)
// =============================================================================
export function computeConfidence(scores) {
  // Punteggi piu' "estremi" = piu' confidenza. Neutri al limite -> bassa.
  const { T, V, I, neutralCount } = scores;
  // Range tipico: T [-12,+12], V [-7,+7], I [-9,+9]
  const tStrength = Math.min(Math.abs(T) / 6, 1);
  const vStrength = Math.min(Math.abs(V) / 4, 1);
  const iStrength = Math.min(Math.abs(I) / 5, 1);
  const avg = (tStrength + vStrength + iStrength) / 3;
  // Penalita' per troppe risposte neutre
  const penalty = Math.min(neutralCount * 0.06, 0.3);
  return Math.max(0.3, Math.min(1, avg - penalty));
}

// =============================================================================
// API: classify(answers) -> { season, scores, confidence, palette }
// =============================================================================
export function classify(answers) {
  const scores = computeScores(answers);
  const seasonKey = classifySeason(scores);
  const season = SEASONS[seasonKey];
  const confidence = computeConfidence(scores);
  return {
    seasonKey,
    season,
    scores,
    confidence,
  };
}
