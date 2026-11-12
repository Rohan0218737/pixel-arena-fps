// Controlli sui dati in arrivo dai client: ciò che arriva dalla rete non è mai fidato.

export const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export const isVector = (value, length) =>
  Array.isArray(value) && value.length === length && value.every(isNumber);

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Riporta un angolo nell'intervallo [-PI, PI). */
export function wrapAngle(angle) {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

export function cleanName(value, maxLength) {
  const text = typeof value === 'string' ? value : '';
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Array.from conta i caratteri reali, così un'emoji non viene tagliata a metà.
  return Array.from(cleaned).slice(0, maxLength).join('').trim() || 'Giocatore';
}

export function cleanFace(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(value) ? value : 'default';
}
