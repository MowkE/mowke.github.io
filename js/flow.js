// flow.js
// A flow cytometry readout, drawn in the dish's own style. Events stream in
// from a 6,000-cell population model of the flask this dish came from
// (cycle.js). The gating is a real cell-cycle panel: scatter drops debris,
// FSC-A vs FSC-H drops doublets (two G1 cells stuck together read as 4N and
// would inflate G2/M), a viability dye drops dead cells. DAPI measures DNA,
// an EdU pulse marks cells replicating it (S), and phospho-histone H3 marks
// mitosis, which DNA content alone cannot tell apart from G2.

import { createCulture, acquire } from './cycle.js';

const LIN = 262144, CAP = 12000;
const lg = v => Math.log10(Math.max(v, 10));
const PAL = {
  live: { bg: 'rgba(20,6,14,0.55)', ax: 'rgba(245,230,236,0.35)', txt: 'rgba(245,230,236,0.7)', gate: '#ff8fb5', fill: 'rgba(255,143,181,0.28)', line: '#ffb3cd',
    ramp: [[60, 10, 40], [160, 30, 90], [255, 92, 147], [255, 190, 210], [255, 255, 255]] },
  stained: { bg: 'rgba(255,255,255,0.6)', ax: 'rgba(58,20,38,0.35)', txt: 'rgba(58,20,38,0.75)', gate: '#8a1f4f', fill: 'rgba(138,31,79,0.2)', line: '#8a1f4f',
    ramp: [[240, 200, 220], [210, 120, 160], [150, 40, 100], [90, 20, 70], [40, 10, 40]] },
  fluor: { bg: 'rgba(6,8,20,0.6)', ax: 'rgba(200,210,255,0.3)', txt: 'rgba(220,228,255,0.72)', gate: '#6f9bff', fill: 'rgba(79,140,255,0.26)', line: '#9cc0ff',
    ramp: [[10, 20, 80], [30, 80, 200], [60, 160, 255], [140, 230, 255], [240, 255, 255]] },
};

export function initFlow(root) {
  const culture = createCulture({ n: 6000, cycleSec: 34, neuronFrac: 0.06 });
  const $ = s => root.querySelector(s);
  const cv = { hist: $('canvas[data-p=hist]'), edu: $('canvas[data-p=edu]'), ph3: $('canvas[data-p=ph3]') };
  const events = [];
  let pal = PAL.live, acquired = 0, rate = 0;

  function ctx(c) {
    const dpr = Math.min(devicePixelRatio, 2), W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H); g.fillStyle = pal.bg; g.fillRect(0, 0, W, H);
    return { g, W, H };
  }
  const ramp = t => {
    const s = pal.ramp, x = Math.min(0.9999, Math.max(0, t)) * (s.length - 1), i = x | 0, f = x - i;
    return `rgb(${s[i].map((a, k) => Math.round(a + (s[i + 1][k] - a) * f)).join(',')})`;
  };

  function fitPeaks(dapi) {
    const bins = 180, h = new Float32Array(bins), w = 131072 / bins;
    for (const v of dapi) { const b = (v / w) | 0; if (b >= 0 && b < bins) h[b]++; }
    const sm = h.map((_, i) => (h[i - 1] || 0) * 0.25 + h[i] * 0.5 + (h[i + 1] || 0) * 0.25);
    const peak = (a, b) => { let m = a; for (let i = a; i < b; i++) if (sm[i] > sm[m]) m = i; return m; };
    const p1 = peak((30000 / w) | 0, (70000 / w) | 0), p2 = peak(Math.round(p1 * 1.85), Math.round(p1 * 2.15));
    const half = sm[p1] / 2; let l = p1, r = p1; while (l > 0 && sm[l] > half) l--; while (r < bins - 1 && sm[r] > half) r++;
    const g1 = (p1 + 0.5) * w;
    return { g1, g2: (p2 + 0.5) * w, cv: Math.max(0.015, (r - l) * w / 2.355 / g1), hist: sm };
  }

  function dots(key, evs, fy, gateY, label, pct) {
    const { g, W, H } = ctx(cv[key]);
    const N = 70, M = 44, grid = new Float32Array(N * M); let max = 1;
    const fx = v => Math.min(0.999, v / 131072), fyy = v => Math.min(0.999, Math.max(0, (lg(v) - 1.6) / 3.6));
    for (const e of evs) { const k = ((fyy(fy(e)) * M) | 0) * N + ((fx(e.dapi) * N) | 0); grid[k]++; if (grid[k] > max) max = grid[k]; }
    const cw = W / N, ch = H / M;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const v = grid[j * N + i]; if (!v) continue;
      g.fillStyle = ramp(Math.log(1 + v) / Math.log(1 + max)); g.fillRect(i * cw, H - (j + 1) * ch, cw + 0.5, ch + 0.5);
    }
    const y = H - fyy(10 ** gateY) * H;
    g.strokeStyle = pal.gate; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = pal.gate; g.font = '500 10px JetBrains Mono, monospace'; g.fillText(`${label} ${pct}`, 6, 12);
    g.fillStyle = pal.txt; g.textAlign = 'right'; g.fillText('DNA →', W - 5, H - 5); g.textAlign = 'left';
  }

  function render() {
    const cells = events.filter(e => !e.debris && e.fscA > 42000 && e.ssc > 20000);
    const singles = cells.filter(e => { const r = e.fscH / e.fscA; return r > 0.82 && r < 1.02; });
    const live = singles.filter(e => lg(e.via) < 3.2);
    const f = fitPeaks(live.map(e => e.dapi));
    const g1Hi = f.g1 * (1 + 2.4 * f.cv), g2Lo = f.g2 * (1 - 2.4 * f.cv), subG1 = f.g1 * (1 - 3.2 * f.cv);
    const k = { G1: 0, S: 0, G2: 0, M: 0 };
    let n = 0;
    for (const e of live) {
      if (e.dapi < subG1) continue; n++;
      if (lg(e.ph3) > 3.45 && e.dapi > g2Lo * 0.93) k.M++;
      else if (lg(e.edu) > 3.05) k.S++;
      else if (e.dapi <= g1Hi) k.G1++;
      else if (e.dapi >= g2Lo) k.G2++;
      else k.S++;
    }
    const pc = x => n ? `${(x / n * 100).toFixed(1)}%` : '—';

    // DNA histogram
    { const { g, W, H } = ctx(cv.hist), hs = f.hist, max = Math.max(...hs) * 1.1, X = v => v / 131072 * W;
      g.beginPath(); g.moveTo(0, H);
      hs.forEach((v, i) => g.lineTo((i + 0.5) / hs.length * W, H - v / max * (H - 16)));
      g.lineTo(W, H); g.closePath(); g.fillStyle = pal.fill; g.fill(); g.strokeStyle = pal.line; g.lineWidth = 1.2; g.stroke();
      const bracket = (a, b, y, text) => {
        g.strokeStyle = pal.gate; g.lineWidth = 1.2; g.beginPath();
        g.moveTo(X(a), y - 4); g.lineTo(X(a), y + 4); g.moveTo(X(a), y); g.lineTo(X(b), y); g.moveTo(X(b), y - 4); g.lineTo(X(b), y + 4); g.stroke();
        g.fillStyle = pal.gate; g.font = '500 10px JetBrains Mono, monospace'; g.textAlign = 'center'; g.fillText(text, (X(a) + X(b)) / 2, y - 6);
      };
      bracket(subG1, g1Hi, 22, `G0/G1 ${pc(k.G1)}`);
      bracket(g1Hi, g2Lo, H * 0.55, `S ${pc(k.S)}`);
      bracket(g2Lo, f.g2 * (1 + 3 * f.cv), 22, `G2/M ${pc(k.G2 + k.M)}`);
      g.fillStyle = pal.txt; g.textAlign = 'left'; g.font = '10px JetBrains Mono, monospace';
      g.fillText('2N', X(f.g1) - 6, H - 4); g.fillText('4N', X(f.g2) - 6, H - 4); g.textAlign = 'right'; g.fillText('DAPI →', W - 5, H - 4); g.textAlign = 'left'; }
    dots('edu', live, e => e.edu, 3.05, 'EdU+ (S)', pc(k.S));
    dots('ph3', live, e => e.ph3, 3.45, 'pH3+ (M)', pc(k.M));

    for (const [p, v] of Object.entries(k)) { root.querySelector(`[data-ph=${p}] b`).textContent = pc(v); root.querySelector(`[data-ph=${p}] i`).style.width = n ? `${v / n * 100}%` : '0'; }
    $('#fl-chain').innerHTML = [['events', events.length, ''], ['cells', cells.length, cells.length / events.length], ['singlets', singles.length, singles.length / cells.length], ['live', live.length, live.length / singles.length]]
      .map(([l, c, p]) => `<span><em>${l}</em>${c.toLocaleString()}${p ? ` <small>${(p * 100).toFixed(0)}%</small>` : ''}</span>`).join('<i>›</i>');
    $('#fl-fit').textContent = `G2/G1 ${(f.g2 / f.g1).toFixed(2)} · CV ${(f.cv * 100).toFixed(1)}%`;
    $('#fl-rate').textContent = `${Math.round(rate).toLocaleString()} evt/s · ${acquired.toLocaleString()}`;
  }

  let last = performance.now(), acc = 0, active = false;
  function tick(now) {
    if (!active) return;
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    culture.step(dt);
    const add = Math.round(800 * dt * (0.8 + Math.random() * 0.4));
    events.push(...acquire(culture, add)); acquired += add; rate += (add / Math.max(dt, 1e-3) - rate) * 0.08;
    if (events.length > CAP) events.splice(0, events.length - CAP);
    acc += dt; if (acc > 0.3) { acc = 0; render(); }
    requestAnimationFrame(tick);
  }
  events.push(...acquire(culture, 8000)); acquired = 8000;
  return {
    setMode(m) { pal = PAL[m] || PAL.live; render(); },
    setActive(on) { if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(tick); } else if (!on) active = false; },
  };
}
