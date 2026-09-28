// dive.js
// Click a cell, then scroll into it: a powers-of-ten dive from the cell to
// its nucleus, the chromatin inside, DNA wound around histone spools, and
// finally the double helix itself, where you can make an edit.
//
// Every level is nested at the origin a factor of ten or so smaller than the
// last. The camera never moves far; the world scales up exponentially around
// it, and each level fades in as it grows into view and out once we've
// passed through it.
//
// The editor is a simplified model of CRISPR on a made-up sequence: slide a
// 20-letter guide along the strand until it sits beside an NGG, send in
// Cas9, watch it find the site and cut, then choose how the cell repairs the
// break. Patch it and a few letters usually get scrambled; hand it a template
// and it copies in a glow gene, which every daughter of that cell inherits.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// each level: its size in the world at zoom 1, and where the dive lingers on it
export const LEVELS = [
  { key: 'cell', name: 'the cell', size: '~20 µm across', note: 'One cell from the dish. Everything it is, is written in the DNA inside that violet nucleus.', r: 1, p: 0 },
  { key: 'nucleus', name: 'the nucleus', size: '~6 µm', note: 'About two metres of DNA, folded into a ball a few thousandths of a millimetre wide.', r: 0.33, p: 0.2 },
  { key: 'chromatin', name: 'chromatin', size: '~1 µm of it', note: 'The DNA isn\'t loose. It\'s wound and looped into fibres, packed tighter where genes are switched off.', r: 0.2, p: 0.4 },
  { key: 'nucleosome', name: 'nucleosomes', size: '~11 nm each', note: 'Up close the fibre is beads on a string: DNA wrapped almost twice around spools of histone protein.', r: 0.035, p: 0.62 },
  { key: 'helix', name: 'the double helix', size: '2 nm wide', note: 'Two strands, and the letters pair across the middle: A with T, G with C. Now you can edit it.', r: 0.0036, p: 0.86 },
];
const ZOOM = [0.9, 2.7, 4.8, 24, 110];                  // zoom at each level's p
const REAL = [10, 3, 0.5, 0.03, 0.001];                // real radius in µm of what fills the screen at each level
const BASE = { A: 0xe8839c, T: 0xd9b36c, G: 0x6fcf9f, C: 0x8aa4e8 };
const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
const GLOW = 0x5dffb4, SCAR = 0xff4d5e, PEARL = 0xb9b0cc;
const RISE = 0.36, TWIST = Math.PI * 2 / 10.5, GROOVE = 2.35, NMAX = 90;
const GUIDE = 20;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// a made-up stretch of genome, the same every time for the same cell, with a
// handful of NGG sites so there are real choices to make
function sequenceFor(id) {
  let s = id * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const L = 'ATGC';
  const seq = Array.from({ length: 52 }, () => L[(rnd() * 4) | 0]);
  for (const at of [24, 31, 43]) { seq[at + 1] = 'G'; seq[at + 2] = 'G'; }
  // no accidental GG runs elsewhere, so the valid windows are exactly the planted ones
  for (let i = 1; i < seq.length; i++) if (seq[i] === 'G' && seq[i - 1] === 'G' && ![25, 26, 32, 33, 44, 45].includes(i)) seq[i] = 'C';
  return seq;
}

// glowing edge shader: bright at grazing angles, nearly clear face-on
function fresnel(color, { pow = 2.4, str = 1.2, base = 0.04 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: pow }, uStr: { value: str }, uBase: { value: base }, uAlpha: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uPow, uStr, uBase, uAlpha; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor * (uBase + f * uStr) * uAlpha, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });

export function initDive(canvas, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07030b);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const levels = {};
  const fade = [];                           // [group, material, baseOpacity] for per-level alpha
  const track = (g, m, base) => { fade.push([g, m, base]); return m; };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- the cell ----------
  {
    const g = new THREE.Group(); levels.cell = g; scene.add(g);
    const mem = track(g, fresnel(0xff7fae, { pow: 3.2, str: 1.0, base: 0.012 }));
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mem); m.scale.set(1.18, 0.92, 0.6); g.add(m);
    // cytoplasm: drifting specks and orange mitochondria
    const n = 1600, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let x, y, z; do { x = rnd(-1, 1); y = rnd(-1, 1); z = rnd(-1, 1); } while (x * x + y * y + z * z > 0.95 || x * x + y * y + z * z < 0.14);
      pos.set([x * 1.15, y * 0.9, z * 0.55], i * 3);
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(pg, track(g, new THREE.PointsMaterial({ color: 0xffb3cf, size: 0.008, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }), 0.55)));
    const mito = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.022, 0.11, 4, 10), track(g, glowMat(0xff8a4a, 0.32), 0.32), 30);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 30; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(0.5, 0.85);
      q.setFromEuler(new THREE.Euler(rnd(0, 3), rnd(0, 3), rnd(0, 3)));
      M.compose(new THREE.Vector3(Math.cos(a) * r * 1.15, Math.sin(a) * r * 0.9, rnd(-0.25, 0.25)), q, new THREE.Vector3(1, rnd(0.7, 1.4), 1)); mito.setMatrixAt(i, M);
    }
    g.add(mito);
    // ER: faint ribbons curling round the nucleus
    for (let k = 0; k < 7; k++) {
      const pts = []; const a0 = rnd(0, 6.28);
      for (let j = 0; j < 9; j++) { const a = a0 + j * 0.28, r = 0.42 + j * 0.02 + rnd(-0.02, 0.02); pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.9, rnd(-0.15, 0.15))); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.006, 5), track(g, glowMat(0x7fd3ff, 0.35), 0.35)));
    }
  }
  // ---------- the nucleus shell, with its pores ----------
  {
    const g = new THREE.Group(); levels.nucleus = g; scene.add(g);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), track(g, fresnel(0xa96bff, { pow: 2.2, str: 1.1, base: 0.035 }))));
    const pores = new THREE.InstancedMesh(new THREE.TorusGeometry(0.018, 0.004, 6, 16), track(g, glowMat(0xe2ccff, 0.45), 0.45), 180);
    const M = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 180; i++) {
      v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      q.setFromUnitVectors(z, v);
      M.compose(v.clone().multiplyScalar(1.001), q, new THREE.Vector3(1, 1, 1)); pores.setMatrixAt(i, M);
    }
    g.add(pores);
    const nl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 24), track(g, fresnel(0x5b2bd8, { pow: 1.6, str: 0.9, base: 0.12 })));
    nl.position.set(0.35, 0.25, -0.2); g.add(nl);
  }
  // ---------- chromatin: looping fibres, one of them ours ----------
  {
    const g = new THREE.Group(); levels.chromatin = g; scene.add(g);
    const hues = [0xb07bff, 0xff7fbf, 0x7f9bff, 0xd7a2ff];
    for (let k = 0; k < 46; k++) {
      const pts = []; let p = new THREE.Vector3(rnd(-0.8, 0.8), rnd(-0.8, 0.8), rnd(-0.8, 0.8)), d = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      for (let j = 0; j < 26; j++) {
        pts.push(p.clone());
        d.add(new THREE.Vector3(rnd(-0.7, 0.7), rnd(-0.7, 0.7), rnd(-0.7, 0.7))).normalize();
        if (p.length() > 0.9) d.addScaledVector(p, -0.9).normalize();
        p = p.clone().addScaledVector(d, 0.09);
      }
      const bright = rnd(0.18, 0.45);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, rnd(0.008, 0.016), 5), track(g, glowMat(hues[k % 4], bright), bright)));
    }
    // the fibre we follow runs straight through the middle
    const pts = [];
    for (let j = -8; j <= 8; j++) pts.push(new THREE.Vector3(j * 0.1, Math.sin(j * 0.7) * 0.12, Math.cos(j * 0.5) * 0.1 - 0.1 + (j === 0 ? 0.1 : 0)));
    pts[8].set(0, 0, 0);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.014, 8), track(g, glowMat(0xffd9f2, 0.7), 0.7)));
    const haze = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) { const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (v.length() > 1) v.normalize(); haze.set([v.x, v.y, v.z], i * 3); }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(haze, 3));
    g.add(new THREE.Points(hg, track(g, new THREE.PointsMaterial({ color: 0xc9a8ff, size: 0.008, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), 0.5)));
  }
  // ---------- nucleosomes: beads on a string ----------
  {
    const g = new THREE.Group(); levels.nucleosome = g; scene.add(g);
    const spoolMat = track(g, fresnel(0xff8fc8, { pow: 1.4, str: 0.9, base: 0.28 }));
    const path = [];
    const N = 9;
    for (let j = 0; j < N; j++) {
      const cx = (j - (N - 1) / 2) * 0.24 + 0.12, cy = (j % 2 ? 1 : -1) * 0.14, cz = (j % 2 ? -1 : 1) * 0.05;
      const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.075, 32), spoolMat);
      const ax = new THREE.Vector3(0.3, 1, 0.5 * (j % 2 ? 1 : -1)).normalize();
      spool.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax); spool.position.set(cx, cy, cz); g.add(spool);
      // wrap the DNA ~1.7 turns round the spool, then run on to the next
      const u = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 0, 1)).normalize(), w = new THREE.Vector3().crossVectors(ax, u);
      for (let k = 0; k <= 26; k++) {
        const a = k / 26 * Math.PI * 2 * 1.7 + j;
        path.push(new THREE.Vector3(cx, cy, cz).addScaledVector(u, Math.cos(a) * 0.098).addScaledVector(w, Math.sin(a) * 0.098).addScaledVector(ax, (k / 26 - 0.5) * 0.07));
      }
    }
    // make sure the linker that crosses the origin passes right through it
    const mid = path.findIndex(p => p.x > -0.02);
    path.splice(mid, 0, new THREE.Vector3(0, 0, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 900, 0.011, 6), track(g, glowMat(PEARL, 0.9), 0.9)));
  }
  // ---------- the double helix ----------
  const helix = new THREE.Group(); levels.helix = helix; scene.add(helix);
  const beadGeo = new THREE.SphereGeometry(1, 14, 10), rungGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  const beads = new THREE.InstancedMesh(beadGeo, track(helix, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: true }), 1), NMAX * 6);
  const rungs = new THREE.InstancedMesh(rungGeo, track(helix, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), 1), NMAX * 2);
  for (const im of [beads, rungs]) { im.frustumCulled = false; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.count * 3), 3); helix.add(im); }
  // Cas9: a soft iridescent protein with the guide RNA held inside
  const cas = new THREE.Group(); helix.add(cas); cas.visible = false;
  const casShell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 5), fresnel(0x9d86e6, { pow: 2.6, str: 0.55, base: 0.015 }));
  casShell.scale.set(1.5, 1.05, 1.1); cas.add(casShell);
  const casLobe = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 4), fresnel(0x8a74d6, { pow: 2.2, str: 0.45, base: 0.02 })); casLobe.position.set(-1.2, 1.3, 0.6); cas.add(casLobe);
  const rnaMat = glowMat(0xd9a441, 0.8);
  let rna = null;
  // cut flash
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowMat(0xffffff, 0)); helix.add(flash);

  // ---------- the drifting dust that fills every level ----------
  {
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([rnd(-6, 6), rnd(-4, 4), rnd(-6, 1)], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8f6bff, size: 0.02, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })));
  }

  // ---------- state ----------
  const st = {
    open: false, p: 0, shown: 0, cell: null,
    seq: [], marks: [],                    // marks: 0 normal, 1 inserted glow gene, 2 scar
    win: 0, phase: 'pick', t: 0, cutAt: -1, gap: 0, unzip: [], outcome: null, insertN: 0,
  };
  const validWindow = i => { const s = st.seq; return i >= 0 && i + GUIDE + 2 < s.length && s[i + GUIDE + 1] === 'G' && s[i + GUIDE + 2] === 'G'; };
  function firstValid() { for (let i = 0; i < st.seq.length; i++) if (validWindow(i)) return i; return 0; }

  // helix geometry for the current sequence and animation state
  const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
  const xOf = i => (i - st.center) * RISE + (st.cutAt >= 0 && i > st.cutAt ? st.gap : 0);
  function strandPoint(i, strand, out, frac = 0) {
    const a = (i + frac) * TWIST + (strand ? GROOVE : 0) + clock * 0.15;
    const r = 1 + (st.unzip[i] || 0) * 0.9;
    return out.set(xOf(i) + frac * RISE, Math.cos(a) * r, Math.sin(a) * r);
  }
  const P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), Mid = new THREE.Vector3(), Dir = new THREE.Vector3();
  function layoutHelix() {
    const n = st.seq.length;
    let b = 0, r = 0;
    for (let i = 0; i < n; i++) {
      const base = st.seq[i], mark = st.marks[i];
      const col = mark === 1 ? GLOW : mark === 2 ? SCAR : BASE[base], col2 = mark === 1 ? GLOW : mark === 2 ? SCAR : BASE[PAIR[base]];
      // while choosing: letters outside the guide and its PAM dim, so the target reads at a glance
      const pick = st.phase === 'pick', inWin = i >= st.win && i < st.win + GUIDE, inPam = i >= st.win + GUIDE && i < st.win + GUIDE + 3;
      const dim = pick && !inWin && !inPam && !mark ? 0.32 : inPam ? (validWindow(st.win) ? 1.5 : 0.9) : 1;
      const backbone = mark === 1 ? GLOW : PEARL;
      for (let s = 0; s < 2; s++) {
        strandPoint(i, s, P1);
        M4.compose(P1, Q.identity(), S.setScalar(0.1)); beads.setMatrixAt(b, M4); beads.setColorAt(b++, C.set(backbone));
        // the sugar-phosphate chain between this letter and the next
        if (i < n - 1 && !(st.cutAt === i && st.gap > 0.05)) for (const f of [0.34, 0.67]) {
          strandPoint(i, s, P2, f);
          M4.compose(P2, Q.identity(), S.setScalar(0.055)); beads.setMatrixAt(b, M4); beads.setColorAt(b++, C.set(backbone).multiplyScalar(0.6));
        }
      }
      // base pair: two half-rungs meeting between the strands, pulled apart when unzipped
      strandPoint(i, 0, P1); strandPoint(i, 1, P2); Mid.addVectors(P1, P2).multiplyScalar(0.5);
      const z = st.unzip[i] || 0;
      for (const [P, c] of [[P1, col], [P2, col2]]) {
        Dir.subVectors(Mid, P); const len = Dir.length() * (1 - z * 0.75) - 0.12;
        Dir.normalize();
        V.copy(P).addScaledVector(Dir, 0.1 + len / 2);
        Q.setFromUnitVectors(UP, Dir);
        M4.compose(V, Q, S.set(0.075, Math.max(len, 0.01), 0.075)); rungs.setMatrixAt(r, M4); rungs.setColorAt(r++, C.set(c).multiplyScalar((mark ? 1.3 : 1) * dim));
      }
    }
    beads.count = b; rungs.count = r;
    for (const im of [beads, rungs]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  }

  function setSeq(seq, marks) { st.center = (seq.length - 1) / 2; st.seq = seq; st.marks = marks || seq.map(() => 0); st.unzip = seq.map(() => 0); }

  // ---------- the dive: zoom by p ----------
  function zoomAt(p) {
    const ps = LEVELS.map(l => l.p);
    if (p <= ps[0]) return ZOOM[0];
    for (let i = 0; i < ps.length - 1; i++) if (p <= ps[i + 1]) {
      const u = smooth(ps[i], ps[i + 1], p);
      return Math.exp(lerp(Math.log(ZOOM[i]), Math.log(ZOOM[i + 1]), u));
    }
    return ZOOM[ZOOM.length - 1];
  }
  // how visible a level is at a zoom, from its on-screen size
  function levelAlpha(key, z) {
    const L = LEVELS.find(l => l.key === key), a = L.r * z;
    switch (key) {
      case 'cell': return 1 - smooth(1.6, 3.2, a);
      case 'nucleus': return smooth(0.08, 0.2, a) * (1 - smooth(1.1, 2.0, a));
      case 'chromatin': return smooth(0.35, 0.8, a) * (1 - smooth(1.8, 3.4, a));
      case 'nucleosome': return smooth(0.12, 0.45, a) * (1 - smooth(2.0, 3.6, a));
      case 'helix': return smooth(0.08, 0.3, a);
    }
    return 1;
  }

  let W = 1, H = 1;
  function fit() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    renderer.setSize(W, H, false); composer.setSize(W, H); bloom.setSize(W, H);
    camera.aspect = W / H; camera.fov = W < 700 ? 55 : 40; camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit);

  // ---------- editor actions ----------
  function moveWindow(d) {
    if (st.phase !== 'pick') return;
    st.win = clamp(st.win + d, 0, st.seq.length - GUIDE - 3);
    ui.editor(stateForUi());
  }
  function setWindow(i) { if (st.phase !== 'pick') return; st.win = clamp(i, 0, st.seq.length - GUIDE - 3); ui.editor(stateForUi()); }
  function sendCas9() {
    if (st.phase !== 'pick' || !validWindow(st.win)) return;
    st.phase = 'scan'; st.t = 0;
    // the guide RNA, a bright strand that Cas9 carries
    if (rna) { cas.remove(rna); rna.geometry.dispose(); }
    const pts = []; for (let k = 0; k <= 20; k++) pts.push(new THREE.Vector3((k - 10) * RISE * 0.9, Math.sin(k * 0.6) * 0.35, 1.1 + Math.cos(k * 0.6) * 0.3));
    rna = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.05, 8), rnaMat); cas.add(rna);
    cas.visible = true;
    ui.editor(stateForUi());
    ui.sfx && ui.sfx('scan');
  }
  function repair(kind) {
    if (st.phase !== 'choose') return;
    st.repair = kind; st.phase = 'repair'; st.t = 0;
    // a cell handed a template usually uses it, but not always: sometimes it patches the break first
    st.outcome = kind === 'template' ? (Math.random() < 0.8 ? 'knock-in' : 'patched-anyway') : 'patched';
    ui.editor(stateForUi());
  }
  function stateForUi() {
    return { seq: st.seq, marks: st.marks, win: st.win, valid: validWindow(st.win), phase: st.phase, outcome: st.outcome, cutAt: st.cutAt, guide: GUIDE, pam: st.seq.slice(st.win + GUIDE, st.win + GUIDE + 3).join('') };
  }

  // ---------- main loop ----------
  let clock = 0, last = performance.now(), raf = 0, levelShown = -1;
  const camPos = new THREE.Vector3(0, 0, 3.2), camLook = new THREE.Vector3();
  function frame(now) {
    if (!st.open) { raf = 0; return; }
    const dt = Math.min((now - last) / 1000, 0.05); last = now; clock += dt;
    st.shown = lerp(st.shown, st.p, Math.min(1, dt * (st.leaving ? 2.6 : 5)));
    if (st.leaving && st.shown < 0.05) api.close();
    const p = st.shown, z = zoomAt(p);

    // levels: scale everything around the origin, fade by on-screen size
    for (const key in levels) {
      const L = LEVELS.find(l => l.key === key), g = levels[key];
      g.scale.setScalar(L.r * z);
      g.userData.alpha = levelAlpha(key, z);
    }
    for (const [g, m, base] of fade) {
      const a = g.userData.alpha ?? 1;
      if (m.uniforms && m.uniforms.uAlpha) m.uniforms.uAlpha.value = a; else m.opacity = (base ?? 1) * a;
    }
    for (const key in levels) levels[key].visible = levels[key].userData.alpha > 0.004;
    levels.cell.rotation.z = clock * 0.03; levels.nucleus.rotation.y = clock * 0.05;
    levels.chromatin.rotation.y = clock * 0.04 + p * 1.5; levels.chromatin.rotation.x = p * 0.6;
    levels.nucleosome.rotation.y = -0.4 + (p - 0.62) * 2.5; levels.nucleosome.rotation.x = 0.2;
    // the helix turns from end-on to side-on as we arrive
    const arrive = smooth(0.78, 1, p);
    levels.helix.rotation.y = lerp(Math.PI / 2.2, 0, arrive);

    stepEditor(dt);
    if (levels.helix.visible) layoutHelix();

    // camera: a slow orbit that settles side-on to the helix, panning to the guide window
    const hs = LEVELS[4].r * z;
    const winX = (xOf(st.win + GUIDE / 2) + (st.phase === 'scan' ? 0 : 0)) * hs * arrive;
    const orbit = (1 - arrive) * 0.5;
    camPos.set(Math.sin(clock * 0.1) * orbit + winX, Math.cos(clock * 0.08) * orbit * 0.6 - arrive * 0.2, 3.2 - arrive * 0.2);
    camLook.set(winX, -arrive * 0.36, 0);
    camera.position.lerp(camPos, Math.min(1, dt * 4)); camera.lookAt(camLook);

    // which level are we on
    let lv = 0; for (let i = 0; i < LEVELS.length; i++) if (p >= LEVELS[i].p - 0.06) lv = i;
    if (lv !== levelShown) { levelShown = lv; ui.level(lv); }
    // µm per screen pixel for the scale bar, from the level we're nearest
    const pxPerUnit = H / (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    const umAt = i => REAL[i] / (LEVELS[i].r * ZOOM[i]);
    let umPerUnit = umAt(0);
    for (let i = 0; i < LEVELS.length - 1; i++) if (p >= LEVELS[i].p) { const u = clamp((p - LEVELS[i].p) / (LEVELS[i + 1].p - LEVELS[i].p), 0, 1); umPerUnit = Math.exp(lerp(Math.log(umAt(i)), Math.log(umAt(i + 1)), u)); }
    ui.depth(p, umPerUnit / pxPerUnit);
    ui.editorOn(p > 0.97);
    composer.render();
    raf = requestAnimationFrame(frame);
  }

  function stepEditor(dt) {
    st.t += dt;
    const hs = 1;                                    // helix-local units
    if (st.phase === 'scan') {
      // Cas9 drifts in from the left end, pausing at each GG it meets, until it finds the match
      const target = xOf(st.win + GUIDE / 2);
      const start = xOf(0) - 4;
      const u = smooth(0, 2.6, st.t);
      cas.position.set(lerp(start, target, u), 0.2 + Math.sin(st.t * 3) * 0.1 * (1 - u), 0.4);
      cas.rotation.set(Math.sin(st.t) * 0.1, 0, Math.sin(st.t * 0.7) * 0.08);
      if (st.t > 2.8) { st.phase = 'bind'; st.t = 0; ui.editor(stateForUi()); ui.sfx && ui.sfx('bind'); }
    } else if (st.phase === 'bind') {
      // the guide pairs with its match: the helix unzips under Cas9
      for (let i = 0; i < st.seq.length; i++) {
        const inWin = i >= st.win && i < st.win + GUIDE;
        st.unzip[i] = lerp(st.unzip[i], inWin ? 1 : 0, Math.min(1, dt * 4));
      }
      if (st.t > 1.3) {
        st.phase = 'cut'; st.t = 0;
        st.cutAt = st.win + GUIDE - 4;                 // Cas9 cuts three letters before the PAM
        ui.editor(stateForUi()); ui.sfx && ui.sfx('cut');
      }
    } else if (st.phase === 'cut') {
      const f = Math.max(0, 1 - st.t * 1.6);
      flash.position.set(xOf(st.cutAt) + RISE / 2, 0, 0); flash.scale.setScalar(0.6 + st.t * 5); flash.material.opacity = f * 0.9;
      st.gap = lerp(st.gap, 1.4, Math.min(1, dt * 4));
      cas.position.y = lerp(cas.position.y, 3.5, Math.min(1, dt * 1.5)); cas.position.z = lerp(cas.position.z, 2, Math.min(1, dt * 1.5));
      for (let i = 0; i < st.seq.length; i++) st.unzip[i] = lerp(st.unzip[i], 0, Math.min(1, dt * 2));
      if (st.t > 1.4) { st.phase = 'choose'; st.t = 0; cas.visible = false; ui.editor(stateForUi()); }
    } else if (st.phase === 'repair') {
      if (st.t > 0.4 && !st.applied) {
        st.applied = true;
        const at = st.cutAt + 1;
        if (st.outcome === 'knock-in') {
          // the template's glow gene, condensed to a short stretch so it fits on screen
          const ins = 'ATGGTGAGCAAGGGCGAG'.split('');
          st.seq.splice(at, 0, ...ins); st.marks.splice(at, 0, ...ins.map(() => 1)); st.unzip.splice(at, 0, ...ins.map(() => 0.8));
          st.insertN = ins.length;
          st.gap = st.gap - ins.length * RISE;       // the new letters fill the gap they slide into
        } else {
          // patched: a small random insertion or deletion at the break
          if (Math.random() < 0.65) { const d = 1 + ((Math.random() * 4) | 0); st.seq.splice(at, d); st.marks.splice(at, d); st.unzip.splice(at, d); st.gap += d * RISE; st.marks[at - 1] = 2; if (st.marks[at] !== undefined) st.marks[at] = 2; st.indel = -d; }
          else { const b = 'ATGC'[(Math.random() * 4) | 0]; st.seq.splice(at, 0, b); st.marks.splice(at, 0, 2); st.unzip.splice(at, 0, 0.6); st.gap -= RISE; st.indel = 1; }
        }
        ui.editor(stateForUi()); ui.sfx && ui.sfx(st.outcome === 'knock-in' ? 'glow' : 'patch');
      }
      st.gap = lerp(st.gap, 0, Math.min(1, dt * 2.2));
      for (let i = 0; i < st.seq.length; i++) st.unzip[i] = lerp(st.unzip[i], 0, Math.min(1, dt * 2));
      if (st.t > 2.2) { st.gap = 0; st.cutAt = -1; st.phase = 'done'; ui.editor(stateForUi()); }
    }
  }

  // ---------- wheel / touch / keys drive the dive ----------
  function nudge(d) {
    if (!st.open) return;
    // once the edit has begun we stay at the helix until it's done
    if (st.leaving) return;
    const locked = !['pick', 'done'].includes(st.phase);
    st.p = clamp(st.p + d, locked ? 1 : -0.08, 1);
    if (st.p < -0.05) api.close();
  }
  canvas.parentElement.addEventListener('wheel', e => { if (!st.open) return; e.preventDefault(); nudge(e.deltaY * 0.00055); }, { passive: false });
  let touchY = null;
  canvas.addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchmove', e => { if (touchY === null) return; const y = e.touches[0].clientY; nudge((touchY - y) * 0.0022); touchY = y; }, { passive: true });
  addEventListener('keydown', e => {
    if (!st.open) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { nudge(0.06); e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { nudge(-0.06); e.preventDefault(); }
    if (st.p > 0.97 && st.phase === 'pick') {
      if (e.key === 'ArrowLeft') { moveWindow(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { moveWindow(1); e.preventDefault(); }
      if (e.key === 'Enter') sendCas9();
    }
    if (e.key === 'Escape') api.close();
  });

  const api = {
    get isOpen() { return st.open; },
    get phase() { return st.phase; },
    open(cell) {
      st.cell = cell;
      const saved = cell.genome;
      setSeq(saved ? [...saved.seq] : sequenceFor(cell.id), saved ? [...saved.marks] : null);
      st.win = firstValid(); st.phase = saved ? 'done' : 'pick'; st.cutAt = -1; st.gap = 0; st.outcome = saved ? saved.outcome : null; st.applied = false;
      st.p = 0; st.shown = 0; st.open = true; st.leaving = false; levelShown = -1;
      cas.visible = false; flash.material.opacity = 0;
      fit(); layoutHelix();
      camera.position.set(0, 0, 3.2);
      ui.editor(stateForUi());
      last = performance.now(); if (!raf) raf = requestAnimationFrame(frame);
    },
    close() {
      if (!st.open) return;
      // fly back out through every level first, then hand back to the dish
      if (st.shown > 0.06 && !st.leaving) { st.leaving = true; st.p = 0; return; }
      st.open = false; st.leaving = false;
      const result = st.phase === 'done' && st.outcome ? { seq: st.seq, marks: st.marks, outcome: st.outcome } : null;
      ui.closed(st.cell, result);
    },
    to(p) { st.p = clamp(p, 0, 1); },
    moveWindow, setWindow, sendCas9, repair,
    reset() { if (!st.cell) return; st.cell.genome = null; this.open(st.cell); st.p = 1; st.shown = 1; },
    state: st,
  };
  return api;
}
