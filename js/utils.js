// Small DOM + motion helpers shared by every module.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isMobile = () => innerWidth < 900;

/** Wrap every character in a span, keeping words unbroken. Screen readers get the plain text. */
export function splitChars(el) {
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = text;
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  const chars = [];
  text.split(' ').forEach((word, wi, arr) => {
    const w = document.createElement('span');
    w.className = 'w';
    for (const c of word) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c;
      w.appendChild(s);
      chars.push(s);
    }
    vis.appendChild(w);
    if (wi < arr.length - 1) vis.appendChild(document.createTextNode(' '));
  });
  el.append(sr, vis);
  return chars;
}

/** Wrap every word (including words inside <em>/<b>) in a span.wd, preserving markup. */
export function splitWords(root) {
  const out = [];
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
          else {
            const s = document.createElement('span');
            s.className = 'wd';
            s.textContent = part;
            frag.appendChild(s);
            out.push(s);
          }
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(root);
  return out;
}

/** Each letter rolls up to reveal a copy of itself on hover. */
export function rollify(el) {
  const text = el.textContent.trim();
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = text;
  el.appendChild(sr);
  [...text].forEach((c, i) => {
    const r = document.createElement('span');
    r.className = 'r';
    r.style.setProperty('--i', i);
    r.setAttribute('aria-hidden', 'true');
    const a = document.createElement('span');
    const b = document.createElement('span');
    a.textContent = b.textContent = c === ' ' ? ' ' : c;
    r.append(a, b);
    el.appendChild(r);
  });
}

const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEFXZ';
/** Decode-style text scramble from the current text to `to`. Resolves when done. */
export function scramble(el, to, { duration = 0.9, glyphs = GLYPHS } = {}) {
  return new Promise((resolve) => {
    const id = (el._scrambleId = (el._scrambleId || 0) + 1); // a newer call cancels this one
    const from = el.textContent;
    const len = Math.max(from.length, to.length);
    const frames = Math.max(12, Math.round(duration * 60));
    const q = [];
    for (let i = 0; i < len; i++) {
      const start = Math.floor(Math.random() * frames * 0.45);
      const end = start + Math.floor(frames * 0.35 + Math.random() * frames * 0.2);
      q.push({ from: from[i] || '', to: to[i] || '', start, end, ch: '' });
    }
    let f = 0;
    const tick = () => {
      if (el._scrambleId !== id) { resolve(); return; }
      let out = '';
      let done = 0;
      for (const item of q) {
        if (f >= item.end) { done++; out += item.to; }
        else if (f >= item.start) {
          if (!item.ch || Math.random() < 0.3) item.ch = glyphs[Math.floor(Math.random() * glyphs.length)];
          out += item.ch;
        } else out += item.from;
      }
      el.textContent = out;
      if (done === q.length) resolve();
      else { f++; requestAnimationFrame(tick); }
    };
    tick();
  });
}

/** Build an odometer (rolling digit columns) for el[data-value]. Returns the columns + targets. */
export function buildOdometer(el) {
  const value = el.dataset.value;
  el.textContent = '';
  el.setAttribute('aria-label', value);
  const cols = [];
  [...value].forEach((d) => {
    const wrap = document.createElement('span');
    wrap.className = 'odo__d';
    wrap.setAttribute('aria-hidden', 'true');
    if (!/\d/.test(d)) { wrap.textContent = d; el.appendChild(wrap); return; }
    const col = document.createElement('span');
    col.className = 'odo__col';
    for (let k = 0; k < 20; k++) {
      const s = document.createElement('span');
      s.textContent = k % 10;
      col.appendChild(s);
    }
    wrap.appendChild(col);
    el.appendChild(wrap);
    cols.push({ col, target: 10 + Number(d) });
  });
  return cols;
}

/** Elements drift toward the pointer and spring back. */
export function magnetic(el, strength = 0.3) {
  const gsap = window.gsap;
  const xTo = gsap.quickTo(el, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.35)' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.35)' });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    xTo((e.clientX - (r.left + r.width / 2)) * strength);
    yTo((e.clientY - (r.top + r.height / 2)) * strength);
  });
  el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
}

/** Keep a <canvas> backing store matched to its CSS size × DPR. */
export function fitCanvas(canvas, maxDpr = 2) {
  const dpr = Math.min(devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w, h, dpr };
}

/** Run `onFrame(dt, t)` only while `el` is on screen. */
export function whileVisible(el, onFrame, { rootMargin = '100px' } = {}) {
  let running = false;
  let last = 0;
  let raf = 0;
  const loop = (t) => {
    if (!running) return;
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    onFrame(dt, t / 1000);
    raf = requestAnimationFrame(loop);
  };
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    else if (!entry.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  }, { rootMargin });
  io.observe(el);
  return () => { io.disconnect(); running = false; cancelAnimationFrame(raf); };
}
