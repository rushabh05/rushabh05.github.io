// Orchestrates the page: loader, smooth scroll, the WebGL globe, and every scroll scene.

import {
  $, $$, lerp, clamp, wait, reducedMotion, finePointer, isMobile,
  splitChars, splitWords, rollify, scramble, buildOdometer, magnetic,
} from './utils.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const html = document.documentElement;

if (!gsap || !ScrollTrigger) {
  // A CDN failed: show the static page rather than a broken one.
  html.classList.add('no-motion');
  $('.loader')?.remove();
} else {
  boot().catch((err) => {
    console.error(err);
    html.classList.add('no-motion');
    $('.loader')?.remove();
  });
}

async function boot() {
  html.classList.add('booted');
  gsap.registerPlugin(ScrollTrigger);
  if (reducedMotion) html.classList.add('reduced');
  gsap.defaults({ ease: 'expo.out' });

  /* ---------------- smooth scroll ---------------- */
  let lenis = null;
  if (!reducedMotion && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
    window.lenis = lenis; // handy from the console: lenis.scrollTo('#lab')
  }

  /* ---------------- text prep (before anything is visible) ---------------- */
  $$('[data-roll]').forEach(rollify);
  const heroLines = $$('.hero__line');
  const heroChars = heroLines.flatMap((l) => splitChars(l));
  const contactChars = splitChars($('.contact__line[data-fluid]'));
  const manifestoWords = splitWords($('.manifesto'));
  const splitTitles = $$('[data-split]').map((el) => ({ el, chars: splitChars(el) }));

  if (!reducedMotion) {
    gsap.set(heroChars, { yPercent: 115, rotate: 7 });
    gsap.set('[data-hero-fade]', { autoAlpha: 0, y: 24 });
  }

  /* ---------------- kick off async work in parallel ---------------- */
  const globeP = import('./globe.js')
    .then(({ createGlobe }) => createGlobe($('.webgl')))
    .catch((err) => { console.warn('WebGL disabled:', err); $('.webgl')?.remove(); return null; });
  const vizP = import('./viz.js').catch((err) => { console.warn(err); return null; });
  const fontsP = document.fonts ? document.fonts.ready : Promise.resolve();

  /* ---------------- loader ---------------- */
  const loaderDone = reducedMotion ? Promise.resolve() : runLoader();

  const [globe] = await Promise.all([
    Promise.race([globeP, wait(4500).then(() => null)]),
    fontsP,
    loaderDone,
  ]);

  if (globe) {
    gsap.ticker.add((time, deltaMs) => globe.tick(time, deltaMs / 1000));
    addEventListener('resize', () => globe.resize());
    globe.state.y = isMobile() ? 1.1 : 0.3;
    if (reducedMotion) Object.assign(globe.state, { intro: 1, draw: 1, dust: 1 });
  }

  /* ---------------- build every scene now that fonts are in ---------------- */
  fitHero();
  let resizeT = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { fitHero(); ScrollTrigger.refresh(); }, 150);
  });
  cursor();
  hud();
  heroExtras();
  manifesto(manifestoWords);
  revealBatches();
  titles(splitTitles);
  pods();
  stats();
  experience();
  work();
  archive();
  lab();
  marquees();
  contact(contactChars);
  anchors(lenis);
  globeScroll(globe);
  if (finePointer && !reducedMotion) {
    $$('[data-magnetic]').forEach((el) => magnetic(el, 0.28));
    fluidType($('.hero'), heroChars, { w: 118, g: 900 });
    fluidType($('.contact'), contactChars, { w: 110, g: 900 });
  }
  vizP.then((m) => m && m.initViz());

  /* ---------------- reveal ---------------- */
  // triggers were created out of page order (pins sit above some of them): sort, then measure
  ScrollTrigger.sort();
  ScrollTrigger.refresh();

  await exitLoader(globe, heroChars);
  lenis?.start();
  ScrollTrigger.refresh();
  addEventListener('load', () => ScrollTrigger.refresh());
}

/* =================================================================== loader */
function runLoader() {
  const num = $('#loaderNum');
  const counter = { v: 0 };
  const tl = gsap.timeline();
  tl.to(counter, {
    v: 100, duration: 2.3, ease: 'power3.inOut',
    onUpdate: () => { num.textContent = String(Math.round(counter.v)).padStart(3, '0'); },
  }, 0);
  tl.to('.loader__bar i', { scaleX: 1, duration: 2.3, ease: 'power3.inOut' }, 0);
  $$('.loader__log p').forEach((p, i) => {
    tl.fromTo(p, { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: 0.5 }, 0.15 + i * 0.42);
  });
  return tl.then();
}

function exitLoader(globe, heroChars) {
  const loader = $('.loader');
  const tl = gsap.timeline();
  if (loader && !reducedMotion) {
    tl.to('.loader__log, .loader__label', { autoAlpha: 0, y: -20, duration: 0.5, ease: 'power2.in' })
      .to('.loader__num', { yPercent: -30, autoAlpha: 0, duration: 0.6, ease: 'power3.in' }, '<0.05')
      .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, '-=0.25')
      .add(() => loader.remove());
  } else {
    loader?.remove();
  }
  if (reducedMotion) return tl.then();

  const t0 = loader ? '-=0.75' : 0;
  tl.addLabel('hero', t0);
  tl.to(heroChars, { yPercent: 0, rotate: 0, duration: 1.5, stagger: 0.04 }, 'hero');
  tl.to('[data-hero-fade]', { autoAlpha: 1, y: 0, duration: 1.2, stagger: 0.08 }, 'hero+=0.45');
  if (globe) {
    tl.to(globe.state, { intro: 1, duration: 2.8, ease: 'expo.out' }, 'hero-=0.2');
    tl.to(globe.state, { draw: 1, duration: 3.4, ease: 'power2.inOut' }, 'hero+=0.5');
    tl.to(globe.state, { dust: 1, duration: 2.4, ease: 'power1.out' }, 'hero+=0.3');
  }
  // resolve once the text is in, leave the globe easing on its own
  return new Promise((res) => { tl.call(res, null, 'hero+=1.1'); });
}

/* =================================================================== cursor */
function cursor() {
  if (!finePointer) return;
  html.classList.add('has-cursor');
  const root = $('.cursor');
  const dot = $('.cursor__dot');
  const ring = $('.cursor__ring');
  const label = $('.cursor__label');
  const p = { x: innerWidth / 2, y: innerHeight / 2 };
  const r = { ...p };
  const setDot = { x: gsap.quickSetter(dot, 'x', 'px'), y: gsap.quickSetter(dot, 'y', 'px') };
  const setRing = { x: gsap.quickSetter(ring, 'x', 'px'), y: gsap.quickSetter(ring, 'y', 'px') };
  const setLabel = { x: gsap.quickSetter(label, 'x', 'px'), y: gsap.quickSetter(label, 'y', 'px') };
  addEventListener('pointermove', (e) => { p.x = e.clientX; p.y = e.clientY; setDot.x(p.x); setDot.y(p.y); }, { passive: true });
  gsap.ticker.add(() => {
    r.x = lerp(r.x, p.x, 0.17);
    r.y = lerp(r.y, p.y, 0.17);
    setRing.x(r.x); setRing.y(r.y);
    setLabel.x(r.x); setLabel.y(r.y);
  });
  addEventListener('pointerdown', () => root.classList.add('is-down'));
  addEventListener('pointerup', () => root.classList.remove('is-down'));
  document.addEventListener('pointerover', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const labelled = t.closest('[data-cursor]');
    const inner = t.closest('a, button');
    if (labelled && !(inner && labelled.contains(inner) && inner !== labelled)) {
      label.textContent = labelled.dataset.cursor;
      root.classList.add('has-label');
      root.classList.remove('is-hover');
    } else if (inner) {
      root.classList.add('is-hover');
      root.classList.remove('has-label');
    } else {
      root.classList.remove('is-hover', 'has-label');
    }
  });
  document.addEventListener('pointerleave', () => root.classList.remove('is-hover', 'has-label'));
}

/* =================================================================== HUD */
function hud() {
  const fpsEl = $('#hudFps');
  const txEl = $('#hudTx');
  const bar = $('#hudBar');
  const sec = $('#hudSection');
  let frames = 0;
  let acc = 0;
  gsap.ticker.add((time, delta) => {
    frames++;
    acc += delta;
    if (acc >= 500) { fpsEl.textContent = `${Math.round((frames * 1000) / acc)} fps`; frames = 0; acc = 0; }
    const max = document.documentElement.scrollHeight - innerHeight;
    const k = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    txEl.textContent = `${String(Math.round(k * 100)).padStart(2, '0')}%`;
    bar.style.transform = `scaleX(${k})`;
  });
  let current = sec.textContent;
  $$('[data-section]').forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: 'top 55%', end: 'bottom 55%',
      onToggle: (self) => {
        if (!self.isActive) return;
        const next = el.dataset.section;
        if (next === current) return;
        current = next;
        scramble(sec, next, { duration: 0.6 });
      },
    });
  });
}

/* =================================================================== hero */
function heroExtras() {
  // live Mumbai clock
  const clock = $('#heroClock');
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tickClock = () => { clock.textContent = fmt.format(new Date()); };
  tickClock();
  setInterval(tickClock, 1000);
  $('#year').textContent = new Date().getFullYear();

  // cycling verb
  const swap = $('#heroSwap');
  const words = ['fast', 'lean', 'small', 'sturdy'];
  let i = 0;
  if (!reducedMotion) {
    setInterval(() => {
      i = (i + 1) % words.length;
      scramble(swap, words[i], { duration: 0.7 });
    }, 2600);
  }

  // hero parallax out
  gsap.to('.hero__name', {
    yPercent: -18, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.hero__bottom, .hero__top', {
    autoAlpha: 0, y: -40, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: '45% top', scrub: true },
  });
}

/**
 * Desktop: the name sits on one line at its CSS size. Mobile: two stacked lines sized to
 * about 80% of the width so the longer word never overflows.
 */
function fitHero() {
  const h1 = $('.hero__name');
  h1.style.fontSize = '';
  if (!isMobile()) return;
  const avail = h1.clientWidth * 0.8;
  const base = parseFloat(getComputedStyle(h1).fontSize);
  const widest = Math.max(...$$('.hero__line > [aria-hidden]', h1).map((s) => s.getBoundingClientRect().width));
  if (!widest) return;
  h1.style.fontSize = `${Math.min((base * avail) / widest, innerHeight * 0.1)}px`;
}

/** Characters near the pointer turn thin and condensed, like a lens moving across the type. */
function fluidType(zone, chars, base = { w: 110, g: 900 }) {
  if (!zone || !chars.length) return;
  const st = chars.map(() => ({ w: base.w, g: base.g }));
  let mx = -1e4;
  let my = -1e4;
  let active = false;
  let settled = true;
  let visible = false;
  zone.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; active = true; settled = false; });
  zone.addEventListener('pointerleave', () => { active = false; settled = false; });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(zone);
  gsap.ticker.add(() => {
    if (!visible || settled) return;
    const rects = chars.map((c) => c.getBoundingClientRect());
    let moving = false;
    chars.forEach((c, i) => {
      const r = rects[i];
      const d = active ? Math.hypot(mx - (r.left + r.width / 2), (my - (r.top + r.height / 2)) * 1.3) : 1e4;
      const k = Math.exp(-(d * d) / (2 * 130 * 130));
      const tw = base.w - k * (base.w - 62);
      const tg = base.g - k * 720;
      const s = st[i];
      s.w += (tw - s.w) * 0.14;
      s.g += (tg - s.g) * 0.14;
      if (Math.abs(tw - s.w) > 0.2 || Math.abs(tg - s.g) > 1) moving = true;
      c.style.fontVariationSettings = `"wdth" ${s.w.toFixed(1)}, "wght" ${Math.round(s.g)}`;
    });
    if (!active && !moving) settled = true;
  });
}

/* =================================================================== text reveals */
function manifesto(words) {
  if (reducedMotion) { gsap.set(words, { opacity: 1 }); return; }
  gsap.to(words, {
    opacity: 1, ease: 'none', stagger: 0.12,
    scrollTrigger: { trigger: '.manifesto', start: 'top 82%', end: 'bottom 48%', scrub: 0.6 },
  });
}

function revealBatches() {
  if (reducedMotion) { gsap.set('[data-reveal]', { opacity: 1, y: 0 }); return; }
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.2, stagger: 0.07, overwrite: true }),
  });
}

function titles(list) {
  if (reducedMotion) return;
  list.forEach(({ el, chars }) => {
    el.classList.add('is-split');
    gsap.from(chars, {
      yPercent: 110, rotate: 5, duration: 1.3, stagger: 0.025,
      scrollTrigger: { trigger: el, start: 'top 86%', once: true },
    });
  });
}

/* =================================================================== 100 → 8 pods */
function pods() {
  const grid = $('.pods__grid');
  const live = new Set([43, 44, 45, 46, 53, 54, 55, 56]);
  const cells = [];
  for (let i = 0; i < 100; i++) {
    const c = document.createElement('i');
    grid.appendChild(c);
    cells.push(c);
  }
  const survivors = cells.filter((_, i) => live.has(i));
  const doomed = gsap.utils.shuffle(cells.filter((_, i) => !live.has(i)));
  const steps = $$('.pods__step');
  const countEl = $('#podCount');
  const costEl = $('#podCost');
  const runtime = $('#podRuntime');
  const bar = $('.pods__bar i');

  if (reducedMotion) {
    doomed.forEach((c) => { c.style.opacity = 0.15; });
    survivors.forEach((c) => c.classList.add('is-live'));
    countEl.textContent = '8';
    costEl.textContent = '10';
    gsap.set(bar, { scaleX: 0.1 });
    return;
  }

  const n = { pods: 100, cost: 100 };
  const render = () => {
    countEl.textContent = Math.round(n.pods);
    costEl.textContent = Math.round(n.cost);
  };
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: { trigger: '.pods', start: 'top top', end: '+=220%', pin: '.pods__pin', scrub: 0.8, anticipatePin: 1 },
  });
  tl.from(cells, { scale: 0, autoAlpha: 0, duration: 0.6, stagger: { each: 0.006, grid: [10, 10], from: 'center' } })
    .from(bar, { scaleX: 0, duration: 0.6 }, '<')
    // load: every pod busy, one job each
    .to(cells, { backgroundColor: '#1d2126', duration: 0.2, stagger: { each: 0.004, from: 'random' } }, '+=0.2')
    .to(steps[0], { autoAlpha: 0, y: -24, duration: 0.3 }, '+=0.2')
    .addLabel('node')
    .fromTo(steps[1], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 'node')
    // callbacks fire in both scrub directions, so a pair swaps the label back and forth
    .call(() => { runtime.textContent = 'php-fpm · 1 job / process'; }, null, 'node-=0.01')
    .call(() => { runtime.textContent = 'node.js · event loop · thousands / process'; }, null, 'node')
    // the cull
    .addLabel('cull', '+=0.25')
    .to(doomed, {
      scale: 0, autoAlpha: 0, duration: 0.5, ease: 'power3.in',
      rotate: () => gsap.utils.random(-120, 120), y: () => gsap.utils.random(30, 160), x: () => gsap.utils.random(-40, 40),
      stagger: { each: 0.012 },
    }, 'cull')
    .to(n, { pods: 8, cost: 10, duration: doomed.length * 0.012 + 0.5, ease: 'power1.inOut', onUpdate: render }, 'cull')
    .to(bar, { scaleX: 0.1, duration: doomed.length * 0.012 + 0.5, ease: 'power1.inOut' }, 'cull')
    .addLabel('lean')
    .to(survivors, { backgroundColor: '#c6ff3d', borderColor: '#c6ff3d', boxShadow: '0 0 28px rgba(198,255,61,0.45)', duration: 0.3, stagger: 0.03 }, 'lean-=0.15')
    .to(grid, { scale: 1.9, duration: 0.7 }, 'lean')
    .to(steps[1], { autoAlpha: 0, y: -24, duration: 0.3 }, 'lean')
    .fromTo(steps[2], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 'lean+=0.15')
    .to({}, { duration: 0.6 });
}

/* =================================================================== panel stats */
// Odometers inside the case-study panels roll when the panel comes into view. An
// IntersectionObserver works for both the horizontal (desktop) and stacked (mobile) layouts.
function stats() {
  $$('.panel__stat .odo').forEach((el) => {
    const cols = buildOdometer(el);
    if (reducedMotion) {
      cols.forEach(({ col, target }) => gsap.set(col, { yPercent: -5 * target }));
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      cols.forEach(({ col, target }, i) => {
        gsap.fromTo(col, { yPercent: 0 }, { yPercent: -5 * target, duration: 2 + i * 0.35, ease: 'expo.out', delay: 0.25 });
      });
    }, { threshold: 0.6 });
    io.observe(el);
  });
}

/* =================================================================== experience */
function experience() {
  gsap.to('.xp__rail i', {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '.xp__list', start: 'top 65%', end: 'bottom 65%', scrub: true },
  });
}

/* =================================================================== horizontal work */
function work() {
  const pin = $('.work__pin');
  const track = $('.work__track');
  const panels = $$('.panel', track);
  const idx = $('#workIdx');
  const bar = $('.work__bar i');
  const projects = panels.filter((p) => !p.classList.contains('panel--intro') && !p.classList.contains('panel--outro'));

  // whole panel opens its link
  projects.forEach((p) => {
    const link = $('.panel__link', p);
    if (!link) return;
    p.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      window.open(link.href, '_blank', 'noopener');
    });
  });

  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    const dist = () => Math.max(0, track.scrollWidth - innerWidth);
    const tween = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: pin, start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 0.9, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: (self) => {
          bar.style.transform = `scaleX(${self.progress})`;
          idx.textContent = String(Math.min(projects.length, Math.floor(self.progress * (projects.length + 0.4)))).padStart(2, '0');
        },
      },
    });
    projects.forEach((p) => {
      const media = $('[data-parallax]', p);
      if (media) {
        gsap.fromTo(media, { xPercent: 6 }, {
          xPercent: -6, ease: 'none',
          scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
        });
      }
      if (!reducedMotion) {
        gsap.from($$('.panel__reveal', p), {
          y: 50, autoAlpha: 0, duration: 1, stagger: 0.06,
          scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left 78%', toggleActions: 'play none none reverse' },
        });
        gsap.from($('.panel__viz', p), {
          clipPath: 'inset(0% 0% 0% 100% round 14px)', duration: 1.4, ease: 'expo.inOut',
          scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left 85%', toggleActions: 'play none none reverse' },
        });
      }
    });
    return () => {};
  });
  mm.add('(max-width: 899px)', () => {
    if (reducedMotion) return;
    projects.forEach((p) => {
      gsap.from($$('.panel__reveal', p), { y: 40, autoAlpha: 0, duration: 1, stagger: 0.06, scrollTrigger: { trigger: p, start: 'top 80%', once: true } });
    });
  });
}

/* =================================================================== archive */
function archive() {
  $$('.archive__row').forEach((row) => {
    row.addEventListener('pointerenter', (e) => {
      const r = row.getBoundingClientRect();
      row.style.setProperty('--origin', e.clientY < r.top + r.height / 2 ? 'top' : 'bottom');
    });
    row.addEventListener('pointerleave', (e) => {
      const r = row.getBoundingClientRect();
      row.style.setProperty('--origin', e.clientY < r.top + r.height / 2 ? 'top' : 'bottom');
    });
  });
}

/* =================================================================== lab */
function lab() {
  const grid = $('.lab__grid');
  const cards = $$('.lab__card', grid);
  grid.addEventListener('pointermove', (e) => {
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
  grid.addEventListener('pointerleave', () => cards.forEach((c) => { c.style.setProperty('--mx', '-500px'); c.style.setProperty('--my', '-500px'); }));

  if (!reducedMotion) {
    gsap.from(cards, {
      y: 90, rotateX: -28, autoAlpha: 0, transformPerspective: 1000, transformOrigin: '50% 0%', duration: 1.3, stagger: 0.09,
      scrollTrigger: { trigger: grid, start: 'top 82%', once: true },
    });
    cards.forEach((c) => {
      const h = $('h3', c);
      const text = h.textContent;
      c.addEventListener('pointerenter', () => scramble(h, text, { duration: 0.5 }));
    });
  }

  // terminal typing
  const code = $('[data-term] code');
  const script = [
    ['$ ', 'c-acc'], ['ls ~/lab\n'],
    ['maglev-xdp/  tcp-from-scratch/  raft-kv/\nmatching-engine/  quic/  vec-engine/\n', 'c-dim'],
    ['$ ', 'c-acc'], ['cat ~/lab/RULES.md\n'],
    ['1. every project ships a benchmark\n2. every claim ships a flamegraph\n3. read the RFC before the blog post\n', 'c-dim'],
    ['$ ', 'c-acc'], ['./lab --status\n'],
    ['6 projects · 1 in development · 5 designing', 'c-acc'],
  ];
  const type = async () => {
    code.textContent = '';
    for (const [text, cls] of script) {
      const span = document.createElement('span');
      if (cls) span.className = cls;
      code.appendChild(span);
      if (cls === 'c-dim' || reducedMotion) { span.textContent = text; await wait(reducedMotion ? 0 : 180); continue; }
      for (const ch of text) { span.textContent += ch; await wait(ch === '\n' ? 140 : 24 + Math.random() * 30); }
    }
    const caret = document.createElement('span');
    caret.className = 'caret';
    code.appendChild(caret);
  };
  ScrollTrigger.create({ trigger: '[data-term]', start: 'top 85%', once: true, onEnter: type });
}

/* =================================================================== marquees */
function marquees() {
  const tracks = $$('.marquee__track');
  const tweens = tracks.map((track, i) => {
    // duplicate for a seamless loop; the copy is hidden from screen readers
    const copies = [...track.children].map((n) => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); return c; });
    track.append(...copies);
    const dir = i % 2 ? 1 : -1;
    if (reducedMotion) return null;
    return dir < 0
      ? gsap.fromTo(track, { xPercent: 0 }, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 })
      : gsap.fromTo(track, { xPercent: -50 }, { xPercent: 0, duration: 44, ease: 'none', repeat: -1 });
  });
  if (reducedMotion) return;
  const skew = gsap.quickTo(tracks, 'skewX', { duration: 0.5, ease: 'power3.out' });
  let speed = 1;
  ScrollTrigger.create({
    trigger: '.stack', start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => {
      const v = self.getVelocity();
      speed = 1 + Math.min(Math.abs(v) / 220, 7);
      skew(clamp(v / -90, -14, 14));
    },
  });
  gsap.ticker.add(() => {
    speed = lerp(speed, 1, 0.04);
    tweens.forEach((t) => t && t.timeScale(speed));
  });
  ScrollTrigger.addEventListener('scrollEnd', () => skew(0));
}

/* =================================================================== contact */
function contact(chars) {
  if (!reducedMotion) {
    gsap.from(chars, {
      yPercent: 100, autoAlpha: 0, rotate: 6, duration: 1.4, stagger: 0.035,
      scrollTrigger: { trigger: '.contact__title', start: 'top 82%', once: true },
    });
    gsap.from('.contact__line:last-child', {
      yPercent: 60, autoAlpha: 0, duration: 1.4, delay: 0.25,
      scrollTrigger: { trigger: '.contact__title', start: 'top 82%', once: true },
    });
  }

  contactForm();

  // copy email
  const mail = $('.mail');
  const hint = $('.mail__hint', mail);
  mail.addEventListener('click', async () => {
    const addr = mail.dataset.copy;
    try {
      await navigator.clipboard.writeText(addr);
      hint.textContent = 'copied to clipboard ✓';
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('.mail__text', mail));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      hint.textContent = 'selected, press ⌘C';
    }
    mail.classList.add('is-copied');
    setTimeout(() => { hint.textContent = 'copy'; mail.classList.remove('is-copied'); }, 2200);
  });

  // a real RTT measurement against this page's own host
  const btn = $('.ping__btn');
  const out = $('.ping__out');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const host = location.host || 'localhost';
    out.innerHTML = '';
    const line = (txt, cls) => {
      const s = document.createElement('span');
      if (cls) s.className = cls;
      s.textContent = `${txt}\n`;
      out.appendChild(s);
    };
    line(`$ ping -c 4 ${host}`, 'c-acc');
    line(`PING ${host}: 56 data bytes`);
    const times = [];
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      try {
        const url = new URL(location.href);
        url.hash = '';
        url.searchParams.set('ping', `${Date.now()}${i}`);
        await fetch(url, { method: 'HEAD', cache: 'no-store' });
        const dt = performance.now() - t0;
        times.push(dt);
        line(`64 bytes from ${host}: icmp_seq=${i} ttl=64 time=${dt.toFixed(1)} ms`);
      } catch {
        line(`Request timeout for icmp_seq ${i}`);
      }
      await wait(320);
    }
    if (times.length) {
      const min = Math.min(...times);
      const max = Math.max(...times);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      line(`--- ${host} ping statistics ---`);
      line(`${times.length} packets transmitted, ${times.length} received, ${((4 - times.length) / 4 * 100).toFixed(0)}% packet loss`);
      line(`round-trip min/avg/max = ${min.toFixed(1)}/${avg.toFixed(1)}/${max.toFixed(1)} ms`);
    }
    line('→ lowest-latency route to me: rushabhyeole03@gmail.com', 'c-acc');
    btn.disabled = false;
  });
}

/* =================================================================== contact form */
// Posts to FormSubmit's AJAX endpoint, which emails the message to the address in
// data-endpoint. The very first submission triggers a one-time "Activate form" email.
function contactForm() {
  const form = $('.cform');
  if (!form) return;
  const status = $('.cform__status', form);
  const send = $('.cform__send', form);
  const say = (text, state) => { status.textContent = text; status.dataset.state = state || ''; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (data._honey) return; // a bot filled the hidden field
    const fields = { name: data.name.trim(), email: data.email.trim(), message: data.message.trim() };
    const bad = {
      name: !fields.name,
      email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.email),
      message: fields.message.length < 5,
    };
    Object.entries(bad).forEach(([k, v]) => form.elements[k].setAttribute('aria-invalid', String(v)));
    if (Object.values(bad).some(Boolean)) {
      say('✗ add your name, a valid email and a message', 'err');
      form.querySelector('[aria-invalid="true"]').focus();
      return;
    }

    send.disabled = true;
    say('→ SYN · sending…');
    try {
      const res = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...fields,
          _subject: `Portfolio: message from ${fields.name}`,
          _replyto: fields.email,
          _template: 'table',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && String(json.success) === 'true') {
        say('← ACK · delivered. I’ll get back to you soon.', 'ok');
        form.reset();
        Object.keys(bad).forEach((k) => form.elements[k].removeAttribute('aria-invalid'));
      } else if (/activat/i.test(json.message || '')) {
        say('Almost there: this form is waiting for activation. Please email me directly for now.', 'err');
      } else {
        throw new Error(json.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn('contact form', err);
      say('✗ didn’t go through. Email me directly: rushabhyeole03@gmail.com', 'err');
    } finally {
      send.disabled = false;
    }
  });
}

/* =================================================================== anchors */
function anchors(lenis) {
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#' || id === '#main') return;
      const target = id === '#top' ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else if (target === 0) scrollTo({ top: 0, behavior: 'smooth' });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

/* =================================================================== globe ↔ scroll */
function globeScroll(globe) {
  if (!globe) return;
  const s = globe.state;
  // hero → explode into a starfield that stays behind the page
  gsap.fromTo(s, { explode: 0, opacity: 1, scale: 1, spin: 0 }, {
    explode: 1, opacity: 0.6, scale: 1.12, spin: 1.4, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1.2 },
  });
  // slow drift through the middle of the page
  gsap.fromTo(s, { spin: 1.4 }, {
    spin: 5, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '.about', start: 'top top', endTrigger: '.contact', end: 'top bottom', scrub: 1.5 },
  });
  // contact → the network re-assembles
  gsap.fromTo(s, { explode: 1, opacity: 0.6, scale: 1.12, y: s.y }, {
    explode: 0, opacity: 1, scale: 0.9, y: isMobile() ? 1.6 : 0.55, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: '.contact', start: 'top 85%', end: 'top 5%', scrub: 1.2 },
  });
}
