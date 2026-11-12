// Interfaccia a schermo: salute, munizioni, mirino, eliminazioni, classifica e avvisi.
// I testi che arrivano dalla rete (i nomi) passano sempre da textContent, mai da innerHTML.

import { faceUrl, fallbackFaceUrl } from './faces.js';
import { $, clamp } from './utils.js';

const FEED_LIMIT = 5;
const FEED_SECONDS = 6;
const PAUSE_HINT = 'La partita continua: rientra quando vuoi.';

export class Hud {
  constructor() {
    this.root = $('hud');
    this.el = {
      healthFill: $('health-fill'),
      healthText: $('health-text'),
      ammoCount: $('ammo-count'),
      ammoMax: $('ammo-max'),
      ammoHint: $('ammo-hint'),
      kills: $('score-kills'),
      deaths: $('score-deaths'),
      ping: $('hud-ping'),
      players: $('hud-players'),
      vignette: $('vignette'),
      arrow: $('damage-arrow'),
      hitmarker: $('hitmarker'),
      center: $('center-msg'),
      feed: $('killfeed'),
      death: $('death'),
      deathKiller: $('death-killer'),
      deathTimer: $('death-timer'),
      scoreboard: $('scoreboard'),
      scoreBody: $('scoreboard-body'),
      pause: $('pause'),
      pauseHint: $('pause-hint'),
      netlost: $('netlost'),
      mute: $('btn-mute'),
    };
    this.shown = {}; // ultimi valori scritti: il DOM si tocca solo quando cambiano
    this.timers = {};
  }

  // Scrive un testo solo se è cambiato rispetto all'ultima volta.
  write(key, element, value) {
    if (this.shown[key] === value) return false;
    this.shown[key] = value;
    element.textContent = value;
    return true;
  }

  // Accende una classe CSS per qualche istante, facendo ripartire l'animazione.
  pulse(element, className, milliseconds) {
    const key = element.id + className;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => element.classList.remove(className), milliseconds);
  }

  show(visible) {
    this.root.classList.toggle('hidden', !visible);
    if (visible) return;
    this.hideDeath();
    this.showScoreboard(false);
    this.el.feed.textContent = '';
    this.el.vignette.classList.remove('low', 'show');
  }

  setHealth(hp, max) {
    if (!this.write('hp', this.el.healthText, String(Math.ceil(hp)))) return;
    const fraction = clamp(hp / max, 0, 1);
    this.el.healthFill.style.width = `${fraction * 100}%`;
    this.el.healthFill.style.backgroundColor =
      fraction > 0.5 ? 'var(--ok)' : fraction > 0.25 ? 'var(--accent)' : 'var(--danger)';
    this.el.vignette.classList.toggle('low', hp > 0 && fraction <= 0.25);
  }

  setAmmo(ammo, max, reloading) {
    this.write('ammoMax', this.el.ammoMax, String(max));
    this.write('ammoHint', this.el.ammoHint, reloading ? 'Ricarica…' : '');
    if (this.write('ammo', this.el.ammoCount, String(ammo))) {
      this.el.ammoCount.classList.toggle('low', ammo <= 3);
    }
  }

  setScore(kills, deaths) {
    this.write('kills', this.el.kills, String(kills));
    this.write('deaths', this.el.deaths, String(deaths));
  }

  /** ping in millisecondi, oppure null nella prova offline. */
  setNet(ping, players) {
    this.write('ping', this.el.ping, ping === null ? 'offline' : `${ping} ms`);
    this.write('players', this.el.players, `${players} in arena`);
  }

  hitMarker(head) {
    this.el.hitmarker.classList.toggle('head', head);
    this.pulse(this.el.hitmarker, 'show', 250);
  }

  flashDamage() {
    this.pulse(this.el.vignette, 'show', 90);
  }

  /** Arco rosso verso chi ha sparato: 0 = davanti, valori positivi = a destra (radianti). */
  damageFrom(angle) {
    this.el.arrow.style.transform = `rotate(${angle}rad)`;
    this.pulse(this.el.arrow, 'show', 450);
  }

  centerMessage(text, head = false) {
    this.el.center.textContent = text;
    this.el.center.classList.toggle('head', head);
    this.pulse(this.el.center, 'show', 1500);
  }

  addFeed(item) {
    this.el.feed.append(item);
    while (this.el.feed.children.length > FEED_LIMIT) this.el.feed.firstChild.remove();
    setTimeout(() => item.remove(), FEED_SECONDS * 1000);
  }

  /** mine = l'ho eliminato io, lost = sono stato eliminato io. */
  addKill(killer, victim, head, mine, lost) {
    const item = document.createElement('div');
    item.className = `feed-item${mine ? ' mine' : ''}${lost ? ' lost' : ''}`;
    const name = (text, highlight) => {
      const element = document.createElement('b');
      element.textContent = text;
      if (highlight) element.className = 'me';
      return element;
    };
    const skull = document.createElement('span');
    skull.className = 'skull';
    skull.textContent = '\u2620';
    item.append(name(killer, mine), skull, name(victim, lost));
    if (head) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'TESTA';
      item.append(tag);
    }
    this.addFeed(item);
  }

  addNotice(text) {
    const item = document.createElement('div');
    item.className = 'feed-item notice';
    item.textContent = text;
    this.addFeed(item);
  }

  showDeath(killerName) {
    this.el.deathKiller.textContent = killerName;
    this.el.death.classList.remove('hidden');
    this.root.classList.add('dead');
  }

  setDeathTimer(seconds) {
    this.write('deathTimer', this.el.deathTimer, String(seconds));
  }

  hideDeath() {
    this.el.death.classList.add('hidden');
    this.root.classList.remove('dead');
  }

  get scoreboardVisible() {
    return !this.el.scoreboard.classList.contains('hidden');
  }

  showScoreboard(visible) {
    this.el.scoreboard.classList.toggle('hidden', !visible);
  }

  /** rows: [{ name, face, kills, deaths, me }] già ordinate. */
  setScoreboard(rows) {
    this.el.scoreBody.textContent = '';
    rows.forEach((row, index) => {
      const line = document.createElement('tr');
      if (row.me) line.className = 'me';
      const cell = (content) => {
        const td = document.createElement('td');
        td.append(content);
        line.append(td);
      };
      const image = document.createElement('img');
      image.alt = '';
      image.onerror = () => {
        image.onerror = null;
        image.src = fallbackFaceUrl();
      };
      image.src = faceUrl(row.face) || fallbackFaceUrl();
      cell(String(index + 1));
      cell(image);
      cell(row.name);
      cell(String(row.kills));
      cell(String(row.deaths));
      this.el.scoreBody.append(line);
    });
  }

  showPause(visible) {
    if (visible && this.el.pause.classList.contains('hidden')) this.el.pauseHint.textContent = PAUSE_HINT;
    this.el.pause.classList.toggle('hidden', !visible);
  }

  setPauseHint(text) {
    this.el.pauseHint.textContent = text;
  }

  showNetLost(visible) {
    this.el.netlost.classList.toggle('hidden', !visible);
  }

  setMuted(muted) {
    this.el.mute.textContent = muted ? 'Audio: spento' : 'Audio: attivo';
  }
}
