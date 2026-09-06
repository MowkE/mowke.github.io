// main.js
// The orrery, as a playground. Nine projects on real gravitational orbits,
// integrated with leapfrog every frame. Grab a body and throw it and it
// climbs onto a real ellipse. Grab the sun and everything lurches and
// settles. Drag empty sky to scrub time, forward or backward. Your cursor
// has a little gravity of its own. Click a body and you fall into it.
// Turn on harmony and every body plays the note of its orbital period,
// which is the oldest idea in this whole field: Kepler wrote it down in
// 1619. The footer keeps the receipt, T^2 / a^3 measured beside 4pi^2/GM.

const canvas = document.getElementById('orrery');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('tip');
const tipName = tip.querySelector('.tip-name');
const tipLine = tip.querySelector('.tip-line');
const tipOrbit = tip.querySelector('.tip-orbit');
const keplerOut = document.getElementById('kepler');
const tmOut = document.getElementById('tm');
const rateOut = document.getElementById('rate');
const harmBtn = document.getElementById('harm');
const fly = document.getElementById('fly');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = '236,230,216';

// ------------------------------------------------------------ bodies

const rows = [...document.querySelectorAll('#rows a')];
rows.forEach(a => { if (a.dataset.color !== 'spectrum') a.querySelector('.swatch').style.setProperty('--c', a.dataset.color); });

const T0 = 9;                                   // inner period, seconds
const GM = (4 * Math.PI * Math.PI) / (T0 * T0); // sets the sun's pull
const GMP = GM * 0.045;                         // the cursor's pull
const SOFT = 0.12, PSOFT = 0.3;
const R_MAX = 1 + (rows.length - 1) * 0.5;

const sun = { x: 0, y: 0, vx: 0, vy: 0, drag: false };
const pointer = { x: 0, y: 0, in: false, trail: [] };

const bodies = rows.map((a, i) => {
  const r = 1 + i * 0.5;
  const th = Math.random() * Math.PI * 2;
  const v = Math.sqrt(GM / r);
  return {
    el: a, name: a.querySelector('.name').textContent, url: a.href, line: a.dataset.line,
    receipt: a.querySelector('.receipt'), receiptText: a.dataset.receipt,
    color: a.dataset.color, r0: r, size: 4.6 + (i % 3) * 1.2,
    x: Math.cos(th) * r, y: Math.sin(th) * r,
    vx: -Math.sin(th) * v, vy: Math.cos(th) * v,
    trail: [], hot: false, drag: false, tween: null, prevDr: 0,
  };
});

// ------------------------------------------------------------ layout

let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, S = 1;
function fit() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const wide = W > 860;
  cx = wide ? W * 0.63 : W * 0.5;
  cy = wide ? H * 0.5 : H * 0.52;
  const avail = wide ? Math.min(W * 0.66, H) : Math.min(W, H);
  S = (avail * 0.46) / (R_MAX * 1.02);
}
const toPx = o => [cx + o.x * S, cy - o.y * S];
const toSim = (px, py) => [(px - cx) / S, -(py - cy) / S];
addEventListener('resize', fit);
fit();

// ------------------------------------------------------------ physics

let simT = 0, rate = 1, rateTarget = 1, scrubbing = false;

function accel(b) {
  const dx = b.x - sun.x, dy = b.y - sun.y;
  const d2 = dx * dx + dy * dy + SOFT * SOFT;
  const inv = -GM / (d2 * Math.sqrt(d2));
  let ax = dx * inv, ay = dy * inv;
  if (pointer.in && !scrubbing && !reduced) {
    const px = b.x - pointer.x, py = b.y - pointer.y;
    const p2 = px * px + py * py + PSOFT * PSOFT;
    const pinv = -GMP / (p2 * Math.sqrt(p2));
    ax += px * pinv; ay += py * pinv;
  }
  return [ax, ay];
}
function step(dt) {
  for (const b of bodies) {
    if (b.drag || b.tween) continue;
    let [ax, ay] = accel(b);
    b.vx += 0.5 * ax * dt; b.vy += 0.5 * ay * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    [ax, ay] = accel(b);
    b.vx += 0.5 * ax * dt; b.vy += 0.5 * ay * dt;
  }
  if (!sun.drag) {
    // a spring brings a thrown sun home; the planets have to catch up
    const k = 16, c = 7.2;
    sun.vx += (-k * sun.x - c * sun.vx) * dt;
    sun.vy += (-k * sun.y - c * sun.vy) * dt;
    sun.x += sun.vx * dt; sun.y += sun.vy * dt;
  }
}

/** orbital elements relative to the sun: a from energy, T from Kepler */
function elements(b) {
  const dx = b.x - sun.x, dy = b.y - sun.y, vx = b.vx - sun.vx, vy = b.vy - sun.vy;
  const r = Math.max(Math.hypot(dx, dy), 0.06), v2 = vx * vx + vy * vy;
  const E = v2 / 2 - GM / r;
  const a = E < 0 ? -GM / (2 * E) : Infinity;
  const T = isFinite(a) ? 2 * Math.PI * Math.sqrt((a * a * a) / GM) : Infinity;
  return { r, a, T, E, dr: dx * vx + dy * vy };
}

/** keep every throw on the chart: bound, apoapsis inside the frame, no sun dives */
function leash(b) {
  const dx = b.x - sun.x, dy = b.y - sun.y, r = Math.max(Math.hypot(dx, dy), 0.06);
  const aMax = R_MAX * 1.12;
  const { a } = elements(b);
  if (!(a > 0 && a < aMax)) {
    const v2 = 2 * (-GM / (2 * aMax) + GM / r);
    const vx = b.vx - sun.vx, vy = b.vy - sun.vy, v = Math.hypot(vx, vy) || 1e-6;
    const k = Math.sqrt(Math.max(v2, 0.02)) / v;
    b.vx = sun.vx + vx * k; b.vy = sun.vy + vy * k;
  }
  const vmin = 0.35 * Math.sqrt(GM / r);
  const rvx = b.vx - sun.vx, rvy = b.vy - sun.vy;
  if (Math.hypot(rvx, rvy) < vmin) { b.vx += (-dy / r) * vmin; b.vy += (dx / r) * vmin; }
}

/** a body that lost the plot goes straight back to its circle */
function homeBody(b) {
  const th = Math.random() * Math.PI * 2, v = Math.sqrt(GM / b.r0);
  b.x = sun.x + Math.cos(th) * b.r0; b.y = sun.y + Math.sin(th) * b.r0;
  b.vx = sun.vx - Math.sin(th) * v; b.vy = sun.vy + Math.cos(th) * v;
  b.trail.length = 0; b.tween = null;
}

/** send every body back to its printed circle, on a short tween */
function reset() {
  const now = performance.now();
  for (const b of bodies) {
    const dx = b.x - sun.x, dy = b.y - sun.y, th = Math.atan2(dy, dx);
    b.tween = { fx: b.x, fy: b.y, tx: sun.x + Math.cos(th) * b.r0, ty: sun.y + Math.sin(th) * b.r0, th, t0: now, dur: 640 };
    b.trail.length = 0;
  }
}
function tweens(now) {
  for (const b of bodies) {
    const t = b.tween; if (!t) continue;
    const k = Math.max(0, Math.min(1, (now - t.t0) / t.dur)), e = 1 - Math.pow(1 - k, 3);
    b.x = t.fx + (t.tx - t.fx) * e; b.y = t.fy + (t.ty - t.fy) * e;
    if (k >= 1) {
      const v = Math.sqrt(GM / b.r0);
      b.vx = sun.vx - Math.sin(t.th) * v; b.vy = sun.vy + Math.cos(t.th) * v;
      b.tween = null;
    }
  }
}

// ------------------------------------------------------------ test particles

const stars = [];
function fireStar(x, y) {
  const dx = x - sun.x, dy = y - sun.y, r = Math.max(Math.hypot(dx, dy), 0.2);
  const vc = Math.sqrt(GM / r) * (0.55 + Math.random() * 0.4), sgn = Math.random() < 0.5 ? -1 : 1;
  const nx = -dy / r * sgn, ny = dx / r * sgn;
  stars.push({ x, y, vx: nx * vc + (Math.random() - 0.5) * 0.3, vy: ny * vc + (Math.random() - 0.5) * 0.3, born: performance.now(), trail: [] });
  if (stars.length > 40) stars.shift();
  if (harmony && audio) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = 1568;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.03, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
    o.connect(g).connect(audio.master); o.start(); o.stop(audio.currentTime + 0.55);
  }
}
function stepStars(dt) {
  for (const st of stars) {
    let [ax, ay] = accel(st);
    st.vx += 0.5 * ax * dt; st.vy += 0.5 * ay * dt;
    st.x += st.vx * dt; st.y += st.vy * dt;
    [ax, ay] = accel(st);
    st.vx += 0.5 * ax * dt; st.vy += 0.5 * ay * dt;
  }
  const now = performance.now();
  for (let i = stars.length - 1; i >= 0; i--) {
    const st = stars[i];
    if (now - st.born > 9000 || Math.hypot(st.x - sun.x, st.y - sun.y) > R_MAX * 1.5 || !isFinite(st.x + st.y)) stars.splice(i, 1);
  }
}

// ------------------------------------------------------------ harmony

let audio = null, harmony = false;
const PENTA = [0, 2, 4, 7, 9];
function noteFor(T) {
  // the inner circle is C5; every doubling of the period drops a fifth
  const semis = -7 * Math.log2(T / T0);
  const oct = Math.floor(semis / 12), inOct = semis - oct * 12;
  let best = PENTA[0], bd = 99;
  for (const p of PENTA) { const d = Math.abs(p - inOct); if (d < bd) { bd = d; best = p; } }
  return 523.25 * Math.pow(2, (oct * 12 + best) / 12);
}
function harmonyOn() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    const master = audio.createGain(); master.gain.value = 0; master.connect(audio.destination);
    audio.master = master;
    for (const b of bodies) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = noteFor(elements(b).T); g.gain.value = 0.028;
      o.connect(g).connect(master); o.start();
      b.osc = o; b.gain = g;
    }
  }
  audio.resume();
  audio.master.gain.setTargetAtTime(0.7, audio.currentTime, 0.6);
  harmony = true; harmBtn.classList.add('on'); harmBtn.textContent = '♪ harmony on';
}
function harmonyOff() {
  if (audio) audio.master.gain.setTargetAtTime(0, audio.currentTime, 0.25);
  harmony = false; harmBtn.classList.remove('on'); harmBtn.textContent = '♪ harmony off';
}
function pluck(b) {
  if (!harmony || !audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'triangle'; o.frequency.value = noteFor(elements(b).T) * 2;
  g.gain.setValueAtTime(0.0001, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.06, audio.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.4);
  o.connect(g).connect(audio.master); o.start(); o.stop(audio.currentTime + 0.45);
}
function tune() {
  if (!audio) return;
  for (const b of bodies) {
    const { T } = elements(b);
    if (isFinite(T)) b.osc.frequency.setTargetAtTime(noteFor(T), audio.currentTime, 0.08);
  }
}
harmBtn.addEventListener('click', () => (harmony ? harmonyOff() : harmonyOn()));

// ------------------------------------------------------------ drawing

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function bodyFill(b, px, py, t) {
  if (b.color !== 'spectrum') return b.color;
  const cg = ctx.createConicGradient(t * 0.6, px, py);
  ['#ff5a5a', '#ffb000', '#7fe06f', '#4cc9f0', '#8f77ef', '#ff5a5a'].forEach((c, i, arr) => cg.addColorStop(i / (arr.length - 1), c));
  return cg;
}

function draw(t) {
  ctx.clearRect(0, 0, W, H);
  const [sx, sy] = toPx(sun);

  // the printed chart follows the sun; the circles are what was drawn on paper
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  ctx.strokeStyle = `rgba(${INK},0.13)`;
  for (const b of bodies) { ctx.beginPath(); ctx.arc(sx, sy, b.r0 * S, 0, Math.PI * 2); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(${INK},0.22)`;
  const rl = R_MAX * S;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, L = k % 6 === 0 ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * rl, sy + Math.sin(a) * rl);
    ctx.lineTo(sx + Math.cos(a) * (rl + L), sy + Math.sin(a) * (rl + L));
    ctx.stroke();
  }

  // what actually happened
  for (const b of bodies) {
    if (b.trail.length < 2) continue;
    ctx.lineWidth = 1.2;
    for (let i = 1; i < b.trail.length; i++) {
      const k = i / b.trail.length;
      ctx.strokeStyle = b.color === 'spectrum' ? `hsla(${(k * 360) | 0},85%,65%,${0.05 + k * 0.4})` : hexA(b.color, 0.04 + k * 0.42);
      ctx.beginPath(); ctx.moveTo(...b.trail[i - 1]); ctx.lineTo(...b.trail[i]); ctx.stroke();
    }
  }

  // test particles, streaking the field
  for (const st of stars) {
    const age = (performance.now() - st.born) / 9000, fade = 1 - age;
    for (let i = 1; i < st.trail.length; i++) {
      const k = i / st.trail.length;
      ctx.strokeStyle = `rgba(${INK},${k * 0.55 * fade})`; ctx.lineWidth = 0.8 + k * 1.2;
      ctx.beginPath(); ctx.moveTo(...st.trail[i - 1]); ctx.lineTo(...st.trail[i]); ctx.stroke();
    }
    const [px, py] = toPx(st);
    ctx.fillStyle = `rgba(${INK},${0.95 * fade})`;
    ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  // your comet
  if (pointer.in && !reduced) {
    for (let i = 1; i < pointer.trail.length; i++) {
      const k = i / pointer.trail.length;
      ctx.strokeStyle = `rgba(${INK},${k * 0.35})`; ctx.lineWidth = 1 + k;
      ctx.beginPath(); ctx.moveTo(...pointer.trail[i - 1]); ctx.lineTo(...pointer.trail[i]); ctx.stroke();
    }
    const [px, py] = toPx(pointer);
    ctx.fillStyle = `rgba(${INK},0.9)`;
    ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  // the sun, breathing when it sings
  const puls = harmony ? 1 + 0.08 * Math.sin(t * 2.2) : 1;
  const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 30 * puls);
  g.addColorStop(0, `rgba(${INK},${sun.drag ? 0.75 : 0.55})`); g.addColorStop(1, `rgba(${INK},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 30 * puls, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ece6d8'; ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, Math.PI * 2); ctx.fill();

  // the bodies
  for (const b of bodies) {
    let [px, py] = toPx(b);
    if (b.hot && pointer.in && !b.drag) {
      // a body you are near leans toward you, the way anything grabbable should
      const [qx, qy] = toPx(pointer), dx = qx - px, dy = qy - py, d = Math.hypot(dx, dy) || 1;
      if (d < 80) { const m = Math.min(7, d * 0.14); px += (dx / d) * m; py += (dy / d) * m; }
    }
    const R = b.size * (b.hot || b.drag ? 1.35 : 1);
    ctx.fillStyle = bodyFill(b, px, py, t);
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${INK},0.55)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, R + 0.5, 0, Math.PI * 2); ctx.stroke();
    if (b.hot || b.drag) { ctx.strokeStyle = `rgba(${INK},0.35)`; ctx.beginPath(); ctx.arc(px, py, R + 7, 0, Math.PI * 2); ctx.stroke(); }
    if (harmony && b.ring) {
      // a periapsis pass leaves a ripple
      const age = (performance.now() - b.ring) / 700;
      if (age < 1) { ctx.strokeStyle = `rgba(${INK},${(1 - age) * 0.5})`; ctx.beginPath(); ctx.arc(px, py, R + 4 + age * 26, 0, Math.PI * 2); ctx.stroke(); }
    }
  }
}

// ------------------------------------------------------------ pointer

let hover = null, dragging = null, downAt = null, moved = 0, lastMove = null, scrubLast = null;

function hitBody(px, py) {
  let best = null, bd = 1e9;
  for (const b of bodies) {
    const [bx, by] = toPx(b); const d = Math.hypot(px - bx, py - by);
    if (d < 16 && d < bd) { bd = d; best = b; }
  }
  return best;
}
function hitSun(px, py) { const [sx, sy] = toPx(sun); return Math.hypot(px - sx, py - sy) < 18; }
function pos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

function setHot(b) {
  if (hover === b) return;
  if (hover) { hover.hot = false; hover.el.classList.remove('hot'); }
  hover = b;
  if (b) { b.hot = true; b.el.classList.add('hot'); }
  tip.hidden = !b;
}
function placeTip(b) {
  const [px, py] = toPx(b);
  const { a, T } = elements(b);
  tipName.textContent = b.name; tipLine.textContent = b.line;
  tipOrbit.textContent = isFinite(T) ? `a = ${a.toFixed(2)}  ·  T = ${T.toFixed(1)} s${harmony ? '  ·  ' + noteFor(T).toFixed(0) + ' Hz' : ''}` : 'unbound';
  const skyRect = canvas.parentElement.getBoundingClientRect();
  const flip = px + 300 > W;
  tip.style.left = `${px}px`;
  tip.style.top = `${py + (canvas.getBoundingClientRect().top - skyRect.top)}px`;
  tip.style.transform = flip ? 'translate(calc(-100% - 14px), -50%)' : 'translate(14px, -50%)';
}
function cursorFor(px, py) {
  if (dragging || sun.drag) return 'grabbing';
  if (scrubbing) return 'ew-resize';
  if (hitBody(px, py) || hitSun(px, py)) return 'grab';
  return 'crosshair';
}

canvas.addEventListener('pointerenter', () => { pointer.in = true; });
canvas.addEventListener('pointerleave', () => { pointer.in = false; pointer.trail.length = 0; if (!dragging) setHot(null); });

canvas.addEventListener('pointermove', e => {
  const [px, py] = pos(e);
  [pointer.x, pointer.y] = toSim(px, py);
  pointer.in = true;
  const now = performance.now();
  if (dragging || sun.drag) {
    const o = dragging || sun;
    if (lastMove) {
      const dt = Math.max((now - lastMove.t) / 1000, 1e-3);
      o.vx = ((px - lastMove.x) / S) / dt; o.vy = (-(py - lastMove.y) / S) / dt;
    }
    lastMove = { x: px, y: py, t: now };
    [o.x, o.y] = toSim(px, py);
    moved += Math.hypot(px - downAt[0], py - downAt[1]); downAt = [px, py];
    if (dragging) placeTip(dragging);
  } else if (scrubbing) {
    if (scrubLast) {
      const dt = Math.max((now - scrubLast.t) / 1000, 1e-3);
      rate = Math.max(-8, Math.min(8, ((px - scrubLast.x) / 140) / dt));
    }
    moved += Math.abs(px - scrubLast.x);
    scrubLast = { x: px, t: now };
  } else {
    setHot(hitBody(px, py));
    if (hover) placeTip(hover);
  }
  canvas.style.cursor = cursorFor(px, py);
});

let lastTouch = performance.now(), attractAt = 0, attractBody = null;
canvas.addEventListener('pointerdown', e => {
  lastTouch = performance.now();
  const [px, py] = pos(e);
  canvas.setPointerCapture(e.pointerId);
  downAt = [px, py]; moved = 0; lastMove = { x: px, y: py, t: performance.now() };
  const b = hitBody(px, py);
  if (b) { dragging = b; b.drag = true; b.tween = null; b.trail.length = 0; setHot(b); }
  else if (hitSun(px, py)) { sun.drag = true; }
  else { scrubbing = true; scrubLast = { x: px, t: performance.now() }; rateTarget = rate; }
  canvas.style.cursor = cursorFor(px, py);
});

canvas.addEventListener('pointerup', e => {
  const [px, py] = pos(e);
  if (dragging) {
    const b = dragging; b.drag = false; dragging = null;
    if (moved < 5) { launch(b); return; }
    if (performance.now() - lastMove.t > 120) { const { r } = elements(b); const dx = b.x - sun.x, dy = b.y - sun.y, v = Math.sqrt(GM / r); b.vx = sun.vx - dy / r * v; b.vy = sun.vy + dx / r * v; }
    leash(b);
  } else if (sun.drag) {
    sun.drag = false;
    if (performance.now() - lastMove.t > 120) { sun.vx = 0; sun.vy = 0; }
    const sv = Math.hypot(sun.vx, sun.vy); if (sv > 1.8) { sun.vx *= 1.8 / sv; sun.vy *= 1.8 / sv; }
    if (moved < 5) { harmony ? harmonyOff() : harmonyOn(); }
  } else if (scrubbing) {
    scrubbing = false; scrubLast = null;
    if (moved < 5) { const [x, y] = toSim(px, py); fireStar(x, y); rate = rateTarget = rateTarget === 0 ? 0 : 1; }
    else rateTarget = 1;
  }
  canvas.style.cursor = cursorFor(px, py);
});
canvas.addEventListener('pointercancel', () => {
  if (dragging) { dragging.drag = false; leash(dragging); dragging = null; }
  sun.drag = false; scrubbing = false; rateTarget = 1;
});
canvas.addEventListener('dblclick', e => { const [px, py] = pos(e); if (!hitBody(px, py) && !hitSun(px, py)) reset(); });

// the catalogue and the sky know about each other
rows.forEach((a, i) => {
  const b = bodies[i];
  a.addEventListener('mouseenter', () => { b.hot = true; b.liveRow = true; });
  a.addEventListener('mouseleave', () => { if (hover !== b) b.hot = false; b.liveRow = false; b.receipt.textContent = b.receiptText; });
  a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); launch(b); });
});

// ------------------------------------------------------------ falling in

let leaving = false;
function launch(b) {
  if (leaving) return;
  leaving = true;
  const [px, py] = toPx(b);
  const r = canvas.getBoundingClientRect();
  fly.style.left = `${r.left + px}px`; fly.style.top = `${r.top + py}px`;
  fly.style.background = b.color === 'spectrum' ? 'conic-gradient(#ff5a5a,#ffb000,#7fe06f,#4cc9f0,#8f77ef,#ff5a5a)' : b.color;
  const scale = (2 * Math.hypot(innerWidth, innerHeight)) / 12;
  requestAnimationFrame(() => {
    fly.classList.add('go');
    fly.style.transform = `translate(-50%, -50%) scale(${scale})`;
  });
  if (audio) audio.master.gain.setTargetAtTime(0, audio.currentTime, 0.15);
  setTimeout(() => { location.href = b.url; }, reduced ? 0 : 560);
}

// ------------------------------------------------------------ keyboard

let kb = -1;
addEventListener('keydown', e => {
  lastTouch = performance.now();
  if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'ArrowLeft') {
    e.preventDefault();
    kb = (kb + (k === 'ArrowRight' ? 1 : -1) + bodies.length) % bodies.length;
    setHot(bodies[kb]); placeTip(bodies[kb]);
    canvas.parentElement.scrollIntoView({ block: 'nearest' });
  } else if (k === 'Enter' && hover) { launch(hover); }
  else if (k === 'r' || k === 'R') { reset(); }
  else if (k === 'h' || k === 'H') { harmony ? harmonyOff() : harmonyOn(); }
  else if (k === ' ' && document.activeElement === document.body) { e.preventDefault(); rateTarget = rate === 0 ? 1 : 0; }
});

// ------------------------------------------------------------ receipt

function kepler() {
  let sum = 0, n = 0;
  for (const b of bodies) { const { a, T } = elements(b); if (isFinite(T)) { sum += (T * T) / (a * a * a); n++; } }
  const measured = n ? sum / n : NaN, predicted = (4 * Math.PI * Math.PI) / GM;
  keplerOut.textContent = `${measured.toFixed(1)}  (4π²/GM = ${predicted.toFixed(1)})`;
  for (const b of bodies) {
    if (b.liveRow) { const { a, T } = elements(b); b.receipt.textContent = isFinite(T) ? `live: a = ${a.toFixed(2)} · T = ${T.toFixed(1)} s` : 'live: unbound'; }
  }
}

// ------------------------------------------------------------ loop

let last = performance.now(), acc = 0, tick = 0, tuneAcc = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!scrubbing) rate += (rateTarget - rate) * Math.min(1, dt * 4);
  if (!reduced) {
    const h = (dt * rate) / 4;
    for (let k = 0; k < 4; k++) step(h);
    simT += dt * rate;
    stepStars(dt * rate);
    tweens(now);
    // left alone, the system shows off: one body gets a nudge and introduces itself
    if (!pointer.in && !dragging && !sun.drag && now - lastTouch > 6500 && now - attractAt > 6500 && now > 3000) {
      attractAt = now;
      const b = bodies[Math.floor(Math.random() * bodies.length)];
      const { r } = elements(b); const v = Math.sqrt(GM / r);
      b.vx += (b.vx - sun.vx) / (Math.hypot(b.vx - sun.vx, b.vy - sun.vy) || 1) * v * 0.22;
      b.vy += (b.vy - sun.vy) / (Math.hypot(b.vx - sun.vx, b.vy - sun.vy) || 1) * v * 0.22;
      b.ring = now; attractBody = b; setHot(b); placeTip(b);
      setTimeout(() => { if (hover === b && !pointer.in) setHot(null); }, 1800);
    }
    for (const b of bodies) {
      if (!isFinite(b.x + b.y + b.vx + b.vy)) homeBody(b);
      else if (!b.drag && !b.tween) leash(b);
    }
    if (!isFinite(sun.x + sun.y + sun.vx + sun.vy)) { sun.x = sun.y = sun.vx = sun.vy = 0; }
    for (const b of bodies) {
      // periapsis: radial velocity crosses from inward to outward
      const { dr } = elements(b);
      if (b.prevDr < 0 && dr >= 0 && !b.drag && !b.tween) { b.ring = now; pluck(b); }
      b.prevDr = dr;
    }
  }
  tick += dt;
  if (tick > 0.05) {
    tick = 0;
    for (const b of bodies) { b.trail.push(toPx(b)); const cap = 60 + Math.round(b.r0 * 22); if (b.trail.length > cap) b.trail.shift(); }
    if (pointer.in) { pointer.trail.push(toPx(pointer)); if (pointer.trail.length > 14) pointer.trail.shift(); }
    for (const st of stars) { st.trail.push(toPx(st)); if (st.trail.length > 26) st.trail.shift(); }
  }
  acc += dt; tuneAcc += dt;
  if (acc > 0.4) { acc = 0; kepler(); }
  if (tuneAcc > 0.1) { tuneAcc = 0; if (harmony) tune(); }
  tmOut.textContent = `t = ${simT.toFixed(1)} s`;
  rateOut.textContent = `×${rate.toFixed(1)}`;
  draw(now / 1000);
  requestAnimationFrame(frame);
}
// first light: everything arrives from beyond the chart and settles into orbit
if (!reduced) {
  const now = performance.now();
  bodies.forEach((b, i) => {
    const th = Math.atan2(b.y, b.x);
    const far = R_MAX * 1.9;
    b.tween = { fx: Math.cos(th + 0.9) * far, fy: Math.sin(th + 0.9) * far, tx: b.x, ty: b.y, th, t0: now + 120 + i * 90, dur: 1100 };
    b.x = b.tween.fx; b.y = b.tween.fy;
  });
}
kepler();
requestAnimationFrame(frame);

// the state, exposed so the page can be tested the way the projects are
window.__orrery = { bodies, sun, pointer, stars, elements, toPx, toSim, GM, reset, fireStar, get rate() { return rate; }, get rateTarget() { return rateTarget; }, get scrubbing() { return scrubbing; } };
