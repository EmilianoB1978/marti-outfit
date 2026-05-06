// =============================================================================
// Dress code per destinazione (dataset statico curato)
// =============================================================================
// Coverage: paesi/zone con regole culturali piu' "sensibili" — non
// tutto il mondo. Le regole sono indicative, NON definitive: tap "info"
// per dettagli e link approfondimento (TODO).
//
// strictness:
//   "high"   = regole obbligatorie / fortemente raccomandate (UAE, Iran, ecc.)
//   "medium" = contesti specifici (chiese, templi, moschee)
//   "low"    = nessun problema particolare
// =============================================================================

const DRESSCODE = {
  // Medio Oriente
  AE: { strictness: "high", title: "Emirati Arabi Uniti",
    rules: [
      "Spalle e ginocchia coperte in pubblico (donne e uomini)",
      "No trasparenze nei luoghi pubblici",
      "Bikini solo in spiagge resort o piscine private",
      "Centri commerciali: vestirsi 'modesto' (no top corti, no shorts molto corti)",
      "Moschee: copricapo + caftano lungo per le donne (forniti all'ingresso)",
    ],
  },
  SA: { strictness: "high", title: "Arabia Saudita",
    rules: [
      "Donne: abaya nera consigliata in luoghi pubblici (non più obbligatoria dal 2019)",
      "Spalle e ginocchia sempre coperte",
      "No abiti aderenti o trasparenti",
      "Hijab non obbligatorio per turiste ma raccomandato in zone conservative",
    ],
  },
  IR: { strictness: "high", title: "Iran",
    rules: [
      "Hijab obbligatorio per donne in pubblico",
      "Abiti lunghi che coprano braccia e gambe",
      "No jeans strappati, no leggings come unico capo inferiore",
    ],
  },
  EG: { strictness: "medium", title: "Egitto",
    rules: [
      "Spalle e ginocchia coperte fuori dai resort",
      "Bikini ok in spiaggia/resort, ma non in città",
      "Moschee: scarpe da togliere, donne con foulard",
      "Il Cairo: vestiti 'modesti' specie nei mercati",
    ],
  },
  MA: { strictness: "medium", title: "Marocco",
    rules: [
      "Spalle e ginocchia coperte fuori dai resort",
      "Mosche aperte ai non-musulmani: rare; quando entri, copri tutto",
      "Souk e medine: vestiti modesti, evita scollature/shorts",
      "Spiagge: bikini ok solo nei resort principali",
    ],
  },
  TR: { strictness: "medium", title: "Turchia",
    rules: [
      "Istanbul/Izmir: liberale come l'Europa",
      "Cappadocia/zone interne: meglio coprire spalle e ginocchia",
      "Moschea Blu / Hagia Sophia: scarpe via, donne con foulard (forniti)",
    ],
  },
  // Asia
  TH: { strictness: "medium", title: "Thailandia",
    rules: [
      "Templi: spalle, gomiti e ginocchia coperti (sarong noleggiabili all'ingresso)",
      "Scarpe sempre da togliere prima di entrare in un tempio o casa",
      "Mai toccare la testa di nessuno (cultura buddhista)",
      "Spiagge: bikini ok",
    ],
  },
  ID: { strictness: "medium", title: "Indonesia (Bali / templi)",
    rules: [
      "Templi: sarong + sash obbligatori (forniti all'ingresso o noleggio)",
      "Spalle coperte nei templi",
      "Bali resort/spiagge: bikini ok",
      "Aceh (zona islamica): regole più strette, copri sempre spalle e ginocchia",
    ],
  },
  IN: { strictness: "medium", title: "India",
    rules: [
      "Templi indù: scarpe via, spalle coperte",
      "Templi sikh: copricapo obbligatorio (forniti)",
      "Zone rurali / nord conservativo: vestiti modesti, evita shorts e top corti",
      "Mumbai/Goa: liberali, tipo Europa",
    ],
  },
  // Europa
  IT: { strictness: "medium", title: "Italia",
    rules: [
      "Chiese cattoliche: spalle coperte (obbligatorio in San Pietro, Duomi, basiliche)",
      "No shorts molto corti / top spallati nei luoghi religiosi",
      "Spiagge: bikini/costume ok ovunque",
    ],
  },
  VA: { strictness: "high", title: "Città del Vaticano",
    rules: [
      "Spalle e ginocchia OBBLIGATORIAMENTE coperte in San Pietro e Musei Vaticani",
      "No shorts / minigonne / canotte: rifiuto all'ingresso",
      "Foulard utile per coprire all'occorrenza",
    ],
  },
  GR: { strictness: "medium", title: "Grecia",
    rules: [
      "Monasteri (Meteora, Monte Athos): spalle e ginocchia coperte; alcuni monasteri preferiscono abiti su gentili",
      "Isole/spiagge: bikini ok ovunque",
    ],
  },
  ES: { strictness: "low", title: "Spagna",
    rules: [
      "Cattedrali: spalle coperte, eviti shorts molto corti",
      "Resto: stile mediterraneo libero",
    ],
  },
  // Americhe (basso strictness)
  MX: { strictness: "low", title: "Messico",
    rules: [
      "Chiese cattoliche: spalle coperte",
      "Spiagge resort: bikini ok",
      "Zone rurali / Chiapas: vestire modesti per rispetto cultura indigena",
    ],
  },
  US: { strictness: "low", title: "Stati Uniti",
    rules: [
      "Stile libero in genere",
      "Stati conservatori (Utah, Texas rurale): meglio coprire un po' più del solito",
      "Casinò / club: spesso dress code 'smart casual' la sera",
    ],
  },
};

/**
 * Ritorna info dress-code per un country code ISO (2 lettere).
 * @returns {object|null} { strictness, title, rules:[] } o null se non in dataset
 */
export function getDressCode(countryCode) {
  if (!countryCode) return null;
  return DRESSCODE[String(countryCode).toUpperCase()] || null;
}

export const STRICTNESS_LABELS = {
  high:   { label: "Codice rigoroso",  emoji: "⚠️", color: "#c0392b" },
  medium: { label: "Attenzione",        emoji: "🕌", color: "#e67e22" },
  low:    { label: "Stile libero",     emoji: "✓",  color: "#27ae60" },
};
