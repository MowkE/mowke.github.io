// neurons.js
// The dish, rendered: a neural culture under a fluorescence scope.
//
// Neurons are post-mitotic. Each gets a procedurally grown arbor (tapered
// dendrites branching three deep, one long axon with collaterals), glowing
// tips, and action potentials that run down the axon. Neural progenitors are
// smaller bipolar cells running the real cycle from cycle.js: in mitosis they
// round up and retract their processes, the nuclear envelope breaks down,
// chromosomes condense and line up on a spindle between two centrosomes, get
// pulled to the poles, and the cell pinches in two. Under nocodazole there is
// no spindle, so chromosomes stay scattered. A daughter can become a neuron
// and grow its arbor in front of you (neurogenesis).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { newCell, advance, phaseOf, dnaOf, mitoticProgress, measure } from './cycle.js';

const MAX_N = 8, MAX_P = 11;
const NUC = { G1: 0xb48cff, S: 0x55e0ff, G2: 0x7c9bff, M: 0xff8fe0, G0: 0xfff1d6 };
const rnd = (a, b) => a + Math.random() * (b - a);
const ss = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── shaders ──────────────────────────────────────────────────────────
const orbVS = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const somaFS = `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
  void main(){ float rim = 1.-abs(dot(vN,vV)); float glow = .16 + 1.3*pow(rim,2.2); gl_FragColor = vec4(uColor*glow*uOpacity, 1.); }`;
const coreFS = `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV;
  void main(){ float c = pow(abs(dot(vN,vV)),2.5); vec3 col = mix(uColor, vec3(1.), c*.8)*(.5+2.2*c); gl_FragColor = vec4(col*uOpacity, 1.); }`;
const neuriteVS = `attribute float aT; varying float vT; varying vec3 vN; varying vec3 vV;
  void main(){ vT = aT; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const neuriteFS = `uniform vec3 uColor; uniform float uGrow; uniform float uOpacity; varying float vT; varying vec3 vN; varying vec3 vV;
  void main(){ if (vT > uGrow) discard; float core = pow(abs(dot(vN,vV)),1.6);
    float fade = 1. - .5*vT; float tip = smoothstep(uGrow-.03, uGrow, vT)*step(uGrow,.995);
    vec3 col = mix(uColor, vec3(1.), core*.35 + tip) * (.22 + .8*core + 2.*tip);
    gl_FragColor = vec4(col*fade*uOpacity, 1.); }`;
const sparkVS = `attribute float aSize; attribute vec3 aColor; attribute float aPhase; uniform float uTime; uniform float uPx; varying vec3 vC; varying float vA;
  void main(){ vC = aColor; vA = .55 + .45*sin(uTime*2.2 + aPhase); vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = min(aSize*uPx*(70./-mv.z), 90.); gl_Position = projectionMatrix*mv; }`;
const sparkFS = `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord-.5; float d = length(p); if (d>.5) discard; float a = pow(1.-d*2., 2.2)*vA; gl_FragColor = vec4(vC*a, 1.); }`;
const add = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true };

// a tube whose radius tapers from r0 to r1, with arc position written to aT
function taperTube(curve, r0, r1, t0, len, reach, seg = 20, rad = 7) {
  const frames = curve.computeFrenetFrames(seg, false), pos = [], nor = [], at = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, P = curve.getPointAt(u), r = r0 + (r1 - r0) * u, N = frames.normals[i], Bn = frames.binormals[i];
    for (let j = 0; j <= rad; j++) {
      const a = j / rad * Math.PI * 2, cx = Math.cos(a), sy = Math.sin(a);
      const n = new THREE.Vector3(N.x * cx + Bn.x * sy, N.y * cx + Bn.y * sy, N.z * cx + Bn.z * sy);
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r); nor.push(n.x, n.y, n.z); at.push((t0 + u * len) / reach);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  return g;
}

// grow an arbor: returns branches [{curve, r0, t0, len, depth}]
function arbor(kind) {
  const out = [];
  const jitter = (d, k) => d.add(new THREE.Vector3(rnd(-k, k), rnd(-k, k), rnd(-k, k) * 0.45)).normalize();
  function branch(start, dir, length, r, depth, t0, isAxon = false) {
    const pts = [start.clone()], p = start.clone(), d = dir.clone(), n = isAxon ? 16 : 8;
    for (let k = 0; k < n; k++) { jitter(d, isAxon ? 0.18 : 0.34); p.addScaledVector(d, length / n); pts.push(p.clone()); }
    const curve = new THREE.CatmullRomCurve3(pts);
    out.push({ curve, r0: r, r1: r * (depth ? 0.55 : 0.2), t0, len: length, depth, axon: isAxon });
    if (depth <= 0) return;
    const kids = isAxon ? 3 : 1 + ((Math.random() * 2.2) | 0);
    for (let c = 0; c < kids; c++) {
      const f = isAxon ? rnd(0.4, 0.95) : rnd(0.35, 0.9);
      const at = curve.getPointAt(f), tan = curve.getTangentAt(f);
      const nd = jitter(tan.clone(), 1.1).lerp(tan, 0.35).normalize();
      branch(at, nd, length * (isAxon ? 0.28 : rnd(0.5, 0.7)), r * 0.6, depth - 1, t0 + f * length, false);
    }
  }
  const dir = () => { const a = Math.random() * Math.PI * 2; return new THREE.Vector3(Math.cos(a), Math.sin(a), rnd(-0.3, 0.3)).normalize(); };
  if (kind === 'neuron') {
    const prim = 5 + ((Math.random() * 3) | 0);
    for (let i = 0; i < prim; i++) branch(new THREE.Vector3(), dir(), rnd(1.3, 2.3), rnd(0.07, 0.1), 3, 0);
    branch(new THREE.Vector3(), dir(), rnd(7, 11), 0.075, 1, 0, true);
  } else {
    const a = dir();                                       // bipolar progenitor, like radial glia
    branch(new THREE.Vector3(), a, rnd(1.1, 1.8), 0.06, 1, 0);
    branch(new THREE.Vector3(), a.clone().negate(), rnd(0.8, 1.4), 0.055, 1, 0);
  }
  const reach = Math.max(...out.map(b => b.t0 + b.len));
  return { branches: out, reach };
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function initNeurons(canvas, culture, hooks = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03041a);
  scene.fog = new THREE.FogExp2(0x060a2e, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0, 17);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.85, 0.55, 0.32);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const GLOW = glowTexture();
  const uTime = { value: 0 }, uPx = { value: renderer.getPixelRatio() };
  const somaGeo = new THREE.SphereGeometry(1, 40, 28), coreGeo = new THREE.SphereGeometry(1, 28, 20);
  const orb = (fs, color, op = 1) => new THREE.ShaderMaterial({ vertexShader: orbVS, fragmentShader: fs, uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: op } }, ...add });

  // ── the backdrop: bokeh, dust, a far layer of out-of-focus neurons ──
  function sparkles(pts, sizes, colors) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(sizes.map(() => Math.random() * 6.28), 1));
    return new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: sparkVS, fragmentShader: sparkFS, uniforms: { uTime, uPx }, ...add }));
  }
  {
    const P = [], S = [], C = [], pal = [[0.35, 0.55, 1], [0.6, 0.4, 1], [1, 0.62, 0.35], [0.4, 0.85, 1]];
    for (let i = 0; i < 700; i++) {
      const z = rnd(-45, 4); P.push(rnd(-40, 40), rnd(-24, 24), z);
      const big = Math.random() < 0.14; S.push(big ? rnd(6, 16) : rnd(0.6, 1.8));
      const c = pal[(Math.random() * pal.length) | 0], k = big ? 0.06 : 0.55; C.push(c[0] * k, c[1] * k, c[2] * k);
    }
    scene.add(sparkles(P, S, C));
  }

  const agents = [];
  const world = new THREE.Group(); scene.add(world);

  function buildArborMesh(ab, color, opacity) {
    const geos = ab.branches.map(b => taperTube(b.curve, b.r0, b.r1, b.t0, b.len, ab.reach, b.axon ? 60 : 18, 7));
    const mat = new THREE.ShaderMaterial({ vertexShader: neuriteVS, fragmentShader: neuriteFS, uniforms: { uColor: { value: new THREE.Color(color) }, uGrow: { value: 1 }, uOpacity: { value: opacity } }, ...add });
    return new THREE.Mesh(mergeGeometries(geos), mat);
  }
  function tipSparkles(ab, warm) {
    const P = [], S = [], C = [];
    for (const b of ab.branches) {
      if (b.depth === 0) { const p = b.curve.getPointAt(1); P.push(p.x, p.y, p.z); S.push(rnd(1.2, 2.6)); const c = Math.random() < warm ? [1, 0.62, 0.32] : [0.75, 0.88, 1]; C.push(...c); }
      for (let k = 0; k < 2; k++) { const p = b.curve.getPointAt(Math.random()); P.push(p.x, p.y, p.z); S.push(rnd(0.5, 1.1)); C.push(0.7, 0.82, 1); }
    }
    return sparkles(P, S, C);
  }

  function makeNeuron(pos, { far = false, grow = 1 } = {}) {
    const g = new THREE.Group(); g.position.copy(pos); world.add(g);
    const ab = arbor('neuron');
    const col = far ? 0x3f6fff : 0x6aa8ff;
    const arb = buildArborMesh(ab, col, far ? 0.45 : 1); g.add(arb);
    const soma = new THREE.Mesh(somaGeo, orb(somaFS, far ? 0x4a70ff : 0x7fb2ff, far ? 0.5 : 1)); soma.scale.setScalar(0.52); g.add(soma);
    const core = new THREE.Mesh(coreGeo, orb(coreFS, 0xffc98a, far ? 0.4 : 1)); core.scale.setScalar(0.24); g.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: far ? 0x3050c0 : 0x7aa8ff, ...add, opacity: far ? 0.25 : 0.5 })); halo.scale.setScalar(3.4); g.add(halo);
    const tips = tipSparkles(ab, 0.45); g.add(tips);
    const axon = ab.branches.find(b => b.axon);
    const dend = ab.branches.filter(b => b.t0 === 0 && !b.axon);
    const a = { kind: 'neuron', far, g, arb, soma, core, halo, tips, ab, axon, dend, grow, fade: 1, fadeTarget: 1, spikes: [], nextSpike: rnd(0.5, 4), c: newCell(1), born: performance.now() };
    arb.material.uniforms.uGrow.value = grow;
    if (!far) agents.push(a);
    return a;
  }

  // spikes: a bright bead plus a short comet tail riding a curve
  const spikeGeo = new THREE.BufferGeometry(), SPK = 240;
  const spikePos = new Float32Array(SPK * 3), spikeSize = new Float32Array(SPK), spikeCol = new Float32Array(SPK * 3);
  spikeGeo.setAttribute('position', new THREE.BufferAttribute(spikePos, 3));
  spikeGeo.setAttribute('aSize', new THREE.BufferAttribute(spikeSize, 1));
  spikeGeo.setAttribute('aColor', new THREE.BufferAttribute(spikeCol, 3));
  spikeGeo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(SPK).fill(1.57), 1));
  const spikePts = new THREE.Points(spikeGeo, new THREE.ShaderMaterial({ vertexShader: sparkVS, fragmentShader: sparkFS, uniforms: { uTime: { value: 0 }, uPx }, ...add }));
  spikePts.frustumCulled = false; scene.add(spikePts);

  function makeProgenitor(pos, c = newCell(0, Math.random() * 0.9)) {
    const g = new THREE.Group(); g.position.copy(pos); world.add(g);
    const ab = arbor('prog');
    const arb = buildArborMesh(ab, 0x9a7dff, 0.9); g.add(arb);
    const mk = (fs, col, s) => { const m = new THREE.Mesh(fs === somaFS ? somaGeo : coreGeo, orb(fs, col)); m.scale.setScalar(s); g.add(m); return m; };
    const somaA = mk(somaFS, 0x9b7bff, 0.42), somaB = mk(somaFS, 0x9b7bff, 0.42);
    const nucA = mk(coreFS, NUC.G1, 0.2), nucB = mk(coreFS, NUC.G1, 0.2);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x8a6bff, ...add, opacity: 0.75 })); halo.scale.setScalar(2.6); g.add(halo);
    // chromosomes (16 = 8 sister pairs), centrosomes, spindle
    const chrom = sparkles(new Array(48).fill(0), new Array(16).fill(1.5), new Array(48).fill(1)); g.add(chrom);
    const cents = sparkles(new Array(6).fill(0), [2.4, 2.4], [0.5, 0.8, 1, 0.5, 0.8, 1]); g.add(cents);
    const spindle = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(32 * 3), 3)), new THREE.LineBasicMaterial({ color: 0x86b8ff, ...add, opacity: 0.55 }));
    g.add(spindle);
    const ang = Math.random() * Math.PI * 2;
    const a = { kind: 'prog', g, arb, somaA, somaB, nucA, nucB, halo, chrom, cents, spindle, c, axis: new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0),
      scatter: Array.from({ length: 16 }, () => new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-0.6, 0.6)).multiplyScalar(0.16)), fade: 0, fadeTarget: 1, vel: new THREE.Vector3(), born: performance.now() };
    agents.push(a);
    return a;
  }

  // ── seed the field ────────────────────────────────────────────────
  const spot = () => new THREE.Vector3(rnd(-10, 10), rnd(-5.5, 5.5), rnd(-2.5, 1.5));
  function freeSpot(minD = 2.2) {
    for (let k = 0; k < 40; k++) { const p = spot(); if (agents.every(a => a.g.position.distanceTo(p) > minD)) return p; }
    return spot();
  }
  for (let i = 0; i < 6; i++) makeNeuron(new THREE.Vector3(rnd(-26, 26), rnd(-14, 14), rnd(-34, -14)), { far: true });
  for (let i = 0; i < 6; i++) makeNeuron(freeSpot(3.6));
  for (let i = 0; i < 9; i++) makeProgenitor(freeSpot(2.4));

  // ── selection ─────────────────────────────────────────────────────
  let selected = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    let best = null, bd = 40;
    for (const a of agents) {
      if (a.fade < 0.5) continue;
      tmp.setFromMatrixPosition(a.g.matrixWorld).project(camera);
      const x = (tmp.x + 1) / 2 * r.width + r.left, y = (1 - tmp.y) / 2 * r.height + r.top, d = Math.hypot(e.clientX - x, e.clientY - y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  const host = canvas.parentElement;
  host.addEventListener('click', e => { if (e.target.closest('a,button,.panel')) return; selected = pick(e); hooks.onSelect && hooks.onSelect(selected ? describe(selected) : null); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { selected = null; hooks.onSelect && hooks.onSelect(null); } });
  function describe(a) {
    const c = a.c, ph = phaseOf(c), m = measure(c), mp = mitoticProgress(c);
    const sub = mp < 0 ? '' : mp < 0.15 ? 'prophase' : mp < 0.45 ? (culture.tx === 'noco' ? 'prometaphase, arrested' : 'metaphase') : mp < 0.75 ? 'anaphase' : 'telophase';
    return {
      kind: a.kind === 'neuron' ? 'Neuron' : 'Neural progenitor',
      phase: c.dead ? 'apoptotic' : ph + (sub ? `, ${sub}` : ''),
      dna: `${dnaOf(c).toFixed(2)}N`,
      markers: a.kind === 'neuron' ? ['βIII-tubulin+', 'MAP2+', 'Ki-67−', 'EdU−']
        : ['Nestin+', 'SOX2+', m.ki67 > 10 ** 2.75 ? 'Ki-67+' : 'Ki-67−', ph === 'S' ? 'EdU+' : 'EdU−', m.ph3 > 10 ** 3.45 ? 'pH3+' : 'pH3−'],
      event: m,
    };
  }

  // ── layout ────────────────────────────────────────────────────────
  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h; camera.fov = w / h < 1 ? 58 : 42; camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit); fit();
  const mouse = { x: 0, y: 0 };
  host.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width - 0.5; mouse.y = (e.clientY - r.top) / r.height - 0.5; });

  // ── per-frame ─────────────────────────────────────────────────────
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), perp = new THREE.Vector3();
  function updateProg(a, dt, t) {
    const c = a.c;
    const res = advance(c, dt, culture.tx, culture.cycleSec);
    const ph = phaseOf(c), mp = mitoticProgress(c), noco = culture.tx === 'noco';
    if (c.dead) { a.fadeTarget = 0; }
    if (res === 'divide') divide(a);
    // mitotic rounding: processes retract through prophase, regrow in G1
    const grow = mp >= 0 ? 1 - ss(mp, 0, 0.22) : Math.min(1, c.t < 0.2 ? c.t / 0.2 : 1);
    a.arb.material.uniforms.uGrow.value = c.dead ? 0 : grow;
    a.axis.applyAxisAngle(new THREE.Vector3(0, 0, 1), dt * 0.02);
    const ax = a.axis;
    perp.set(-ax.y, ax.x, 0);
    // soma: elongates in anaphase, pinches into two in telophase
    const el = mp >= 0 ? ss(mp, 0.45, 0.75) : 0, split = mp >= 0 ? ss(mp, 0.72, 1) : 0;
    const off = 0.08 + 0.34 * split;
    const base = 0.42 * (1 + 0.08 * (mp >= 0 ? 1 : 0)) * (1 - 0.18 * split) * (c.dead ? 0.8 + 0.1 * Math.sin(t * 9) : 1);
    a.somaA.position.copy(ax).multiplyScalar(el > 0 ? off : 0);
    a.somaB.position.copy(ax).multiplyScalar(-off);
    a.somaA.scale.set(base * (1 + 0.35 * el * (1 - split)), base, base);
    a.somaA.rotation.z = Math.atan2(ax.y, ax.x);
    a.somaB.visible = el > 0.05; a.somaB.scale.setScalar(base);
    // nucleus: swells through S, dissolves in prophase, reforms at both poles in telophase
    const nucCol = NUC[c.dead ? 'M' : ph];
    const env = mp < 0 ? 1 : mp < 0.15 ? 1 - mp / 0.15 : mp > 0.8 ? (mp - 0.8) / 0.2 : 0;
    const swell = 0.2 * (1 + 0.22 * ss(dnaOf(c), 2, 4));
    for (const [n, sgn] of [[a.nucA, 1], [a.nucB, -1]]) {
      n.material.uniforms.uColor.value.set(nucCol);
      n.scale.setScalar(Math.max(0.001, swell * env * (mp > 0.8 ? 0.8 : 1)));
      n.position.copy(ax).multiplyScalar(mp > 0.8 ? sgn * off : 0);
    }
    a.nucB.visible = mp > 0.8;
    a.somaA.material.uniforms.uColor.value.set(mp >= 0 ? 0xc07bff : 0x9b7bff);
    // chromosomes: condense, align on the plate, separate to the poles
    const show = mp >= 0.05 && mp < 0.86 && !c.dead;
    a.chrom.visible = show; a.cents.visible = show && !noco; a.spindle.visible = show && !noco && mp > 0.12;
    if (show) {
      const cp = a.chrom.geometry.attributes.position.array;
      const align = noco ? 0 : ss(mp, 0.14, 0.38), pull = noco ? 0 : ss(mp, 0.45, 0.72);
      for (let k = 0; k < 16; k++) {
        const pair = k >> 1, sgn = k & 1 ? 1 : -1;
        const plateP = v1.copy(perp).multiplyScalar((pair / 7 - 0.5) * 0.46).addScaledVector(ax, sgn * (0.018 + pull * 0.3));
        v2.copy(a.scatter[k]).multiplyScalar(noco ? 1 + 0.15 * Math.sin(t * 3 + k) : 1).lerp(plateP, align);
        cp[k * 3] = v2.x; cp[k * 3 + 1] = v2.y; cp[k * 3 + 2] = v2.z + 0.05;
      }
      a.chrom.geometry.attributes.position.needsUpdate = true;
      const pole = 0.34 + 0.12 * pull, ce = a.cents.geometry.attributes.position.array;
      ce[0] = ax.x * pole; ce[1] = ax.y * pole; ce[2] = 0.05; ce[3] = -ax.x * pole; ce[4] = -ax.y * pole; ce[5] = 0.05;
      a.cents.geometry.attributes.position.needsUpdate = true;
      const sp = a.spindle.geometry.attributes.position.array;
      for (let k = 0; k < 16; k++) {
        const sgn = k & 1 ? 1 : -1;
        sp[k * 6] = ax.x * pole * sgn; sp[k * 6 + 1] = ax.y * pole * sgn; sp[k * 6 + 2] = 0.05;
        sp[k * 6 + 3] = cp[k * 3]; sp[k * 6 + 4] = cp[k * 3 + 1]; sp[k * 6 + 5] = cp[k * 3 + 2];
      }
      a.spindle.geometry.attributes.position.needsUpdate = true;
    }
    a.halo.material.color.set(c.dead ? 0x503060 : mp >= 0 ? 0xc07bff : ph === 'S' ? 0x4fa8ff : 0x8a6bff);
  }

  function divide(a) {
    // one daughter keeps this agent; the other is placed on the far side of the cleavage plane
    const pos = a.g.position.clone().addScaledVector(a.axis, -0.9);
    a.g.position.addScaledVector(a.axis, 0.35);
    a.c.t = 0;
    const neurons = agents.filter(x => x.kind === 'neuron' && x.fadeTarget > 0);
    const progs = agents.filter(x => x.kind === 'prog' && x.fadeTarget > 0);
    if (Math.random() < culture.neuronFrac + 0.2 || progs.length >= MAX_P) {
      // neurogenic division: the daughter exits the cycle and grows an arbor
      if (neurons.length >= MAX_N) neurons.sort((p, q) => p.born - q.born)[0].fadeTarget = 0;
      const n = makeNeuron(pos, { grow: 0 }); n.fade = 0.2;
    } else {
      const d = makeProgenitor(pos, newCell(0, 0)); d.fade = 0.4; d.axis.copy(a.axis);
    }
  }

  let active = false, last = performance.now(), spikeIdx = 0, selT = 0;
  const spikes = [];
  function frame(now) {
    if (!active) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const t = now / 1000; uTime.value = t;
    culture.step(dt);

    for (let i = agents.length - 1; i >= 0; i--) {
      const a = agents[i];
      a.fade += (a.fadeTarget - a.fade) * Math.min(1, dt * 1.2);
      if (a.kind === 'prog') {
        updateProg(a, dt, t);
        if (a.c.dead && a.fade < 0.05) { world.remove(a.g); agents.splice(i, 1); makeProgenitor(freeSpot(2.4), newCell(0, 0)); continue; }
        a.g.position.x += Math.sin(t * 0.3 + i) * 0.0015; a.g.position.y += Math.cos(t * 0.23 + i) * 0.0015;
      } else {
        if (a.grow < 1) { a.grow = Math.min(1, a.grow + dt / 14); a.arb.material.uniforms.uGrow.value = a.grow; }
        a.nextSpike -= dt;
        if (a.nextSpike <= 0 && a.grow > 0.9 && a.fadeTarget > 0) {
          a.nextSpike = rnd(1.2, 5.5) / (culture.tx === 'starve' ? 0.6 : 1);
          // an action potential starts at the axon hillock and runs to the terminals;
          // dendritic inputs arrive toward the soma
          spikes.push({ a, curve: a.axon.curve, u: 0, dir: 1, speed: 0.55 });
          const d = a.dend[(Math.random() * a.dend.length) | 0]; if (d) spikes.push({ a, curve: d.curve, u: 1, dir: -1, speed: 0.8 });
        }
        if (a.fadeTarget === 0 && a.fade < 0.03) { world.remove(a.g); agents.splice(i, 1); continue; }
      }
      // fade via uniforms
      a.g.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.uOpacity) o.material.uniforms.uOpacity.value = (o.userData.base ??= o.material.uniforms.uOpacity.value) * a.fade; if (o.isSprite) o.material.opacity = (o.userData.bs ??= o.material.opacity) * a.fade; });
    }
    // gentle mutual repulsion so newborn cells make room
    for (const a of agents) for (const b of agents) {
      if (a === b) continue;
      const d = a.g.position.distanceTo(b.g.position), want = a.kind === 'neuron' || b.kind === 'neuron' ? 2.4 : 1.25;
      if (d < want && d > 1e-3) a.g.position.addScaledVector(v1.subVectors(a.g.position, b.g.position).normalize(), (want - d) * dt * 0.8);
    }

    // spikes
    let n = 0;
    for (let i = spikes.length - 1; i >= 0; i--) {
      const s = spikes[i]; s.u += s.dir * s.speed * dt * (s.curve === s.a.axon?.curve ? 0.35 : 1);
      if (s.u > 1 || s.u < 0 || !s.a.g.parent) { spikes.splice(i, 1); continue; }
      for (let k = 0; k < 5 && n < SPK; k++) {
        const u = Math.min(1, Math.max(0, s.u - s.dir * k * 0.012));
        s.curve.getPointAt(u, v1); v1.applyMatrix4(s.a.g.matrixWorld);
        spikePos.set([v1.x, v1.y, v1.z], n * 3); spikeSize[n] = k ? 1.4 - k * 0.22 : 2.6;
        spikeCol.set(k ? [1, 0.55, 0.25] : [1, 0.92, 0.75], n * 3); n++;
      }
    }
    spikeGeo.setDrawRange(0, n);
    for (const a of ['position', 'aSize', 'aColor']) spikeGeo.attributes[a].needsUpdate = true;

    // camera drifts and follows the pointer a little; tracks the selected cell
    const tgt = selected && selected.g.parent ? selected.g.position : null;
    const cx = (tgt ? tgt.x * 0.6 : 0) + mouse.x * 1.6 + Math.sin(t * 0.07) * 0.8;
    const cy = (tgt ? tgt.y * 0.6 : 0) - mouse.y * 1.1 + Math.cos(t * 0.05) * 0.5;
    const cz = tgt ? 9.5 : 17;
    camera.position.x += (cx - camera.position.x) * dt * 1.5;
    camera.position.y += (cy - camera.position.y) * dt * 1.5;
    camera.position.z += (cz - camera.position.z) * dt * 1.2;
    camera.lookAt(camera.position.x * 0.6, camera.position.y * 0.6, -4);

    if (selected) {
      selT += dt;
      if (!selected.g.parent) { selected = null; hooks.onSelect && hooks.onSelect(null); }
      else if (selT > 0.3) { selT = 0; hooks.onSelect && hooks.onSelect(describe(selected)); }
      if (selected) { tmp.setFromMatrixPosition(selected.g.matrixWorld).project(camera); hooks.onPlace && hooks.onPlace((tmp.x + 1) / 2, (1 - tmp.y) / 2); }
    }
    hooks.onCount && hooks.onCount(agents.filter(a => a.kind === 'neuron' && a.fadeTarget > 0).length, agents.filter(a => a.kind === 'prog' && a.fadeTarget > 0).length);
    composer.render();
    requestAnimationFrame(frame);
  }

  window.__neurons = { agents, culture };
  return { setActive(on) { if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) active = false; } };
}
