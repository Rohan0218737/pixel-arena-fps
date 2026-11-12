# Pixel Arena

Sparatutto 3D multiplayer in prima persona, privato e leggero, con le facce dei compagni
sulla testa dei personaggi.

- **Client** (`client/`): sito statico in HTML, CSS e JavaScript con Three.js. Nessuna
  compilazione: si pubblica su **Netlify** così com'è.
- **Server** (`server/`): Node.js con Socket.io (WebSocket). Si pubblica su **Render**.

## Cosa c'è dentro

- Visuale in prima persona: movimento **WASD**, mouse con **Pointer Lock**, **click sinistro**
  per sparare proiettili visibili. In più: salto, corsa, ricarica, classifica.
- Mappa unica generata via codice: terreno, mura di cinta con torri, ostacoli e alberi fatti
  di cubi e cilindri, texture in pixel art disegnate dal codice.
- Personaggi tutti uguali (stesso modello a blocchi); cambia solo la faccia: una foto PNG
  trasparente per ogni compagno, applicata sulla testa.
- Multiplayer in tempo reale: posizioni (X, Y, Z), rotazioni, spari, danni, salute,
  eliminazioni e rientro in campo. Salute e punteggi li decide il server.
- Prova offline con manichini (uno per faccia) per controllare le foto senza server.
- Comandi a schermo per provare il gioco dal telefono.
- Arena privata: codice di accesso facoltativo e limite ai siti che possono collegarsi.

## Struttura

```
pixel-arena-fps/
├── README.md
├── netlify.toml            pubblica client/ su Netlify
├── render.yaml             crea il servizio su Render da server/
├── client/                 FRONT-END (Netlify)
│   ├── index.html
│   ├── css/style.css       menu, interfaccia di gioco, comandi touch
│   ├── js/
│   │   ├── config.js       <- indirizzo del server, facce, sensibilità, velocità
│   │   ├── main.js         avvio e ciclo di gioco
│   │   ├── net.js          collegamento Socket.io
│   │   ├── world.js        la mappa (terreno, mura, ostacoli, alberi, cielo)
│   │   ├── textures.js     texture pixel art disegnate via codice
│   │   ├── collision.js    collisioni con la mappa
│   │   ├── player.js       giocatore locale: movimento e telecamera
│   │   ├── input.js        tastiera, mouse, Pointer Lock
│   │   ├── touch.js        levetta e pulsanti per il telefono
│   │   ├── weapon.js       arma in prima persona, caricatore, ricarica
│   │   ├── projectiles.js  proiettili
│   │   ├── avatar.js       il modello standard del personaggio
│   │   ├── faces.js        le facce: dal PNG alla testa
│   │   ├── remotes.js      gli altri giocatori, movimento reso fluido
│   │   ├── effects.js      particelle
│   │   ├── audio.js        suoni sintetizzati (nessun file audio)
│   │   ├── hud.js          salute, munizioni, eliminazioni, classifica
│   │   ├── menu.js         menu iniziale
│   │   └── offline.js      prova offline con i manichini
│   ├── assets/faces/       <- le foto PNG dei compagni
│   └── vendor/             Three.js e client Socket.io (già inclusi)
└── server/                 BACK-END (Render)
    ├── package.json
    ├── server.js           avvio: HTTP + Socket.io
    └── src/
        ├── config.js       <- regole di gioco (danni, cadenza, tempi) e variabili
        ├── game.js         logica: ingresso, posizioni, spari, danni, punteggi
        └── validate.js     controlli sui dati ricevuti
```

## Prova in locale

Serve [Node.js](https://nodejs.org) 20 o superiore.

```bash
# terminale 1: server di gioco su http://localhost:3000
cd server
npm install
npm start

# terminale 2: sito del gioco su http://localhost:8080
npx serve client -l 8080
```

Apri `http://localhost:8080` in due schede o su due computer della stessa rete.
Con `SERVER_URL` vuoto (in `client/js/config.js`) il gioco cerca da solo il server sulla
porta 3000 dello stesso computer.

**Dal telefono con Acode:** apri `client/index.html` con l'anteprima integrata. Senza server
puoi usare **Prova offline**; dopo aver pubblicato il server su Render e scritto il suo
indirizzo in `SERVER_URL`, l'anteprima si collega a quello. Aprire il file direttamente
(`file://`) non funziona: i moduli JavaScript richiedono un indirizzo `http://`.

## Pubblicazione

Sia Render sia Netlify pubblicano da un repository Git: carica l'intero progetto
(con `client/` e `server/`) su un repository GitHub.

### 1. Server su Render

1. Su [render.com](https://render.com): **New → Web Service** e scegli il repository.
2. Imposta:

   | Campo | Valore |
   |---|---|
   | Root Directory | `server` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | Free |

3. A pubblicazione finita Render mostra l'indirizzo, ad esempio
   `https://pixel-arena-server.onrender.com`. Aprendolo nel browser deve comparire
   `"status": "online"`.

In alternativa **New → Blueprint**: il file `render.yaml` compila da solo i campi qui sopra.

### 2. Collega il client al server

In `client/js/config.js` scrivi l'indirizzo di Render, senza barra finale:

```js
SERVER_URL: 'https://pixel-arena-server.onrender.com',
```

Salva e carica la modifica sul repository.

### 3. Client su Netlify

1. Su [netlify.com](https://www.netlify.com): **Add new site → Import an existing project**
   e scegli lo stesso repository.
2. Non serve impostare nulla: `netlify.toml` indica già la cartella da pubblicare
   (`client`) e non c'è alcun comando di build.
3. Il gioco è online all'indirizzo `https://NOME-SITO.netlify.app`: è il link da dare ai compagni.

Se preferisci il caricamento manuale ([Netlify Drop](https://app.netlify.com/drop)),
trascina la cartella `client` (una cartella, non lo ZIP).

### 4. Rendi l'arena privata (facoltativo)

Su Render, nella pagina del servizio → **Environment**, puoi aggiungere:

| Variabile | A cosa serve | Esempio |
|---|---|---|
| `CLIENT_ORIGIN` | Solo questi siti possono collegarsi (più indirizzi separati da virgola). Vuota = tutti. | `https://NOME-SITO.netlify.app` |
| `ACCESS_CODE` | Codice da digitare nel menu per entrare. Vuota = ingresso libero. | `quinta-b-2026` |
| `MAX_PLAYERS` | Numero massimo di giocatori (predefinito 12). | `8` |

Con `CLIENT_ORIGIN` impostata, per collegarti anche dall'anteprima locale aggiungi il suo
indirizzo (ad esempio `http://localhost:8080`) alla lista.

## Le facce dei compagni

1. Prepara una foto per compagno: **PNG con sfondo trasparente**, meglio se quadrata
   (256×256 o 512×512) con il viso che riempie l'immagine.
2. Copia i file in `client/assets/faces/` (ad esempio `marco.png`).
3. Elencali in `client/js/config.js`:

   ```js
   FACES: [
     { id: 'marco', name: 'Marco', file: 'marco.png' },
     { id: 'giulia', name: 'Giulia', file: 'giulia.png' },
   ],
   ```

   `id` è un nome breve senza spazi (lettere, numeri, `-`, `_`), `name` è ciò che si legge nel menu.

La foto finisce sul lato frontale della testa. Dalla foto il gioco ricava anche il colore
dei capelli e della pelle, con cui riempie le zone trasparenti e colora gli altri lati della
testa. Se un file manca compare una faccina di riserva. Le sei facce incluse
(`compagno1.png` … `compagno6.png`) sono segnaposto da sostituire.

Usa **Prova offline** per vedere subito il risultato: ogni faccia diventa un manichino.

## Comandi

| Azione | PC | Telefono |
|---|---|---|
| Muoversi | `W` `A` `S` `D` o frecce | levetta (metà sinistra dello schermo) |
| Guardarsi attorno | mouse | trascina sulla metà destra |
| Sparare | click sinistro (tenuto = raffica) | pulsante rosso |
| Saltare | `Spazio` | pulsante ▲ |
| Correre | `Shift` | levetta fino in fondo |
| Ricaricare | `R` | pulsante R |
| Classifica | `Tab` (tenuto) | pulsante # |
| Audio sì/no | `M` | nel menu di pausa |
| Pausa | `Esc` | pulsante II |

Nel menu di pausa ogni giocatore regola la propria sensibilità della visuale.

## Personalizzare il gioco

| Cosa | Dove |
|---|---|
| Danni, salute, cadenza di tiro, velocità dei proiettili, tempo di rientro, massimo giocatori | `server/src/config.js` (`RULES`) |
| Velocità di movimento, salto, gravità, caricatore, campo visivo, ombre, volume | `client/js/config.js` |
| Disposizione di ostacoli, casse, barili e punti di ingresso | `client/js/world.js` (`QUARTER`: un quarto di mappa, ripetuto quattro volte) |
| Colori e proporzioni del personaggio | `client/js/avatar.js` |
| Aspetto dell'arma | `client/js/weapon.js` |
| Colori dell'interfaccia | `client/css/style.css` (variabili in `:root`) |

Le regole di `server/src/config.js` arrivano ai client quando entrano in arena: basta
ripubblicare il server. Le regole della prova offline sono in fondo a `client/js/config.js`.

## Come funziona il multiplayer

- Ogni client invia 20 volte al secondo posizione e sguardo (`state`). Il server raccoglie
  tutto e ridistribuisce un'unica fotografia (`snap`) a 20 Hz; gli altri giocatori vengono
  disegnati con 100 ms di ritardo interpolando tra due fotografie, quindi si muovono fluidi.
- La mappa vive nel client ed è identica per tutti: muri e ostacoli sono calcolati sul posto.
- Chi spara vede subito il proprio proiettile e avvisa il server (`shoot`), che lo mostra
  agli altri (`shot`). Se il proiettile raggiunge un avversario il client lo segnala (`hit`):
  il server controlla che il colpo sia plausibile (sparo registrato, cadenza rispettata,
  bersaglio vicino alla traiettoria) e solo allora toglie salute (`damaged`).
- A salute zero il server annuncia l'eliminazione (`died`), aggiorna i punteggi e dopo
  3 secondi accetta il rientro (`spawn` → `spawned`) nel punto più lontano dagli avversari.

| Evento | Direzione | Contenuto |
|---|---|---|
| `join` | client → server | nome, faccia, codice; risposta con regole ed elenco giocatori |
| `spawn` / `spawned` | client → server / server → tutti | punto di ingresso in campo |
| `state` | client → server | `[x, y, z, imbardata, inclinazione]` |
| `snap` | server → tutti | posizioni di tutti i giocatori vivi |
| `shoot` / `shot` | client → server / server → altri | origine e direzione del proiettile |
| `hit` | client → server | proiettile, bersaglio, colpo alla testa |
| `damaged`, `died` | server → tutti | salute rimasta, autore, punteggi |
| `playerJoined`, `playerLeft`, `lobby` | server → tutti | ingressi, uscite, giocatori presenti |

## Piano gratuito di Render: cosa aspettarsi

- Dopo 15 minuti senza traffico il servizio si addormenta; il primo collegamento successivo
  lo risveglia in circa un minuto. Nel menu compare «Server non raggiungibile, nuovo
  tentativo…» finché non è pronto, poi il pulsante di ingresso si attiva da solo.
- Finché almeno un giocatore è collegato il servizio resta sveglio.
- Render può riavviare il servizio in qualsiasi momento: i giocatori vengono ricollegati
  automaticamente, i punteggi ripartono da zero.

## Problemi comuni

| Sintomo | Soluzione |
|---|---|
| «Server non configurato» nel menu | Scrivi l'indirizzo di Render in `SERVER_URL` (`client/js/config.js`) e ripubblica. |
| «Server non raggiungibile» che non passa | Apri l'indirizzo di Render nel browser: deve rispondere `online`. Controlla che `SERVER_URL` inizi con `https://` e non finisca con `/`. Se hai impostato `CLIENT_ORIGIN`, deve coincidere con l'indirizzo del sito. |
| Pagina bianca aprendo `index.html` | Il file è stato aperto come `file://`: usa l'anteprima di Acode o un server locale. |
| Una faccia non compare | Controlla che il nome del file in `FACES` sia identico a quello in `assets/faces/` (maiuscole comprese). |
| Dopo un aggiornamento qualcuno vede la versione vecchia | Ricaricare la pagina; client diversi con mappe diverse vedono muri in posti diversi. |
| Il mouse non si blocca | Clicca su «Riprendi»; dopo `Esc` il browser impone circa un secondo di attesa. |

## Librerie incluse

- [three.js](https://threejs.org) r187, licenza MIT. `client/vendor/three.module.min.js` è la
  build ufficiale (`three.module.js` + `three.core.js`) unita e minimizzata con esbuild. Per
  aggiornarla: `npm install three esbuild` e poi
  `npx esbuild node_modules/three/build/three.module.js --bundle --minify --format=esm --outfile=client/vendor/three.module.min.js`.
- [Socket.IO](https://socket.io) 4.8.4, licenza MIT: `client/vendor/socket.io.esm.min.js`
  (dal pacchetto `socket.io-client`) nel client, pacchetto `socket.io` nel server.

I testi delle licenze sono in `client/vendor/`.
