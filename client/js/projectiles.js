// Proiettili: volano in linea retta, si fermano contro il mondo o contro un giocatore.
// Solo i propri proiettili cercano i bersagli (vale ciò che vede chi spara); quelli
// degli altri sono soltanto disegnati e spariscono quando il server conferma il colpo.

import * as THREE from 'three';
import { raycastWorld } from './collision.js';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const CONVERGE_TIME = 0.12; // secondi in cui la scia rientra dalla canna alla traiettoria vera

const side = new THREE.Vector3();
const impact = new THREE.Vector3();

export class Projectiles {
  constructor(scene, world, effects) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.active = [];
    this.pool = [];

    this.coreGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.7);
    this.glowGeometry = new THREE.BoxGeometry(0.18, 0.18, 0.95);
    const glow = (color) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    this.style = {
      local: { core: new THREE.MeshBasicMaterial({ color: 0xfff6b0 }), glow: glow(0xffc21c), spark: 0xffe27a },
      remote: { core: new THREE.MeshBasicMaterial({ color: 0xffd9c2 }), glow: glow(0xff5a1f), spark: 0xffa15c },
    };
  }

  create() {
    const mesh = new THREE.Mesh(this.coreGeometry, this.style.local.core);
    const glow = new THREE.Mesh(this.glowGeometry, this.style.local.glow);
    mesh.add(glow);
    this.scene.add(mesh);
    return {
      mesh,
      glow,
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      offset: new THREE.Vector3(),
      owner: 0,
      shot: 0,
      local: false,
      speed: 0,
      life: 0,
      age: 0,
    };
  }

  spawn(origin, direction, { owner, shot, local, speed, life }) {
    const item = this.pool.pop() || this.create();
    item.owner = owner;
    item.shot = shot;
    item.local = local;
    item.speed = speed;
    item.life = life;
    item.age = 0;
    item.position.copy(origin);
    item.direction.copy(direction).normalize();

    // La traiettoria parte dagli occhi (dove punta il mirino), ma il disegno parte
    // dalla canna dell'arma, in basso a destra, e converge in pochi metri.
    side.crossVectors(item.direction, UP).normalize();
    item.offset.copy(side).multiplyScalar(0.2).addScaledVector(UP, -0.17);

    const style = local ? this.style.local : this.style.remote;
    item.mesh.material = style.core;
    item.glow.material = style.glow;
    item.mesh.quaternion.setFromUnitVectors(FORWARD, item.direction);
    item.mesh.visible = true;
    this.place(item);
    this.active.push(item);
  }

  place(item) {
    const k = Math.max(0, 1 - item.age / CONVERGE_TIME);
    item.mesh.position.copy(item.position).addScaledVector(item.offset, k);
  }

  release(index) {
    const item = this.active[index];
    item.mesh.visible = false;
    this.active[index] = this.active[this.active.length - 1];
    this.active.pop();
    this.pool.push(item);
  }

  /** Il server ha confermato che questo proiettile ha colpito: restituisce dov'era. */
  removeShot(owner, shot) {
    for (let i = 0; i < this.active.length; i++) {
      const item = this.active[i];
      if (item.owner !== owner || item.shot !== shot) continue;
      const position = item.position.clone();
      this.release(i);
      return position;
    }
    return null;
  }

  clear() {
    while (this.active.length > 0) this.release(this.active.length - 1);
  }

  update(dt, remotes, onLocalHit) {
    const colliders = this.world.colliders;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      const p = item.position;
      const step = item.speed * dt;
      const dx = item.direction.x * step;
      const dy = item.direction.y * step;
      const dz = item.direction.z * step;

      // Frazione del passo percorribile prima del primo ostacolo (o del terreno).
      let t = raycastWorld(colliders, p.x, p.y, p.z, dx, dy, dz);
      if (dy < 0 && p.y + dy <= 0) t = Math.min(t, p.y / -dy);

      let victim = null;
      if (item.local) {
        const hit = remotes.hitTest(p.x, p.y, p.z, dx, dy, dz);
        if (hit && hit.t <= t) {
          victim = hit;
          t = hit.t;
        }
      }

      if (t <= 1) {
        impact.set(p.x + dx * t, p.y + dy * t, p.z + dz * t);
        const shot = item.shot;
        const spark = (item.local ? this.style.local : this.style.remote).spark;
        // Prima si libera il proiettile, poi si avvisa: chi riceve l'avviso può a sua
        // volta rimuovere proiettili, e l'elenco deve essere già coerente.
        this.release(i);
        if (victim) onLocalHit(victim.player, victim.head, shot, impact);
        else this.effects.burst(impact, spark, 6, 2.5, 0.06);
        continue;
      }

      p.set(p.x + dx, p.y + dy, p.z + dz);
      item.age += dt;
      if (item.age >= item.life) {
        this.release(i);
        continue;
      }
      this.place(item);
    }
  }
}
