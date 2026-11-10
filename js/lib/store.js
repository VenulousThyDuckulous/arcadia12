const KEY = 'arcadia:best';

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function getBest(id) {
  const v = readAll()[id];
  return Number.isFinite(v) ? v : 0;
}

/** Stores the score if it beats the previous best. Returns true when it is a new record. */
export function submitScore(id, score) {
  const all = readAll();
  const prev = Number.isFinite(all[id]) ? all[id] : 0;
  if (score > prev) {
    all[id] = score;
    writeAll(all);
    return true;
  }
  return false;
}

export function clearScores() {
  writeAll({});
}
