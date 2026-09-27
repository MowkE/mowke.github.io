// bio.js
// A dish of cells that run a real (sped up) cell cycle.
//
// Every cell is a metaball in one marching-cubes field, so touching
// membranes merge and a dividing cell pinches in the middle. Each cell
// walks through G1, S (its nucleus swells as DNA doubles), G2, then
// mitosis: the nuclear envelope dissolves (prophase), chromosomes line
// up on the plate with a spindle reaching from both poles (metaphase),
// sister chromatids are pulled apart as the cell stretches (anaphase),
// and two nuclei reform as the membrane pinches through (telophase).
// Then there are two cells, one generation deeper. Mitochondria wander
// the cytoplasm, the oldest cells die off when the dish is full, and
// you can click any cell to follow it.

import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MAX = 22, START = 13, STR = 0.3, ISO = 80, SUB = 12, SCALE = 4.2;
const R = Math.sqrt(STR / (ISO + SUB));        // grown cell radius, field units
const PHASES = [['G1', 0], ['S', 0.34], ['G2', 0.56], ['M', 0.68]];
const CHROMO = 8, MITO = 5, VES = 5;

export function initDish(canvas, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const camTarget = new THREE.Vector3(0, 0, 0), camGoal = new THREE.Vector3();
  let camDist = 11, camDistGoal = 11;

  scene.add(new THREE.AmbientLight(0xffc4d8, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 6); scene.add(key);
  const rim = new THREE.PointLight(0xff3d82, 40, 30); rim.position.set(-4, -2, 3); scene.add(rim);

  // ── materials, retuned per microscope mode ──────────────────────
  const membrane = new THREE.MeshPhysicalMaterial({
    color: 0xff8fb5, roughness: 0.15, transparent: true, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.7, iridescenceIOR: 1.3,
    emissive: 0x5a0f2c, sheen: 1, sheenColor: new THREE.Color(0xffc6da),
  });
  const rimU = { lo: { value: 0.14 }, hi: { value: 0.92 } };
  membrane.onBeforeCompile = sh => {
    sh.uniforms.uLo = rimU.lo; sh.uniforms.uHi = rimU.hi;
    sh.fragmentShader = 'uniform float uLo, uHi;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.a = mix(uLo, uHi, pow(rimK, 1.7));`);
  };
  const field = new MarchingCubes(68, membrane, true, false, 110000);
  field.isolation = ISO; field.scale.setScalar(SCALE);
  scene.add(field);

  const M = {
    nucleus: new THREE.MeshStandardMaterial({ color: 0x7a2cc4, roughness: 0.4, emissive: 0x2c0a55 }),
    nucleolus: new THREE.MeshStandardMaterial({ color: 0x3a0f6e, roughness: 0.5, emissive: 0x16042e }),
    chromo: new THREE.MeshStandardMaterial({ color: 0xb28cff, roughness: 0.35, emissive: 0x4a1d9a }),
    mito: new THREE.MeshStandardMaterial({ color: 0xff9a4d, roughness: 0.45, emissive: 0x5a2206 }),
    ves: new THREE.MeshBasicMaterial({ color: 0xffe07a }),
  };
  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; scene.add(m); return m; };
  const nuclei = inst(new THREE.SphereGeometry(0.19, 28, 18), M.nucleus, MAX * 2);
  const nucleoli = inst(new THREE.SphereGeometry(0.065, 14, 10), M.nucleolus, MAX * 2);
  const chromos = inst(new THREE.CapsuleGeometry(0.022, 0.1, 4, 8), M.chromo, MAX * CHROMO);
  const mitos = inst(new THREE.CapsuleGeometry(0.03, 0.11, 4, 8), M.mito, MAX * 2 * MITO);
  const vesicles = inst(new THREE.SphereGeometry(0.035, 8, 6), M.ves, MAX * 2 * VES);

  const spindleGeo = new THREE.BufferGeometry();
  const spindlePos = new Float32Array(MAX * CHROMO * 2 * 3);
  spindleGeo.setAttribute('position', new THREE.BufferAttribute(spindlePos, 3));
  const spindleMat = new THREE.LineBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 0.5 });
  const spindle = new THREE.LineSegments(spindleGeo, spindleMat); spindle.frustumCulled = false; scene.add(spindle);

  // the dish around them: drifting particulate and a few matrix fibers
  const dust = new THREE.BufferGeometry();
  const dustN = 1400, dp = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dp[i * 3] = (Math.random() - 0.5) * 22; dp[i * 3 + 1] = (Math.random() - 0.5) * 14; dp[i * 3 + 2] = -6 + Math.random() * 7; }
  dust.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xff8fb5, size: 0.035, transparent: true, opacity: 0.45, depthWrite: false });
  scene.add(new THREE.Points(dust, dustMat));
  const fiberMat = new THREE.MeshBasicMaterial({ color: 0xff4f8a, transparent: true, opacity: 0.08, depthWrite: false });
  for (let f = 0; f < 9; f++) {
    const pts = []; let x = -12, y = (Math.random() - 0.5) * 12;
    for (let k = 0; k < 7; k++) { pts.push(new THREE.Vector3(x, y, -3.5 - Math.random() * 2.5)); x += 4; y += (Math.random() - 0.5) * 4; }
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.03 + Math.random() * 0.05, 6), fiberMat));
  }

  // ── cells ───────────────────────────────────────────────────────
  let nextId = 1, divisions = 0, selected = null;
  const cells = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function makeCell(x, y, z, o = {}) {
    const c = {
      id: nextId++, gen: o.gen ?? 0, parent: o.parent ?? null,
      x, y, z, vx: 0, vy: 0, vz: 0, s: o.s ?? 1, born: performance.now(),
      len: rnd(15, 24), t: 0, dir: [1, 0], dying: false, mStarted: false,
      phase: Math.random() * 6.28, sep: 0,
      chromo: Array.from({ length: CHROMO / 2 }, () => [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(0, 6.28)]),
      mito: Array.from({ length: MITO }, () => [rnd(0, 6.28), rnd(0.45, 0.85), rnd(-0.4, 0.4), rnd(0.2, 0.6), rnd(0, 6.28)]),
      ves: Array.from({ length: VES }, () => [rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.3, 0.3)]),
    };
    cells.push(c);
    return c;
  }
  for (let i = 0; i < START; i++) {
    const c = makeCell(rnd(0.2, 0.8), rnd(0.2, 0.8), rnd(0.44, 0.56));
    c.t = rnd(0, c.len * 0.95);
  }

  const phaseOf = c => {
    const f = c.t / c.len;
    let name = 'G1'; for (const [n, at] of PHASES) if (f >= at) name = n;
    if (c.dying) name = 'apoptosis';
    return { name, f, m: Math.max(0, (f - 0.68) / 0.32) };
  };
  const MNAME = m => m < 0.28 ? 'prophase' : m < 0.52 ? 'metaphase' : m < 0.78 ? 'anaphase' : 'telophase';

  function split(c) {
    const off = c.sep * 0.5, [dx, dy] = c.dir;
    const b = makeCell(c.x - dx * off, c.y - dy * off, c.z, { gen: c.gen + 1, parent: c.id, s: 0.62 });
    const a = makeCell(c.x + dx * off, c.y + dy * off, c.z, { gen: c.gen + 1, parent: c.id, s: 0.62 });
    a.push = [dx, dy, 1.2]; b.push = [-dx, -dy, 1.2];
    a.sib = b; b.sib = a;
    cells.splice(cells.indexOf(c), 1);
    divisions++;
    const live = cells.filter(x => !x.dying);
    if (live.length > MAX) live.sort((p, q) => p.born - q.born)[0].dying = true;
    if (selected === c) select(a);
  }

  // ── pointer: push, click to inspect, double-click to seed ───────
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  const cursor = { x: 0, y: 0, on: false };
  const host = canvas.parentElement;
  const wpos = c => new THREE.Vector3((c.x * 2 - 1) * SCALE, (c.y * 2 - 1) * SCALE, (c.z * 2 - 1) * SCALE);
  function toField(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return [(hit.x / SCALE + 1) / 2, (hit.y / SCALE + 1) / 2];
  }
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    let best = null, bd = 1e9;
    const pxPerUnit = r.height / (2 * camDist * Math.tan(THREE.MathUtils.degToRad(17.5)));
    for (const c of cells) {
      if (c.dying) continue;
      const p = wpos(c).project(camera);
      const sx = (p.x + 1) / 2 * r.width + r.left, sy = (1 - p.y) / 2 * r.height + r.top;
      const d = Math.hypot(e.clientX - sx, e.clientY - sy);
      const rad = R * 2 * SCALE * c.s * pxPerUnit * 1.2;
      if (d < Math.max(rad, 18) && d < bd) { bd = d; best = c; }
    }
    return best;
  }
  host.addEventListener('pointermove', e => { const p = toField(e); if (p) { [cursor.x, cursor.y] = p; cursor.on = true; } });
  host.addEventListener('pointerleave', () => { cursor.on = false; });
  let clickTimer = null;
  host.addEventListener('click', e => {
    if (e.target.closest('a, button, .panel')) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => select(pick(e)), 230);
  });
  host.addEventListener('dblclick', e => {
    if (e.target.closest('a, button, .panel')) return;
    clearTimeout(clickTimer);
    const p = toField(e); if (!p) return;
    const c = makeCell(p[0], p[1], 0.5, { s: 0.15 });
    c.t = c.len * 0.3;
    const live = cells.filter(x => !x.dying);
    if (live.length > MAX) live.sort((a, b) => a.born - b.born)[0].dying = true;
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') select(null); });

  function select(c) {
    selected = c || null;
    ui.panel.classList.toggle('open', !!selected);
    camDistGoal = selected ? 4.6 : 11;
  }

  // ── microscope modes ────────────────────────────────────────────
  const MODES = {
    live: { mem: [0xff8fb5, 0x5a0f2c], lo: 0.14, hi: 0.92, nuc: [0x7a2cc4, 0x2c0a55], nol: 0x3a0f6e, chr: [0xb28cff, 0x4a1d9a], mito: [0xff9a4d, 0x5a2206], ves: 0xffe07a, dust: 0xff8fb5, spin: 0xd8e8ff, fib: [0xff4f8a, 0.08], env: 1, key: 2.2, rim: 40 },
    stained: { mem: [0xf2a0bf, 0x3a1020], lo: 0.5, hi: 0.95, nuc: [0x3b1f7a, 0x000000], nol: 0x1a0a3a, chr: [0x2a1260, 0x000000], mito: [0xd66a9a, 0x200010], ves: 0xb0406a, dust: 0xc76a90, spin: 0x6a4a8a, fib: [0xd07a9a, 0.2], env: 0.8, key: 2.2, rim: 10 },
    fluor: { mem: [0x220508, 0xff2244], lo: 0.02, hi: 0.95, nuc: [0x0a1a55, 0x2f6bff], nol: 0x0a2acc, chr: [0x88b4ff, 0x4f8cff], mito: [0x0a3a10, 0x3dff5a], ves: 0xff3860, dust: 0x3355ff, spin: 0xffffff, fib: [0x3355ff, 0.08], env: 0.15, key: 0.3, rim: 4 },
  };
  function setMode(name) {
    const m = MODES[name];
    membrane.color.set(m.mem[0]); membrane.emissive.set(m.mem[1]);
    rimU.lo.value = m.lo; rimU.hi.value = m.hi;
    M.nucleus.color.set(m.nuc[0]); M.nucleus.emissive.set(m.nuc[1]);
    M.nucleolus.color.set(m.nol);
    M.chromo.color.set(m.chr[0]); M.chromo.emissive.set(m.chr[1]);
    M.mito.color.set(m.mito[0]); M.mito.emissive.set(m.mito[1]);
    M.ves.color.set(m.ves); dustMat.color.set(m.dust); spindleMat.color.set(m.spin);
    fiberMat.color.set(m.fib[0]); fiberMat.opacity = m.fib[1];
    scene.environmentIntensity = m.env; key.intensity = m.key; rim.intensity = m.rim;
    ui.setBg(name);
  }

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit); fit();

  // ── simulation ──────────────────────────────────────────────────
  function step(dt, t) {
    for (const c of [...cells]) {
      if (!c.dying) {
        c.t += dt;
        c.s += (1 - c.s) * Math.min(1, dt * 0.5);
        const { m } = phaseOf(c);
        if (m > 0 && !c.mStarted) { const a = Math.random() * 6.28; c.dir = [Math.cos(a), Math.sin(a)]; c.mStarted = true; }
        c.sep = m > 0.55 ? THREE.MathUtils.smoothstep(m, 0.55, 1) * R * 1.35 : 0;
        if (c.t >= c.len) { split(c); continue; }
      } else c.s -= dt * 0.35;
      c.vx += (Math.sin(t * 0.7 + c.phase) * 0.01 + (Math.random() - 0.5) * 0.016) * dt;
      c.vy += (Math.cos(t * 0.6 + c.phase * 1.3) * 0.01 + (Math.random() - 0.5) * 0.016) * dt;
      c.vz += (0.5 - c.z) * 0.8 * dt;
      if (c.push) { c.vx += c.push[0] * 0.07 * dt; c.vy += c.push[1] * 0.07 * dt; c.push[2] -= dt; if (c.push[2] <= 0) c.push = null; }
      if (cursor.on && !selected) {
        const dx = c.x - cursor.x, dy = c.y - cursor.y, d = Math.hypot(dx, dy) || 1e-4;
        if (d < 0.14) { const f = (0.14 - d) * 1.4 * dt / d; c.vx += dx * f; c.vy += dy * f; }
      }
      const lo = 0.1, hi = 0.9;
      if (c.x < lo) c.vx += (lo - c.x) * 2 * dt; if (c.x > hi) c.vx -= (c.x - hi) * 2 * dt;
      if (c.y < lo) c.vy += (lo - c.y) * 2 * dt; if (c.y > hi) c.vy -= (c.y - hi) * 2 * dt;
    }
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const c = cells[i], o = cells[j];
      if (c.sib === o && c.push) continue;
      const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, d = Math.hypot(dx, dy, dz) || 1e-4;
      const want = R * (Math.sqrt(Math.max(c.s, 0)) + Math.sqrt(Math.max(o.s, 0))) * 1.3 + (c.sep + o.sep) * 0.5;
      if (d < want) {
        const f = (want - d) * 5 * dt / d;
        c.vx += dx * f; c.vy += dy * f; c.vz += dz * f; o.vx -= dx * f; o.vy -= dy * f; o.vz -= dz * f;
      }
    }
    const damp = Math.exp(-2.2 * dt);
    for (const c of cells) { c.vx *= damp; c.vy *= damp; c.vz *= damp; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; }
    for (let i = cells.length - 1; i >= 0; i--) if (cells[i].dying && cells[i].s < 0.03) { if (selected === cells[i]) select(null); cells.splice(i, 1); }
  }

  // ── drawing ─────────────────────────────────────────────────────
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), eu = new THREE.Euler();
  const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3();
  const W = fx => (fx * 2 - 1) * SCALE;
  function draw(t) {
    field.reset();
    let n = 0, nl = 0, ch = 0, mi = 0, ve = 0, sp = 0;
    for (const c of cells) {
      const ph = phaseOf(c), s = Math.max(c.s, 0.001), pulse = 1 + 0.035 * Math.sin(t * 1.6 + c.phase);
      const [dx, dy] = c.dir;
      if (c.sep > 0) {
        const h = c.sep * 0.5;
        field.addBall(c.x + dx * h, c.y + dy * h, c.z, s * STR * 0.62 * pulse, SUB);
        field.addBall(c.x - dx * h, c.y - dy * h, c.z, s * STR * 0.62 * pulse, SUB);
        field.addBall(c.x, c.y, c.z, s * STR * 0.25 * (1 - c.sep / (R * 1.35)) + 0.0001, SUB);
      } else {
        field.addBall(c.x, c.y, c.z, s * STR * pulse * (c.dying ? 0.8 : 1), SUB);
        if (c.dying) for (let k = 0; k < 3; k++) {
          const a = t * 2 + k * 2.1 + c.phase;
          field.addBall(c.x + Math.cos(a) * R * 0.9 * s, c.y + Math.sin(a) * R * 0.9 * s, c.z, s * STR * 0.12, SUB);
        }
      }
      const cx = W(c.x), cy = W(c.y), cz = W(c.z), ws = s * SCALE * 2;
      const sepW = c.sep * SCALE * 2;

      // nucleus: swells through S, dissolves in prophase, reforms at both poles in telophase
      let nucA = 1;
      if (ph.name === 'M') nucA = ph.m < 0.28 ? 1 - ph.m / 0.28 : ph.m > 0.8 ? (ph.m - 0.8) / 0.2 : 0;
      const grow = 1 + 0.2 * THREE.MathUtils.smoothstep(ph.f, 0.34, 0.56);
      const poles = ph.name === 'M' && ph.m > 0.8 ? [1, -1] : [0];
      for (const pk of poles) {
        const ns = s * (poles.length > 1 ? 0.8 : grow) * Math.max(nucA, 0.001);
        const nx = cx + dx * pk * sepW * 0.45, ny = cy + dy * pk * sepW * 0.45;
        m4.compose(v.set(nx, ny, cz), q.identity(), sc.setScalar(ns)); nuclei.setMatrixAt(n++, m4);
        m4.compose(v.set(nx + 0.05 * ns, ny + 0.04 * ns, cz + 0.1 * ns), q.identity(), sc.setScalar(ns)); nucleoli.setMatrixAt(nl++, m4);
      }

      // chromosomes and spindle during mitosis
      if (ph.name === 'M' && ph.m > 0.08 && ph.m < 0.9) {
        const perp = [-dy, dx];
        const poleD = R * ws * 0.62;
        const pA = [cx + dx * poleD, cy + dy * poleD], pB = [cx - dx * poleD, cy - dy * poleD];
        const align = THREE.MathUtils.smoothstep(ph.m, 0.18, 0.4);
        const pull = THREE.MathUtils.smoothstep(ph.m, 0.52, 0.8);
        c.chromo.forEach(([rx, ry, rz, ra], k) => {
          const plate = (k / (c.chromo.length - 1) - 0.5) * 0.36 * R * ws * 3;
          const bx = THREE.MathUtils.lerp(rx * 0.3 * R * ws, perp[0] * plate, align);
          const by = THREE.MathUtils.lerp(ry * 0.3 * R * ws, perp[1] * plate, align);
          for (const sgn of [1, -1]) {
            const push = 0.012 + pull * poleD * 0.75;
            const px = cx + bx + dx * sgn * push, py = cy + by + dy * sgn * push;
            eu.set(0, 0, THREE.MathUtils.lerp(ra + t, Math.atan2(dy, dx), align));
            m4.compose(v.set(px, py, cz + rz * 0.05), q.setFromEuler(eu), sc.setScalar(s)); chromos.setMatrixAt(ch++, m4);
            if (align > 0.3) { const pole = sgn > 0 ? pA : pB; spindlePos.set([pole[0], pole[1], cz, px, py, cz], sp * 6); sp++; }
          }
        });
      }

      // mitochondria wander the cytoplasm; vesicles drift
      const lobes = c.sep > 0;
      c.mito.forEach(([a0, rr, zz, spd, rot], k) => {
        const lobe = lobes ? (k % 2 ? 1 : -1) * sepW * 0.5 : 0;
        const a = a0 + t * spd * 0.4;
        const r = rr * R * ws * 0.72 * (lobes ? 0.8 : 1);
        v.set(cx + dx * lobe + Math.cos(a) * r, cy + dy * lobe + Math.sin(a) * r, cz + zz * 0.25 * R * ws);
        axis.set(-Math.sin(a), Math.cos(a), Math.sin(t + rot) * 0.4).normalize();
        q.setFromUnitVectors(up, axis);
        m4.compose(v, q, sc.setScalar(s)); mitos.setMatrixAt(mi++, m4);
      });
      c.ves.forEach(([ox, oy, oz], k) => {
        const a = t * 0.3 + c.phase + k;
        m4.compose(v.set(cx + (ox * Math.cos(a) - oy * Math.sin(a)) * 1.3 * R * ws, cy + (ox * Math.sin(a) + oy * Math.cos(a)) * 1.3 * R * ws, cz + oz * 0.3 * R * ws), q.identity(), sc.setScalar(s));
        vesicles.setMatrixAt(ve++, m4);
      });
    }
    nuclei.count = n; nucleoli.count = nl; chromos.count = ch; mitos.count = mi; vesicles.count = ve;
    for (const im of [nuclei, nucleoli, chromos, mitos, vesicles]) im.instanceMatrix.needsUpdate = true;
    spindleGeo.setDrawRange(0, sp * 2); spindleGeo.attributes.position.needsUpdate = true;
    field.update();

    const p = dust.attributes.position.array;
    for (let i = 0; i < dustN; i++) { p[i * 3] += Math.sin(t * 0.2 + i) * 0.002; p[i * 3 + 1] += 0.0025; if (p[i * 3 + 1] > 7) p[i * 3 + 1] = -7; }
    dust.attributes.position.needsUpdate = true;

    if (selected) camGoal.copy(wpos(selected)); else camGoal.set(0, 0, 0);
    camTarget.lerp(camGoal, 0.08);
    camDist += (camDistGoal - camDist) * 0.06;
    camera.position.set(camTarget.x + Math.sin(t * 0.05) * 0.6, camTarget.y + Math.cos(t * 0.04) * 0.4, camTarget.z + camDist);
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }

  // ── readouts ────────────────────────────────────────────────────
  function readouts() {
    const live = cells.filter(c => !c.dying);
    const counts = { G1: 0, S: 0, G2: 0, M: 0 };
    for (const c of live) counts[phaseOf(c).name]++;
    ui.stats({ n: live.length, maxGen: Math.max(0, ...live.map(c => c.gen)), divisions, counts });
    if (selected) {
      const ph = phaseOf(selected);
      ui.inspect({
        id: selected.id, gen: selected.gen, parent: selected.parent,
        phase: ph.name === 'M' ? `mitosis, ${MNAME(ph.m)}` : ph.name === 'apoptosis' ? 'apoptosis' : { G1: 'G1, growing', S: 'S, copying its DNA', G2: 'G2, checking the copy' }[ph.name],
        f: ph.f, age: (performance.now() - selected.born) / 1000, until: Math.max(0, selected.len * 0.68 - selected.t),
      });
    }
  }

  let active = false, last = performance.now(), uiClock = 0;
  function frame(now) {
    if (!active) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    step(dt, now / 1000);
    draw(now / 1000);
    uiClock += dt; if (uiClock > 0.15) { uiClock = 0; readouts(); }
    requestAnimationFrame(frame);
  }
  setMode('live');
  window.__dish = { cells, select, setMode, phaseOf };
  return {
    setMode, select,
    setActive(on) { if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) active = false; },
  };
}
