// Effetti sonori sintetizzati con Web Audio: suoni in stile 8 bit, nessun file audio.

import { CONFIG } from './config.js';
import { storage } from './utils.js';

export class Sfx {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.muted = storage.get('muted') === '1';
  }

  /** I browser fanno partire l'audio solo dopo un gesto dell'utente: va chiamato da un click. */
  unlock() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!this.context) {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : CONFIG.VOLUME;
      this.master.connect(this.context.destination);

      const length = this.context.sampleRate;
      this.noiseBuffer = this.context.createBuffer(1, length, length);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === 'suspended') this.context.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    storage.set('muted', muted ? '1' : '0');
    if (this.master) this.master.gain.value = muted ? 0 : CONFIG.VOLUME;
  }

  // Nota con frequenza che scivola da "from" a "to" e volume che sfuma.
  tone({ type = 'square', from, to = from, duration, volume = 0.2, delay = 0 }) {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  // Soffio di rumore filtrato: scoppi, colpi, scatti meccanici.
  noise({ frequency, duration, volume = 0.2, delay = 0 }) {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.02);
  }

  /** Sparo; "loudness" tra 0 e 1 attenua quelli lontani degli altri giocatori. */
  shoot(loudness = 1) {
    if (loudness <= 0.02) return;
    this.tone({ type: 'square', from: 920, to: 170, duration: 0.11, volume: 0.16 * loudness });
    this.noise({ frequency: 2200, duration: 0.07, volume: 0.22 * loudness });
  }

  hit(head) {
    this.tone({ type: 'triangle', from: head ? 1900 : 1300, duration: 0.06, volume: 0.3 });
    if (head) this.tone({ type: 'triangle', from: 2500, duration: 0.08, volume: 0.25, delay: 0.06 });
  }

  hurt() {
    this.tone({ type: 'sawtooth', from: 210, to: 80, duration: 0.18, volume: 0.3 });
    this.noise({ frequency: 500, duration: 0.12, volume: 0.25 });
  }

  kill() {
    [660, 880, 1320].forEach((frequency, index) => {
      this.tone({ type: 'square', from: frequency, duration: 0.09, volume: 0.16, delay: index * 0.08 });
    });
  }

  death() {
    this.tone({ type: 'square', from: 440, to: 55, duration: 0.7, volume: 0.22 });
  }

  spawn() {
    this.tone({ type: 'triangle', from: 330, to: 660, duration: 0.2, volume: 0.2 });
  }

  reloadStart() {
    this.noise({ frequency: 3000, duration: 0.04, volume: 0.25 });
    this.tone({ type: 'square', from: 300, to: 200, duration: 0.05, volume: 0.08 });
  }

  reloadEnd() {
    this.noise({ frequency: 3600, duration: 0.05, volume: 0.3 });
    this.tone({ type: 'square', from: 500, to: 700, duration: 0.06, volume: 0.1, delay: 0.03 });
  }
}
