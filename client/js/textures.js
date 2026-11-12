// Texture in stile pixel art disegnate via codice su piccoli canvas:
// nessun file immagine da scaricare, tranne le facce dei giocatori.

import * as THREE from 'three';
import { mulberry32 } from './utils.js';

function shade(hex, delta) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (c) => Math.max(0, Math.min(255, Math.round(c + delta)));
  return `rgb(${channel(value >> 16)},${channel((value >> 8) & 255)},${channel(value & 255)})`;
}

function paint(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter; // da vicino i pixel restano netti
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createTextures() {
  const rand = mulberry32(99);

  const noise = (ctx, size, base, spread) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = shade(base, (rand() - 0.5) * spread);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  };

  const speckle = (ctx, size, colors, count) => {
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
      ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
    }
  };

  return {
    grass: paint(16, (ctx, s) => {
      noise(ctx, s, '#59a63b', 28);
      speckle(ctx, s, ['#75c04f', '#448a2f', '#6ab545'], 22);
    }),

    dirt: paint(16, (ctx, s) => {
      noise(ctx, s, '#b48c5e', 24);
      speckle(ctx, s, ['#8f6d47', '#caa578', '#9c7a52'], 18);
    }),

    bricks: paint(32, (ctx, s) => {
      noise(ctx, s, '#8d939a', 16);
      for (let row = 0; row < 4; row++) {
        const y = row * 8;
        ctx.fillStyle = '#646a71';
        ctx.fillRect(0, y, s, 1);
        for (let x = row % 2 ? 8 : 0; x < s; x += 16) ctx.fillRect(x, y, 1, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(0, y + 1, s, 1);
      }
    }),

    tiles: paint(16, (ctx, s) => {
      noise(ctx, s, '#a7adb3', 12);
      ctx.fillStyle = '#7d848b';
      ctx.fillRect(0, 0, s, 1);
      ctx.fillRect(0, 0, 1, s);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(1, 1, s - 1, 1);
      ctx.fillRect(1, 1, 1, s - 1);
    }),

    crate: paint(32, (ctx, s) => {
      noise(ctx, s, '#b9843f', 18);
      ctx.fillStyle = 'rgba(70,40,10,0.35)';
      for (let y = 7; y < s; y += 8) ctx.fillRect(0, y, s, 1);
      ctx.fillStyle = '#8a5a26';
      ctx.fillRect(0, 0, s, 3);
      ctx.fillRect(0, s - 3, s, 3);
      ctx.fillRect(0, 0, 3, s);
      ctx.fillRect(s - 3, 0, 3, s);
      for (let i = 3; i < s - 3; i++) ctx.fillRect(i, i - 1, 1, 3); // traversa diagonale
      ctx.fillStyle = 'rgba(255,225,170,0.3)';
      ctx.fillRect(0, 0, s, 1);
      ctx.fillRect(0, 0, 1, s);
      ctx.fillStyle = '#3b2a17';
      for (const [x, y] of [[1, 1], [s - 2, 1], [1, s - 2], [s - 2, s - 2]]) ctx.fillRect(x, y, 1, 1);
    }),

    bark: paint(16, (ctx, s) => {
      noise(ctx, s, '#6d4b2b', 20);
      ctx.fillStyle = 'rgba(30,15,5,0.35)';
      for (let i = 0; i < 9; i++) {
        ctx.fillRect(Math.floor(rand() * s), Math.floor(rand() * s), 1, 3 + Math.floor(rand() * 5));
      }
    }),

    leaves: paint(16, (ctx, s) => {
      noise(ctx, s, '#3f9b3b', 36);
      speckle(ctx, s, ['#2a6e2b', '#2a6e2b', '#66c458'], 36);
    }),

    pine: paint(16, (ctx, s) => {
      noise(ctx, s, '#2d7245', 28);
      speckle(ctx, s, ['#1f5231', '#1f5231', '#3f8f5a'], 32);
    }),

    barrel: paint(32, (ctx, s) => {
      noise(ctx, s, '#b83b31', 16);
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let x = 3; x < s; x += 4) ctx.fillRect(x, 0, 1, s);
      ctx.fillStyle = '#474c55';
      ctx.fillRect(0, 5, s, 3);
      ctx.fillRect(0, 24, s, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(0, 5, s, 1);
      ctx.fillRect(0, 24, s, 1);
    }),

    metal: paint(16, (ctx, s) => {
      noise(ctx, s, '#5a6069', 12);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(3, 3, s - 6, 1);
      ctx.fillRect(3, s - 4, s - 6, 1);
      ctx.fillRect(3, 3, 1, s - 6);
      ctx.fillRect(s - 4, 3, 1, s - 6);
    }),
  };
}
