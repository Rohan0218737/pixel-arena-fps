// Collegamento al server di gioco tramite Socket.io.

import { io } from 'socket.io-client';
import { CONFIG } from './config.js';

const SERVER_EVENTS = ['hello', 'lobby', 'playerJoined', 'playerLeft', 'snap', 'shot', 'damaged', 'died', 'spawned'];
const PING_EVERY = 2000;

const round3 = (value) => Math.round(value * 1000) / 1000;

function isLocalHost(host) {
  return (
    host === 'localhost' ||
    host === '[::1]' ||
    host.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  );
}

export class Network {
  constructor() {
    const configured = CONFIG.SERVER_URL.trim().replace(/\/+$/, '');
    const host = window.location.hostname || 'localhost';
    const scheme = window.location.protocol === 'https:' ? 'https' : 'http';
    this.url = configured || `${scheme}://${host}:${CONFIG.LOCAL_SERVER_PORT}`;
    // Sito pubblicato senza indirizzo del server: inutile tentare, serve SERVER_URL.
    this.misconfigured = !configured && !isLocalHost(host);
    this.socket = null;
    this.connected = false;
    this.ping = 0;
    this.handlers = new Map();
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  dispatch(event, data) {
    for (const handler of this.handlers.get(event) || []) handler(data);
  }

  connect() {
    if (this.misconfigured || this.socket) return;
    const socket = io(this.url, {
      // WebSocket subito; se la rete lo blocca si ripiega sul collegamento HTTP.
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this.connected = true;
      this.dispatch('connect');
    });
    socket.on('disconnect', (reason) => {
      this.connected = false;
      this.dispatch('disconnect', reason);
      // Se è il server a chiudere, Socket.io non riprova da solo.
      if (reason === 'io server disconnect') socket.connect();
    });
    socket.on('connect_error', (error) => this.dispatch('error', error));
    for (const event of SERVER_EVENTS) socket.on(event, (data) => this.dispatch(event, data));

    setInterval(() => {
      if (!this.connected) return;
      const sentAt = performance.now();
      socket.timeout(4000).emit('latency', (error) => {
        if (!error) this.ping = Math.round(performance.now() - sentAt);
      });
    }, PING_EVERY);
  }

  /** Chiede di entrare in arena; si risolve con la risposta del server. */
  join(profile) {
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error('non connesso'));
      this.socket.timeout(10000).emit('join', profile, (error, response) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }

  // I messaggi di gioco partono solo a connessione attiva: Socket.io altrimenti li
  // metterebbe in coda e li consegnerebbe, ormai vecchi, alla riconnessione.
  send(event, data) {
    if (this.connected) this.socket.emit(event, data);
  }

  leave() {
    this.send('leave');
  }

  spawn(x, y, z, yaw) {
    this.send('spawn', [round3(x), round3(y), round3(z), round3(yaw)]);
  }

  /** Posizione e sguardo: "volatile" perché conta solo l'ultimo valore. */
  state(x, y, z, yaw, pitch) {
    if (!this.connected) return;
    this.socket.volatile.emit('state', [round3(x), round3(y), round3(z), round3(yaw), round3(pitch)]);
  }

  shoot(shot, origin, direction) {
    this.send('shoot', {
      s: shot,
      o: [round3(origin.x), round3(origin.y), round3(origin.z)],
      d: [round3(direction.x), round3(direction.y), round3(direction.z)],
    });
  }

  hit(shot, target, head) {
    this.send('hit', { shot, target, head });
  }
}
