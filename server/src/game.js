// Logica di gioco autorevole: il server possiede salute, danni, eliminazioni e punteggi.
// Movimento e mira restano ai client (il server li ridistribuisce a tutti); i colpi a
// segno vengono segnalati da chi spara e accettati solo se plausibili.

import { performance } from 'node:perf_hooks';
import { clamp, cleanFace, cleanName, isVector, wrapAngle } from './validate.js';

const ROOM = 'arena';
const EYE_HEIGHT = 1.62; // altezza degli occhi rispetto ai piedi
const CHEST_HEIGHT = 1.0;
const SHOT_BURST = 3; // spari ravvicinati tollerati: assorbe gli sbalzi di rete
const ORIGIN_TOLERANCE = 5; // metri tra posizione nota e origine dichiarata dello sparo
const AIM_TOLERANCE = 4.5; // metri tra traiettoria e bersaglio, che intanto si è mosso
const TRAVEL_SLACK = 0.4; // secondi di margine sul tempo di volo

const round2 = (value) => Math.round(value * 100) / 100;
const round3 = (value) => Math.round(value * 1000) / 1000;

export function createGame(io, { rules, limits, accessCode }) {
  const players = new Map(); // socket.id -> giocatore
  const byId = new Map(); // id breve -> giocatore
  let nextId = 1;

  const lobbyInfo = () => ({
    players: players.size,
    max: rules.maxPlayers,
    needCode: accessCode !== '',
  });

  const publicPlayer = (p) => ({
    id: p.id,
    name: p.name,
    face: p.face,
    x: round2(p.x),
    y: round2(p.y),
    z: round2(p.z),
    yaw: round3(p.yaw),
    pitch: round3(p.pitch),
    hp: p.hp,
    alive: p.alive,
    kills: p.kills,
    deaths: p.deaths,
  });

  // Un payload inatteso non deve mai far cadere il server per tutti.
  function handle(socket, event, handler) {
    socket.on(event, (...args) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`Errore nell'evento "${event}":`, error);
      }
    });
  }

  function removePlayer(socket, reason) {
    const player = players.get(socket.id);
    if (!player) return;
    clearTimeout(player.spawnTimer);
    players.delete(socket.id);
    byId.delete(player.id);
    socket.leave(ROOM);
    io.to(ROOM).emit('playerLeft', { id: player.id });
    io.emit('lobby', lobbyInfo());
    console.log(`[-] ${player.name} (#${player.id}) è uscito: ${reason}. In arena: ${players.size}`);
  }

  function spawn(player, x, y, z, yaw) {
    if (!players.has(player.socketId) || player.alive) return;
    player.x = x;
    player.y = y;
    player.z = z;
    player.yaw = yaw;
    player.pitch = 0;
    player.hp = rules.maxHealth;
    player.alive = true;
    player.shots.clear();
    io.to(ROOM).emit('spawned', {
      id: player.id,
      x: round2(x),
      y: round2(y),
      z: round2(z),
      yaw: round3(yaw),
      hp: player.hp,
    });
  }

  function damage(target, attacker, amount, head, shotId) {
    target.hp = Math.max(0, target.hp - amount);
    io.to(ROOM).emit('damaged', {
      id: target.id,
      by: attacker.id,
      shot: shotId,
      hp: target.hp,
      head,
    });
    if (target.hp > 0) return;

    target.alive = false;
    target.deaths += 1;
    attacker.kills += 1;
    target.respawnAt = Date.now() + rules.respawnDelay;
    io.to(ROOM).emit('died', {
      id: target.id,
      by: attacker.id,
      head,
      kills: attacker.kills,
      deaths: target.deaths,
      respawnIn: rules.respawnDelay,
    });
  }

  // Limite di cadenza a "gettoni": 1 sparo ogni fireInterval, con una piccola riserva.
  function takeShotToken(player, now) {
    const refill = (now - player.tokensAt) / rules.fireInterval;
    player.tokens = Math.min(SHOT_BURST, player.tokens + refill);
    player.tokensAt = now;
    if (player.tokens < 1) return false;
    player.tokens -= 1;
    return true;
  }

  function forgetOldShots(player, now) {
    const maxAge = (rules.projectileLife + 1) * 1000;
    for (const [id, shot] of player.shots) {
      if (now - shot.t > maxAge) player.shots.delete(id);
    }
  }

  io.on('connection', (socket) => {
    socket.emit('hello', lobbyInfo());

    handle(socket, 'join', (data, ack) => {
      if (typeof ack !== 'function') return;
      if (players.has(socket.id)) return ack({ ok: false, error: 'already-joined' });
      const profile = data && typeof data === 'object' ? data : {};
      if (accessCode !== '' && profile.code !== accessCode) {
        return ack({ ok: false, error: 'bad-code' });
      }
      if (players.size >= rules.maxPlayers) return ack({ ok: false, error: 'full' });

      const player = {
        id: nextId++,
        socketId: socket.id,
        name: cleanName(profile.name, limits.nameLength),
        face: cleanFace(profile.face),
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        hp: 0,
        alive: false, // diventa vivo quando il client comunica il punto di ingresso
        kills: 0,
        deaths: 0,
        respawnAt: 0,
        spawnTimer: null,
        tokens: SHOT_BURST,
        tokensAt: Date.now(),
        shots: new Map(), // proiettili in volo: id -> origine, direzione, istante
      };
      players.set(socket.id, player);
      byId.set(player.id, player);
      socket.join(ROOM);

      ack({
        ok: true,
        id: player.id,
        rules,
        players: Array.from(players.values(), publicPlayer),
      });
      socket.to(ROOM).emit('playerJoined', publicPlayer(player));
      io.emit('lobby', lobbyInfo());
      console.log(`[+] ${player.name} (#${player.id}) è entrato. In arena: ${players.size}`);
    });

    // Il client sceglie dove (ri)entrare, perché la mappa vive nel client;
    // il server decide quando: mai prima che sia scaduta l'attesa.
    handle(socket, 'spawn', (position) => {
      const player = players.get(socket.id);
      if (!player || player.alive || !isVector(position, 4)) return;
      const x = clamp(position[0], -limits.world, limits.world);
      const y = clamp(position[1], limits.minY, limits.maxY);
      const z = clamp(position[2], -limits.world, limits.world);
      const yaw = wrapAngle(position[3]);
      clearTimeout(player.spawnTimer);
      const wait = player.respawnAt - Date.now();
      if (wait > 0) player.spawnTimer = setTimeout(() => spawn(player, x, y, z, yaw), wait);
      else spawn(player, x, y, z, yaw);
    });

    handle(socket, 'state', (state) => {
      const player = players.get(socket.id);
      if (!player || !player.alive || !isVector(state, 5)) return;
      player.x = clamp(state[0], -limits.world, limits.world);
      player.y = clamp(state[1], limits.minY, limits.maxY);
      player.z = clamp(state[2], -limits.world, limits.world);
      player.yaw = wrapAngle(state[3]);
      player.pitch = clamp(state[4], -1.6, 1.6);
    });

    handle(socket, 'shoot', (msg) => {
      const player = players.get(socket.id);
      if (!player || !player.alive || !msg || typeof msg !== 'object') return;
      const { s: shotId, o: origin, d: direction } = msg;
      if (!Number.isSafeInteger(shotId) || !isVector(origin, 3) || !isVector(direction, 3)) return;

      const length = Math.hypot(direction[0], direction[1], direction[2]);
      const drift = Math.hypot(
        origin[0] - player.x,
        origin[1] - (player.y + EYE_HEIGHT),
        origin[2] - player.z,
      );
      if (length < 1e-6 || drift > ORIGIN_TOLERANCE) return;

      const now = Date.now();
      if (!takeShotToken(player, now)) return;
      forgetOldShots(player, now);

      const shot = {
        t: now,
        ox: origin[0],
        oy: origin[1],
        oz: origin[2],
        dx: direction[0] / length,
        dy: direction[1] / length,
        dz: direction[2] / length,
      };
      player.shots.set(shotId, shot);
      socket.to(ROOM).emit('shot', {
        id: player.id,
        s: shotId,
        o: [round2(shot.ox), round2(shot.oy), round2(shot.oz)],
        d: [round3(shot.dx), round3(shot.dy), round3(shot.dz)],
      });
    });

    handle(socket, 'hit', (msg) => {
      const shooter = players.get(socket.id);
      if (!shooter || !msg || typeof msg !== 'object') return;
      const shot = shooter.shots.get(msg.shot);
      if (!shot) return;
      shooter.shots.delete(msg.shot); // ogni proiettile può colpire una volta sola

      const target = byId.get(msg.target);
      if (!target || target === shooter || !target.alive) return;

      // Plausibilità: il bersaglio deve trovarsi vicino alla traiettoria e a una
      // distanza che il proiettile può aver percorso dal momento dello sparo.
      const age = (Date.now() - shot.t) / 1000;
      if (age > rules.projectileLife + TRAVEL_SLACK) return;
      const tx = target.x - shot.ox;
      const ty = target.y + CHEST_HEIGHT - shot.oy;
      const tz = target.z - shot.oz;
      const along = tx * shot.dx + ty * shot.dy + tz * shot.dz;
      const offAxis = Math.sqrt(Math.max(0, tx * tx + ty * ty + tz * tz - along * along));
      const reach = (age + TRAVEL_SLACK) * rules.projectileSpeed + AIM_TOLERANCE;
      if (offAxis > AIM_TOLERANCE || along < -AIM_TOLERANCE || along > reach) return;

      const head = msg.head === true;
      damage(target, shooter, head ? rules.damageHead : rules.damageBody, head, msg.shot);
    });

    // Misura della latenza: il client cronometra l'andata e ritorno.
    handle(socket, 'latency', (ack) => {
      if (typeof ack === 'function') ack();
    });

    handle(socket, 'leave', () => removePlayer(socket, 'ritorno al menu'));
    socket.on('disconnect', (reason) => removePlayer(socket, reason));
  });

  // Fotografia periodica delle posizioni: un solo messaggio per tutti i giocatori.
  // "volatile" = se un client è in ritardo il pacchetto vecchio viene scartato.
  const snapshotTimer = setInterval(() => {
    if (players.size === 0) return;
    const list = [];
    for (const p of players.values()) {
      if (!p.alive) continue;
      list.push([p.id, round2(p.x), round2(p.y), round2(p.z), round3(p.yaw), round3(p.pitch)]);
    }
    io.to(ROOM).volatile.emit('snap', { t: Math.round(performance.now()), p: list });
  }, 1000 / rules.snapshotRate);

  return {
    stats: () => ({ players: players.size, maxPlayers: rules.maxPlayers }),
    close: () => clearInterval(snapshotTimer),
  };
}
