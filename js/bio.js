// bio.js
// Living cells as metaballs. Each cell is one ball in a marching-cubes
// field, so when two cells press together their membranes merge and
// when one divides it pinches in the middle like real cytokinesis.
// Cells drift, jostle, avoid your cursor, divide on their own, and the
// oldest ones die off (apoptosis) to keep the population steady.

import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MAX = 24, START = 15, STR = 0.3;
const ISO = 80, SUB = 12;

export function initCells(canvas, onCount) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 11);

  const SCALE = 4.2;
  // a membrane you see through at the middle and edge-on at the rim,
  // the way a cell looks under a phase-contrast microscope
  const membrane = new THREE.MeshPhysicalMaterial({
    color: 0xff8fb5, roughness: 0.15, metalness: 0, transparent: true, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.7, iridescenceIOR: 1.3,
    emissive: 0x5a0f2c, sheen: 1, sheenColor: new THREE.Color(0xffc6da),
  });
  membrane.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float rimK = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.a = mix(0.14, 0.92, pow(rimK, 1.7));`);
  };
  const field = new MarchingCubes(68, membrane, true, false, 90000);
  field.isolation = ISO;
  field.scale.setScalar(SCALE);
  scene.add(field);

  // nuclei and organelles live inside the membranes
  const nucleusGeo = new THREE.SphereGeometry(0.19, 24, 16);
  const nucleusMat = new THREE.MeshStandardMaterial({ color: 0x7a2cc4, roughness: 0.4, emissive: 0x2c0a55 });
  const nuclei = new THREE.InstancedMesh(nucleusGeo, nucleusMat, MAX * 2);
  scene.add(nuclei);
  const orgGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const orgMat = new THREE.MeshBasicMaterial({ color: 0xffe07a });
  const ORG = 6;
  const organelles = new THREE.InstancedMesh(orgGeo, orgMat, MAX * 2 * ORG);
  scene.add(organelles);

  scene.add(new THREE.AmbientLight(0xffc4d8, 0.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 6); scene.add(key);
  const rim = new THREE.PointLight(0xff3d82, 40, 30); rim.position.set(-4, -2, 3); scene.add(rim);

  // ── cells, in marching-cubes space (0..1) ───────────────────────
  const cells = [];
  const R = Math.sqrt(STR / (ISO + SUB));         // radius of a full-grown cell
  function makeCell(x, y, z, grow = 1) {
    const c = {
      x, y, z, vx: 0, vy: 0, vz: 0, s: grow, sTarget: 1, age: 0,
      phase: Math.random() * 6.28, sibling: null, splitT: 0, dying: false,
      org: Array.from({ length: ORG }, () => [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]),
    };
    cells.push(c);
    return c;
  }
  for (let i = 0; i < START; i++) makeCell(0.25 + Math.random() * 0.5, 0.25 + Math.random() * 0.5, 0.42 + Math.random() * 0.16);

  function divide(c) {
    if (cells.filter(x => !x.dying).length >= MAX) {
      const old = cells.filter(x => !x.dying).sort((a, b) => b.age - a.age)[0];
      if (old && old !== c) old.dying = true;
    }
    const a = Math.random() * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const d = makeCell(c.x, c.y, c.z, c.s);
    d.age = 0; c.age = 0;
    c.sibling = d; d.sibling = c; c.splitT = d.splitT = 1.6;
    c.dir = [dx, dy]; d.dir = [-dx, -dy];
    c.s = d.s = 0.62; c.sTarget = d.sTarget = 1; c.seeded = d.seeded = false;
  }

  // ── the cursor, projected onto the dish plane ───────────────────
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const cursor = { x: 0, y: 0, on: false };
  function toField(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return [(hit.x / SCALE + 1) / 2, (hit.y / SCALE + 1) / 2];
  }
  // the canvas sits under text, so listen on the section
  const host = canvas.parentElement;
  host.addEventListener('pointermove', e => { const p = toField(e); if (p) { [cursor.x, cursor.y] = p; cursor.on = true; } });
  host.addEventListener('pointerleave', () => { cursor.on = false; });
  host.addEventListener('click', e => {
    if (e.target.closest('a, button')) return;
    const p = toField(e); if (!p) return;
    const c = makeCell(p[0], p[1], 0.5, 0.2);
    c.sTarget = 1; c.seeded = true;       // a seeded cell grows, then splits soon
    if (cells.filter(x => !x.dying).length > MAX) cells.filter(x => !x.dying).sort((a, b) => b.age - a.age)[0].dying = true;
  });

  // ── layout ──────────────────────────────────────────────────────
  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // wide screens push the dish right so the headline has room
    camera.setViewOffset(w, h, w > 900 ? -w * 0.16 : 0, 0, w, h);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit); fit();

  // ── simulation ──────────────────────────────────────────────────
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  let divideClock = 2.5, active = false, last = performance.now(), countShown = -1;

  function step(dt, t) {
    divideClock -= dt;
    const live = cells.filter(c => !c.dying);
    if (divideClock <= 0) {
      divideClock = 3 + Math.random() * 2.5;
      const ready = live.filter(c => c.age > 4 && c.splitT <= 0 && c.s > 0.9);
      if (ready.length) divide(ready[Math.floor(Math.random() * ready.length)]);
    }
    for (const c of cells) if (c.age > 7.5 && c.splitT <= 0 && c.s > 0.95 && c.seeded) divide(c);

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      c.age += dt;
      c.s += ((c.dying ? 0 : c.sTarget) - c.s) * Math.min(1, dt * (c.dying ? 0.9 : 0.8));
      // brownian wander
      c.vx += (Math.sin(t * 0.7 + c.phase) * 0.012 + (Math.random() - 0.5) * 0.02) * dt;
      c.vy += (Math.cos(t * 0.6 + c.phase * 1.3) * 0.012 + (Math.random() - 0.5) * 0.02) * dt;
      c.vz += ((0.5 - c.z) * 0.6 + (Math.random() - 0.5) * 0.01) * dt;
      // daughters push apart until the pinch completes
      if (c.splitT > 0) {
        c.splitT -= dt;
        c.vx += c.dir[0] * 0.09 * dt; c.vy += c.dir[1] * 0.09 * dt;
      }
      // neighbors jostle
      for (let j = i + 1; j < cells.length; j++) {
        const o = cells[j];
        if (c.splitT > 0 && c.sibling === o) continue;
        const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z;
        const d = Math.hypot(dx, dy, dz) || 1e-4;
        const want = R * (Math.sqrt(c.s) + Math.sqrt(o.s)) * 1.3;
        if (d < want) {
          const f = (want - d) * 5 * dt / d;
          c.vx += dx * f; c.vy += dy * f; c.vz += dz * f;
          o.vx -= dx * f; o.vy -= dy * f; o.vz -= dz * f;
        }
      }
      // your cursor is a hand in the dish
      if (cursor.on) {
        const dx = c.x - cursor.x, dy = c.y - cursor.y, d = Math.hypot(dx, dy) || 1e-4;
        if (d < 0.14) { const f = (0.14 - d) * 1.4 * dt / d; c.vx += dx * f; c.vy += dy * f; }
      }
      // the dish wall
      const lo = 0.1, hi = 0.9;
      if (c.x < lo) c.vx += (lo - c.x) * 2 * dt; if (c.x > hi) c.vx -= (c.x - hi) * 2 * dt;
      if (c.y < lo) c.vy += (lo - c.y) * 2 * dt; if (c.y > hi) c.vy -= (c.y - hi) * 2 * dt;
      const damp = Math.exp(-2.2 * dt);
      c.vx *= damp; c.vy *= damp; c.vz *= damp;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    }
    for (let i = cells.length - 1; i >= 0; i--) if (cells[i].dying && cells[i].s < 0.04) cells.splice(i, 1);
  }

  function draw(t) {
    field.reset();
    let n = 0, o = 0;
    for (const c of cells) {
      const pulse = 1 + 0.04 * Math.sin(t * 1.6 + c.phase);
      field.addBall(c.x, c.y, c.z, Math.max(c.s, 0.001) * pulse * STR, SUB);
      const wx = (c.x * 2 - 1) * SCALE, wy = (c.y * 2 - 1) * SCALE, wz = (c.z * 2 - 1) * SCALE;
      const ns = Math.max(0.001, c.s);
      m4.compose(v3.set(wx, wy, wz), q, sc.setScalar(ns)); nuclei.setMatrixAt(n++, m4);
      for (const p of c.org) {
        const a = t * 0.5 + c.phase;
        const ox = (p[0] * Math.cos(a) - p[1] * Math.sin(a)) * 0.7 * ns, oy = (p[0] * Math.sin(a) + p[1] * Math.cos(a)) * 0.7 * ns;
        m4.compose(v3.set(wx + ox, wy + oy, wz + p[2] * 0.4 * ns), q, sc.setScalar(ns)); organelles.setMatrixAt(o++, m4);
      }
    }
    nuclei.count = n; organelles.count = o;
    nuclei.instanceMatrix.needsUpdate = true; organelles.instanceMatrix.needsUpdate = true;
    field.update();
    field.rotation.set(0, 0, 0);
    renderer.render(scene, camera);
    const live = cells.filter(c => !c.dying).length;
    if (live !== countShown) { countShown = live; onCount(live); }
  }

  function frame(now) {
    if (!active) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    step(dt, now / 1000);
    draw(now / 1000);
    requestAnimationFrame(frame);
  }

  window.__cells = { cells, divide };
  return {
    setActive(on) {
      if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(frame); }
      else if (!on) active = false;
    },
  };
}
