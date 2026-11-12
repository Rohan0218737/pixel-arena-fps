// Comandi da tastiera e mouse. Lo sguardo è accumulato in radianti e "consumato" una
// volta per frame; i comandi touch (touch.js) scrivono negli stessi campi.

import { CONFIG } from './config.js';
import { clamp, storage } from './utils.js';

const RADIANS_PER_PIXEL = 0.0022;
const TOUCH_RADIANS_PER_PIXEL = 0.005;
const SPIKE_PIXELS = 600; // alcuni browser ogni tanto segnalano uno scatto enorme: va scartato

// Tasti usati dal gioco: in partita non devono scorrere la pagina o spostare il focus.
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'Tab', 'KeyR', 'KeyM',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.touch = window.matchMedia('(pointer: coarse)').matches;
    // Sensibilità scelta dal giocatore nella pausa; all'inizio vale quella di config.js.
    const base = this.touch ? CONFIG.TOUCH_SENSITIVITY : CONFIG.MOUSE_SENSITIVITY;
    this.sensitivity = clamp(Number(storage.get('sensitivity')) || base, 0.2, 3);
    this.capture = false; // true solo durante la partita
    this.locked = false; // puntatore del mouse bloccato sul gioco
    this.firing = false;
    this.keys = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.stick = { x: 0, y: 0 }; // levetta virtuale: x destra, y verso il basso
    this.touchJump = false;
    this.onKey = () => {};
    this.onLockChange = () => {};
    this.onLockError = () => {};

    window.addEventListener('keydown', (event) => this.handleKey(event, true));
    window.addEventListener('keyup', (event) => this.handleKey(event, false));
    window.addEventListener('blur', () => this.release());

    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      if (Math.abs(event.movementX) > SPIKE_PIXELS || Math.abs(event.movementY) > SPIKE_PIXELS) return;
      this.addLook(event.movementX, event.movementY);
    });
    document.addEventListener('mousedown', (event) => {
      if (this.locked && event.button === 0) this.firing = true;
    });
    document.addEventListener('mouseup', (event) => {
      if (this.locked && event.button === 0) this.firing = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.release();
      this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.onLockError());
  }

  handleKey(event, down) {
    if (!this.capture) return;
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (down) {
      if (event.repeat) return;
      this.keys.add(event.code);
    } else {
      this.keys.delete(event.code);
    }
    this.onKey(event.code, down);
  }

  /** Blocca il mouse sul gioco. Va chiamato dentro un click o un tasto dell'utente. */
  requestLock() {
    if (this.touch || document.pointerLockElement === this.canvas) return;
    try {
      // Movimento "grezzo" senza accelerazione del sistema, dove disponibile.
      const request = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (!request || !request.catch) return;
      request.catch((error) => {
        if (error.name !== 'NotSupportedError') return this.onLockError();
        const retry = this.canvas.requestPointerLock();
        if (retry && retry.catch) retry.catch(() => this.onLockError());
      });
    } catch {
      this.onLockError();
    }
  }

  /** Rilascia tutti i comandi: evita tasti "incastrati" quando si perde il focus. */
  release() {
    this.keys.clear();
    this.firing = false;
    this.touchJump = false;
    this.stick.x = 0;
    this.stick.y = 0;
  }

  /** Aggiunge allo sguardo uno spostamento in pixel del mouse o del dito. */
  addLook(dx, dy) {
    const scale = (this.touch ? TOUCH_RADIANS_PER_PIXEL : RADIANS_PER_PIXEL) * this.sensitivity;
    this.lookX += dx * scale;
    this.lookY += dy * scale;
  }

  setSensitivity(value) {
    this.sensitivity = clamp(value, 0.2, 3);
    storage.set('sensitivity', String(this.sensitivity));
  }

  /** Rotazione accumulata dall'ultimo frame, in radianti. */
  consumeLook() {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  get move() {
    const keys = this.keys;
    let x = this.stick.x;
    let z = -this.stick.y;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    return { x: clamp(x, -1, 1), z: clamp(z, -1, 1) };
  }

  get jump() {
    return this.touchJump || this.keys.has('Space');
  }

  get sprint() {
    // Con la levetta si corre spingendola fino in fondo.
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.stick.x, this.stick.y) > 0.95;
  }
}
