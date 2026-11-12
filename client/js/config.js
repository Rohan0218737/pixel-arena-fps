// Impostazioni del client. È il file da modificare per pubblicare il gioco
// e per aggiungere le facce dei compagni.

export const CONFIG = {
  // Indirizzo del server pubblicato su Render, senza barra finale.
  // Esempio: 'https://pixel-arena-server.onrender.com'
  // Lasciato vuoto, il gioco cerca un server avviato sullo stesso computer (porta qui sotto).
  SERVER_URL: '',
  LOCAL_SERVER_PORT: 3000,

  // Facce dei compagni: una foto PNG con sfondo trasparente per ciascuno, in assets/faces/.
  //   id   = nome breve che viaggia in rete (solo lettere, numeri, "-" e "_")
  //   name = nome mostrato nel menu
  //   file = nome del file dentro assets/faces/
  FACES_PATH: 'assets/faces/',
  FACES: [
    { id: 'compagno1', name: 'Compagno 1', file: 'compagno1.png' },
    { id: 'compagno2', name: 'Compagno 2', file: 'compagno2.png' },
    { id: 'compagno3', name: 'Compagno 3', file: 'compagno3.png' },
    { id: 'compagno4', name: 'Compagno 4', file: 'compagno4.png' },
    { id: 'compagno5', name: 'Compagno 5', file: 'compagno5.png' },
    { id: 'compagno6', name: 'Compagno 6', file: 'compagno6.png' },
  ],

  // Comandi. La sensibilità è il valore di partenza: ogni giocatore può cambiarla
  // dal menu di pausa (1 = normale, 2 = rotazione due volte più rapida).
  MOUSE_SENSITIVITY: 1,
  TOUCH_SENSITIVITY: 1,
  FOV: 75, // ampiezza verticale della visuale, in gradi

  // Movimento (metri e secondi)
  WALK_SPEED: 6.5,
  SPRINT_SPEED: 9.5,
  JUMP_SPEED: 7.6, // con questa gravità si salta circa 1,25 m: abbastanza per le casse da 1 m
  GRAVITY: 22,

  // Arma (solo lato client: la cadenza di tiro la decide il server)
  MAGAZINE_SIZE: 12,
  RELOAD_TIME: 1.3,

  // Grafica
  SHADOWS: true, // sui dispositivi touch le ombre sono sempre spente
  MAX_PIXEL_RATIO: 2,

  // Audio (0 = muto, 1 = massimo)
  VOLUME: 0.6,

  // Rete
  SEND_RATE: 20, // invii al secondo della propria posizione
  INTERPOLATION_DELAY: 100, // ms di ritardo con cui si disegnano gli altri: movimento fluido
};

// Regole usate nella prova offline. In partita arrivano dal server (server/src/config.js).
export const OFFLINE_RULES = {
  maxPlayers: 12,
  maxHealth: 100,
  damageBody: 20,
  damageHead: 40,
  fireInterval: 150,
  projectileSpeed: 75,
  projectileLife: 1.6,
  respawnDelay: 3000,
  snapshotRate: 20,
};
