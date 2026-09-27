// robot.js
// HighTide, FRC 4414's 2026 robot, as a scroll film and then a toy.
//
// Scrolling plays a shot list: each subsystem gets its own camera move,
// flies in part by part over a teal blueprint of the finished robot,
// lights its edges, pins labels to the real parts, and starts moving
// (wheels steer, rollers spin, the rotor indexes, the turret aims, the
// flywheels spool). At the end you can pull the robot apart with the
// exploded-view slider, or take it for a drive with field-oriented
// swerve controls. The geometry is a stand-in built from primitives in
// team colors, not the team's CAD.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const STAGES = [
  { name: 'Drivetrain', note: 'Four swerve modules on a square frame. Each wheel steers and drives on its own, so the robot can move any direction while facing any other.',
    cam: [0.2, 0.95, 64, [0, 3, 0]],
    callouts: [[[10.3, 2.2, 10.3], 'swerve module ×4'], [[0, 2.1, -4], 'belly pan'], [[-6, 5.6, 6], 'battery']] },
  { name: 'Bumpers', note: 'Team orange with the number on both sides. They wrap the frame and take the hits.',
    cam: [1.25, 0.32, 78, [0, 4, 0]],
    callouts: [[[17.9, 3.7, 0], '4414, both sides'], [[0, 6.2, 17.4], 'bumper wrap']] },
  { name: 'Dye rotor', note: 'The spinning floor of the hopper. It turns to index game pieces toward the shooter.',
    cam: [2.35, 1.08, 58, [0, 8, 0]],
    callouts: [[[0, 8.4, 0], 'rotor hub'], [[9, 9.5, 3], 'indexing paddles'], [[-13, 17, 0], 'polycarbonate walls']] },
  { name: 'Intake', note: 'A roller bed out front that pulls pieces off the carpet and feeds them in.',
    cam: [6.65, 0.28, 66, [0, 6, 14]],
    callouts: [[[0, 3.4, 22.6], 'lower roller'], [[12.6, 6.2, 17.5], 'intake arm'], [[10.4, 10.2, 12.6], 'roller motor']] },
  { name: 'Turret', note: 'A ring gear under a teal truss. The shooter can aim without the robot turning.',
    cam: [8.9, 0.5, 70, [2, 18, -3]],
    callouts: [[[9.6, 20.5, -3], 'ring gear'], [[13.2, 22, 4], 'teal truss'], [[2, 17, -3], 'turret hub']] },
  { name: 'Shooter', note: 'Flywheels under a curved hood, riding the turret. Spin up, aim, fire.',
    cam: [9.9, 0.42, 52, [2, 25, -3]],
    callouts: [[[2.4, 27.1, -3], 'flywheel'], [[5.5, 28.5, -3], 'hood'], [[2.4, 27.1, 2.4], 'flywheel motor']] },
  { name: 'HighTide', note: 'All six subsystems. Pull it apart, or take it for a drive.',
    cam: [11.4, 0.5, 108, [0, 12, 0]], callouts: [] },
];
const INTRO = [-0.9, 0.55, 120, [0, 11, 0]];
// scroll fraction where each stage begins; each gets a build window then a hold
const START = [0.04, 0.17, 0.3, 0.43, 0.56, 0.69, 0.84];
const BUILD = 0.075;

export function initRobot(canvas, track, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  let mode = 'film';
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4c6, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 60, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
  scene.add(sun, sun.target);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // the practice field, which appears when you drive
  const field = new THREE.Group(); field.visible = false; scene.add(field);
  const grid = new THREE.GridHelper(480, 40, 0x2e8a8f, 0xb9b4a6); grid.material.transparent = true; grid.material.opacity = 0.5; field.add(grid);
  const tape = (x, z, w, d, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); field.add(m); };
  tape(0, -140, 240, 2, 0xc8502b); tape(0, 140, 240, 2, 0x2e8a8f); tape(-120, 0, 2, 280, 0x999999); tape(120, 0, 2, 280, 0x999999);
  const pieces = [];
  for (let i = 0; i < 14; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(2.9, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf2c14b, roughness: 0.6 }));
    p.position.set((Math.random() - 0.5) * 200, 2.9, (Math.random() - 0.5) * 220); p.castShadow = true; field.add(p); pieces.push(p);
  }

  // ── materials ───────────────────────────────────────────────────
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...o });
  const M = {
    teal: std(0x2e8a8f, { roughness: 0.4, metalness: 0.35 }), orange: std(0xc8502b, { roughness: 0.62 }),
    plate: std(0x2b2d31, { roughness: 0.5, metalness: 0.4 }), carbon: std(0x1b1c1f, { roughness: 0.35, metalness: 0.2 }),
    poly: new THREE.MeshPhysicalMaterial({ color: 0x3a3d44, transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    silver: std(0xbfc3c8, { roughness: 0.3, metalness: 0.85 }), roller: std(0xe9e7e0, { roughness: 0.6 }),
    tread: std(0x2a2a2a, { roughness: 0.9 }), red: std(0xc73a2a, { roughness: 0.45 }), gold: std(0xc9a14a, { roughness: 0.35, metalness: 0.7 }),
  };
  const edgeMats = STAGES.map(() => new THREE.LineBasicMaterial({ color: 0x0e0f11, transparent: true, opacity: 0.5 }));
  let curEdge = edgeMats[0];
  function part(group, geo, mat, [x, y, z], [rx, ry, rz] = [0, 0, 0], edges = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = mat !== M.poly; m.receiveShadow = true;
    if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), curEdge));
    group.add(m);
    return m;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s = 28) => new THREE.CylinderGeometry(r, r, h, s);

  const drive = new THREE.Group(); scene.add(drive);      // moves in drive mode
  const robot = new THREE.Group(); drive.add(robot);
  const stages = [];
  function stage(i, offset, parent = robot) {
    const g = new THREE.Group(); g.userData.offset = new THREE.Vector3(...offset);
    parent.add(g); stages[i] = g; curEdge = edgeMats[i];
    return g;
  }
  const moving = { modules: [], wheels: [], rollers: [], flywheels: [] };

  // 0 drivetrain
  const dt = stage(0, [0, -30, 0]);
  const F = 13.5;
  for (const s of [-1, 1]) {
    part(dt, box(27, 2, 1), M.teal, [0, 3, s * F]);
    part(dt, box(1, 2, 27), M.teal, [s * F, 3, 0]);
    part(dt, box(25, 1, 0.8), M.teal, [0, 3.2, s * 4]);
  }
  part(dt, box(26, 0.25, 26), M.plate, [0, 2, 0]);
  part(dt, box(6.5, 3.5, 3), M.carbon, [-6, 3.9, 6]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const mod = new THREE.Group(); mod.position.set(sx * (F - 3.2), 0, sz * (F - 3.2)); dt.add(mod);
    part(mod, cyl(3.4, 0.4, 32), M.plate, [0, 4.4, 0]);
    const steer = new THREE.Group(); mod.add(steer);
    const wheel = new THREE.Group(); wheel.position.y = 2; wheel.rotation.z = Math.PI / 2; steer.add(wheel);
    part(wheel, cyl(1.95, 1.5, 28), M.tread, [0, 0, 0]);
    part(wheel, cyl(1.1, 1.6, 6), M.silver, [0, 0, 0]);
    part(steer, box(0.4, 3, 3.2), M.plate, [0.95, 3, 0]);
    part(mod, cyl(1.05, 3.2, 20), M.silver, [1.2 * sx, 6.2, -1.2 * sz]);
    part(mod, cyl(1.05, 2.6, 20), M.silver, [-1.2 * sx, 5.9, 1.2 * sz]);
    moving.modules.push(steer); moving.wheels.push(wheel);
  }

  // 1 bumpers
  const bp = stage(1, [0, 0, 42]);
  {
    const rr = (w, r) => {
      const s = new THREE.Shape(), h = w / 2;
      s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r); s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h);
      s.lineTo(-h + r, h); s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
      return s;
    };
    const shape = rr(34.5, 3.6); shape.holes.push(new THREE.Path(rr(27.4, 0.6).getPoints(24)));
    part(bp, new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 3, curveSegments: 16 }), M.orange, [0, 1.2, 0], [-Math.PI / 2, 0, 0]);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.font = 'italic 800 104px Anybody, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e9e6de'; g.fillText('4414', 256, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const numMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), numMat); p.position.set(s * 17.83, 3.7, 0); p.rotation.y = s * Math.PI / 2; bp.add(p); }
  }

  // 2 dye rotor + hopper
  const rt = stage(2, [0, 34, 0]);
  const rotor = new THREE.Group(); rotor.position.set(0, 7.5, 0); rt.add(rotor);
  part(rotor, new THREE.TorusGeometry(11, 0.45, 12, 72), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  part(rotor, new THREE.TorusGeometry(6.5, 0.3, 10, 56), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  part(rotor, cyl(1.8, 1.2, 24), M.silver, [0, 0.2, 0]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    part(rotor, box(10.5, 0.5, 0.6), M.plate, [Math.cos(a) * 5.6, 0, Math.sin(a) * 5.6], [0, -a, 0]);
    part(rotor, box(0.4, 2.6, 3.2), M.carbon, [Math.cos(a + 0.3) * 9, 1.4, Math.sin(a + 0.3) * 9], [0, -a - 0.3, 0]);
  }
  part(rt, box(26, 13, 0.2), M.poly, [0, 14.5, -13]);
  part(rt, box(0.2, 13, 26), M.poly, [-13, 14.5, 0]);
  part(rt, box(0.2, 13, 26), M.poly, [13, 14.5, 0]);
  part(rt, box(4.5, 15, 0.35), M.carbon, [-8.5, 13.5, 13.2]);
  part(rt, box(4.5, 15, 0.35), M.carbon, [9.5, 13.5, 13.2]);

  // 3 intake
  const it = stage(3, [0, 6, 44]);
  for (const s of [-1, 1]) {
    part(it, box(0.5, 3.4, 11), M.carbon, [s * 12.6, 6.2, 17.5], [-0.28, 0, 0]);
    part(it, cyl(1.3, 1, 20), M.gold, [s * 13.2, 7.4, 13], [0, 0, Math.PI / 2]);
  }
  for (const [y, z, r] of [[7.8, 13.2, 1.25], [5.4, 18.4, 1.1], [3.4, 22.6, 1.05]]) {
    const holder = new THREE.Group(); holder.position.set(0, y, z); it.add(holder);
    const roll = part(holder, cyl(r, 24.6, 10), M.roller, [0, 0, 0], [0, 0, Math.PI / 2]);
    moving.rollers.push(roll);
  }
  part(it, cyl(0.35, 24.6, 12), M.red, [0, 9.6, 12.4], [0, 0, Math.PI / 2]);
  part(it, cyl(1.2, 3.4, 20), M.silver, [10.4, 10.2, 12.6], [0, 0, Math.PI / 2]);

  // 4 turret + teal truss
  const tr = stage(4, [-42, 10, 0]);
  const T = new THREE.Vector3(2, 20.5, -3);
  part(tr, new THREE.TorusGeometry(7.6, 0.55, 12, 64), M.carbon, [T.x, T.y, T.z], [Math.PI / 2, 0, 0]);
  part(tr, cyl(3.3, 6, 24), M.plate, [T.x, T.y - 3.5, T.z]);
  const teeth = new THREE.Group(); teeth.position.copy(T); tr.add(teeth);
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; part(teeth, box(0.7, 0.9, 0.5), M.plate, [Math.cos(a) * 8.3, 0, Math.sin(a) * 8.3], [0, -a, 0], false); }
  const truss = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const g = new THREE.Group(); g.position.set(x0, 0, z0); g.rotation.y = -ang; tr.add(g);
    part(g, box(len, 1, 1), M.teal, [len / 2, 22, 0]); part(g, box(len, 1, 1), M.teal, [len / 2, 18.5, 0]);
    const n = Math.round(len / 3.4);
    for (let i = 0; i < n; i++) part(g, box(0.6, 3.9, 0.6), M.teal, [(i + 0.5) * (len / n), 20.25, 0], [0, 0, i % 2 ? 0.75 : -0.75], false);
    for (const x of [0.5, len - 0.5]) part(g, box(1, 16, 1), M.teal, [x, 12, 0]);
  };
  truss(-13, -13.2, 13, -13.2); truss(13.2, -13, 13.2, 12);

  // 5 shooter on the turret pivot
  const pivot = new THREE.Group(); pivot.position.copy(T); robot.add(pivot);
  const sh = stage(5, [0, 38, 0], pivot);
  part(sh, cyl(7.8, 0.4, 48), M.plate, [0, 0.8, 0]);
  const side = new THREE.Shape(); side.moveTo(-4, 0); side.lineTo(4.5, 0); side.lineTo(2.5, 9); side.lineTo(-2.5, 9); side.lineTo(-4, 0);
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.4, bevelEnabled: false });
  for (const s of [-1, 1]) part(sh, sideGeo, M.carbon, [0, 1, s * 3.6 - 0.2]);
  for (const [x, y, r, mat] of [[0.4, 6.6, 1.9, M.orange], [-1.8, 4, 1.2, M.roller]]) {
    const holder = new THREE.Group(); holder.position.set(x, y, 0); sh.add(holder);
    moving.flywheels.push(part(holder, cyl(r, 7.6, 12), mat, [0, 0, 0], [Math.PI / 2, 0, 0]));
  }
  part(sh, new THREE.CylinderGeometry(4.6, 4.6, 7.2, 32, 1, true, 0, Math.PI * 0.8), M.silver, [0.4, 6.6, 0], [Math.PI / 2, 0, -0.4]);
  part(sh, cyl(1.2, 3.4, 20), M.silver, [0.4, 6.6, 5.4], [Math.PI / 2, 0, 0]);
  part(sh, cyl(1.2, 3.4, 20), M.silver, [-1.8, 4, -5.4], [Math.PI / 2, 0, 0]);

  // blueprint ghost of the finished robot
  const ghost = robot.clone(true);
  const ghostLine = new THREE.LineBasicMaterial({ color: 0x2e8a8f, transparent: true, opacity: 0.18, depthWrite: false });
  ghost.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ visible: false }); o.castShadow = false; } if (o.isLineSegments) o.material = ghostLine; });
  scene.add(ghost);

  // stagger parts within each stage
  for (const g of stages) [...g.children].forEach((k, i, arr) => {
    k.userData.home = k.position.clone();
    k.userData.delay = (i / Math.max(1, arr.length)) * 0.45;
    k.userData.wobble = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
  });

  // ── callouts: HTML labels pinned to 3D points ───────────────────
  const tags = STAGES.map((s, i) => s.callouts.map(([p, text]) => {
    const el = document.createElement('div'); el.className = 'callout';
    el.innerHTML = `<i></i><span></span><b>${text}</b>`;
    ui.layer.appendChild(el);
    return { el, p: new THREE.Vector3(...p), i };
  })).flat();
  const proj = new THREE.Vector3();
  function placeTags(p, s) {
    const r = canvas.getBoundingClientRect();
    for (const t of tags) {
      const show = t.i === s && p > START[s] + BUILD * 0.85 && mode === 'film';
      t.el.classList.toggle('on', show);
      if (!show) continue;
      proj.copy(t.p); robot.localToWorld(proj); proj.project(camera);
      const x = (proj.x + 1) / 2 * r.width, y = (1 - proj.y) / 2 * r.height;
      t.el.style.transform = `translate(${x}px, ${y}px)`;
      t.el.classList.toggle('left', x < r.width * 0.62);
    }
  }

  // ── layout ──────────────────────────────────────────────────────
  let W = 1, H = 1;
  function fit() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H;
    const off = mode === 'drive' ? 0 : 1;
    camera.setViewOffset(W, H, W > 900 ? -W * 0.14 * off : 0, W > 900 ? 0 : -H * 0.06 * off, W, H);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit); fit();

  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const progress = () => { const r = track.getBoundingClientRect(); return clamp(-r.top / (r.height - innerHeight)); };
  ui.buttons.forEach(b => b.addEventListener('click', () => {
    if (mode !== 'film') setMode('film');
    const s = +b.dataset.s;
    const p = START[s] + BUILD + 0.03;
    scrollTo({ top: track.offsetTop + p * (track.offsetHeight - innerHeight), behavior: 'smooth' });
  }));

  // camera keyframes: blend between the shots either side of the scroll
  const keys = [[0, INTRO], ...STAGES.map((s, i) => [START[i] + BUILD * 0.5, s.cam])];
  function shot(p) {
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i][0] && p <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    if (p > keys[keys.length - 1][0]) a = b;
    const u = a === b ? 0 : ease(clamp((p - a[0]) / (b[0] - a[0])));
    const L = (x, y) => x + (y - x) * u;
    return { az: L(a[1][0], b[1][0]), el: L(a[1][1], b[1][1]), d: L(a[1][2], b[1][2]), t: a[1][3].map((v, k) => L(v, b[1][3][k])) };
  }

  // ── end modes: explode and drive ────────────────────────────────
  let explode = 0;
  let fly = 0;
  const keysDown = new Set();
  const car = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, w: 0 };
  function setMode(m) {
    mode = m;
    document.body.classList.toggle('driving', m === 'drive');
    field.visible = m === 'drive';
    if (m !== 'drive') { car.x = car.z = car.yaw = car.vx = car.vz = car.w = 0; }
    fit();
    if (m === 'drive') { score = 0; pieces.forEach(pc => { pc.visible = true; pc.position.set((Math.random() - 0.5) * 200, 2.9, (Math.random() - 0.5) * 220); }); }
    ui.onMode(m); ui.score(score, pieces.length);
  }
  let score = 0;
  ui.explode.addEventListener('input', () => { explode = +ui.explode.value; });
  ui.driveBtn.addEventListener('click', () => setMode(mode === 'drive' ? 'film' : 'drive'));
  addEventListener('keydown', e => {
    if (mode !== 'drive') return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) { keysDown.add(k); e.preventDefault(); }
    if (k === 'escape') setMode('film');
  });
  addEventListener('keyup', e => keysDown.delete(e.key.toLowerCase()));

  // ── loop ────────────────────────────────────────────────────────
  let active = false, last = performance.now(), smooth = 0, shown = -2, spin = 0;
  const cam = { az: INTRO[0], el: INTRO[1], d: INTRO[2], t: new THREE.Vector3(...INTRO[3]) };
  function frame(now) {
    if (!active) return;
    const dts = Math.min((now - last) / 1000, 0.05); last = now;
    const time = now / 1000;
    smooth += (progress() - smooth) * Math.min(1, dts * 6);
    const p = mode === 'film' ? smooth : 1;

    let s = -1; for (let i = 0; i < STAGES.length; i++) if (p >= START[i]) s = i;

    stages.forEach((g, i) => {
      const t = i === 6 ? 1 : clamp((p - START[i]) / BUILD);
      g.visible = t > 0.001;
      for (const k of g.children) {
        const u = ease(clamp((t - k.userData.delay) / 0.55));
        const off = g.userData.offset, w = k.userData.wobble;
        const ex = explode * 0.55;
        k.position.set(k.userData.home.x + (off.x + w.x) * (1 - u) + off.x * ex, k.userData.home.y + (off.y + w.y) * (1 - u) + off.y * ex, k.userData.home.z + (off.z + w.z) * (1 - u) + off.z * ex);
        k.visible = u > 0.001;
      }
      // the stage in focus gets teal edges
      edgeMats[i].color.set(i === s && s < 6 && mode === 'film' ? 0x2e8a8f : 0x0e0f11);
      edgeMats[i].opacity = i === s && s < 6 && mode === 'film' ? 0.95 : 0.5;
    });
    ghostLine.opacity = mode === 'film' ? 0.2 * clamp(1 - (p - 0.02) / 0.7) : 0;
    ghost.visible = ghostLine.opacity > 0.005;

    // mechanisms, each starting once its stage is built
    const built = i => p >= START[i] + BUILD;
    let driveV = 0, steer = 0;
    if (mode === 'drive') {
      const fwd = (keysDown.has('w') || keysDown.has('arrowup') ? 1 : 0) - (keysDown.has('s') || keysDown.has('arrowdown') ? 1 : 0);
      const str = (keysDown.has('d') || keysDown.has('arrowright') ? 1 : 0) - (keysDown.has('a') || keysDown.has('arrowleft') ? 1 : 0);
      const rot = (keysDown.has('q') ? 1 : 0) - (keysDown.has('e') ? 1 : 0);
      // field oriented: W is always away from the camera's start, whatever way the robot faces
      const SPD = 95;
      car.vx += (str * SPD - car.vx) * Math.min(1, dts * 5);
      car.vz += (-fwd * SPD - car.vz) * Math.min(1, dts * 5);
      car.w += (rot * 2.6 - car.w) * Math.min(1, dts * 6);
      car.x = clamp(car.x + car.vx * dts, -115, 115); car.z = clamp(car.z + car.vz * dts, -135, 135); car.yaw += car.w * dts;
      driveV = Math.hypot(car.vx, car.vz);
      // wheel angle in the robot's frame
      const lx = Math.cos(car.yaw) * car.vx - Math.sin(car.yaw) * car.vz, lz = Math.sin(car.yaw) * car.vx + Math.cos(car.yaw) * car.vz;
      steer = driveV > 2 ? Math.atan2(lx, lz) : 0;
      // the intake is on the robot's front (+z in robot space): drive over a piece to collect it
      const fx = car.x + Math.sin(car.yaw) * 20, fz = car.z + Math.cos(car.yaw) * 20;
      for (const pc of pieces) if (pc.visible && Math.hypot(pc.position.x - fx, pc.position.z - fz) < 9) {
        pc.visible = false; score++; ui.score(score, pieces.length);
        moving.rollers.forEach(r => { r.parent.rotation.x += 3; });
      }
    }
    drive.position.set(car.x, 0, car.z); drive.rotation.y = car.yaw;
    moving.modules.forEach((m, k) => {
      const target = mode === 'drive' ? (driveV > 2 ? steer : (Math.abs(car.w) > 0.1 ? Math.PI / 4 + (k % 3 === 0 ? 0 : Math.PI / 2) : m.rotation.y))
        : (s === 0 ? Math.sin(time * 1.1 + k) * 0.9 : built(0) ? Math.sin(time * 0.4) * 0.3 : 0);
      m.rotation.y += (target - m.rotation.y) * Math.min(1, dts * 8);
    });
    const wheelRate = mode === 'drive' ? (driveV + Math.abs(car.w) * 14) / 1.95 : built(0) ? 2.5 : 0;
    moving.wheels.forEach(w => { w.rotation.x += wheelRate * dts; });
    if (built(2)) rotor.rotation.y += dts * (s === 2 ? 2.2 : 1);
    moving.rollers.forEach((r, k) => { if (built(3)) r.parent.rotation.x += dts * (s === 3 ? 12 : 5) * (k % 2 ? -1 : 1); });
    moving.flywheels.forEach((f, k) => { if (built(5)) f.parent.rotation.z -= dts * (s >= 5 ? 22 : 8) * (k ? -1 : 1); });
    const aim = mode === 'drive' ? Math.atan2(-car.x, -135 - car.z) - car.yaw - Math.PI / 2 : Math.sin(time / 1.4) * 0.9;
    if (built(4)) { pivot.rotation.y += (aim - pivot.rotation.y) * Math.min(1, dts * 3); teeth.rotation.y = pivot.rotation.y; }

    // camera: the shot list, or a chase cam when driving
    if (mode === 'drive') {
      const back = new THREE.Vector3(car.x, 70, car.z + 120);
      camera.position.lerp(back, Math.min(1, dts * 3));
      cam.t.lerp(new THREE.Vector3(car.x, 10, car.z), Math.min(1, dts * 5));
      camera.lookAt(cam.t);
    } else {
      const k = shot(p);
      if (p > 0.95) spin += dts * 0.3; else spin *= 0.95;
      cam.az += (k.az + spin - cam.az) * Math.min(1, dts * 3);
      cam.el += (k.el - cam.el) * Math.min(1, dts * 3);
      cam.d += ((k.d * (W < 700 ? 1.8 : 1)) - cam.d) * Math.min(1, dts * 3);
      cam.t.lerp(new THREE.Vector3(...k.t), Math.min(1, dts * 3));
      camera.position.set(cam.t.x + Math.sin(cam.az) * cam.d * Math.cos(cam.el), cam.t.y + cam.d * Math.sin(cam.el), cam.t.z + Math.cos(cam.az) * cam.d * Math.cos(cam.el));
      camera.lookAt(cam.t);
    }
    sun.target.position.set(car.x, 0, car.z); sun.position.set(car.x + 30, 60, car.z + 25);

    // copy + progress
    if (s !== shown && mode === 'film') {
      shown = s;
      if (s < 0) ui.stage(null); else ui.stage(s);
      ui.buttons.forEach(b => b.classList.toggle('on', +b.dataset.s === s));
    }
    ui.bar.style.width = `${(p * 100).toFixed(2)}%`;
    ui.end.classList.toggle('on', p > 0.9 || mode === 'drive');
    placeTags(p, s);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.__robot = { progress: () => smooth, setMode, car, stages };
  return { setActive(on) { if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) active = false; } };
}
