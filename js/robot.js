// robot.js
// FRC 9470's 2026 robot, built from the team's own Onshape CAD.
//
// The assembly (429 MB of glTF) was compressed offline to ~4 MB: fasteners
// stripped, meshes simplified and meshopt-compressed, hierarchy flattened
// with every part tagged by subsystem and assembly. Here the parts are
// regrouped, then a scroll film builds the robot one subsystem at a time:
// each part flies in, the subsystem's edges light up, labels pin to the
// real named assemblies, and rollers spin about their own axes once built.
// At the end a game piece runs the real path through the robot, and you can
// explode it or take it for a field-oriented swerve drive.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const STAGES = [
  { key: 'DTASSEM', name: 'Drivetrain', note: 'Four SDS MK5n swerve modules. Every wheel steers and drives on its own motors, so the robot moves any direction while facing any other.',
    offset: [0, -34, 0], az: 0.35, el: 0.95, d: 1.0,
    callouts: [[/^SDS MK5n <1>/, 'SDS MK5n swerve ×4'], [/^PDP/, 'power distribution'], [/^OPI MOUNT/, 'Orange Pi coprocessor']] },
  { key: 'INTAKE', name: 'Intake', note: 'A roller bed at the front grabs game pieces off the carpet, driven by two Kraken X60s.',
    offset: [0, 4, 40], az: 0.3, el: 0.3, d: 0.9,
    callouts: [[/roller yoink/, 'intake rollers'], [/Kraken X60 Brushless Motor <1>/, 'Kraken X60']] },
  { key: 'hopprerdcmp', also: 'hopprp walls', name: 'Hopper', note: 'A bank of rollers indexes pieces from the intake back toward the shooter; the walls keep a full load in.',
    offset: [34, 20, 0], az: 2.0, el: 0.7, d: 1.0,
    callouts: [[/^rolex <3>/, 'indexing rollers ×5'], [/Kraken X60/, 'Kraken X60']] },
  { key: 'DRUMASSEM', name: 'Drum shooter', note: 'Feeder rollers hand pieces to the drum, and the hood rollers put spin and speed on the shot.',
    offset: [-36, 26, 0], az: 3.6, el: 0.45, d: 0.85,
    callouts: [[/DRUMROLLER/, 'drum roller'], [/HOODROLLER <1>/, 'hood rollers'], [/FEEDERROLLER-LIVE/, 'feeder roller'], [/Kraken X44/, 'Kraken X44']] },
  { key: null, name: '9470', note: 'All four subsystems. Watch a game piece run the path, pull it apart, or take it for a drive.',
    az: 5.1, el: 0.42, d: 1.05, callouts: [] },
];
const START = [0.05, 0.25, 0.45, 0.65, 0.84];
const BUILD = 0.1;
const S = 40;                                    // metres → scene units (the robot ends up ~34 units across)

export function initRobot(canvas, track, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  let mode = 'film';
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4c6, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(30, 70, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 180 });
  scene.add(sun, sun.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // practice field for drive mode
  const field = new THREE.Group(); field.visible = false; scene.add(field);
  const grid = new THREE.GridHelper(480, 40, 0x2e8a8f, 0xb9b4a6); grid.material.transparent = true; grid.material.opacity = 0.5; field.add(grid);
  const tape = (x, z, w, d, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, z); field.add(m); };
  tape(0, -140, 240, 2, 0xc8502b); tape(0, 140, 240, 2, 0x2e8a8f); tape(-120, 0, 2, 280, 0x999999); tape(120, 0, 2, 280, 0x999999);
  const pieces = [];

  const drive = new THREE.Group(); scene.add(drive);
  const robot = new THREE.Group(); drive.add(robot);
  const edgeMats = STAGES.map(() => new THREE.LineBasicMaterial({ color: 0x0e0f11, transparent: true, opacity: 0.28 }));
  const ghostLine = new THREE.LineBasicMaterial({ color: 0x2e8a8f, transparent: true, opacity: 0.18, depthWrite: false });
  const ghost = new THREE.Group(); scene.add(ghost);
  const stages = [], spinners = [], anchors = {};
  let gamePiece = null, loaded = false;
  const path = [];

  ui.status && ui.status('Loading the CAD · 3.8 MB');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('../assets/models/robot9470.glb', g => {
    const root = g.scene;
    root.rotation.x = -Math.PI / 2;               // Onshape is Z-up
    root.scale.setScalar(S);
    root.updateMatrixWorld(true);
    // sit the robot on the floor, centred
    const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
    const bb = new THREE.Box3(); meshes.forEach(m => { if (!/Game Piece/.test(m.userData.sub || '')) bb.expandByObject(m, true); });
    const ctr = bb.getCenter(new THREE.Vector3());
    // the wheels are what touch the carpet: ground on the swerve modules
    const wb = new THREE.Box3(); meshes.forEach(m => { if (/SDS MK5n/.test(m.userData.part || '')) wb.expandByObject(m, true); });
    const shift = new THREE.Vector3(-ctr.x, -(wb.isEmpty() ? bb.min.y : wb.min.y), -ctr.z);

    // regroup: stage → part → meshes, keeping world placement
    for (let i = 0; i < STAGES.length; i++) { const grp = new THREE.Group(); grp.userData.offset = new THREE.Vector3(...(STAGES[i].offset || [0, 0, 0])); robot.add(grp); stages.push(grp); }
    const parts = new Map();
    for (const m of meshes) {
      const sub = m.userData.sub || '', part = m.userData.part || m.name;
      m.castShadow = true; m.receiveShadow = true;
      if (m.material) { m.material.roughness = Math.max(0.35, m.material.roughness ?? 0.5); m.material.envMapIntensity = 0.9; }
      if (/Game Piece/.test(sub)) { gamePiece = m; continue; }
      const si = STAGES.findIndex(s => s.key && (sub.includes(s.key) || (s.also && sub.includes(s.also))));
      if (si < 0) continue;
      const key = si + '|' + part;
      if (!parts.has(key)) { const pg = new THREE.Group(); pg.name = part; stages[si].add(pg); parts.set(key, pg); }
      const w = new THREE.Matrix4().copy(m.matrixWorld);
      const pg = parts.get(key);
      m.parent.remove(m);
      w.premultiply(new THREE.Matrix4().makeTranslation(shift.x, shift.y, shift.z));
      w.decompose(m.position, m.quaternion, m.scale);
      m.updateMatrix();
      pg.add(m);
      const idx = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
      if (idx < 90000) {
        const eg = new THREE.EdgesGeometry(m.geometry, 32);
        m.add(new THREE.LineSegments(eg, edgeMats[si]));
        const gl = new THREE.LineSegments(eg, ghostLine); gl.matrixAutoUpdate = false; gl.matrix.copy(m.matrix); ghost.add(gl);
      }
    }
    // per-part stagger, flying from the stage's direction
    for (const s of stages) [...s.children].forEach((k, i, arr) => {
      k.userData.home = k.position.clone();
      k.userData.delay = (i / Math.max(1, arr.length)) * 0.5;
      k.userData.wobble = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    });
    robot.updateMatrixWorld(true);
    // measure every subsystem (and the whole robot) while all parts sit at home
    const measure = objs => { const b = new THREE.Box3(); objs.forEach(o => b.expandByObject(o, true)); return { c: b.getCenter(new THREE.Vector3()), r: b.getSize(new THREE.Vector3()).length() / 2 }; };
    stages.forEach((g, i) => { if (STAGES[i].key) boundsCache[i] = measure([g]); });
    boundsCache[4] = measure(stages.slice(0, 4));

    // named anchors for labels, and rollers that spin about their long axis
    for (const [key, pg] of parts) {
      const b = new THREE.Box3().setFromObject(pg, true);
      if (b.isEmpty()) continue;
      const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      anchors[key] = { c, pg, si: +key.split('|')[0], name: key.split('|')[1] };
      if (/ROLLER|rolex|roller yoink/i.test(pg.name)) {
        const ax = sz.x >= sz.y && sz.x >= sz.z ? new THREE.Vector3(1, 0, 0) : sz.y >= sz.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        const pivot = new THREE.Group(); pivot.position.copy(c); pg.add(pivot);
        [...pg.children].filter(o => o !== pivot).forEach(o => { o.position.sub(c); pivot.add(o); });
        spinners.push({ pivot, ax, si: +key.split('|')[0], dir: /DEAD/.test(pg.name) ? 0 : (/HOOD/.test(pg.name) ? -1 : 1) });
      }
    }
    // the game piece's route: in over the intake, through the hopper, up into the drum, out the top
    const at = re => { const a = Object.values(anchors).find(a => re.test(a.name)); return a ? a.c.clone() : null; };
    const iC = at(/roller yoink/) || new THREE.Vector3(0, 6, 14), hC = at(/^rolex <3>/) || new THREE.Vector3(0, 14, 6), dC = at(/DRUMROLLER/) || new THREE.Vector3(0, 20, -4);
    path.push(new THREE.Vector3(iC.x, 3, iC.z + 18), new THREE.Vector3(iC.x, iC.y, iC.z + 4), iC.clone(), hC.clone(), dC.clone(), new THREE.Vector3(dC.x, dC.y + 12, dC.z - 6), new THREE.Vector3(dC.x, dC.y + 40, dC.z - 60));
    if (gamePiece) {
      gamePiece.parent.remove(gamePiece);
      gamePiece.position.set(0, 0, 0); gamePiece.quaternion.identity(); gamePiece.scale.setScalar(1);
      gamePiece.geometry.computeBoundingSphere();
      const gr = gamePiece.geometry.boundingSphere.radius;
      gamePiece.geometry.translate(-gamePiece.geometry.boundingSphere.center.x, -gamePiece.geometry.boundingSphere.center.y, -gamePiece.geometry.boundingSphere.center.z);
      gamePiece.scale.setScalar(2.9 / gr);
      robot.add(gamePiece); gamePiece.visible = false;
      for (let i = 0; i < 14; i++) {
        const p = gamePiece.clone(); p.visible = true; p.position.set((Math.random() - 0.5) * 200, 2.9, (Math.random() - 0.5) * 220); field.add(p); pieces.push(p);
      }
    }
    // callouts
    for (let i = 0; i < STAGES.length; i++) for (const [re, text] of STAGES[i].callouts) {
      const a = Object.values(anchors).find(a => a.si === i && re.test(a.name)); if (!a) continue;
      const el = document.createElement('div'); el.className = 'callout'; el.innerHTML = `<i></i><span></span><b>${text}</b>`;
      ui.layer.appendChild(el); tags.push({ el, a, i });
    }
    loaded = true;
    ui.status && ui.status(null);
  }, p => { if (p.total && ui.status) ui.status(`Loading the CAD · ${Math.round(p.loaded / p.total * 100)}%`); });

  const tags = [];
  const proj = new THREE.Vector3();
  function placeTags(p, s) {
    const r = canvas.getBoundingClientRect();
    for (const t of tags) {
      const show = t.i === s && p > START[s] + BUILD * 0.85 && mode === 'film';
      t.el.classList.toggle('on', show);
      if (!show) continue;
      proj.copy(t.a.c).applyMatrix4(robot.matrixWorld).project(camera);
      const x = (proj.x + 1) / 2 * r.width, y = (1 - proj.y) / 2 * r.height;
      t.el.style.transform = `translate(${x}px, ${y}px)`;
      t.el.classList.toggle('left', x < r.width * 0.62);
    }
  }

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
    const s = +b.dataset.s, p = s === 4 ? 0.93 : START[s] + BUILD + 0.04;
    scrollTo({ top: track.offsetTop + p * (track.offsetHeight - innerHeight), behavior: 'smooth' });
  }));

  // camera keyframes aim at each subsystem's own bounds
  const boundsCache = {};
  function stageBounds(i) { return boundsCache[i] || { c: new THREE.Vector3(0, 12, 0), r: 30 }; }
  const INTRO = { az: -0.9, el: 0.55, d: 150 };
  function shot(p) {
    const keys = [[0, { ...INTRO, t: stageBounds(4).c }], ...STAGES.map((s, i) => { const B = stageBounds(i); return [START[i] + BUILD * 0.5, { az: s.az, el: s.el, d: B.r * 3.6 * s.d, t: B.c }]; })];
    let a = keys[0], b = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i][0] && p <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
    if (p > keys[keys.length - 1][0]) a = b;
    const u = a === b ? 0 : ease(clamp((p - a[0]) / (b[0] - a[0])));
    const L = (x, y) => x + (y - x) * u;
    return { az: L(a[1].az, b[1].az), el: L(a[1].el, b[1].el), d: L(a[1].d, b[1].d), t: a[1].t.clone().lerp(b[1].t, u) };
  }

  let explode = 0, score = 0;
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
  ui.explode.addEventListener('input', () => { explode = +ui.explode.value; });
  ui.driveBtn.addEventListener('click', () => setMode(mode === 'drive' ? 'film' : 'drive'));
  addEventListener('keydown', e => {
    if (mode !== 'drive') return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keysDown.add(k); e.preventDefault(); }
    if (k === 'escape') setMode('film');
  });
  addEventListener('keyup', e => keysDown.delete(e.key.toLowerCase()));

  let active = false, last = performance.now(), smooth = 0, shown = -2, spin = 0;
  const cam = { az: INTRO.az, el: INTRO.el, d: INTRO.d, t: new THREE.Vector3(0, 12, 0) };
  const curve = { u: 0 };
  function frame(now) {
    if (!active) return;
    const dts = Math.min((now - last) / 1000, 0.05); last = now;
    const time = now / 1000;
    smooth += (progress() - smooth) * Math.min(1, dts * 6);
    const p = mode === 'film' ? smooth : 1;
    let s = -1; for (let i = 0; i < STAGES.length; i++) if (p >= START[i]) s = i;

    if (loaded) {
      stages.forEach((g, i) => {
        const t = i === 4 ? 1 : clamp((p - START[i]) / BUILD);
        g.visible = t > 0.001 || i === 4;
        const ex = new THREE.Vector3(...(STAGES[i].offset || [0, 0, 0])).normalize().multiplyScalar(explode * 22);
        for (const k of g.children) {
          const u = ease(clamp((t - k.userData.delay) / 0.5));
          const off = g.userData.offset, w = k.userData.wobble;
          k.position.set(k.userData.home.x + (off.x + w.x) * (1 - u) + ex.x, k.userData.home.y + (off.y + w.y) * (1 - u) + ex.y, k.userData.home.z + (off.z + w.z) * (1 - u) + ex.z);
          k.visible = u > 0.001;
        }
        const focus = i === s && s < 4 && mode === 'film';
        edgeMats[i].color.set(focus ? 0x2e8a8f : 0x0e0f11); edgeMats[i].opacity = focus ? 0.9 : 0.28;
      });
      ghostLine.opacity = mode === 'film' ? 0.22 * clamp(1 - (p - 0.03) / 0.72) : 0; ghost.visible = ghostLine.opacity > 0.005;
      ghost.position.copy(robot.position);

      // rollers run once their subsystem is built, faster while it is in focus or feeding a piece
      for (const sp of spinners) if (p >= START[sp.si] + BUILD && sp.dir) sp.pivot.rotateOnAxis(sp.ax, dts * sp.dir * (sp.si === s || s === 4 ? 9 : 3));

      // the game piece runs the path during the finale
      if (gamePiece && path.length) {
        const run = mode === 'film' && s === 4;
        gamePiece.visible = run && explode < 0.05;
        if (run) {
          curve.u = (curve.u + dts / 3.2) % 1.25;
          const u = Math.min(1, curve.u), seg = u * (path.length - 1), i0 = Math.min(path.length - 2, seg | 0), f = seg - i0;
          gamePiece.position.copy(path[i0]).lerp(path[i0 + 1], f);
          gamePiece.visible = run && curve.u < 1;
          gamePiece.rotation.x += dts * 6;
        }
      }
    }

    let driveV = 0;
    if (mode === 'drive') {
      const fwd = (keysDown.has('w') || keysDown.has('arrowup') ? 1 : 0) - (keysDown.has('s') || keysDown.has('arrowdown') ? 1 : 0);
      const str = (keysDown.has('d') || keysDown.has('arrowright') ? 1 : 0) - (keysDown.has('a') || keysDown.has('arrowleft') ? 1 : 0);
      const rot = (keysDown.has('q') ? 1 : 0) - (keysDown.has('e') ? 1 : 0);
      const SPD = 95;
      car.vx += (str * SPD - car.vx) * Math.min(1, dts * 5); car.vz += (-fwd * SPD - car.vz) * Math.min(1, dts * 5); car.w += (rot * 2.6 - car.w) * Math.min(1, dts * 6);
      car.x = clamp(car.x + car.vx * dts, -115, 115); car.z = clamp(car.z + car.vz * dts, -135, 135); car.yaw += car.w * dts;
      driveV = Math.hypot(car.vx, car.vz);
      const fx = car.x + Math.sin(car.yaw) * 22, fz = car.z + Math.cos(car.yaw) * 22;
      for (const pc of pieces) if (pc.visible && Math.hypot(pc.position.x - fx, pc.position.z - fz) < 9) { pc.visible = false; score++; ui.score(score, pieces.length); }
      for (const sp of spinners) if (sp.dir) sp.pivot.rotateOnAxis(sp.ax, dts * sp.dir * (driveV > 5 ? 10 : 3));
    }
    drive.position.set(car.x, 0, car.z); drive.rotation.y = car.yaw;

    if (mode === 'drive') {
      camera.position.lerp(new THREE.Vector3(car.x, 70, car.z + 120), Math.min(1, dts * 3));
      cam.t.lerp(new THREE.Vector3(car.x, 12, car.z), Math.min(1, dts * 5));
      camera.lookAt(cam.t);
    } else {
      const k = shot(p);
      if (p > 0.95) spin += dts * 0.3; else spin *= 0.95;
      cam.az += (k.az + spin - cam.az) * Math.min(1, dts * 3); cam.el += (k.el - cam.el) * Math.min(1, dts * 3);
      cam.d += (k.d * (W < 700 ? 1.8 : 1) - cam.d) * Math.min(1, dts * 3); cam.t.lerp(k.t, Math.min(1, dts * 3));
      camera.position.set(cam.t.x + Math.sin(cam.az) * cam.d * Math.cos(cam.el), cam.t.y + cam.d * Math.sin(cam.el), cam.t.z + Math.cos(cam.az) * cam.d * Math.cos(cam.el));
      camera.lookAt(cam.t);
    }
    sun.target.position.set(car.x, 0, car.z); sun.position.set(car.x + 30, 70, car.z + 25);

    if (s !== shown && mode === 'film') {
      shown = s; ui.stage(s < 0 ? null : s);
      ui.buttons.forEach(b => b.classList.toggle('on', +b.dataset.s === s));
    }
    ui.bar.style.width = `${(p * 100).toFixed(2)}%`;
    ui.end.classList.toggle('on', p > 0.9 || mode === 'drive');
    placeTags(p, s);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.__robot = { progress: () => smooth, setMode, car, stages, anchors, spinners, get loaded() { return loaded; } };
  return { setActive(on) { if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(frame); } else if (!on) active = false; } };
}
