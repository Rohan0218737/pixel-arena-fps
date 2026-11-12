// Le "facce dei compagni": la foto PNG trasparente di ogni giocatore diventa la texture
// frontale della testa. Dalla foto si ricavano anche il colore dei capelli e della
// pelle, usati per riempire le zone trasparenti e per gli altri lati del cubo.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const SIZE = 256;
const HAIR_ROWS = 3; // righe (su 8) coperte dai capelli sui lati della testa
const DEFAULT_COLORS = { skin: '#f0c8a0', hair: '#4b3524' };

const cache = new Map(); // id faccia -> { textures }

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

/** Percorso del PNG di una faccia, oppure null se l'id non è in CONFIG.FACES. */
export function faceUrl(faceId) {
  const face = CONFIG.FACES.find((item) => item.id === faceId);
  return face ? CONFIG.FACES_PATH + face.file : null;
}

// Blocco a due fasce: capelli sopra, pelle sotto.
function drawBlock(canvas, colors, hairRows) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  ctx.fillStyle = colors.skin;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colors.hair;
  ctx.fillRect(0, 0, size, Math.round((size * hairRows) / 8));
}

// Faccia di riserva: si vede finché la foto non è caricata, o se il file manca.
function drawFallbackFace(canvas, colors) {
  drawBlock(canvas, colors, HAIR_ROWS);
  const ctx = canvas.getContext('2d');
  const unit = canvas.width / 16;
  const cell = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * unit, y * unit, w * unit, h * unit);
  };
  cell(3, 8, 3, 2, '#ffffff');
  cell(10, 8, 3, 2, '#ffffff');
  cell(4, 8, 1, 2, '#22242e');
  cell(11, 8, 1, 2, '#22242e');
  cell(5, 12, 6, 1, '#8a3b33');
  cell(4, 11, 1, 1, '#8a3b33');
  cell(11, 11, 1, 1, '#8a3b33');
}

// Colore medio dei capelli (fascia alta della foto) e della pelle (centro del viso).
function extractColors(image) {
  const size = 32;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, size, size);

  let data;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return null; // immagine servita da un altro dominio: restano i colori standard
  }

  const opaque = (x, y) => data[(y * size + x) * 4 + 3] > 128;
  let top = size;
  let bottom = -1;
  let left = size;
  let right = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!opaque(x, y)) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (bottom < 0) return null; // immagine completamente trasparente

  const average = (x0, x1, y0, y1) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!opaque(x, y)) continue;
        const i = (y * size + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }
    }
    if (count === 0) return null;
    return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
  };

  const width = right - left + 1;
  const height = bottom - top + 1;
  const inset = Math.round(width * 0.3);
  return {
    hair: average(left, right, top, top + Math.max(0, Math.round(height * 0.16) - 1)) || DEFAULT_COLORS.hair,
    skin:
      average(left + inset, right - inset, top + Math.round(height * 0.45), top + Math.round(height * 0.8)) ||
      DEFAULT_COLORS.skin,
  };
}

/** Texture della testa per una faccia. Create una volta sola e condivise tra gli avatar. */
export function getFace(faceId) {
  let face = cache.get(faceId);
  if (face) return face;

  const canvases = {
    front: makeCanvas(SIZE),
    side: makeCanvas(8),
    back: makeCanvas(8),
    top: makeCanvas(8),
    bottom: makeCanvas(8),
  };
  const textures = {};
  for (const [key, canvas] of Object.entries(canvases)) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    if (key === 'front') texture.anisotropy = 4;
    else texture.magFilter = THREE.NearestFilter;
    textures[key] = texture;
  }

  const redraw = (colors, image) => {
    if (image) {
      drawBlock(canvases.front, colors, HAIR_ROWS);
      // La foto viene mostrata intera e centrata, senza deformarla.
      const scale = Math.min(SIZE / image.width, SIZE / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      canvases.front.getContext('2d').drawImage(image, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
    } else {
      drawFallbackFace(canvases.front, colors);
    }
    drawBlock(canvases.side, colors, HAIR_ROWS);
    drawBlock(canvases.back, colors, 7);
    drawBlock(canvases.top, colors, 8);
    drawBlock(canvases.bottom, colors, 0);
    for (const texture of Object.values(textures)) texture.needsUpdate = true;
  };

  redraw(DEFAULT_COLORS, null);

  const url = faceUrl(faceId);
  if (url) {
    const image = new Image();
    image.onload = () => {
      if (image.width > 0 && image.height > 0) redraw(extractColors(image) || DEFAULT_COLORS, image);
    };
    image.src = url;
  }

  face = { textures };
  cache.set(faceId, face);
  return face;
}

let fallbackUrl = null;

/** Miniatura di riserva per menu e classifica quando un PNG non si carica. */
export function fallbackFaceUrl() {
  if (!fallbackUrl) {
    const canvas = makeCanvas(64);
    drawFallbackFace(canvas, DEFAULT_COLORS);
    fallbackUrl = canvas.toDataURL();
  }
  return fallbackUrl;
}
