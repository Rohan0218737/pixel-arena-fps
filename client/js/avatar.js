// Il personaggio standard: stesso identico modello a blocchi per tutti i giocatori.
// Cambiano solo la faccia sulla testa (la foto del compagno) e il nome sopra la testa.

import * as THREE from 'three';
import { getFace } from './faces.js';
import { clamp } from './utils.js';

export const BODY_TOP = 1.36; // quota del collo: sotto il corpo, sopra la testa
export const HEAD_TOP = 1.9;

const COLORS = {
  shirt: 0x2f7fd1,
  pants: 0x39425c,
  shoes: 0x22252e,
  skin: 0xf0c8a0,
  gun: 0x2b2f38,
  muzzle: 0xffb02e,
};

// Geometrie condivise tra tutti gli avatar.
const GEOMETRY = {
  leg: new THREE.BoxGeometry(0.24, 0.7, 0.24),
  shoe: new THREE.BoxGeometry(0.26, 0.12, 0.34),
  torso: new THREE.BoxGeometry(0.56, 0.66, 0.3),
  sleeve: new THREE.BoxGeometry(0.2, 0.4, 0.2),
  hand: new THREE.BoxGeometry(0.17, 0.26, 0.17),
  head: new THREE.BoxGeometry(0.54, 0.54, 0.54),
  gun: new THREE.BoxGeometry(0.09, 0.5, 0.13),
  gunTip: new THREE.BoxGeometry(0.05, 0.12, 0.05),
  flash: new THREE.BoxGeometry(0.22, 0.05, 0.22),
};

const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a0 });

export class Avatar {
  constructor(name, faceId) {
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // ruota all'indietro quando il giocatore viene eliminato
    this.root.add(this.body);

    this.materials = [];
    const colored = (color) => this.track(new THREE.MeshLambertMaterial({ color }));
    const shirt = colored(COLORS.shirt);
    const pants = colored(COLORS.pants);
    const shoes = colored(COLORS.shoes);
    const skin = colored(COLORS.skin);
    const gun = colored(COLORS.gun);
    const muzzle = colored(COLORS.muzzle);

    // Il modello guarda verso -Z, come la telecamera: basta copiare l'angolo di imbardata.
    this.legL = this.pivot(-0.14, 0.7);
    this.legR = this.pivot(0.14, 0.7);
    for (const leg of [this.legL, this.legR]) {
      this.part(GEOMETRY.leg, pants, 0, -0.35, 0, leg);
      this.part(GEOMETRY.shoe, shoes, 0, -0.64, -0.04, leg);
    }

    this.part(GEOMETRY.torso, shirt, 0, 1.03, 0, this.body);

    this.armL = this.pivot(-0.39, 1.3);
    this.armR = this.pivot(0.39, 1.3);
    for (const arm of [this.armL, this.armR]) {
      this.part(GEOMETRY.sleeve, shirt, 0, -0.14, 0, arm);
      this.part(GEOMETRY.hand, skin, 0, -0.47, 0, arm);
    }

    // Arma nella mano destra: il braccio teso in avanti la punta dove guarda il giocatore.
    this.part(GEOMETRY.gun, gun, 0, -0.74, -0.11, this.armR);
    this.part(GEOMETRY.gunTip, muzzle, 0, -1.03, -0.11, this.armR);
    this.muzzle = this.part(GEOMETRY.flash, flashMaterial, 0, -1.12, -0.11, this.armR);
    this.muzzle.castShadow = false;
    this.muzzle.visible = false;

    // Testa: la foto sta sulla faccia anteriore del cubo (-Z).
    const face = getFace(faceId).textures;
    const textured = (map) => this.track(new THREE.MeshLambertMaterial({ map }));
    this.head = this.pivot(0, BODY_TOP);
    this.part(
      GEOMETRY.head,
      [
        textured(face.side),
        textured(face.side),
        textured(face.top),
        textured(face.bottom),
        textured(face.back),
        textured(face.front),
      ],
      0,
      0.27,
      0,
      this.head,
    );

    // Targhetta con nome e barra della salute.
    this.name = name;
    this.health = 1;
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 256;
    this.tagCanvas.height = 64;
    this.tagTexture = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTexture.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tagTexture, depthWrite: false }));
    this.tag.scale.set(1.7, 0.425, 1);
    this.tag.position.set(0, 2.28, 0);
    this.root.add(this.tag);
    this.drawTag();

    this.walkPhase = 0;
    this.flashTime = 0;
    this.muzzleTime = 0;
    this.dead = false;
    this.deadTime = 0;
    this.setPose(0, 0, 0, 0, 0);
  }

  track(material) {
    this.materials.push(material);
    return material;
  }

  pivot(x, y) {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    this.body.add(group);
    return group;
  }

  part(geometry, material, x, y, z, parent) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  drawTag() {
    const ctx = this.tagCanvas.getContext('2d');
    const width = this.tagCanvas.width;
    ctx.clearRect(0, 0, width, this.tagCanvas.height);
    ctx.font = 'bold 30px "Trebuchet MS", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = Math.min(232, ctx.measureText(this.name).width);
    ctx.fillStyle = 'rgba(8, 12, 20, 0.62)';
    ctx.fillRect((width - textWidth) / 2 - 10, 3, textWidth + 20, 38);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.name, width / 2, 23, 232);

    const barWidth = 128;
    const barX = (width - barWidth) / 2;
    ctx.fillStyle = 'rgba(8, 12, 20, 0.8)';
    ctx.fillRect(barX - 3, 46, barWidth + 6, 14);
    ctx.fillStyle = this.health > 0.5 ? '#62e36b' : this.health > 0.25 ? '#ffd23f' : '#ff5a4d';
    ctx.fillRect(barX, 49, barWidth * this.health, 8);
    this.tagTexture.needsUpdate = true;
  }

  setHealth(fraction) {
    const health = clamp(fraction, 0, 1);
    if (health === this.health) return;
    this.health = health;
    this.drawTag();
  }

  /** Posizione dei piedi, imbardata e inclinazione dello sguardo. */
  setPose(x, y, z, yaw, pitch) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    this.head.rotation.x = clamp(pitch, -1.1, 1.1);
    this.armR.rotation.x = Math.PI / 2 + pitch;
  }

  flash() {
    this.flashTime = 0.12;
    for (const material of this.materials) material.emissive.setHex(0xb01414);
  }

  showMuzzleFlash() {
    this.muzzleTime = 0.06;
    this.muzzle.visible = true;
    this.muzzle.rotation.y = Math.random() * Math.PI;
  }

  die() {
    this.dead = true;
    this.deadTime = 0;
    this.tag.visible = false;
  }

  revive() {
    this.dead = false;
    this.body.rotation.x = 0;
    this.body.position.y = 0;
    this.root.visible = true;
    this.tag.visible = true;
    this.setHealth(1);
  }

  update(dt, speed) {
    if (this.dead) {
      this.deadTime += dt;
      const k = Math.min(1, this.deadTime / 0.4);
      const eased = 1 - (1 - k) * (1 - k);
      this.body.rotation.x = (eased * Math.PI) / 2; // cade sulla schiena
      this.body.position.y = eased * 0.16;
      if (this.deadTime > 2.4) this.root.visible = false;
    } else {
      const amount = clamp(speed / 6, 0, 1);
      if (amount > 0.05) this.walkPhase += dt * (4 + speed * 1.4);
      const swing = Math.sin(this.walkPhase) * 0.8 * amount;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.7;
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) for (const material of this.materials) material.emissive.setHex(0);
    }
    if (this.muzzleTime > 0) {
      this.muzzleTime -= dt;
      if (this.muzzleTime <= 0) this.muzzle.visible = false;
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const material of this.materials) material.dispose(); // le texture delle facce restano in cache
    this.tag.material.dispose();
    this.tagTexture.dispose();
  }
}
