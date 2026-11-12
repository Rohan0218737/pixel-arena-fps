// Collisioni con il mondo statico: scatole allineate agli assi e cilindri verticali.
//   scatola:  { type: 'box', minX, maxX, minY, maxY, minZ, maxZ, solid }
//   cilindro: { type: 'cyl', x, z, r, minY, maxY, solid }
// "solid: false" ferma i proiettili ma non il giocatore (le chiome degli alberi).

import { clamp } from './utils.js';

// Dislivello che si supera camminando; oltre, l'ostacolo si comporta da muro.
const STEP_EPS = 0.05;

// Intervallo [min, max] del segmento ancora valido durante i test.
const range = { min: 0, max: 1 };

function clipSlab(p, d, lo, hi) {
  if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
  let t1 = (lo - p) / d;
  let t2 = (hi - p) / d;
  if (t1 > t2) {
    const swap = t1;
    t1 = t2;
    t2 = swap;
  }
  if (t1 > range.min) range.min = t1;
  if (t2 < range.max) range.max = t2;
  return range.min <= range.max;
}

/** Frazione (0..1) in cui il segmento p -> p+d entra nella scatola, altrimenti Infinity. */
export function segmentVsBox(px, py, pz, dx, dy, dz, box) {
  range.min = 0;
  range.max = 1;
  if (!clipSlab(px, dx, box.minX, box.maxX)) return Infinity;
  if (!clipSlab(py, dy, box.minY, box.maxY)) return Infinity;
  if (!clipSlab(pz, dz, box.minZ, box.maxZ)) return Infinity;
  return range.min;
}

/** Come segmentVsBox, per un cilindro verticale di centro (cx, cz) e raggio r. */
export function segmentVsCylinder(px, py, pz, dx, dy, dz, cx, cz, r, minY, maxY) {
  range.min = 0;
  range.max = 1;
  if (!clipSlab(py, dy, minY, maxY)) return Infinity;

  const fx = px - cx;
  const fz = pz - cz;
  const a = dx * dx + dz * dz;
  const c = fx * fx + fz * fz - r * r;
  if (a < 1e-12) return c <= 0 ? range.min : Infinity; // segmento verticale

  const b = fx * dx + fz * dz;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / a;
  const t2 = (-b + root) / a;
  if (t1 > range.min) range.min = t1;
  if (t2 < range.max) range.max = t2;
  return range.min <= range.max ? range.min : Infinity;
}

/** Primo ostacolo incontrato dal segmento: frazione 0..1, Infinity se il percorso è libero. */
export function raycastWorld(colliders, px, py, pz, dx, dy, dz) {
  let nearest = Infinity;
  for (const c of colliders) {
    const t =
      c.type === 'box'
        ? segmentVsBox(px, py, pz, dx, dy, dz, c)
        : segmentVsCylinder(px, py, pz, dx, dy, dz, c.x, c.z, c.r, c.minY, c.maxY);
    if (t < nearest) nearest = t;
  }
  return nearest;
}

function overlapsFootprint(c, x, z, radius) {
  if (c.type === 'box') {
    const ex = x - clamp(x, c.minX, c.maxX);
    const ez = z - clamp(z, c.minZ, c.maxZ);
    return ex * ex + ez * ez < radius * radius;
  }
  const ex = x - c.x;
  const ez = z - c.z;
  const reach = radius + c.r;
  return ex * ex + ez * ez < reach * reach;
}

/** Quota del piano d'appoggio sotto i piedi: il terreno (0) o la cima di un ostacolo. */
export function supportHeight(colliders, x, z, radius, feetY) {
  let height = 0;
  for (const c of colliders) {
    if (!c.solid || c.maxY <= height || c.maxY > feetY + STEP_EPS) continue;
    // Raggio appena ridotto: chi sfiora uno spigolo non resta appeso al bordo.
    if (overlapsFootprint(c, x, z, radius - 0.02)) height = c.maxY;
  }
  return height;
}

/** Sposta il cerchio del giocatore fuori dagli ostacoli che gli fanno da muro. */
export function pushOutOfWalls(colliders, position, radius, feetY, height) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (!c.solid || c.maxY <= feetY + STEP_EPS || c.minY >= feetY + height) continue;

      if (c.type === 'cyl') {
        const dx = position.x - c.x;
        const dz = position.z - c.z;
        const reach = radius + c.r;
        const dist = Math.hypot(dx, dz);
        if (dist >= reach) continue;
        if (dist < 1e-6) {
          position.x = c.x + reach;
        } else {
          position.x = c.x + (dx / dist) * reach;
          position.z = c.z + (dz / dist) * reach;
        }
        continue;
      }

      const nearX = clamp(position.x, c.minX, c.maxX);
      const nearZ = clamp(position.z, c.minZ, c.maxZ);
      const dx = position.x - nearX;
      const dz = position.z - nearZ;
      const dist2 = dx * dx + dz * dz;
      if (dist2 >= radius * radius) continue;

      if (dist2 > 1e-10) {
        const dist = Math.sqrt(dist2);
        const push = (radius - dist) / dist;
        position.x += dx * push;
        position.z += dz * push;
      } else {
        // Centro dentro la scatola: si esce dal lato più vicino.
        const left = position.x - c.minX;
        const right = c.maxX - position.x;
        const back = position.z - c.minZ;
        const front = c.maxZ - position.z;
        const least = Math.min(left, right, back, front);
        if (least === left) position.x = c.minX - radius;
        else if (least === right) position.x = c.maxX + radius;
        else if (least === back) position.z = c.minZ - radius;
        else position.z = c.maxZ + radius;
      }
    }
  }
}
