// rebuilt.js
// A single-player match of REBUILT, FRC's 2026 game, driven with 9470's robot
// straight out of the team's Onshape CAD.
//
// Everything is in metres on the real field layout: hubs 182 in off each
// alliance wall, bumps and trenches either side, depot, outpost and tower on
// the wall, a neutral zone full of FUEL. The match runs the real clock:
// a 20 s autonomous period, then 2:20 of teleop where the hubs trade places,
// active and inactive, every 25 s. Just you and 9470 on the field.
//
// The FUEL is simulated: gravity, foam bounce, rolling off bumps, balls
// knocking into each other, the robot shoving them around. The drum fires
// ragged volleys of three to five FUEL spread across its width; each one is a
// real projectile solved for the hood angle and wheel speed at that distance,
// with the robot's own velocity added in.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bumperRing } from './bumper.js';

// ---------- the field (2026 field drawings, metres) ----------
const IN = 0.0254;
const HX = 16.54 / 2, HZ = 8.07 / 2;
const HUB_DX = 182.11 * IN;                 // hub centre from its alliance wall
const HUB_W = 47 * IN, HUB_H = 72 * IN;     // footprint and opening height
const BUMP_D = 44.4 * IN, BUMP_W = 73 * IN, BUMP_H = 6.5 * IN;
const TRENCH_CLEAR = 22.25 * IN;
const R = 5.91 * IN / 2;                    // FUEL radius
const G = 9.81;
const RED = 0xd8363a, BLUE = 0x2f66d8;

// ---------- the match ----------
const T_AUTO = 20, T_GAP = 3, T_TELE = 140;
const T_END = T_AUTO + T_GAP + T_TELE;

// ---------- 9470 ----------
const VMAX = 4.6;        // m/s, SDS MK5n on Krakens, loaded
const ACC = 9;           // m/s^2
const WMAX = 7.5;        // rad/s
const VOLLEY = 0.3;      // seconds between drum volleys
const CAP = 45;          // the hopper is closed: FUEL only gets in through the intake

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = (a, b, t) => a + (b - a) * t;

export function startGame(canvas, ui) {
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d10);
  scene.fog = new THREE.Fog(0x0c0d10, 28, 60);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);

  scene.add(new THREE.HemisphereLight(0xe8ecf5, 0x1a1b20, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-4, 14, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 6, bottom: -6, near: 1, far: 40 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  // ---------- field geometry ----------
  const M4 = new THREE.Matrix4();
  let arenaCrowd = null;
  const colliders = [];        // axis-aligned boxes: { min:[x,y,z], max:[x,y,z], robot, ball, arm }
  const box = (x0, y0, z0, x1, y1, z1, f) => colliders.push({ min: [Math.min(x0, x1), y0, Math.min(z0, z1)], max: [Math.max(x0, x1), y1, Math.max(z0, z1)], robot: true, ball: true, ...f });
  const hubs = {};             // alliance -> { x, light }
  const outposts = {};
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.1, ...o });
  const solid = (w, h, d, m, x, y, z, parent = scene) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; parent.add(b); return b; };

  buildCarpet();
  buildPerimeter();
  buildArena();
  for (const a of ['red', 'blue']) buildAlliance(a);

  function buildCarpet() {
    const c = document.createElement('canvas'); c.width = 2048; c.height = Math.round(2048 * HZ / HX);
    const g = c.getContext('2d'), sx = c.width / (2 * HX), X = x => (x + HX) * sx, Z = z => (z + HZ) * sx;
    g.fillStyle = '#26282d'; g.fillRect(0, 0, c.width, c.height);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    const tape = (x0, z0, x1, z1, col, w = 2) => { g.strokeStyle = col; g.lineWidth = w * IN * sx; g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
    tape(0, -HZ, 0, HZ, '#e9e7e1');
    for (const [sg, col] of [[-1, '#d8363a'], [1, '#2f66d8']]) {
      const lx = sg * (HX - HUB_DX + HUB_W / 2);
      tape(lx, -HZ, lx, HZ, col);                                       // alliance zone / robot starting line
      const ts = -sg, tz = ts * 0.85, wx = sg * HX;                    // tower zone
      g.strokeStyle = col; g.lineWidth = 2 * IN * sx; g.strokeRect(Math.min(X(wx), X(wx - sg * 1.3)), Z(tz - 0.7), 1.3 * sx, 1.4 * sx);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    carpet.rotation.x = -Math.PI / 2; carpet.receiveShadow = true; scene.add(carpet);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 1 }));
    out.rotation.x = -Math.PI / 2; out.position.y = -0.005; out.receiveShadow = true; scene.add(out);
  }

  function buildPerimeter() {
    const rail = mat(0x2b2e35, { metalness: 0.5, roughness: 0.4 });
    const poly = new THREE.MeshStandardMaterial({ color: 0xbfd6ff, transparent: true, opacity: 0.07, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const edge = new THREE.LineBasicMaterial({ color: 0x5b6070, transparent: true, opacity: 0.6 });
    // side guardrails
    for (const s of [-1, 1]) {
      solid(2 * HX, 0.5, 0.06, rail, 0, 0.25, s * (HZ + 0.03));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX, 0.5), poly); p.position.set(0, 0.75, s * (HZ + 0.03)); scene.add(p);
      box(-HX - 1, 0, s * HZ, HX + 1, 2, s * (HZ + 1));
    }
    // alliance walls: driver station glass above a solid base
    for (const [s, col] of [[-1, RED], [1, BLUE]]) {
      solid(0.08, 0.9, 2 * HZ, mat(0x1f2126), s * (HX + 0.04), 0.45, 0);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2 * HZ, 1.1), new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      glass.position.set(s * (HX + 0.04), 1.45, 0); glass.rotation.y = Math.PI / 2; scene.add(glass);
      const strip = solid(0.04, 0.04, 2 * HZ, new THREE.MeshBasicMaterial({ color: col }), s * (HX + 0.02), 0.92, 0);
      strip.castShadow = false;
      box(s * HX, 0, -HZ - 1, s * (HX + 1), 3, HZ + 1);
    }
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * HX, 2, 2 * HZ)), edge);
    outline.position.y = 1; scene.add(outline);
  }

  // the venue: raked stands and a crowd down both long sides, a lighting truss overhead
  function buildArena() {
    const seat = mat(0x17181c, { roughness: 0.95 });
    const people = [], rnd = (a, b) => a + Math.random() * (b - a);
    for (const s of [-1, 1]) {
      for (let row = 0; row < 9; row++) {
        const z = s * (HZ + 2.2 + row * 0.85), y = 0.5 + row * 0.45;
        solid(2 * HX + 6, 0.45, 0.85, seat, 0, y - 0.225, z).castShadow = false;
        for (let x = -HX - 2.6; x < HX + 2.6; x += rnd(0.5, 0.9)) if (Math.random() < 0.72) people.push([x, y, z + s * 0.1]);
      }
    }
    const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.12, 0.3, 3, 6), new THREE.MeshLambertMaterial(), people.length);
    const shirts = [0x8a2a2d, 0x2b4f94, 0x6b6e75, 0x3b3d44, 0xa8792b, 0x2f6b4f, 0x5a3d78, 0x90908a];
    people.forEach(([x, y, z], i) => {
      M4.makeTranslation(x, y + 0.27, z); crowd.setMatrixAt(i, M4);
      crowd.setColorAt(i, new THREE.Color(shirts[(Math.random() * shirts.length) | 0]).multiplyScalar(rnd(0.1, 0.22)));
    });
    crowd.userData.base = people; scene.add(crowd); arenaCrowd = crowd;
    // truss and lamps
    const truss = mat(0x2a2c31, { metalness: 0.6, roughness: 0.5 }), lamp = new THREE.MeshBasicMaterial({ color: 0xfff4de });
    for (const s of [-1, 1]) {
      solid(2 * HX + 4, 0.25, 0.25, truss, 0, 9, s * (HZ + 1.2)).castShadow = false;
      for (let x = -HX; x <= HX; x += 2.4) { const l = solid(0.5, 0.12, 0.3, lamp, x, 8.85, s * (HZ + 1.2)); l.castShadow = false; }
    }
  }

  function buildAlliance(a) {
    const sg = a === 'red' ? -1 : 1, zf = -sg, col = a === 'red' ? RED : BLUE, inw = -sg;
    const wallX = sg * HX, hx = sg * (HX - HUB_DX);
    // real field elements are mostly grey steel and black panels; the alliance colour is trim and light
    const am = mat(0x3a3e47, { metalness: 0.55, roughness: 0.4 }), dark = mat(0x24262c, { roughness: 0.7 });
    const glow = new THREE.MeshBasicMaterial({ color: col }), tint = mat(col, { roughness: 0.5, metalness: 0.1 });

    // HUB: a box with a hexagonal funnel on top and a light ring that says whether it is active
    const hub = new THREE.Group(); hub.position.set(hx, 0, 0); scene.add(hub);
    solid(HUB_W, HUB_H - 0.1, HUB_W, dark, 0, (HUB_H - 0.1) / 2, 0, hub);
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) solid(0.07, HUB_H - 0.1, 0.07, am, x * HUB_W / 2, (HUB_H - 0.1) / 2, z * HUB_W / 2, hub);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(HUB_W * 0.8, 0.5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }));
    face.position.set(0, 0.35, 0); face.rotation.y = sg < 0 ? Math.PI / 2 : -Math.PI / 2;
    face.position.x = -sg * (HUB_W / 2 + 0.002); hub.add(face);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(HUB_W * 0.62, HUB_W * 0.38, 0.34, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0xdfe6f5, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, roughness: 0.15 }));
    funnel.position.y = HUB_H + 0.08; hub.add(funnel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(HUB_W * 0.62, 0.025, 8, 6), new THREE.MeshBasicMaterial({ color: col }));
    rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 6; rim.position.y = HUB_H + 0.25; hub.add(rim);
    const band = new THREE.Mesh(new THREE.BoxGeometry(HUB_W + 0.02, 0.06, HUB_W + 0.02), new THREE.MeshBasicMaterial({ color: col }));
    band.position.y = HUB_H - 0.13; hub.add(band);
    box(hx - HUB_W / 2, 0, -HUB_W / 2, hx + HUB_W / 2, HUB_H - 0.02, HUB_W / 2, { hub: a });
    hubs[a] = { x: hx, light: [rim.material, band.material], col: new THREE.Color(col), sg };

    // BUMPs either side of the hub, then a divider, then the TRENCH out to the guardrail
    for (const s of [-1, 1]) {
      const z0 = s * HUB_W / 2, z1 = s * (HUB_W / 2 + BUMP_W);
      const sh = new THREE.Shape(); const rd = BUMP_D / 2, top = BUMP_D * 0.08;
      sh.moveTo(-rd, 0); sh.lineTo(-top, BUMP_H); sh.lineTo(top, BUMP_H); sh.lineTo(rd, 0); sh.lineTo(-rd, 0);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: BUMP_W, bevelEnabled: false });
      const bump = new THREE.Mesh(bg, mat(0x33363e, { roughness: 0.8 })); bump.position.set(hx, 0, Math.min(z0, z1)); bump.castShadow = bump.receiveShadow = true; scene.add(bump);
      const ridge = solid(BUMP_D * 0.16, 0.012, BUMP_W, tint, hx, BUMP_H + 0.006, (z0 + z1) / 2); ridge.castShadow = false;
      const zd = z1 + s * 0.03;
      solid(BUMP_D, 0.72, 0.06, am, hx, 0.36, zd);
      box(hx - BUMP_D / 2, 0, zd - 0.03, hx + BUMP_D / 2, 0.72, zd + 0.03);
      // trench arm: a plate at the clearance height spanning to the guardrail
      const tz0 = zd + s * 0.03, tw = HZ - Math.abs(tz0);
      solid(BUMP_D, 0.1, tw, am, hx, TRENCH_CLEAR + 0.05, s * (Math.abs(tz0) + tw / 2));
      const lip = solid(0.03, 0.03, tw, glow, hx - sg * (BUMP_D / 2), TRENCH_CLEAR + 0.05, s * (Math.abs(tz0) + tw / 2)); lip.castShadow = false;
      solid(BUMP_D, 0.3, 0.05, dark, hx, TRENCH_CLEAR + 0.25, s * (HZ - 0.03));
      box(hx - BUMP_D / 2, TRENCH_CLEAR, tz0, hx + BUMP_D / 2, TRENCH_CLEAR + 0.1, s * HZ, { arm: true });
    }

    // TOWER on the alliance wall: uprights and three rungs
    {
      const tz = zf * 0.85, tx = wallX + inw * 0.95;
      const steel = mat(0x9aa0aa, { metalness: 0.7, roughness: 0.35 });
      solid(1.2, 0.03, 1.3, dark, wallX + inw * 0.6, 0.015, tz);
      for (const s of [-1, 1]) {
        solid(0.09, 1.85, 0.09, am, tx, 0.925, tz + s * 0.52);
        solid(1.0, 0.09, 0.09, tint, wallX + inw * 0.5, 1.85, tz + s * 0.52);
      }
      for (const y of [27, 45, 63]) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.04, 12), steel);
        rung.rotation.x = Math.PI / 2; rung.position.set(tx, y * IN, tz); rung.castShadow = true; scene.add(rung);
      }
      box(wallX, 0, tz - 0.62, wallX + inw * 1.0, 1.9, tz + 0.62, { tower: a });
    }

    // DEPOT: a low-railed bin on the wall, 24 FUEL
    {
      const dz = zf * -2.4, dw = 42 * IN, dd = 27 * IN;
      const rail = mat(0x3a3d45);
      solid(dd, 0.02, dw, dark, wallX + inw * dd / 2, 0.01, dz);
      solid(0.04, 0.08, dw, rail, wallX + inw * dd, 0.04, dz);
      for (const s of [-1, 1]) solid(dd, 0.08, 0.04, rail, wallX + inw * dd / 2, 0.04, dz + s * dw / 2);
      box(wallX + inw * (dd - 0.02), 0, dz - dw / 2, wallX + inw * (dd + 0.02), 0.08, dz + dw / 2, { robot: false });
      for (const s of [-1, 1]) box(wallX, 0, dz + s * dw / 2 - 0.02, wallX + inw * dd, 0.08, dz + s * dw / 2 + 0.02, { robot: false });
    }

    // OUTPOST: the human player's chute near the corner
    {
      const oz = zf * (HZ - 0.72);
      const chute = solid(0.3, 1.2, 0.8, dark, wallX + inw * 0.15, 0.6, oz);
      solid(0.02, 0.04, 0.8, glow, wallX + inw * 0.305, 1.1, oz).castShadow = false;
      const mouth = solid(0.02, 0.26, 0.5, new THREE.MeshBasicMaterial({ color: 0x0a0a0c }), wallX + inw * 0.305, 0.22, oz);
      mouth.castShadow = false;
      box(wallX, 0, oz - 0.4, wallX + inw * 0.3, 1.2, oz + 0.4, { outpost: a });
      outposts[a] = { x: wallX + inw * 0.36, z: oz, inw, stock: 24, cool: 0 };
    }
  }

  // bump height under a point: a peaked ramp either side of each hub
  function groundH(x, z) {
    const az = Math.abs(z);
    if (az < HUB_W / 2 || az > HUB_W / 2 + BUMP_W) return 0;
    for (const a in hubs) {
      const dx = Math.abs(x - hubs[a].x);
      if (dx < BUMP_D / 2) return BUMP_H * Math.min(1, (BUMP_D / 2 - dx) / (BUMP_D / 2 - BUMP_D * 0.08));
    }
    return 0;
  }

  // ---------- FUEL ----------
  const NMAX = 620;
  const P = new Float32Array(NMAX * 3), V = new Float32Array(NMAX * 3);
  const St = new Uint8Array(NMAX);            // 0 free (held, scored, or never used), 1 on the field
  const Ign = new Float32Array(NMAX);         // seconds a fresh shot ignores the robot
  let nBalls = 0;
  function spawnBall(x, y, z, vx = 0, vy = 0, vz = 0) {
    let i = -1;
    for (let k = 0; k < nBalls; k++) if (St[k] === 0) { i = k; break; }
    if (i < 0) { if (nBalls >= NMAX) return -1; i = nBalls++; }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz; St[i] = 1; Ign[i] = 0; shotBy[i] = 0;
    return i;
  }
  function neutralFuel() {
    // the neutral zone's block of FUEL, straddling the centre line
    for (let ix = 0; ix < 12; ix++) for (let iz = 0; iz < 30; iz++) spawnBall((ix - 5.5) * 0.158, R, (iz - 14.5) * 0.158);
  }
  const fuelMat = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.62, metalness: 0 });
  const fuel = new THREE.InstancedMesh(new THREE.SphereGeometry(R, 14, 10), fuelMat, NMAX);
  fuel.castShadow = true; fuel.receiveShadow = true; fuel.frustumCulled = false; scene.add(fuel);


  // streaks behind FUEL in flight
  const TRAILS = 160, trailPos = new Float32Array(TRAILS * 6);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trails = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  trails.frustumCulled = false; scene.add(trails);

  // spatial hash for ball-ball contacts
  const CELL = 2 * R, GX = Math.ceil(2 * HX / CELL) + 2, GZ = Math.ceil(2 * HZ / CELL) + 2;
  const head = new Int32Array(GX * GZ), next = new Int32Array(NMAX);

  // ---------- robots ----------
  const bot = {
    alliance: 'red', x: 0, z: 0, yaw: 0, vx: 0, vz: 0, w: 0, y: 0, pitch: 0, roll: 0,
    held: 8, cap: CAP, intake: true, shootCool: 0, feeding: false, volley: [],
    hx: 0.45, hz: 0.45, top: 0.55, shooter: new THREE.Vector3(0, 0.5, -0.2), intakeZ: 0.45,
    group: new THREE.Group(), tilt: new THREE.Group(), model: null, spinners: [], hopper: null,
  };
  bot.group.add(bot.tilt); scene.add(bot.group);
  const assemble = [];         // parts flying in the way the scroll film builds it
  let loaded = false;

  const foamMat = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.85 });
  const polyMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe8f5, transparent: true, opacity: 0.18, roughness: 0.08, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('../../assets/models/robot9470.glb', g => {
    const root = g.scene;
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
    const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
    const bb = new THREE.Box3(), wb = new THREE.Box3();
    const STAGE = [/DTASSEM/, /INTAKE/, /hopprerdcmp|hopprp walls/, /DRUMASSEM/];
    meshes.forEach(m => { const sub = m.userData.sub || ''; if (STAGE.some(r => r.test(sub))) bb.expandByObject(m, true); if (/SDS MK5n/.test(m.userData.part || '')) wb.expandByObject(m, true); });
    const ctr = bb.getCenter(new THREE.Vector3());
    const shift = new THREE.Matrix4().makeTranslation(-ctr.x, -(wb.isEmpty() ? bb.min.y : wb.min.y), -ctr.z);
    const model = new THREE.Group(); bot.model = model; bot.tilt.add(model);
    // measure in the robot's own frame
    bot.group.position.set(0, 0, 0); bot.group.rotation.set(0, 0, 0); bot.tilt.rotation.set(0, 0, 0); bot.group.updateMatrixWorld(true);
    const byPart = new Map(), foam = [];
    for (const m of meshes) {
      const sub = m.userData.sub || '', part = m.userData.part || m.name;
      if (/Game Piece/.test(sub)) continue;
      const stage = STAGE.findIndex(r => r.test(sub));
      if (stage < 0) continue;                                  // exporter strays outside the four subsystems
      const w = m.matrixWorld.clone().premultiply(shift);
      m.parent.remove(m); w.decompose(m.position, m.quaternion, m.scale); m.updateMatrix();
      m.castShadow = true; m.receiveShadow = false;
      if (m.material) { m.material.envMapIntensity = 0.9; m.material.roughness = Math.max(0.35, m.material.roughness ?? 0.5); }
      model.add(m);
      if (/hopprp walls/.test(sub) && m.material && !/0\.596078/.test(m.material.name || '')) {
        const c = m.material.color; const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
        if (lum > 0.35) m.material = polyMat;
      }
      if (/DRI-FOAM/.test(part) || m.material?.name?.startsWith('0.596078_0.176471_0.050980')) { foam.push(m); m.material = foamMat; }
      if (!byPart.has(part)) byPart.set(part, []);
      byPart.get(part).push(m);
      m.userData.stage = stage;
    }
    model.updateMatrixWorld(true);
    const subBox = re => { const b = new THREE.Box3(); model.traverse(m => { if (m.isMesh && re.test(m.userData.sub || '')) b.expandByObject(m, true); }); return b; };
    const partBox = re => { const b = new THREE.Box3(); for (const [k, ms] of byPart) if (re.test(k)) ms.forEach(m => b.expandByObject(m, true)); return b; };
    if (foam.length >= 2) {
      const { ring } = bumperRing(foam.map(m => new THREE.Box3().setFromObject(m, true)), foamMat);
      model.add(ring); ring.userData.stage = 0;
    }
    model.updateMatrixWorld(true);
    const all = new THREE.Box3().setFromObject(model, true);
    bot.hx = (all.max.x - all.min.x) / 2; bot.hz = (all.max.z - all.min.z) / 2; bot.top = all.max.y;
    // the drum and the intake, measured from the CAD
    const drum = partBox(/DRUMROLLER/), intake = subBox(/INTAKE/);
    if (!drum.isEmpty()) { const c = drum.getCenter(new THREE.Vector3()); bot.shooter.set(c.x, drum.max.y + 0.06, c.z); bot.drumW = (drum.max.x - drum.min.x) * 0.8; }
    if (!intake.isEmpty()) bot.intakeZ = intake.max.z;
    bot.shootDir = Math.sign(bot.shooter.z || -1) || -1;      // +1 if the drum sits at the front
    // hopper: where the load sits, drawn inside the CAD's walls
    const hop = subBox(/hopprp walls/);
    const hsz = hop.getSize(new THREE.Vector3());
    if (!hop.isEmpty()) {
      bot.hopBox = hop.clone().expandByScalar(-R * 1.05);
    }
    // rollers spin about their long axis
    for (const [k, ms] of byPart) if (/ROLLER|rolex/i.test(k) || (/INTAKE/.test(ms[0].userData.sub) && /ThunderHex \(2\d/.test(k))) {
      const b = new THREE.Box3(); ms.forEach(m => b.expandByObject(m, true));
      const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
      const ax = sz.x >= sz.y && sz.x >= sz.z ? new THREE.Vector3(1, 0, 0) : sz.y >= sz.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      const pivot = new THREE.Group(); pivot.position.copy(c); model.add(pivot);
      ms.forEach(m => { m.position.sub(c); pivot.add(m); });
      pivot.userData.stage = ms[0].userData.stage;
      bot.spinners.push({ pivot, ax, kind: /INTAKE/.test(ms[0].userData.sub) ? 'intake' : /rolex/.test(k) ? 'hopper' : 'shooter', dir: /DEAD/.test(k) ? 0 : /HOOD/.test(k) ? -1 : 1 });
    }
    // held FUEL, visible in the hopper
    bot.hopper = new THREE.InstancedMesh(fuel.geometry, fuelMat, 80); bot.hopper.count = 0; bot.hopper.castShadow = true; model.add(bot.hopper);
    // parts fly in by subsystem, like the build film
    const OFF = [[0, -1.2, 0], [0, 0.2, 1.4], [1.2, 0.8, 0], [-1.2, 1, 0]];
    for (const o of [...model.children]) {
      if (o === bot.hopper) continue;
      const s = o.userData.stage ?? 0;
      assemble.push({ o, home: o.position.clone(), from: new THREE.Vector3(...OFF[s]).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4)), delay: s * 0.35 + Math.random() * 0.35 });
    }
    loaded = true;
    ui.loaded({ cap: bot.cap, trench: bot.top < TRENCH_CLEAR, top: bot.top, width: bot.hx * 2, length: bot.hz * 2 });
    resetMatch(false);
    buildT = 0;
  }, p => { if (p.total) ui.progress(p.loaded / p.total); });

  // ---------- match state ----------
  const match = { mode: 'menu', t: 0, score: { red: 0, blue: 0 }, auto: { red: 0, blue: 0 }, firstInactive: 'red', stats: null };
  const keys = new Set();
  let cameraMode = 0, buildT = 0, running = false, paused = false, assist = true;

  function hubActiveAt(a, t) {
    if (match.mode === 'free') return true;
    if (t < T_AUTO + T_GAP) return true;
    const tt = t - T_AUTO - T_GAP;
    if (tt < 10 || tt >= 110) return true;                       // transition and endgame: both hubs live
    const shift = Math.floor((tt - 10) / 25);                   // 0..3
    const inactiveFirst = match.firstInactive === a;
    return (shift % 2 === 0) ? !inactiveFirst : inactiveFirst;
  }
  // FUEL already in the air when a hub shuts off still counts for 3 s
  const hubCounts = (a, t) => hubActiveAt(a, t) || hubActiveAt(a, t - 3);

  function phaseInfo(t) {
    if (match.mode === 'free') return { name: 'FREE DRIVE', clock: null };
    if (t < T_AUTO) return { name: 'AUTO', clock: T_AUTO - t };
    if (t < T_AUTO + T_GAP) return { name: 'AUTO → TELEOP', clock: T_TELE };
    const tt = t - T_AUTO - T_GAP;
    const name = tt < 10 ? 'TRANSITION' : tt < 110 ? `SHIFT ${Math.floor((tt - 10) / 25) + 1}` : 'ENDGAME';
    return { name, clock: Math.max(0, T_TELE - tt) };
  }
  // seconds until our hub next changes state
  function nextFlip(a, t) {
    const now = hubActiveAt(a, t);
    for (let d = 0.1; d < 40; d += 0.1) if (hubActiveAt(a, t + d) !== now) return d;
    return null;
  }

  function placeRobot(r, x, z, yaw) { Object.assign(r, { x, z, yaw, vx: 0, vz: 0, w: 0 }); }
  function resetMatch(start, opts = {}) {
    for (let i = 0; i < nBalls; i++) St[i] = 0;
    nBalls = 0;
    for (const a of ['red', 'blue']) {
      const sg = a === 'red' ? -1 : 1, zf = -sg, inw = -sg, wallX = sg * HX, dz = zf * -2.4;
      for (let i = 0; i < 24; i++) spawnBall(wallX + inw * (0.1 + (i % 4) * 0.155), R, dz - 0.46 + Math.floor(i / 4) * 0.18);
      outposts[a].stock = 24;
    }
    neutralFuel();
    if (opts.alliance) bot.alliance = opts.alliance;
    if (opts.mode) match.mode = opts.mode;
    const sg = bot.alliance === 'red' ? -1 : 1;
    foamMat.color.set(bot.alliance === 'red' ? RED : BLUE);
    const lineX = sg * (HX - HUB_DX + HUB_W / 2);
    placeRobot(bot, lineX + sg * (bot.hz + 0.02), -sg * 1.55, sg < 0 ? Math.PI / 2 : -Math.PI / 2);
    bot.held = 8; bot.intake = true; bot.volley = []; bot.shootCool = 0;
    match.t = 0; match.score = { red: 0, blue: 0 }; match.auto = { red: 0, blue: 0 };
    match.stats = { shots: 0, made: 0, points: 0, dist: 0, top: 0, collected: 0, autoPts: 0, wasted: 0 };
    match.firstInactive = null;
    running = start; paused = false;
    ui.phase && ui.phase(phaseInfo(0));
  }

  // ---------- ballistics ----------
  const hubTarget = a => new THREE.Vector3(hubs[a].x, HUB_H + 0.12, 0);
  function shooterWorld(r, out = new THREE.Vector3()) {
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    return out.set(r.x + r.shooter.x * c + r.shooter.z * s, r.y + r.shooter.y, r.z - r.shooter.x * s + r.shooter.z * c);
  }
  // hood angle and wheel speed for this distance, leading the target by our own velocity
  function solve(r, a) {
    const from = shooterWorld(r), T = hubTarget(a);
    let tof = 0.9, sol = null;
    for (let k = 0; k < 4; k++) {
      const tx = T.x - r.vx * tof, tz = T.z - r.vz * tof;
      const dx = tx - from.x, dz = tz - from.z, d = Math.hypot(dx, dz), dh = T.y - from.y;
      let th = clamp(THREE.MathUtils.degToRad(80 - d * 4.2), THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(78));
      let den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dh);
      if (den <= 0.01) { th = THREE.MathUtils.degToRad(80); den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dh); }
      const v = Math.sqrt(G * d * d / Math.max(den, 1e-3));
      tof = d / (v * Math.cos(th));
      sol = { heading: Math.atan2(dx, dz), v, th, d, tof, from };
    }
    return sol;
  }
  // yaw that points the drum at a heading
  const yawFor = (r, heading) => r.shootDir > 0 ? heading : wrap(heading + Math.PI);

  // the drum is as wide as the robot: a volley leaves as a ragged line of FUEL
  // across it, never quite even: a few ms apart, each with its own small error
  function queueVolley(r) {
    const n = Math.min(r.held, 3 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0));
    const w = r.drumW || 0.45;
    for (let k = 0; k < n; k++) {
      const lat = (n === 1 ? 0 : -w / 2 + w * k / (n - 1)) + (Math.random() - 0.5) * w * 0.18;
      r.volley.push({ in: Math.random() * 0.075 + (Math.random() < 0.2 ? 0.05 : 0), lat });
    }
    r.held -= n;
    sfx.shot();
  }
  function releaseVolley(r, dt) {
    for (let k = r.volley.length - 1; k >= 0; k--) {
      const v = r.volley[k]; v.in -= dt; if (v.in > 0) continue;
      r.volley.splice(k, 1);
      const sol = solve(r, r.alliance);
      const dir = r.shootDir > 0 ? r.yaw : r.yaw + Math.PI;     // launched along the robot's own axis
      const sp = sol.v * (1 + (Math.random() - 0.5) * 0.045 * (1 + sol.d * 0.1));
      const th = sol.th + (Math.random() - 0.5) * 0.035;
      const ya = dir + (Math.random() - 0.5) * 0.03;
      const h = Math.cos(th) * sp, c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      const i = spawnBall(sol.from.x + v.lat * c, sol.from.y + (Math.random() - 0.5) * 0.03, sol.from.z - v.lat * s, Math.sin(ya) * h + r.vx, Math.sin(th) * sp, Math.cos(ya) * h + r.vz);
      if (i >= 0) { Ign[i] = 0.35; shotBy[i] = 1; }
      match.stats.shots++;
    }
  }
  const shotBy = new Uint8Array(NMAX);

  // ---------- physics ----------
  function stepRobot(r, cmd, dt) {
    // swerve: translation and rotation are independent, each acceleration-limited
    let dvx = cmd.vx - r.vx, dvz = cmd.vz - r.vz; const m = Math.hypot(dvx, dvz), lim = ACC * dt;
    if (m > lim) { dvx *= lim / m; dvz *= lim / m; }
    r.vx += dvx; r.vz += dvz;
    r.w += clamp(cmd.w - r.w, -30 * dt, 30 * dt);
    r.x += r.vx * dt; r.z += r.vz * dt; r.yaw = wrap(r.yaw + r.w * dt);
    // static field elements: separating axis between the robot's frame and each box
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const ax = [[1, 0], [0, 1], [c, -s], [s, c]];
    for (const b of colliders) {
      if (!b.robot) continue;
      if (b.arm && r.top + r.y < TRENCH_CLEAR - 0.005) continue;
      if (b.max[1] < 0.05 + r.y) continue;
      const bx = (b.min[0] + b.max[0]) / 2, bz = (b.min[2] + b.max[2]) / 2, ex = (b.max[0] - b.min[0]) / 2, ez = (b.max[2] - b.min[2]) / 2;
      const dx = r.x - bx, dz = r.z - bz;
      let best = 1e9, nx = 0, nz = 0;
      for (const [ux, uz] of ax) {
        const pr = r.hx * Math.abs(c * ux - s * uz) + r.hz * Math.abs(s * ux + c * uz);
        const pb = ex * Math.abs(ux) + ez * Math.abs(uz);
        const d = dx * ux + dz * uz, o = pr + pb - Math.abs(d);
        if (o <= 0) { best = -1; break; }
        if (o < best) { best = o; const sg = Math.sign(d) || 1; nx = ux * sg; nz = uz * sg; }
      }
      if (best > 0) {
        r.x += nx * best; r.z += nz * best;
        const vn = r.vx * nx + r.vz * nz; if (vn < 0) { r.vx -= vn * nx; r.vz -= vn * nz; }
        if (r === bot && vn < -1.5) sfx.bonk(-vn);
      }
    }
    // bumps: ride up on them, pitched and rolled by the ramp under each corner
    const h = (lx, lz) => groundH(r.x + lx * c + lz * s, r.z - lx * s + lz * c);
    const hf = h(0, r.hz * 0.8), hb = h(0, -r.hz * 0.8), hr = h(r.hx * 0.8, 0), hl = h(-r.hx * 0.8, 0);
    const ty = Math.max((hf + hb) / 2, (hr + hl) / 2, groundH(r.x, r.z) * 0.9);
    r.y = lerp(r.y, ty, Math.min(1, dt * 18));
    r.pitch = lerp(r.pitch, -Math.atan2(hf - hb, r.hz * 1.6), Math.min(1, dt * 14));
    r.roll = lerp(r.roll, Math.atan2(hr - hl, r.hx * 1.6), Math.min(1, dt * 14));
  }

  function stepBalls(dt, robots) {
    const t = match.t;
    for (let i = 0; i < nBalls; i++) {
      if (St[i] !== 1) continue;
      const k = i * 3;
      let x = P[k], y = P[k + 1], z = P[k + 2], vx = V[k], vy = V[k + 1], vz = V[k + 2];
      const py = y;
      vy -= G * dt;
      x += vx * dt; y += vy * dt; z += vz * dt;
      if (Ign[i] > 0) Ign[i] -= dt;

      // into a hub from above
      for (const a in hubs) {
        const hb = hubs[a];
        // anything that comes down onto the top is taken by the funnel
        if (y < HUB_H + R && y > HUB_H - 0.35 && vy <= 0.05 && Math.abs(x - hb.x) < HUB_W / 2 - R * 0.3 && Math.abs(z) < HUB_W / 2 - R * 0.3) {
          St[i] = 0; scoreFuel(a, i, t); break;
        }
      }
      if (St[i] !== 1) continue;

      // the floor, and the bumps
      const gh = groundH(x, z);
      if (y < R + gh) {
        y = R + gh;
        if (vy < 0) { vy = -vy * 0.32; if (vy < 0.25) vy = 0; }
        const f = Math.max(0, 1 - 1.6 * dt); vx *= f; vz *= f;
        if (gh > 0) {                                           // roll off the ramp
          const e = 0.02, gx = (groundH(x + e, z) - groundH(x - e, z)) / (2 * e);
          vx -= gx * G * 0.6 * dt;
        }
      }
      // field boxes
      for (const b of colliders) {
        if (!b.ball) continue;
        const cx = clamp(x, b.min[0], b.max[0]), cy = clamp(y, b.min[1], b.max[1]), cz = clamp(z, b.min[2], b.max[2]);
        let dx = x - cx, dy = y - cy, dz = z - cz; const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= R * R) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {                                        // centre inside: push out the nearest face
          const o = [x - b.min[0], b.max[0] - x, y - b.min[1], b.max[1] - y, z - b.min[2], b.max[2] - z];
          const m = o.indexOf(Math.min(...o)); dx = dy = dz = 0;
          if (m === 0) dx = -1; else if (m === 1) dx = 1; else if (m === 2) dy = -1; else if (m === 3) dy = 1; else if (m === 4) dz = -1; else dz = 1;
          d = 1; const pen = o[m] + R; x += dx * pen; y += dy * pen; z += dz * pen;
        } else { const pen = R - d; dx /= d; dy /= d; dz /= d; x += dx * pen; y += dy * pen; z += dz * pen; }
        const vn = vx * dx + vy * dy + vz * dz;
        if (vn < 0) { vx -= 1.4 * vn * dx; vy -= 1.4 * vn * dy; vz -= 1.4 * vn * dz; vx *= 0.9; vz *= 0.9; }
      }
      // robots: collect through the intake or the open hopper, otherwise get shoved
      for (const r of robots) {
        if (Ign[i] > 0 && (shotBy[i] ? r === bot : r !== bot)) continue;
        const dx = x - r.x, dz = z - r.z;
        if (dx * dx + dz * dz > (Math.max(r.hx, r.hz) * 1.5 + R) ** 2) continue;
        const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const top = r.y + r.top;
        if (Math.abs(lx) > r.hx + R || Math.abs(lz) > r.hz + R || y > top + R) continue;
        const room = r.held < r.cap;
        const atIntake = r.intake && room && lz > r.hz - 0.12 && Math.abs(lx) < r.hx * 0.82 && y < r.y + 0.35;
        if (atIntake) { St[i] = 0; r.held++; if (r === bot) { match.stats.collected++; sfx.intake(); } break; }
        // push out along the shallowest local axis, carrying the robot's velocity
        const ox = r.hx + R - Math.abs(lx), oz = r.hz + R - Math.abs(lz), oy = top + R - y;
        if (oy < Math.min(ox, oz) && vy <= 0.5) { y = top + R; vy = Math.max(0, -vy * 0.3); vx = lerp(vx, r.vx, 0.3); vz = lerp(vz, r.vz, 0.3); continue; }
        let nlx = 0, nlz = 0;
        if (ox < oz) { nlx = Math.sign(lx) || 1; } else { nlz = Math.sign(lz) || 1; }
        const pen = Math.min(ox, oz);
        const nx = nlx * c + nlz * s, nz = -nlx * s + nlz * c;
        x += nx * pen; z += nz * pen;
        const rvn = (vx - r.vx) * nx + (vz - r.vz) * nz;
        if (rvn < 0) { vx -= 1.3 * rvn * nx; vz -= 1.3 * rvn * nz; }
      }
      if (St[i] !== 1) continue;
      // anything that clears the guardrail comes back
      if (Math.abs(x) > HX - R) { x = Math.sign(x) * (HX - R); vx = -vx * 0.4; }
      if (Math.abs(z) > HZ - R) { z = Math.sign(z) * (HZ - R); vz = -vz * 0.4; }
      P[k] = x; P[k + 1] = y; P[k + 2] = z; V[k] = vx; V[k + 1] = vy; V[k + 2] = vz;
    }
    // ball-ball contacts through the spatial hash
    head.fill(-1);
    for (let i = 0; i < nBalls; i++) {
      if (St[i] !== 1) continue;
      const cx = clamp(((P[i * 3] + HX) / CELL | 0) + 1, 0, GX - 1), cz = clamp(((P[i * 3 + 2] + HZ) / CELL | 0) + 1, 0, GZ - 1);
      const c = cx * GZ + cz; next[i] = head[c]; head[c] = i;
    }
    const D = 2 * R, D2 = D * D;
    for (let i = 0; i < nBalls; i++) {
      if (St[i] !== 1) continue;
      const ki = i * 3, cx = clamp(((P[ki] + HX) / CELL | 0) + 1, 1, GX - 2), cz = clamp(((P[ki + 2] + HZ) / CELL | 0) + 1, 1, GZ - 2);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        for (let j = head[(cx + ox) * GZ + cz + oz]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const kj = j * 3;
          const dx = P[kj] - P[ki], dy = P[kj + 1] - P[ki + 1], dz = P[kj + 2] - P[ki + 2], d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= D2 || d2 < 1e-10) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, pen = (D - d) / 2;
          P[ki] -= nx * pen; P[ki + 1] -= ny * pen; P[ki + 2] -= nz * pen;
          P[kj] += nx * pen; P[kj + 1] += ny * pen; P[kj + 2] += nz * pen;
          const rv = (V[kj] - V[ki]) * nx + (V[kj + 1] - V[ki + 1]) * ny + (V[kj + 2] - V[ki + 2]) * nz;
          if (rv < 0) { const jv = -0.65 * rv; V[ki] -= jv * nx; V[ki + 1] -= jv * ny; V[ki + 2] -= jv * nz; V[kj] += jv * nx; V[kj + 1] += jv * ny; V[kj + 2] += jv * nz; }
          if (P[ki + 1] < R) P[ki + 1] = R;
          if (P[kj + 1] < R) P[kj + 1] = R;
        }
      }
    }
  }

  // hub scoring, and the hub sends the FUEL back out into the neutral zone
  const returns = [];
  function scoreFuel(a, i, t) {
    const counts = running && (match.mode === 'free' || hubCounts(a, t));     // nothing counts after the buzzer
    if (counts) {
      match.score[a]++; hubs[a].flash = 1;
      if (t < T_AUTO && match.mode === 'match') match.auto[a]++;
    }
    if (shotBy[i]) {
      if (counts) { match.stats.made++; match.stats.points++; if (t < T_AUTO && match.mode === 'match') match.stats.autoPts++; sfx.score(); pops.push({ a, t: 0 }); }
      else { match.stats.wasted++; sfx.dud(); }
    }
    shotBy[i] = 0;
    returns.push({ a, at: t + 0.5 + Math.random() * 0.6 });
  }
  function stepReturns(t) {
    for (let k = returns.length - 1; k >= 0; k--) {
      const r = returns[k]; if (t < r.at) continue;
      returns.splice(k, 1);
      const hb = hubs[r.a], out = -hb.sg;                      // out the neutral-zone face
      spawnBall(hb.x + out * (HUB_W / 2 + R + 0.02), 0.25, (Math.random() - 0.5) * HUB_W * 0.8, out * (1.2 + Math.random() * 1.6), 0.4, (Math.random() - 0.5) * 1.6);
    }
  }

  // outpost: drive the intake up to the chute and the human player feeds you
  function stepOutposts(dt, robots) {
    for (const a in outposts) {
      const o = outposts[a]; o.cool -= dt;
      if (o.stock <= 0 || o.cool > 0) continue;
      for (const r of robots) {
        if (r.alliance !== a || !r.intake || r.held >= r.cap) continue;
        const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
        const fx = r.x + s * r.hz, fz = r.z + c * r.hz;
        if (Math.hypot(fx - o.x, fz - o.z) < 0.55) {
          spawnBall(o.x, 0.28, o.z + (Math.random() - 0.5) * 0.2, o.inw * 1.6, 0.2, 0);
          o.stock--; o.cool = 0.28;
          if (r === bot) r.feeding = true;
          break;
        }
      }
    }
  }

  // ---------- input ----------
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'tab') { e.preventDefault(); if (running) { cameraMode = (cameraMode + 1) % 3; ui.camera(['driver station', 'broadcast', 'overhead'][cameraMode]); } return; }
    if (k === 'escape') { if (running) togglePause(); return; }
    if (running && ['w', 'a', 's', 'd', 'j', 'l', 'q', 'e', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (k === 'shift' && running && !e.repeat) { bot.intake = !bot.intake; sfx.click(); }
    keys.add(k === ' ' ? 'space' : k);
    sfx.unlock();
  });
  addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k === ' ' ? 'space' : k); });
  addEventListener('blur', () => keys.clear());
  function togglePause() { paused = !paused; ui.paused(paused); keys.clear(); }

  // touch: left stick drives, right stick turns, a shoot button
  const touch = { move: { x: 0, y: 0 }, turn: 0, shoot: false };
  ui.bindTouch && ui.bindTouch(touch);

  function playerCmd(dt) {
    const sg = bot.alliance === 'red' ? 1 : -1;               // driver stations face each other: forward is away from your wall
    let f = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), st = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    f += -touch.move.y; st += touch.move.x;
    let rot = (keys.has('j') || keys.has('q') || keys.has('arrowleft') ? 1 : 0) - (keys.has('l') || keys.has('e') || keys.has('arrowright') ? 1 : 0);
    rot -= touch.turn;
    f += (keys.has('arrowup') ? 1 : 0) - (keys.has('arrowdown') ? 1 : 0);
    const m = Math.hypot(f, st); if (m > 1) { f /= m; st /= m; }
    // camera-relative mapping: the driver station looks down +x (red) or -x (blue)
    let vx, vz;
    if (cameraMode === 1) { vx = st; vz = -f; }                          // broadcast: seen from the side, screen right is +x
    else { vx = f * sg; vz = st * sg; }
    const cmd = { vx: vx * VMAX, vz: vz * VMAX, w: rot * WMAX };
    // intake leads: with no turn input, swing the intake round to face the way we're driving
    const mv = Math.hypot(cmd.vx, cmd.vz);
    if (assist && rot === 0 && mv > 0.6 && bot.intake && bot.held < bot.cap) {
      const err = wrap(Math.atan2(cmd.vx, cmd.vz) - bot.yaw);
      cmd.w = clamp(err * 4.5, -WMAX * 0.75, WMAX * 0.75) * Math.min(1, mv / 2);
    }
    // shooting: hold space and the heading controller swings the drum onto the hub
    const shooting = keys.has('space') || touch.shoot;
    bot.aim = null;
    if (shooting && bot.held > 0) {
      const sol = solve(bot, bot.alliance);
      const want = yawFor(bot, sol.heading), err = wrap(want - bot.yaw);
      if (rot === 0) cmd.w = clamp(err * 9, -WMAX, WMAX);
      bot.aim = { sol, err };
      bot.shootCool -= dt;
      if (Math.abs(err) < 0.05 && bot.shootCool <= 0 && sol.d > 1.0) { queueVolley(bot); bot.shootCool = VOLLEY; }
    }
    return cmd;
  }

  // ---------- camera ----------
  const cam = { p: new THREE.Vector3(-14, 9, 10), t: new THREE.Vector3() };
  let orbit = 0, viewShift = 0.2;
  function placeCamera(dt, instant) {
    const sg = bot.alliance === 'red' ? -1 : 1;
    let p, t;
    if (!running && match.mode !== 'results') {
      // menu: a slow orbit of the field that settles on 9470 while it builds itself
      orbit += dt * 0.07;
      const focus = new THREE.Vector3(bot.x, 0.35, bot.z);
      const dd = buildT < 2.8 ? 2.4 : 3.6;
      p = new THREE.Vector3(focus.x + Math.cos(orbit) * dd * 1.2, dd * 0.5 + 0.5, focus.z + Math.sin(orbit) * dd);
      t = focus;
    } else if (cameraMode === 0) {
      // frame the robot and our own hub together, from behind whichever is nearer our wall,
      // backing off and rising as they spread apart: you always see what you're shooting at
      const al = -sg, botA = bot.x * al, hubA = hubs[bot.alliance].x * al;
      const lo = Math.min(botA, hubA), hi = Math.max(botA, hubA), span = hi - lo;
      const camA = Math.max(-HX - 3, lo - 3.2 - span * 0.28);
      const focA = lerp(lo, hi, 0.58);
      // and look past the hub from the robot's side rather than straight through it
      const side = Math.sign(bot.z) || 1, camZ = side * Math.max(Math.abs(bot.z) * 0.6, span > 2 ? 2.0 : 0.6);
      p = new THREE.Vector3(camA * al, 3.1 + span * 0.42, camZ);
      t = new THREE.Vector3(focA * al, 0.2, bot.z * 0.7);
    } else if (cameraMode === 1) {
      p = new THREE.Vector3(bot.x * 0.85, 6.5, HZ + 6.5);
      t = new THREE.Vector3(bot.x * 0.9, 0, bot.z * 0.4);
    } else {
      p = new THREE.Vector3(sg * 3.2, 21, 0);
      t = new THREE.Vector3(-sg * 0.4, 0, 0);
    }
    const k = instant ? 1 : Math.min(1, dt * (running ? 4 : 1.6));
    cam.p.lerp(p, k); cam.t.lerp(t, Math.min(1, k * 1.4));
    camera.position.copy(cam.p); camera.lookAt(cam.t);
    // on the menu, slide the picture right so the robot sits beside the panel
    // (on a phone the menu sits at the bottom, so lift the robot into the top of the screen instead)
    const onMenu = !running && match.mode === 'menu';
    viewShift = lerp(viewShift, onMenu ? 0.2 : 0, Math.min(1, dt * 3));
    if (W > 900) camera.setViewOffset(W, H, -W * viewShift, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * viewShift * 1.6, W, H);
    key.target.position.set(cam.t.x, 0, cam.t.z); key.position.set(cam.t.x - 4, 14, cam.t.z + 6);
  }

  // ---------- sound (all synthesized) ----------
  const sfx = (() => {
    let ac = null, master = null, motor = null, motorGain = null;
    const ensure = () => {
      if (ac) return ac;
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
      master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
      motor = ac.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 60;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      motorGain = ac.createGain(); motorGain.gain.value = 0; motor.connect(lp); lp.connect(motorGain); motorGain.connect(master); motor.start();
      return ac;
    };
    const tone = (f, d, type = 'sine', g = 0.2, f2) => {
      if (!ac || muted) return; const t = ac.currentTime, o = ac.createOscillator(), v = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(v); v.connect(master); o.start(t); o.stop(t + d + 0.02);
    };
    const noise = (d, g, f) => {
      if (!ac || muted) return; const t = ac.currentTime, n = ac.sampleRate * d, b = ac.createBuffer(1, n, ac.sampleRate), c = b.getChannelData(0);
      for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
      const s = ac.createBufferSource(); s.buffer = b; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.9;
      const v = ac.createGain(); v.gain.value = g; s.connect(bp); bp.connect(v); v.connect(master); s.start(t);
    };
    let muted = false, lastIntake = 0, lastScore = 0;
    return {
      unlock: () => { ensure(); ac && ac.state === 'suspended' && ac.resume(); },
      set muted(m) { muted = m; if (motorGain) motorGain.gain.value = 0; }, get muted() { return muted; },
      shot: () => { noise(0.09, 0.5, 900); tone(140, 0.12, 'sine', 0.25, 60); },
      intake: () => { if (!ac) return; const t = ac.currentTime; if (t - lastIntake < 0.05) return; lastIntake = t; tone(520 + Math.random() * 80, 0.05, 'triangle', 0.06); },
      score: () => { if (!ac) return; const t = ac.currentTime; if (t - lastScore < 0.06) return; lastScore = t; tone(1318, 0.18, 'sine', 0.09); tone(1976, 0.12, 'sine', 0.04); },
      dud: () => tone(220, 0.15, 'square', 0.03),
      bonk: v => noise(0.12, Math.min(0.6, v * 0.15), 180),
      click: () => tone(900, 0.03, 'square', 0.04),
      start: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.07), i * 110)); },
      buzzer: () => { tone(110, 1.1, 'sawtooth', 0.12); tone(113, 1.1, 'square', 0.05); },
      bell: () => { tone(880, 0.9, 'sine', 0.12); tone(1320, 0.6, 'sine', 0.05); },
      beep: () => tone(1046, 0.08, 'square', 0.05),
      motor: v => { if (!ac || !motorGain) return; motorGain.gain.setTargetAtTime(muted || !running || paused ? 0 : 0.025 + v * 0.012, ac.currentTime, 0.08); motor.frequency.setTargetAtTime(55 + v * 55, ac.currentTime, 0.08); },
    };
  })();

  // ---------- HUD pops ----------
  const pops = [];

  // ---------- main loop ----------
  let W = 1, H = 1;
  function fit() { W = canvas.clientWidth; H = canvas.clientHeight; renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = W < 700 ? 60 : 42; camera.updateProjectionMatrix(); }
  addEventListener('resize', fit); fit();

  let last = performance.now(), acc = 0, lastPhase = '', lastActive = null, lastBeep = -1, hudT = 0;
  const STEP = 1 / 120;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (loaded) {
      buildT += dt;
      // the robot assembles itself once, subsystem by subsystem
      for (const a of assemble) {
        const u = clamp((buildT - 0.3 - a.delay) / 0.7, 0, 1), e = 1 - (1 - u) ** 3;
        a.o.position.copy(a.home).addScaledVector(a.from, 1 - e);
        a.o.visible = u > 0;
      }
    }
    if (loaded && running && !paused) {
      acc += dt;
      while (acc >= STEP) { tick(STEP); acc -= STEP; }
    } else acc = 0;
    if (loaded && !running) { stepBalls(dt * 0.5, [bot]); }

    // draw robots
    for (const r of [bot]) {
      r.group.position.set(r.x, r.y, r.z); r.group.rotation.y = r.yaw;
      r.tilt.rotation.set(r.pitch, 0, r.roll);
    }
    if (bot.hopper && bot.hopBox) {
      const hb = bot.hopBox, nx = Math.max(1, Math.floor((hb.max.x - hb.min.x) / (2 * R))), nz = Math.max(1, Math.floor((hb.max.z - hb.min.z) / (2 * R)));
      const ny = Math.max(1, Math.floor((hb.max.y - hb.min.y) / (1.7 * R)) + 1);
      const n = Math.min(bot.held, nx * nz * ny);
      for (let i = 0; i < n; i++) {
        const ix = i % nx, iz = Math.floor(i / nx) % nz, iy = Math.floor(i / (nx * nz));
        M4.makeTranslation(hb.min.x + R + ix * 2 * R + (iy % 2) * R * 0.5, hb.min.y + R + iy * 1.7 * R, hb.min.z + R + iz * 2 * R);
        bot.hopper.setMatrixAt(i, M4);
      }
      bot.hopper.count = buildT > 1.6 ? n : 0; bot.hopper.instanceMatrix.needsUpdate = true;   // preload drops in once the hopper exists
    }
    // spin rollers: intake while collecting, hopper and drum while shooting
    if (bot.held === 0 && !bot.volley.length) bot.aim = null;
    const shooting = (bot.aim && bot.held > 0) || bot.volley.length > 0;
    for (const sp of bot.spinners) {
      if (!sp.dir) continue;
      const rate = sp.kind === 'intake' ? (bot.intake ? 16 : 0) : sp.kind === 'hopper' ? (shooting ? 14 : 2) : (shooting ? 40 : 6);
      sp.pivot.rotateOnAxis(sp.ax, dt * sp.dir * rate);
    }
    // FUEL
    let n = 0;
    for (let i = 0; i < nBalls; i++) { if (St[i] !== 1) continue; M4.makeTranslation(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); fuel.setMatrixAt(n++, M4); }
    fuel.count = n; fuel.instanceMatrix.needsUpdate = true;
    let tn = 0;
    for (let i = 0; i < nBalls && tn < TRAILS; i++) {
      if (St[i] !== 1 || P[i * 3 + 1] < 0.35) continue;
      const vx = V[i * 3], vy = V[i * 3 + 1], vz = V[i * 3 + 2];
      if (vx * vx + vy * vy + vz * vz < 9) continue;
      const o = tn * 6; trailPos[o] = P[i * 3]; trailPos[o + 1] = P[i * 3 + 1]; trailPos[o + 2] = P[i * 3 + 2];
      trailPos[o + 3] = P[i * 3] - vx * 0.045; trailPos[o + 4] = P[i * 3 + 1] - vy * 0.045; trailPos[o + 5] = P[i * 3 + 2] - vz * 0.045; tn++;
    }
    trailGeo.setDrawRange(0, tn * 2); trailGeo.attributes.position.needsUpdate = true;
    // the crowd bounces a little while the match is on
    if (arenaCrowd && running) {
      const b = arenaCrowd.userData.base, tt = performance.now() / 1000;
      for (let i = 0; i < b.length; i += 3) { M4.makeTranslation(b[i][0], b[i][1] + 0.27 + Math.max(0, Math.sin(tt * 7 + i)) * 0.05, b[i][2]); arenaCrowd.setMatrixAt(i, M4); }
      arenaCrowd.instanceMatrix.needsUpdate = true;
    }

    // hub lights: lit when active, dark when not, blinking through the last three seconds
    for (const a in hubs) {
      const on = hubActiveAt(a, match.t), flip = running ? nextFlip(a, match.t) : null;
      const blink = flip !== null && flip < 3 && Math.floor(match.t * 4) % 2 === 0;
      const c = (on !== blink ? hubs[a].col : new THREE.Color(0x1a1b1f)).clone();
      hubs[a].flash = Math.max(0, (hubs[a].flash || 0) - dt * 4);
      if (hubs[a].flash > 0) c.lerp(new THREE.Color(0xffffff), hubs[a].flash * 0.8);
      hubs[a].light.forEach(m => m.color.copy(c));
    }

    placeCamera(dt, false);
    sfx.motor(Math.hypot(bot.vx, bot.vz));

    hudT -= dt;
    if (hudT <= 0 && loaded) { hudT = 0.05; updateHud(); }
    for (let k = pops.length - 1; k >= 0; k--) { pops[k].t += dt; if (pops[k].t > 0.9) pops.splice(k, 1); }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function tick(dt) {
    const t = match.t;
    const inGap = match.mode === 'match' && t >= T_AUTO && t < T_AUTO + T_GAP;
    const robots = [bot];
    const cmd = inGap ? { vx: 0, vz: 0, w: 0 } : playerCmd(dt);
    if (inGap) bot.aim = null;
    bot.feeding = false;
    stepRobot(bot, cmd, dt);
    releaseVolley(bot, dt);
    stepBalls(dt, robots);
    stepOutposts(dt, robots);
    stepReturns(t);
    const sp = Math.hypot(bot.vx, bot.vz);
    match.stats.dist += sp * dt; match.stats.top = Math.max(match.stats.top, sp);
    match.t += dt;
    // who won auto decides which hub goes dark first
    if (match.mode === 'match' && match.firstInactive === null && match.t >= T_AUTO) {
      const r = match.auto.red, b = match.auto.blue;
      match.firstInactive = r > b ? 'red' : b > r ? 'blue' : (Math.random() < 0.5 ? 'red' : 'blue');
    }
    if (match.mode === 'match' && match.t >= T_END) endMatch();
  }

  function updateHud() {
    const ph = phaseInfo(match.t), a = bot.alliance;
    const active = hubActiveAt(a, match.t), flip = match.mode === 'match' ? nextFlip(a, match.t) : null;
    if (ph.name !== lastPhase) {
      if (running && lastPhase) { if (ph.name === 'AUTO → TELEOP') sfx.buzzer(); else if (/SHIFT|ENDGAME|TRANSITION/.test(ph.name)) sfx.bell(); }
      lastPhase = ph.name;
    }
    if (running && flip !== null && flip < 3.05) { const b = Math.ceil(flip); if (b !== lastBeep) { lastBeep = b; sfx.beep(); } } else lastBeep = -1;
    if (lastActive !== active) lastActive = active;
    let sol = null;
    if (running && bot.held > 0) sol = solve(bot, a);
    ui.hud({
      phase: ph.name, clock: ph.clock, score: match.score, alliance: a, active, flip, mode: match.mode,
      held: bot.held, cap: bot.cap, intake: bot.intake, feeding: bot.feeding,
      speed: Math.hypot(bot.vx, bot.vz), dist: sol ? sol.d : null, aiming: !!bot.aim, aimErr: bot.aim ? bot.aim.err : 0,
      auto: match.mode === 'match' && match.t < T_AUTO, pops: pops.map(p => p.t), made: match.stats.made, shots: match.stats.shots,
      outpost: outposts[a].stock,
    });
  }

  function endMatch() {
    running = false; sfx.buzzer();
    match.mode = 'results';
    const s = match.stats;
    ui.results({ ...s, score: match.score[bot.alliance], alliance: bot.alliance });
  }

  resetMatch(false);
  requestAnimationFrame(frame);

  window.__game = { bot, match, colliders, get nBalls() { return nBalls; }, St, P, keys, solve, hubs, get running() { return running; }, get cameraMode() { return cameraMode; } };
  return {
    start(opts) {
      sfx.unlock();
      resetMatch(false, opts);
      ui.countdown(() => { running = true; sfx.start(); lastPhase = ''; }, sfx.beep);
      placeCamera(0, false);
    },
    menu() { running = false; paused = false; match.mode = 'menu'; resetMatch(false); },
    resume() { if (paused) togglePause(); },
    restart() { const o = { alliance: bot.alliance, mode: match.mode === 'results' ? 'match' : match.mode }; paused = false; ui.paused(false); this.start(o); },
    setMuted(m) { sfx.muted = m; },
    setAssist(a) { assist = a; },
    get loaded() { return loaded; },
  };
}
