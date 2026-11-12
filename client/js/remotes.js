// Gli altri giocatori: avatar, punteggi e movimento reso fluido.
// Il server manda 20 posizioni al secondo; qui vengono messe in coda e disegnate con un
// piccolo ritardo, interpolando tra due campioni: niente scatti anche a 60+ fps.

import { Avatar, BODY_TOP, HEAD_TOP } from './avatar.js';
import { segmentVsCylinder } from './collision.js';
import { CONFIG } from './config.js';
import { lerp, lerpAngle } from './utils.js';

const BODY_RADIUS = 0.42;
const HEAD_RADIUS = 0.33;
const BUFFER_LIMIT = 40;

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // id -> giocatore remoto
    this.timeOffset = null; // differenza tra orologio locale e orologio del server
  }

  get size() {
    return this.players.size;
  }

  get(id) {
    return this.players.get(id);
  }

  values() {
    return this.players.values();
  }

  add(info) {
    this.remove(info.id);
    const player = {
      id: info.id,
      name: info.name,
      face: info.face,
      kills: info.kills || 0,
      deaths: info.deaths || 0,
      hp: info.hp,
      alive: info.alive,
      x: info.x,
      y: info.y,
      z: info.z,
      yaw: info.yaw,
      pitch: info.pitch,
      speed: 0,
      buffer: [],
      avatar: new Avatar(info.name, info.face),
    };
    player.avatar.root.visible = info.alive;
    player.avatar.setPose(info.x, info.y, info.z, info.yaw, info.pitch);
    this.scene.add(player.avatar.root);
    this.players.set(info.id, player);
    return player;
  }

  remove(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.avatar.dispose();
    this.players.delete(id);
  }

  clear() {
    for (const id of Array.from(this.players.keys())) this.remove(id);
    this.timeOffset = null;
  }

  /** Il giocatore (ri)entra in campo: niente interpolazione dalla vecchia posizione. */
  spawn(msg, maxHealth) {
    const player = this.players.get(msg.id);
    if (!player) return;
    player.alive = true;
    player.hp = msg.hp;
    player.x = msg.x;
    player.y = msg.y;
    player.z = msg.z;
    player.yaw = msg.yaw;
    player.pitch = 0;
    player.speed = 0;
    player.buffer.length = 0;
    player.avatar.revive();
    player.avatar.setHealth(msg.hp / maxHealth);
    player.avatar.setPose(msg.x, msg.y, msg.z, msg.yaw, 0);
  }

  kill(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.alive = false;
    player.hp = 0;
    player.buffer.length = 0;
    player.avatar.die();
  }

  onSnapshot(snapshot) {
    // Stima scorrevole dello scarto tra i due orologi: assorbe gli sbalzi di latenza.
    const sample = performance.now() - snapshot.t;
    if (this.timeOffset === null || Math.abs(sample - this.timeOffset) > 1000) this.timeOffset = sample;
    else this.timeOffset += (sample - this.timeOffset) * 0.1;

    for (const [id, x, y, z, yaw, pitch] of snapshot.p) {
      const player = this.players.get(id);
      if (!player || !player.alive) continue;
      player.buffer.push({ t: snapshot.t, x, y, z, yaw, pitch });
      if (player.buffer.length > BUFFER_LIMIT) player.buffer.shift();
    }
  }

  update(dt) {
    const renderTime =
      this.timeOffset === null ? 0 : performance.now() - this.timeOffset - CONFIG.INTERPOLATION_DELAY;

    for (const player of this.players.values()) {
      if (player.alive && player.buffer.length > 0) {
        const lastX = player.x;
        const lastZ = player.z;
        this.sample(player, renderTime);
        if (dt > 0) {
          const speed = Math.hypot(player.x - lastX, player.z - lastZ) / dt;
          player.speed += (speed - player.speed) * Math.min(1, dt * 12);
        }
        player.avatar.setPose(player.x, player.y, player.z, player.yaw, player.pitch);
      }
      player.avatar.update(dt, player.alive ? player.speed : 0);
    }
  }

  sample(player, time) {
    const buffer = player.buffer;
    // I campioni più vecchi del necessario non servono più.
    while (buffer.length > 2 && buffer[1].t <= time) buffer.shift();

    const a = buffer[0];
    const b = buffer[1];
    if (!b || time <= a.t) {
      this.copy(player, a);
    } else if (time >= b.t) {
      this.copy(player, b);
    } else {
      const k = (time - a.t) / (b.t - a.t);
      player.x = lerp(a.x, b.x, k);
      player.y = lerp(a.y, b.y, k);
      player.z = lerp(a.z, b.z, k);
      player.yaw = lerpAngle(a.yaw, b.yaw, k);
      player.pitch = lerp(a.pitch, b.pitch, k);
    }
  }

  copy(player, state) {
    player.x = state.x;
    player.y = state.y;
    player.z = state.z;
    player.yaw = state.yaw;
    player.pitch = state.pitch;
  }

  /**
   * Primo giocatore vivo colpito dal segmento p -> p+d, con la frazione percorsa e
   * l'indicazione se il colpo è alla testa. Null se il segmento non colpisce nessuno.
   */
  hitTest(px, py, pz, dx, dy, dz) {
    let best = null;
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const body = segmentVsCylinder(px, py, pz, dx, dy, dz, player.x, player.z, BODY_RADIUS, player.y, player.y + BODY_TOP);
      const head = segmentVsCylinder(px, py, pz, dx, dy, dz, player.x, player.z, HEAD_RADIUS, player.y + BODY_TOP, player.y + HEAD_TOP);
      const t = Math.min(body, head);
      if (t === Infinity || (best && t >= best.t)) continue;
      best = { t, player, head: head < body };
    }
    return best;
  }
}
