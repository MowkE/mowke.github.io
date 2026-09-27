// cytometer.js
// An analysis window in the style of flow software. Events stream in from
// the culture model; a gating hierarchy narrows them the way a real
// cell-cycle panel does:
//   All events → Cells (FSC-A × SSC-A, drops debris)
//              → Singlets (FSC-A × FSC-H, drops doublets, which fake 4N)
//              → Live (viability dye negative; dead cells sit sub-G1)
//              → DAPI histogram, auto-fit G0/G1 and G2/M peaks
//              → Ki-67 × DAPI splits G0 from G1
//              → EdU × DAPI marks S (the horseshoe)
//              → pH3 × DAPI marks M, separating it from G2
// The stats table puts the gated measurement beside the model's truth.

import { acquire, TREATMENTS } from './cycle.js';

const CAP = 14000, LIN = 262144;
const lg = v => Math.log10(Math.max(v, 10));
const JET = t => {                        // blue → cyan → green → yellow → red, like the software
  const s = [[0, 30, 160], [0, 170, 255], [60, 210, 90], [255, 225, 40], [230, 40, 30]];
  const x = Math.min(0.9999, Math.max(0, t)) * (s.length - 1), i = x | 0, f = x - i;
  return s[i].map((a, k) => Math.round(a + (s[i + 1][k] - a) * f));
};

export function initCytometer(root, culture, hooks = {}) {
  const events = [];
  const plots = {};
  root.querySelectorAll('canvas[data-plot]').forEach(cv => { plots[cv.dataset.plot] = cv; });
  const $ = s => root.querySelector(s);
  let paused = false, rate = 0, acquired = 0, highlight = null;

  // ── gates ────────────────────────────────────────────────────────
  const G = {
    cells: e => !e.debris && e.fscA > 42000 && e.ssc > 20000,
    singlet: e => { const r = e.fscH / e.fscA; return r > 0.82 && r < 1.02; },
    live: e => lg(e.via) < 3.2,
  };
  let fit = { g1: 50000, g2: 99000, cv: 0.034 };
  const regions = () => ({ g1Hi: fit.g1 * (1 + 2.4 * fit.cv), g2Lo: fit.g2 * (1 - 2.4 * fit.cv), subG1: fit.g1 * (1 - 3.2 * fit.cv) });
  const KI_NEG = 2.75, EDU_POS = 3.05, PH3_POS = 3.45;
  function classify(e) {
    const r = regions();
    if (e.dapi < r.subG1) return 'subG1';
    if (lg(e.ph3) > PH3_POS && e.dapi > r.g2Lo * 0.93) return 'M';
    if (lg(e.edu) > EDU_POS) return 'S';
    if (e.dapi <= r.g1Hi) return lg(e.ki67) < KI_NEG ? 'G0' : 'G1';
    if (e.dapi >= r.g2Lo) return 'G2';
    return 'S';
  }

  // ── peak fitting on the live-singlet DAPI histogram ─────────────
  function fitPeaks(dapi) {
    const bins = 256, h = new Float32Array(bins), w = LIN / 2 / bins;   // 0..131k
    for (const v of dapi) { const b = (v / w) | 0; if (b >= 0 && b < bins) h[b]++; }
    const sm = h.map((_, i) => (h[i - 2] || 0) * 0.1 + (h[i - 1] || 0) * 0.2 + h[i] * 0.4 + (h[i + 1] || 0) * 0.2 + (h[i + 2] || 0) * 0.1);
    const peakIn = (a, b) => { let m = a; for (let i = a; i < b; i++) if (sm[i] > sm[m]) m = i; return m; };
    const p1 = peakIn((30000 / w) | 0, (70000 / w) | 0);
    const p2 = peakIn(Math.round(p1 * 1.85), Math.min(bins - 1, Math.round(p1 * 2.15)));
    // FWHM of the G1 peak → CV
    const half = sm[p1] / 2; let l = p1, r = p1;
    while (l > 0 && sm[l] > half) l--; while (r < bins - 1 && sm[r] > half) r++;
    const g1 = (p1 + 0.5) * w, cv = Math.max(0.015, ((r - l) * w) / 2.355 / g1);
    return { g1, g2: sm[p2] > sm[p1] * 0.02 ? (p2 + 0.5) * w : g1 * 1.98, cv, hist: sm, w };
  }

  // ── drawing helpers ─────────────────────────────────────────────
  const PAD = { l: 38, r: 8, t: 18, b: 28 };
  function frame(cv, title, xl, yl) {
    const dpr = Math.min(devicePixelRatio, 2), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
    g.strokeStyle = '#333'; g.lineWidth = 1; g.strokeRect(PAD.l + 0.5, PAD.t + 0.5, pw, ph);
    g.fillStyle = '#222'; g.font = '10px Segoe UI, system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(xl, PAD.l + pw / 2, H - 4);
    g.save(); g.translate(10, PAD.t + ph / 2); g.rotate(-Math.PI / 2); g.fillText(yl, 0, 0); g.restore();
    // title tag, like a gate label box
    g.font = '600 10px Segoe UI, system-ui, sans-serif'; const tw = g.measureText(title).width + 8;
    g.fillStyle = '#fff'; g.fillRect(PAD.l + pw / 2 - tw / 2, 2, tw, 13); g.strokeStyle = '#c33'; g.strokeRect(PAD.l + pw / 2 - tw / 2 + 0.5, 2.5, tw, 12);
    g.fillStyle = '#222'; g.fillText(title, PAD.l + pw / 2, 12);
    return { g, W, H, pw, ph, x0: PAD.l, y0: PAD.t };
  }
  const linAx = (max) => ({ f: v => Math.min(1, Math.max(0, v / max)), ticks: [0, max * 0.25, max * 0.5, max * 0.75, max].map(v => [v, (v / 1000).toFixed(v >= 100000 ? 0 : 1)]) });
  const logAx = (lo = 1.5, hi = 5.2) => ({ f: v => Math.min(1, Math.max(0, (lg(v) - lo) / (hi - lo))), ticks: [2, 3, 4, 5].map(p => [10 ** p, `10${['²', '³', '⁴', '⁵'][p - 2]}`]) });
  function axes(F, ax, ay) {
    const { g, pw, ph, x0, y0 } = F;
    g.fillStyle = '#444'; g.font = '9px Segoe UI, system-ui, sans-serif';
    g.textAlign = 'center'; for (const [v, t] of ax.ticks) { const x = x0 + ax.f(v) * pw; g.fillRect(x, y0 + ph, 1, 3); g.fillText(t, x, y0 + ph + 12); }
    g.textAlign = 'right'; for (const [v, t] of ay.ticks) { const y = y0 + ph - ay.f(v) * ph; g.fillRect(x0 - 3, y, 3, 1); g.fillText(t, x0 - 5, y + 3); }
  }
  function density(F, evs, fx, fy, ax, ay) {
    const { g, pw, ph, x0, y0 } = F, N = 120, M = 90, grid = new Float32Array(N * M);
    let max = 1;
    for (const e of evs) {
      const i = Math.min(N - 1, (ax.f(fx(e)) * N) | 0), j = Math.min(M - 1, (ay.f(fy(e)) * M) | 0);
      const k = j * N + i; grid[k]++; if (grid[k] > max) max = grid[k];
    }
    const cw = pw / N, ch = ph / M;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const v = grid[j * N + i]; if (!v) continue;
      const [r, gg, b] = JET(Math.log(1 + v) / Math.log(1 + max));
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(x0 + i * cw, y0 + ph - (j + 1) * ch, cw + 0.6, ch + 0.6);
    }
  }
  function gateBox(F, ax, ay, x1, x2, y1, y2, label, pct, color = '#111') {
    const { g, pw, ph, x0, y0 } = F;
    const X1 = x0 + ax.f(x1) * pw, X2 = x0 + ax.f(x2) * pw, Y1 = y0 + ph - ay.f(y1) * ph, Y2 = y0 + ph - ay.f(y2) * ph;
    g.strokeStyle = color; g.lineWidth = 1.2; g.strokeRect(X1, Y2, X2 - X1, Y1 - Y2);
    g.fillStyle = '#b0171f'; g.font = '600 10px Segoe UI, system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText(`${label} ${pct}`, Math.min(X1 + 3, x0 + pw - 70), Math.max(y0 + 11, Y2 - 3 < y0 + 11 ? Y2 + 11 : Y2 - 3));
  }
  function mark(F, ax, ay, e, fx, fy) {
    if (!e) return;
    const { g, pw, ph, x0, y0 } = F, x = x0 + ax.f(fx(e)) * pw, y = y0 + ph - ay.f(fy(e)) * ph;
    g.strokeStyle = '#ff1f8e'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x - 8, y); g.moveTo(x + 8, y); g.lineTo(x + 12, y); g.moveTo(x, y - 12); g.lineTo(x, y - 8); g.moveTo(x, y + 8); g.lineTo(x, y + 12); g.stroke();
  }
  const pc = (a, b) => b ? `${(a / b * 100).toFixed(1)}%` : '0%';

  // ── render everything ───────────────────────────────────────────
  function render() {
    const all = events;
    const cells = all.filter(G.cells), singles = cells.filter(G.singlet), live = singles.filter(G.live);
    fit = fitPeaks(live.map(e => e.dapi));
    const cls = { G0: [], G1: [], S: [], G2: [], M: [], subG1: [] };
    for (const e of live) cls[classify(e)].push(e);
    const r = regions();

    // 1 · FSC-A × SSC-A
    { const F = frame(plots.scatter, 'All events', 'FSC-A (×1000)', 'SSC-A (×1000)'), ax = linAx(LIN), ay = linAx(LIN);
      density(F, all, e => e.fscA, e => e.ssc, ax, ay); axes(F, ax, ay);
      gateBox(F, ax, ay, 42000, LIN - 2000, 20000, LIN - 2000, 'Cells', pc(cells.length, all.length)); }
    // 2 · FSC-A × FSC-H
    { const F = frame(plots.singlet, 'Cells', 'FSC-A (×1000)', 'FSC-H (×1000)'), ax = linAx(LIN), ay = linAx(LIN);
      density(F, cells, e => e.fscA, e => e.fscH, ax, ay); axes(F, ax, ay);
      const { g, pw, ph, x0, y0 } = F, P = (x, y) => [x0 + ax.f(x) * pw, y0 + ph - ay.f(y) * ph];
      g.strokeStyle = '#111'; g.lineWidth = 1.2; g.beginPath();
      [[42000, 42000 * 0.82], [LIN, LIN * 0.82], [LIN / 1.02, LIN], [42000, 42000 * 1.02]].forEach(([x, y], i) => { const [X, Y] = P(x, Math.min(y, LIN)); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.closePath(); g.stroke();
      g.fillStyle = '#b0171f'; g.font = '600 10px Segoe UI, system-ui, sans-serif'; g.textAlign = 'left';
      g.fillText(`Singlets ${pc(singles.length, cells.length)}`, x0 + 6, y0 + 12);
      g.fillStyle = '#555'; g.fillText(`doublets ${pc(cells.length - singles.length, cells.length)}`, x0 + pw * 0.55, y0 + ph - 8); }
    // 3 · DAPI histogram
    { const F = frame(plots.hist, 'Live singlets', 'DAPI-A (×1000)', 'Count'), { g, pw, ph, x0, y0 } = F;
      const hist = fit.hist, n = hist.length, max = Math.max(...hist) * 1.08, ax = linAx(LIN / 2);
      g.beginPath(); g.moveTo(x0, y0 + ph);
      for (let i = 0; i < n; i++) g.lineTo(x0 + (i + 0.5) / n * pw, y0 + ph - hist[i] / max * ph);
      g.lineTo(x0 + pw, y0 + ph); g.closePath(); g.fillStyle = '#c7c9cc'; g.fill(); g.strokeStyle = '#333'; g.lineWidth = 1; g.stroke();
      axes(F, ax, { f: v => v / max, ticks: [] });
      const bar = (a, b, lvl, label, pct, col) => {
        const X1 = x0 + ax.f(a) * pw, X2 = x0 + ax.f(b) * pw, Y = y0 + ph * lvl;
        g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X1, Y - 5); g.lineTo(X1, Y + 5); g.moveTo(X1, Y); g.lineTo(X2, Y); g.moveTo(X2, Y - 5); g.lineTo(X2, Y + 5); g.stroke();
        g.fillStyle = col; g.font = '600 10px Segoe UI, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(`${label} ${pct}`, (X1 + X2) / 2, Y - 6);
      };
      const g01 = cls.G0.length + cls.G1.length, g2m = cls.G2.length + cls.M.length;
      bar(r.subG1, r.g1Hi, 0.16, 'G0/G1', pc(g01, live.length), '#b0171f');
      bar(r.g1Hi, r.g2Lo, 0.46, 'S', pc(cls.S.length, live.length), '#b0171f');
      bar(r.g2Lo, fit.g2 * (1 + 3 * fit.cv), 0.3, 'G2/M', pc(g2m, live.length), '#b0171f');
      if (cls.subG1.length / Math.max(1, live.length) > 0.01) bar(6000, r.subG1, 0.62, 'sub-G1', pc(cls.subG1.length, live.length), '#6a2c91');
      if (highlight) { const X = x0 + ax.f(highlight.dapi) * pw; g.strokeStyle = '#ff1f8e'; g.lineWidth = 2; g.beginPath(); g.moveTo(X, y0); g.lineTo(X, y0 + ph); g.stroke(); } }
    // 4 · EdU × DAPI
    { const F = frame(plots.edu, 'Live singlets', 'DAPI-A (×1000)', 'EdU AF647-A'), ax = linAx(LIN / 2), ay = logAx();
      density(F, live, e => e.dapi, e => e.edu, ax, ay); axes(F, ax, ay);
      gateBox(F, ax, ay, r.subG1, LIN / 2 - 1500, 10 ** EDU_POS, 10 ** 5.1, 'S (EdU+)', pc(cls.S.length, live.length));
      mark(F, ax, ay, highlight, e => e.dapi, e => e.edu); }
    // 5 · Ki-67 × DAPI
    { const F = frame(plots.ki, 'Live singlets', 'DAPI-A (×1000)', 'Ki-67 BV421-A'), ax = linAx(LIN / 2), ay = logAx();
      density(F, live, e => e.dapi, e => e.ki67, ax, ay); axes(F, ax, ay);
      gateBox(F, ax, ay, r.subG1, r.g1Hi, 45, 10 ** KI_NEG, 'G0', pc(cls.G0.length, live.length));
      gateBox(F, ax, ay, r.subG1, r.g1Hi, 10 ** KI_NEG, 10 ** 5.1, 'G1', pc(cls.G1.length, live.length));
      mark(F, ax, ay, highlight, e => e.dapi, e => e.ki67); }
    // 6 · pH3 × DAPI
    { const F = frame(plots.ph3, 'G2/M', 'DAPI-A (×1000)', 'pH3 (S10) PE-A'), ax = linAx(LIN / 2), ay = logAx();
      density(F, live, e => e.dapi, e => e.ph3, ax, ay); axes(F, ax, ay);
      gateBox(F, ax, ay, r.g2Lo * 0.93, LIN / 2 - 1500, 10 ** PH3_POS, 10 ** 5.1, 'M (pH3+)', pc(cls.M.length, live.length));
      gateBox(F, ax, ay, r.g2Lo * 0.93, LIN / 2 - 1500, 45, 10 ** PH3_POS, 'G2', pc(cls.G2.length, live.length), '#555');
      mark(F, ax, ay, highlight, e => e.dapi, e => e.ph3); }

    // ── table, navigator counts, receipts ─────────────────────────
    // ground truth for exactly these events: what each gated event really was
    const truth = { G0: 0, G1: 0, S: 0, G2: 0, M: 0 }; let tn = 0;
    for (const e of live) if (truth[e.truth] !== undefined) { truth[e.truth]++; tn++; }
    for (const p in truth) truth[p] = truth[p] / Math.max(1, tn) * 100;
    const L = live.length - cls.subG1.length || 1;
    const rows = [
      ['All events', all.length, '', ''], ['Cells', cells.length, pc(cells.length, all.length), ''], ['Singlets', singles.length, pc(singles.length, cells.length), ''], ['Live', live.length, pc(live.length, singles.length), ''],
      ...['G0', 'G1', 'S', 'G2', 'M'].map(p => [p, cls[p].length, pc(cls[p].length, L), `${truth[p].toFixed(1)}%`]),
    ];
    $('#cy-table tbody').innerHTML = rows.map(([n, c, p, t], i) => `<tr class="${i > 3 ? 'ph' : ''}"><td>${i > 3 ? `<i class="swc sw-${n}"></i>` : ''}${n}</td><td>${c.toLocaleString()}</td><td>${p}</td><td>${t}</td></tr>`).join('');
    root.querySelectorAll('[data-count]').forEach(el => {
      const k = el.dataset.count;
      el.textContent = ({ all: all.length, cells: cells.length, singlets: singles.length, live: live.length })[k] ?? cls[k]?.length ?? '';
    });
    $('#cy-g1').textContent = (fit.g1 / 1000).toFixed(1) + 'k';
    $('#cy-g2').textContent = (fit.g2 / 1000).toFixed(1) + 'k';
    $('#cy-ratio').textContent = (fit.g2 / fit.g1).toFixed(3);
    $('#cy-cv').textContent = (fit.cv * 100).toFixed(2) + '%';
    $('#cy-rate').textContent = `${Math.round(rate).toLocaleString()} evt/s`;
    $('#cy-total').textContent = acquired.toLocaleString();
    hooks.onStats && hooks.onStats({ cls, live, truth });
  }

  // ── ribbon controls ─────────────────────────────────────────────
  root.querySelectorAll('[data-tx]').forEach(b => b.addEventListener('click', () => {
    root.querySelectorAll('[data-tx]').forEach(x => x.classList.toggle('on', x === b));
    culture.setTreatment(b.dataset.tx); hooks.onTreatment && hooks.onTreatment(b.dataset.tx);
    $('#cy-note').textContent = TREATMENTS[b.dataset.tx].note;
  }));
  $('#cy-pause').addEventListener('click', e => { paused = !paused; e.currentTarget.classList.toggle('on', paused); e.currentTarget.lastChild.textContent = paused ? 'Resume' : 'Pause'; });
  $('#cy-clear').addEventListener('click', () => { events.length = 0; });

  let acc = 0, last = performance.now(), active = true;
  function tick(now) {
    if (!active) return;
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (!paused) {
      const k = Math.round(900 * dt * (0.8 + Math.random() * 0.4));
      events.push(...acquire(culture, k)); acquired += k; rate += (k / Math.max(dt, 1e-3) - rate) * 0.1;
      if (events.length > CAP) events.splice(0, events.length - CAP);
    } else rate *= 0.9;
    acc += dt; if (acc > 0.25) { acc = 0; render(); }
    requestAnimationFrame(tick);
  }
  events.push(...acquire(culture, 9000)); acquired = 9000;
  requestAnimationFrame(tick);
  return {
    highlight(e) { highlight = e; render(); },
    setActive(on) { if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(tick); } else if (!on) active = false; },
  };
}
