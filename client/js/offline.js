// Prova offline: un poligono di tiro senza server. Ogni faccia configurata diventa un
// manichino, utile per controllare come appaiono le foto dei compagni sul modello.
// Produce gli stessi eventi del server, così il gioco usa un solo percorso di codice.

import { CONFIG, OFFLINE_RULES } from './config.js';
import { damp, wrapAngle } from './utils.js';

const RING_RADIUS = 9.5; // i manichini stanno in cerchio attorno alla pedana centrale
const FIRST_BOT_ID = 100;

export class OfflineArena {
  constructor(game) {
    this.game = game;
    this.homes = new Map(); // id manichino -> posizione di partenza
    this.timers = new Set();
    this.kills = 0;
  }

  /** Stessa forma della risposta del server alla richiesta di ingresso. */
  start(profile) {
    this.stop();
    this.kills = 0;
    const blank = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, kills: 0, deaths: 0 };
    const players = [{ ...blank, id: 1, name: profile.name, face: profile.face, hp: 0, alive: false }];

    CONFIG.FACES.forEach((face, index) => {
      const angle = (index / CONFIG.FACES.length) * Math.PI * 2 + 0.4;
      const home = { x: Math.cos(angle) * RING_RADIUS, z: Math.sin(angle) * RING_RADIUS };
      home.yaw = Math.atan2(-home.x, -home.z); // di spalle al centro
      const id = FIRST_BOT_ID + index;
      this.homes.set(id, home);
      players.push({ ...blank, ...home, id, name: face.name, face: face.id, hp: OFFLINE_RULES.maxHealth, alive: true });
    });

    return { ok: true, id: 1, rules: OFFLINE_RULES, players };
  }

  stop() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.homes.clear();
  }

  later(milliseconds, action) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, milliseconds);
    this.timers.add(timer);
  }

  spawnLocal(spot) {
    this.game.onSpawned({ id: this.game.me.id, x: spot.x, y: 0, z: spot.z, yaw: spot.yaw, hp: OFFLINE_RULES.maxHealth });
  }

  /** Il proiettile del giocatore ha colpito un manichino. */
  hit(bot, head, shot) {
    const game = this.game;
    const hp = Math.max(0, bot.hp - (head ? OFFLINE_RULES.damageHead : OFFLINE_RULES.damageBody));
    game.onDamaged({ id: bot.id, by: game.me.id, shot, hp, head });
    if (hp > 0) return;

    this.kills += 1;
    game.onDied({
      id: bot.id,
      by: game.me.id,
      head,
      kills: this.kills,
      deaths: bot.deaths + 1,
      respawnIn: OFFLINE_RULES.respawnDelay,
    });
    const home = this.homes.get(bot.id);
    this.later(OFFLINE_RULES.respawnDelay, () => {
      game.onSpawned({ id: bot.id, x: home.x, y: 0, z: home.z, yaw: home.yaw, hp: OFFLINE_RULES.maxHealth });
    });
  }

  /** I manichini si girano verso il giocatore: si vede sempre la loro faccia. */
  update(dt) {
    const target = this.game.player.position;
    for (const bot of this.game.remotes.values()) {
      if (!bot.alive) continue;
      const wanted = Math.atan2(bot.x - target.x, bot.z - target.z);
      bot.yaw = wrapAngle(bot.yaw + wrapAngle(wanted - bot.yaw) * damp(0, 1, 5, dt));
      bot.avatar.setPose(bot.x, bot.y, bot.z, bot.yaw, 0);
    }
  }
}
