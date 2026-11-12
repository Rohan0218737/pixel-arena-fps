// Menu iniziale: nome, scelta della faccia, stato del server e ingresso in arena.

import { CONFIG } from './config.js';
import { fallbackFaceUrl } from './faces.js';
import { $, storage } from './utils.js';

export class Menu {
  constructor({ onPlay, onOffline }) {
    this.root = $('menu');
    this.nameInput = $('player-name');
    this.grid = $('face-grid');
    this.codeRow = $('code-row');
    this.codeInput = $('access-code');
    this.status = $('server-status');
    this.error = $('menu-error');
    this.playButton = $('btn-play');
    this.offlineButton = $('btn-offline');
    this.online = false;
    this.busy = false;

    const saved = storage.get('face');
    this.face = CONFIG.FACES.some((face) => face.id === saved) ? saved : CONFIG.FACES[0]?.id || 'default';
    this.nameInput.value = storage.get('name');
    this.buildFaces();

    this.playButton.addEventListener('click', () => onPlay(this.profile()));
    this.offlineButton.addEventListener('click', () => onOffline(this.profile()));
    for (const input of [this.nameInput, this.codeInput]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !this.playButton.disabled) this.playButton.click();
      });
    }
  }

  buildFaces() {
    for (const face of CONFIG.FACES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'face';
      button.setAttribute('role', 'option');
      button.dataset.face = face.id;

      const image = document.createElement('img');
      image.alt = '';
      image.onerror = () => {
        image.onerror = null;
        image.src = fallbackFaceUrl();
      };
      image.src = CONFIG.FACES_PATH + face.file;

      const label = document.createElement('span');
      label.textContent = face.name;
      button.append(image, label);
      button.addEventListener('click', () => this.selectFace(face.id));
      this.grid.append(button);
    }
    this.selectFace(this.face);
  }

  selectFace(id) {
    this.face = id;
    for (const button of this.grid.children) {
      button.setAttribute('aria-selected', String(button.dataset.face === id));
    }
  }

  /** Dati con cui entrare in arena; senza nome si usa quello della faccia scelta. */
  profile() {
    const typed = this.nameInput.value.trim();
    const face = CONFIG.FACES.find((item) => item.id === this.face);
    storage.set('name', typed);
    storage.set('face', this.face);
    return { name: typed || face?.name || 'Giocatore', face: this.face, code: this.codeInput.value };
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
    this.clearError();
  }

  /** kind: 'connecting' | 'online' | 'offline' */
  setStatus(kind, text) {
    this.status.className = `status ${kind}`;
    this.status.lastElementChild.textContent = text;
  }

  setLobby(info) {
    this.codeRow.classList.toggle('hidden', !info.needCode);
    this.setStatus('online', `Server online · ${info.players}/${info.max} in arena`);
    this.setOnline(true);
  }

  setOnline(online) {
    this.online = online;
    this.refreshButton();
  }

  setBusy(busy) {
    this.busy = busy;
    this.refreshButton();
  }

  refreshButton() {
    this.playButton.disabled = !this.online || this.busy;
    this.playButton.textContent = this.busy ? 'Ingresso…' : "Entra nell'arena";
  }

  showError(text) {
    this.error.textContent = text;
    this.error.classList.remove('hidden');
  }

  clearError() {
    this.error.classList.add('hidden');
  }
}
