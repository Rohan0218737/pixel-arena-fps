// Punto di ingresso del server di gioco (da pubblicare su Render).
// Espone solo WebSocket (Socket.io) più due pagine di servizio: "/" e "/healthz".
// Il sito del gioco (cartella client/) viene pubblicato a parte su Netlify.

import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ACCESS_CODE, CLIENT_ORIGINS, LIMITS, PORT, RULES } from './src/config.js';
import { createGame } from './src/game.js';

const startedAt = Date.now();
const anyOrigin = CLIENT_ORIGINS.length === 0;
// Le richieste senza intestazione Origin (strumenti, controlli di salute) non arrivano
// da una pagina web: il filtro riguarda solo i siti che incorporano il gioco.
const originAllowed = (origin) =>
  anyOrigin || origin === undefined || CLIENT_ORIGINS.includes(origin);

let game = null;

const httpServer = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  const headers = { 'Cache-Control': 'no-store' };

  if (path === '/healthz') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  if (path === '/') {
    const body = {
      name: 'Pixel Arena - server di gioco',
      status: 'online',
      ...game.stats(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body, null, 2));
    return;
  }

  res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

const io = new Server(httpServer, {
  // "cors" vale per il collegamento di riserva HTTP; "allowRequest" anche per WebSocket.
  cors: { origin: anyOrigin ? '*' : CLIENT_ORIGINS, methods: ['GET', 'POST'] },
  allowRequest: (req, callback) => callback(null, originAllowed(req.headers.origin)),
  serveClient: false,
  maxHttpBufferSize: 16 * 1024, // i messaggi di gioco sono minuscoli
  pingInterval: 10000,
  pingTimeout: 10000,
});

game = createGame(io, { rules: RULES, limits: LIMITS, accessCode: ACCESS_CODE });

// 0.0.0.0 è richiesto da Render per ricevere il traffico dall'esterno.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Pixel Arena: server in ascolto sulla porta ${PORT}`);
  console.log(`  Siti autorizzati: ${anyOrigin ? 'tutti' : CLIENT_ORIGINS.join(', ')}`);
  console.log(`  Codice di accesso: ${ACCESS_CODE ? 'attivo' : 'non richiesto'}`);
});

// Render invia SIGTERM a ogni nuova pubblicazione: chiusura ordinata delle connessioni.
function shutdown(signal) {
  console.log(`Ricevuto ${signal}: chiusura del server.`);
  game.close();
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
