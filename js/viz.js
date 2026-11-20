// Small, self-contained animations for the project panels, the Maglev demo and the day-job
// cards. Each one only runs while it is on screen.

import { $, $$, fitCanvas, whileVisible } from './utils.js';

const C = {
  ink: '#eceae4', ink2: '#a9aaa6', ink3: '#6b6d6c', line: 'rgba(236,234,228,0.1)', line2: 'rgba(236,234,228,0.18)',
  accent: '#c6ff3d', alert: '#ff5533',
};
const rand = (a, b) => a + Math.random() * (b - a);
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[(Math.random() * 16) | 0]).join('');
const mono = (px, dpr) => `${px * dpr}px JetBrains Mono, monospace`;

/* ================================================= LAB-01 · Maglev load balancer (interactive) */
function maglev(root) {
  const canvas = $('canvas', root);
  const ctx = canvas.getContext('2d');
  const buttons = $$('[data-be]', root);
  const statEl = $('[data-mg-stat]', root);
  const M = 53; // prime table size (production Maglev uses 65537)
  const colors = ['#c6ff3d', '#8fb8ff', '#ffb86b', '#ff7ac6', '#7af0d1'];
  const backends = colors.map((col, i) => ({ name: `be-${i + 1}`, col, up: true, hits: 0, rate: 0 }));

  const fnv = (s, seed) => {
    let x = (2166136261 ^ seed) >>> 0;
    for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
    return x;
  };
  // Maglev table population (Eisenbud et al., NSDI '16): every backend walks its own
  // permutation of the table and claims the next free slot, round-robin, until full.
  const populate = () => {
    const table = new Array(M).fill(-1);
    const alive = backends.map((b, i) => ({ b, i })).filter((o) => o.b.up);
    if (!alive.length) return table;
    const perm = alive.map(({ b, i }) => ({ i, off: fnv(b.name, 7) % M, skip: (fnv(b.name, 13) % (M - 1)) + 1, next: 0 }));
    let filled = 0;
    for (;;) {
      for (const p of perm) {
        let c = (p.off + p.next * p.skip) % M;
        while (table[c] >= 0) { p.next++; c = (p.off + p.next * p.skip) % M; }
        table[c] = p.i;
        p.next++;
        if (++filled === M) return table;
      }
    }
  };

  let table = populate();
  const flash = new Array(M).fill(0);
  let note = 'click a backend below to fail it';
  const apply = (beforeUp) => {
    const next = populate();
    let moved = 0;
    next.forEach((v, k) => { if (v !== table[k]) { moved++; flash[k] = 1.6; } });
    table = next;
    const up = backends.filter((b) => b.up).length;
    const ideal = Math.round((1 / Math.max(up, beforeUp)) * 100);
    note = `${moved}/${M} slots remapped (${Math.round((moved / M) * 100)}%) · ideal ≈ ${ideal}%`;
    statEl.textContent = `${note} · ${up} up`;
    buttons.forEach((btn, i) => btn.setAttribute('aria-pressed', String(!backends[i].up)));
  };
  const toggle = (i) => {
    const up = backends.filter((b) => b.up).length;
    if (backends[i].up && up <= 1) return;
    backends[i].up = !backends[i].up;
    apply(up);
  };
  let auto = true;
  let autoT = 3.5;
  buttons.forEach((btn, i) => btn.addEventListener('click', () => { auto = false; toggle(i); }));

  const packets = [];
  let spawn = 0;
  let rateT = 0;
  const TA = 0.45;
  const TB = 0.4;
  const TC = 0.5;

  return whileVisible(root, (dt, t) => {
    const { w, h, dpr } = fitCanvas(canvas);
    const pad = 18 * dpr;
    const xHook = w * 0.22;
    const cx = w * 0.49;
    const cy = h * 0.56;
    const R = Math.min(w * 0.14, h * 0.29);
    const bx = w * 0.75;
    const bw = w * 0.22;
    const top = h * 0.17;
    const span = h * 0.78;
    const bh = Math.min(48 * dpr, span / 5 - 8 * dpr);
    const by = (i) => top + i * (span / 5);

    if (auto) {
      autoT -= dt;
      if (autoT <= 0) {
        autoT = 3.4;
        const down = backends.findIndex((b) => !b.up);
        toggle(down >= 0 ? down : (Math.random() * backends.length) | 0);
      }
    }

    spawn -= dt;
    while (spawn <= 0) {
      spawn += 1 / 26;
      packets.push({ flow: (Math.random() * 2 ** 32) >>> 0, y: rand(h * 0.2, h * 0.92), age: 0, be: -1 });
    }
    rateT += dt;
    if (rateT >= 0.5) { backends.forEach((b) => { b.rate = b.rate * 0.4 + b.hits * 2 * 0.6; b.hits = 0; }); rateT = 0; }

    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';

    // column headers (trimmed on narrow screens so they don't collide)
    const narrow = w / dpr < 560;
    ctx.font = mono(9.5, dpr);
    ctx.fillStyle = C.ink3;
    if (!narrow) ctx.fillText('CLIENT FLOWS', pad, 26 * dpr);
    ctx.textAlign = 'center';
    ctx.fillText(narrow ? 'XDP' : 'XDP HOOK', xHook, 26 * dpr);
    ctx.fillText(narrow ? `M=${M}` : `MAGLEV TABLE · M=${M}`, cx, 26 * dpr);
    ctx.textAlign = 'left';
    ctx.fillText('BACKENDS', bx, 26 * dpr);

    // XDP hook in the NIC driver
    ctx.save();
    ctx.shadowColor = 'rgba(198,255,61,0.8)';
    ctx.shadowBlur = 14 * dpr;
    ctx.fillStyle = C.accent;
    ctx.fillRect(xHook - 1 * dpr, h * 0.15, 2 * dpr, h * 0.8);
    ctx.restore();
    if (!narrow) {
      ctx.save();
      ctx.translate(xHook - 10 * dpr, h * 0.55);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.ink3;
      ctx.font = mono(9, dpr);
      ctx.fillText('eBPF · before sk_buff', 0, 0);
      ctx.restore();
    }

    // the lookup table as a ring of M slots
    const seg = (Math.PI * 2) / M;
    ctx.lineWidth = 11 * dpr;
    for (let k = 0; k < M; k++) {
      flash[k] = Math.max(0, flash[k] - dt * 2.2);
      const be = table[k];
      const a0 = -Math.PI / 2 + k * seg;
      ctx.strokeStyle = be >= 0 ? backends[be].col : C.ink3;
      ctx.globalAlpha = 0.28 + Math.min(1, flash[k]) * 0.72;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0 + seg * 0.08, a0 + seg * 0.92);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1 * dpr;
    ctx.textAlign = 'center';
    ctx.font = mono(9.5, dpr);
    ctx.fillStyle = C.ink2;
    ctx.fillText('hash(5-tuple)', cx, cy - 8 * dpr);
    ctx.fillStyle = C.ink3;
    ctx.fillText(`mod ${M}`, cx, cy + 8 * dpr);
    ctx.textAlign = 'left';

    // backends
    const maxRate = Math.max(1, ...backends.map((b) => b.rate));
    backends.forEach((b, i) => {
      const y = by(i);
      ctx.fillStyle = b.up ? 'rgba(236,234,228,0.03)' : 'rgba(255,85,51,0.06)';
      ctx.strokeStyle = b.up ? b.col : 'rgba(255,85,51,0.6)';
      ctx.globalAlpha = b.up ? 0.9 : 1;
      if (!b.up) ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, 8 * dpr); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.font = mono(10.5, dpr);
      ctx.fillStyle = b.up ? C.ink : C.alert;
      ctx.fillText(b.name, bx + 12 * dpr, y + bh * 0.36);
      if (!narrow || !b.up) {
        ctx.textAlign = 'right';
        ctx.font = mono(9.5, dpr);
        ctx.fillStyle = b.up ? C.ink2 : C.alert;
        ctx.fillText(b.up ? `${Math.round(b.rate)} flows/s` : 'DOWN', bx + bw - 10 * dpr, y + bh * (narrow ? 0.7 : 0.36));
        ctx.textAlign = 'left';
      }
      ctx.fillStyle = C.line;
      ctx.fillRect(bx + 12 * dpr, y + bh * 0.7, bw - 24 * dpr, 3 * dpr);
      if (b.up) {
        ctx.fillStyle = b.col;
        ctx.fillRect(bx + 12 * dpr, y + bh * 0.7, (bw - 24 * dpr) * (b.rate / maxRate), 3 * dpr);
      }
    });

    // packets: client → XDP hook → table slot → backend
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      p.age += dt;
      const slot = p.flow % M;
      const sa = -Math.PI / 2 + (slot + 0.5) * seg;
      const sx = cx + Math.cos(sa) * R;
      const sy = cy + Math.sin(sa) * R;
      let x;
      let y;
      if (p.age < TA) {
        const k = p.age / TA;
        x = pad + (xHook - pad) * k; y = p.y;
      } else if (p.age < TA + TB) {
        const k = (p.age - TA) / TB;
        const e = k * k * (3 - 2 * k);
        x = xHook + (sx - xHook) * e; y = p.y + (sy - p.y) * e;
      } else if (p.age < TA + TB + TC) {
        if (p.be < 0) { p.be = table[slot]; flash[slot] = Math.max(flash[slot], 0.7); }
        const k = (p.age - TA - TB) / TC;
        const e = k * k * (3 - 2 * k);
        const tx = bx;
        const ty = by(p.be) + bh / 2;
        x = sx + (tx - sx) * e; y = sy + (ty - sy) * e;
      } else {
        if (p.be >= 0) backends[p.be].hits++;
        packets.splice(i, 1);
        continue;
      }
      ctx.fillStyle = p.be >= 0 ? backends[p.be].col : C.ink2;
      ctx.beginPath(); ctx.arc(x, y, 2.4 * dpr, 0, Math.PI * 2); ctx.fill();
    }

    ctx.font = mono(9.5, dpr);
    ctx.fillStyle = C.accent;
    ctx.textAlign = 'center';
    ctx.fillText(note.toUpperCase(), cx, h - 14 * dpr);
    ctx.textAlign = 'left';
    void t;
  });
}

/* ================================================= 01 · FinOps live cost line */
function finops(root) {
  const canvas = $('canvas', root);
  const ctx = canvas.getContext('2d');
  const val = $('.finops-live__val', root);
  const N = 64;
  const data = Array.from({ length: N }, (_, i) => 0.42 + Math.sin(i * 0.35) * 0.06 + rand(-0.04, 0.04));
  let acc = 0;
  let spike = 0;
  let nextSpike = 3.5;
  let shift = 0;

  return whileVisible(root, (dt) => {
    const { w, h, dpr } = fitCanvas(canvas);
    acc += dt;
    nextSpike -= dt;
    shift = Math.min(1, shift + dt / 0.14);
    if (acc > 0.14) {
      acc = 0;
      shift = 0;
      let v = data[N - 1] + rand(-0.05, 0.05) + (0.42 - data[N - 1]) * 0.12;
      if (nextSpike <= 0 && spike === 0) { spike = 7; nextSpike = rand(5, 7); }
      if (spike > 0) { v = 0.42 + Math.sin(((7 - spike) / 6) * Math.PI) * 0.5; spike--; }
      data.shift();
      data.push(Math.max(0.08, Math.min(0.98, v)));
      root.classList.toggle('is-alert', data.slice(-10).some((d) => d > 0.72));
      val.textContent = `$${(0.0045 + data[N - 1] * 0.003).toFixed(4)}/req`;
    }
    ctx.clearRect(0, 0, w, h);
    const step = w / (N - 2);
    const off = -shift * step;
    const y = (d) => h - 6 * dpr - d * (h - 12 * dpr);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(0, (h / 4) * g); ctx.lineTo(w, (h / 4) * g); ctx.stroke(); }
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(198,255,61,0.35)');
    grad.addColorStop(1, 'rgba(198,255,61,0)');
    ctx.beginPath();
    ctx.moveTo(off, h);
    data.forEach((d, i) => ctx.lineTo(off + i * step, y(d)));
    ctx.lineTo(off + (N - 1) * step, h);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2 * dpr;
    ctx.lineJoin = 'round';
    for (let i = 1; i < N; i++) {
      ctx.beginPath();
      ctx.strokeStyle = data[i] > 0.72 || data[i - 1] > 0.72 ? C.alert : C.accent;
      ctx.moveTo(off + (i - 1) * step, y(data[i - 1]));
      ctx.lineTo(off + i * step, y(data[i]));
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(off + (N - 1) * step, y(data[N - 1]), 3 * dpr, 0, Math.PI * 2); ctx.fill();
  });
}

/* ================================================= 02 · TESSERA streams → gate → log */
function tessera(canvas) {
  const ctx = canvas.getContext('2d');
  const lanes = [
    { name: 'M1 · log templates', col: '#eceae4' },
    { name: 'M2 · suricata netflow', col: '#c6ff3d' },
    { name: 'M3 · host identity', col: '#8fb8ff' },
    { name: 'M4 · dest. graph', col: '#ffb86b' },
  ];
  const parts = [];
  const ledger = [];
  let spawn = 0;
  let seq = 1040;
  let root = hex(8);
  let gatePulse = 0;
  const hosts = ['vpn', 'intranet', 'inet-fw', 'mail', 'web-01', 'db-02'];
  for (let k = 0; k < 6; k++) ledger.push({ seq: seq - k, host: hosts[k % hosts.length], bad: k === 2, age: 1 });

  return whileVisible(canvas, (dt, t) => {
    const { w, h, dpr } = fitCanvas(canvas);
    const gx = w * 0.56;
    const gy = h * 0.5;
    const laneY = (i) => h * (0.2 + i * 0.2);
    spawn -= dt;
    if (spawn <= 0) {
      spawn = 0.05;
      parts.push({ li: (Math.random() * 4) | 0, p: 0, speed: rand(0.22, 0.34), bad: Math.random() < 0.06 });
    }
    ctx.clearRect(0, 0, w, h);
    ctx.font = mono(10, dpr);
    ctx.textBaseline = 'middle';

    lanes.forEach((l, i) => {
      const ly = laneY(i);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(14 * dpr, ly);
      ctx.lineTo(gx * 0.45, ly);
      ctx.bezierCurveTo(gx * 0.75, ly, gx * 0.8, gy, gx, gy);
      ctx.stroke();
      ctx.fillStyle = C.ink3;
      ctx.fillText(l.name.toUpperCase(), 14 * dpr, ly - 12 * dpr);
    });

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.p += p.speed * dt;
      const ly = laneY(p.li);
      let x;
      let y;
      if (p.p < 0.5) {
        const k = p.p / 0.5;
        x = 14 * dpr + k * (gx * 0.45 - 14 * dpr);
        y = ly;
      } else {
        const k = Math.min(1, (p.p - 0.5) / 0.5);
        const u = 1 - k;
        x = u * u * u * gx * 0.45 + 3 * u * u * k * gx * 0.75 + 3 * u * k * k * gx * 0.8 + k * k * k * gx;
        y = u * u * u * ly + 3 * u * u * k * ly + 3 * u * k * k * gy + k * k * k * gy;
      }
      ctx.fillStyle = p.bad ? C.alert : lanes[p.li].col;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(x, y, (p.bad ? 3 : 2) * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (p.p >= 1) {
        parts.splice(i, 1);
        gatePulse = 1;
        if (p.bad || Math.random() < 0.035) {
          seq++;
          root = hex(8);
          ledger.unshift({ seq, host: hosts[(Math.random() * hosts.length) | 0], bad: p.bad, age: 0 });
          if (ledger.length > 9) ledger.pop();
        }
      }
    }

    gatePulse = Math.max(0, gatePulse - dt * 3);
    ctx.save();
    ctx.translate(gx, gy);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 1.5 * dpr;
    ctx.globalAlpha = 0.5 + gatePulse * 0.5;
    ctx.beginPath(); ctx.arc(0, 0, (22 + gatePulse * 6) * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.accent;
    ctx.beginPath(); ctx.arc(0, 0, 6 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(t * 0.8);
    ctx.setLineDash([3 * dpr, 5 * dpr]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(0, 0, 34 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = C.ink2;
    ctx.textAlign = 'center';
    ctx.fillText('MASKED GATE', gx, gy + 50 * dpr);
    ctx.textAlign = 'left';

    const lx = w * 0.66;
    const lw = w - lx - 16 * dpr;
    ctx.strokeStyle = C.line;
    ctx.strokeRect(lx, 18 * dpr, lw, h - 36 * dpr);
    ctx.fillStyle = C.ink3;
    ctx.fillText('TRANSPARENCY LOG', lx + 12 * dpr, 36 * dpr);
    ctx.fillStyle = C.accent;
    ctx.fillText(`root 0x${root}`, lx + 12 * dpr, 54 * dpr);
    ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(lx, 68 * dpr); ctx.lineTo(lx + lw, 68 * dpr); ctx.stroke();
    const rowH = Math.min(30 * dpr, (h - 110 * dpr) / 9);
    ledger.forEach((row, i) => {
      row.age += dt;
      const ry = 86 * dpr + i * rowH;
      if (ry > h - 30 * dpr) return;
      ctx.globalAlpha = Math.min(1, row.age * 4) * (1 - i * 0.08);
      ctx.fillStyle = row.bad ? C.alert : C.ink2;
      ctx.fillText(`#${row.seq}`, lx + 12 * dpr, ry);
      ctx.fillStyle = C.ink;
      ctx.fillText(row.host, lx + 64 * dpr, ry);
      ctx.fillStyle = row.bad ? C.alert : C.ink3;
      ctx.fillText(row.bad ? 'ANOMALY' : 'normal', lx + lw * 0.52, ry);
      ctx.globalAlpha = 1;
    });
    ctx.strokeStyle = 'rgba(198,255,61,0.35)';
    ctx.setLineDash([4 * dpr, 6 * dpr]);
    ctx.lineDashOffset = -t * 40 * dpr;
    ctx.beginPath(); ctx.moveTo(gx + 34 * dpr, gy); ctx.lineTo(lx, gy); ctx.stroke();
    ctx.setLineDash([]);
  });
}

/* ================================================= 04 · SpaceSaver scan counter */
function spacesaver(root) {
  const panel = root.closest('.panel__viz');
  const files = $('[data-scan-files]', panel);
  const gb = $('[data-scan-gb]', panel);
  let t0 = 0;
  return whileVisible(panel, (dt) => {
    t0 = (t0 + dt) % 3.6;
    const e = 1 - Math.pow(1 - Math.min(1, t0 / 3.3), 2.2);
    files.textContent = Math.round(e * 127920).toLocaleString('en-US');
    gb.textContent = (e * 8.38).toFixed(2);
  });
}

/* ================================================= 03 · AI trading desk: agents propose, risk engine decides */
function trading(canvas) {
  const ctx = canvas.getContext('2d');
  const N = 46;
  const candles = [];
  let price = 2450;
  const nextCandle = () => {
    const o = price;
    const drift = rand(-1, 1) * 9 + Math.sin(candles.length * 0.15) * 3;
    const c = Math.max(2200, Math.min(2700, o + drift));
    const hi = Math.max(o, c) + rand(1, 7);
    const lo = Math.min(o, c) - rand(1, 7);
    price = c;
    return { o, c, hi, lo, mark: null };
  };
  for (let i = 0; i < N; i++) candles.push(nextCandle());
  const ema = (arr, n) => { const k = 2 / (n + 1); let e = arr[0].c; return arr.map((d) => (e = d.c * k + e * (1 - k))); };

  const tickers = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'LT', 'ITC'];
  const stages = ['SCOUT · LLM', 'ANALYST · LLM', 'RISK ENGINE · CODE', 'PAPER BROKER'];
  const log = [
    { t: '10:15', s: 'INFY long · conf med', ok: true, why: '✓ 14 sh · 0.25% risk' },
    { t: '10:00', s: 'SBIN long · R:R 1.2', ok: false, why: '✗ needs ≥ 1.5' },
  ];
  let candleT = 0;
  let cycleT = 1.2;
  let stage = -1;
  let stageT = 0;
  let current = null;
  let clock = 10 * 60 + 15;
  let equity = 50000;
  let level = null; // { stop, target, life }

  return whileVisible(canvas, (dt) => {
    const { w, h, dpr } = fitCanvas(canvas);
    candleT += dt;
    if (candleT > 0.55) {
      candleT = 0;
      candles.shift();
      candles.push(nextCandle());
      equity += rand(-18, 22);
    }
    // decision pipeline, one idea at a time
    cycleT -= dt;
    if (cycleT <= 0 && stage < 0) {
      clock += 15;
      const pass = Math.random() < 0.62;
      const tk = tickers[(Math.random() * tickers.length) | 0];
      const rr = pass ? rand(1.6, 2.6) : rand(0.8, 1.4);
      current = { tk, pass, rr, conf: pass && Math.random() < 0.4 ? 'high' : 'med' };
      stage = 0;
      stageT = 0;
    }
    if (stage >= 0) {
      stageT += dt;
      if (stageT > 0.55) {
        stageT = 0;
        const refusedHere = stage === 2 && !current.pass;
        if (refusedHere || stage === 3) {
          const hh = String(Math.floor(clock / 60)).padStart(2, '0');
          const mm = String(clock % 60).padStart(2, '0');
          const sh = Math.max(1, Math.round(rand(6, 22)));
          log.unshift(current.pass
            ? { t: `${hh}:${mm}`, s: `${current.tk} long · conf ${current.conf}`, ok: true, why: `✓ ${sh} sh · ${current.conf === 'high' ? '0.5' : '0.25'}% risk` }
            : { t: `${hh}:${mm}`, s: `${current.tk} long · R:R ${current.rr.toFixed(1)}`, ok: false, why: '✗ needs ≥ 1.5' });
          if (log.length > 5) log.pop();
          const last = candles[N - 1];
          last.mark = current.pass ? 'buy' : 'no';
          if (current.pass) level = { stop: last.c * 0.988, target: last.c * 1.02, life: 4 };
          stage = -1;
          cycleT = rand(1.4, 2.4);
        } else stage++;
      }
    }
    if (level) { level.life -= dt; if (level.life <= 0) level = null; }

    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';

    // ---- chart (left) ----
    const cx0 = 16 * dpr;
    const cx1 = w * 0.6;
    const top = 50 * dpr;
    const bot = h - 40 * dpr;
    const lo = Math.min(...candles.map((d) => d.lo), level ? level.stop : Infinity) - 4;
    const hi = Math.max(...candles.map((d) => d.hi), level ? level.target : -Infinity) + 4;
    const Y = (p) => bot - ((p - lo) / (hi - lo)) * (bot - top);
    const cw = (cx1 - cx0) / N;
    ctx.font = mono(9.5, dpr);
    ctx.fillStyle = C.ink3;
    ctx.fillText('NSE · 5M BARS · SIMULATED', cx0, 22 * dpr);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1 * dpr;
    for (let g = 0; g <= 4; g++) { const y = top + ((bot - top) / 4) * g; ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx1, y); ctx.stroke(); }
    candles.forEach((d, i) => {
      const x = cx0 + i * cw + cw / 2;
      const up = d.c >= d.o;
      ctx.strokeStyle = up ? 'rgba(198,255,61,0.75)' : 'rgba(255,85,51,0.75)';
      ctx.beginPath(); ctx.moveTo(x, Y(d.hi)); ctx.lineTo(x, Y(d.lo)); ctx.stroke();
      ctx.fillStyle = up ? 'rgba(198,255,61,0.55)' : 'rgba(255,85,51,0.55)';
      const y0 = Y(Math.max(d.o, d.c));
      ctx.fillRect(x - cw * 0.32, y0, cw * 0.64, Math.max(1.5 * dpr, Y(Math.min(d.o, d.c)) - y0));
      if (d.mark === 'buy') {
        ctx.fillStyle = C.accent;
        ctx.beginPath(); ctx.moveTo(x, Y(d.lo) + 6 * dpr); ctx.lineTo(x - 5 * dpr, Y(d.lo) + 14 * dpr); ctx.lineTo(x + 5 * dpr, Y(d.lo) + 14 * dpr); ctx.fill();
      } else if (d.mark === 'no') {
        ctx.fillStyle = C.ink3;
        ctx.font = mono(10, dpr);
        ctx.textAlign = 'center';
        ctx.fillText('×', x, Y(d.lo) + 12 * dpr);
        ctx.textAlign = 'left';
      }
    });
    const e = ema(candles, 20);
    ctx.strokeStyle = 'rgba(143,184,255,0.8)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    e.forEach((v, i) => { const x = cx0 + i * cw + cw / 2; if (i) ctx.lineTo(x, Y(v)); else ctx.moveTo(x, Y(v)); });
    ctx.stroke();
    if (level) {
      ctx.globalAlpha = Math.min(1, level.life);
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.strokeStyle = C.accent;
      ctx.beginPath(); ctx.moveTo(cx1 - cw * 8, Y(level.target)); ctx.lineTo(cx1, Y(level.target)); ctx.stroke();
      ctx.strokeStyle = C.alert;
      ctx.beginPath(); ctx.moveTo(cx1 - cw * 8, Y(level.stop)); ctx.lineTo(cx1, Y(level.stop)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = mono(9, dpr);
      ctx.fillStyle = C.accent;
      ctx.fillText('TARGET', cx1 - cw * 8, Y(level.target) - 9 * dpr);
      ctx.fillStyle = C.alert;
      ctx.fillText('STOP', cx1 - cw * 8, Y(level.stop) + 10 * dpr);
      ctx.globalAlpha = 1;
    }
    ctx.font = mono(9.5, dpr);
    ctx.fillStyle = C.ink3;
    ctx.fillText('PAPER EQUITY', cx0, h - 16 * dpr);
    ctx.fillStyle = C.ink;
    ctx.fillText(`₹${Math.round(equity).toLocaleString('en-IN')}`, cx0 + 92 * dpr, h - 16 * dpr);

    // ---- pipeline (right) ----
    const narrow = w / dpr < 520; // phones: short labels so nothing overflows the column
    const px = w * 0.64;
    const pw = w - px - 16 * dpr;
    const sh = (narrow ? 24 : 30) * dpr;
    const gap = (narrow ? 9 : 12) * dpr;
    ctx.fillStyle = C.ink3;
    ctx.fillText(current ? (narrow ? current.tk : `IDEA · ${current.tk}`) : 'IDEA · —', px, 22 * dpr);
    (narrow ? ['SCOUT', 'ANALYST', 'RISK', 'BROKER'] : stages).forEach((name, i) => {
      const y = 40 * dpr + i * (sh + gap);
      const active = stage === i;
      const refused = active && i === 2 && current && !current.pass && stageT > 0.25;
      ctx.fillStyle = active ? (refused ? 'rgba(255,85,51,0.16)' : 'rgba(198,255,61,0.14)') : 'rgba(236,234,228,0.03)';
      ctx.strokeStyle = active ? (refused ? C.alert : C.accent) : C.line2;
      ctx.beginPath(); ctx.roundRect(px, y, pw, sh, 7 * dpr); ctx.fill(); ctx.stroke();
      ctx.fillStyle = active ? (refused ? C.alert : C.accent) : C.ink2;
      ctx.font = mono(9.5, dpr);
      ctx.fillText(name, px + 10 * dpr, y + sh / 2);
      if (i < stages.length - 1) {
        ctx.strokeStyle = C.line2;
        ctx.beginPath(); ctx.moveTo(px + pw / 2, y + sh); ctx.lineTo(px + pw / 2, y + sh + gap); ctx.stroke();
      }
    });
    const ly = 40 * dpr + 4 * (sh + gap) + 10 * dpr;
    ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(px, ly); ctx.lineTo(px + pw, ly); ctx.stroke();
    log.forEach((r, i) => {
      const y = ly + 18 * dpr + i * (narrow ? 20 : 34) * dpr;
      if (y > h - 20 * dpr) return;
      ctx.globalAlpha = 1 - i * 0.14;
      if (narrow) {
        ctx.font = mono(8.5, dpr);
        ctx.fillStyle = r.ok ? C.accent : C.alert;
        ctx.fillText(r.ok ? r.why.split(' · ')[0] : `✗ ${r.s.split(' · ')[0]}`, px, y);
      } else {
        ctx.font = mono(9.5, dpr);
        ctx.fillStyle = C.ink3;
        ctx.fillText(r.t, px, y);
        ctx.fillStyle = C.ink;
        ctx.fillText(r.s, px + 44 * dpr, y);
        ctx.fillStyle = r.ok ? C.accent : C.alert;
        ctx.fillText(r.why, px + 44 * dpr, y + 14 * dpr);
      }
      ctx.globalAlpha = 1;
    });
  });
}

/* ================================================= 05 · Flare request filter */
function flare(canvas) {
  const ctx = canvas.getContext('2d');
  const hosts = [
    ['cdn.jsdelivr.net', 0], ['doubleclick.net', 1], ['api.github.com', 0], ['adservice.google', 1],
    ['fonts.gstatic.com', 0], ['ads.yieldmo.com', 1], ['i.ytimg.com', 0], ['pagead2.g.net', 1],
    ['taboola.com', 1], ['youtube.com', 0], ['criteo.net', 1], ['unpkg.com', 0],
  ];
  const reqs = [];
  const sparks = [];
  let spawn = 0;
  let blocked = 1284;
  let passed = 3410;
  return whileVisible(canvas, (dt, t) => {
    const { w, h, dpr } = fitCanvas(canvas);
    const shieldX = w * 0.58;
    spawn -= dt;
    if (spawn <= 0) {
      spawn = rand(0.18, 0.36);
      const [name, ad] = hosts[(Math.random() * hosts.length) | 0];
      reqs.push({ name, ad, x: -160 * dpr, y: rand(0.14, 0.8) * h, v: rand(150, 230) * dpr });
    }
    ctx.clearRect(0, 0, w, h);
    ctx.font = mono(10.5, dpr);
    ctx.textBaseline = 'middle';

    const px = w * 0.72;
    const pw = w * 0.24;
    const ph = h * 0.66;
    const py = (h - ph) / 2 - 10 * dpr;
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(px, py, pw, ph);
    ctx.fillStyle = 'rgba(236,234,228,0.05)';
    for (let k = 0; k < 7; k++) ctx.fillRect(px + 12 * dpr, py + 18 * dpr + k * (ph / 8), (pw - 24 * dpr) * (k % 3 === 0 ? 0.9 : 0.6), 8 * dpr);
    ctx.fillStyle = C.ink3;
    ctx.fillText('RENDER', px, py - 12 * dpr);

    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const g = ctx.createLinearGradient(shieldX - 30 * dpr, 0, shieldX + 4 * dpr, 0);
    g.addColorStop(0, 'rgba(198,255,61,0)');
    g.addColorStop(1, `rgba(198,255,61,${0.12 + pulse * 0.08})`);
    ctx.fillStyle = g;
    ctx.fillRect(shieldX - 30 * dpr, 0, 34 * dpr, h);
    ctx.fillStyle = C.accent;
    ctx.fillRect(shieldX, 0, 2 * dpr, h);
    ctx.fillText('FILTER · webRequest', shieldX + 10 * dpr, 20 * dpr);

    for (let i = reqs.length - 1; i >= 0; i--) {
      const r = reqs[i];
      r.x += r.v * dt;
      const tw = ctx.measureText(r.name).width + 16 * dpr;
      if (r.ad && r.x + tw >= shieldX) {
        for (let s = 0; s < 14; s++) sparks.push({ x: shieldX, y: r.y + rand(-6, 6) * dpr, vx: rand(-260, -40) * dpr, vy: rand(-140, 140) * dpr, life: 1 });
        reqs.splice(i, 1);
        blocked++;
        continue;
      }
      if (!r.ad && r.x > px + 10 * dpr) { reqs.splice(i, 1); passed++; continue; }
      ctx.globalAlpha = !r.ad && r.x > shieldX ? Math.max(0, 1 - (r.x - shieldX) / (px - shieldX)) : 1;
      ctx.strokeStyle = r.ad ? 'rgba(255,85,51,0.7)' : 'rgba(236,234,228,0.35)';
      ctx.fillStyle = r.ad ? 'rgba(255,85,51,0.1)' : 'rgba(236,234,228,0.04)';
      const bh = 20 * dpr;
      ctx.beginPath(); ctx.roundRect(r.x, r.y - bh / 2, tw, bh, 10 * dpr); ctx.fill(); ctx.stroke();
      ctx.fillStyle = r.ad ? C.alert : C.ink2;
      ctx.fillText(r.name, r.x + 8 * dpr, r.y + 0.5 * dpr);
      ctx.globalAlpha = 1;
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt * 1.8;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 300 * dpr * dt;
      ctx.globalAlpha = s.life;
      ctx.fillStyle = C.alert;
      ctx.fillRect(s.x, s.y, 2.5 * dpr, 2.5 * dpr);
    }
    ctx.globalAlpha = 1;

    ctx.font = `700 ${20 * dpr}px Archivo, sans-serif`;
    ctx.fillStyle = C.alert;
    ctx.fillText(blocked.toLocaleString('en-US'), 16 * dpr, h - 40 * dpr);
    ctx.fillStyle = C.accent;
    ctx.fillText(passed.toLocaleString('en-US'), w * 0.3, h - 40 * dpr);
    ctx.font = mono(9.5, dpr);
    ctx.fillStyle = C.ink3;
    ctx.fillText('ADS BLOCKED', 16 * dpr, h - 18 * dpr);
    ctx.fillText('REQUESTS ALLOWED', w * 0.3, h - 18 * dpr);
  });
}

/* ================================================= Day job · x86 vs Graviton */
function graviton(canvas) {
  const ctx = canvas.getContext('2d');
  const chips = [
    { name: 'x86_64', rate: 1, cost: 0, rgb: '236,234,228', cores: Array.from({ length: 36 }, Math.random) },
    { name: 'ARM64 · GRAVITON', rate: 0.76, cost: 0, rgb: '198,255,61', cores: Array.from({ length: 36 }, Math.random) },
  ];
  const jobs = [];
  let spawn = 0;
  let clock = 0;

  return whileVisible(canvas, (dt) => {
    const { w, h, dpr } = fitCanvas(canvas);
    clock += dt;
    if (clock > 18) { clock = 0; chips.forEach((c) => { c.cost = 0; }); }
    spawn -= dt;
    if (spawn <= 0) { spawn = 0.3; jobs.push({ y: -10 * dpr, off: rand(-0.32, 0.32) }); }
    const s = Math.min(w * 0.27, h * 0.36);
    const cy = h * 0.46;
    for (let i = jobs.length - 1; i >= 0; i--) {
      jobs[i].y += dt * h * 0.28;
      if (jobs[i].y > h + 10 * dpr) jobs.splice(i, 1);
    }

    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    chips.forEach((c, i) => {
      const cx = w * (i ? 0.73 : 0.27);
      c.cost += dt * c.rate * 0.85;
      c.cores = c.cores.map((v) => (Math.random() < dt * 4 ? Math.random() : v));

      jobs.forEach((j) => {
        const x = cx + j.off * s;
        const before = j.y < cy - s / 2;
        const after = j.y > cy + s / 2;
        if (!before && !after) return;
        const sz = 6 * dpr;
        if (before) { ctx.strokeStyle = C.ink3; ctx.strokeRect(x - sz / 2, j.y - sz / 2, sz, sz); }
        else { ctx.fillStyle = `rgba(${c.rgb},0.85)`; ctx.fillRect(x - sz / 2, j.y - sz / 2, sz, sz); }
      });

      ctx.strokeStyle = C.line2;
      ctx.lineWidth = 1.5 * dpr;
      for (let k = 0; k < 8; k++) {
        const o = -s / 2 + (s / 9) * (k + 1);
        const L = 6 * dpr;
        ctx.beginPath();
        ctx.moveTo(cx + o, cy - s / 2); ctx.lineTo(cx + o, cy - s / 2 - L);
        ctx.moveTo(cx + o, cy + s / 2); ctx.lineTo(cx + o, cy + s / 2 + L);
        ctx.moveTo(cx - s / 2, cy + o); ctx.lineTo(cx - s / 2 - L, cy + o);
        ctx.moveTo(cx + s / 2, cy + o); ctx.lineTo(cx + s / 2 + L, cy + o);
        ctx.stroke();
      }
      ctx.fillStyle = '#0b0d10';
      ctx.strokeStyle = i ? 'rgba(198,255,61,0.55)' : C.line2;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.roundRect(cx - s / 2, cy - s / 2, s, s, 9 * dpr); ctx.fill(); ctx.stroke();
      const inner = s * 0.72;
      const g = inner / 6;
      c.cores.forEach((v, k) => {
        const x = cx - inner / 2 + (k % 6) * g;
        const y = cy - inner / 2 + Math.floor(k / 6) * g;
        ctx.fillStyle = `rgba(${c.rgb},${0.08 + v * 0.5})`;
        ctx.fillRect(x + g * 0.12, y + g * 0.12, g * 0.76, g * 0.76);
      });

      ctx.font = mono(9.5, dpr);
      ctx.fillStyle = i ? C.accent : C.ink2;
      ctx.fillText(i && w / dpr < 420 ? 'GRAVITON' : c.name, cx, cy - s / 2 - 22 * dpr);
      ctx.font = `800 ${20 * dpr}px Archivo, sans-serif`;
      ctx.fillStyle = i ? C.accent : C.ink;
      ctx.fillText(`$${c.cost.toFixed(2)}`, cx, cy + s / 2 + 34 * dpr);
      ctx.font = mono(9, dpr);
      ctx.fillStyle = C.ink3;
      ctx.fillText('SPEND', cx, cy + s / 2 + 54 * dpr);
    });

    ctx.font = `300 ${30 * dpr}px Archivo, sans-serif`;
    ctx.fillStyle = C.ink3;
    ctx.fillText('=', w / 2, cy - 4 * dpr);
    ctx.fillStyle = C.accent;
    ctx.font = mono(9.5, dpr);
    ctx.fillText(`SAME JOBS · SAVED $${(chips[0].cost - chips[1].cost).toFixed(2)}`, w / 2, h - 16 * dpr);
    ctx.textAlign = 'left';
  });
}

/* ================================================= Day job · Spark executors follow the work */
function spark(canvas) {
  const ctx = canvas.getContext('2d');
  const N = 100;
  const work = [];
  const exec = [];
  let level = 0.3;
  let target = 0.3;
  let e = 0.3;
  let idle = 0;
  const step = () => {
    if (Math.random() < 0.05) target = Math.random() < 0.4 ? rand(0.6, 0.95) : rand(0.05, 0.3);
    level += (target - level) * 0.18;
    const wv = Math.max(0.03, Math.min(0.98, level + rand(-0.03, 0.03)));
    const need = Math.min(1, Math.ceil(wv * 1.08 * 24) / 24);
    if (need > e) { e = Math.min(need, e + 4 / 24); idle = 0; }
    else if (need < e) { idle++; if (idle > 5) e = Math.max(need, e - 2 / 24); }
    work.push(wv);
    exec.push(e);
    if (work.length > N) { work.shift(); exec.shift(); }
  };
  for (let i = 0; i < N; i++) step();
  let acc = 0;

  return whileVisible(canvas, (dt) => {
    const { w, h, dpr } = fitCanvas(canvas);
    acc += dt;
    while (acc > 0.09) { acc -= 0.09; step(); }
    const x0 = 16 * dpr;
    const x1 = w - 16 * dpr;
    const top = h * 0.3;
    const bot = h * 0.88;
    const X = (i) => x0 + (i / (N - 1)) * (x1 - x0);
    const Y = (v) => bot - v * (bot - top);

    ctx.clearRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1 * dpr;
    for (let g = 0; g <= 4; g++) { ctx.beginPath(); ctx.moveTo(x0, Y(g / 4)); ctx.lineTo(x1, Y(g / 4)); ctx.stroke(); }

    const pts = [];
    for (let i = 0; i < N; i++) {
      if (i > 0) pts.push([X(i), Y(exec[i - 1])]);
      pts.push([X(i), Y(exec[i])]);
    }
    ctx.fillStyle = 'rgba(198,255,61,0.07)';
    ctx.beginPath();
    ctx.moveTo(X(0), Y(1));
    ctx.lineTo(X(N - 1), Y(1));
    for (let k = pts.length - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(236,234,228,0.09)';
    ctx.beginPath();
    ctx.moveTo(X(0), bot);
    work.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(X(N - 1), bot);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = C.ink2;
    ctx.setLineDash([5 * dpr, 6 * dpr]);
    ctx.beginPath(); ctx.moveTo(x0, Y(1)); ctx.lineTo(x1, Y(1)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(N - 1), Y(exec[N - 1]), 3.5 * dpr, 0, Math.PI * 2); ctx.fill();

    ctx.font = mono(9.5, dpr);
    ctx.fillStyle = C.ink3;
    ctx.fillText('EXECUTORS', x0, 22 * dpr);
    ctx.fillText('PENDING TASKS', x0 + 110 * dpr, 22 * dpr);
    ctx.font = `800 ${24 * dpr}px Archivo, sans-serif`;
    ctx.fillStyle = C.accent;
    ctx.fillText(String(Math.round(exec[N - 1] * 48)).padStart(2, '0'), x0, 48 * dpr);
    ctx.fillStyle = C.ink;
    ctx.fillText(String(Math.round(work[N - 1] * 2400)), x0 + 110 * dpr, 48 * dpr);
    ctx.textAlign = 'right';
    ctx.font = mono(9, dpr);
    ctx.fillStyle = C.ink2;
    ctx.fillText('STATIC · 48 ALL DAY', x1, Y(1) - 11 * dpr);
    ctx.fillStyle = C.accent;
    ctx.fillText('▨ RELEASED, NOT BILLED', x1, Y(1) + 13 * dpr);
    ctx.textAlign = 'left';
  });
}

/* ================================================= Day job · Slack → ETL → merge request */
function slackbot(root) {
  const gsap = window.gsap;
  const msgs = $$('.msg', root);
  const code = $('.bot__code code', root);
  const src = [
    '// from view: reports.daily_revenue',
    'spark.read.jdbc(rs, "daily_revenue", p)',
    '  .repartition(col("date"))',
    '  .write.jdbc(ch, "daily_revenue", p)',
    '',
    'CREATE TABLE daily_revenue (...)',
    'ENGINE = MergeTree ORDER BY date;',
  ].join('\n');
  const typed = { n: 0 };
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.6, paused: true, defaults: { ease: 'expo.out' } });
  tl.set(msgs, { autoAlpha: 0, y: 12 });
  tl.add(() => { code.textContent = ''; });
  tl.to(msgs[0], { autoAlpha: 1, y: 0, duration: 0.6 }, 0.3);
  tl.to(msgs[1], { autoAlpha: 1, y: 0, duration: 0.6 }, 1.4);
  tl.to(msgs[2], { autoAlpha: 1, y: 0, duration: 0.6 }, 2.7);
  tl.fromTo(typed, { n: 0 }, {
    n: src.length, duration: 3, ease: 'none',
    onUpdate: () => { code.textContent = src.slice(0, Math.round(typed.n)); },
  }, 2.9);
  tl.to(msgs[3], { autoAlpha: 1, y: 0, duration: 0.6 }, 6.2);
  new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause())).observe(root);
}

export function initViz() {
  const map = { maglev, finops, tessera, trading, spacesaver, flare, graviton, spark, slackbot };
  $$('[data-viz]').forEach((el) => {
    const fn = map[el.dataset.viz];
    if (!fn) return;
    try {
      const out = fn(el);
      if (out && out.catch) out.catch((err) => console.warn('viz failed', el.dataset.viz, err));
    } catch (err) {
      console.warn('viz failed', el.dataset.viz, err);
    }
  });
}
