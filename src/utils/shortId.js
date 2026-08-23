const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const SHORT_ID_REGEX = /^[A-Za-z0-9]{4}$/;

/**
 * Erzeugt eine zufällige 4-stellige alphanumerische ID (A-Z, a-z, 0-9).
 * Keine Eindeutigkeitsprüfung hier - das macht der Aufrufer gegen die DB
 * (siehe database.js: generateUniqueShortId).
 */
export function generateShortId() {
  let id = '';
  for (let i = 0; i < 4; i++) {
    id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return id;
}

export function isValidShortId(id) {
  return typeof id === 'string' && SHORT_ID_REGEX.test(id);
}
