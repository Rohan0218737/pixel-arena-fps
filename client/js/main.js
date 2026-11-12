// Punto di ingresso: crea i sottosistemi del gioco e li fa lavorare insieme.
//   menu -> ingresso in arena (online) oppure prova offline -> ciclo di gioco

import * as THREE from 'three';
import { Sfx } from './audio.js';
import { CONFIG, OFFLINE_RULES } from './config.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Menu } from './menu.js';
import { Network } from './net.js';
import { OfflineArena } from './offline.js';
import { LocalPlayer } from './player.js';
import { Projectiles } from './projectiles.js';
import { RemotePlayers } from './remotes.js';
import { TouchControls } from './touch.js';
import { $, wrapAngle } from './utils.js';
import { Weapon } from './weapon.js';
import { buildWorld } from './world.js';

const IDLE = { x: 0, z: 0 };
const HEARING_RANGE = 70; // metri oltre i quali gli spari altrui non si sentono
const JOIN_ERRORS = {
  'bad-code': 'Codice arena errato.',
  full: "L'arena è piena: riprova tra poco.",
  'already-joined': 'Risulti già in partita: ricarica la pagina.',
};

const eye = new THREE.Vector3();
const aim = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = $('game');
    this.input = new Input(this.canvas);
    document.body.classList.toggle('touch', this.input.touch);

    // Sui dispositivi touch si alleggerisce la grafica: niente ombre né antialiasing.
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.input.touch,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.input.touch ? 1.5 : CONFIG.MAX_PIXEL_RATIO),
    );
    this.renderer.autoClear = false; // l'arma viene disegnata sopra la scena del mondo
    const shadows = CONFIG.SHADOWS && !this.input.touch;
    this.renderer.shadowMap.enabled = shadows;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.FOV, 1, 0.1, 900);
    this.world = buildWorld(this.scene, { shadows });
    this.effects = new Effects(this.scene);
    this.projectiles = new Projectiles(this.scene, this.world, this.effects);
    this.remotes = new RemotePlayers(this.scene);
    this.player = new LocalPlayer(this.camera, this.world);
    this.weapon = new Weapon();
    this.sfx = new Sfx();
    this.hud = new Hud();
    this.net = new Network();
    this.offline = new OfflineArena(this);
    this.menu = new Menu({
      onPlay: (profile) => this.play(profile),
      onOffline: (profile) => this.playOffline(profile),
    });

    this.mode = 'menu'; // 'menu' | 'online' | 'offline'
    this.rules = OFFLINE_RULES;
    this.me = { id: 0, name: '', face: '', hp: 0, alive: false, kills: 0, deaths: 0 };
    this.profile = null;
    this.joining = false;
    this.reconnecting = false;
    this.paused = false; // solo touch: su PC la pausa coincide con il mouse sbloccato
    this.shotCounter = 0;
    this.nextSendAt = 0;
    this.respawnAt = 0;
    this.menuAngle = 0.6;
    this.hudClock = 0;
    this.lastFrame = performance.now();
    this.onLocalHit = this.onLocalHit.bind(this);

    this.bindInput();
    this.bindNetwork();
    this.hud.setMuted(this.sfx.muted);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.net.connect();
    requestAnimationFrame(() => this.frame());
  }

  // ---------------------------------------------------------------- comandi e pulsanti

  bindInput() {
    const input = this.input;
    input.onLockChange = () => this.syncPause();
    input.onLockError = () =>
      this.hud.setPauseHint('Il browser non ha bloccato il mouse: attendi un secondo e riprova.');
    input.onKey = (code, down) => {
      if (code === 'Tab') this.showScoreboard(down);
      if (!down) return;
      if (code === 'KeyR' && this.canAct()) this.weapon.reload();
      if (code === 'KeyM') this.toggleMute();
    };

    this.weapon.onReloadStart = () => this.sfx.reloadStart();
    this.weapon.onReloadEnd = () => this.sfx.reloadEnd();

    this.touchControls = new TouchControls(input, {
      onPause: () => this.setPaused(true),
      onReload: () => {
        if (this.canAct()) this.weapon.reload();
      },
      onScore: () => this.showScoreboard(!this.hud.scoreboardVisible),
    });

    $('pause').addEventListener('click', (event) => {
      if (!event.target.closest('button, label')) this.resume();
    });
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-mute').addEventListener('click', () => this.toggleMute());
    $('btn-leave').addEventListener('click', () => this.leaveToMenu());
    $('btn-netlost-leave').addEventListener('click', () => this.leaveToMenu());

    const slider = $('sensitivity');
    const showSensitivity = () => ($('sensitivity-value').textContent = input.sensitivity.toFixed(1));
    slider.value = String(input.sensitivity);
    showSensitivity();
    slider.addEventListener('input', () => {
      input.setSensitivity(Number(slider.value));
      showSensitivity();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) input.release();
    });
  }

  /** Il giocatore può muoversi e sparare: vivo, connesso e non in pausa. */
  canAct() {
    if (this.mode === 'menu' || this.reconnecting || !this.me.alive) return false;
    return this.input.touch ? !this.paused : this.input.locked;
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.input.release();
    this.syncPause();
  }

  resume() {
    if (this.input.touch) this.setPaused(false);
    else this.input.requestLock();
  }

  // Allinea la schermata di pausa allo stato reale del gioco.
  syncPause() {
    const inSession = this.mode !== 'menu' && !this.reconnecting;
    const paused = inSession && (this.input.touch ? this.paused : !this.input.locked);
    this.hud.showPause(paused);
    $('touch-ui').classList.toggle('hidden', !(inSession && this.input.touch && !paused));
  }

  toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    this.hud.setMuted(this.sfx.muted);
  }

  showScoreboard(visible) {
    const show = visible && this.mode !== 'menu';
    if (show) this.hud.setScoreboard(this.scoreRows());
    this.hud.showScoreboard(show);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.weapon.setAspect(width / height);
  }

  // ---------------------------------------------------------------- rete

  bindNetwork() {
    const net = this.net;
    if (net.misconfigured) {
      this.menu.setStatus('offline', "Server non configurato: scrivi l'indirizzo di Render in js/config.js (SERVER_URL).");
    }

    const onLobby = (info) => this.menu.setLobby(info);
    net.on('hello', onLobby);
    net.on('lobby', onLobby);
    net.on('connect', () => {
      if (this.reconnecting) this.rejoin();
    });
    net.on('disconnect', () => {
      this.menu.setOnline(false);
      this.menu.setStatus('connecting', 'Connessione al server…');
      if (this.mode === 'online') this.suspend();
    });
    net.on('error', () => {
      if (net.connected) return;
      this.menu.setStatus(
        'offline',
        'Server non raggiungibile, nuovo tentativo in corso… Su Render il primo avvio può richiedere circa un minuto.',
      );
    });

    // Gli eventi di gioco contano solo mentre si è in arena.
    const inArena = (handler) => (msg) => {
      if (this.mode === 'online' && !this.reconnecting) handler.call(this, msg);
    };
    net.on('playerJoined', inArena(this.onPlayerJoined));
    net.on('playerLeft', inArena(this.onPlayerLeft));
    net.on('snap', inArena((snapshot) => this.remotes.onSnapshot(snapshot)));
    net.on('shot', inArena(this.onShot));
    net.on('damaged', inArena(this.onDamaged));
    net.on('died', inArena(this.onDied));
    net.on('spawned', inArena(this.onSpawned));
  }

  async play(profile) {
    if (this.mode !== 'menu' || this.joining) return;
    this.joining = true;
    this.menu.clearError();
    this.menu.setBusy(true);
    // Audio e blocco del mouse vanno chiesti subito, dentro il click dell'utente.
    this.sfx.unlock();
    this.input.requestLock();
    this.enterFullscreen();
    try {
      const response = await this.net.join(profile);
      if (response.ok) {
        this.profile = profile;
        this.beginSession('online', response);
      } else {
        this.abortJoin(JOIN_ERRORS[response.error] || 'Ingresso in arena non riuscito.');
      }
    } catch {
      this.abortJoin('Il server non risponde. Riprova tra qualche secondo.');
    } finally {
      this.joining = false;
      this.menu.setBusy(false);
    }
  }

  abortJoin(message) {
    if (document.pointerLockElement) document.exitPointerLock();
    this.menu.showError(message);
  }

  playOffline(profile) {
    if (this.mode !== 'menu' || this.joining) return;
    this.sfx.unlock();
    this.input.requestLock();
    this.enterFullscreen();
    this.profile = profile;
    this.beginSession('offline', this.offline.start(profile));
    this.hud.addNotice('Prova offline: colpisci i manichini!');
  }

  // Sul telefono il gioco occupa tutto lo schermo (se il browser lo permette).
  enterFullscreen() {
    if (!this.input.touch || document.fullscreenElement) return;
    const request = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    if (request && request.catch) request.catch(() => {});
  }

  /** response ha la forma della risposta del server: { id, rules, players }. */
  beginSession(mode, response) {
    const mine = response.players.find((player) => player.id === response.id);
    this.mode = mode;
    this.rules = response.rules;
    this.reconnecting = false;
    this.paused = false;
    this.me = { id: response.id, name: mine.name, face: mine.face, hp: 0, alive: false, kills: 0, deaths: 0 };
    this.shotCounter = 0;
    this.respawnAt = 0;
    this.player.alive = false;

    this.remotes.clear();
    this.projectiles.clear();
    for (const info of response.players) {
      if (info.id === response.id) continue;
      this.remotes.add(info).avatar.setHealth(info.hp / this.rules.maxHealth);
    }

    this.input.capture = true;
    document.body.classList.add('playing');
    this.menu.hide();
    this.hud.showNetLost(false);
    this.hud.show(true);
    this.hud.setHealth(0, this.rules.maxHealth);
    this.refreshScores();
    this.updateNetInfo();
    this.syncPause();
    this.requestSpawn();
  }

  leaveToMenu(message) {
    if (this.mode === 'online') this.net.leave();
    if (this.mode === 'offline') this.offline.stop();
    this.mode = 'menu';
    this.reconnecting = false;
    this.paused = false;
    this.me.alive = false;
    this.remotes.clear();
    this.projectiles.clear();
    this.input.capture = false;
    this.input.release();
    if (document.pointerLockElement) document.exitPointerLock();

    document.body.classList.remove('playing');
    this.hud.show(false);
    this.hud.showNetLost(false);
    this.syncPause();
    this.menu.show();
    if (message) this.menu.showError(message);
  }

  // Connessione caduta in partita: si aspetta il ritorno del server e si rientra da soli.
  suspend() {
    this.reconnecting = true;
    this.remotes.clear();
    this.projectiles.clear();
    this.input.release();
    this.hud.showNetLost(true);
    this.syncPause();
  }

  async rejoin() {
    try {
      const response = await this.net.join(this.profile);
      if (this.mode !== 'online') return; // nel frattempo l'utente è tornato al menu
      if (response.ok) this.beginSession('online', response);
      else this.leaveToMenu(JOIN_ERRORS[response.error] || 'Rientro in arena non riuscito.');
    } catch {
      if (this.mode === 'online' && this.net.connected) this.leaveToMenu('Il server non risponde.');
    }
  }

  // ---------------------------------------------------------------- ingresso in campo

  requestSpawn() {
    const point = this.pickSpawn();
    this.player.teleport(point.x, 0, point.z, point.yaw);
    if (this.mode === 'online') this.net.spawn(point.x, 0, point.z, point.yaw);
    else this.offline.spawnLocal(point);
  }

  // Il punto più lontano dagli avversari vivi (con un pizzico di casualità);
  // a campo vuoto, uno qualsiasi.
  pickSpawn() {
    const points = this.world.spawnPoints;
    let best = points[Math.floor(Math.random() * points.length)];
    let bestScore = -1;
    for (const point of points) {
      let nearest = Infinity;
      for (const other of this.remotes.values()) {
        if (other.alive) nearest = Math.min(nearest, Math.hypot(point.x - other.x, point.z - other.z));
      }
      if (nearest === Infinity) continue;
      const score = nearest * (0.85 + Math.random() * 0.3);
      if (score > bestScore) {
        bestScore = score;
        best = point;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- eventi di gioco
  // Arrivano dal server oppure, nella prova offline, da offline.js: stessa forma.

  playerById(id) {
    return id === this.me.id ? this.me : this.remotes.get(id);
  }

  onPlayerJoined(info) {
    this.remotes.add(info);
    this.hud.addNotice(`${info.name} è entrato nell'arena`);
    this.refreshScores();
    this.updateNetInfo();
  }

  onPlayerLeft(msg) {
    const player = this.remotes.get(msg.id);
    if (!player) return;
    this.hud.addNotice(`${player.name} ha lasciato l'arena`);
    this.remotes.remove(msg.id);
    this.refreshScores();
    this.updateNetInfo();
  }

  onSpawned(msg) {
    if (msg.id !== this.me.id) {
      this.remotes.spawn(msg, this.rules.maxHealth);
      return;
    }
    this.me.alive = true;
    this.me.hp = msg.hp;
    this.respawnAt = 0;
    this.player.revive();
    this.weapon.reset();
    this.hud.hideDeath();
    this.hud.setHealth(msg.hp, this.rules.maxHealth);
    this.sfx.spawn();
  }

  onShot(msg) {
    eye.fromArray(msg.o);
    aim.fromArray(msg.d);
    this.projectiles.spawn(eye, aim, {
      owner: msg.id,
      shot: msg.s,
      local: false,
      speed: this.rules.projectileSpeed,
      life: this.rules.projectileLife,
    });
    this.remotes.get(msg.id)?.avatar.showMuzzleFlash();
    const distance = eye.distanceTo(this.camera.position);
    this.sfx.shoot(Math.max(0, 1 - distance / HEARING_RANGE) * 0.8);
  }

  onDamaged(msg) {
    // Il proiettile che ha colpito sparisce per tutti nello stesso momento.
    const impact = this.projectiles.removeShot(msg.by, msg.shot);

    if (msg.id === this.me.id) {
      this.me.hp = msg.hp;
      this.hud.setHealth(msg.hp, this.rules.maxHealth);
      this.hud.flashDamage();
      this.sfx.hurt();
      const attacker = this.remotes.get(msg.by);
      if (attacker) {
        // Direzione dell'attaccante rispetto allo sguardo: 0 davanti, positivo a destra.
        const p = this.player.position;
        const bearing = Math.atan2(attacker.x - p.x, -(attacker.z - p.z));
        this.hud.damageFrom(wrapAngle(bearing + this.player.yaw));
      }
    } else {
      const victim = this.remotes.get(msg.id);
      if (victim) {
        victim.hp = msg.hp;
        victim.avatar.setHealth(msg.hp / this.rules.maxHealth);
        victim.avatar.flash();
        const at = impact || eye.set(victim.x, victim.y + (msg.head ? 1.65 : 1.1), victim.z);
        this.effects.burst(at, 0xff4d4d, 10, 4);
      }
    }

    if (msg.by === this.me.id) {
      this.hud.hitMarker(msg.head);
      this.sfx.hit(msg.head);
      if (msg.head) this.hud.centerMessage('Colpo in testa!', true);
    }
  }

  onDied(msg) {
    const victim = this.playerById(msg.id);
    const killer = this.playerById(msg.by);
    if (victim) victim.deaths = msg.deaths;
    if (killer) killer.kills = msg.kills;
    const killerName = killer ? killer.name : 'qualcuno';
    const iKilled = msg.by === this.me.id;
    const iDied = msg.id === this.me.id;
    this.hud.addKill(killerName, victim ? victim.name : '?', msg.head, iKilled, iDied);

    if (iDied) {
      this.me.alive = false;
      this.me.hp = 0;
      this.player.alive = false;
      this.input.firing = false;
      this.respawnAt = performance.now() + msg.respawnIn;
      this.hud.setHealth(0, this.rules.maxHealth);
      this.hud.showDeath(killerName);
      this.sfx.death();
    } else {
      this.remotes.kill(msg.id);
      if (iKilled && victim) {
        this.hud.centerMessage(`Hai eliminato ${victim.name}`);
        this.sfx.kill();
      }
    }
    this.refreshScores();
  }

  // Un proprio proiettile ha raggiunto un avversario: lo si segnala a chi tiene i conti.
  onLocalHit(target, head, shot, position) {
    this.effects.burst(position, 0xfff0a0, 4, 2, 0.05);
    if (this.mode === 'online') this.net.hit(shot, target.id, head);
    else this.offline.hit(target, head, shot);
  }

  scoreRows() {
    const rows = [{ ...this.me, me: true }];
    for (const player of this.remotes.values()) rows.push({ ...player, me: false });
    return rows.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  }

  refreshScores() {
    this.hud.setScore(this.me.kills, this.me.deaths);
    if (this.hud.scoreboardVisible) this.hud.setScoreboard(this.scoreRows());
  }

  updateNetInfo() {
    this.hud.setNet(this.mode === 'online' ? this.net.ping : null, this.remotes.size + 1);
  }

  // ---------------------------------------------------------------- ciclo di gioco

  frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.update(dt, now);
    this.render();
  }

  update(dt, now) {
    const look = this.input.consumeLook();

    if (this.mode === 'menu') {
      // Dietro al menu la telecamera gira lentamente attorno all'arena.
      this.menuAngle += dt * 0.07;
      this.camera.position.set(Math.cos(this.menuAngle) * 44, 17, Math.sin(this.menuAngle) * 44);
      this.camera.lookAt(0, 2, 0);
    } else {
      const active = this.canAct();
      if (active) this.player.look(look.x, look.y);
      this.player.update(dt, active ? this.input.move : IDLE, active && this.input.jump, active && this.input.sprint);
      if (active && this.input.firing) this.fire(now);

      if (this.mode === 'offline') this.offline.update(dt);
      this.remotes.update(dt);
      this.projectiles.update(dt, this.remotes, this.onLocalHit);
      this.player.updateCamera(dt);
      this.weapon.update(dt, {
        speed: this.player.speed,
        onGround: this.player.onGround,
        lookX: active ? look.x : 0,
        lookY: active ? look.y : 0,
      });

      this.sendState(now);
      this.updateRespawn(now);
      this.hud.setAmmo(this.weapon.ammo, CONFIG.MAGAZINE_SIZE, this.weapon.reloading);
      this.hudClock += dt;
      if (this.hudClock > 0.5) {
        this.hudClock = 0;
        this.updateNetInfo();
      }
    }

    this.effects.update(dt);
    this.world.update(dt, this.camera.position);
  }

  fire(now) {
    if (!this.weapon.tryFire(now, this.rules.fireInterval)) return;
    this.player.eyePosition(eye);
    this.player.aimDirection(aim);
    const shot = ++this.shotCounter;
    this.projectiles.spawn(eye, aim, {
      owner: this.me.id,
      shot,
      local: true,
      speed: this.rules.projectileSpeed,
      life: this.rules.projectileLife,
    });
    if (this.mode === 'online') this.net.shoot(shot, eye, aim);
    this.sfx.shoot();
  }

  sendState(now) {
    if (this.mode !== 'online' || !this.me.alive || now < this.nextSendAt) return;
    this.nextSendAt = now + 1000 / CONFIG.SEND_RATE;
    const p = this.player.position;
    this.net.state(p.x, p.y, p.z, this.player.yaw, this.player.pitch);
  }

  // Da eliminati: conto alla rovescia, poi richiesta di rientro in campo.
  updateRespawn(now) {
    if (this.me.alive || this.respawnAt === 0 || this.reconnecting) return;
    this.hud.setDeathTimer(Math.max(0, Math.ceil((this.respawnAt - now) / 1000)));
    if (now < this.respawnAt) return;
    this.respawnAt = 0;
    this.requestSpawn();
  }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.mode !== 'menu' && this.me.alive) {
      this.renderer.clearDepth();
      this.renderer.render(this.weapon.scene, this.weapon.camera);
    }
  }
}

try {
  // Accessibile dalla console del browser per curiosare nello stato del gioco.
  window.pixelArena = new Game();
} catch (error) {
  console.error(error);
  $('fatal-text').textContent =
    'Questo browser non riesce ad avviare la grafica 3D (WebGL 2). Aggiornalo oppure prova con un altro dispositivo.';
  $('fatal').classList.remove('hidden');
  $('menu').classList.add('hidden');
}
