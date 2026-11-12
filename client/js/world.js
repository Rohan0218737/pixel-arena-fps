// La mappa: terreno, mura di cinta, ostacoli e alberi costruiti con cubi e cilindri.
// È identica su tutti i client (disposizione fissa + generatore con seme), quindi le
// collisioni calcolate da ciascun giocatore coincidono.

import * as THREE from 'three';
import { createTextures } from './textures.js';
import { mulberry32 } from './utils.js';

export const ARENA_HALF = 32; // metà lato del campo, in metri
const WALL_HEIGHT = 5;
const WALL_THICKNESS = 1.5;
const TILE = 2; // metri coperti da una ripetizione di texture

// Elementi di un quarto di campo, ripetuti ruotando di 90° attorno al centro:
// la mappa è simmetrica e nessun punto di ingresso è avvantaggiato.
const QUARTER = {
  // blocchi di pietra: [x, z, larghezza, altezza, profondità]
  blocks: [
    [13, 6, 1, 1.2, 7], // muretto: riparo basso, ci si sale con un salto
    [20, 18, 4, 3, 4], // torretta: si raggiunge dalle casse a gradini qui sotto
    [24, 8, 6, 2.6, 1], // muro a L
    [26.5, 10.5, 1, 2.6, 4],
  ],
  // casse di legno: [x, z, lato]
  crates: [
    [23.05, 18, 2],
    [24.6, 18, 1],
    [8, 16, 1.6],
    [9.35, 16.2, 1],
    [8.1, 17.35, 1],
    [6, 25, 1.4],
    [7.3, 25.3, 1],
  ],
  // barili: [x, z]
  barrels: [
    [15.5, 12],
    [16.6, 12.5],
    [15.9, 13.4],
  ],
  // punti di ingresso in campo: [x, z]
  spawns: [
    [27, 0],
    [26, 26],
    [12, 22],
  ],
};

const TREES_PER_QUARTER = 7;
const OUTSIDE_TREES = 44;
const CLOUDS = 24;

/** Ruota un punto di k quarti di giro attorno al centro. */
function turn(x, z, k) {
  for (let i = 0; i < k; i++) [x, z] = [-z, x];
  return [x, z];
}

/** Scatola con UV in scala reale: la texture si ripete ogni TILE metri su ogni faccia. */
function tiledBox(w, h, d) {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const uv = geometry.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  for (let face = 0; face < 6; face++) {
    for (let corner = 0; corner < 4; corner++) {
      const i = face * 4 + corner;
      uv.setXY(i, (uv.getX(i) * faces[face][0]) / TILE, (uv.getY(i) * faces[face][1]) / TILE);
    }
  }
  return geometry;
}

export function buildWorld(scene, { shadows }) {
  const textures = createTextures();
  textures.grass.repeat.set(350, 350);
  textures.bark.repeat.set(2, 3);
  textures.leaves.repeat.set(2, 2);
  textures.pine.repeat.set(3, 2);
  textures.barrel.repeat.set(3, 1);

  const lambert = (map, extra) => new THREE.MeshLambertMaterial({ map, ...extra });
  // Le superfici appoggiate al terreno (piazza, sentieri) non devono "sfarfallare".
  const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const material = {
    grass: lambert(textures.grass),
    dirt: lambert(textures.dirt, decal),
    plaza: lambert(textures.tiles, decal),
    tiles: lambert(textures.tiles),
    bricks: lambert(textures.bricks),
    crate: lambert(textures.crate),
    bark: lambert(textures.bark, { flatShading: true }),
    leaves: lambert(textures.leaves),
    pine: lambert(textures.pine, { flatShading: true }),
    barrel: [lambert(textures.barrel), lambert(textures.metal), lambert(textures.metal)],
  };

  const rand = mulberry32(7331);
  const colliders = [];
  const spawnPoints = [];

  // Elenchi di oggetti ripetuti: ognuno diventa un'unica InstancedMesh (una sola draw call).
  const crates = [];
  const barrels = [];
  const pillars = [];
  const merlons = [];
  const trunks = [];
  const leafCubes = [];
  const cones = [];

  function addBlock(x, z, w, h, d, blockMaterial, baseY = 0) {
    const mesh = new THREE.Mesh(tiledBox(w, h, d), blockMaterial);
    mesh.position.set(x, baseY + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({
      type: 'box',
      minX: x - w / 2,
      maxX: x + w / 2,
      minY: baseY,
      maxY: baseY + h,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      solid: true,
    });
  }

  function addPatch(x, z, w, d, patchMaterial, tile) {
    const geometry = new THREE.PlaneGeometry(w, d);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * d) / tile);
    const mesh = new THREE.Mesh(geometry, patchMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const dummy = new THREE.Object3D();
  function addInstances(geometry, instanceMaterial, items) {
    const mesh = new THREE.InstancedMesh(geometry, instanceMaterial, items.length);
    items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.scale.set(item.sx, item.sy, item.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ---------- Terreno, piazza e sentieri ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), material.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  addPatch(0, 0, 18, 18, material.plaza, 1.5);
  const pathLength = ARENA_HALF - 9;
  const pathCenter = 9 + pathLength / 2;
  addPatch(0, -pathCenter, 4, pathLength, material.dirt, TILE);
  addPatch(0, pathCenter, 4, pathLength, material.dirt, TILE);
  addPatch(-pathCenter, 0, pathLength, 4, material.dirt, TILE);
  addPatch(pathCenter, 0, pathLength, 4, material.dirt, TILE);

  // ---------- Mura di cinta con merli e torri d'angolo ----------
  const wallSpan = (ARENA_HALF + WALL_THICKNESS) * 2;
  const wallOffset = ARENA_HALF + WALL_THICKNESS / 2;
  addBlock(0, -wallOffset, wallSpan, WALL_HEIGHT, WALL_THICKNESS, material.bricks);
  addBlock(0, wallOffset, wallSpan, WALL_HEIGHT, WALL_THICKNESS, material.bricks);
  addBlock(-wallOffset, 0, WALL_THICKNESS, WALL_HEIGHT, ARENA_HALF * 2, material.bricks);
  addBlock(wallOffset, 0, WALL_THICKNESS, WALL_HEIGHT, ARENA_HALF * 2, material.bricks);

  for (let p = -ARENA_HALF + 1; p <= ARENA_HALF - 1; p += 2) {
    for (const side of [-wallOffset, wallOffset]) {
      merlons.push({ x: p, y: WALL_HEIGHT + 0.35, z: side, sx: 1, sy: 0.7, sz: WALL_THICKNESS });
      merlons.push({ x: side, y: WALL_HEIGHT + 0.35, z: p, sx: WALL_THICKNESS, sy: 0.7, sz: 1 });
    }
  }

  const towerHeight = WALL_HEIGHT + 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (ARENA_HALF + 0.5);
      const z = sz * (ARENA_HALF + 0.5);
      addBlock(x, z, 4, towerHeight, 4, material.bricks);
      merlons.push({ x, y: towerHeight + 0.25, z, sx: 4.8, sy: 0.5, sz: 4.8 });
    }
  }

  // ---------- Struttura centrale: pedana, blocco rialzato, quattro colonne ----------
  addBlock(0, 0, 10, 1, 10, material.bricks);
  addBlock(0, 0, 4, 1, 4, material.tiles, 1);
  for (const [x, z] of [[4.2, 4.2], [-4.2, 4.2], [-4.2, -4.2], [4.2, -4.2]]) {
    pillars.push({ x, y: 2.7, z, sx: 0.45, sy: 3.4, sz: 0.45 });
    merlons.push({ x, y: 4.55, z, sx: 1.2, sy: 0.3, sz: 1.2 });
    colliders.push({ type: 'cyl', x, z, r: 0.45, minY: 1, maxY: 4.4, solid: true });
  }

  const crystal = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xb06a00 }),
  );
  crystal.position.set(0, 3.5, 0);
  crystal.rotation.set(Math.PI / 4, 0, Math.PI / 4);
  crystal.castShadow = true;
  scene.add(crystal);

  // ---------- Ostacoli dei quattro quarti ----------
  for (let k = 0; k < 4; k++) {
    for (const [bx, bz, w, h, d] of QUARTER.blocks) {
      const [x, z] = turn(bx, bz, k);
      // A ogni quarto di giro larghezza e profondità si scambiano.
      addBlock(x, z, k % 2 ? d : w, h, k % 2 ? w : d, material.bricks);
    }
    for (const [cx, cz, size] of QUARTER.crates) {
      const [x, z] = turn(cx, cz, k);
      const half = size / 2;
      crates.push({ x, y: half, z, sx: size, sy: size, sz: size });
      colliders.push({
        type: 'box',
        minX: x - half,
        maxX: x + half,
        minY: 0,
        maxY: size,
        minZ: z - half,
        maxZ: z + half,
        solid: true,
      });
    }
    for (const [bx, bz] of QUARTER.barrels) {
      const [x, z] = turn(bx, bz, k);
      barrels.push({ x, y: 0.625, z, sx: 0.5, sy: 1.25, sz: 0.5 });
      colliders.push({ type: 'cyl', x, z, r: 0.5, minY: 0, maxY: 1.25, solid: true });
    }
    for (const [sx, sz] of QUARTER.spawns) {
      const [x, z] = turn(sx, sz, k);
      spawnPoints.push({ x, z, yaw: Math.atan2(x, z) }); // rivolti verso il centro
    }
  }

  // ---------- Alberi ----------
  function addTree(x, z, pine, scale, solid) {
    if (pine) {
      const trunkHeight = 3.1 * scale;
      trunks.push({ x, y: trunkHeight / 2, z, sx: 0.3, sy: trunkHeight, sz: 0.3 });
      const layers = [[1.9, 2.2, 0], [1.45, 1.9, 1.2], [1.0, 1.6, 2.3]]; // [raggio, altezza, quota]
      for (const [radius, height, lift] of layers) {
        cones.push({
          x,
          y: trunkHeight - 0.1 + (lift + height / 2) * scale,
          z,
          sx: radius * scale,
          sy: height * scale,
          sz: radius * scale,
        });
      }
      if (solid) {
        colliders.push({ type: 'cyl', x, z, r: 0.3, minY: 0, maxY: trunkHeight, solid: true });
        colliders.push({ type: 'cyl', x, z, r: 1.2 * scale, minY: trunkHeight, maxY: trunkHeight + 3.4 * scale, solid: false });
      }
    } else {
      const trunkHeight = 3.2 * scale;
      const crown = 2.8 * scale;
      trunks.push({ x, y: trunkHeight / 2, z, sx: 0.34, sy: trunkHeight, sz: 0.34 });
      leafCubes.push({ x, y: trunkHeight + 1.0 * scale, z, sx: crown, sy: 2.2 * scale, sz: crown });
      leafCubes.push({ x, y: trunkHeight + 2.5 * scale, z, sx: crown * 0.6, sy: 1.0 * scale, sz: crown * 0.6 });
      if (solid) {
        colliders.push({ type: 'cyl', x, z, r: 0.34, minY: 0, maxY: trunkHeight, solid: true });
        colliders.push({
          type: 'box',
          minX: x - crown / 2,
          maxX: x + crown / 2,
          minY: trunkHeight - 0.1 * scale,
          maxY: trunkHeight + 2.1 * scale,
          minZ: z - crown / 2,
          maxZ: z + crown / 2,
          solid: false,
        });
      }
    }
  }

  // Posti vietati agli alberi: sentieri, piazza, mura, punti di ingresso e altri ostacoli.
  const planted = [];
  const treeBlocked = (x, z) => {
    if (Math.abs(x) < 3.2 || Math.abs(z) < 3.2) return true;
    if (Math.hypot(x, z) < 12.5) return true;
    if (Math.abs(x) > ARENA_HALF - 3 || Math.abs(z) > ARENA_HALF - 3) return true;
    if (spawnPoints.some((s) => Math.hypot(x - s.x, z - s.z) < 4)) return true;
    if (planted.some((t) => Math.hypot(x - t.x, z - t.z) < 5)) return true;
    return colliders.some((c) =>
      c.type === 'box'
        ? x > c.minX - 1.9 && x < c.maxX + 1.9 && z > c.minZ - 1.9 && z < c.maxZ + 1.9
        : Math.hypot(x - c.x, z - c.z) < c.r + 1.9,
    );
  };

  for (let attempt = 0, placed = 0; attempt < 600 && placed < TREES_PER_QUARTER; attempt++) {
    const x = 3 + rand() * 26;
    const z = 3 + rand() * 26;
    const scale = 0.9 + rand() * 0.3;
    const copies = [0, 1, 2, 3].map((k) => turn(x, z, k));
    if (copies.some(([cx, cz]) => treeBlocked(cx, cz))) continue;
    for (const [cx, cz] of copies) {
      planted.push({ x: cx, z: cz });
      addTree(cx, cz, placed % 2 === 1, scale, true);
    }
    placed++;
  }

  // Alberi decorativi oltre le mura: solo scenografia, niente collisioni.
  for (let i = 0; i < OUTSIDE_TREES; i++) {
    const angle = rand() * Math.PI * 2;
    const distance = ARENA_HALF * 1.45 + rand() * 42;
    addTree(Math.cos(angle) * distance, Math.sin(angle) * distance, rand() < 0.5, 0.9 + rand() * 0.5, false);
  }

  // ---------- Creazione delle mesh istanziate ----------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  addInstances(unitBox, material.crate, crates);
  addInstances(unitBox, material.bricks, merlons);
  addInstances(unitBox, material.leaves, leafCubes);
  addInstances(new THREE.CylinderGeometry(1, 1, 1, 12), material.barrel, barrels);
  addInstances(new THREE.CylinderGeometry(1, 1, 1, 10), material.tiles, pillars);
  addInstances(new THREE.CylinderGeometry(1, 1, 1, 8), material.bark, trunks);
  addInstances(new THREE.ConeGeometry(1, 1, 7), material.pine, cones);

  // ---------- Luci ----------
  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5c7a45, 1.7));
  const sun = new THREE.DirectionalLight(0xfff1d0, 2.3);
  sun.position.set(45, 70, 30);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const frustum = ARENA_HALF + 12;
    sun.shadow.camera.left = -frustum;
    sun.shadow.camera.right = frustum;
    sun.shadow.camera.top = frustum;
    sun.shadow.camera.bottom = -frustum;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 180;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  scene.add(sun);

  // ---------- Cielo: cupola sfumata, sole quadrato, nuvole a blocchi ----------
  const horizon = new THREE.Color(0xcfe9ff);
  const zenith = new THREE.Color(0x2f7fd8);
  scene.fog = new THREE.Fog(horizon, 70, 260);

  const domeRadius = 500;
  const domeGeometry = new THREE.SphereGeometry(domeRadius, 24, 12);
  const domeColors = [];
  const tint = new THREE.Color();
  for (let i = 0; i < domeGeometry.attributes.position.count; i++) {
    const height = Math.max(0, domeGeometry.attributes.position.getY(i) / domeRadius);
    tint.copy(horizon).lerp(zenith, Math.pow(height, 0.55));
    domeColors.push(tint.r, tint.g, tint.b);
  }
  domeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(domeColors, 3));
  const dome = new THREE.Mesh(
    domeGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;

  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff3b0, fog: false, depthWrite: false }));
  sunDisc.position.copy(sun.position).normalize().multiplyScalar(domeRadius * 0.9);
  sunDisc.scale.set(46, 46, 1);

  // Il cielo segue la telecamera: così l'orizzonte non si avvicina mai.
  const sky = new THREE.Group();
  sky.add(dome, sunDisc);
  scene.add(sky);

  const cloudParts = [];
  for (let i = 0; i < CLOUDS; i++) {
    const x = (rand() - 0.5) * 560;
    const y = 48 + rand() * 26;
    const z = (rand() - 0.5) * 560;
    const pieces = 2 + Math.floor(rand() * 3);
    for (let j = 0; j < pieces; j++) {
      cloudParts.push({
        x: x + (rand() - 0.5) * 18,
        y: y + (rand() - 0.5) * 3,
        z: z + (rand() - 0.5) * 14,
        sx: 14 + rand() * 14,
        sy: 3 + rand() * 2,
        sz: 9 + rand() * 9,
      });
    }
  }
  // L'emissivo schiarisce i lati in ombra: nuvole chiare anche viste da sotto.
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8fa3b8, fog: false });
  const clouds = addInstances(unitBox, cloudMaterial, cloudParts);
  clouds.castShadow = false;
  clouds.receiveShadow = false;
  clouds.frustumCulled = false;

  return {
    colliders,
    spawnPoints,
    half: ARENA_HALF,

    update(dt, cameraPosition) {
      sky.position.copy(cameraPosition);
      crystal.rotation.y += dt * 0.9;
      crystal.position.y = 3.5 + Math.sin(performance.now() / 600) * 0.12;

      cloudParts.forEach((part, index) => {
        part.x += dt * 1.6;
        if (part.x > 300) part.x -= 600;
        dummy.position.set(part.x, part.y, part.z);
        dummy.scale.set(part.sx, part.sy, part.sz);
        dummy.updateMatrix();
        clouds.setMatrixAt(index, dummy.matrix);
      });
      clouds.instanceMatrix.needsUpdate = true;
    },
  };
}
