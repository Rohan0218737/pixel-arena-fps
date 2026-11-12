// Il giocatore locale: movimento WASD con salto e corsa, collisioni con la mappa e
// telecamera in prima persona. La posizione è quella dei piedi.

import * as THREE from 'three';
import { pushOutOfWalls, supportHeight } from './collision.js';
import { CONFIG } from './config.js';
import { clamp, damp, lerp, wrapAngle } from './utils.js';

export const PLAYER_RADIUS = 0.4;
export const PLAYER_HEIGHT = 1.85;
export const EYE_HEIGHT = 1.62;

const MAX_STEP = 1 / 60; // la fisica avanza a piccoli passi: nessun muro viene attraversato
const MAX_PITCH = Math.PI / 2 - 0.02;
const MAX_FALL_SPEED = 45;

export class LocalPlayer {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0; // rotazione orizzontale: 0 guarda verso -Z, positivo verso sinistra
    this.pitch = 0; // inclinazione verticale: positivo verso l'alto
    this.onGround = true;
    this.alive = false;
    this.speed = 0;
    this.bobPhase = 0;
    this.landDip = 0;
    this.deathBlend = 0;
    camera.rotation.order = 'YXZ';
  }

  teleport(x, y, z, yaw) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.onGround = true;
    this.landDip = 0;
  }

  revive() {
    this.alive = true;
    this.deathBlend = 0;
  }

  /** Ruota la visuale degli angoli indicati (radianti). */
  look(yawDelta, pitchDelta) {
    this.yaw = wrapAngle(this.yaw - yawDelta);
    this.pitch = clamp(this.pitch - pitchDelta, -MAX_PITCH, MAX_PITCH);
  }

  /** move.x = destra/sinistra, move.z = avanti/indietro, entrambi tra -1 e 1. */
  update(dt, move, jump, sprint) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wishX = -sin * move.z + cos * move.x;
    let wishZ = -cos * move.z - sin * move.x;
    const length = Math.hypot(wishX, wishZ);
    if (length > 1) {
      wishX /= length;
      wishZ /= length;
    }
    const top = sprint && move.z > 0 ? CONFIG.SPRINT_SPEED : CONFIG.WALK_SPEED;

    let remaining = dt;
    while (remaining > 1e-6) {
      const step = Math.min(remaining, MAX_STEP);
      this.step(step, wishX * top, wishZ * top, jump);
      remaining -= step;
    }
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
  }

  step(dt, targetX, targetZ, jump) {
    const p = this.position;
    const v = this.velocity;
    const colliders = this.world.colliders;

    // In aria si corregge la rotta più lentamente che a terra.
    const grip = this.onGround ? 14 : 3.5;
    v.x = damp(v.x, targetX, grip, dt);
    v.z = damp(v.z, targetZ, grip, dt);
    if (jump && this.onGround) {
      v.y = CONFIG.JUMP_SPEED;
      this.onGround = false;
    }
    v.y = Math.max(v.y - CONFIG.GRAVITY * dt, -MAX_FALL_SPEED);

    // Spostamento orizzontale, poi fuori dai muri e dentro il perimetro del campo.
    p.x += v.x * dt;
    p.z += v.z * dt;
    pushOutOfWalls(colliders, p, PLAYER_RADIUS, p.y, PLAYER_HEIGHT);
    const limit = this.world.half - PLAYER_RADIUS;
    p.x = clamp(p.x, -limit, limit);
    p.z = clamp(p.z, -limit, limit);

    // Spostamento verticale: si atterra sul terreno o sulla cima di un ostacolo.
    const feetBefore = p.y;
    p.y += v.y * dt;
    const floor = supportHeight(colliders, p.x, p.z, PLAYER_RADIUS, feetBefore);
    if (p.y <= floor) {
      if (v.y < -9) this.landDip = Math.min(0.25, -v.y * 0.012);
      p.y = floor;
      v.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  updateCamera(dt) {
    const stride = this.alive && this.onGround ? Math.min(1, this.speed / CONFIG.WALK_SPEED) : 0;
    this.bobPhase += dt * this.speed * 1.6;
    this.landDip = damp(this.landDip, 0, 9, dt);
    this.deathBlend = damp(this.deathBlend, this.alive ? 0 : 1, 6, dt);

    // Da eliminati la visuale scende a terra e si inclina.
    const standing = EYE_HEIGHT + Math.sin(this.bobPhase) * 0.035 * stride - this.landDip;
    const eye = lerp(standing, 0.35, this.deathBlend);
    this.camera.position.set(this.position.x, this.position.y + eye, this.position.z);
    this.camera.rotation.set(this.pitch * (1 - this.deathBlend * 0.6), this.yaw, this.deathBlend * 1.1);
  }

  /** Punto da cui partono i proiettili: gli occhi, senza l'oscillazione del passo. */
  eyePosition(target) {
    return target.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }

  aimDirection(target) {
    const flat = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * flat, Math.sin(this.pitch), -Math.cos(this.yaw) * flat);
  }
}
