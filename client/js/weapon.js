// Arma in prima persona: modello a blocchi disegnato sopra la scena (così non entra mai
// nei muri), caricatore, ricarica e animazioni di rinculo, oscillazione e passo.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, damp } from './utils.js';

const REST_Y = -0.2;
const REST_Z = -0.6;
const MODEL_SCALE = 0.7;

export class Weapon {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.9));
    const key = new THREE.DirectionalLight(0xfff1d0, 1.6);
    key.position.set(1, 2, 1.5);
    this.scene.add(key);

    this.rig = new THREE.Group();
    this.rig.scale.setScalar(MODEL_SCALE);
    this.scene.add(this.rig);
    const box = (w, h, d, color, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
      mesh.position.set(x, y, z);
      this.rig.add(mesh);
      return mesh;
    };
    box(0.1, 0.13, 0.42, 0x4b5567, 0, 0, 0); // corpo
    box(0.06, 0.03, 0.3, 0x7a8699, 0, 0.08, -0.02); // slitta superiore
    box(0.055, 0.055, 0.22, 0x2b303a, 0, 0.015, -0.31); // canna
    box(0.078, 0.078, 0.04, 0xffb02e, 0, 0.015, -0.41); // bocca
    box(0.104, 0.03, 0.2, 0xffb02e, 0, -0.02, 0.02); // fascia colorata
    box(0.03, 0.035, 0.03, 0x2b303a, 0, 0.11, 0.14); // tacca di mira
    box(0.075, 0.17, 0.09, 0x6b4a2b, 0, -0.14, 0.12).rotation.x = -0.25; // impugnatura
    box(0.11, 0.1, 0.13, 0xf0c8a0, 0, -0.17, 0.13); // mano
    box(0.13, 0.13, 0.42, 0x2f7fd1, 0.03, -0.26, 0.36).rotation.x = 0.4; // manica

    // Vampata: due lamine incrociate davanti alla canna, visibili per un istante.
    this.flash = new THREE.Group();
    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });
    for (const angle of [0, Math.PI / 4]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.01), flashMaterial);
      plate.rotation.z = angle;
      this.flash.add(plate);
    }
    this.flash.position.set(0, 0.015, -0.46);
    this.flash.visible = false;
    this.rig.add(this.flash);

    this.ammo = CONFIG.MAGAZINE_SIZE;
    this.reloadLeft = 0;
    this.nextFireAt = 0;
    this.restX = 0.22;
    this.kick = 0;
    this.flashLeft = 0;
    this.raise = 1; // 1 = arma abbassata fuori dallo schermo, 0 = in posizione
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.onReloadStart = () => {};
    this.onReloadEnd = () => {};
  }

  get reloading() {
    return this.reloadLeft > 0;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.restX = Math.min(0.22, 0.14 * aspect); // su schermi stretti l'arma resta visibile
  }

  reset() {
    this.ammo = CONFIG.MAGAZINE_SIZE;
    this.reloadLeft = 0;
    this.kick = 0;
    this.raise = 1;
  }

  reload() {
    if (this.reloading || this.ammo >= CONFIG.MAGAZINE_SIZE) return;
    this.reloadLeft = CONFIG.RELOAD_TIME;
    this.onReloadStart();
  }

  /** Prova a sparare: true se il colpo è partito. "now" e "interval" in millisecondi. */
  tryFire(now, interval) {
    if (this.reloading || now < this.nextFireAt) return false;
    if (this.ammo <= 0) {
      this.reload();
      return false;
    }
    this.ammo -= 1;
    this.nextFireAt = now + interval;
    this.kick = 1;
    this.flashLeft = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6);
    if (this.ammo === 0) this.reload();
    return true;
  }

  /** lookX/lookY: rotazione della visuale in questo frame (radianti). */
  update(dt, { speed, onGround, lookX, lookY }) {
    this.kick = damp(this.kick, 0, 16, dt);
    this.raise = damp(this.raise, 0, 9, dt);
    this.flashLeft -= dt;
    this.flash.visible = this.flashLeft > 0;

    // Ricarica: l'arma si abbassa e risale.
    let lowered = 0;
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      lowered = Math.sin(clamp(1 - this.reloadLeft / CONFIG.RELOAD_TIME, 0, 1) * Math.PI);
      if (this.reloadLeft <= 0) {
        this.ammo = CONFIG.MAGAZINE_SIZE;
        this.onReloadEnd();
      }
    }

    // L'arma segue la visuale con un attimo di ritardo e oscilla con il passo.
    this.swayX = damp(this.swayX, clamp(-lookX * 1.5, -0.06, 0.06), 10, dt);
    this.swayY = damp(this.swayY, clamp(lookY * 1.5, -0.05, 0.05), 10, dt);
    this.bobAmount = damp(this.bobAmount, onGround ? Math.min(1, speed / 6) : 0, 10, dt);
    this.bobPhase += dt * speed * 1.5;
    const bobX = Math.sin(this.bobPhase) * 0.012 * this.bobAmount;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.012 * this.bobAmount;

    this.rig.position.set(
      this.restX + this.swayX + bobX,
      REST_Y + this.swayY - bobY - lowered * 0.22 - this.raise * 0.4,
      REST_Z + this.kick * 0.09,
    );
    this.rig.rotation.set(
      this.kick * 0.16 - lowered * 0.9 - this.raise * 0.8,
      0.06 + this.swayX * 1.2,
      lowered * 0.25,
    );
  }
}
