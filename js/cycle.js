// cycle.js
// A neural culture as a population model, plus the cytometer that reads it.
//
// Neural progenitors cycle through G1 → S → G2 → M with mammalian phase
// proportions (roughly 46 / 33 / 15 / 6 percent). Neurons are post-mitotic:
// they sit in G0 with 2N DNA and no Ki-67. Population size is held constant
// with a Moran process: when a cell divides, one daughter keeps its slot and
// the other overwrites a random slot. That reproduces the exponential-growth
// age distribution (more young cells than old), so the fraction of events in
// each phase matches a real growing culture instead of a uniform clock.
// Divisions are asymmetric at a fixed neurogenic rate, which holds the
// neuron fraction steady.
//
// Treatments act where the real drugs act:
//   hydroxyurea    depletes dNTPs: cells stall at the G1/S boundary, S crawls
//   nocodazole     depolymerizes microtubules: no spindle, arrest in mitosis
//   serum starve   no growth signal: G1 cells exit to G0 before the
//                  restriction point, Ki-67 decays
// Long mitotic arrest ends in apoptosis, which shows up as a sub-G1 peak.

export const PHASE = ['G0', 'G1', 'S', 'G2', 'M'];
// cumulative boundaries of the cycle clock t ∈ [0, 1)
export const B = { S: 0.46, G2: 0.79, M: 0.94 };
export const TREATMENTS = {
  none: { label: 'Untreated', note: 'Asynchronous, exponentially growing culture.' },
  hu: { label: 'Hydroxyurea', note: 'Ribonucleotide reductase blocked. Cells pile up at the G1/S border and S crawls.' },
  noco: { label: 'Nocodazole', note: 'Microtubules depolymerized, no spindle. Cells arrest in mitosis, then some die.' },
  starve: { label: 'Serum starve', note: 'No mitogens. Cells leave the cycle before the restriction point and enter G0.' },
};

const rn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function phaseOf(c) {
  if (c.type === 1 || c.q > 0.5) return 'G0';
  if (c.t < B.S) return 'G1';
  if (c.t < B.G2) return 'S';
  if (c.t < B.M) return 'G2';
  return 'M';
}
/** DNA content in units of N (2 = diploid) */
export function dnaOf(c) {
  if (c.dead) return c.frag;
  if (c.type === 1 || c.t < B.S) return 2;
  if (c.t < B.G2) return 2 + 2 * (c.t - B.S) / (B.G2 - B.S);
  return 4;
}
export function mitoticProgress(c) { return c.type === 0 && c.t >= B.M ? (c.t - B.M) / (1 - B.M) : -1; }

/** advance one cell by dt seconds under a treatment; returns 'divide' when it completes M */
export function advance(c, dt, tx, cycleSec) {
  if (c.dead) { c.deadFor += dt; return null; }
  if (c.type === 1) return null;
  // quiescence: Ki-67 decays over ~a cycle, recovers faster on re-entry
  if (c.q > 0.5) {
    c.ki += (0 - c.ki) * Math.min(1, dt / (cycleSec * 0.6));
    if (tx !== 'starve' && Math.random() < dt / (cycleSec * 0.35)) { c.q = 0; c.t = 0; }
    return null;
  }
  c.ki += (1 - c.ki) * Math.min(1, dt / (cycleSec * 0.15));
  let rate = dt / (c.len * cycleSec);
  const prev = c.t;
  if (tx === 'starve' && c.t < B.S * 0.72 && Math.random() < dt / (cycleSec * 0.18)) { c.q = 1; return null; }
  if (tx === 'hu') {
    if (c.t < B.S && c.t + rate >= B.S) { c.t = B.S + 0.004 + Math.random() * 0.01; return null; }
    if (c.t >= B.S && c.t < B.G2) rate *= 0.04;
  }
  c.t += rate;
  if (tx === 'noco' && prev < B.M + 0.35 * (1 - B.M) && c.t >= B.M + 0.35 * (1 - B.M)) {
    c.t = B.M + 0.35 * (1 - B.M) - 1e-4;          // held at prometaphase: the spindle checkpoint never clears
    c.arrest = (c.arrest || 0) + dt;
    if (c.arrest > cycleSec * 0.7 && Math.random() < dt / (cycleSec * 2.5)) die(c);
    return null;
  }
  if (c.t >= 1) { c.t -= 1; c.arrest = 0; return 'divide'; }
  return null;
}
function die(c) { c.dead = true; c.deadFor = 0; c.frag = 2 * (0.12 + Math.random() * 0.72); }

export function newCell(type, t = Math.random()) {
  return {
    type, t, len: 1 + 0.16 * rn(), q: 0, ki: type === 0 ? 1 : 0, dead: false, deadFor: 0, frag: 2, arrest: 0,
    // a cell carries its own measurement offsets, so re-measuring it is consistent
    seed: [rn(), rn(), rn(), rn(), rn(), rn(), rn()],
  };
}

export function createCulture({ n = 6000, cycleSec = 42, neuronFrac = 0.3, apoptosis = 0.004 } = {}) {
  const cells = [];
  // seed with the exponential age density 2ln2·e^(−ln2·a) so it starts in steady state
  for (let i = 0; i < n; i++) {
    const neuron = Math.random() < neuronFrac;
    const a = Math.log(2 - Math.random()) / Math.LN2;   // inverse CDF of 2·ln2·2^(−a)
    cells.push(newCell(neuron ? 1 : 0, neuron ? 0 : a));
  }
  const S = { cells, tx: 'none', cycleSec, neuronFrac, divisions: 0, time: 0 };
  S.setTreatment = tx => { S.tx = tx; };
  S.step = dt => {
    S.time += dt;
    for (let i = 0; i < n; i++) {
      const c = cells[i];
      if (c.dead) { c.deadFor += dt; if (c.deadFor > cycleSec * 0.6) cells[i] = newCell(0, 0); continue; }
      if (c.type === 0 && Math.random() < dt * apoptosis / cycleSec * 10) { die(c); continue; }
      if (advance(c, dt, S.tx, cycleSec) === 'divide') {
        S.divisions++;
        c.seed = c.seed.map(() => rn());
        const d = newCell(Math.random() < neuronFrac ? 1 : 0, 0);
        cells[(Math.random() * n) | 0] = d;        // Moran replacement
      }
    }
  };
  // ground truth over live single cells
  S.truth = () => {
    const k = { G0: 0, G1: 0, S: 0, G2: 0, M: 0 }; let live = 0;
    for (const c of cells) { if (c.dead) continue; live++; k[phaseOf(c)]++; }
    for (const p in k) k[p] = k[p] / live * 100;
    return k;
  };
  return S;
}

// ── the instrument ───────────────────────────────────────────────────────
// Linear channels run to 262,144 like an 18-bit cytometer. DAPI is set so
// 2N lands near 50k. Fluorescence markers are log-normal.
const G1CH = 50000, LIN = 262144;
export function measure(c, doubletWith = null) {
  const s = c.seed, dna = dnaOf(c);
  const grow = c.type === 1 ? 1.12 : 1 + 0.42 * (dna - 2) / 2;
  let fscA = 92000 * grow * Math.exp(0.1 * s[0]);
  let fscH = fscA * (0.93 + 0.025 * s[1]);
  let ssc = (c.type === 1 ? 78000 : 60000) * Math.exp(0.14 * s[2]) * (c.dead ? 1.4 : 1);
  let dapi = G1CH * dna / 2 * (1 + 0.034 * s[3]) * (dna > 3.9 ? 0.99 : 1);  // slight G2 nonlinearity: ratio ≈ 1.98
  if (c.dead) { fscA *= 0.55; fscH = fscA * 0.9; }
  const ph = phaseOf(c);
  const sProg = ph === 'S' ? (c.t - B.S) / (B.G2 - B.S) : 0;
  // EdU pulse before harvest: incorporation tracks replication rate, highest mid-S (the horseshoe)
  const edu = ph === 'S' && !c.dead ? 10 ** (3.45 + 0.75 * Math.pow(Math.sin(Math.PI * sProg), 0.55) + 0.12 * s[4]) : 10 ** (2.05 + 0.22 * s[4]);
  const kiLevel = c.type === 1 ? 0 : c.ki * (0.55 + 0.45 * (c.q > 0.5 ? 0 : c.t));
  const ki67 = 10 ** (2.05 + 1.85 * kiLevel + 0.18 * s[5]);
  const mp = mitoticProgress(c);
  const lateG2 = ph === 'G2' ? (c.t - B.G2) / (B.M - B.G2) : 0;
  const ph3 = 10 ** (mp >= 0 && !c.dead ? 3.95 + 0.14 * s[6] : 2.05 + 0.9 * Math.max(0, lateG2 - 0.6) + 0.2 * s[6]);
  const via = 10 ** (c.dead ? 3.9 + 0.2 * s[0] : 2.2 + 0.2 * s[1]);
  const e = { fscA, fscH, ssc, dapi, edu, ki67, ph3, via, truth: c.dead ? 'dead' : ph, doublet: false, debris: false };
  if (doubletWith) {
    const o = measure(doubletWith);
    e.fscA = fscA + o.fscA; e.fscH = Math.max(fscH, o.fscH) * 1.12; e.ssc = ssc + o.ssc;
    e.dapi = dapi + o.dapi; e.edu = Math.max(edu, o.edu); e.ki67 = Math.max(ki67, o.ki67); e.ph3 = Math.max(ph3, o.ph3);
    e.doublet = true;
  }
  for (const k of ['fscA', 'fscH', 'ssc', 'dapi']) e[k] = Math.min(LIN - 1, e[k]);
  return e;
}
export function acquire(S, k) {
  const out = [];
  for (let i = 0; i < k; i++) {
    const r = Math.random();
    if (r < 0.04) {   // debris: small, dim, low DNA
      out.push({ fscA: 4000 + Math.random() * 30000, fscH: 0, ssc: 3000 + Math.random() * 25000, dapi: Math.random() * 30000, edu: 10 ** (1.8 + Math.random()), ki67: 10 ** (1.8 + Math.random()), ph3: 10 ** (1.8 + Math.random()), via: 10 ** (2 + Math.random() * 2), truth: 'debris', debris: true, doublet: false });
      out[out.length - 1].fscH = out[out.length - 1].fscA * 0.9;
      continue;
    }
    const c = S.cells[(Math.random() * S.cells.length) | 0];
    out.push(r < 0.075 ? measure(c, S.cells[(Math.random() * S.cells.length) | 0]) : measure(c));
  }
  return out;
}
