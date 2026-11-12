// Configurazione del server: variabili d'ambiente e regole di gioco.
// Le regole vengono inviate a ogni client quando entra nell'arena, quindi per
// bilanciare il gioco basta modificare questo file e ripubblicare il server.

function listFromEnv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function intFromEnv(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

// Render assegna la porta tramite la variabile PORT; in locale si usa la 3000.
export const PORT = intFromEnv(process.env.PORT, 3000, 1, 65535);

// Siti autorizzati a collegarsi, separati da virgola
// (es. "https://la-mia-arena.netlify.app"). Vuoto = qualsiasi sito.
export const CLIENT_ORIGINS = listFromEnv(process.env.CLIENT_ORIGIN);

// Codice segreto facoltativo per rendere l'arena privata. Vuoto = ingresso libero.
export const ACCESS_CODE = String(process.env.ACCESS_CODE || '').trim();

export const RULES = Object.freeze({
  maxPlayers: intFromEnv(process.env.MAX_PLAYERS, 12, 1, 32),
  maxHealth: 100,
  damageBody: 20, // 5 colpi al corpo per eliminare
  damageHead: 40, // 3 colpi alla testa
  fireInterval: 150, // millisecondi tra due spari
  projectileSpeed: 75, // metri al secondo
  projectileLife: 1.6, // secondi di volo prima di svanire
  respawnDelay: 3000, // millisecondi tra eliminazione e rientro
  snapshotRate: 20, // aggiornamenti di posizione al secondo
});

export const LIMITS = Object.freeze({
  nameLength: 16,
  world: 200, // coordinate orizzontali accettate: da -200 a +200
  minY: -5,
  maxY: 60,
});
