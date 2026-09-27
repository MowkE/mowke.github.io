// robot.js
// HighTide, FRC 4414's 2026 robot, assembled by scroll. Built from
// primitives in the team's colors (orange bumpers, teal truss, dark
// plate, smoked polycarbonate) and drawn with CAD edge lines. Each
// subsystem flies in from its own direction, part by part, while the
// camera takes a full lap around the robot. When real CAD photos
// arrive they can sit on the stage cards; the geometry here is a
// stand-in, not the team's model.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const STAGES = [
  { name: 'Drivetrain', note: 'Four swerve modules on a square frame. Everything else bolts to this.' },
  { name: 'Bumpers', note: 'Team orange, numbers on the sides, so the field knows who hit them.' },
  { name: 'Dye rotor', note: 'The spinning floor of the hopper, indexing game pieces toward the shooter.' },
  { name: 'Intake', note: 'A roller bed out front that pulls pieces off the carpet and into the rotor.' },
  { name: 'Turret', note: 'A ring gear and a teal truss, so the shooter can aim without turning the robot.' },
  { name: 'Shooter', note: 'Flywheels and a hood riding the turret.' },
  { name: 'HighTide', note: 'All six subsystems, assembled. Keep scrolling for the victory lap.' },
];
// scroll fraction where each build stage starts; the last stretch is the lap
const START = [0.02, 0.15, 0.28, 0.41, 0.54, 0.67, 0.8];
const SPAN = 0.11;

export function initRobot(canvas, track, ui) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4c6, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 60, 25); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
  scene.add(sun);

  // a soft contact shadow on the bench
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // ── materials ───────────────────────────────────────────────────
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...o });
  const M = {
    teal: std(0x2e8a8f, { roughness: 0.4, metalness: 0.35 }),
    orange: std(0xc8502b, { roughness: 0.62 }),
    plate: std(0x2b2d31, { roughness: 0.5, metalness: 0.4 }),
    carbon: std(0x1b1c1f, { roughness: 0.35, metalness: 0.2 }),
    poly: new THREE.MeshPhysicalMaterial({ color: 0x3a3d44, transparent: true, opacity: 0.32, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.DoubleSide }),
    silver: std(0xbfc3c8, { roughness: 0.3, metalness: 0.85 }),
    roller: std(0xe9e7e0, { roughness: 0.6 }),
    tread: std(0x2a2a2a, { roughness: 0.9 }),
    red: std(0xc73a2a, { roughness: 0.45 }),
    gold: std(0xc9a14a, { roughness: 0.35, metalness: 0.7 }),
  };
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x0e0f11, transparent: true, opacity: 0.55 });

  function part(group, geo, mat, [x, y, z], [rx, ry, rz] = [0, 0, 0], edges = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = mat !== M.poly; m.receiveShadow = true;
    if (edges && mat !== M.poly) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), edgeMat));
    if (mat === M.poly) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35 })));
    group.add(m);
    return m;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, h, s = 28) => new THREE.CylinderGeometry(r, r, h, s);

  const robot = new THREE.Group();
  scene.add(robot);
  const stages = [];
  function stage(offset) {
    const g = new THREE.Group();
    g.userData.offset = new THREE.Vector3(...offset);
    robot.add(g); stages.push(g);
    return g;
  }

  // ── 0 drivetrain ────────────────────────────────────────────────
  const dt = stage([0, -30, 0]);
  const F = 13.5;
  for (const s of [-1, 1]) {
    part(dt, box(27, 2, 1), M.teal, [0, 3, s * F]);
    part(dt, box(1, 2, 27), M.teal, [s * F, 3, 0]);
    part(dt, box(25, 1, 0.8), M.teal, [0, 3.2, s * 4]);
  }
  part(dt, box(26, 0.25, 26), M.plate, [0, 2, 0]);
  part(dt, box(6.5, 3.5, 3), M.carbon, [-6, 3.9, 6]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (F - 3.2), z = sz * (F - 3.2);
    part(dt, cyl(3.4, 0.4, 32), M.plate, [x, 4.4, z]);
    part(dt, cyl(1.95, 1.5, 28), M.tread, [x, 2, z], [0, 0, Math.PI / 2]);
    part(dt, cyl(1.1, 1.6, 20), M.silver, [x, 2, z], [0, 0, Math.PI / 2]);
    part(dt, cyl(1.05, 3.2, 20), M.silver, [x + 1.2 * sx, 6.2, z - 1.2 * sz]);
    part(dt, cyl(1.05, 2.6, 20), M.silver, [x - 1.2 * sx, 5.9, z + 1.2 * sz]);
  }

  // ── 1 bumpers ───────────────────────────────────────────────────
  const bp = stage([0, 0, 40]);
  {
    const rr = (w, r) => {
      const s = new THREE.Shape(), h = w / 2;
      s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.quadraticCurveTo(h, -h, h, -h + r);
      s.lineTo(h, h - r); s.quadraticCurveTo(h, h, h - r, h); s.lineTo(-h + r, h);
      s.quadraticCurveTo(-h, h, -h, h - r); s.lineTo(-h, -h + r); s.quadraticCurveTo(-h, -h, -h + r, -h);
      return s;
    };
    const shape = rr(34.5, 3.6);
    const hole = new THREE.Path(rr(27.4, 0.6).getPoints(24));
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 3, curveSegments: 16 });
    part(bp, geo, M.orange, [0, 1.2, 0], [-Math.PI / 2, 0, 0], true);
    // numbers on both sides
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.font = 'italic 800 104px Anybody, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#e9e6de'; g.fillText('4414', 256, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const numMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), numMat);
      p.position.set(s * 17.83, 3.7, 0); p.rotation.y = s * Math.PI / 2; bp.add(p);
    }
  }

  // ── 2 dye rotor + hopper ────────────────────────────────────────
  const rt = stage([0, 34, 0]);
  const rotorSpin = new THREE.Group(); rotorSpin.position.set(0, 7.5, 0); rt.add(rotorSpin);
  part(rotorSpin, new THREE.TorusGeometry(11, 0.45, 12, 72), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  part(rotorSpin, new THREE.TorusGeometry(6.5, 0.3, 10, 56), M.carbon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  part(rotorSpin, cyl(1.8, 1.2, 24), M.silver, [0, 0.2, 0]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    part(rotorSpin, box(10.5, 0.5, 0.6), M.plate, [Math.cos(a) * 5.6, 0, Math.sin(a) * 5.6], [0, -a, 0]);
    part(rotorSpin, box(0.4, 2.6, 3.2), M.carbon, [Math.cos(a + 0.3) * 9, 1.4, Math.sin(a + 0.3) * 9], [0, -a - 0.3, 0]);
  }
  // smoked polycarbonate hopper walls and carbon side plates
  part(rt, box(26, 13, 0.2), M.poly, [0, 14.5, -13]);
  part(rt, box(0.2, 13, 26), M.poly, [-13, 14.5, 0]);
  part(rt, box(0.2, 13, 26), M.poly, [13, 14.5, 0]);
  part(rt, box(6, 15, 0.35), M.carbon, [-8, 13.5, 13.2]);
  part(rt, box(6, 15, 0.35), M.carbon, [9, 13.5, 13.2]);

  // ── 3 intake ────────────────────────────────────────────────────
  const it = stage([0, 6, 42]);
  for (const s of [-1, 1]) {
    part(it, box(0.5, 3.4, 11), M.carbon, [s * 12.6, 6.2, 17.5], [-0.28, 0, 0]);
    part(it, cyl(1.3, 1, 20), M.gold, [s * 13.2, 7.4, 13], [0, 0, Math.PI / 2]);
  }
  for (const [y, z, r] of [[7.8, 13.2, 1.25], [5.4, 18.4, 1.1], [3.4, 22.6, 1.05]]) {
    part(it, cyl(r, 24.6, 24), M.roller, [0, y, z], [0, 0, Math.PI / 2]);
  }
  part(it, cyl(0.35, 24.6, 12), M.red, [0, 9.6, 12.4], [0, 0, Math.PI / 2]);
  part(it, cyl(1.2, 3.4, 20), M.silver, [10.4, 10.2, 12.6], [0, 0, Math.PI / 2]);

  // ── 4 turret + teal truss ───────────────────────────────────────
  const tr = stage([-40, 10, 0]);
  const T = new THREE.Vector3(2, 20.5, -3);
  part(tr, new THREE.TorusGeometry(7.6, 0.55, 12, 64), M.carbon, [T.x, T.y, T.z], [Math.PI / 2, 0, 0]);
  part(tr, cyl(3.3, 6, 24), M.plate, [T.x, T.y - 3.5, T.z]);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    part(tr, box(0.7, 0.9, 0.5), M.plate, [T.x + Math.cos(a) * 8.3, T.y, T.z + Math.sin(a) * 8.3], [0, -a, 0], false);
  }
  // the truss: posts and zig-zags along the back and right edges
  const truss = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const g = new THREE.Group(); g.position.set(x0, 0, z0); g.rotation.y = -ang; tr.add(g);
    part(g, box(len, 1, 1), M.teal, [len / 2, 22, 0]);
    part(g, box(len, 1, 1), M.teal, [len / 2, 18.5, 0]);
    const n = Math.round(len / 3.4);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (len / n);
      part(g, box(0.6, 3.9, 0.6), M.teal, [x, 20.25, 0], [0, 0, i % 2 ? 0.75 : -0.75], false);
    }
    for (const x of [0.5, len - 0.5]) part(g, box(1, 16, 1), M.teal, [x, 12, 0]);
  };
  truss(-13, -13.2, 13, -13.2);
  truss(13.2, -13, 13.2, 12);

  // ── 5 shooter, on a pivot that the turret spins ─────────────────
  const pivot = new THREE.Group(); pivot.position.copy(T); robot.add(pivot);
  const sh = new THREE.Group(); sh.userData.offset = new THREE.Vector3(0, 36, 0); pivot.add(sh); stages.push(sh);
  part(sh, cyl(7.8, 0.4, 48), M.plate, [0, 0.8, 0]);
  const side = new THREE.Shape(); side.moveTo(-4, 0); side.lineTo(4.5, 0); side.lineTo(2.5, 9); side.lineTo(-2.5, 9); side.lineTo(-4, 0);
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.4, bevelEnabled: false });
  for (const s of [-1, 1]) part(sh, sideGeo, M.carbon, [0, 1, s * 3.6 - 0.2]);
  part(sh, cyl(1.9, 7.6, 28), M.orange, [0.4, 6.6, 0], [Math.PI / 2, 0, 0]);
  part(sh, cyl(1.2, 7.6, 24), M.roller, [-1.8, 4, 0], [Math.PI / 2, 0, 0]);
  part(sh, new THREE.CylinderGeometry(4.6, 4.6, 7.2, 32, 1, true, 0, Math.PI * 0.8), M.silver, [0.4, 6.6, 0], [Math.PI / 2, 0, -0.4]);
  part(sh, cyl(1.2, 3.4, 20), M.silver, [0.4, 6.6, 5.4], [Math.PI / 2, 0, 0]);
  part(sh, cyl(1.2, 3.4, 20), M.silver, [-1.8, 4, -5.4], [Math.PI / 2, 0, 0]);

  // a blueprint of the finished robot, which the real parts fill in
  const ghost = robot.clone(true);
  const ghostLine = new THREE.LineBasicMaterial({ color: 0x2e8a8f, transparent: true, opacity: 0.16, depthWrite: false });
  ghost.traverse(o => {
    if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ visible: false }); o.castShadow = false; }
    if (o.isLineSegments) o.material = ghostLine;
  });
  scene.add(ghost);

  // stagger every part inside its stage, remembering where it belongs
  for (const g of stages) {
    const kids = [...g.children];
    kids.forEach((k, i) => {
      k.userData.home = k.position.clone();
      k.userData.delay = (i / Math.max(1, kids.length)) * 0.45;
      k.userData.wobble = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    });
  }

  // ── layout ──────────────────────────────────────────────────────
  let W = 1, H = 1;
  function fit() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.setViewOffset(W, H, W > 900 ? -W * 0.14 : 0, W > 900 ? 0 : -H * 0.08, W, H);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit); fit();

  // ── scroll → progress ───────────────────────────────────────────
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  function progress() {
    const r = track.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight));
  }
  ui.buttons.forEach(b => b.addEventListener('click', () => {
    const s = +b.dataset.s;
    const p = s === 6 ? 0.9 : START[s] + SPAN * 0.95;
    const top = track.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: 'smooth' });
  }));

  let shown = -2, active = false, smooth = 0, last = performance.now(), spin = 0;
  function frame(now) {
    if (!active) return;
    const dtS = Math.min((now - last) / 1000, 0.05); last = now;
    const target = progress();
    smooth += (target - smooth) * Math.min(1, dtS * 7);
    const p = smooth;

    stages.forEach((g, i) => {
      const t = clamp((p - START[i]) / SPAN);
      g.visible = t > 0.001;
      for (const k of g.children) {
        const u = ease(clamp((t - k.userData.delay) / 0.55));
        const off = g.userData.offset, w = k.userData.wobble;
        k.position.set(
          k.userData.home.x + (off.x + w.x) * (1 - u),
          k.userData.home.y + (off.y + w.y) * (1 - u),
          k.userData.home.z + (off.z + w.z) * (1 - u));
        k.visible = u > 0.001;
      }
    });

    ghostLine.opacity = 0.2 * clamp(1 - (p - 0.05) / 0.75);
    ghost.visible = ghostLine.opacity > 0.005;

    // mechanisms come alive once their stage is done
    if (p > START[2] + SPAN) rotorSpin.rotation.y += dtS * 1.2;
    if (p > START[5] + SPAN) pivot.rotation.y = Math.sin(now / 1400) * 0.9;
    else pivot.rotation.y *= 0.95;

    // the camera laps the robot across the build, then keeps circling
    if (p > 0.92) spin += dtS * 0.35;
    const a = -0.75 + p * Math.PI * 2 + spin;
    const zoom = 1 - 0.14 * Math.sin(p * Math.PI);
    const R = (W < 700 ? 205 : 112) * zoom, el = 0.52 - 0.1 * Math.sin(p * Math.PI * 2);
    camera.position.set(Math.sin(a) * R * Math.cos(el), 8 + R * Math.sin(el), Math.cos(a) * R * Math.cos(el));
    camera.lookAt(0, 13, 0);

    // copy
    let s = -1; for (let i = 0; i < STAGES.length; i++) if (p >= START[i]) s = i;
    if (s !== shown) {
      shown = s;
      if (s < 0) { ui.n.textContent = '00 / 06'; ui.name.textContent = 'Scroll to build'; ui.note.textContent = 'The frame comes first.'; }
      else { ui.n.textContent = s === 6 ? 'complete' : `${String(s + 1).padStart(2, '0')} / 06`; ui.name.textContent = STAGES[s].name; ui.note.textContent = STAGES[s].note; }
      ui.card.classList.remove('pop'); void ui.card.offsetWidth; ui.card.classList.add('pop');
      ui.buttons.forEach(b => b.classList.toggle('on', +b.dataset.s === s));
    }
    ui.bar.style.width = `${(p * 100).toFixed(2)}%`;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.__robot = { stages, progress: () => smooth };
  return {
    setActive(on) {
      if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(frame); }
      else if (!on) active = false;
    },
  };
}
