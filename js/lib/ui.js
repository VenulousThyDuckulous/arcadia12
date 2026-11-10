import { el } from './util.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);

/**
 * Creates a responsive canvas sized in logical units (W x H) that scales to its
 * container without distortion, and never grows taller than `maxVh`.
 */
export function makeStage(parent, W, H, opts = {}) {
  const { maxVh = 74, wrap: extraWrap = true } = opts;
  const wrap = el('div', { class: 'stage-wrap' });
  const canvas = el('canvas', { 'aria-label': opts.label || 'game canvas' });
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.aspectRatio = `${W} / ${H}`;
  canvas.style.maxWidth = `calc(${maxVh}vh * ${(W / H).toFixed(4)})`;
  wrap.append(canvas);
  if (extraWrap) parent.append(wrap);
  else parent.append(canvas);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  const toLocal = (evt) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((evt.clientX - rect.left) / rect.width) * W,
      y: ((evt.clientY - rect.top) / rect.height) * H,
    };
  };

  return {
    W, H, ctx, canvas, wrap, toLocal,
    destroy() {
      if (wrap.contains(canvas)) wrap.removeChild(canvas);
      wrap.remove();
    },
  };
}

/** requestAnimationFrame loop with a clamped delta and a stop function. */
export function startLoop(tick) {
  let raf = 0;
  let last = performance.now();
  let running = true;
  const frame = (now) => {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(dt, now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}

/** Keyboard helper. Returns unsubscribe and a live key map. */
export function keys() {
  const down = new Set();
  const pressHandlers = new Set();
  const blocked = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar']);

  const onDown = (e) => {
    if (blocked.has(e.key) && e.target === document.body) e.preventDefault();
    if (!down.has(e.key)) {
      down.add(e.key);
      pressHandlers.forEach((fn) => fn(e.key, e));
    }
  };
  const onUp = (e) => down.delete(e.key);
  const onBlur = () => down.clear();

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  return {
    isDown: (...names) => names.some((n) => down.has(n)),
    press(fn) {
      pressHandlers.add(fn);
      return () => pressHandlers.delete(fn);
    },
    destroy() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      pressHandlers.clear();
      down.clear();
    },
  };
}

/** Minimal swipe detection for touch play. */
export function swipes(target, handler) {
  let sx = 0, sy = 0, active = false;
  const start = (e) => {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    sx = t.clientX; sy = t.clientY; active = true;
  };
  const end = (e) => {
    if (!active) return;
    active = false;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) handler(dx > 0 ? 'right' : 'left');
    else handler(dy > 0 ? 'down' : 'up');
  };
  target.addEventListener('touchstart', start, { passive: true });
  target.addEventListener('touchend', end, { passive: true });
  return () => {
    target.removeEventListener('touchstart', start);
    target.removeEventListener('touchend', end);
  };
}

export const palette = {
  bg: '#070a11',
  grid: 'rgba(255,255,255,.045)',
  ink: '#e9edf7',
  dim: '#8d95a9',
  accent: '#7cf6c8',
  accent2: '#7aa2ff',
  warn: '#ffb545',
  bad: '#ff5c7a',
};
