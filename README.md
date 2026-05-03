# 👔 My Wardrobe

PWA personale per gestire il guardaroba con consigli outfit AI.
Stack: HTML/CSS/JS vanilla • Firebase (Firestore + Storage) • Claude API via Cloudflare Worker • GitHub Pages.

---

## 📦 Struttura del progetto

```
my-wardrobe/
├── index.html              # App shell (single page)
├── manifest.json           # Config PWA
├── service-worker.js       # Cache offline
├── css/styles.css          # Stili mobile-first
├── js/
│   ├── app.js              # Orchestrazione UI + eventi
│   ├── firebase-config.js  # ⚠️ DA CONFIGURARE
│   ├── claude-api.js       # ⚠️ DA CONFIGURARE (URL Worker)
│   ├── wardrobe.js         # CRUD capi (Firestore + Storage)
│   └── outfit.js           # Gestione outfit
├── proxy/worker.js         # Codice del Cloudflare Worker (proxy Claude)
├── icons/                  # Icone PWA (192/512/apple-touch)
└── .github/workflows/      # Deploy automatico su GitHub Pages
```

---

## 🚀 Setup — guida passo passo

### Step 1 — Firebase

1. Vai su https://console.firebase.google.com e clicca **Aggiungi progetto** (es. `my-wardrobe`).
2. Disabilita Google Analytics (non serve).
3. Nel progetto, clicca l'icona web `</>` per registrare un'**app web**:
   - Nickname: `My Wardrobe PWA`
   - **Non** abilitare hosting Firebase.
   - Copia l'oggetto `firebaseConfig` mostrato.
4. Apri `js/firebase-config.js` e sostituisci il blocco `firebaseConfig` con quello copiato.
5. Nel menu laterale Firebase Console:
   - **Build → Firestore Database → Crea database**
     - Modalità: **Produzione** (regole le impostiamo tra poco)
     - Location: `eur3 (europe-west)`
   - **Build → Storage → Inizia**
     - Stessa location (`europe-west`)

**Regole Firestore** (Build → Firestore → Regole):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
> ⚠️ Queste regole sono **aperte** (uso single-user). Per uso da terzi servirebbe Firebase Auth.

**Regole Storage** (Build → Storage → Regole):
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

---

### Step 2 — Cloudflare Worker (proxy Claude API)

1. Vai su https://dash.cloudflare.com → **Workers & Pages** → **Create**.
2. Crea un Worker, dagli un nome (es. `my-wardrobe-proxy`).
3. Apri il pannello **Edit code** del Worker.
4. Cancella il codice di esempio e incolla TUTTO il contenuto di `proxy/worker.js`.
5. Salva e fai deploy.
6. Vai su **Settings → Variables and Secrets**, aggiungi (tipo `Encrypted` per sicurezza):
   - `ANTHROPIC_API_KEY` = la tua API key Claude (da https://console.anthropic.com)
   - `ALLOWED_ORIGIN` = `https://TUONOME.github.io` (dopo lo Step 4) — può rimanere vuoto in fase di test
7. Copia l'URL del Worker (es. `https://my-wardrobe-proxy.tuonome.workers.dev`).
8. Apri `js/claude-api.js` e sostituisci `WORKER_URL` con quell'URL.

> 💰 **Costi**: Cloudflare Workers ha 100.000 richieste gratuite/giorno. Claude Sonnet 4 costa circa $3/M token input, $15/M output. Le foto vengono ridimensionate a 1024px lato massimo per minimizzare i costi.

---

### Step 3 — Test locale

```bash
cd ~/Documents/my-wardrobe
python3 -m http.server 8080
```
Apri http://localhost:8080. Dovrebbe partire l'app. Aggiungi un capo per testare.

> Se vedi la "Setup screen": Firebase non è configurato. Controlla `js/firebase-config.js`.

---

### Step 4 — GitHub Pages

1. Crea un repo GitHub (es. `my-wardrobe`), pubblico o privato.
2. Inizializza Git e pusha:
   ```bash
   cd ~/Documents/my-wardrobe
   git init -b main
   git add -A
   git commit -m "Initial commit"
   git remote add origin https://github.com/TUOUSER/my-wardrobe.git
   git push -u origin main
   ```
3. Su GitHub: **Settings → Pages**:
   - Source: **GitHub Actions**
4. Il workflow `.github/workflows/deploy.yml` deploya automaticamente.
5. URL finale: `https://TUOUSER.github.io/my-wardrobe/`

> ⚠️ **Aggiorna ALLOWED_ORIGIN** sul Worker con questo URL, altrimenti CORS bloccherà le chiamate.

---

### Step 5 — Installa come PWA su iPhone

1. Apri l'URL `https://TUOUSER.github.io/my-wardrobe/` in **Safari** (non Chrome).
2. Tocca il pulsante **Condividi** (quadrato con freccia).
3. Scorri e tocca **Aggiungi a Home**.
4. Conferma il nome "My Wardrobe" → **Aggiungi**.

L'icona appare sulla home come app nativa: schermo intero, splash, funziona offline (consultazione del guardaroba già caricato).

---

## 🔧 Manutenzione

### Aggiornare l'app
Push su `main` → GitHub Actions deploya in ~1 min. Per forzare il refresh della cache PWA, incrementa `CACHE_VERSION` in `service-worker.js`.

### Costi attesi (uso personale)
- Firebase: free tier (Firestore 1 GiB + Storage 5 GB) ampiamente sufficiente.
- Claude API: ~$0.005 per analisi capo, ~$0.01 per sessione outfit. 100 capi + 50 outfit/mese ≈ $1/mese.
- Cloudflare Workers: gratis.
- GitHub Pages: gratis.

### Modello Claude
Configurato in `proxy/worker.js`: `claude-sonnet-4-20250514`.
Se vuoi risparmiare, puoi passare a `claude-haiku-4-5-20251001` (più economico, qualità leggermente inferiore per visione).

---

## 🛠 Personalizzazioni rapide

- **Colori**: variabili CSS in `css/styles.css` (`--accent`, `--bg`, ecc.)
- **Categorie/stili dropdown**: hardcoded in `index.html` (modale Aggiungi)
- **Prompt AI**: modificabili in `proxy/worker.js` (`ANALYZE_PROMPT`, `buildOutfitPrompt`)

---

## ⚠️ Note di sicurezza

- La regola Firestore/Storage `allow read, write: if true` è OK solo perché:
  - L'URL è solo tuo (uso personale).
  - Le chiavi Firebase Web sono comunque pubbliche (lato client).
- La **API key Claude NON è esposta**: vive solo come variabile cifrata sul Worker.
- `ALLOWED_ORIGIN` sul Worker impedisce ad altri siti di abusare del tuo proxy.
