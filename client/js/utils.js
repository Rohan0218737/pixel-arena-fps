// Piccole funzioni condivise dai moduli del gioco.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Riporta un angolo nell'intervallo [-PI, PI). */
export function wrapAngle(angle) {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/** Interpola tra due angoli lungo l'arco più breve. */
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;

/** Avvicina "current" a "target" con la stessa rapidità a qualsiasi frame rate. */
export const damp = (current, target, rate, dt) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

/** Generatore pseudo-casuale con seme: produce la stessa sequenza su ogni dispositivo. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const $ = (id) => document.getElementById(id);

/** Preferenze salvate nel browser (in navigazione privata possono non essere disponibili). */
export const storage = {
  get(key, fallback = '') {
    try {
      return localStorage.getItem(`pixelArena.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`pixelArena.${key}`, value);
    } catch {
      // preferenza non salvata: il gioco funziona comunque
    }
  },
};
