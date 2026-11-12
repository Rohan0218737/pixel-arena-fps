// Comandi a schermo per telefoni e tablet: levetta a sinistra, mira trascinando a
// destra, pulsanti per sparare, saltare e ricaricare. Servono soprattutto per provare
// il gioco dal telefono; l'esperienza completa resta mouse e tastiera.

import { $, clamp } from './utils.js';

const STICK_RADIUS = 56; // pixel di corsa della levetta

// Segue un solo dito per elemento, dal tocco al rilascio.
function trackPointer(element, { start, move, end }) {
  let activeId = null;
  let lastX = 0;
  let lastY = 0;

  element.addEventListener('pointerdown', (event) => {
    if (activeId !== null) return;
    activeId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    try {
      element.setPointerCapture(activeId);
    } catch {
      // il dito è già stato sollevato
    }
    event.preventDefault();
    if (start) start(event);
  });

  element.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activeId) return;
    if (move) move(event, event.clientX - lastX, event.clientY - lastY);
    lastX = event.clientX;
    lastY = event.clientY;
  });

  const finish = (event) => {
    if (event.pointerId !== activeId) return;
    activeId = null;
    if (end) end(event);
  };
  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', finish);
}

export class TouchControls {
  constructor(input, { onPause, onReload, onScore }) {
    const base = $('stick-base');
    const knob = $('stick-knob');
    let originX = 0;
    let originY = 0;

    const look = (event, dx, dy) => input.addLook(dx, dy);

    // Levetta: compare dove si appoggia il pollice.
    trackPointer($('touch-move'), {
      start: (event) => {
        originX = event.clientX;
        originY = event.clientY;
        base.style.left = `${originX}px`;
        base.style.top = `${originY}px`;
        knob.style.transform = '';
        base.classList.remove('hidden');
      },
      move: (event) => {
        let dx = event.clientX - originX;
        let dy = event.clientY - originY;
        const length = Math.hypot(dx, dy);
        if (length > STICK_RADIUS) {
          dx = (dx / length) * STICK_RADIUS;
          dy = (dy / length) * STICK_RADIUS;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.stick.x = clamp(dx / STICK_RADIUS, -1, 1);
        input.stick.y = clamp(dy / STICK_RADIUS, -1, 1);
      },
      end: () => {
        input.stick.x = 0;
        input.stick.y = 0;
        base.classList.add('hidden');
      },
    });

    trackPointer($('touch-look'), { move: look });

    // Tenendo premuto il pulsante di fuoco si può continuare a mirare trascinando.
    const fire = $('btn-fire');
    trackPointer(fire, {
      start: () => {
        input.firing = true;
        fire.classList.add('active');
      },
      move: look,
      end: () => {
        input.firing = false;
        fire.classList.remove('active');
      },
    });

    const jump = $('btn-jump');
    trackPointer(jump, {
      start: () => {
        input.touchJump = true;
        jump.classList.add('active');
      },
      end: () => {
        input.touchJump = false;
        jump.classList.remove('active');
      },
    });

    trackPointer($('btn-reload'), { start: onReload });
    trackPointer($('btn-pause'), { start: onPause });
    trackPointer($('btn-score'), { start: onScore });
  }
}
