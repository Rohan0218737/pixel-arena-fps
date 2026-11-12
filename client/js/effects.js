// Effetti a particelle: scintille e schegge cubiche, tutte in un'unica mesh istanziata.

import * as THREE from 'three';

const MAX_PARTICLES = 320;
const GRAVITY = 12;

export class Effects {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      MAX_PARTICLES,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(0xffffff)); // crea il buffer dei colori
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // le particelle si spostano: niente scarto per posizione
    scene.add(this.mesh);

    this.particles = [];
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  /** Esplosione di cubetti colorati nel punto indicato. */
  burst(position, color, count = 8, speed = 3, size = 0.09) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const power = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x: position.x,
        y: position.y,
        z: position.z,
        vx: Math.cos(angle) * power,
        vy: (0.3 + Math.random()) * power,
        vz: Math.sin(angle) * power,
        age: 0,
        life: 0.35 + Math.random() * 0.4,
        size: size * (0.6 + Math.random() * 0.8),
        spin: Math.random() * 6,
        color,
      });
    }
  }

  update(dt) {
    let alive = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;

      p.vy -= GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        // rimbalzo smorzato sul terreno
        p.y = 0.03;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }

      const scale = p.size * (1 - p.age / p.life);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.spin + p.age * 5, p.spin, 0);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(alive, this.dummy.matrix);
      this.mesh.setColorAt(alive, this.color.setHex(p.color));
      this.particles[alive++] = p;
    }
    this.particles.length = alive;
    this.mesh.count = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
