// code.js
// A sea of source. Every point is one character of this site's own
// JavaScript, laid out row by row like the file itself and scrolling
// slowly, rendered from a glyph atlas on a rolling wave surface. Drag
// across it and you drop ripples that spread and fade over several
// seconds; the surface keeps the last dozen.

import * as THREE from 'three';

const COLS = 168, ROWS = 96, GAP = 0.34, RIPPLES = 12;

export function initCode(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);

  // ── glyph atlas from the characters the code actually uses ──────
  let source = 'const sea = code.map(ch => wave(ch));';
  const glyphs = [];
  const index = new Map();
  const ATLAS = 16, CELL = 64;
  const atlasCv = document.createElement('canvas');
  atlasCv.width = atlasCv.height = ATLAS * CELL;
  const ag = atlasCv.getContext('2d');
  const atlas = new THREE.CanvasTexture(atlasCv);
  atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.anisotropy = 8;
  function buildAtlas() {
    ag.clearRect(0, 0, atlasCv.width, atlasCv.height);
    ag.fillStyle = '#fff'; ag.textAlign = 'center'; ag.textBaseline = 'middle';
    ag.font = `500 ${CELL * 0.72}px "JetBrains Mono", ui-monospace, monospace`;
    glyphs.length = 0; index.clear();
    for (const ch of source) {
      if (ch.trim() === '' || index.has(ch) || glyphs.length >= ATLAS * ATLAS) continue;
      index.set(ch, glyphs.length); glyphs.push(ch);
    }
    glyphs.forEach((ch, i) => ag.fillText(ch, (i % ATLAS + 0.5) * CELL, (Math.floor(i / ATLAS) + 0.55) * CELL));
    atlas.needsUpdate = true;
  }

  // ── the grid ────────────────────────────────────────────────────
  const N = COLS * ROWS;
  const pos = new Float32Array(N * 3), glyph = new Float32Array(N);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c;
    pos[i * 3] = (c - COLS / 2) * GAP; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = (r - ROWS / 2) * GAP * 1.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const glyphAttr = new THREE.BufferAttribute(glyph, 1); glyphAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aGlyph', glyphAttr);

  const rip = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0));
  const uniforms = {
    uTime: { value: 0 }, uAtlas: { value: atlas }, uRipples: { value: rip },
    uPx: { value: renderer.getPixelRatio() }, uCursor: { value: new THREE.Vector3(0, 0, -99) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uPx; uniform vec4 uRipples[${RIPPLES}]; uniform vec3 uCursor;
      attribute float aGlyph;
      varying float vGlyph, vH, vLit, vFog;
      void main() {
        vec3 p = position;
        float h = sin(p.x * 0.35 + uTime * 0.9) * 0.35 + sin(p.z * 0.5 - uTime * 0.7) * 0.28
                + sin((p.x + p.z) * 0.18 + uTime * 0.4) * 0.5;
        float lit = 0.0;
        for (int i = 0; i < ${RIPPLES}; i++) {
          vec4 r = uRipples[i];
          float age = uTime - r.z;
          if (age < 0.0 || age > 9.0) continue;
          float d = distance(p.xz, r.xy);
          float front = d - age * 5.5;
          float env = exp(-front * front * 0.6) * exp(-age * 0.45) * r.w;
          h += sin(front * 2.2) * env * 1.4;
          lit += env;
        }
        float dc = distance(p.xz, uCursor.xy);
        float near = exp(-dc * dc * 0.08) * step(0.0, uCursor.z);
        h += near * 0.9;
        p.y = h;
        vH = h; vLit = lit + near; vGlyph = aGlyph;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (150.0 + 90.0 * clamp(lit + near, 0.0, 1.0)) / -mv.z;
        vFog = 1.0 - exp(-0.0008 * mv.z * mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uAtlas;
      varying float vGlyph, vH, vLit, vFog;
      void main() {
        vec2 cell = vec2(mod(vGlyph, 16.0), floor(vGlyph / 16.0));
        vec2 uv = vec2((cell.x + gl_PointCoord.x) / 16.0, 1.0 - (cell.y + gl_PointCoord.y) / 16.0);
        float a = texture2D(uAtlas, uv).a;
        if (a < 0.05) discard;
        vec3 deep = vec3(0.22, 0.30, 0.78), crest = vec3(0.62, 0.72, 1.0), hot = vec3(1.0, 0.95, 0.85);
        vec3 col = mix(deep, crest, smoothstep(-0.8, 1.2, vH));
        col = mix(col, hot, clamp(vLit, 0.0, 1.0));
        gl_FragColor = vec4(col, a * (0.55 + 0.45 * clamp(vLit, 0.0, 1.0)) * (1.0 - vFog));
      }`,
  });
  const sea = new THREE.Points(geo, mat);
  scene.add(sea);

  let scroll = 0;
  function writeGlyphs() {
    const L = source.length;
    for (let r = 0; r < ROWS; r++) {
      // lay the source out line by line, like the file itself
      for (let c = 0; c < COLS; c++) {
        const ch = source[(r * COLS + c + scroll) % L];
        glyph[r * COLS + c] = index.has(ch) ? index.get(ch) : (index.get('.') ?? 0);
      }
    }
    glyphAttr.needsUpdate = true;
  }

  // read our own code, then build the sea from it
  Promise.all(['js/site.js', 'js/bio.js', 'js/robot.js', 'js/code.js'].map(u => fetch(u).then(r => r.text()).catch(() => '')))
    .then(parts => {
      const text = parts.join('\n').replace(/\s+/g, ' ');
      if (text.length > 200) source = text;
      return document.fonts ? document.fonts.load('32px "JetBrains Mono"') : null;
    })
    .catch(() => {})
    .finally(() => { buildAtlas(); writeGlyphs(); });

  // ── pointer: hover lifts the sea, drag drops ripples ────────────
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let ri = 0, lastDrop = 0, down = false;
  const host = canvas.parentElement;
  function toSea(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }
  function drop(p, strength) {
    rip[ri].set(p.x, p.z, uniforms.uTime.value, strength);
    ri = (ri + 1) % RIPPLES;
  }
  host.addEventListener('pointerdown', e => { if (e.target.closest('a, button')) return; down = true; const p = toSea(e); if (p) drop(p, 1); });
  addEventListener('pointerup', () => { down = false; });
  host.addEventListener('pointermove', e => {
    const p = toSea(e);
    if (!p) return;
    uniforms.uCursor.value.set(p.x, p.z, 1);
    const now = performance.now();
    if (down && now - lastDrop > 90) { lastDrop = now; drop(p, 0.8); }
  });
  host.addEventListener('pointerleave', () => { uniforms.uCursor.value.z = -99; });

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', fit); fit();

  let active = false, t0 = performance.now(), acc = 0, last = t0;
  function frame(now) {
    if (!active) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const t = (now - t0) / 1000;
    uniforms.uTime.value = t;
    acc += dt;
    if (acc > 0.22) { acc = 0; scroll += 1; writeGlyphs(); }
    // a slow drift over the water
    camera.position.set(Math.sin(t * 0.05) * 3, 7.5 + Math.sin(t * 0.13) * 0.4, 16);
    camera.lookAt(0, 0, -4);
    // an occasional ripple so the sea is never still
    if (Math.random() < dt * 0.25) drop(new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 20), 0.5);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  window.__sea = { rip, glyphs: () => glyphs.length, source: () => source.length };
  return {
    setActive(on) {
      if (on && !active) { active = true; last = performance.now(); requestAnimationFrame(frame); }
      else if (!on) active = false;
    },
  };
}
