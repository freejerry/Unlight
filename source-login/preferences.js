const storageKey = 'unlight.source-login.preferences';
const defaults = Object.freeze({ bgm: 50, se: 50, cv: 50, toolTip: true, arrow: true });
const listeners = new Set();

function normalize(key, value, fallback) {
  if (typeof defaults[key] === 'boolean') return typeof value === 'boolean' ? value : fallback;
  return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : fallback;
}

function loadPreferences() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch {
    // Settings remain usable in memory if storage is blocked or unreadable.
  }
  return Object.freeze(Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => (
    [key, normalize(key, saved?.[key], fallback)]
  ))));
}

let preferences = loadPreferences();

export function getPreferences() {
  return preferences;
}

export function setPreference(key, value) {
  if (!Object.hasOwn(defaults, key)) return preferences;
  const updated = normalize(key, value, preferences[key]);
  if (updated === preferences[key]) return preferences;

  const previous = preferences;
  preferences = Object.freeze({ ...preferences, [key]: updated });
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    // Storage failure does not revert controls or audio in the current page.
  }
  for (const listener of listeners) listener(preferences, previous);
  return preferences;
}

export function subscribePreferences(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
